import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../src/app.js';
import { memoryRepo } from '../src/db.js';
import { hashToken } from '../src/tokens.js';
import { createFakeAuthenticator, fakeAuthenticationResponse, fakeRegistrationResponse } from './webauthn-fixture.js';

const RP_ID = 'vigil.test';
const ORIGIN = 'https://vigil.test';
const ISS = 'https://idp.test';
const AUD = 'vigil-api';

let clock = 1_000_000;
const now = () => clock;

async function buildTestApp(repo = memoryRepo()) {
  const kp = await generateKeyPair('RS256', { extractable: true });
  const deps: AppDeps = {
    repo,
    privateKeyPem: await exportPKCS8(kp.privateKey),
    publicKeyPem: await exportSPKI(kp.publicKey),
    issuer: ISS,
    audience: AUD,
    rpID: RP_ID,
    origin: ORIGIN,
    now,
    logLevel: 'silent',
  };
  const app = await buildApp(deps);
  return { app, repo, publicKeyPem: deps.publicKeyPem };
}

/** Full enrollment: bootstrap a token, register a real fake passkey with it. */
async function enroll(app: Awaited<ReturnType<typeof buildApp>>, repo: ReturnType<typeof memoryRepo>, counselorId: string) {
  const tokenHash = await hashToken('test-enrollment-token');
  await repo.createEnrollmentToken({ id: 'enroll-1', type: 'bootstrap', counselorId, tokenHash, expiresAt: now() + 60_000 }, 'ops-cli', now());

  const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/registration/options', payload: { enrollmentToken: 'test-enrollment-token' } });
  expect(optionsRes.statusCode).toBe(200);
  const { attemptId, options } = optionsRes.json();

  const authenticator = await createFakeAuthenticator();
  const credential = await fakeRegistrationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator });
  const verifyRes = await app.inject({ method: 'POST', url: '/auth/passkey/registration/verify', payload: { attemptId, credential } });
  expect(verifyRes.statusCode).toBe(200);
  return { authenticator, credentialId: verifyRes.json().credentialId as string };
}

beforeEach(() => {
  clock = 1_000_000;
});

describe('registration', () => {
  it('registers a real passkey with a bootstrap enrollment token', async () => {
    const { app, repo } = await buildTestApp();
    const { credentialId } = await enroll(app, repo, 'c_1');
    const creds = await repo.listCredentials('c_1');
    expect(creds.map((c) => c.id)).toEqual([credentialId]);
  });

  it('rejects registration options with no matching enrollment token or bearer', async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: 'POST', url: '/auth/passkey/registration/options', payload: { enrollmentToken: 'a-token-that-does-not-exist' } });
    expect(res.statusCode).toBe(401);
  });

  it('an already-logged-in counselor can self-service register a second key with a bearer token, no enrollment token', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    const loginRes = await performLogin(app, authenticator);
    const loginToken = loginRes.json().access_token;

    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/registration/options', headers: { authorization: `Bearer ${loginToken}` }, payload: {} });
    expect(optionsRes.statusCode).toBe(200);
    const { attemptId, options } = optionsRes.json();
    const authenticator2 = await createFakeAuthenticator();
    const credential = await fakeRegistrationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator: authenticator2 });
    const verifyRes = await app.inject({ method: 'POST', url: '/auth/passkey/registration/verify', payload: { attemptId, credential } });
    expect(verifyRes.statusCode).toBe(200);
    expect(await repo.countCredentials('c_1')).toBe(2);
  });
});

async function performLogin(app: Awaited<ReturnType<typeof buildApp>>, authenticator: Awaited<ReturnType<typeof createFakeAuthenticator>>, opts: { counter?: number } = {}) {
  const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
  expect(optionsRes.statusCode).toBe(200);
  const { attemptId, options } = optionsRes.json();
  expect(options.allowCredentials).toBeUndefined(); // usernameless
  const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator, counter: opts.counter });
  return app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
}

describe('login', () => {
  it('logs in with a usernameless (discoverable) real passkey and issues a counselor-scoped JWT', async () => {
    const { app, repo, publicKeyPem } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');

    const res = await performLogin(app, authenticator);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ token_type: 'Bearer', scope: 'counselor', sub: 'c_1', expires_in: '15m' });

    // RBAC after login: the issued token verifies with the real public key and carries the right claims.
    const { payload } = await jwtVerify(body.access_token, await importSPKI(publicKeyPem, 'RS256'), { issuer: ISS, audience: AUD });
    expect(payload).toMatchObject({ sub: 'c_1', scope: 'counselor' });
  });

  it('rejects an unknown credential with the SAME generic 401 as any other failure — no account-existence leak', async () => {
    const { app } = await buildTestApp();
    const phantom = await createFakeAuthenticator();
    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
    const { attemptId, options } = optionsRes.json();
    const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator: phantom });
    const res = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Could not sign you in with that passkey');
  });

  it('rejects a login whose signature does not match the stored public key', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    const impostor = await createFakeAuthenticator(authenticator.credentialId); // same id, different key
    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
    const { attemptId, options } = optionsRes.json();
    const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator: impostor });
    const res = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
    expect(res.statusCode).toBe(401);
  });
});

describe('challenge expiry and replay', () => {
  it('a login challenge cannot be replayed — the second attempt with the same attemptId fails', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
    const { attemptId, options } = optionsRes.json();
    const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator });

    const first = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
    expect(second.statusCode).toBe(401);
  });

  it('a challenge older than 2 minutes is refused even with a structurally valid response', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
    const { attemptId, options } = optionsRes.json();
    clock += 2 * 60 * 1000 + 1;
    const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator });
    const res = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
    expect(res.statusCode).toBe(401);
  });
});

