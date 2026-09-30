import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEnvelope, createErrorReporter, parseDsn, parseStack } from '../src/error-reporter.js';

afterEach(() => vi.unstubAllGlobals());

describe('Sentry/GlitchTip error reporter', () => {
  it('derives the envelope endpoint from a DSN (with and without a path prefix)', () => {
    expect(parseDsn('https://abc123@glitchtip.example.org/42')).toEqual({
      envelopeUrl: 'https://glitchtip.example.org/api/42/envelope/', publicKey: 'abc123',
    });
    expect(parseDsn('https://k@host.example/sub/7').envelopeUrl).toBe('https://host.example/sub/api/7/envelope/');
    expect(() => parseDsn('https://host.example/7')).toThrow(/invalid DSN/);
  });

  it('parses V8 stacks oldest-frame-first', () => {
    const frames = parseStack('Error: x\n    at inner (/app/dist/main.js:10:5)\n    at /app/dist/main.js:20:1');
    expect(frames).toEqual([
      { function: '<anonymous>', filename: '/app/dist/main.js', lineno: 20, colno: 1 },
      { function: 'inner', filename: '/app/dist/main.js', lineno: 10, colno: 5 },
    ]);
    expect(parseStack(undefined)).toEqual([]);
  });

  it('builds an envelope that carries the exception and nothing about the request', () => {
    const env = buildEnvelope(new TypeError('boom'), { dsn: 'https://k@h/1', service: 'alert-service', environment: 'test' });
    const [header, item, event] = env.trim().split('\n').map((l) => JSON.parse(l));
    expect(header.event_id).toBe(event.event_id);
    expect(item).toEqual({ type: 'event' });
    expect(event.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'boom' });
    expect(event).not.toHaveProperty('request');
    expect(event).not.toHaveProperty('user');
  });

  it('is a no-op without a DSN and never throws when sending fails', async () => {
    expect(createErrorReporter(undefined, 's').enabled).toBe(false);
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const r = createErrorReporter('https://k@h.example/1', 's');
    expect(() => r.capture(new Error('x'))).not.toThrow();
    expect(fetchMock).toHaveBeenCalledWith('https://h.example/api/1/envelope/', expect.objectContaining({ method: 'POST' }));
  });
});
