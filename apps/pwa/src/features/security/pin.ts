/**
 * App Lock PIN hashing. The PIN itself is never stored — only a salted
 * SHA-256 digest (`ui.appLockSalt` / `ui.appLockPinHash`). This is a local
 * deterrent against casual access to an unlocked device, not a cryptographic
 * security boundary — it cannot resist someone with the device and time.
 */
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSaltHex(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${saltHex}:${pin}`));
  return toHex(new Uint8Array(digest));
}
