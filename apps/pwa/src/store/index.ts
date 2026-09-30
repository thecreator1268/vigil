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

export type SyncPhase = 'idle' | 'saved-local' | 'syncing' | 'synced' | 'crisis-pending';

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
  };
  setUi: (p: Partial<UiSlice['ui']>) => void;
}

export type AppState = SessionSlice & SyncSlice & ConsentSlice & UiSlice;

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

const uiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  ui: { onboarded: false, language: 'en', checkInLevel: 'gentle', region: import.meta.env.VITE_DEFAULT_REGION ?? 'pune' },
  setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
});

export const useStore = create<AppState>()(
  persist(
    (...a) => ({ ...sessionSlice(...a), ...syncSlice(...a), ...consentSlice(...a), ...uiSlice(...a) }),
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

/** The derived label the sync-status indicator shows. */
export function syncPhase(s: SyncSlice['sync'], justSynced: boolean): SyncPhase {
  if (s.crisisPending > 0) return 'crisis-pending';
  if (s.syncing) return 'syncing';
  if (justSynced) return 'synced';
  if (s.pending > 0) return 'saved-local';
  return 'idle';
}
