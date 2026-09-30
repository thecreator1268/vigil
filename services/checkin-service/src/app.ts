import { buildCrisisAlert, scanForCrisis, type CrisisResult } from '@vigil/scoring-engine';
import {
  assertOwnership,
  buildServer,
  notFound,
  parse,
  requireIdentity,
  type FastifyInstance,
  type FieldCrypto,
} from '@vigil/service-kit';
import { CheckInSubmission, ConsentInput, VictimId, type CheckInSummary } from '@vigil/shared-types';
import { z } from 'zod';
import { consentGranted, type CheckinRepo, type OutboxTopic, type StoredCheckIn } from './repo.js';

export interface AppDeps {
  repo: CheckinRepo;
  crypto: FieldCrypto;
  internalToken?: string;
  now?: () => number;
  /** Called after a commit so the outbox is drained immediately, not on the next tick. */
  onCommitted?: () => void;
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
}

const aad = (id: string) => `checkin:${id}`;

/** Merge the device's crisis verdict with a server-side re-scan of any text we hold. */
function crisisVerdict(sub: CheckInSubmission): CrisisResult | null {
  const server = sub.freeText ? scanForCrisis(sub.freeText) : null;
  const client = sub.crisis ?? null;
  if (!sub.crisisFlag && !server?.matched) return null;
  return {
    matched: true,
    listVersion: server?.matched ? server.listVersion : (client?.listVersion ?? 'unknown'),
    matchedPhraseIds: [...new Set([...(client?.matchedPhraseIds ?? []), ...(server?.matchedPhraseIds ?? [])])],
    categories: [...new Set([...(client?.categories ?? []), ...(server?.categories ?? [])])].sort(),
  };
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const now = deps.now ?? Date.now;
  const app = buildServer({
    name: 'checkin-service',
    internalToken: deps.internalToken,
    logLevel: deps.logLevel,
    onUnhandledError: deps.onUnhandledError,
    ready: () => deps.repo.ping(),
  });

  // POST /v1/checkins — sync a check-in already durable on the device.
  app.post('/v1/checkins', async (req, reply) => {
    const id = requireIdentity(req, 'victim', 'counselor');
    const sub = parse(CheckInSubmission, req.body);
    assertOwnership(id, sub.victimId);

    const crisis = crisisVerdict(sub);
    const consent = await deps.repo.effectiveConsent(sub.victimId);
    // Free text stays on the device unless the person consented to share it,
    // or it is the crisis fast-path. The server enforces this independently.
    const mayStoreText = !!sub.freeText && (consentGranted(consent, 'share-free-text') || (sub.fastPath && !!crisis));
    if (sub.freeText && !mayStoreText) req.log.warn({ checkInId: sub.id }, 'free text received without consent; discarded');

    const row: StoredCheckIn = {
      id: sub.id,
      victimId: sub.victimId,
      createdAt: sub.createdAt,
      receivedAt: now(),
      selfReport: sub.selfReport,
      freeTextEnc: mayStoreText ? deps.crypto.encrypt(sub.freeText as string, aad(sub.id)) : null,
      sentimentScore: sub.sentimentScore ?? null,
      voiceFeatures: consentGranted(consent, 'share-voice-features') ? (sub.voiceFeatures ?? null) : null,
      crisisFlag: !!crisis,
      crisis,
      compositeScore: sub.compositeScore,
      signalTerms: sub.signalTerms,
      responseLatencyMs: sub.responseLatencyMs ?? null,
      configVersion: sub.configVersion,
      channel: sub.channel,
      fastPath: sub.fastPath,
      region: sub.region ?? null,
      syncState: crisis ? 'crisis-synced' : 'synced',
    };

    const events: { topic: OutboxTopic; payload: unknown }[] = [];
    if (crisis) {
      // Crisis fast-path: bypasses the composite/trend pipeline entirely.
      events.push({
        topic: 'alert.crisis',
        payload: { checkInId: sub.id, victimId: sub.victimId, at: sub.createdAt, region: row.region, draft: buildCrisisAlert(crisis, sub.configVersion) },
      });
    }
    events.push({
      topic: 'trend.point',
      payload: { checkInId: sub.id, victimId: sub.victimId, at: sub.createdAt, signalTerms: sub.signalTerms, configVersion: sub.configVersion, region: row.region },
    });

    const result = await deps.repo.insertCheckIn(row, events);
    req.log.info({ checkInId: sub.id, inserted: result.inserted, crisis: !!crisis, channel: sub.channel }, 'check-in synced');
    if (result.inserted) deps.onCommitted?.();
    return reply.code(202).send({ id: sub.id, syncState: result.syncState });
  });

  // DELETE /v1/checkins/:id/free-text — the person erases what they wrote.
  app.delete('/v1/checkins/:id/free-text', async (req, reply) => {
    const id = requireIdentity(req, 'victim');
    const { id: checkInId } = parse(z.object({ id: z.uuid() }), req.params);
    const c = await deps.repo.getCheckIn(checkInId);
    if (!c) throw notFound('Check-in');
    assertOwnership(id, c.victimId);
    await deps.repo.eraseFreeText(checkInId);
    req.log.info({ checkInId }, 'free text erased by owner');
    return reply.code(204).send();
  });

  // GET /v1/victims/:id/checkins — "what they told us" (counselor).
  app.get('/v1/victims/:id/checkins', async (req) => {
    requireIdentity(req, 'counselor');
    const { id: victimId } = parse(z.object({ id: VictimId }), req.params);
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
    const [rows, consent] = await Promise.all([deps.repo.listCheckIns(victimId, limit), deps.repo.effectiveConsent(victimId)]);
    const sharesText = consentGranted(consent, 'share-free-text');
    const checkIns: CheckInSummary[] = rows.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      selfReport: c.selfReport,
      // Consent is living: if it is withdrawn later, previously shared text is hidden again.
      sharedText: c.freeTextEnc && (sharesText || (c.fastPath && c.crisisFlag)) ? deps.crypto.decrypt(c.freeTextEnc, aad(c.id)) : null,
      crisisFlag: c.crisisFlag,
      channel: c.channel,
    }));
    return { checkIns };
  });

  // POST /v1/consent — append to the versioned consent ledger.
  app.post('/v1/consent', async (req, reply) => {
    const id = requireIdentity(req, 'victim');
    const input = parse(ConsentInput, req.body);
    assertOwnership(id, input.victimId);
    const record = await deps.repo.appendConsent(input, now());
    req.log.info({ victimId: input.victimId, scope: input.scope, granted: input.granted, ledgerVersion: record.ledgerVersion }, 'consent recorded');
    return reply.code(201).send({ record });
  });

  // GET /v1/consent?victimId= — current effective consent per scope.
  app.get('/v1/consent', async (req) => {
    const id = requireIdentity(req, 'victim', 'counselor');
    const { victimId } = parse(z.object({ victimId: VictimId }), req.query);
    assertOwnership(id, victimId);
    return { records: await deps.repo.effectiveConsent(victimId) };
  });

  return app;
}
