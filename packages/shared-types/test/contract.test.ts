import { describe, expect, it } from 'vitest';
import { ContractError, createContractValidator } from '../src/contract.js';
import { contractRoutes, ADMIN_PREFIX } from '../src/routes.js';
import * as S from '../src/schemas.js';

const contract = createContractValidator();
const uuid = '6f1c2f1e-3b7a-4d7e-9a51-2d5d7d1f0a11';

const alert = {
  id: uuid,
  victimId: 'v_demo_0001',
  severity: 'urgent',
  signals_involved: ['crisis_scan'],
  reason_text: 'Please contact them as soon as possible.',
  raw_score: null,
  status: 'open',
  source: 'crisis',
  configVersion: 1,
  createdAt: 1_700_000_000_000,
  acknowledgedAt: null,
  acknowledgedBy: null,
};

const checkIn = {
  id: uuid,
  victimId: 'v_demo_0001',
  createdAt: 1_700_000_000_000,
  selfReport: { safe: 3, heavy: 1 },
  crisisFlag: false,
  compositeScore: 0.2,
  signalTerms: { selfReport: 0.5, sentiment: null, engagement: null, voice: null },
  configVersion: 1,
  channel: 'app',
  fastPath: false,
};

describe('OpenAPI ↔ Zod agree at runtime', () => {
  it.each([
    ['Alert', S.Alert, alert],
    ['CheckInSubmission', S.CheckInSubmission, checkIn],
  ])('%s: valid sample passes both', (name, zod, sample) => {
    expect(() => contract.assertSchema(name, sample)).not.toThrow();
    expect(zod.safeParse(sample).success).toBe(true);
  });

  it.each([
    ['raw_score must be null', 'Alert', S.Alert, { ...alert, raw_score: 0.42 }],
    ['unknown fields rejected', 'Alert', S.Alert, { ...alert, score: 1 }],
    ['bad victim id', 'CheckInSubmission', S.CheckInSubmission, { ...checkIn, victimId: 'Asha Devi' }],
    ['likert out of range', 'CheckInSubmission', S.CheckInSubmission, { ...checkIn, selfReport: { safe: 7 } }],
    ['composite out of range', 'CheckInSubmission', S.CheckInSubmission, { ...checkIn, compositeScore: 3 }],
  ] as const)('%s: rejected by both', (_label, name, zod, sample) => {
    expect(() => contract.assertSchema(name, sample)).toThrow(ContractError);
    expect(zod.safeParse(sample).success).toBe(false);
  });
});

describe('contract validator', () => {
  it('validates responses by method, path and status (following $ref responses)', () => {
    expect(() => contract.assertResponse('get', '/v1/alerts', 200, { alerts: [alert] })).not.toThrow();
    expect(() => contract.assertResponse('get', '/v1/alerts', 403, { error: 'forbidden', message: 'no' })).not.toThrow();
    expect(() => contract.assertResponse('get', '/v1/alerts', 200, { alerts: [{ ...alert, raw_score: 1 }] })).toThrow(ContractError);
  });

  it('rejects undeclared operations and statuses', () => {
    expect(() => contract.assertResponse('get', '/v1/nope', 200, {})).toThrow(/No operation/);
    expect(() => contract.assertResponse('get', '/v1/alerts', 418, {})).toThrow(/does not declare/);
  });

  it('validates request bodies', () => {
    expect(() => contract.assertRequest('post', '/v1/checkins', checkIn)).not.toThrow();
    expect(() => contract.assertRequest('post', '/v1/checkins', { ...checkIn, id: 'x' })).toThrow(ContractError);
    expect(() => contract.assertRequest('get', '/v1/alerts', {})).toThrow(/no request body/);
  });
});

describe('route table (gateway RBAC source)', () => {
  it('lists every operation with a service and at least one scope', () => {
    expect(contractRoutes.length).toBeGreaterThanOrEqual(11);
    for (const r of contractRoutes) {
      expect(r.service).toMatch(/-service$/);
      expect(r.scopes.length).toBeGreaterThan(0);
    }
  });

  it('only ever grants /v1/admin/* to the admin scope', () => {
    const admin = contractRoutes.filter((r) => r.path.startsWith(ADMIN_PREFIX));
    expect(admin.length).toBeGreaterThan(0);
    for (const r of admin) expect(r.scopes).toEqual(['admin']);
  });

  it('converts OpenAPI path params to router params', () => {
    expect(contractRoutes.find((r) => r.operationId === 'getVictimTrend')?.routePath).toBe('/v1/victims/:id/trend');
  });
});
