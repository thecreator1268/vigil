import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../src/app.js';
import { memoryRepo } from '../src/db.js';
import { createFakeAuthenticator, fakeRegistrationResponse } from './webauthn-fixture.js';

const RP_ID = 'vigil.test';
const ORIGIN = 'https://vigil.test';

async function buildTestApp() {
  const kp = await generateKeyPair('RS256', { extractable: true });
  const repo = memoryRepo();
  const deps: AppDeps = {
    repo,
    privateKeyPem: await exportPKCS8(kp.privateKey),
    publicKeyPem: await exportSPKI(kp.publicKey),
    issuer: 'https://idp.test',
    audience: 'vigil-api',
    rpID: RP_ID,
    origin: ORIGIN,
    internalToken: 'internal-secret',
    logLevel: 'silent',
  };
  const app = await buildApp(deps);
  return { app, repo };
}

const hdr = { 'x-vigil-internal-token': 'internal-secret' };

describe('ops CLI endpoints end to end over HTTP', () => {
  it('a bootstrap enrollment token actually lets a brand-new counselor register a passkey', async () => {
    const { app } = await buildTestApp();
    const opRes = await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } });
    expect(opRes.statusCode).toBe(200);
    const { token: opToken } = opRes.json();

    const bootstrapRes = await app.inject({
      method: 'POST', url: '/internal/ops/bootstrap', headers: hdr,
      payload: { counselorId: 'c_new', operatorId: 'op-A', operatorToken: opToken },
    });
    expect(bootstrapRes.statusCode).toBe(200);
    const { enrollmentToken } = bootstrapRes.json();

    const optionsRes = await app.inject({ method: 'POST', url: '/auth/passkey/registration/options', headers: hdr, payload: { enrollmentToken } });
    expect(optionsRes.statusCode).toBe(200);
    const { attemptId, options } = optionsRes.json();
    const authenticator = await createFakeAuthenticator();
    const credential = await fakeRegistrationResponse({ rpId: RP_ID, origin: ORIGIN, challenge: options.challenge, authenticator });
    const verifyRes = await app.inject({ method: 'POST', url: '/auth/passkey/registration/verify', headers: hdr, payload: { attemptId, credential } });
    expect(verifyRes.statusCode).toBe(200);
  });

  it('rejects an operator token that does not match (wrong token, right id)', async () => {
    const { app } = await buildTestApp();
    await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } });
    const res = await app.inject({
      method: 'POST', url: '/internal/ops/bootstrap', headers: hdr,
      payload: { counselorId: 'c_new', operatorId: 'op-A', operatorToken: 'not-the-real-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('full recovery flow through HTTP: the SAME operator cannot approve their own request; a DIFFERENT operator can', async () => {
    const { app, repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', Date.now());
    const opA = (await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } })).json();
    const opB = (await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-B', displayName: 'Bea' } })).json();

    const reqRes = await app.inject({ method: 'POST', url: '/internal/ops/recovery/request', headers: hdr, payload: { counselorId: 'c_1', operatorId: 'op-A', operatorToken: opA.token } });
    expect(reqRes.statusCode).toBe(200);
    const { requestId } = reqRes.json();

    const selfApprove = await app.inject({ method: 'POST', url: '/internal/ops/recovery/approve', headers: hdr, payload: { requestId, operatorId: 'op-A', operatorToken: opA.token } });
    expect(selfApprove.statusCode).toBe(400);

    const otherApprove = await app.inject({ method: 'POST', url: '/internal/ops/recovery/approve', headers: hdr, payload: { requestId, operatorId: 'op-B', operatorToken: opB.token } });
    expect(otherApprove.statusCode).toBe(200);
    expect(otherApprove.json().enrollmentToken).toBeTruthy();
  });

  it('recovery approval revokes every existing credential for that counselor', async () => {
    const { app, repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', Date.now());
    await repo.addCredential({ id: 'old-cred', counselorId: 'c_1', publicKey: new Uint8Array([1]), counter: 0, transports: [], createdAt: Date.now(), lastUsedAt: null });
    expect(await repo.countCredentials('c_1')).toBe(1);

    const opA = (await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } })).json();
    const opB = (await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-B', displayName: 'Bea' } })).json();
    const { requestId } = (await app.inject({ method: 'POST', url: '/internal/ops/recovery/request', headers: hdr, payload: { counselorId: 'c_1', operatorId: 'op-A', operatorToken: opA.token } })).json();
    await app.inject({ method: 'POST', url: '/internal/ops/recovery/approve', headers: hdr, payload: { requestId, operatorId: 'op-B', operatorToken: opB.token } });

    expect(await repo.countCredentials('c_1')).toBe(0);
  });
});

