/**
 * Hand-built WebAuthn ceremony responses for unit/contract tests — no
 * browser, no @simplewebauthn/browser (which needs a real `navigator`).
 * Exercises the REAL verifyRegistrationResponse/verifyAuthenticationResponse
 * from @simplewebauthn/server, not a mock of them: a real ECDSA P-256
 * keypair signs real authenticatorData, encoded exactly as a browser +
 * authenticator would produce it. The end-to-end browser path is covered
 * separately by e2e/counselor-passkey.spec.ts against Playwright's virtual
 * authenticator.
 */
import { encodeCBOR, type CBORType } from '@levischuck/tiny-cbor';
import { webcrypto } from 'node:crypto';

type CryptoKey = webcrypto.CryptoKey;
type CryptoKeyPair = webcrypto.CryptoKeyPair;
const crypto = webcrypto;

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

/** DER-encode a raw r||s ECDSA signature (WebCrypto's output format) per RFC 3279. */
function derEncodeSignature(raw: Uint8Array): Uint8Array {
  const r = raw.slice(0, 32);
  const s = raw.slice(32, 64);
  const positiveInt = (n: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < n.length - 1 && n[start] === 0 && (n[start + 1] ?? 0) < 0x80) start++;
    let b = n.slice(start);
    if ((b[0] ?? 0) >= 0x80) b = Uint8Array.from([0, ...b]);
    return b;
  };
  const rEnc = positiveInt(r);
  const sEnc = positiveInt(s);
  const body = Uint8Array.from([0x02, rEnc.length, ...rEnc, 0x02, sEnc.length, ...sEnc]);
  return Uint8Array.from([0x30, body.length, ...body]);
}

export interface FakeAuthenticator {
  credentialId: Uint8Array;
  keyPair: CryptoKeyPair;
}

export async function createFakeAuthenticator(credentialId?: Uint8Array): Promise<FakeAuthenticator> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { credentialId: Uint8Array.from(credentialId ?? crypto.getRandomValues(new Uint8Array(16))), keyPair };
}

function clientDataJSON(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

async function coseKeyBytes(publicKey: CryptoKey): Promise<Uint8Array> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey)); // 0x04 || x(32) || y(32)
  const coseKey = new Map<number, CBORType>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, raw.slice(1, 33)], // x
    [-3, raw.slice(33, 65)], // y
  ]);
  return encodeCBOR(coseKey as unknown as CBORType);
}

function authDataBase(rpId: string, flags: number, counter: number): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(rpId)).then((rpIdHash) => {
    const counterBytes = new Uint8Array(4);
    new DataView(counterBytes.buffer).setUint32(0, counter);
    return Uint8Array.from([...rpIdHash, flags, ...counterBytes]);
  });
}

export interface RegistrationParams {
  rpId: string;
  origin: string;
  challenge: string; // base64url, exactly as returned in options.challenge
  authenticator: FakeAuthenticator;
  userVerified?: boolean;
}

/** Builds a RegistrationResponseJSON-shaped object, cryptographically real. */
export async function fakeRegistrationResponse(p: RegistrationParams) {
  const flags = 0x40 /* AT */ | 0x01 /* UP */ | (p.userVerified ?? true ? 0x04 /* UV */ : 0);
  const base = await authDataBase(p.rpId, flags, 0);
  const cose = await coseKeyBytes(p.authenticator.keyPair.publicKey);
  const credIdLen = new Uint8Array(2);
  new DataView(credIdLen.buffer).setUint16(0, p.authenticator.credentialId.length);
  const attestedCredData = Uint8Array.from([...new Uint8Array(16) /* aaguid */, ...credIdLen, ...p.authenticator.credentialId, ...cose]);
  const authData = Uint8Array.from([...base, ...attestedCredData]);
  const attestationObject = encodeCBOR(
    new Map<string, CBORType>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]) as unknown as CBORType,
  );
  const clientData = clientDataJSON('webauthn.create', p.challenge, p.origin);
  return {
    id: b64url(p.authenticator.credentialId),
    rawId: b64url(p.authenticator.credentialId),
    response: { clientDataJSON: b64url(clientData), attestationObject: b64url(attestationObject) },
    clientExtensionResults: {},
    type: 'public-key',
  };
}

export interface AuthenticationParams {
  rpId: string;
  origin: string;
  challenge: string;
  authenticator: FakeAuthenticator;
  counter?: number;
  userVerified?: boolean;
}

/** Builds an AuthenticationResponseJSON-shaped object, cryptographically real. */
export async function fakeAuthenticationResponse(p: AuthenticationParams) {
  const flags = 0x01 /* UP */ | (p.userVerified ?? true ? 0x04 /* UV */ : 0);
  const authData = await authDataBase(p.rpId, flags, p.counter ?? 0);
  const clientData = clientDataJSON('webauthn.get', p.challenge, p.origin);
  const toSign = Uint8Array.from([...authData, ...(await sha256(clientData))]);
  const sigRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, p.authenticator.keyPair.privateKey, toSign));
  const signature = derEncodeSignature(sigRaw);
  return {
    id: b64url(p.authenticator.credentialId),
    rawId: b64url(p.authenticator.credentialId),
    response: {
      clientDataJSON: b64url(clientData),
      authenticatorData: b64url(authData),
      signature: b64url(signature),
    },
    clientExtensionResults: {},
    type: 'public-key',
  };
}
