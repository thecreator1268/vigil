import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

/** Random, URL-safe token for enrollment links / operator credentials. Printed once, never stored raw. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function hashToken(token: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(token, salt, KEY_LEN)) as Buffer;
  return `${salt.toString('base64url')}.${derived.toString('base64url')}`;
}

export async function verifyToken(token: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split('.');
  if (!saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const derived = (await scryptAsync(token, salt, expected.length)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function newId(): string {
  return randomUUID();
}
