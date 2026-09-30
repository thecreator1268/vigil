/**
 * Field-level encryption at rest for PII / free text: AES-256-GCM with a
 * random 96-bit IV per value. Ciphertext format: `v1.<iv>.<tag>.<data>`
 * (base64url parts) so the key/algorithm can be rotated by version prefix.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface FieldCrypto {
  encrypt(plaintext: string, aad?: string): string;
  decrypt(ciphertext: string, aad?: string): string;
}

export function createFieldCrypto(base64Key: string): FieldCrypto {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('field encryption key must be 32 bytes (base64)');

  return {
    encrypt(plaintext, aad) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      if (aad) cipher.setAAD(Buffer.from(aad));
      const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ['v1', iv, tag, data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
    },
    decrypt(ciphertext, aad) {
      const [version, iv, tag, data] = ciphertext.split('.');
      if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('unrecognised ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      if (aad) decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    },
  };
}
