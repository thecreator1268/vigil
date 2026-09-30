import { randomUUID } from 'node:crypto';
import { buildCrisisAlert, buildTrendAlert, scanForCrisis, type TrendEvaluation } from '@vigil/scoring-engine';
import { createContractValidator } from '@vigil/shared-types/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { memoryRepo } from '../src/repo.js';

const contract = createContractValidator();
const TOKEN = 't';
const internal = { 'x-vigil-internal-token': TOKEN };
const counselor = { ...internal, 'x-vigil-scope': 'counselor', 'x-vigil-subject': 'c_demo_01' };
let clock = 1_000;

const trendEval = (severity: 'urgent' | 'elevated'): TrendEvaluation => ({
  baseline: { mean: 0.5, stddev: 0.1, windowSize: 8, sufficient: true },
  z: -3, zPrev: -2, slope: -0.2, zRule: true, slopeRule: false, fired: true, severity, signalsInvolved: ['self_report'],
});

let repo: ReturnType<typeof memoryRepo>;
let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  repo = memoryRepo();
  app = buildApp({ repo, internalToken: TOKEN, now: () => ++clock, logLevel: 'silent' });
});

const intake = (victimId: string, draft: unknown, checkInId = randomUUID()) =>
  app.inject({ method: 'POST', url: '/internal/alerts', headers: internal, payload: { checkInId, victimId, at: 1, region: 'pune', draft } });

describe('alert intake', () => {
  it('creates a crisis alert and is idempotent per check-in', async () => {
    const id = randomUUID();
    const draft = buildCrisisAlert(scanForCrisis('I want to die'), 1);
    expect((await intake('v_demo_0001', draft, id)).statusCode).toBe(201);
    expect((await intake('v_demo_0001', draft, id)).statusCode).toBe(200);
    expect(repo.alerts).toHaveLength(1);
  });

  it('keeps one open trend alert per person and escalates elevated → urgent', async () => {
    await intake('v_demo_0002', buildTrendAlert(trendEval('elevated'), 1));
    await intake('v_demo_0002', buildTrendAlert(trendEval('elevated'), 1));
    expect(repo.alerts).toHaveLength(1);
    await intake('v_demo_0002', buildTrendAlert(trendEval('urgent'), 1));
    expect(repo.alerts).toHaveLength(1);
    expect(repo.alerts[0]?.severity).toBe('urgent');
  });

  it('refuses a draft that carries a score', async () => {
    const draft = { ...buildCrisisAlert(scanForCrisis('suicide'), 1), raw_score: 0.9 };
    expect((await intake('v_demo_0003', draft)).statusCode).toBe(400);
  });
});

describe('GET /v1/alerts', () => {
  it('is severity-sorted (urgent first), newest first within severity, and contract-valid', async () => {
    await intake('v_demo_0001', buildTrendAlert(trendEval('elevated'), 1));
    await intake('v_demo_0002', buildCrisisAlert(scanForCrisis('they will kill me'), 1));
    await intake('v_demo_0003', buildTrendAlert(trendEval('elevated'), 1));

    const res = await app.inject({ url: '/v1/alerts?status=open', headers: counselor });
    expect(res.statusCode).toBe(200);
    contract.assertResponse('get', '/v1/alerts', 200, res.json());
    const alerts = res.json().alerts as { severity: string; victimId: string; raw_score: null }[];
    expect(alerts.map((a) => a.victimId)).toEqual(['v_demo_0002', 'v_demo_0003', 'v_demo_0001']);
    expect(alerts.every((a) => a.raw_score === null)).toBe(true);
  });

  it('rejects an unknown status with a contract-valid 400', async () => {
    const res = await app.inject({ url: '/v1/alerts?status=deleted', headers: counselor });
    expect(res.statusCode).toBe(400);
    contract.assertResponse('get', '/v1/alerts', 400, res.json());
  });

  it('is counselor-only', async () => {
    const res = await app.inject({ url: '/v1/alerts', headers: { ...internal, 'x-vigil-scope': 'admin', 'x-vigil-subject': 'a' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /v1/alerts/:id/acknowledge', () => {
  it('acknowledges idempotently and records who did it first', async () => {
    const created = (await intake('v_demo_0001', buildCrisisAlert(scanForCrisis('suicidal'), 1))).json().alert;
    const first = await app.inject({ method: 'POST', url: `/v1/alerts/${created.id}/acknowledge`, headers: counselor });
    contract.assertResponse('post', '/v1/alerts/{id}/acknowledge', 200, first.json());
    expect(first.json().alert).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'c_demo_01' });

    const second = await app.inject({
      method: 'POST', url: `/v1/alerts/${created.id}/acknowledge`, headers: { ...counselor, 'x-vigil-subject': 'c_other' },
    });
    expect(second.json().alert.acknowledgedBy).toBe('c_demo_01');
    expect(second.json().alert.acknowledgedAt).toBe(first.json().alert.acknowledgedAt);
  });

  it('404s for an unknown alert', async () => {
    const res = await app.inject({ method: 'POST', url: `/v1/alerts/${randomUUID()}/acknowledge`, headers: counselor });
    expect(res.statusCode).toBe(404);
    contract.assertResponse('post', '/v1/alerts/{id}/acknowledge', 404, res.json());
  });
});

describe('internal stats', () => {
  it('returns anonymized counts only', async () => {
    const a = (await intake('v_demo_0001', buildCrisisAlert(scanForCrisis('suicide'), 1))).json().alert;
    await intake('v_demo_0002', buildTrendAlert(trendEval('elevated'), 1));
    await app.inject({ method: 'POST', url: `/v1/alerts/${a.id}/acknowledge`, headers: counselor });
    const res = await app.inject({ url: '/internal/stats?region=pune&since=0', headers: internal });
    expect(res.json()).toEqual({ urgent: 1, elevated: 1, acknowledgedWithin24hPct: 50 });
  });
});
