import { exportPKCS8, exportSPKI, generateKeyPair, importSPKI, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildIdp } from '../src/app.js';

describe('dev-idp', () => {
  it('issues verifiable RS256 tokens with the production claim shape', async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    const app = await buildIdp({ privateKeyPem: await exportPKCS8(kp.privateKey), issuer: 'iss', audience: 'aud', enabled: true, logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'counselor' } });
    expect(res.statusCode).toBe(200);
    const { payload } = await jwtVerify(res.json().access_token, await importSPKI(await exportSPKI(kp.publicKey), 'RS256'), { issuer: 'iss', audience: 'aud' });
    expect(payload).toMatchObject({ sub: 'c_demo_01', scope: 'counselor' });
  });

  it('refuses to serve unless explicitly enabled', async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    const app = await buildIdp({ privateKeyPem: await exportPKCS8(kp.privateKey), issuer: 'i', audience: 'a', enabled: false, logLevel: 'silent' });
    expect((await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'admin' } })).statusCode).toBe(404);
  });

  it('validates role and victim subject format', async () => {
    const kp = await generateKeyPair('RS256', { extractable: true });
    const app = await buildIdp({ privateKeyPem: await exportPKCS8(kp.privateKey), issuer: 'i', audience: 'a', enabled: true, logLevel: 'silent' });
    expect((await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'root' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/auth/dev-token', payload: { role: 'victim', subject: 'v_x' } })).statusCode).toBe(400);
  });
});
