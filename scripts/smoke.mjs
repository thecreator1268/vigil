#!/usr/bin/env node
// End-to-end smoke test against a running stack, THROUGH the gateway (TLS).
//   NODE_EXTRA_CA_CERTS=secrets/tls_cert.pem node scripts/smoke.mjs [https://localhost:8080]
// Exercises: dev-idp tokens → RBAC → check-in sync → trend baseline → trend
// alert → crisis fast-path alert → acknowledge → admin namespace guard.
import { randomUUID } from 'node:crypto';
import tls from 'node:tls';

const BASE = process.argv[2] ?? 'https://localhost:8080';
const DAY = 86_400_000;
let failures = 0;

function check(label, ok, detail = '') {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
}

const token = async (role, subject) => (await call('POST', '/auth/dev-token', null, { role, subject })).json.access_token;

// TLS version check
await new Promise((resolve) => {
  const u = new URL(BASE);
  const s = tls.connect({ host: u.hostname, port: Number(u.port), servername: u.hostname }, () => {
    check('gateway negotiates TLS 1.3', s.getProtocol() === 'TLSv1.3', s.getProtocol());
    s.end();
    resolve();
  });
  s.on('error', (e) => {
    check('gateway TLS handshake', false, e.message);
    resolve();
  });
});
await new Promise((resolve) => {
  const u = new URL(BASE);
  const s = tls.connect({ host: u.hostname, port: Number(u.port), maxVersion: 'TLSv1.2', servername: u.hostname });
  s.on('secureConnect', () => { check('gateway refuses TLS 1.2', false); s.end(); resolve(); });
  s.on('error', () => { check('gateway refuses TLS 1.2', true); resolve(); });
});

const victimId = `v_smoke_${Date.now().toString(36)}`;
const victim = await token('victim', victimId);
const counselor = await token('counselor');
const admin = await token('admin');
check('dev-idp issues tokens', !!victim && !!counselor && !!admin);

const cfg = await call('GET', '/v1/scoring-config', victim);
check('scoring config is served and versioned', cfg.status === 200 && cfg.json.version >= 1, `v${cfg.json?.version}`);

const now = Date.now();
const submit = (i, selfReport, extra = {}) =>
  call('POST', '/v1/checkins', victim, {
    id: randomUUID(), victimId, createdAt: now - (10 - i) * DAY, selfReport: { heavy: 2, safe: 2 },
    crisisFlag: false, compositeScore: 0.35 * selfReport,
    signalTerms: { selfReport, sentiment: selfReport, engagement: 0, voice: null },
    configVersion: 1, channel: 'app', fastPath: false, region: 'smoke-region', ...extra,
  });

console.log('Building a baseline, then a sustained drop…');
const series = [0.5, 0.6, 0.5, 0.55, 0.5, 0.6, -0.8, -0.9];
let accepted = 0;
for (const [i, v] of series.entries()) if ((await submit(i, v)).status === 202) accepted++;
check('all check-ins accepted (202)', accepted === series.length, `${accepted}/${series.length}`);

const other = await call('POST', '/v1/checkins', victim, { ...(await (async () => ({}))()), id: randomUUID(), victimId: 'v_someone_else1', createdAt: now, selfReport: {}, crisisFlag: false, compositeScore: 0, signalTerms: { selfReport: null, sentiment: null, engagement: null, voice: null }, configVersion: 1, channel: 'app', fastPath: false });
check("a person cannot submit someone else's check-in", other.status === 403, String(other.status));

async function waitForAlert(pred, label) {
  for (let i = 0; i < 20; i++) {
    const r = await call('GET', '/v1/alerts?status=open', counselor);
    const a = r.json?.alerts?.find(pred);
    if (a) return a;
    await new Promise((r) => setTimeout(r, 500));
  }
  check(label, false, 'timed out');
  return null;
}

const trend = await waitForAlert((a) => a.victimId === victimId && a.source === 'trend', 'trend alert raised');
if (trend) {
  check('trend alert raised with a plain-English reason', /usual for them|steadily harder/.test(trend.reason_text), `${trend.severity}: "${trend.reason_text.slice(0, 70)}…"`);
  check('trend alert never exposes a score', trend.raw_score === null && !/\d/.test(trend.reason_text));
}

console.log('Crisis fast-path…');
const crisis = await submit(9, 0, {
  crisisFlag: true, fastPath: true, freeText: 'I do not want to live anymore',
  crisis: { listVersion: '2026.09.1', matchedPhraseIds: ['sh-en-013'], categories: ['self_harm'] },
});
check('crisis check-in acknowledged as crisis-synced', crisis.json?.syncState === 'crisis-synced');
const urgent = await waitForAlert((a) => a.victimId === victimId && a.source === 'crisis', 'crisis alert raised');
if (urgent) {
  check('crisis alert is urgent and bypasses the trend pipeline', urgent.severity === 'urgent' && urgent.signals_involved.join() === 'crisis_scan');
  const list = (await call('GET', '/v1/alerts?status=open', counselor)).json.alerts;
  check('queue is severity-sorted (urgent first)', list.findIndex((a) => a.severity === 'elevated') === -1 || list.findIndex((a) => a.severity === 'urgent') < list.findIndex((a) => a.severity === 'elevated'));
  const ack = await call('POST', `/v1/alerts/${urgent.id}/acknowledge`, counselor);
  check('counselor acknowledges the alert', ack.json?.alert?.status === 'acknowledged', ack.json?.alert?.acknowledgedBy ?? `HTTP ${ack.status}`);
}

const told = await call('GET', `/v1/victims/${victimId}/checkins?limit=3`, counselor);
check('counselor sees crisis text (fast-path) — "what they told us"', told.json?.checkIns?.[0]?.sharedText === 'I do not want to live anymore');

const trendView = await call('GET', `/v1/victims/${victimId}/trend`, counselor);
check('trend view returns points + baseline', trendView.json?.points?.length === series.length + 1 && trendView.json?.baseline?.sufficient === true);

console.log('RBAC…');
check('victim cannot read the alert queue', (await call('GET', '/v1/alerts', victim)).status === 403);
check('counselor token rejected on /v1/admin/*', (await call('GET', '/v1/admin/rollups?region=smoke-region', counselor)).status === 403);
check('counselor token rejected on unknown /v1/admin/* path', (await call('GET', '/v1/admin/anything', counselor)).status === 403);
check('no token → 401', (await call('GET', '/v1/alerts')).status === 401);
const rollup = await call('GET', '/v1/admin/rollups?region=smoke-region', admin);
check('admin rollup is k-anonymity suppressed for a cohort of one', rollup.json?.anonymizedAggregate?.suppressed === true);
check('API responses are never cacheable', (await call('GET', '/v1/alerts', counselor)).headers.get('cache-control') === 'no-store');

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed.');
process.exit(failures ? 1 : 0);
