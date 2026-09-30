/**
 * Check-in submission: score on-device, commit to Dexie FIRST, then hand off
 * to sync. The UI treats the check-in as done the moment the Dexie write
 * resolves — it never waits on the network.
 */
import {
  composite,
  evaluateTrend,
  scoreCheckIn,
  type ScoredPoint,
  type VoiceFeatures,
} from '@vigil/scoring-engine';
import { tables, type StoredCheckIn } from '../../db';
import { encryptText } from '../../db/local-crypto';
import { useStore } from '../../store';
import { crisisFastPath, currentScoringConfig, syncQueue } from '../../sync/engine';

export interface CheckInDraft {
  selfReport: Record<string, number>;
  text?: string;
  voiceFeatures?: VoiceFeatures | null;
  /** When the person opened the check-in (engagement latency). */
  startedAt: number;
  channel?: 'app' | 'ivrs' | 'sms';
}

export interface SubmitResult {
  id: string;
  crisis: boolean;
  levelChanged: boolean;
}

export async function submitCheckIn(draft: CheckInDraft, victimId: string, now = Date.now()): Promise<SubmitResult> {
  const cfg = await currentScoringConfig();
  const history = await tables.checkIns.where('victimId').equals(victimId).sortBy('createdAt');
  const responseLatencyMs = Math.max(0, now - draft.startedAt);

  const score = scoreCheckIn(
    { createdAt: now, selfReport: draft.selfReport, text: draft.text, responseLatencyMs, voiceFeatures: draft.voiceFeatures ?? null },
    history.map((h) => ({ createdAt: h.createdAt, responseLatencyMs: h.responseLatencyMs ?? null })),
    cfg,
  );

  const record: StoredCheckIn = {
    id: crypto.randomUUID(),
    victimId,
    createdAt: now,
    selfReport: draft.selfReport,
    ...(draft.text?.trim() ? { freeText: await encryptText(draft.text.trim()) } : {}),
    ...(score.sentimentScore !== null ? { sentimentScore: score.sentimentScore } : {}),
    voiceFeatures: draft.voiceFeatures ?? null,
    crisisFlag: score.crisis.matched,
    compositeScore: score.compositeScore,
    syncState: 'pending',
    responseLatencyMs,
    signalTerms: score.terms,
    configVersion: score.configVersion,
    crisis: score.crisis.matched
      ? { listVersion: score.crisis.listVersion, matchedPhraseIds: score.crisis.matchedPhraseIds, categories: score.crisis.categories }
      : null,
    channel: draft.channel ?? 'app',
  };

  // 1. Durable on the device before anything else.
  await tables.checkIns.add(record);

  // 2. Hand off. Crisis check-ins take the fast path ONLY (with their text);
  //    everything else waits its turn in the ordinary queue.
  if (record.crisisFlag) void crisisFastPath.flag(record.id);
  else void syncQueue.enqueue('checkin', record.id);

  // 3. Adaptive cadence (local only, never shown as a score).
  const levelChanged = await adaptCheckInLevel(victimId, [...history, record], cfg, now);
  return { id: record.id, crisis: record.crisisFlag, levelChanged };
}

/**
 * Adaptive engine: while check-ins are getting harder, gently suggest daily
 * check-ins; return to the lighter cadence once things settle. The person's
 * burden only increases when there is a reason, and every change is recorded
 * with a plain reason in `levelChanges`.
 */
async function adaptCheckInLevel(
  victimId: string,
  all: StoredCheckIn[],
  cfg: Awaited<ReturnType<typeof currentScoringConfig>>,
  now: number,
): Promise<boolean> {
  const series: ScoredPoint[] = all.map((c) => ({ at: c.createdAt, composite: composite(c.signalTerms, cfg), terms: c.signalTerms }));
  const ev = evaluateTrend(series, cfg);
  const { ui, setUi } = useStore.getState();
  const next = ev.fired ? 'daily' : ev.z !== null && ev.z > 0 ? 'gentle' : ui.checkInLevel;
  if (next === ui.checkInLevel) return false;

  setUi({ checkInLevel: next });
  await tables.levelChanges.add({
    id: crypto.randomUUID(),
    victimId,
    at: now,
    reason: next === 'daily' ? 'Recent check-ins have been harder; suggesting a short daily check-in for a while.' : 'Things look steadier; back to checking in every few days.',
  });
  const DAY = 86_400_000;
  await tables.reminders.put({
    id: `checkin-${victimId}`,
    victimId,
    dueAt: now + (next === 'daily' ? DAY : 3 * DAY),
    type: 'checkin',
    note: next === 'daily' ? 'checkin.reminder.daily' : 'checkin.reminder.gentle',
  });
  return true;
}
