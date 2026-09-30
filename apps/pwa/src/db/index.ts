/**
 * The app's single entry point to IndexedDB. Always import `db` from here (not
 * from ./schema) so the version-2 tables below are registered before open.
 *
 * Version 2 is purely additive:
 *   syncQueue   — the application-level Sync Queue (persisted, survives restarts)
 *   crisisQueue — the independent Crisis Fast-Path queue
 *   kv          — small settings: persisted Zustand slices, the local
 *                 encryption key (non-extractable CryptoKey), scoring config
 */
import type { Table } from 'dexie';
import type { CrisisMatch, SignalTerms } from '@vigil/shared-types';
import { db, type CheckIn, type ConsentRecord, type LevelChange, type Reminder } from './schema';

export type SyncKind = 'checkin' | 'consent' | 'erase-text';

export interface SyncQueueItem {
  seq?: number;
  kind: SyncKind;
  refId: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  createdAt: number;
  /** Set when the server permanently rejected the item (4xx); kept for inspection, not retried. */
  parked?: boolean;
}

export interface CrisisQueueItem {
  seq?: number;
  checkInId: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: number;
  createdAt: number;
}

export interface KvRecord {
  key: string;
  value: unknown;
}

/**
 * Fields stored alongside the spec's CheckIn (non-indexed, so the v1 schema is
 * unchanged). `freeText` holds CIPHERTEXT (see ./local-crypto).
 */
export interface StoredCheckIn extends CheckIn {
  responseLatencyMs?: number | null;
  signalTerms: SignalTerms;
  configVersion: number;
  crisis?: CrisisMatch | null;
  channel: 'app' | 'ivrs' | 'sms';
}

db.version(2).stores({
  syncQueue: '++seq, kind, refId, nextAttemptAt',
  crisisQueue: '++seq, &checkInId, nextAttemptAt',
  kv: '&key',
});

export const tables = {
  checkIns: db.checkIns as unknown as Table<StoredCheckIn, string>,
  levelChanges: db.levelChanges,
  reminders: db.reminders,
  consent: db.consent,
  syncQueue: db.table<SyncQueueItem, number>('syncQueue'),
  crisisQueue: db.table<CrisisQueueItem, number>('crisisQueue'),
  kv: db.table<KvRecord, string>('kv'),
};

export { db };
export type { CheckIn, ConsentRecord, LevelChange, Reminder };
