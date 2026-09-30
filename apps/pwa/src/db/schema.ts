// Dexie schema — implemented exactly as specified (VIGIL build spec, "Data
// model / Dexie"). The only change is `export` on the interfaces so other
// modules can use the types; the stores/indexes are verbatim. Additive tables
// (sync queues, kv) are registered as version 2 in ./index.ts.
import Dexie, { Table } from 'dexie';

export interface CheckIn {
  id: string; victimId: string; createdAt: number;
  selfReport: Record<string, number>;
  freeText?: string;               // stays local unless consent/fast-path
  sentimentScore?: number;
  voiceFeatures?: { pitchVar: number; rms: number } | null;
  crisisFlag: boolean; compositeScore: number;
  syncState: 'pending' | 'synced' | 'crisis-synced'; syncedAt?: number;
}
export interface LevelChange { id: string; victimId: string; at: number; reason: string; }
export interface Reminder { id: string; victimId: string; dueAt: number; type: 'hearing'|'compensation'|'checkin'; note: string; }
export interface ConsentRecord { id: string; victimId: string; scope: string; granted: boolean; at: number; }

class VigilDB extends Dexie {
  checkIns!: Table<CheckIn, string>;
  levelChanges!: Table<LevelChange, string>;
  reminders!: Table<Reminder, string>;
  consent!: Table<ConsentRecord, string>;
  constructor() {
    super('vigil-local');
    this.version(1).stores({
      checkIns: 'id, victimId, createdAt, syncState',
      levelChanges: 'id, victimId, at',
      reminders: 'id, victimId, dueAt',
      consent: 'id, victimId, scope',
    });
  }
}
export const db = new VigilDB();
