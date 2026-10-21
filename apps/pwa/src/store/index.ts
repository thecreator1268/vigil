/**
 * App state, sliced into `session`, `sync`, `consent`, `ui`.
 *
 * Persisted selectively (Dexie-backed): session, consent, ui.
 * Never persisted: `sync` (derived from the Dexie queues at runtime) and any
 * free text — check-in drafts live only in component state.
 */
import type { ConsentScope } from '@vigil/shared-types';
import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { dexieStateStorage } from './dexie-storage';

export type Role = 'victim' | 'counselor' | 'admin';

export interface SessionSlice {
  session: { role: Role | null; token: string | null; subject: string | null; expiresAt: number | null };
  setSession: (s: { role: Role; token: string; subject: string; expiresAt: number | null }) => void;
  signOut: () => void;
}

export type SyncPhase = 'saved-local' | 'syncing' | 'synced' | 'crisis-pending';

export interface SyncSlice {
  sync: {
    online: boolean;
    pending: number;
    crisisPending: number;
    syncing: boolean;
    lastSyncedAt: number | null;
    lastError: string | null;
  };
  patchSync: (p: Partial<SyncSlice['sync']>) => void;
}

export interface ConsentSlice {
  consent: Partial<Record<ConsentScope, { granted: boolean; at: number }>>;
  setConsent: (scope: ConsentScope, granted: boolean, at: number) => void;
  /** Additive merge of server state (see sync/resolvers.ts). */
  replaceConsent: (c: ConsentSlice['consent']) => void;
}

export interface UiSlice {
  ui: {
    onboarded: boolean;
    language: 'en' | 'hi';
    checkInLevel: 'gentle' | 'daily';
    /** Coarse district, set at enrollment; used only for k-anonymised rollups. */
    region: string | null;
    /** The "before you start" disclosure in the check-in flow is shown once,
     *  the first time, then never again on this device. */
    checkinIntroSeen: boolean;
    /** Device-monitoring / cloud-sync trade-off notice, shown once before
     *  onboarding, then never again on this device. */
    deviceSafetyNoticeSeen: boolean;
    /** Opt-in local App Lock. Off by default. The PIN itself is never
     *  stored — only a salted SHA-256 hash (see features/security/pin.ts). */
    appLockEnabled: boolean;
    appLockSalt: string | null;
    appLockPinHash: string | null;
  };
  setUi: (p: Partial<UiSlice['ui']>) => void;
}

export interface LockSlice {
  /**
   * True while the App Lock PIN screen is showing. Ephemeral — never
   * persisted, always starts false on a fresh load (the PIN screen's own
   * mount logic, not this flag, decides whether to lock on open/resume).
   * Other UI (the sync pill) reads this to stay silent while locked, per
   * the device-safety rule that background sync must not expose anything
   * through the lock screen.
   */
  appLockEngaged: boolean;
  setAppLockEngaged: (v: boolean) => void;
}

export type AppState = SessionSlice & SyncSlice & ConsentSlice & UiSlice & LockSlice;

const sessionSlice: StateCreator<AppState, [], [], SessionSlice> = (set) => ({
  session: { role: null, token: null, subject: null, expiresAt: null },
  setSession: (s) => set({ session: s }),
  signOut: () => set({ session: { role: null, token: null, subject: null, expiresAt: null } }),
});

const syncSlice: StateCreator<AppState, [], [], SyncSlice> = (set) => ({
  sync: {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pending: 0,
    crisisPending: 0,
    syncing: false,
    lastSyncedAt: null,
    lastError: null,
  },
  patchSync: (p) => set((s) => ({ sync: { ...s.sync, ...p } })),
});

const consentSlice: StateCreator<AppState, [], [], ConsentSlice> = (set) => ({
  consent: {},
  setConsent: (scope, granted, at) => set((s) => ({ consent: { ...s.consent, [scope]: { granted, at } } })),
  replaceConsent: (consent) => set({ consent }),
});

const lockSlice: StateCreator<AppState, [], [], LockSlice> = (set) => ({
  appLockEngaged: false,
  setAppLockEngaged: (v) => set({ appLockEngaged: v }),
});

const uiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  ui: {
    onboarded: false,
    language: 'en',
    checkInLevel: 'gentle',
    region: import.meta.env.VITE_DEFAULT_REGION ?? 'pune',
    checkinIntroSeen: false,
    deviceSafetyNoticeSeen: false,
    appLockEnabled: false,
    appLockSalt: null,
    appLockPinHash: null,
  },
  setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
});

export const useStore = create<AppState>()(
  persist(
    (...a) => ({ ...sessionSlice(...a), ...syncSlice(...a), ...consentSlice(...a), ...uiSlice(...a), ...lockSlice(...a) }),
    {
      name: 'vigil-app',
      version: 1,
      storage: createJSONStorage(() => dexieStateStorage),
      // Selective persistence: never the sync slice, never free text.
      partialize: (s) => ({ session: s.session, consent: s.consent, ui: s.ui }),
    },
  ),
);

export const hasConsent = (scope: ConsentScope) => !!useStore.getState().consent[scope]?.granted;

/**
 * The derived label the sync-status pill shows. Exactly three resting/active
 * states on purpose — "nothing pending yet" and "just delivered" both read
 * as "Synced"; there is no separate idle state to keep the pill's vocabulary
 * minimal, per the device-safety brief.
 */
export function syncPhase(s: SyncSlice['sync']): SyncPhase {
  if (s.crisisPending > 0) return 'crisis-pending';
  if (s.syncing) return 'syncing';
  if (s.pending > 0) return 'saved-local';
  return 'synced';
}
