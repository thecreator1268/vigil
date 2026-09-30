import { createContractValidator } from '@vigil/shared-types/contract';
import { describe, expect, it, vi } from 'vitest';
import { buildApp, memoryRepo, syncCases } from '../src/app.js';
import { MockCaseSystem, uuidFrom } from '../src/external.js';

const contract = createContractValidator();
const VICTIM = 'v_demo_0001';
const NOW = Date.UTC(2026, 8, 30);
const counselor = { 'x-vigil-internal-token': 't', 'x-vigil-scope': 'counselor', 'x-vigil-subject': 'c_1' };

describe('case integration', () => {
  it('syncs from the external system, then serves contract-valid case links', async () => {
    const repo = memoryRepo();
    const call = vi.fn(async () => ({}));
    const log = { info: vi.fn() } as never;
    await syncCases({ repo, external: new MockCaseSystem(), call: call as never, reminderServiceUrl: 'http://r', victimIds: () => [VICTIM, 'v_demo_0002', 'v_demo_0003'], log, now: () => NOW });

    const app = buildApp({ repo, internalToken: 't', logLevel: 'silent' });
    const res = await app.inject({ url: `/v1/victims/${VICTIM}/case-links`, headers: counselor });
    expect(res.statusCode).toBe(200);
    contract.assertResponse('get', '/v1/victims/{id}/case-links', 200, res.json());
    expect(res.json().caseLinks).toHaveLength(1);

    // every upcoming hearing becomes a reminder with a stable id (idempotent re-sync)
    for (const [url, init] of call.mock.calls as unknown as [string, { body: { type: string; dueAt: number } }][]) {
      expect(url).toBe('http://r/internal/reminders');
      expect(init.body.type).toBe('hearing');
      expect(init.body.dueAt).toBeGreaterThan(NOW);
    }
  });

  it('is counselor-only', async () => {
    const app = buildApp({ repo: memoryRepo(), internalToken: 't', logLevel: 'silent' });
    const res = await app.inject({ url: `/v1/victims/${VICTIM}/case-links`, headers: { ...counselor, 'x-vigil-scope': 'victim' } });
    expect(res.statusCode).toBe(403);
    contract.assertResponse('get', '/v1/victims/{id}/case-links', 403, res.json());
  });

  it('derives stable UUIDs', () => {
    expect(uuidFrom('x')).toBe(uuidFrom('x'));
    expect(uuidFrom('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
