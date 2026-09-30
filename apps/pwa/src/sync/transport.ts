/**
 * Builds contract-typed payloads from local records and sends them.
 * Consent is evaluated at SEND time, not at save time: if someone withdraws
 * "share what I write" before a queued check-in syncs, the text stays home.
 */
import type { CheckInSubmission } from '@vigil/shared-types';
import { api, ensureOk, HttpStatusError } from '../api/client';
import { decryptText } from '../db/local-crypto';
import { tables, type StoredCheckIn, type SyncQueueItem } from '../db';
import { hasConsent, useStore } from '../store';
import type { Transport } from './sync-queue';

export async function buildSubmission(c: StoredCheckIn, opts: { fastPath: boolean }): Promise<CheckInSubmission> {
  const includeText = opts.fastPath || hasConsent('share-free-text');
  const freeText = includeText ? await decryptText(c.freeText) : undefined;
  const region = useStore.getState().ui.region;
  return {
    id: c.id,
    victimId: c.victimId,
    createdAt: c.createdAt,
    selfReport: c.selfReport,
    ...(freeText ? { freeText } : {}),
    sentimentScore: c.sentimentScore ?? null,
    voiceFeatures: hasConsent('share-voice-features') ? (c.voiceFeatures ?? null) : null,
    crisisFlag: c.crisisFlag,
    crisis: c.crisis ?? null,
    compositeScore: c.compositeScore,
    signalTerms: c.signalTerms,
    responseLatencyMs: c.responseLatencyMs ?? null,
    configVersion: c.configVersion,
    channel: c.channel,
    fastPath: opts.fastPath,
    ...(region ? { region } : {}),
  };
}

async function sendCheckIn(id: string, fastPath: boolean, signal?: AbortSignal): Promise<void> {
  const c = await tables.checkIns.get(id);
  if (!c) return; // erased locally before it synced: nothing to send
  const body = await buildSubmission(c, { fastPath });
  const data = ensureOk(await api.POST('/v1/checkins', { body, signal }));
  await tables.checkIns.update(id, { syncState: data.syncState, syncedAt: Date.now() });
}

export const sendCrisisCheckIn = (id: string, signal: AbortSignal) => sendCheckIn(id, true, signal);

export function createTransport(): Transport {
  return {
    async send(item: SyncQueueItem) {
      switch (item.kind) {
        case 'checkin':
          return sendCheckIn(item.refId, false);
        case 'consent': {
          const rec = await tables.consent.get(item.refId);
          if (!rec) return;
          ensureOk(
            await api.POST('/v1/consent', {
              body: { id: rec.id, victimId: rec.victimId, scope: rec.scope as never, granted: rec.granted, at: rec.at },
            }),
          );
          return;
        }
        case 'erase-text': {
          const r = await api.DELETE('/v1/checkins/{id}/free-text', { params: { path: { id: item.refId } } });
          // 404: the server never had it (never synced) — erasure is already true.
          if (!r.response.ok && r.response.status !== 404) throw new HttpStatusError(r.response.status, 'erase failed');
          return;
        }
      }
    },
  };
}
