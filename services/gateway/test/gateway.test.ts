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

  it('never trusts client-supplied identity headers, including a spoofed x-vigil-client-ip', async () => {
    const res = await get('/v1/reminders?victimId=v_demo_0001', await token('victim', 'v_demo_0001'), {
      'x-vigil-scope': 'counselor', 'x-vigil-subject': 'c_evil', 'x-vigil-internal-token': 'guess', 'x-vigil-client-ip': '9.9.9.9',
    });
    expect(res.json().headers).toMatchObject({ 'x-vigil-scope': 'victim', 'x-vigil-subject': 'v_demo_0001', 'x-vigil-internal-token': 'internal-secret' });
    expect(res.json().headers['x-vigil-client-ip']).not.toBe('9.9.9.9');
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
// simulates the socket address the gateway itself sees. TRUSTED_HOP is the
// one address this suite configures as a known proxy — anything else
// hitting the gateway directly must NOT have its X-Forwarded-For honored.
const TRUSTED_HOP = '172.28.0.10'; // stands in for the PWA's pinned container address
describe('trustProxy trusts ONLY the configured exact hop(s) — never every hop (review point 1)', () => {
  const buildWithIdentity = async (rateLimitMax: number, trustedProxies: string[] | undefined = [TRUSTED_HOP]) => {
    const kp = await generateKeyPair('RS256');
    const identityUpstream = Fastify();
    identityUpstream.post('/*', async (req) => ({ url: req.url, headers: req.headers }));
    await identityUpstream.listen({ port: 0, host: '127.0.0.1' });
    const idAddr = identityUpstream.server.address() as { port: number };
    const gwInstance = await buildGateway({
      jwtPublicKeyPem: await exportSPKI(kp.publicKey),
      issuer: ISS, audience: AUD, internalToken: 'x',
      upstreams: Object.fromEntries(ALL_UPSTREAMS.map((s) => [s, 'http://127.0.0.1:1'])),
      counselorIdentityUrl: `http://127.0.0.1:${idAddr.port}`,
      trustedProxies,
      rateLimit: { max: rateLimitMax, timeWindow: '1 minute' },
      logLevel: 'silent',
    });
    return { gw: gwInstance, identityUpstream };
  };

  it('through the TRUSTED hop, the real client in X-Forwarded-For is resolved — distinct clients get independent rate-limit budgets', async () => {
    const { gw: gw2, identityUpstream } = await buildWithIdentity(1);
    const req = (clientIp: string) =>
      gw2.inject({
        method: 'POST', url: '/auth/passkey/login/options', remoteAddress: TRUSTED_HOP,
        headers: { 'x-forwarded-for': `${clientIp}, ${TRUSTED_HOP}` },
      });
    expect((await req('203.0.113.10')).statusCode).not.toBe(429);
    expect((await req('203.0.113.11')).statusCode).not.toBe(429);
    expect((await req('203.0.113.10')).statusCode).toBe(429); // same client, second hit in window
    await gw2.close();
    await identityUpstream.close();
  });

  it('a client that reaches the gateway DIRECTLY (not through the trusted hop) cannot forge X-Forwarded-For — the real socket address is forwarded downstream as x-vigil-client-ip instead', async () => {
    const { gw: gw2, identityUpstream } = await buildWithIdentity(1);
    const attackerRealAddress = '198.51.100.99'; // NOT the trusted hop
    const res = await gw2.inject({
      method: 'POST', url: '/auth/passkey/login/options', remoteAddress: attackerRealAddress,
      headers: { 'x-forwarded-for': '1.2.3.4' }, // forged — must be ignored entirely
    });
    expect(res.statusCode).not.toBe(429);
    expect(res.json().headers['x-vigil-client-ip']).toBe(attackerRealAddress);
    await gw2.close();
    await identityUpstream.close();
  });

  it('two different forged X-Forwarded-For values from the SAME direct (untrusted) attacker address are correctly bucketed TOGETHER — forging the header cannot evade the limiter', async () => {
    const { gw: gw2, identityUpstream } = await buildWithIdentity(1);
    const attackerRealAddress = '198.51.100.50';
    const first = await gw2.inject({ method: 'POST', url: '/auth/passkey/login/options', remoteAddress: attackerRealAddress, headers: { 'x-forwarded-for': '9.9.9.9' } });
    const second = await gw2.inject({ method: 'POST', url: '/auth/passkey/login/options', remoteAddress: attackerRealAddress, headers: { 'x-forwarded-for': '8.8.8.8' } });
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).toBe(429); // same real address despite different forged headers
    await gw2.close();
    await identityUpstream.close();
  });

  it('the gateway forwards its OWN resolved address as x-vigil-client-ip downstream — a client cannot set this header itself', async () => {
    const { gw: gw2, identityUpstream } = await buildWithIdentity(1000);
    const res = await gw2.inject({
      method: 'POST', url: '/auth/passkey/login/options', remoteAddress: TRUSTED_HOP,
      headers: { 'x-forwarded-for': `203.0.113.77, ${TRUSTED_HOP}`, 'x-vigil-client-ip': 'spoofed-value' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().headers['x-vigil-client-ip']).toBe('203.0.113.77');
    await gw2.close();
    await identityUpstream.close();
  });

  it('with no trusted proxies configured, req.ip is always the raw socket address (safe default)', async () => {
    const { gw: gw2, identityUpstream } = await buildWithIdentity(1000, []);
    const res = await gw2.inject({
      method: 'POST', url: '/auth/passkey/login/options', remoteAddress: TRUSTED_HOP,
      headers: { 'x-forwarded-for': '203.0.113.1' },
    });
    expect(res.json().headers['x-vigil-client-ip']).toBe(TRUSTED_HOP); // XFF ignored entirely
    await gw2.close();
    await identityUpstream.close();
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
