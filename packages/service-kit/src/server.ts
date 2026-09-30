import { randomUUID, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

export type Scope = 'victim' | 'counselor' | 'admin';

export interface Identity {
  subject: string;
  scope: Scope;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: Identity | null;
  }
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const forbidden = (msg = 'Not permitted for this token') => new HttpError(403, 'forbidden', msg);

/**
 * Log redaction: raw check-in content must never reach logs. Fastify's default
 * request serializer does not log bodies; these paths guard anything a
 * handler might log by accident.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-vigil-internal-token"]',
  'freeText', '*.freeText', 'sharedText', '*.sharedText',
  'text', '*.text', 'transcript', '*.transcript', 'note', '*.note',
  'body', '*.body',
];

export interface BuildServerOptions {
  name: string;
  /** Required on every non-health request. Undefined disables the check (unit tests only). */
  internalToken?: string;
  logLevel?: string;
  /** Extra readiness probe (e.g. a DB ping). */
  ready?: () => Promise<void>;
  /** Called for unhandled (5xx) errors — wire to the Sentry/GlitchTip reporter. */
  onUnhandledError?: (err: Error) => void;
  /** Serve HTTPS with TLS 1.3 as the minimum protocol version. */
  https?: { key: string; cert: string };
  /**
   * Whether x-vigil-subject / x-vigil-scope headers are trusted (true for
   * services behind the gateway). The gateway itself sets this to false: it
   * derives identity from the JWT and overwrites those headers.
   */
  trustIdentityHeaders?: boolean;
}

function tokenMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const SCOPES = new Set<Scope>(['victim', 'counselor', 'admin']);

export function buildServer(opts: BuildServerOptions): FastifyInstance {
  const app = Fastify({
    ...(opts.https ? { https: { ...opts.https, minVersion: 'TLSv1.3' as const } } : {}),
    logger: {
      level: opts.logLevel ?? process.env.LOG_LEVEL ?? 'info',
      base: { service: opts.name },
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      messageKey: 'msg',
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
    },
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    bodyLimit: 64 * 1024,
  }) as unknown as FastifyInstance;

  app.decorateRequest('identity', null);

  // Tolerate `content-type: application/json` with an empty body (common for
  // action endpoints like POST …/acknowledge); malformed JSON is still a 400.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error('Malformed JSON body'), { statusCode: 400 }), undefined);
    }
  });

  app.get('/healthz', { logLevel: 'warn' }, async () => ({ status: 'ok', service: opts.name }));
  app.get('/readyz', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await opts.ready?.();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'not_ready' });
    }
  });

  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (req.url === '/healthz' || req.url === '/readyz') return;
    if (opts.internalToken !== undefined && !tokenMatches(opts.internalToken, req.headers['x-vigil-internal-token'] as string | undefined)) {
      throw new HttpError(401, 'unauthorized', 'Requests must arrive through the gateway');
    }
    if (opts.trustIdentityHeaders === false) return;
    const subject = req.headers['x-vigil-subject'];
    const scope = req.headers['x-vigil-scope'];
    if (typeof subject === 'string' && typeof scope === 'string' && SCOPES.has(scope as Scope)) {
      req.identity = { subject, scope: scope as Scope };
    }
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid_request', message: err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ') });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.error, message: err.message });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: 'bad_request', message: err.message });
    }
    req.log.error({ err: { type: err.name, message: err.message, stack: err.stack } }, 'unhandled error');
    opts.onUnhandledError?.(err);
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found', message: 'No such route' }));

  return app;
}

/** Validate with a shared Zod schema; ZodErrors become 400s via the error handler. */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export function requireIdentity(req: FastifyRequest, ...scopes: Scope[]): Identity {
  const id = req.identity;
  if (!id) throw new HttpError(401, 'unauthorized', 'Missing identity');
  if (scopes.length && !scopes.includes(id.scope)) throw forbidden();
  return id;
}

/** A victim token may only act on its own victimId; counselors/admins are gated by scope elsewhere. */
export function assertOwnership(id: Identity, victimId: string): void {
  if (id.scope === 'victim' && id.subject !== victimId) throw forbidden('A person can only access their own records');
}

export async function start(app: FastifyInstance, port = Number(process.env.PORT ?? 3000)): Promise<void> {
  const close = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void close('SIGTERM'));
  process.once('SIGINT', () => void close('SIGINT'));
  await app.listen({ port, host: '0.0.0.0' });
}

export type { FastifyInstance, FastifyReply, FastifyRequest };
export type { FastifyBaseLogger } from 'fastify';
