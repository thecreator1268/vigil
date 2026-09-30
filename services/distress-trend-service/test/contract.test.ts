import { randomUUID } from 'node:crypto';
import { createContractValidator } from '@vigil/shared-types/contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { memoryRepo } from '../src/repo.js';

const contract = createContractValidator();
const TOKEN = 't';
const VICTIM = 'v_test_000001';
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 30);
const hdr = (scope: string, subject = 'c_1') => ({ 'x-vigil-internal-token': TOKEN, 'x-vigil-scope': scope, 'x-vigil-subject': subject });

let repo: ReturnType<typeof memoryRepo>;
let call: ReturnType<typeof vi.fn>;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  repo = memoryRepo();
  call = vi.fn(async () => ({ urgent: 1, elevated: 2, acknowledgedWithin24hPct: 100 }));
  app = buildApp({ repo, call: call as never, alertServiceUrl: 'http://alerts', internalToken: TOKEN, now: () => NOW, logLevel: 'silent' });
});

async function point(i: number, selfReport: number, victimId = VICTIM, region = 'pune') {
  const res = await app.inject({
    method: 'POST', url: '/internal/points', headers: { 'x-vigil-internal-token': TOKEN },
    payload: {
      checkInId: randomUUID(), victimId, at: NOW - (30 - i) * DAY, configVersion: 1, region,
      signalTerms: { selfReport, sentiment: selfReport, engagement: 0, voice: null },
    },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { fired: boolean };
}

describe('trend pipeline', () => {
  it('stays quiet while the baseline builds, then raises a reasoned alert on a sustained drop', async () => {
    const answers = [0.5, 0.6, 0.5, 0.55, 0.5, 0.6, -0.8, -0.9];
    const fired: boolean[] = [];
    for (const [i, a] of answers.entries()) fired.push((await point(i, a)).fired);
    expect(fired.slice(0, 6).every((f) => !f)).toBe(true);
    expect(fired.at(-1)).toBe(true);

    const [url, init] = call.mock.calls.at(-1) as [string, { body: { draft: Record<string, unknown> } }];
    expect(url).toBe('http://alerts/internal/alerts');
    expect(init.body.draft).toMatchObject({ source: 'trend', raw_score: null, configVersion: 1 });
    expect(init.body.draft.signals_involved).toEqual(['self_report', 'sentiment']);
    expect(String(init.body.draft.reason_text)).not.toMatch(/\d/);
  });

  it('is idempotent on checkInId', async () => {
    const payload = {
      checkInId: randomUUID(), victimId: VICTIM, at: NOW, configVersion: 1,
      signalTerms: { selfReport: 0, sentiment: null, engagement: null, voice: null },
    };
    for (let i = 0; i < 2; i++) await app.inject({ method: 'POST', url: '/internal/points', headers: { 'x-vigil-internal-token': TOKEN }, payload });
    expect(repo.points).toHaveLength(1);
  });

  it('surfaces a failed alert hand-off as 5xx so the outbox retries', async () => {
    for (const [i, a] of [0.5, 0.6, 0.5, 0.55, 0.5, 0.6, -0.8].entries()) await point(i, a);
    call.mockRejectedValue(new Error('alert-service down'));
    const res = await app.inject({
      method: 'POST', url: '/internal/points', headers: { 'x-vigil-internal-token': TOKEN },
      payload: { checkInId: randomUUID(), victimId: VICTIM, at: NOW, configVersion: 1, signalTerms: { selfReport: -0.9, sentiment: -0.9, engagement: 0, voice: null } },
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /v1/victims/:id/trend', () => {
  it('returns points and a baseline that match the contract', async () => {
    for (const [i, a] of [0.2, 0.3, 0.1, 0.2, 0.25].entries()) await point(i, a);
    const res = await app.inject({ url: `/v1/victims/${VICTIM}/trend`, headers: hdr('counselor') });
    expect(res.statusCode).toBe(200);
    contract.assertResponse('get', '/v1/victims/{id}/trend', 200, res.json());
    expect(res.json().points).toHaveLength(5);
    expect(res.json().baseline.sufficient).toBe(true);
  });

  it('returns an empty trend for someone with no check-ins yet', async () => {
    const res = await app.inject({ url: '/v1/victims/v_nobody_0001/trend', headers: hdr('counselor') });
    contract.assertResponse('get', '/v1/victims/{id}/trend', 200, res.json());
    expect(res.json()).toEqual({ points: [], baseline: null });
  });

  it('is counselor-only', async () => {
    const res = await app.inject({ url: `/v1/victims/${VICTIM}/trend`, headers: hdr('victim', VICTIM) });
    expect(res.statusCode).toBe(403);
    contract.assertResponse('get', '/v1/victims/{id}/trend', 403, res.json());
  });
});

describe('GET /v1/scoring-config', () => {
  it('serves the active versioned config', async () => {
    const res = await app.inject({ url: '/v1/scoring-config', headers: hdr('victim', VICTIM) });
    contract.assertResponse('get', '/v1/scoring-config', 200, res.json());
    expect(res.json()).toMatchObject({ version: 1, zThreshold: -1.5, weights: { selfReport: 0.35 } });
  });
});

describe('GET /v1/admin/rollups', () => {
  it('suppresses regions below the k-anonymity threshold', async () => {
    for (let v = 0; v < 4; v++) await point(1, 0.5, `v_small_${String(v).padStart(4, '0')}`, 'tiny-village');
    const res = await app.inject({ url: '/v1/admin/rollups?region=tiny-village', headers: hdr('admin', 'a_1') });
    contract.assertResponse('get', '/v1/admin/rollups', 200, res.json());
    expect(res.json().anonymizedAggregate).toMatchObject({ suppressed: true, cohortSize: null, checkInCount: null, alerts: null });
  });

  it('returns aggregates only — never ids — for a large enough cohort', async () => {
    for (let v = 0; v < 6; v++) await point(20, 0.5, `v_pune_${String(v).padStart(4, '0')}`);
    const res = await app.inject({ url: '/v1/admin/rollups?region=pune', headers: hdr('admin', 'a_1') });
    contract.assertResponse('get', '/v1/admin/rollups', 200, res.json());
    expect(res.json().anonymizedAggregate).toMatchObject({ suppressed: false, cohortSize: 6, checkInCount: 6 });
    expect(JSON.stringify(res.json())).not.toMatch(/v_pune_/);
  });

  it('is admin-only (defence in depth behind the gateway)', async () => {
    const res = await app.inject({ url: '/v1/admin/rollups?region=pune', headers: hdr('counselor') });
    expect(res.statusCode).toBe(403);
  });
});
