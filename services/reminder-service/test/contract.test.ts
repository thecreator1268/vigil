import { randomUUID } from 'node:crypto';
import { createContractValidator } from '@vigil/shared-types/contract';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, memoryRepo } from '../src/app.js';

const contract = createContractValidator();
const T = 't';
const VICTIM = 'v_test_000001';
const counselor = { 'x-vigil-internal-token': T, 'x-vigil-scope': 'counselor', 'x-vigil-subject': 'c_1' };
const victim = (sub = VICTIM) => ({ 'x-vigil-internal-token': T, 'x-vigil-scope': 'victim', 'x-vigil-subject': sub });

let clock = 0;
let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  clock = 0;
  app = buildApp({ repo: memoryRepo(), internalToken: T, now: () => ++clock, logLevel: 'silent' });
});

const reminder = (over = {}) => ({ id: randomUUID(), victimId: VICTIM, dueAt: 2_000_000_000_000, type: 'hearing', note: 'District court, 10:30', ...over });

describe('reminders', () => {
  it('counselor creates; the person reads their own, sorted by due date', async () => {
    const later = reminder({ dueAt: 3_000_000_000_000, type: 'compensation', note: 'Relief amount follow-up' });
    for (const r of [later, reminder()]) {
      const res = await app.inject({ method: 'POST', url: '/v1/reminders', headers: counselor, payload: r });
      expect(res.statusCode).toBe(201);
      contract.assertResponse('post', '/v1/reminders', 201, res.json());
    }
    const res = await app.inject({ url: `/v1/reminders?victimId=${VICTIM}`, headers: victim() });
    contract.assertResponse('get', '/v1/reminders', 200, res.json());
    expect(res.json().reminders.map((r: { type: string }) => r.type)).toEqual(['hearing', 'compensation']);
  });

  it('server-authoritative last-write-wins on updatedAt', async () => {
    const r = reminder();
    await app.inject({ method: 'POST', url: '/v1/reminders', headers: counselor, payload: r });
    await app.inject({ method: 'POST', url: '/v1/reminders', headers: counselor, payload: { ...r, note: 'Moved to 2pm' } });
    const res = await app.inject({ url: `/v1/reminders?victimId=${VICTIM}`, headers: counselor });
    expect(res.json().reminders).toEqual([expect.objectContaining({ note: 'Moved to 2pm', updatedAt: 2 })]);
  });

  it("a person cannot read someone else's reminders, nor create reminders", async () => {
    const other = await app.inject({ url: `/v1/reminders?victimId=${VICTIM}`, headers: victim('v_other_0001') });
    expect(other.statusCode).toBe(403);
    contract.assertResponse('get', '/v1/reminders', 403, other.json());
    const create = await app.inject({ method: 'POST', url: '/v1/reminders', headers: victim(), payload: reminder() });
    expect(create.statusCode).toBe(403);
  });

  it('validates input against the shared schema', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/reminders', headers: counselor, payload: reminder({ type: 'party' }) });
    expect(res.statusCode).toBe(400);
    contract.assertResponse('post', '/v1/reminders', 400, res.json());
  });
});
