import { beforeEach, describe, expect, it } from 'vitest';
import { db, tables } from './index';
import { decryptText, encryptText, resetKeyCache } from './local-crypto';
import { dexieStateStorage, FreeTextPersistenceError } from '../store/dexie-storage';

beforeEach(async () => {
  // clear rather than delete: background sync attempts may still hold the connection
  await Promise.all(db.tables.map((t) => t.clear()));
  resetKeyCache();
});

describe('Dexie schema (vigil-local)', () => {
  it('keeps the spec v1 stores and indexes exactly', () => {
    const schema = Object.fromEntries(
      db.tables.map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')]),
    );
    expect(db.name).toBe('vigil-local');
    expect(schema.checkIns).toBe('id, victimId, createdAt, syncState');
    expect(schema.levelChanges).toBe('id, victimId, at');
    expect(schema.reminders).toBe('id, victimId, dueAt');
    expect(schema.consent).toBe('id, victimId, scope');
  });

  it('adds the sync queues and kv purely additively in version 2', () => {
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual(['checkIns', 'consent', 'crisisQueue', 'kv', 'levelChanges', 'reminders', 'syncQueue']);
  });
});

describe('local encrypted store', () => {
  it('round-trips text and never stores plaintext', async () => {
    const ct = await encryptText('मुझे डर लग रहा है');
    expect(ct.startsWith('enc1:')).toBe(true);
    expect(ct).not.toContain('डर');
    expect(await decryptText(ct)).toBe('मुझे डर लग रहा है');
  });

  it('keeps the key non-extractable', async () => {
    await encryptText('x');
    const key = (await tables.kv.get('local-text-key'))?.value as CryptoKey;
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('refuses to read unencrypted free text', async () => {
    await expect(decryptText('plain words')).rejects.toThrow(/unencrypted/);
    expect(await decryptText(undefined)).toBeUndefined();
  });
});

describe('Zustand Dexie persistence guard', () => {
  it('persists ordinary slices', async () => {
    await dexieStateStorage.setItem('t', JSON.stringify({ state: { ui: { onboarded: true } } }));
    expect(await dexieStateStorage.getItem('t')).toContain('onboarded');
    await dexieStateStorage.removeItem('t');
    expect(await dexieStateStorage.getItem('t')).toBeNull();
  });

  it('refuses to persist raw free text', async () => {
    await expect(dexieStateStorage.setItem('t', JSON.stringify({ state: { draft: { freeText: 'secret' } } }))).rejects.toThrow(
      FreeTextPersistenceError,
    );
  });
});
