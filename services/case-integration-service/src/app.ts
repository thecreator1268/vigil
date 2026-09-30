import {
  buildServer,
  parse,
  requireIdentity,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FieldCrypto,
  type InternalClient,
  type Pool,
} from '@vigil/service-kit';
import { VictimId, type CaseLink } from '@vigil/shared-types';
import { z } from 'zod';
import { uuidFrom, type ExternalCaseSystem } from './external.js';

export interface CaseRepo {
  upsert(link: CaseLink): Promise<void>;
  byVictim(victimId: string): Promise<CaseLink[]>;
  ping(): Promise<void>;
}

// case_links is the ONLY table in VIGIL holding a foreign key into an external
// system. The external case reference is encrypted at rest.
export const MIGRATIONS = [
  {
    id: '001_case_links',
    sql: `
      CREATE TABLE case_links (
        id UUID PRIMARY KEY,
        victim_id TEXT NOT NULL,
        external_system TEXT NOT NULL,
        external_case_ref_enc TEXT NOT NULL,
        stage TEXT NOT NULL,
        next_hearing_at BIGINT,
        compensation_status TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX case_links_victim ON case_links (victim_id);
    `,
  },
];

export function pgRepo(pool: Pool, crypto: FieldCrypto): CaseRepo {
  const aad = (id: string) => `case:${id}`;
  return {
    async upsert(l) {
      await pool.query(
        `INSERT INTO case_links (id, victim_id, external_system, external_case_ref_enc, stage, next_hearing_at, compensation_status, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET stage=$5, next_hearing_at=$6, compensation_status=$7, updated_at=$8`,
        [l.id, l.victimId, l.externalSystem, crypto.encrypt(l.externalCaseRef, aad(l.id)), l.stage, l.nextHearingAt, l.compensationStatus, l.updatedAt],
      );
    },
    async byVictim(victimId) {
      const r = await pool.query<{
        id: string; victim_id: string; external_system: string; external_case_ref_enc: string; stage: CaseLink['stage'];
        next_hearing_at: number | null; compensation_status: CaseLink['compensationStatus']; updated_at: number;
      }>('SELECT * FROM case_links WHERE victim_id = $1 ORDER BY updated_at DESC', [victimId]);
      return r.rows.map((x) => ({
        id: x.id, victimId: x.victim_id, externalSystem: x.external_system,
        externalCaseRef: crypto.decrypt(x.external_case_ref_enc, aad(x.id)), stage: x.stage,
        nextHearingAt: x.next_hearing_at, compensationStatus: x.compensation_status, updatedAt: x.updated_at,
      }));
    },
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

export function memoryRepo(): CaseRepo {
  const rows = new Map<string, CaseLink>();
  return {
    async upsert(l) {
      rows.set(l.id, l);
    },
    async byVictim(victimId) {
      return [...rows.values()].filter((l) => l.victimId === victimId);
    },
    async ping() {},
  };
}

export interface SyncDeps {
  repo: CaseRepo;
  external: ExternalCaseSystem;
  call: InternalClient;
  reminderServiceUrl: string;
  victimIds: () => readonly string[];
  log: FastifyBaseLogger;
  now?: () => number;
}

/** Pull updates from the external system, upsert links, push hearing reminders. */
export async function syncCases(d: SyncDeps): Promise<number> {
  const now = (d.now ?? Date.now)();
  const records = await d.external.fetchCases(d.victimIds(), now);
  for (const rec of records) {
    const id = uuidFrom(`${d.external.name}:${rec.externalCaseRef}`);
    await d.repo.upsert({ ...rec, id, externalSystem: d.external.name, updatedAt: now });
    if (rec.nextHearingAt && rec.nextHearingAt > now) {
      await d.call(`${d.reminderServiceUrl}/internal/reminders`, {
        method: 'POST',
        body: {
          id: uuidFrom(`hearing:${id}:${rec.nextHearingAt}`),
          victimId: rec.victimId,
          dueAt: rec.nextHearingAt,
          type: 'hearing',
          note: 'Court hearing date from your case record',
        },
      });
    }
  }
  d.log.info({ system: d.external.name, records: records.length }, 'case sync complete');
  return records.length;
}

export interface AppDeps {
  repo: CaseRepo;
  internalToken?: string;
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = buildServer({
    name: 'case-integration-service', internalToken: deps.internalToken, logLevel: deps.logLevel,
    ready: () => deps.repo.ping(), onUnhandledError: deps.onUnhandledError,
  });

  app.get('/v1/victims/:id/case-links', async (req) => {
    requireIdentity(req, 'counselor');
    const { id } = parse(z.object({ id: VictimId }), req.params);
    return { caseLinks: await deps.repo.byVictim(id) };
  });

  return app;
}
