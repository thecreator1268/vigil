import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, tables, type SyncQueueItem } from '../db';
import { HttpStatusError } from '../api/client';
import { CRISIS_RETRY_MS, CRISIS_TIMEOUT_MS, CrisisFastPath } from './crisis-fast-path';
import { effectiveConsent, mergeConsentLedger, resolveReminders } from './resolvers';
import { BASE_DELAY_MS, MAX_DELAY_MS, SyncQueue, backoffMs } from './sync-queue';

let clock = 1_000_000;
const now = () => clock;

beforeEach(async () => {
  // clear rather than delete: background sync attempts may still hold the connection
  await Promise.all(db.tables.map((t) => t.clear()));
  clock = 1_000_000;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => vi.restoreAllMocks());

describe('Sync Queue', () => {
  it('backs off exponentially from 5s, capped at 5min', () => {
    expect(BASE_DELAY_MS).toBe(5_000);
    expect(MAX_DELAY_MS).toBe(300_000);
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
  });

  it('is persisted in Dexie, so a "restarted" queue still delivers', async () => {
    const offline = new SyncQueue({ send: vi.fn() }, {}, now);
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await offline.enqueue('checkin', 'a');
    expect(await tables.syncQueue.count()).toBe(1);

    // new instance = app restart
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    const sent: string[] = [];
    const restarted = new SyncQueue({ send: async (i) => void sent.push(i.refId) }, {}, now);
    expect(await restarted.runOnce()).toBe(1);
    expect(sent).toEqual(['a']);
    expect(await tables.syncQueue.count()).toBe(0);
  });

  it('tracks retry count and last error per item, and waits out the backoff', async () => {
    const send = vi.fn(async () => {
      throw new HttpStatusError(503, 'gateway unavailable');
    });
    const q = new SyncQueue({ send }, {}, now);
    await q.enqueue('checkin', 'a');
    await q.runOnce();
    let item = (await tables.syncQueue.toArray())[0] as SyncQueueItem;
    expect(item).toMatchObject({ attempts: 1, lastError: 'gateway unavailable', nextAttemptAt: clock + 5_000 });

    await q.runOnce(); // not due yet
    expect(send).toHaveBeenCalledTimes(1);
    clock += 5_000;
    await q.runOnce();
    item = (await tables.syncQueue.toArray())[0] as SyncQueueItem;
    expect(item).toMatchObject({ attempts: 2, nextAttemptAt: clock + 10_000 });
  });

  it('parks permanently rejected items instead of retrying forever', async () => {
    const q = new SyncQueue({ send: async () => { throw new HttpStatusError(400, 'invalid'); } }, {}, now);
    await q.enqueue('checkin', 'bad');
    await q.runOnce();
    expect((await tables.syncQueue.toArray())[0]?.parked).toBe(true);
    expect(await q.pendingCount()).toBe(0);
  });

  it('de-duplicates live items for the same record', async () => {
    const q = new SyncQueue({ send: async () => { throw new Error('offline'); } }, {}, now);
    await q.enqueue('checkin', 'a');
    await q.enqueue('checkin', 'a');
    expect(await tables.syncQueue.count()).toBe(1);
  });
});

describe('Crisis Fast-Path', () => {
  it('attempts immediately with a 3s timeout signal, in its own queue', async () => {
    let seen: AbortSignal | undefined;
    const fp = new CrisisFastPath(async (_id, signal) => void (seen = signal), {}, now);
    const delivered = await fp.flag('crisis-1');
    expect(delivered).toBe(true);
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(CRISIS_TIMEOUT_MS).toBe(3_000);
    expect(await tables.crisisQueue.count()).toBe(0);
    expect(await tables.syncQueue.count()).toBe(0);
  });

  it('retries every 15s (fixed, not exponential) until delivered', async () => {
    let fail = true;
    const send = vi.fn(async () => {
      if (fail) throw new Error('timeout');
    });
    const fp = new CrisisFastPath(send, {}, now);
    expect(await fp.flag('c')).toBe(false);
    for (let i = 0; i < 3; i++) {
      const item = (await tables.crisisQueue.toArray())[0];
      expect(item?.nextAttemptAt).toBe(clock + CRISIS_RETRY_MS);
      clock += CRISIS_RETRY_MS;
      await fp.runOnce();
    }
    expect(send).toHaveBeenCalledTimes(4);
    fail = false;
    clock += CRISIS_RETRY_MS;
    expect(await fp.runOnce()).toBe(1);
    expect(await fp.pendingCount()).toBe(0);
  });

  // Real time on purpose: AbortSignal.timeout is not driven by fake timers.
  it('actually aborts a hung request after 3s', { timeout: 10_000 }, async () => {
    const started = Date.now();
    const fp = new CrisisFastPath(
      (_id, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted after timeout')))),
      {},
      now,
    );
    expect(await fp.flag('hung')).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_900);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await tables.crisisQueue.toArray())[0]?.lastError).toMatch(/aborted/);
  });
});

describe('conflict resolvers', () => {
  it('reminders: server-authoritative last-write-wins on updatedAt', () => {
    const local = [{ id: 'r1', victimId: 'v', dueAt: 10, type: 'hearing' as const, note: 'old', updatedAt: 5 }];
    const merged = resolveReminders(local, [
      { id: 'r1', victimId: 'v', dueAt: 20, type: 'hearing', note: 'moved', updatedAt: 9 },
      { id: 'r2', victimId: 'v', dueAt: 5, type: 'compensation', note: 'new', updatedAt: 9 },
    ]);
    expect(merged.map((r) => [r.id, r.note])).toEqual([['r2', 'new'], ['r1', 'moved']]);
  });

  it('consent: the ledger merges additively and the latest decision wins per scope', () => {
    const local = [{ id: 'a', victimId: 'v', scope: 'share-free-text', granted: true, at: 1 }];
    const ledger = mergeConsentLedger(local, [
      { id: 'b', victimId: 'v', scope: 'share-free-text', granted: false, at: 2, updatedAt: 3, ledgerVersion: 2 },
      { id: 'a', victimId: 'v', scope: 'share-free-text', granted: true, at: 1, updatedAt: 1, ledgerVersion: 1 },
      { id: 'c', victimId: 'v', scope: 'case-linking', granted: true, at: 3, updatedAt: 4, ledgerVersion: 3 },
    ]);
    expect(ledger.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(effectiveConsent(ledger)).toEqual({ 'share-free-text': { granted: false, at: 2 }, 'case-linking': { granted: true, at: 3 } });
  });
});
