import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildIdp } from '../src/app.js';

describe('dev-idp', () => {
  it('issues verifiable RS256 tokens with the production claim shape', async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    const app = await buildIdp({ privateKeyPem: await exportPKCS8(kp.privateKey), issuer: 'iss', audience: 'aud', enabled: true, nodeEnv: 'test', logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'counselor' } });
    expect(res.statusCode).toBe(200);
    const { payload } = await jwtVerify(res.json().access_token, await importSPKI(await exportSPKI(kp.publicKey), 'RS256'), { issuer: 'iss', audience: 'aud' });
    expect(payload).toMatchObject({ sub: 'c_demo_01', scope: 'counselor' });
  });

  it('validates role and victim subject format', async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    const app = await buildIdp({ privateKeyPem: await exportPKCS8(kp.privateKey), issuer: 'i', audience: 'a', enabled: true, nodeEnv: 'test', logLevel: 'silent' });
    expect((await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'root' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'victim', subject: 'v_x' } })).statusCode).toBe(400);
  });

  describe('boot check fails closed (change 3: not just NODE_ENV=production specifically)', () => {
    const opts = (enabled: boolean, nodeEnv: string | undefined) => ({
      privateKeyPem: '', issuer: 'i', audience: 'a', enabled, nodeEnv, logLevel: 'silent' as const,
    });
    // privateKeyPem is never parsed when the boot check rejects first.
    it.each(['development', 'test'])('boots when enabled and NODE_ENV=%s', async (nodeEnv) => {
      const kp = await generateKeyPair('RS256', { extractable: true });
      const app = await buildIdp({ ...opts(true, nodeEnv), privateKeyPem: await exportPKCS8(kp.privateKey) });
      await app.close();
    });

    it.each(['production', 'staging', undefined, ''])('refuses to boot when enabled but NODE_ENV=%s', async (nodeEnv) => {
      await expect(buildIdp(opts(true, nodeEnv))).rejects.toThrow(/Refusing to start dev-idp/);
    });

    it.each(['development', 'test', 'production', undefined])('refuses to boot when not enabled, regardless of NODE_ENV=%s', async (nodeEnv) => {
      await expect(buildIdp(opts(false, nodeEnv))).rejects.toThrow(/Refusing to start dev-idp/);
    });
  });
});
