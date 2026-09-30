import {
  assertOwnership,
  buildServer,
  parse,
  requireIdentity,
  type FastifyInstance,
  type FieldCrypto,
  type Pool,
} from '@vigil/service-kit';
import { ReminderInput, VictimId, type Reminder } from '@vigil/shared-types';
import { z } from 'zod';

/**
 * Reminders use server-authoritative `updatedAt` with last-write-wins: the
 * server stamps every write, so clients never have to trust each other's
 * clocks. Notes are encrypted at rest (they can name courts, dates, places).
 */
export interface ReminderRepo {
  upsert(r: Reminder): Promise<Reminder>;
  list(victimId: string): Promise<Reminder[]>;
  ping(): Promise<void>;
}

export const MIGRATIONS = [
  {
    id: '001_reminders',
    sql: `
      CREATE TABLE reminders (
        id UUID PRIMARY KEY,
        victim_id TEXT NOT NULL,
        due_at BIGINT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('hearing', 'compensation', 'checkin')),
        note_enc TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE INDEX reminders_victim_due ON reminders (victim_id, due_at);
    `,
  },
];

export function pgRepo(pool: Pool, crypto: FieldCrypto): ReminderRepo {
  const aad = (id: string) => `reminder:${id}`;
  return {
    async upsert(r) {
      await pool.query(
        `INSERT INTO reminders (id, victim_id, due_at, type, note_enc, updated_at) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET due_at=$3, type=$4, note_enc=$5, updated_at=$6
         WHERE reminders.victim_id = EXCLUDED.victim_id AND reminders.updated_at <= EXCLUDED.updated_at`,
        [r.id, r.victimId, r.dueAt, r.type, crypto.encrypt(r.note, aad(r.id)), r.updatedAt],
      );
      return r;
    },
    async list(victimId) {
      const res = await pool.query<{ id: string; victim_id: string; due_at: number; type: Reminder['type']; note_enc: string; updated_at: number }>(
        'SELECT * FROM reminders WHERE victim_id = $1 ORDER BY due_at ASC',
        [victimId],
      );
      return res.rows.map((x) => ({
        id: x.id, victimId: x.victim_id, dueAt: x.due_at, type: x.type, note: crypto.decrypt(x.note_enc, aad(x.id)), updatedAt: x.updated_at,
      }));
    },
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

export function memoryRepo(): ReminderRepo {
  const rows = new Map<string, Reminder>();
  return {
    async upsert(r) {
      const prev = rows.get(r.id);
      if (!prev || (prev.victimId === r.victimId && prev.updatedAt <= r.updatedAt)) rows.set(r.id, r);
      return rows.get(r.id) as Reminder;
    },
    async list(victimId) {
      return [...rows.values()].filter((r) => r.victimId === victimId).sort((a, b) => a.dueAt - b.dueAt);
    },
    async ping() {},
  };
}

export interface AppDeps {
  repo: ReminderRepo;
  internalToken?: string;
  now?: () => number;
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const now = deps.now ?? Date.now;
  const app = buildServer({
    name: 'reminder-service', internalToken: deps.internalToken, logLevel: deps.logLevel,
    ready: () => deps.repo.ping(), onUnhandledError: deps.onUnhandledError,
  });

  app.get('/v1/reminders', async (req) => {
    const id = requireIdentity(req, 'victim', 'counselor');
    const { victimId } = parse(z.object({ victimId: VictimId }), req.query);
    assertOwnership(id, victimId);
    return { reminders: await deps.repo.list(victimId) };
  });

  const upsert = async (input: ReminderInput) => deps.repo.upsert({ ...input, updatedAt: now() });

  app.post('/v1/reminders', async (req, reply) => {
    requireIdentity(req, 'counselor');
    const reminder = await upsert(parse(ReminderInput, req.body));
    req.log.info({ reminderId: reminder.id, type: reminder.type }, 'reminder upserted');
    return reply.code(201).send({ reminder });
  });

  // Internal: case-integration pushes hearing / compensation dates here.
  app.post('/internal/reminders', async (req, reply) => {
    const reminder = await upsert(parse(ReminderInput, req.body));
    return reply.code(201).send({ reminder });
  });

  return app;
}