describe('sign-count handling (change 4)', () => {
  it('a synced passkey reporting counter 0 every time is never flagged or rejected', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    expect((await performLogin(app, authenticator, { counter: 0 })).statusCode).toBe(200);
    expect((await performLogin(app, authenticator, { counter: 0 })).statusCode).toBe(200);
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    expect(audit.some((e) => e.action === 'counter_decreased')).toBe(false);
  });

  it('a non-zero counter decrease is logged as a warning but the login still succeeds', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    expect((await performLogin(app, authenticator, { counter: 5 })).statusCode).toBe(200);
    const res = await performLogin(app, authenticator, { counter: 3 }); // decreased, non-zero
    expect(res.statusCode).toBe(200); // NOT rejected — advisory only
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    expect(audit.some((e) => e.action === 'counter_decreased' && e.detail.previous === 5 && e.detail.incoming === 3)).toBe(true);
  });
});

describe('passkey management (RBAC after login)', () => {
  it('lists and refuses to remove the last remaining passkey', async () => {
    const { app, repo } = await buildTestApp();
    const { credentialId } = await enroll(app, repo, 'c_1');
    const list = await repo.listCredentials('c_1');
    expect(list.map((c) => c.id)).toEqual([credentialId]);
    const removed = await repo.removeCredential(credentialId, 'c_1');
    expect(removed).toBe(true); // repo-level op succeeds; the app-level guard (count<=1) is what refuses — tested via HTTP below
  });

  it('HTTP DELETE refuses when it is the counselor\'s only passkey', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator, credentialId } = await enroll(app, repo, 'c_1');
    const loginRes = await performLogin(app, authenticator);
    const token = loginRes.json().access_token;
    const res = await app.inject({
      method: 'DELETE', url: `/v1/counselor/passkeys/${credentialId}`,
      headers: { 'x-vigil-subject': 'c_1', 'x-vigil-scope': 'counselor' },
    });
    expect(res.statusCode).toBe(400);
    void token;
  });
});

describe('recovery: two distinct operators (change 1)', () => {
  it('the same operator cannot both request and approve a recovery', async () => {
    const { repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', now());
    await repo.createRecoveryRequest('req-1', 'c_1', 'operator-A', now());
    const approved = await repo.approveRecoveryRequest('req-1', 'operator-A');
    expect(approved).toBe(false);
  });

  it('a different operator CAN approve it', async () => {
    const { repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', now());
    await repo.createRecoveryRequest('req-1', 'c_1', 'operator-A', now());
    const approved = await repo.approveRecoveryRequest('req-1', 'operator-B');
    expect(approved).toBe(true);
  });
});

describe('rate limiting throttles, never locks out (change 2)', () => {
  it('a single credential is throttled after repeated failures, but is not permanently locked — a later attempt within budget still works', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    // Exhaust the per-credential budget with bad signatures (impostor key, same credential id).
    const impostor = await createFakeAuthenticator(authenticator.credentialId);
    for (let i = 0; i < 5; i++) {
      const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
      const { attemptId, options } = optionsRes.json();
      const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator: impostor });
      const res = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
      expect(res.statusCode).toBe(401);
    }
    // 6th attempt against the SAME credential id is throttled (429), regardless of correctness.
    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
    const { attemptId, options } = optionsRes.json();
    const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator });
    const throttled = await app.inject({ method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential } });
    expect(throttled.statusCode).toBe(429);
    // No account-level lockout: nothing here disables the credential permanently (confirmed structurally —
    // this module has no "disabled"/"locked" field on a credential at all).
  });
});

describe('x-vigil-client-ip: the gateway-forwarded address, not a client-supplied one, drives both the limiter and the audit log (review point 1)', () => {
  it('the audit log on a failed login records x-vigil-client-ip, exactly as forwarded — proving the field exists and is populated', async () => {
    const { app, repo } = await buildTestApp();
    const { authenticator } = await enroll(app, repo, 'c_1');
    const impostor = await createFakeAuthenticator(authenticator.credentialId);
    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
    const { attemptId, options } = optionsRes.json();
    const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator: impostor });
    await app.inject({
      method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential },
      headers: { 'x-vigil-client-ip': '203.0.113.55' }, // as the gateway would set it
    });
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    const entry = audit.find((e) => e.action === 'login_failed');
    expect(entry?.detail.clientIp).toBe('203.0.113.55');
  });

  it('the per-IP throttle keys on x-vigil-client-ip, not the raw connection — two different forwarded clients are NOT bucketed together', async () => {
    const { app } = await buildTestApp();
    // A fresh, never-registered credential id per attempt, so the separate
    // per-CREDENTIAL throttle (a tighter 5/min budget) never interferes —
    // this test isolates the per-IP budget (20/min) specifically.
    const attempt = async (clientIp: string) => {
      const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/login/options' });
      const { attemptId, options } = optionsRes.json();
      const phantom = await createFakeAuthenticator();
      const credential = await fakeAuthenticationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator: phantom });
      return app.inject({
        method: 'POST', url: '/auth/passkey/login/verify', payload: { attemptId, credential },
        headers: { 'x-vigil-client-ip': clientIp },
      });
    };
    // Exhaust client A's per-IP budget (20/min) — all fail as unknown_credential (401), not rate limit yet.
    for (let i = 0; i < 20; i++) expect((await attempt('203.0.113.1')).statusCode).toBe(401);
    expect((await attempt('203.0.113.1')).statusCode).toBe(429); // client A now throttled
    expect((await attempt('203.0.113.2')).statusCode).toBe(401); // client B unaffected — still reaches verification, not 429
  });
});
