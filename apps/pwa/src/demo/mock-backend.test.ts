// @vitest-environment node
import { createContractValidator } from '@vigil/shared-types/contract';
import { describe, expect, it } from 'vitest';
import { createMockBackend, DEMO_VICTIM_ID } from './mock-backend';

const contract = createContractValidator();
const NOW = Date.UTC(2026, 8, 30, 9, 0, 0);

function setup() {
  const backend = createMockBackend({ now: () => NOW });
  /** Calls the demo backend under a GitHub-Pages-style base path and checks the body against openapi.yaml. */
  async function call(method: string, path: string, template: string, role: 'victim' | 'counselor' | 'admin' | null, body?: unknown, sub?: string) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (role) headers.authorization = `Bearer demo.${role}.${sub ?? (role === 'victim' ? DEMO_VICTIM_ID : `${role}_demo`)}`;
    const res = await backend.handle(
      new Request(`https://example.github.io/vigil${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    );
    const json = res.status === 204 ? undefined : await res.json();
    if (json !== undefined) contract.assertResponse(method.toLowerCase() as 'get', template, res.status, json);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- body was just validated against the contract
    return { status: res.status, json: json as Record<string, any> };
  }
  return { backend, call };
}

function submission(over: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    victimId: DEMO_VICTIM_ID,
    createdAt: NOW,
    selfReport: { heavy: 2, safe: 2 },
    crisisFlag: false,
    compositeScore: 0.1,
    signalTerms: { selfReport: 0.1, sentiment: null, engagement: 0.2, voice: null },
    configVersion: 1,
    channel: 'app',
    fastPath: false,
    region: 'pune',
    ...over,
  };
}

describe('demo backend (static prototype)', () => {
  it('seeds a severity-sorted queue produced by the real engine, never exposing a score', async () => {
    const { call } = setup();
    const { json } = await call('GET', '/v1/alerts', '/v1/alerts', 'counselor');
    const alerts = json.alerts as { severity: string; source: string; status: string; raw_score: null }[];
    expect(alerts.map((a) => `${a.severity}/${a.source}/${a.status}`)).toEqual([
      'urgent/crisis/open',
      'urgent/trend/open',
      'urgent/trend/acknowledged',
      'elevated/trend/open',
    ]);
    expect(alerts.every((a) => a.raw_score === null)).toBe(true);
  });

  it('answers every counselor, victim and admin route with contract-valid bodies', async () => {
    const { call } = setup();
    const { json } = await call('GET', '/v1/alerts', '/v1/alerts', 'counselor');
    const victim = json.alerts[0].victimId as string;
    await call('GET', `/v1/victims/${victim}/checkins?limit=5`, '/v1/victims/{id}/checkins', 'counselor');
    await call('GET', `/v1/victims/${victim}/trend`, '/v1/victims/{id}/trend', 'counselor');
    await call('GET', `/v1/victims/${victim}/case-links`, '/v1/victims/{id}/case-links', 'counselor');
    await call('GET', '/v1/scoring-config', '/v1/scoring-config', 'victim');
    await call('GET', `/v1/reminders?victimId=${DEMO_VICTIM_ID}`, '/v1/reminders', 'victim');
    await call('GET', `/v1/consent?victimId=${DEMO_VICTIM_ID}`, '/v1/consent', 'victim');
    const ack = await call('POST', `/v1/alerts/${json.alerts[0].id}/acknowledge`, '/v1/alerts/{id}/acknowledge', 'counselor');
    expect(ack.json.alert).toMatchObject({ status: 'acknowledged', acknowledgedBy: 'counselor_demo' });
    const rollup = await call('GET', '/v1/admin/rollups?region=pune', '/v1/admin/rollups', 'admin');
    expect(rollup.json.anonymizedAggregate).toMatchObject({ suppressed: false, cohortSize: 7 });
  });

  it('enforces roles like the gateway: admin-only rollups, no token → 401', async () => {
    const { call } = setup();
    expect((await call('GET', '/v1/admin/rollups?region=pune', '/v1/admin/rollups', 'counselor')).status).toBe(403);
    expect((await call('GET', '/v1/alerts', '/v1/alerts', 'victim')).status).toBe(403);
    expect((await call('GET', '/v1/alerts', '/v1/alerts', null)).status).toBe(401);
    expect((await call('GET', '/v1/reminders?victimId=v_demo_1042', '/v1/reminders', 'victim')).status).toBe(403);
  });

  it('suppresses regional rollups below a cohort of 5 (k-anonymity)', async () => {
    const { call } = setup();
    const { json } = await call('GET', '/v1/admin/rollups?region=nagpur', '/v1/admin/rollups', 'admin');
    expect(json.anonymizedAggregate).toMatchObject({ suppressed: true, cohortSize: null, alerts: null });
  });

  it('crisis words raise an urgent alert via the server-side re-scan, and the counselor sees them', async () => {
    const { call } = setup();
    const words = 'I want to end my life';
    const sub = submission({ freeText: words, fastPath: true });
    const res = await call('POST', '/v1/checkins', '/v1/checkins', 'victim', sub);
    expect(res.json).toEqual({ id: sub.id, syncState: 'crisis-synced' });

    const { json } = await call('GET', '/v1/alerts?status=open', '/v1/alerts', 'counselor');
    const mine = json.alerts.find((a: { victimId: string }) => a.victimId === DEMO_VICTIM_ID);
    expect(mine).toMatchObject({ severity: 'urgent', source: 'crisis', signals_involved: ['crisis_scan'] });

    const told = await call('GET', `/v1/victims/${DEMO_VICTIM_ID}/checkins`, '/v1/victims/{id}/checkins', 'counselor');
    expect(told.json.checkIns[0].sharedText).toBe(words);
  });

  it('keeps free text private without consent, and shares it once consent is recorded', async () => {
    const { call } = setup();
    const quiet = submission({ freeText: 'Slept badly, worried about the hearing.' });
    expect((await call('POST', '/v1/checkins', '/v1/checkins', 'victim', quiet)).json.syncState).toBe('synced');
    let told = await call('GET', `/v1/victims/${DEMO_VICTIM_ID}/checkins`, '/v1/victims/{id}/checkins', 'counselor');
    expect(told.json.checkIns[0].sharedText).toBeNull();

    await call('POST', '/v1/consent', '/v1/consent', 'victim', {
      id: crypto.randomUUID(),
      victimId: DEMO_VICTIM_ID,
      scope: 'share-free-text',
      granted: true,
      at: NOW,
    });
    const shared = submission({ freeText: 'A little better today.', createdAt: NOW + 1000 });
    await call('POST', '/v1/checkins', '/v1/checkins', 'victim', shared);
    told = await call('GET', `/v1/victims/${DEMO_VICTIM_ID}/checkins`, '/v1/victims/{id}/checkins', 'counselor');
    expect(told.json.checkIns[0].sharedText).toBe('A little better today.');

    // Empowerment: the person can erase their words afterwards.
    expect((await call('DELETE', `/v1/checkins/${shared.id}/free-text`, '/v1/checkins/{id}/free-text', 'victim')).status).toBe(204);
    told = await call('GET', `/v1/victims/${DEMO_VICTIM_ID}/checkins`, '/v1/victims/{id}/checkins', 'counselor');
    expect(told.json.checkIns[0].sharedText).toBeNull();
  });

  it('is idempotent on check-in id and refuses to file for someone else', async () => {
    const { call, backend } = setup();
    const sub = submission();
    await call('POST', '/v1/checkins', '/v1/checkins', 'victim', sub);
    await call('POST', '/v1/checkins', '/v1/checkins', 'victim', sub);
    expect(backend.state.checkIns.filter((c) => c.id === sub.id)).toHaveLength(1);
    expect((await call('POST', '/v1/checkins', '/v1/checkins', 'victim', submission({ victimId: 'v_demo_1042' }))).status).toBe(403);
  });

  it('issues demo tokens for each role', async () => {
    const { backend } = setup();
    const res = await backend.handle(
      new Request('https://example.github.io/vigil/auth/dev-token', { method: 'POST', body: JSON.stringify({ role: 'admin' }) }),
    );
    expect(await res.json()).toMatchObject({ access_token: 'demo.admin.admin_demo', sub: 'admin_demo' });
  });
});
