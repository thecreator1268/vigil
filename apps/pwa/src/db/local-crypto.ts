/**
 * Local encrypted store for free text. AES-GCM-256 with a NON-EXTRACTABLE
 * WebCrypto key generated on first use and kept in IndexedDB (a CryptoKey is
 * structured-cloneable). The raw key material can't be read by script, so an
 * IndexedDB dump alone does not reveal what someone wrote.
 */
import { tables } from './index';

const KEY_ID = 'local-text-key';
const PREFIX = 'enc1:';
let cached: Promise<CryptoKey> | null = null;

async function loadKey(): Promise<CryptoKey> {
  const existing = await tables.kv.get(KEY_ID);
  if (existing?.value) return existing.value as CryptoKey;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await tables.kv.put({ key: KEY_ID, value: key });
  return key;
}

function key(): Promise<CryptoKey> {
  cached ??= loadKey().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptText(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain));
  return `${PREFIX}${toB64(iv)}:${toB64(ct)}`;
}

export async function decryptText(stored: string | undefined): Promise<string | undefined> {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) throw new Error('refusing to read unencrypted free text');
  const [iv, ct] = stored.slice(PREFIX.length).split(':');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv as string) }, await key(), fromB64(ct as string));
  return new TextDecoder().decode(pt);
}

/** Test hook: forget the cached key handle. */
export function resetKeyCache(): void {
  cached = null;
}
