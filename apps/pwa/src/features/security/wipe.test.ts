import { afterEach, describe, expect, it, vi } from 'vitest';
import { tables } from '../../db';
import type { StoredCheckIn } from '../../db';
import { wipeDevice } from './wipe';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wipeDevice', () => {
  it('empties every Dexie table, localStorage, sessionStorage, Cache Storage, and unregisters the service worker', async () => {
    // Seed one row in every table the app actually writes to, plus the two
    // storages this app doesn't use itself (defensive — see wipe.ts).
    await tables.checkIns.add({
      id: 'c1', victimId: 'v1', createdAt: Date.now(), selfReport: {}, crisisFlag: false, compositeScore: 0,
      syncState: 'pending', signalTerms: {}, configVersion: 1, channel: 'app',
    } as unknown as StoredCheckIn);
    await tables.levelChanges.add({ id: 'l1', victimId: 'v1', at: Date.now(), reason: 'test' });
    await tables.reminders.add({ id: 'r1', victimId: 'v1', dueAt: Date.now(), type: 'checkin', note: '' });
    await tables.consent.add({ id: 'co1', victimId: 'v1', scope: 'share-free-text', granted: true, at: Date.now() });
    await tables.syncQueue.add({ kind: 'checkin', refId: 'c1', attempts: 0, lastError: null, nextAttemptAt: 0, createdAt: Date.now() });
    await tables.crisisQueue.add({ checkInId: 'c1', attempts: 0, lastError: null, nextAttemptAt: 0, createdAt: Date.now() });
    await tables.kv.put({ key: 'state:vigil-app', value: '{"ui":{"onboarded":true}}' });
    localStorage.setItem('probe', '1');
    sessionStorage.setItem('probe', '1');

    const deletedCaches: string[] = [];
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['vigil-static', 'workbox-precache-v2']),
      delete: vi.fn((name: string) => {
        deletedCaches.push(name);
        return Promise.resolve(true);
      }),
    });
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });

    const reload = vi.fn();
    await wipeDevice({ reload });

    for (const table of [tables.checkIns, tables.levelChanges, tables.reminders, tables.consent, tables.syncQueue, tables.crisisQueue, tables.kv]) {
      expect(await table.count()).toBe(0);
    }
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(deletedCaches.sort()).toEqual(['vigil-static', 'workbox-precache-v2']);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
