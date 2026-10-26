/**
 * API Gateway — the only public entry point.
 *
 *  - TLS 1.3 minimum (when a cert is supplied; production terminates at ingress too)
 *  - RS256 JWT verification (issuer + audience + expiry)
 *  - RBAC derived from the OpenAPI contract's `x-vigil-scopes`, per operation
 *  - `/v1/admin/*` refused for any non-admin token BEFORE routing — even for
 *    paths that do not exist — so the namespace cannot be probed
 *  - identity forwarded as x-vigil-subject / x-vigil-scope, always overwritten
 *    (never trusted from the client), plus the internal hop token
 *  - rate limiting; `Cache-Control: no-store` on every API response
 */
import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import replyFrom from '@fastify/reply-from';
import { buildServer, HttpError, type FastifyInstance, type FastifyReply, type FastifyRequest, type Scope } from '@vigil/service-kit';
import { ADMIN_PREFIX, contractRoutes } from '@vigil/shared-types';
import { importSPKI, jwtVerify, type CryptoKey, type KeyObject } from 'jose';

export interface GatewayOptions {
  jwtPublicKeyPem: string;
  issuer: string;
  audience: string;
  internalToken: string;
  /** service name (as in x-vigil-service) → base URL */
  upstreams: Record<string, string>;
  devIdpUrl?: string;
  /** Base URL for the counselor passkey login service — proxies /auth/passkey/*. */
  counselorIdentityUrl?: string;
  /**
   * Gates `devIdpUrl`. Fails closed: dev-idp may only be proxied to when this
   * is exactly 'development' or 'test' — any other value, including unset,
   * refuses to boot rather than silently ignoring devIdpUrl. See
   * docs/design/counselor-passkey-login.md §6.
   */
  nodeEnv?: string;
  https?: { key: string; cert: string };
  rateLimit?: { max: number; timeWindow: string | number };
  logLevel?: string;
  onUnhandledError?: (err: Error) => void;
}

const DEV_ENVS = new Set(['development', 'test']);

interface Verified {
  subject: string;
  scope: Scope;
}

declare module 'fastify' {
  interface FastifyRequest {
    verified?: Verified;
  }
}

const SCOPES: readonly Scope[] = ['victim', 'counselor', 'admin'];
const STRIP = ['authorization', 'cookie', 'x-vigil-subject', 'x-vigil-scope', 'x-vigil-internal-token', 'host', 'connection'];

