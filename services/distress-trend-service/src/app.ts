import {
  buildTrendAlert,
  composite,
  computeBaseline,
  evaluateTrend,
  type ScoredPoint,
} from '@vigil/scoring-engine';
import { buildServer, HttpError, parse, requireIdentity, type FastifyInstance, type InternalClient } from '@vigil/service-kit';
import { SignalTerms, VictimId, type AnonymizedAggregate, type TrendResponse } from '@vigil/shared-types';
import { z } from 'zod';
import type { TrendRepo } from './repo.js';

export interface AppDeps {
  repo: TrendRepo;
  call: InternalClient;
  alertServiceUrl: string;
  internalToken?: string;
  now?: () => number;
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
  /** k-anonymity threshold for admin rollups. */
  kAnonymity?: number;
}

const InternalPoint = z.strictObject({
  checkInId: z.uuid(),
  victimId: VictimId,
  at: z.number().int().min(0),
  signalTerms: SignalTerms,
  configVersion: z.number().int().min(1),
  region: z.string().max(64).nullable().optional(),
});

const PERIOD_DAYS = 28;
const DAY = 86_400_000;

export function buildApp(deps: AppDeps): FastifyInstance {
  const now = deps.now ?? Date.now;
  const k = deps.kAnonymity ?? 5;
  const app = buildServer({ name: 'distress-trend-service', internalToken: deps.internalToken, logLevel: deps.logLevel,
    onUnhandledError: deps.onUnhandledError, ready: () => deps.repo.ping() });

  // Internal: a new check-in's signal terms, from the check-in outbox.
  app.post('/internal/points', async (req) => {
    const p = parse(InternalPoint, req.body);
    await deps.repo.insertPoint({ checkInId: p.checkInId, victimId: p.victimId, at: p.at, terms: p.signalTerms, region: p.region ?? null });

    const cfg = await deps.repo.activeConfig();
    const rows = await deps.repo.series(p.victimId, p.at, cfg.baselineWindow + 2);
    // Recompute every composite from stored terms with the ACTIVE config so a
    // person's history is always scored consistently and auditable by version.
    const series: ScoredPoint[] = rows.map((r) => ({ at: r.at, composite: composite(r.terms, cfg), terms: r.terms }));
    const ev = evaluateTrend(series, cfg);
    const current = series[series.length - 1] as ScoredPoint;

    await deps.repo.recordEvaluation(p.checkInId, {
      composite: current.composite, z: ev.z, zPrev: ev.zPrev, slope: ev.slope, fired: ev.fired, configVersion: cfg.version,
    });
    await deps.repo.upsertBaseline(p.victimId, { ...ev.baseline, configVersion: cfg.version }, now());

    const draft = buildTrendAlert(ev, cfg.version);
    req.log.info({ checkInId: p.checkInId, fired: ev.fired, zRule: ev.zRule, slopeRule: ev.slopeRule, configVersion: cfg.version }, 'trend evaluated');
    if (draft) {
      // A failure here surfaces as a 5xx so the check-in outbox retries; the
      // evaluation above is deterministic and the alert call is idempotent.
      await deps.call(`${deps.alertServiceUrl}/internal/alerts`, {
        method: 'POST',
        body: { checkInId: p.checkInId, victimId: p.victimId, at: p.at, region: p.region ?? null, draft },
        requestId: req.id,
      });
    }
    return { fired: ev.fired };
  });

  // GET /v1/victims/:id/trend
  app.get('/v1/victims/:id/trend', async (req): Promise<TrendResponse> => {
    requireIdentity(req, 'counselor');
    const { id } = parse(z.object({ id: VictimId }), req.params);
    const cfg = await deps.repo.activeConfig();
    const rows = await deps.repo.series(id, Number.MAX_SAFE_INTEGER, 30);
    const series: ScoredPoint[] = rows.map((r) => ({ at: r.at, composite: composite(r.terms, cfg), terms: r.terms }));
    return {
      points: series.map((s) => ({ at: s.at, compositeScore: s.composite })),
      baseline: series.length ? computeBaseline(series.slice(0, -1), cfg) : null,
    };
  });

  // GET /v1/scoring-config
  app.get('/v1/scoring-config', async (req) => {
    requireIdentity(req, 'victim', 'counselor', 'admin');
    return deps.repo.activeConfig();
  });

  // GET /v1/admin/rollups?region= — anonymized aggregate, k-anonymity suppressed.
  app.get('/v1/admin/rollups', async (req): Promise<{ anonymizedAggregate: AnonymizedAggregate }> => {
    requireIdentity(req, 'admin');
    const { region } = parse(z.object({ region: z.string().min(1).max(64) }), req.query);
    const since = now() - PERIOD_DAYS * DAY;
    const stats = await deps.repo.regionStats(region, since);
    if (stats.cohortSize < k) {
      return {
        anonymizedAggregate: { region, periodDays: PERIOD_DAYS, suppressed: true, cohortSize: null, checkInCount: null, alerts: null, weeklyCheckIns: [] },
      };
    }
    let alerts: AnonymizedAggregate['alerts'];
    try {
      alerts = await deps.call(`${deps.alertServiceUrl}/internal/stats?region=${encodeURIComponent(region)}&since=${since}`, { requestId: req.id });
    } catch {
      throw new HttpError(503, 'unavailable', 'Alert statistics are temporarily unavailable');
    }
    return {
      anonymizedAggregate: {
        region, periodDays: PERIOD_DAYS, suppressed: false,
        cohortSize: stats.cohortSize, checkInCount: stats.checkInCount, alerts, weeklyCheckIns: stats.byWeek,
      },
    };
  });

  return app;
}
