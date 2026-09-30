/**
 * Minimal Sentry-protocol error reporter (works with Sentry and GlitchTip).
 *
 * Why not @sentry/node: v11 pulls in the Sentry CLI, bundler plugins, Babel
 * and Rollup (~60 MB per image, plus their CVE surface) for features we don't
 * use. This sends exactly one thing — an exception envelope — and by
 * construction never includes request bodies, headers, cookies or user data.
 */
import { randomUUID } from 'node:crypto';

export interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

export function parseDsn(dsn: string): ParsedDsn {
  const u = new URL(dsn);
  const projectId = u.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
  if (!u.username || !projectId) throw new Error('invalid DSN');
  const prefix = u.pathname.slice(0, u.pathname.lastIndexOf('/'));
  return { envelopeUrl: `${u.protocol}//${u.host}${prefix}/api/${projectId}/envelope/`, publicKey: u.username };
}

interface Frame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split('\n').slice(1)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (m) frames.push({ function: m[1] ?? '<anonymous>', filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) });
  }
  return frames.reverse(); // Sentry wants oldest frame first
}

export function buildEnvelope(err: Error, opts: { dsn: string; service: string; environment: string }): string {
  const eventId = randomUUID().replace(/-/g, '');
  const header = { event_id: eventId, sent_at: new Date().toISOString(), dsn: opts.dsn };
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    server_name: opts.service,
    environment: opts.environment,
    tags: { service: opts.service },
    exception: { values: [{ type: err.name, value: err.message, stacktrace: { frames: parseStack(err.stack) } }] },
  };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
}

export function createErrorReporter(dsn: string | undefined, service: string, environment = 'development') {
  if (!dsn) return { capture: (_err: Error) => undefined, enabled: false };
  const { envelopeUrl, publicKey } = parseDsn(dsn);
  return {
    enabled: true,
    capture(err: Error) {
      void fetch(envelopeUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=vigil-service-kit/1.0`,
        },
        body: buildEnvelope(err, { dsn, service, environment }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => undefined); // reporting must never take a service down
    },
  };
}