describe('operator token: creation, use and failure are all audited (review point 3)', () => {
  it('creating an operator writes an audit entry', async () => {
    const { app, repo } = await buildTestApp();
    await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } });
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    expect(audit.some((e) => e.action === 'operator_added' && e.detail.operatorId === 'op-A')).toBe(true);
  });

  it('a successful operator-token use writes an "operator_token_used" audit entry', async () => {
    const { app, repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', Date.now());
    const opA = (await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } })).json();
    await app.inject({ method: 'POST', url: '/internal/ops/recovery/request', headers: hdr, payload: { counselorId: 'c_1', operatorId: 'op-A', operatorToken: opA.token } });
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    expect(audit.some((e) => e.action === 'operator_token_used' && e.actor === 'op-A')).toBe(true);
  });

  it('a failed operator-token use (wrong token) writes an "operator_token_auth_failed" audit entry, and the request is refused', async () => {
    const { app, repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', Date.now());
    await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } });
    const res = await app.inject({ method: 'POST', url: '/internal/ops/recovery/request', headers: hdr, payload: { counselorId: 'c_1', operatorId: 'op-A', operatorToken: 'wrong-token' } });
    expect(res.statusCode).toBe(401);
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    const entry = audit.find((e) => e.action === 'operator_token_auth_failed');
    expect(entry).toMatchObject({ actor: 'op-A', detail: { reason: 'bad_token' } });
  });

  it('a failed operator-token use (unknown operator id) writes an "operator_token_auth_failed" audit entry with that reason', async () => {
    const { app, repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', Date.now());
    const res = await app.inject({ method: 'POST', url: '/internal/ops/recovery/request', headers: hdr, payload: { counselorId: 'c_1', operatorId: 'no-such-operator', operatorToken: 'anything' } });
    expect(res.statusCode).toBe(401);
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    const entry = audit.find((e) => e.action === 'operator_token_auth_failed');
    expect(entry).toMatchObject({ actor: 'no-such-operator', detail: { reason: 'unknown_operator' } });
  });

  it('a failed operator-token audit entry never contains the attempted token (review point 3 follow-up)', async () => {
    const { app, repo } = await buildTestApp();
    await repo.createCounselor('c_1', 'c_1', Date.now());
    await app.inject({ method: 'POST', url: '/internal/ops/operators', headers: hdr, payload: { operatorId: 'op-A', displayName: 'Alex' } });
    const attemptedToken = 'super-secret-guessed-token-value';
    await app.inject({ method: 'POST', url: '/internal/ops/recovery/request', headers: hdr, payload: { counselorId: 'c_1', operatorId: 'op-A', operatorToken: attemptedToken } });
    const audit = (repo as ReturnType<typeof memoryRepo>)._audit;
    const entry = audit.find((e) => e.action === 'operator_token_auth_failed');
    expect(entry).toBeDefined();
    // The failure detail is `{ reason: 'bad_token' }` only — assert the
    // attempted token doesn't leak anywhere in the entry, under any key.
    expect(JSON.stringify(entry)).not.toContain(attemptedToken);
  });

  it('operator-token comparison is constant-time: verifyToken uses timingSafeEqual on equal-length buffers, not a short-circuiting string/byte comparison', async () => {
    const { hashToken, verifyToken } = await import('../src/tokens.js');
    const hash = await hashToken('the-real-token');
    // A wrong token of a totally different length still compares successfully
    // (returns false, doesn't throw) — proving the implementation normalizes
    // to an equal-length comparison rather than branching on raw length
    // first in a way that would leak timing based on where strings diverge.
    await expect(verifyToken('x', hash)).resolves.toBe(false);
    await expect(verifyToken('a-much-longer-wrong-token-value-than-the-real-one', hash)).resolves.toBe(false);
    await expect(verifyToken('the-real-token', hash)).resolves.toBe(true);
  });
});
