import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isInstalled,
  PERIODIC_SYNC_TAG,
  registerBackgroundSync,
  registerPeriodicSync,
  supportsBackgroundSync,
  supportsPeriodicSync,
  SYNC_TAG,
  unregisterPeriodicSync,
} from './background-sync';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feature detection', () => {
  it('Background Sync requires serviceWorker + SyncManager', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('window', { SyncManager: class {} });
    expect(supportsBackgroundSync()).toBe(true);

    vi.stubGlobal('window', {});
    expect(supportsBackgroundSync()).toBe(false);
  });

  it('Periodic Background Sync requires serviceWorker + PeriodicSyncManager', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('window', { PeriodicSyncManager: class {} });
    expect(supportsPeriodicSync()).toBe(true);

    vi.stubGlobal('window', {});
    expect(supportsPeriodicSync()).toBe(false);
  });

  it('"installed" means standalone display mode', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(display-mode: standalone)' }));
    expect(isInstalled()).toBe(true);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(isInstalled()).toBe(false);
  });
});

describe('registerBackgroundSync', () => {
  it('registers the standard sync tag when supported', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ sync: { register } }) } });
    vi.stubGlobal('window', { SyncManager: class {} });
    await registerBackgroundSync();
    expect(register).toHaveBeenCalledWith(SYNC_TAG);
  });

  it('does nothing when SyncManager is unsupported (Firefox, Safari)', async () => {
    const register = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ sync: { register } }) } });
    vi.stubGlobal('window', {});
    await registerBackgroundSync();
    expect(register).not.toHaveBeenCalled();
  });

  it('never throws, even if registration itself rejects (e.g. permission denied)', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ sync: { register: () => Promise.reject(new Error('denied')) } }) } });
    vi.stubGlobal('window', { SyncManager: class {} });
    await expect(registerBackgroundSync()).resolves.toBeUndefined();
  });
});

describe('registerPeriodicSync', () => {
  it('registers only when supported, installed, AND the permission is already granted', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ periodicSync: { register } }) },
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    });
    vi.stubGlobal('window', { PeriodicSyncManager: class {} });
    vi.stubGlobal('matchMedia', () => ({ matches: true })); // installed
    await registerPeriodicSync();
    expect(register).toHaveBeenCalledWith(PERIODIC_SYNC_TAG, expect.objectContaining({ minInterval: expect.any(Number) }));
  });

  it('skips registration when not installed, even if the API and permission are both there', async () => {
    const register = vi.fn();
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ periodicSync: { register } }) },
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
    });
    vi.stubGlobal('window', { PeriodicSyncManager: class {} });
    vi.stubGlobal('matchMedia', () => ({ matches: false })); // NOT installed
    await registerPeriodicSync();
    expect(register).not.toHaveBeenCalled();
  });

  it('skips registration when the permission has not been granted', async () => {
    const register = vi.fn();
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ periodicSync: { register } }) },
      permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
    });
    vi.stubGlobal('window', { PeriodicSyncManager: class {} });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    await registerPeriodicSync();
    expect(register).not.toHaveBeenCalled();
  });
});

describe('unregisterPeriodicSync', () => {
  it('unregisters the periodic tag when the registration has one', async () => {
    const unregister = vi.fn().mockResolvedValue(undefined);
    await unregisterPeriodicSync({ periodicSync: { unregister } } as unknown as ServiceWorkerRegistration);
    expect(unregister).toHaveBeenCalledWith(PERIODIC_SYNC_TAG);
  });

  it('does nothing (and never throws) when the registration has no periodicSync at all', async () => {
    await expect(unregisterPeriodicSync({} as ServiceWorkerRegistration)).resolves.toBeUndefined();
  });
});
