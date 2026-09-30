import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertOwnership, buildServer, createFieldCrypto, HttpError, parse, readSecret, requireIdentity } from '../src/index.js';

describe('field crypto (AES-256-GCM)', () => {
  const fc = createFieldCrypto(randomBytes(32).toString('base64'));

  it('round-trips unicode text and never emits plaintext', () => {
    const ct = fc.encrypt('मुझे डर लग रहा है', 'checkin:1');
    expect(ct.startsWith('v1.')).toBe(true);
    expect(ct).not.toContain('डर');
    expect(fc.decrypt(ct, 'checkin:1')).toBe('मुझे डर लग रहा है');
  });

  it('uses a fresh IV per value', () => {
    expect(fc.encrypt('same')).not.toBe(fc.encrypt('same'));
  });

  it('detects tampering and a wrong AAD binding', () => {
    const ct = fc.encrypt('secret', 'a');
    const parts = ct.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => fc.decrypt(parts.join('.'), 'a')).toThrow();
    expect(() => fc.decrypt(ct, 'b')).toThrow();
    expect(() => fc.decrypt('v0.x.y.z')).toThrow(/unrecognised/);
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => createFieldCrypto(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('readSecret', () => {
  it('falls back to env, and throws unless optional', () => {
    process.env.VIGIL_TEST_SECRET = 'shh';
    expect(readSecret('vigil_test_secret')).toBe('shh');
    delete process.env.VIGIL_TEST_SECRET;
    expect(readSecret('vigil_test_secret', { optional: true })).toBeUndefined();
    expect(() => readSecret('vigil_test_secret')).toThrow(/not found/);
  });
});

describe('buildServer', () => {
  function app() {
    const a = buildServer({ name: 'test', internalToken: 'tok', logLevel: 'silent' });
    a.get('/who', async (req) => requireIdentity(req, 'counselor'));
    a.post('/parse', async (req) => parse(z.object({ n: z.number() }), req.body));
    a.get('/boom', async () => {
      throw new Error('kaboom with secret text');
    });
    a.get('/teapot', async () => {
      throw new HttpError(418, 'teapot', 'short and stout');
    });
    return a;
  }

  it('serves health without the internal token', async () => {
    const res = await app().inject('/healthz');
    expect(res.statusCode).toBe(200);
  });

  it('rejects requests that did not come through the gateway', async () => {
    const res = await app().inject({ url: '/who', headers: { 'x-vigil-internal-token': 'wrong' } });
    expect(res.statusCode).toBe(401);
    expect((await app().inject('/who')).statusCode).toBe(401);
  });

  it('parses identity headers and enforces scope', async () => {
    const ok = await app().inject({
      url: '/who',
      headers: { 'x-vigil-internal-token': 'tok', 'x-vigil-subject': 'c_1', 'x-vigil-scope': 'counselor' },
    });
    expect(ok.json()).toEqual({ subject: 'c_1', scope: 'counselor' });
    const wrongScope = await app().inject({
      url: '/who',
      headers: { 'x-vigil-internal-token': 'tok', 'x-vigil-subject': 'v_1', 'x-vigil-scope': 'victim' },
    });
    expect(wrongScope.statusCode).toBe(403);
    const bogusScope = await app().inject({
      url: '/who',
      headers: { 'x-vigil-internal-token': 'tok', 'x-vigil-subject': 'x', 'x-vigil-scope': 'root' },
    });
    expect(bogusScope.statusCode).toBe(401);
  });

  it('maps Zod errors to 400 and hides internal errors', async () => {
    const bad = await app().inject({ method: 'POST', url: '/parse', payload: { n: 'x' }, headers: { 'x-vigil-internal-token': 'tok' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('invalid_request');
    const boom = await app().inject({ url: '/boom', headers: { 'x-vigil-internal-token': 'tok' } });
    expect(boom.statusCode).toBe(500);
    expect(boom.body).not.toContain('secret text');
    const tea = await app().inject({ url: '/teapot', headers: { 'x-vigil-internal-token': 'tok' } });
    expect(tea.statusCode).toBe(418);
  });

  it('propagates x-request-id', async () => {
    const res = await app().inject({ url: '/healthz', headers: { 'x-request-id': 'req-123' } });
    expect(res.headers['x-request-id']).toBe('req-123');
  });
});

describe('assertOwnership', () => {
  it('lets a victim touch only their own records', () => {
    expect(() => assertOwnership({ subject: 'v_a', scope: 'victim' }, 'v_a')).not.toThrow();
    expect(() => assertOwnership({ subject: 'v_a', scope: 'victim' }, 'v_b')).toThrow(HttpError);
    expect(() => assertOwnership({ subject: 'c_1', scope: 'counselor' }, 'v_b')).not.toThrow();
  });
});

describe('JSON body parsing', () => {
  it('accepts an empty body with a JSON content-type, and 400s malformed JSON', async () => {
    const a = buildServer({ name: 't', logLevel: 'silent' });
    a.post('/act', async (req) => ({ body: req.body ?? null }));
    const empty = await a.inject({ method: 'POST', url: '/act', headers: { 'content-type': 'application/json' } });
    expect(empty.json()).toEqual({ body: null });
    const bad = await a.inject({ method: 'POST', url: '/act', headers: { 'content-type': 'application/json' }, payload: '{nope' });
    expect(bad.statusCode).toBe(400);
  });
});
