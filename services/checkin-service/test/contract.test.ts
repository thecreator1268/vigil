/**
 * Contract tests: every response is validated against openapi.yaml itself.
 * Also covers the dignity/consent rules the contract promises.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createFieldCrypto } from '@vigil/service-kit';
import { createContractValidator } from '@vigil/shared-types/contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { backoffMs, createDispatcher } from '../src/dispatcher.js';
import { memoryRepo } from '../src/repo.js';

const contract = createContractValidator();
const TOKEN = 'internal-test-token';
const VICTIM = 'v_test_000001';

const as = (scope: 'victim' | 'counselor' | 'admin', subject = scope === 'victim' ? VICTIM : 'c_test_01') => ({
  'x-vigil-internal-token': TOKEN,
  'x-vigil-scope': scope,
  'x-vigil-subject': subject,
});

function submission(over: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    victimId: VICTIM,
    createdAt: Date.now(),
    selfReport: { heavy: 3, safe: 1 },
    crisisFlag: false,
    compositeScore: -0.3,
    signalTerms: { selfReport: -0.5, sentiment: null, engagement: null, voice: null },
    configVersion: 1,
    channel: 'app',
    fastPath: false,
    ...over,
  };
}

let repo: ReturnType<typeof memoryRepo>;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  repo = memoryRepo();
  app = buildApp({ repo, crypto: createFieldCrypto(randomBytes(32).toString('base64')), internalToken: TOKEN, logLevel: 'silent' });
});

async function grant(scope: string, granted = true) {
  const res = await app.inject({
    method: 'POST', url: '/v1/consent', headers: as('victim'),
    payload: { id: randomUUID(), victimId: VICTIM, scope, granted, at: Date.now() },
  });
  contract.assertResponse('post', '/v1/consent', res.statusCode, res.json());
  return res;
}

describe('POST /v1/checkins', () => {
  it('accepts a check-in (202) and is idempotent on id', async () => {
    const body = submission();
    const first = await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: body });
    expect(first.statusCode).toBe(202);
    contract.assertResponse('post', '/v1/checkins', 202, first.json());
    expect(first.json()).toEqual({ id: body.id, syncState: 'synced' });

    const again = await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: body });
    expect(again.statusCode).toBe(202);
    expect(repo.outbox).toHaveLength(1); // trend point enqueued once
  });

  it('rejects contract-invalid bodies with a contract-valid 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: submission({ compositeScore: 9 }) });
    expect(res.statusCode).toBe(400);
    contract.assertResponse('post', '/v1/checkins', 400, res.json());
  });

  it("forbids a person from submitting someone else's check-in", async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim', 'v_someone_else'), payload: submission() });
    expect(res.statusCode).toBe(403);
    contract.assertResponse('post', '/v1/checkins', 403, res.json());
  });

  it('crisis fast-path: enqueues an urgent crisis alert ahead of the trend point', async () => {
    const body = submission({ crisisFlag: true, fastPath: true, freeText: 'I want to die', crisis: { listVersion: '2026.09.1', matchedPhraseIds: ['sh-en-006'], categories: ['self_harm'] } });
    const res = await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: body });
    expect(res.json().syncState).toBe('crisis-synced');
    const claimed = await repo.claimOutbox(10, Date.now());
    expect(claimed.map((e) => e.topic)).toEqual(['alert.crisis', 'trend.point']);
    expect((claimed[0]?.payload as { draft: { severity: string; raw_score: null } }).draft).toMatchObject({ severity: 'urgent', raw_score: null });
  });

  it('re-scans free text server-side even if the device did not flag it', async () => {
    await grant('share-free-text');
    const res = await app.inject({
      method: 'POST', url: '/v1/checkins', headers: as('victim'),
      payload: submission({ freeText: 'they said they will kill me' }),
    });
    expect(res.json().syncState).toBe('crisis-synced');
  });

  it('discards free text without consent, and stores it (encrypted) with consent', async () => {
    const noConsent = submission({ freeText: 'I felt lonely today' });
    await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: noConsent });
    expect((await repo.getCheckIn(noConsent.id))?.freeTextEnc).toBeNull();

    await grant('share-free-text');
    const withConsent = submission({ freeText: 'I felt lonely today' });
    await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: withConsent });
    const stored = await repo.getCheckIn(withConsent.id);
    expect(stored?.freeTextEnc).toMatch(/^v1\./);
    expect(stored?.freeTextEnc).not.toContain('lonely');
  });

  it('drops voice features unless the person agreed to share them', async () => {
    const body = submission({ voiceFeatures: { pitchVar: 0.1, rms: 0.05 } });
    await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: body });
    expect((await repo.getCheckIn(body.id))?.voiceFeatures).toBeNull();
  });
});

describe('GET /v1/victims/:id/checkins', () => {
  it('returns what they told us, with shared text only while consent holds', async () => {
    await grant('share-free-text');
    const body = submission({ freeText: 'Today felt a little lighter' });
    await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: body });

    const res = await app.inject({ url: `/v1/victims/${VICTIM}/checkins`, headers: as('counselor') });
    contract.assertResponse('get', '/v1/victims/{id}/checkins', 200, res.json());
    expect(res.json().checkIns[0].sharedText).toBe('Today felt a little lighter');

    await grant('share-free-text', false); // consent withdrawn
    const after = await app.inject({ url: `/v1/victims/${VICTIM}/checkins`, headers: as('counselor') });
    expect(after.json().checkIns[0].sharedText).toBeNull();
  });

  it('is counselor-only', async () => {
    const res = await app.inject({ url: `/v1/victims/${VICTIM}/checkins`, headers: as('victim') });
    expect(res.statusCode).toBe(403);
    contract.assertResponse('get', '/v1/victims/{id}/checkins', 403, res.json());
  });
});

describe('DELETE /v1/checkins/:id/free-text', () => {
  it('lets the owner erase their words (idempotent), and nobody else', async () => {
    await grant('share-free-text');
    const body = submission({ freeText: 'something private' });
    await app.inject({ method: 'POST', url: '/v1/checkins', headers: as('victim'), payload: body });

    const other = await app.inject({ method: 'DELETE', url: `/v1/checkins/${body.id}/free-text`, headers: as('victim', 'v_other_0001') });
    expect(other.statusCode).toBe(403);

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'DELETE', url: `/v1/checkins/${body.id}/free-text`, headers: as('victim') });
      expect(res.statusCode).toBe(204);
    }
    expect((await repo.getCheckIn(body.id))?.freeTextEnc).toBeNull();

    const missing = await app.inject({ method: 'DELETE', url: `/v1/checkins/${randomUUID()}/free-text`, headers: as('victim') });
    expect(missing.statusCode).toBe(404);
    contract.assertResponse('delete', '/v1/checkins/{id}/free-text', 404, missing.json());
  });
});

describe('consent ledger', () => {
  it('appends with a monotonic ledger version and exposes the effective state', async () => {
    const a = (await grant('share-free-text')).json().record;
    const b = (await grant('share-free-text', false)).json().record;
    expect(b.ledgerVersion).toBe(a.ledgerVersion + 1);

    const res = await app.inject({ url: `/v1/consent?victimId=${VICTIM}`, headers: as('victim') });
    contract.assertResponse('get', '/v1/consent', 200, res.json());
    expect(res.json().records).toEqual([expect.objectContaining({ scope: 'share-free-text', granted: false })]);
  });

  it('only the person themselves can record consent', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/consent', headers: as('counselor'),
      payload: { id: randomUUID(), victimId: VICTIM, scope: 'share-free-text', granted: true, at: Date.now() },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('outbox dispatcher', () => {
  it('delivers crisis alerts first and backs off on failure (5s → 5min cap)', async () => {
    expect(backoffMs(0)).toBe(5_000);
    expect(backoffMs(1)).toBe(10_000);
    expect(backoffMs(20)).toBe(300_000);

    await app.inject({
      method: 'POST', url: '/v1/checkins', headers: as('victim'),
      payload: submission({ crisisFlag: true, fastPath: true, crisis: { listVersion: 'x', matchedPhraseIds: [], categories: [] } }),
    });
    const calls: string[] = [];
    const call = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/internal/points')) throw new Error('trend down');
      return {};
    });
    const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;
    const d = createDispatcher({ repo, call: call as never, urls: { alert: 'http://a', trend: 'http://t' }, log });
    expect(await d.drain()).toBe(1);
    expect(calls).toEqual(['http://a/internal/alerts', 'http://t/internal/points']);
    const trend = repo.outbox.find((e) => e.topic === 'trend.point');
    expect(trend?.attempts).toBe(1);
    expect(trend?.deliveredAt).toBeNull();
  });
});
