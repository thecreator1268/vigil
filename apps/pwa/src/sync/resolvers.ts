/**
 * Per-entity conflict resolution for server → device pulls.
 *
 *  - check-ins: append-only and immutable → no resolver needed, ever.
 *  - reminders: server-authoritative `updatedAt`, last-write-wins.
 *  - consent:   the ledger merges ADDITIVELY (union of entries by id); the
 *               effective state per scope is the most recent decision.
 */
import type { ConsentRecord as ApiConsentRecord, Reminder as ApiReminder } from '@vigil/shared-types';
import type { ConsentRecord, Reminder } from '../db';

type Resolver<L, S> = (local: readonly L[], server: readonly S[]) => L[];

export const resolveReminders: Resolver<Reminder & { updatedAt?: number }, ApiReminder> = (local, server) => {
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const s of server) {
    const l = byId.get(s.id);
    if (!l || (l.updatedAt ?? 0) <= s.updatedAt) {
      byId.set(s.id, { id: s.id, victimId: s.victimId, dueAt: s.dueAt, type: s.type, note: s.note, updatedAt: s.updatedAt });
    }
  }
  return [...byId.values()].sort((a, b) => a.dueAt - b.dueAt);
};

export const mergeConsentLedger: Resolver<ConsentRecord, ApiConsentRecord> = (local, server) => {
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const s of server) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, victimId: s.victimId, scope: s.scope, granted: s.granted, at: s.at });
  }
  return [...byId.values()].sort((a, b) => a.at - b.at);
};

/** Effective consent per scope = the latest decision in the (merged) ledger. */
export function effectiveConsent(ledger: readonly ConsentRecord[]): Record<string, { granted: boolean; at: number }> {
  const out: Record<string, { granted: boolean; at: number }> = {};
  for (const r of [...ledger].sort((a, b) => a.at - b.at)) out[r.scope] = { granted: r.granted, at: r.at };
  return out;
}

export const resolvers = { reminders: resolveReminders, consent: mergeConsentLedger } as const;
