import Fastify, { type FastifyInstance } from 'fastify';
import { exportSPKI, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGateway } from '../src/app.js';

const ISS = 'https://idp.test';
const AUD = 'vigil-api';
let privateKey: CryptoKey;
let upstream: FastifyInstance;
let gw: FastifyInstance;

async function token(scope: string, sub = 'subject-1', opts: { iss?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(sub)
    .setIssuer(opts.iss ?? ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  // Echo upstream: reports what the gateway forwarded.
  upstream = Fastify();
  upstream.all('/*', async (req) => ({ url: req.url, headers: req.headers }));
  await upstream.listen({ port: 0, host: '127.0.0.1' });
  const addr = upstream.server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}`;
  gw = await buildGateway({
    jwtPublicKeyPem: await exportSPKI(kp.publicKey),
    issuer: ISS,
    audience: AUD,
    internalToken: 'internal-secret',
    upstreams: Object.fromEntries(
      ['checkin-service', 'distress-trend-service', 'alert-service', 'reminder-service', 'case-integration-service', 'counselor-identity-service'].map((s) => [s, base]),
    ),
    rateLimit: { max: 1000, timeWindow: '1 minute' },
    logLevel: 'silent',
  });
});

const ALL_UPSTREAMS = ['checkin-service', 'distress-trend-service', 'alert-service', 'reminder-service', 'case-integration-service', 'counselor-identity-service'];

afterAll(async () => {
  await gw.close();
  await upstream.close();
});

const get = async (url: string, bearer?: string, headers: Record<string, string> = {}) =>
  gw.inject({ url, headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers } });

describe('authentication', () => {
  it('requires a bearer token', async () => {
    expect((await get('/v1/alerts')).statusCode).toBe(401);
  });

  it('rejects wrong issuer, expired and foreign-signed tokens', async () => {
    expect((await get('/v1/alerts', await token('counselor', 's', { iss: 'https://evil' }))).statusCode).toBe(401);
    expect((await get('/v1/alerts', await token('counselor', 's', { exp: '-1m' }))).statusCode).toBe(401);
    const foreign = (await generateKeyPair('RS256')).privateKey;
    expect((await get('/v1/alerts', await token('counselor', 's', { key: foreign }))).statusCode).toBe(401);
    expect((await get('/v1/alerts', await token('superuser'))).statusCode).toBe(401);
  });
});

describe('RBAC from the contract', () => {
  it('forwards an allowed call with identity + internal token, stripping the bearer', async () => {
    const res = await get('/v1/alerts?status=open', await token('counselor', 'c_demo_01'));
    expect(res.statusCode).toBe(200);
    const { url, headers } = res.json();
    expect(url).toBe('/v1/alerts?status=open');
    expect(headers).toMatchObject({ 'x-vigil-subject': 'c_demo_01', 'x-vigil-scope': 'counselor', 'x-vigil-internal-token': 'internal-secret' });
    expect(headers.authorization).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refuses scopes the contract does not grant', async () => {
    expect((await get('/v1/alerts', await token('victim', 'v_demo_0001'))).statusCode).toBe(403);
    expect((await get('/v1/victims/v_demo_0001/trend', await token('admin'))).statusCode).toBe(403);
  });

  it('never trusts client-supplied identity headers', async () => {
    const res = await get('/v1/reminders?victimId=v_demo_0001', await token('victim', 'v_demo_0001'), {
      'x-vigil-scope': 'counselor', 'x-vigil-subject': 'c_evil', 'x-vigil-internal-token': 'guess',
    });
    expect(res.json().headers).toMatchObject({ 'x-vigil-scope': 'victim', 'x-vigil-subject': 'v_demo_0001', 'x-vigil-internal-token': 'internal-secret' });
  });

  it('404s routes outside the contract', async () => {
    expect((await get('/v1/everything', await token('counselor'))).statusCode).toBe(404);
  });
});

describe('/v1/admin/* namespace', () => {
  it('is rejected at the gateway for counselor tokens — including paths that do not exist', async () => {
    const c = await token('counselor');
    expect((await get('/v1/admin/rollups?region=pune', c)).statusCode).toBe(403);
    expect((await get('/v1/admin/secret-thing', c)).statusCode).toBe(403);
    expect((await get('/v1/admin/rollups?region=pune')).statusCode).toBe(401);
  });

  it('is forwarded for admin tokens', async () => {
    const res = await get('/v1/admin/rollups?region=pune', await token('admin', 'a_1'));
    expect(res.statusCode).toBe(200);
    expect(res.json().headers['x-vigil-scope']).toBe('admin');
  });
});

describe('rate limiting', () => {
  it('returns 429 once the per-token budget is spent', async () => {
    const limited = await buildGateway({
      jwtPublicKeyPem: await exportSPKI((await generateKeyPair('RS256')).publicKey),
      issuer: ISS, audience: AUD, internalToken: 'x',
      upstreams: Object.fromEntries(ALL_UPSTREAMS.map((s) => [s, 'http://127.0.0.1:1'])),
      rateLimit: { max: 2, timeWindow: '1 minute' }, logLevel: 'silent',
    });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await limited.inject({ url: '/v1/alerts' })).statusCode);
    expect(codes).toEqual([401, 401, 429]);
    await limited.close();
  });
});

// A production-shaped base: X-Forwarded-For arrives already carrying the
// real client (as Caddy would set it) followed by one more hop address (as
// the PWA's own proxy appends, post-fix) — gw.inject's `remoteAddress`
// simulates the socket address the gateway itself sees (the PWA container).
describe('trustProxy resolves the real client through the proxy chain', () => {
  const buildWithIdentity = async (rateLimitMax: number) => {
    const kp = await generateKeyPair('RS256');
    return buildGateway({
      jwtPublicKeyPem: await exportSPKI(kp.publicKey),
      issuer: ISS, audience: AUD, internalToken: 'x',
      upstreams: Object.fromEntries(ALL_UPSTREAMS.map((s) => [s, 'http://127.0.0.1:1'])),
      counselorIdentityUrl: 'http://127.0.0.1:1',
      rateLimit: { max: rateLimitMax, timeWindow: '1 minute' },
      logLevel: 'silent',
    });
  };

  it('two different real clients behind the same immediate proxy hop get independent rate-limit budgets', async () => {
    const gw2 = await buildWithIdentity(1);
    const req = (clientIp: string) =>
      gw2.inject({
        method: 'POST',
        url: '/auth/passkey/login/options',
        remoteAddress: '172.18.0.5', // the PWA container's address, as the gateway sees it
        headers: { 'x-forwarded-for': `${clientIp}, 172.18.0.5` },
      });
    // Each client's FIRST request should not be rate-limited by the other's.
    expect((await req('203.0.113.10')).statusCode).not.toBe(429);
    expect((await req('203.0.113.11')).statusCode).not.toBe(429);
    // The SAME client's second request, within the same window, now is.
    expect((await req('203.0.113.10')).statusCode).toBe(429);
    await gw2.close();
  });

  it('without the fix, overwriting X-Forwarded-For would have bucketed every client together — this proves that regression cannot happen', async () => {
    const gw2 = await buildWithIdentity(1);
    // Same immediate peer, but each call's X-Forwarded-For already has a
    // DIFFERENT leftmost (real-client) entry appended with a comma, exactly
    // as apps/pwa/server/main.js now produces it.
    const first = await gw2.inject({
      method: 'POST', url: '/auth/passkey/login/options', remoteAddress: '172.18.0.5',
      headers: { 'x-forwarded-for': '198.51.100.1, 172.18.0.5' },
    });
    const second = await gw2.inject({
      method: 'POST', url: '/auth/passkey/login/options', remoteAddress: '172.18.0.5',
      headers: { 'x-forwarded-for': '198.51.100.2, 172.18.0.5' },
    });
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).not.toBe(429);
    await gw2.close();
  });
});

describe('dev-idp boot check fails closed (not just on NODE_ENV=production specifically)', () => {
  const base = {
    jwtPublicKeyPem: '', issuer: ISS, audience: AUD, internalToken: 'x',
    upstreams: Object.fromEntries(ALL_UPSTREAMS.map((s) => [s, 'http://127.0.0.1:1'])),
  };

  it('boots fine with devIdpUrl unset, regardless of NODE_ENV', async () => {
    const kp = await generateKeyPair('RS256');
    const app = await buildGateway({ ...base, jwtPublicKeyPem: await exportSPKI(kp.publicKey), nodeEnv: undefined, logLevel: 'silent' });
    await app.close();
  });

  it.each(['development', 'test'])('boots with devIdpUrl set when NODE_ENV=%s', async (nodeEnv) => {
    const kp = await generateKeyPair('RS256');
    const app = await buildGateway({
      ...base, jwtPublicKeyPem: await exportSPKI(kp.publicKey), devIdpUrl: 'http://dev-idp:3000', nodeEnv, logLevel: 'silent',
    });
    await app.close();
  });

  it.each(['production', 'staging', undefined, ''])('refuses to build with devIdpUrl set when NODE_ENV=%s', async (nodeEnv) => {
    const kp = await generateKeyPair('RS256');
    await expect(
      buildGateway({ ...base, jwtPublicKeyPem: await exportSPKI(kp.publicKey), devIdpUrl: 'http://dev-idp:3000', nodeEnv, logLevel: 'silent' }),
    ).rejects.toThrow(/Refusing to start/);
  });
});
