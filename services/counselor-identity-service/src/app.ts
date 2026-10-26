import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { buildServer, HttpError, notFound, parse, requireIdentity, type FastifyInstance } from '@vigil/service-kit';
import { importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey, type KeyObject } from 'jose';
import { z } from 'zod';
import { counterDecreased } from './counter.js';
import type { IdentityRepo } from './db.js';
import { SlidingWindowThrottle } from './rate-limit.js';
import { generateToken, hashToken, newId, verifyToken } from './tokens.js';

export interface AppDeps {
  repo: IdentityRepo;
  privateKeyPem: string;
  publicKeyPem: string;
  issuer: string;
  audience: string;
  rpID: string;
  origin: string;
  internalToken?: string;
  now?: () => number;
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
}

/**
 * The gateway resolves the real client address (via its own, narrowly-
 * scoped trustProxy) and forwards it as x-vigil-client-ip — never a header
 * this service reads directly off the client, since this service's only
 * caller is the gateway itself. Falling back to req.ip only matters for
 * tests/direct local runs with no gateway in front. See
 * docs/design/counselor-passkey-login.md §5 (review point 1).
 */
function clientIp(req: { headers: Record<string, unknown>; ip: string }): string {
  const header = req.headers['x-vigil-client-ip'];
  return typeof header === 'string' && header.length > 0 ? header : req.ip;
}

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const JWT_TTL = '15m';
const LOGIN_PER_IP = new SlidingWindowThrottle(20, 60_000);
const LOGIN_PER_CREDENTIAL = new SlidingWindowThrottle(5, 60_000);

