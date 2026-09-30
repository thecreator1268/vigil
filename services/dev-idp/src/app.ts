/**
 * DEVELOPMENT-ONLY identity provider. Stands in for the real OAuth2/OIDC
 * provider so the system can be exercised end-to-end locally. It issues RS256
 * tokens with the same claims the production IdP must issue (iss, aud, sub,
 * scope, exp). It is excluded from the production compose profile and the
 * Kubernetes manifests, and refuses to serve unless DEV_IDP_ENABLED=true.
 */
import { buildServer, HttpError, parse, type FastifyInstance } from '@vigil/service-kit';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';

export interface IdpOptions {
  privateKeyPem: string;
  issuer: string;
  audience: string;
  enabled: boolean;
  logLevel?: string;
}

const DEFAULT_SUBJECT = { victim: 'v_demo_0001', counselor: 'c_demo_01', admin: 'a_demo_01' } as const;
const TTL = { victim: '30d', counselor: '8h', admin: '8h' } as const;

const Body = z.strictObject({
  role: z.enum(['victim', 'counselor', 'admin']),
  subject: z.string().regex(/^[a-z]_[A-Za-z0-9_-]{2,64}$/).optional(),
});

export async function buildIdp(o: IdpOptions): Promise<FastifyInstance> {
  const key = await importPKCS8(o.privateKeyPem, 'RS256');
  const app = buildServer({ name: 'dev-idp', trustIdentityHeaders: false, logLevel: o.logLevel });

  app.post('/auth/dev-token', async (req) => {
    if (!o.enabled) throw new HttpError(404, 'not_found', 'No such route');
    const { role, subject } = parse(Body, req.body ?? {});
    const sub = subject ?? DEFAULT_SUBJECT[role];
    if (role === 'victim' && !/^v_[A-Za-z0-9_-]{6,64}$/.test(sub)) throw new HttpError(400, 'invalid_request', 'victim subjects look like v_xxxxxx');
    const ttl = TTL[role];
    const token = await new SignJWT({ scope: role })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject(sub)
      .setIssuer(o.issuer)
      .setAudience(o.audience)
      .setIssuedAt()
      .setExpirationTime(ttl)
      .sign(key);
    req.log.info({ role, sub }, 'dev token issued');
    return { access_token: token, token_type: 'Bearer', scope: role, sub, expires_in: ttl };
  });

  return app;
}
