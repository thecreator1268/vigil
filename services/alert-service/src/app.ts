import { randomUUID } from 'node:crypto';
import { buildServer, notFound, parse, requireIdentity, type FastifyInstance } from '@vigil/service-kit';
import { AlertStatus, Severity, SignalName, VictimId } from '@vigil/shared-types';
import { z } from 'zod';
import { toApi, type AlertRepo } from './repo.js';

export interface AppDeps {
  repo: AlertRepo;
  internalToken?: string;
  now?: () => number;
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
}

/** Shape produced by @vigil/scoring-engine's buildTrendAlert / buildCrisisAlert. */
const AlertDraft = z.strictObject({
  severity: Severity,
  signals_involved: z.array(SignalName).min(1),
  reason_text: z.string().min(1).max(2000),
  raw_score: z.null(),
  source: z.enum(['trend', 'crisis']),
  configVersion: z.number().int().min(1),
});

const AlertIntake = z.strictObject({
  checkInId: z.uuid(),
  victimId: VictimId,
  at: z.number().int().min(0),
  region: z.string().max(64).nullable().optional(),
  draft: AlertDraft,
});

export function buildApp(deps: AppDeps): FastifyInstance {
  const now = deps.now ?? Date.now;
  const app = buildServer({ name: 'alert-service', internalToken: deps.internalToken, logLevel: deps.logLevel,
    onUnhandledError: deps.onUnhandledError, ready: () => deps.repo.ping() });

  // Internal intake from the crisis fast-path (checkin outbox) and the trend service.
  app.post('/internal/alerts', async (req, reply) => {
    const { checkInId, victimId, region, draft } = parse(AlertIntake, req.body);

    const existing = await deps.repo.bySourceCheckIn(checkInId);
    if (existing) return { alert: toApi(existing) }; // idempotent retry

    if (draft.source === 'trend') {
      // One open trend alert per person: repeated declines refine it rather than
      // flooding the queue. An urgent reading escalates an elevated one.
      const open = await deps.repo.openTrendAlert(victimId);
      if (open) {
        if (open.severity === 'elevated' && draft.severity === 'urgent') {
          const escalated = await deps.repo.escalate(open.id, {
            severity: 'urgent', signals: draft.signals_involved, reasonText: draft.reason_text, configVersion: draft.configVersion,
          });
          req.log.info({ alertId: open.id, victimId }, 'trend alert escalated to urgent');
          return { alert: toApi(escalated) };
        }
        return { alert: toApi(open) };
      }
    }

    const alert = await deps.repo.insert({
      id: randomUUID(),
      victimId,
      severity: draft.severity,
      signals: draft.signals_involved,
      reasonText: draft.reason_text,
      status: 'open',
      source: draft.source,
      configVersion: draft.configVersion,
      createdAt: now(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      sourceCheckInId: checkInId,
      region: region ?? null,
    });
    req.log.info({ alertId: alert.id, victimId, severity: alert.severity, source: alert.source, signals: alert.signals }, 'alert raised');
    return reply.code(201).send({ alert: toApi(alert) });
  });

  // GET /v1/alerts?status=
  app.get('/v1/alerts', async (req) => {
    requireIdentity(req, 'counselor');
    const { status } = parse(z.object({ status: AlertStatus.optional() }), req.query);
    return { alerts: (await deps.repo.list(status)).map(toApi) };
  });

  // POST /v1/alerts/:id/acknowledge — idempotent; first acknowledger is kept.
  app.post('/v1/alerts/:id/acknowledge', async (req) => {
    const who = requireIdentity(req, 'counselor');
    const { id } = parse(z.object({ id: z.uuid() }), req.params);
    const alert = await deps.repo.acknowledge(id, who.subject, now());
    if (!alert) throw notFound('Alert');
    req.log.info({ alertId: id, by: who.subject }, 'alert acknowledged');
    return { alert: toApi(alert) };
  });

  // Internal: anonymized counts for admin rollups (no ids leave this endpoint).
  app.get('/internal/stats', async (req) => {
    const { region, since } = parse(z.object({ region: z.string().min(1).max(64), since: z.coerce.number().int().min(0) }), req.query);
    return deps.repo.stats(region, since);
  });

  return app;
}
