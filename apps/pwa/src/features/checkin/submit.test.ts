import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, tables } from '../../db';
import { useStore } from '../../store';
import { buildSubmission } from '../../sync/transport';
import { crisisFastPath, syncQueue } from '../../sync/engine';
import { submitCheckIn } from './submit';

const VICTIM = 'v_test_000001';

beforeEach(async () => {
  // clear rather than delete: background sync attempts may still hold the connection
  await Promise.all(db.tables.map((t) => t.clear()));
  useStore.setState({ consent: {} });
  // The network is unreachable for every test here: local-first must not care.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
});
afterEach(() => vi.restoreAllMocks());

describe('submitCheckIn — write local first', () => {
  it('is durable in Dexie and queued for sync even with no network', async () => {
    const enqueue = vi.spyOn(syncQueue, 'enqueue');
    const r = await submitCheckIn({ selfReport: { safe: 1, heavy: 3 }, text: 'a hard week', startedAt: Date.now() - 30_000 }, VICTIM);
    const stored = await tables.checkIns.get(r.id);
    expect(stored).toMatchObject({ victimId: VICTIM, syncState: 'pending', crisisFlag: false, configVersion: 1 });
    expect(stored?.freeText).toMatch(/^enc1:/); // encrypted at rest
    expect(stored?.freeText).not.toContain('hard week');
    expect(stored?.responseLatencyMs).toBeGreaterThanOrEqual(30_000);
    expect(enqueue).toHaveBeenCalledWith('checkin', r.id);
  });

  it('routes crisis check-ins ONLY through the fast path', async () => {
    const flag = vi.spyOn(crisisFastPath, 'flag').mockResolvedValue(false);
    const enqueue = vi.spyOn(syncQueue, 'enqueue');
    const r = await submitCheckIn({ selfReport: {}, text: 'I want to die', startedAt: Date.now() }, VICTIM);
    expect(r.crisis).toBe(true);
    expect(flag).toHaveBeenCalledWith(r.id);
    expect(enqueue).not.toHaveBeenCalled();
    expect((await tables.checkIns.get(r.id))?.crisis?.categories).toEqual(['self_harm']);
  });

  it('a skip-everything check-in is valid and neutral', async () => {
    const r = await submitCheckIn({ selfReport: {}, startedAt: Date.now() }, VICTIM);
    const stored = await tables.checkIns.get(r.id);
    expect(stored?.compositeScore).toBe(0);
    expect(stored?.signalTerms.selfReport).toBeNull();
  });
});

describe('buildSubmission — consent evaluated at send time', () => {
  async function saved() {
    const r = await submitCheckIn({ selfReport: { safe: 2 }, text: 'my words', startedAt: Date.now(), voiceFeatures: { pitchVar: 0.1, rms: 0.05 } }, VICTIM);
    return (await tables.checkIns.get(r.id))!;
  }

  it('keeps words and voice features at home without consent', async () => {
    const body = await buildSubmission(await saved(), { fastPath: false });
    expect(body.freeText).toBeUndefined();
    expect(body.voiceFeatures).toBeNull();
    expect(body.fastPath).toBe(false);
  });

  it('includes words once the person has agreed to share them', async () => {
    const c = await saved();
    useStore.getState().setConsent('share-free-text', true, Date.now());
    expect((await buildSubmission(c, { fastPath: false })).freeText).toBe('my words');
  });

  it('the crisis fast-path always carries the words', async () => {
    expect((await buildSubmission(await saved(), { fastPath: true })).freeText).toBe('my words');
  });
});