const RegistrationOptionsBody = z.strictObject({ enrollmentToken: z.string().min(16).optional() });
const RegistrationVerifyBody = z.strictObject({ attemptId: z.string(), credential: z.looseObject({}) });
const LoginVerifyBody = z.strictObject({ attemptId: z.string(), credential: z.looseObject({}) });

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const privateKey: CryptoKey | KeyObject = await importPKCS8(deps.privateKeyPem, 'RS256');
  const publicKey: CryptoKey | KeyObject = await importSPKI(deps.publicKeyPem, 'RS256');
  const { repo } = deps;

  const app = buildServer({
    name: 'counselor-identity-service',
    internalToken: deps.internalToken,
    logLevel: deps.logLevel,
    onUnhandledError: deps.onUnhandledError,
    ready: () => repo.ping(),
  });

  /** Resolves who registration is for: a logged-in counselor adding a 2nd key, or an enrollment token. Exactly one must work. */
  async function resolveRegistrationSubject(req: { headers: Record<string, unknown> }, enrollmentToken: string | undefined): Promise<string> {
    const auth = req.headers.authorization as string | undefined;
    if (auth?.startsWith('Bearer ')) {
      try {
        const { payload } = await jwtVerify(auth.slice(7), publicKey, { issuer: deps.issuer, audience: deps.audience, algorithms: ['RS256'] });
        if (payload.scope === 'counselor' && typeof payload.sub === 'string') return payload.sub;
      } catch {
        // falls through to enrollment-token path
      }
    }
    if (enrollmentToken) {
      const candidates = await repo.consumeEnrollmentTokenCandidates(now());
      for (const t of candidates) {
        if (await verifyToken(enrollmentToken, t.tokenHash)) {
          const marked = await repo.markEnrollmentTokenUsed(t.id, now());
          if (!marked) continue; // raced with another consumer
          await repo.audit({ action: 'enrollment_token_used', actor: t.counselorId, targetCounselorId: t.counselorId, detail: { tokenId: t.id, tokenType: t.type }, at: now() });
          return t.counselorId;
        }
      }
    }
    throw new HttpError(401, 'unauthorized', 'No valid session or enrollment token');
  }

  app.post('/auth/passkey/registration/options', async (req) => {
    const { enrollmentToken } = parse(RegistrationOptionsBody, req.body ?? {});
    const counselorId = await resolveRegistrationSubject(req, enrollmentToken);
    const existing = await repo.listCredentials(counselorId);
    const options = await generateRegistrationOptions({
      rpName: 'VIGIL',
      rpID: deps.rpID,
      userName: counselorId,
      userDisplayName: counselorId,
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports as never[] })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const attemptId = newId();
    await repo.createChallenge({ attemptId, type: 'register', counselorId, challenge: options.challenge, expiresAt: now() + CHALLENGE_TTL_MS });
    return { attemptId, options };
  });

  app.post('/auth/passkey/registration/verify', async (req) => {
    const { attemptId, credential } = parse(RegistrationVerifyBody, req.body);
    const challenge = await repo.consumeChallenge(attemptId, now());
    if (!challenge || challenge.type !== 'register' || !challenge.counselorId) {
      throw new HttpError(401, 'unauthorized', 'This registration attempt has expired or was already used');
    }
    const verification = await verifyRegistrationResponse({
      response: credential as unknown as Parameters<typeof verifyRegistrationResponse>[0]['response'],
      expectedChallenge: challenge.challenge,
      expectedOrigin: deps.origin,
      expectedRPID: deps.rpID,
    });
    if (!verification.verified) throw new HttpError(401, 'unauthorized', 'Could not verify this passkey');
    const { credential: cred } = verification.registrationInfo;
    await repo.createCounselor(challenge.counselorId, challenge.counselorId, now());
    await repo.addCredential({
      id: cred.id, counselorId: challenge.counselorId, publicKey: cred.publicKey, counter: cred.counter,
      transports: cred.transports ?? [], createdAt: now(), lastUsedAt: null,
    });
    await repo.audit({ action: 'passkey_registered', actor: challenge.counselorId, targetCounselorId: challenge.counselorId, detail: { credentialId: cred.id }, at: now() });
    req.log.info({ counselorId: challenge.counselorId }, 'passkey registered');
    return { credentialId: cred.id };
  });

  app.post('/auth/passkey/login/options', async () => {
    const options = await generateAuthenticationOptions({ rpID: deps.rpID, userVerification: 'required' });
    const attemptId = newId();
    await repo.createChallenge({ attemptId, type: 'login', counselorId: null, challenge: options.challenge, expiresAt: now() + CHALLENGE_TTL_MS });
    return { attemptId, options };
  });

  app.post('/auth/passkey/login/verify', async (req) => {
    if (!LOGIN_PER_IP.allow(clientIp(req), now())) throw new HttpError(429, 'rate_limited', 'Too many attempts; please wait a moment and try again');
    const { attemptId, credential } = parse(LoginVerifyBody, req.body);
    const challenge = await repo.consumeChallenge(attemptId, now());
    // Every failure below collapses to the same generic 401 — usernameless
    // login means there's no "no such account" branch to leak through
    // response shape or timing. See docs/design/counselor-passkey-login.md §5.
    const fail = () => new HttpError(401, 'unauthorized', 'Could not sign you in with that passkey');
    if (!challenge || challenge.type !== 'login') throw fail();

    const credentialId = (credential as { id?: unknown }).id;
    if (typeof credentialId !== 'string') throw fail();
    if (!LOGIN_PER_CREDENTIAL.allow(credentialId, now())) throw new HttpError(429, 'rate_limited', 'Too many attempts; please wait a moment and try again');

    const ip = clientIp(req);
    const stored = await repo.getCredential(credentialId);
    if (!stored) {
      await repo.audit({ action: 'login_failed', actor: 'unknown', targetCounselorId: null, detail: { reason: 'unknown_credential', clientIp: ip }, at: now() });
      throw fail();
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential as unknown as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
        expectedChallenge: challenge.challenge,
        expectedOrigin: deps.origin,
        expectedRPID: deps.rpID,
        // Pinned to 0 so the library's own hard replay-rejection never fires;
        // our own softer counterDecreased() check runs after verification
        // instead. See docs/design/counselor-passkey-login.md §3 (change 4).
        credential: { id: stored.id, publicKey: Uint8Array.from(stored.publicKey), counter: 0, transports: stored.transports as never[] },
      });
    } catch {
      await repo.audit({ action: 'login_failed', actor: stored.counselorId, targetCounselorId: stored.counselorId, detail: { reason: 'verify_threw', clientIp: ip }, at: now() });
      throw fail();
    }
    if (!verification.verified) {
      await repo.audit({ action: 'login_failed', actor: stored.counselorId, targetCounselorId: stored.counselorId, detail: { reason: 'bad_signature', clientIp: ip }, at: now() });
      throw fail();
    }

    const newCounter = verification.authenticationInfo.newCounter;
    if (counterDecreased(stored.counter, newCounter)) {
      await repo.audit({ action: 'counter_decreased', actor: stored.counselorId, targetCounselorId: stored.counselorId, detail: { credentialId: stored.id, previous: stored.counter, incoming: newCounter, clientIp: ip }, at: now() });
      req.log.warn({ counselorId: stored.counselorId, credentialId: stored.id }, 'passkey sign-count decreased — advisory only, login allowed');
    }
    await repo.updateCounter(stored.id, newCounter, now());
    await repo.audit({ action: 'login_succeeded', actor: stored.counselorId, targetCounselorId: stored.counselorId, detail: { credentialId: stored.id, clientIp: ip }, at: now() });

    const token = await new SignJWT({ scope: 'counselor' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject(stored.counselorId)
      .setIssuer(deps.issuer)
      .setAudience(deps.audience)
      .setIssuedAt()
      .setExpirationTime(JWT_TTL)
      .sign(privateKey);
    req.log.info({ counselorId: stored.counselorId }, 'counselor login');
    return { access_token: token, token_type: 'Bearer', scope: 'counselor', sub: stored.counselorId, expires_in: JWT_TTL };
  });

  // Behind the gateway's normal auth (x-vigil-subject/x-vigil-scope) — not hand-wired.
  app.get('/v1/counselor/passkeys', async (req) => {
    const who = requireIdentity(req, 'counselor');
    const creds = await repo.listCredentials(who.subject);
    return { passkeys: creds.map((c) => ({ id: c.id, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt })) };
  });

  app.delete('/v1/counselor/passkeys/:id', async (req) => {
    const who = requireIdentity(req, 'counselor');
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const count = await repo.countCredentials(who.subject);
    if (count <= 1) throw new HttpError(400, 'invalid_request', 'Cannot remove your last passkey — register a second one first');
    const removed = await repo.removeCredential(id, who.subject);
    if (!removed) throw notFound('Passkey');
    await repo.audit({ action: 'passkey_removed', actor: who.subject, targetCounselorId: who.subject, detail: { credentialId: id }, at: now() });
    return { removed: true };
  });

  // Internal: ops CLI operations call through here rather than touching the DB directly.
  app.post('/internal/ops/operators', async (req) => {
    const body = parse(z.strictObject({ operatorId: z.string().min(2), displayName: z.string().min(1) }), req.body);
    const token = generateToken();
    const tokenHash = await hashToken(token);
    await repo.addOperator({ operatorId: body.operatorId, displayName: body.displayName, tokenHash, disabledAt: null }, now());
    await repo.audit({ action: 'operator_added', actor: 'ops-cli', targetCounselorId: null, detail: { operatorId: body.operatorId }, at: now() });
    return { operatorId: body.operatorId, token };
  });

  /**
   * Every call is written to the audit log — success ("use") and failure —
   * regardless of which ops endpoint called it. verifyToken() compares the
   * derived scrypt hash with node:crypto's timingSafeEqual, constant-time
   * for equal-length buffers (the hash format pins the derived length to
   * the stored hash's own length, so this is always an equal-length
   * comparison). See docs/design/counselor-passkey-login.md §5 (review
   * point 3).
   */
  async function authenticateOperator(operatorId: string, token: string): Promise<void> {
    const op = await repo.getOperator(operatorId);
    const ok = !!op && op.disabledAt === null && (await verifyToken(token, op.tokenHash));
    await repo.audit({
      action: ok ? 'operator_token_used' : 'operator_token_auth_failed',
      actor: operatorId,
      targetCounselorId: null,
      detail: ok ? {} : { reason: !op ? 'unknown_operator' : op.disabledAt !== null ? 'operator_disabled' : 'bad_token' },
      at: now(),
    });
    if (!ok) throw new HttpError(401, 'unauthorized', 'Invalid operator credentials');
  }

  app.post('/internal/ops/recovery/request', async (req) => {
    const body = parse(z.strictObject({ counselorId: z.string(), operatorId: z.string(), operatorToken: z.string() }), req.body);
    await authenticateOperator(body.operatorId, body.operatorToken);
    const exists = await repo.counselorExists(body.counselorId);
    if (!exists) throw notFound('Counselor');
    const requestId = newId();
    await repo.createRecoveryRequest(requestId, body.counselorId, body.operatorId, now());
    return { requestId };
  });

  app.post('/internal/ops/recovery/approve', async (req) => {
    const body = parse(z.strictObject({ requestId: z.string(), operatorId: z.string(), operatorToken: z.string() }), req.body);
    await authenticateOperator(body.operatorId, body.operatorToken);
    const approved = await repo.approveRecoveryRequest(body.requestId, body.operatorId);
    if (!approved) throw new HttpError(400, 'invalid_request', 'Request not found, already approved, or approved by the same operator that requested it');
    const request = await repo.getRecoveryRequest(body.requestId);
    if (!request) throw notFound('Recovery request');
    const token = generateToken();
    const tokenHash = await hashToken(token);
    await repo.createEnrollmentToken(
      { id: newId(), type: 'recovery', counselorId: request.counselorId, tokenHash, expiresAt: now() + 24 * 60 * 60 * 1000 },
      body.operatorId, now(),
    );
    await repo.revokeAllCredentials(request.counselorId);
    await repo.audit({ action: 'recovery_approved_credentials_revoked', actor: body.operatorId, targetCounselorId: request.counselorId, detail: { requestId: body.requestId }, at: now() });
    return { enrollmentToken: token };
  });

  app.post('/internal/ops/bootstrap', async (req) => {
    const body = parse(z.strictObject({ counselorId: z.string(), operatorId: z.string(), operatorToken: z.string() }), req.body);
    await authenticateOperator(body.operatorId, body.operatorToken);
    await repo.createCounselor(body.counselorId, body.counselorId, now());
    const token = generateToken();
    const tokenHash = await hashToken(token);
    await repo.createEnrollmentToken(
      { id: newId(), type: 'bootstrap', counselorId: body.counselorId, tokenHash, expiresAt: now() + 24 * 60 * 60 * 1000 },
      body.operatorId, now(),
    );
    return { enrollmentToken: token };
  });

  return app;
}