export async function buildGateway(o: GatewayOptions): Promise<FastifyInstance> {
  // Fail closed: dev-idp may be proxied to only in an explicitly-whitelisted
  // environment. Any other value — including a misconfigured 'staging' or an
  // unset NODE_ENV — refuses to boot rather than silently ignoring it.
  if (o.devIdpUrl && !DEV_ENVS.has(o.nodeEnv ?? '')) {
    throw new Error(
      `Refusing to start: devIdpUrl is set but NODE_ENV (${o.nodeEnv ?? '<unset>'}) is not 'development' or 'test'.`,
    );
  }

  const key: CryptoKey | KeyObject = await importSPKI(o.jwtPublicKeyPem, 'RS256');
  const app = buildServer({
    name: 'gateway',
    https: o.https,
    trustIdentityHeaders: false,
    // Trusts X-Forwarded-For to resolve the real client through Caddy + the
    // PWA's same-origin proxy — safe because the gateway has no exposed port
    // in production (infra/compose.prod.yml removes it entirely); the local
    // docker-compose exposure is a dev-tooling convenience, not a public
    // boundary. See docs/design/counselor-passkey-login.md §5.
    trustProxy: true,
    logLevel: o.logLevel,
    onUnhandledError: o.onUnhandledError,
  });

  await app.register(replyFrom, { http: { requestOptions: { timeout: 10_000 } } });
  await app.register(rateLimit, {
    max: o.rateLimit?.max ?? 120,
    timeWindow: o.rateLimit?.timeWindow ?? '1 minute',
    // Key on the (hashed) bearer token when present so many people behind one
    // shared connection (a village kiosk, a mobile carrier NAT) aren't pooled.
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      return auth ? createHash('sha256').update(auth).digest('hex') : req.ip;
    },
    errorResponseBuilder: (_req, ctx) => ({ statusCode: ctx.statusCode, error: 'rate_limited', message: `Too many requests; retry in ${ctx.after}` }),
  });

  async function authenticate(req: FastifyRequest): Promise<Verified> {
    if (req.verified) return req.verified;
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'A bearer token is required');
    try {
      const { payload } = await jwtVerify(header.slice(7), key, { issuer: o.issuer, audience: o.audience, algorithms: ['RS256'] });
      const scope = payload.scope as Scope;
      if (!payload.sub || !SCOPES.includes(scope)) throw new Error('bad claims');
      req.verified = { subject: payload.sub, scope };
      return req.verified;
    } catch {
      throw new HttpError(401, 'unauthorized', 'Invalid or expired token');
    }
  }

  // Namespace guard, before any routing decision.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith(ADMIN_PREFIX)) return;
    const who = await authenticate(req);
    if (who.scope !== 'admin') throw new HttpError(403, 'forbidden', 'Admin scope required');
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('strict-transport-security', 'max-age=63072000; includeSubDomains');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    if (req.url.startsWith('/v1/') || req.url.startsWith('/auth/')) reply.header('cache-control', 'no-store');
  });

  // /auth/* is always hand-wired below, never through this generic loop: its
  // operations are pre-authentication by design (no bearer token exists yet
  // for login/registration), and this loop's preHandler always calls
  // authenticate() first. Contract entries under /auth/* exist in
  // openapi.yaml for documentation/type-generation only.
  for (const route of contractRoutes.filter((r) => r.path.startsWith('/v1/'))) {
    const upstream = o.upstreams[route.service];
    if (!upstream) throw new Error(`No upstream configured for ${route.service}`);
    app.route({
      method: route.method,
      url: route.routePath,
      preHandler: async (req) => {
        const who = await authenticate(req);
        if (!route.scopes.includes(who.scope)) {
          throw new HttpError(403, 'forbidden', `This operation is not available to the ${who.scope} role`);
        }
      },
      handler: (req, reply) => {
        const who = req.verified as Verified;
        return reply.from(`${upstream}${req.url}`, {
          rewriteRequestHeaders: (_orig, headers) => {
            const out: Record<string, string | string[] | undefined> = { ...headers };
            for (const h of STRIP) delete out[h];
            return {
              ...out,
              'x-vigil-subject': who.subject,
              'x-vigil-scope': who.scope,
              'x-vigil-internal-token': o.internalToken,
              'x-request-id': req.id,
            };
          },
        });
      },
    });
  }

  if (o.devIdpUrl) {
    const devIdp = o.devIdpUrl;
    app.post('/auth/dev-token', (req, reply) => reply.from(`${devIdp}/auth/dev-token`));
    app.log.warn('dev-idp token route is ENABLED — development only');
  }

  if (o.counselorIdentityUrl) {
    const identity = o.counselorIdentityUrl;
    // Pre-auth by design: no authenticate() call, no scope check. The
    // Authorization header (if any — the self-service "add a 2nd passkey
    // while logged in" case) is passed through unmodified so the identity
    // service can verify it itself; the client-spoofable identity headers
    // are still stripped so the identity service can trust their absence.
    const PASSKEY_STRIP = ['cookie', 'x-vigil-subject', 'x-vigil-scope', 'x-vigil-internal-token', 'host', 'connection'];
    const proxyToIdentity = (req: FastifyRequest, reply: FastifyReply) =>
      reply.from(`${identity}${req.url}`, {
        rewriteRequestHeaders: (_orig, headers) => {
          const out: Record<string, string | string[] | undefined> = { ...headers };
          for (const h of PASSKEY_STRIP) delete out[h];
          return { ...out, 'x-vigil-internal-token': o.internalToken, 'x-request-id': req.id };
        },
      });
    for (const path of ['/auth/passkey/registration/options', '/auth/passkey/registration/verify', '/auth/passkey/login/options', '/auth/passkey/login/verify']) {
      app.post(path, proxyToIdentity);
    }
  }

  return app;
}
