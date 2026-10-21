import { describe, expect, it } from 'vitest';
import { hashPin, randomSaltHex } from './pin';

describe('App Lock PIN hashing', () => {
  it('is deterministic for the same PIN and salt, and the digest never contains the PIN', async () => {
    const salt = randomSaltHex();
    const a = await hashPin('1234', salt);
    const b = await hashPin('1234', salt);
    expect(a).toBe(b);
    expect(a).not.toContain('1234');
  });

  it('differs for a different PIN, and differs for the same PIN with a different salt', async () => {
    const salt = randomSaltHex();
    const sameSaltOtherPin = await hashPin('4321', salt);
    const samePinOtherSalt = await hashPin('1234', randomSaltHex());
    const reference = await hashPin('1234', salt);
    expect(reference).not.toBe(sameSaltOtherPin);
    expect(reference).not.toBe(samePinOtherSalt);
  });

  it('never reuses a salt', () => {
    expect(randomSaltHex()).not.toBe(randomSaltHex());
  });
});
