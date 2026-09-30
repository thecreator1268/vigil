/**
 * Zustand `persist` storage backed by Dexie's kv table (not localStorage), so
 * UI state lives in the same durable store as check-ins.
 *
 * Guard: raw free text must never be persisted through this path. Any state
 * blob containing a free-text-like key is rejected outright.
 */
import type { StateStorage } from 'zustand/middleware';
import { tables } from '../db';

const FORBIDDEN_KEYS = /"(freeText|draftText|transcript|text)"\s*:/;

export class FreeTextPersistenceError extends Error {}

export const dexieStateStorage: StateStorage = {
  async getItem(name) {
    const rec = await tables.kv.get(`state:${name}`);
    return (rec?.value as string | undefined) ?? null;
  },
  async setItem(name, value) {
    if (FORBIDDEN_KEYS.test(value)) {
      throw new FreeTextPersistenceError(`refusing to persist free text in state slice "${name}"`);
    }
    await tables.kv.put({ key: `state:${name}`, value });
  },
  async removeItem(name) {
    await tables.kv.delete(`state:${name}`);
  },
};
