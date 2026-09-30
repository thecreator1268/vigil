/**
 * In-browser stand-in for the gateway + services, used ONLY by the static
 * prototype build (VITE_DEMO_MODE=true, e.g. GitHub Pages). It answers the
 * same routes with contract-shaped bodies (test/mock-backend.test.ts validates
 * every response against openapi.yaml) and reuses the real scoring engine and
 * crisis matcher, so alerts in the demo are produced the way production
 * produces them — nothing is hand-written score output.
 *
 * It mirrors the server rules that matter to the story:
 *  - role scopes (a counselor token gets 403 on /v1/admin/*)
 *  - free text is only kept with consent, or on the crisis fast-path
 *  - server-side crisis re-scan of any text it holds
 *  - k-anonymity: regional rollups below a cohort of 5 are suppressed
 * State is in memory: a reload starts from the same seeded demo again.
 */
import {
  buildCrisisAlert,
  buildTrendAlert,
  composite,
  DEFAULT_SCORING_CONFIG,
  evaluateTrend,
  scanForCrisis,
  type AlertDraft,
  type CrisisResult,
  type ScoredPoint,
  type SignalTerms,
} from '@vigil/scoring-engine';
import type {
  Alert,
  CaseLink,
  CheckInSubmission,
  CheckInSummary,
  ConsentInput,
  ConsentRecord,
  Reminder,
} from '@vigil/shared-types';

type Role = 'victim' | 'counselor' | 'admin';
interface Identity {
  role: Role;
  sub: string;
}

const DAY = 86_400_000;
const K_ANONYMITY = 5;
const cfg = DEFAULT_SCORING_CONFIG;

export const DEMO_VICTIM_ID = 'v_demo_0001';

interface StoredCheckIn extends CheckInSummary {
  victimId: string;
  fastPath: boolean;
  region: string | null;
}

interface State {
  alerts: Alert[];
  checkIns: StoredCheckIn[];
  series: Map<string, ScoredPoint[]>;
  reminders: Reminder[];
  consent: ConsentRecord[];
  caseLinks: CaseLink[];
  /** Pseudonymous regional cohorts for the admin view (no ids leave here). */
  regions: Map<string, Set<string>>;
}

function uuid(): string {
  return crypto.randomUUID();
}

function terms(selfReport: number, sentiment: number | null, engagement: number, voice: number | null = null): SignalTerms {
  return { selfReport, sentiment, engagement, voice };
}

function point(at: number, t: SignalTerms): ScoredPoint {
  return { at, composite: composite(t, cfg), terms: t };
}

function alertFrom(draft: AlertDraft, victimId: string, createdAt: number, ack?: { at: number; by: string }): Alert {
  return {
    id: uuid(),
    victimId,
    severity: draft.severity,
    signals_involved: [...draft.signals_involved],
    reason_text: draft.reason_text,
    raw_score: null,
    status: ack ? 'acknowledged' : 'open',
    source: draft.source,
    configVersion: draft.configVersion,
    createdAt,
    acknowledgedAt: ack?.at ?? null,
    acknowledgedBy: ack?.by ?? null,
  };
}

/** Steady baseline, then whatever tail the story needs. */
function history(now: number, tail: SignalTerms[], steady: SignalTerms = terms(0.4, 0.3, 0.3)): ScoredPoint[] {
  const total = 10 + tail.length;
  const pts: ScoredPoint[] = [];
  for (let i = 0; i < total; i++) {
    const wobble = ((i * 7) % 5) / 50 - 0.04; // deterministic, small
    const t = i < 10 ? terms(steady.selfReport! + wobble, steady.sentiment, steady.engagement! - wobble / 2) : tail[i - 10]!;
    pts.push(point(now - (total - i) * DAY, t));
  }
  return pts;
}

function selfReportFor(p: ScoredPoint): Record<string, number> {
  // Map the self-report term back to a plausible 0–4 answer set for display.
  // `heavy` is negatively keyed (4 = very heavy), the rest positively.
  const v = Math.max(0, Math.min(4, Math.round(((p.terms.selfReport ?? 0) + 1) * 2)));
  return { heavy: 4 - v, interest: v, sleep: v, safe: Math.min(4, v + 1) };
}

export function seed(now: number): State {
  const s: State = {
    alerts: [],
    checkIns: [],
    series: new Map(),
    reminders: [],
    consent: [],
    caseLinks: [],
    regions: new Map(),
  };

  const texts: Record<string, string[]> = {
    v_demo_1042: ['I could not sleep again. The hearing keeps getting postponed.', 'Nothing feels worth doing today.'],
    v_demo_2217: ['A bit tired. Went to the tehsil office again, no news.', 'Harder to get up in the morning this week.'],
  };

  const story: { id: string; tail: SignalTerms[]; region: string; shares: boolean }[] = [
    // Sharp two-check-in drop well below their own normal → urgent trend alert.
    { id: 'v_demo_1042', tail: [terms(-0.7, -0.6, 0.0), terms(-0.8, -0.7, -0.1)], region: 'pune', shares: true },
    // Gentle week-long slide below their own normal → elevated (not urgent).
    {
      id: 'v_demo_2217',
      tail: [1, 2, 3, 4, 5].map((k) => terms(0.4 - 0.042 * k, 0.3 - 0.042 * k, 0.3 - 0.015 * k)),
      region: 'pune',
      shares: true,
    },
    // Doing fine: no alert, but part of the regional cohort.
    { id: 'v_demo_5530', tail: [terms(0.45, 0.35, 0.3), terms(0.5, 0.4, 0.35)], region: 'pune', shares: false },
    { id: 'v_demo_6674', tail: [terms(0.3, 0.2, 0.3)], region: 'pune', shares: false },
    { id: 'v_demo_7718', tail: [terms(0.35, 0.3, 0.25)], region: 'nagpur', shares: false },
  ];

  for (const v of story) {
    const pts = history(now, v.tail);
    s.series.set(v.id, pts);
    addToRegion(s, v.region, v.id);
    if (v.shares) grant(s, v.id, 'share-free-text', now - 30 * DAY);
    const ev = evaluateTrend(pts, cfg);
    const draft = buildTrendAlert(ev, cfg.version);
    if (draft) s.alerts.push(alertFrom(draft, v.id, pts[pts.length - 1]!.at));
    pts.slice(-6).forEach((p, i, arr) => {
      const said = texts[v.id]?.[i - (arr.length - 2)];
      s.checkIns.push({
        id: uuid(),
        victimId: v.id,
        createdAt: p.at,
        selfReport: selfReportFor(p),
        sharedText: v.shares ? (said ?? null) : null,
        crisisFlag: false,
        channel: i % 3 === 2 ? 'ivrs' : 'app',
        fastPath: false,
        region: v.region,
      });
    });
  }

  // Crisis fast-path: the words themselves raise the alert, via the real matcher.
  const crisisText = 'Two men came to my house last night and said they will kill me if I do not withdraw the case.';
  const crisis = scanForCrisis(crisisText);
  const crisisAt = now - 3 * 3_600_000;
  const crisisDraft = buildCrisisAlert(crisis, cfg.version);
  if (crisisDraft) s.alerts.push(alertFrom(crisisDraft, 'v_demo_3380', crisisAt));
  s.checkIns.push({
    id: uuid(),
    victimId: 'v_demo_3380',
    createdAt: crisisAt,
    selfReport: { heavy: 4, interest: 1, sleep: 1, safe: 0 },
    sharedText: crisisText,
    crisisFlag: true,
    channel: 'app',
    fastPath: true,
    region: 'pune',
  });
  s.series.set('v_demo_3380', history(now, [terms(-0.5, -0.8, 0.1)]));
  addToRegion(s, 'pune', 'v_demo_3380');

  // An older alert a counselor already followed up on.
  const older = history(now - 9 * DAY, [terms(-0.6, -0.5, 0.0), terms(-0.7, -0.6, 0.0)]);
  const olderDraft = buildTrendAlert(evaluateTrend(older, cfg), cfg.version);
  if (olderDraft) {
    const at = older[older.length - 1]!.at;
    s.alerts.push(alertFrom(olderDraft, 'v_demo_4561', at, { at: at + 5 * 3_600_000, by: 'counselor_demo' }));
  }
  s.series.set('v_demo_4561', older);
  addToRegion(s, 'pune', 'v_demo_4561');

  // The visitor's own reminders and case, so their home screen isn't empty.
  s.reminders.push(
    { id: uuid(), victimId: DEMO_VICTIM_ID, dueAt: now + 5 * DAY, type: 'hearing', note: 'Sessions Court, Pune — bring the FIR copy', updatedAt: now - DAY },
    { id: uuid(), victimId: DEMO_VICTIM_ID, dueAt: now + 12 * DAY, type: 'compensation', note: 'Second instalment follow-up at the Social Welfare office', updatedAt: now - DAY },
  );
  for (const [victimId, stage, hearing] of [
    [DEMO_VICTIM_ID, 'trial', now + 5 * DAY],
    ['v_demo_1042', 'trial', now + 2 * DAY],
    ['v_demo_2217', 'chargesheet', null],
    ['v_demo_3380', 'investigation', null],
  ] as const) {
    s.caseLinks.push({
      id: uuid(),
      victimId,
      externalSystem: 'demo-case-system',
      externalCaseRef: `DEMO/${victimId.slice(-4)}/2026`,
      stage,
      nextHearingAt: hearing,
      compensationStatus: stage === 'trial' ? 'sanctioned' : 'applied',
      updatedAt: now - 2 * DAY,
    });
  }
  addToRegion(s, 'pune', DEMO_VICTIM_ID);
  return s;
}

function addToRegion(s: State, region: string, victimId: string) {
  if (!s.regions.has(region)) s.regions.set(region, new Set());
  s.regions.get(region)!.add(victimId);
}

function grant(s: State, victimId: string, scope: ConsentInput['scope'], at: number, granted = true) {
  const prev = s.consent.filter((c) => c.victimId === victimId).length;
  s.consent.push({ id: uuid(), victimId, scope, granted, at, updatedAt: at, ledgerVersion: prev + 1 });
}

function effectiveConsent(s: State, victimId: string): ConsentRecord[] {
  const latest = new Map<string, ConsentRecord>();
  for (const c of s.consent) if (c.victimId === victimId) latest.set(c.scope, c);
  return [...latest.values()];
}

const severityRank = { urgent: 0, elevated: 1 } as const;

// ---------------------------------------------------------------------------

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
const err = (status: number, error: string, message: string) => json(status, { error, message });

function identity(req: Request): Identity | null {
  const m = /^Bearer demo\.(victim|counselor|admin)\.(.+)$/.exec(req.headers.get('authorization') ?? '');
  return m ? { role: m[1] as Role, sub: m[2]! } : null;
}

type Handler = (ctx: { req: Request; url: URL; id: Identity; params: string[]; body: () => Promise<unknown> }) => Promise<Response> | Response;

export function createMockBackend(opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  const s = seed(now());

  function recordCheckIn(sub: CheckInSubmission): { syncState: 'synced' | 'crisis-synced' } {
    const existing = s.checkIns.find((c) => c.id === sub.id);
    if (existing) return { syncState: existing.crisisFlag ? 'crisis-synced' : 'synced' };

    // Device verdict merged with a server-side re-scan, as checkin-service does.
    const server = sub.freeText ? scanForCrisis(sub.freeText) : null;
    let crisis: CrisisResult | null = null;
    if (sub.crisisFlag || server?.matched) {
      crisis = {
        matched: true,
        listVersion: server?.matched ? server.listVersion : (sub.crisis?.listVersion ?? 'unknown'),
        matchedPhraseIds: [...new Set([...(sub.crisis?.matchedPhraseIds ?? []), ...(server?.matchedPhraseIds ?? [])])],
        categories: [...new Set([...(sub.crisis?.categories ?? []), ...(server?.categories ?? [])])].sort(),
      };
    }
    const consent = effectiveConsent(s, sub.victimId);
    const shares = consent.some((c) => c.scope === 'share-free-text' && c.granted);
    const keepText = !!sub.freeText && (shares || (sub.fastPath && !!crisis));

    s.checkIns.push({
      id: sub.id,
      victimId: sub.victimId,
      createdAt: sub.createdAt,
      selfReport: sub.selfReport,
      sharedText: keepText ? (sub.freeText as string) : null,
      crisisFlag: !!crisis,
      channel: sub.channel,
      fastPath: sub.fastPath,
      region: sub.region ?? null,
    });
    if (sub.region) addToRegion(s, sub.region, sub.victimId);

    if (crisis) {
      const draft = buildCrisisAlert(crisis, sub.configVersion);
      if (draft) s.alerts.push(alertFrom(draft, sub.victimId, sub.createdAt));
    }

    // Trend pipeline: server recomputes the composite from the per-signal terms.
    const pts = s.series.get(sub.victimId) ?? [];
    pts.push(point(sub.createdAt, sub.signalTerms));
    pts.sort((a, b) => a.at - b.at);
    s.series.set(sub.victimId, pts);
    const draft = buildTrendAlert(evaluateTrend(pts, cfg), cfg.version);
    const openTrend = s.alerts.some((a) => a.victimId === sub.victimId && a.source === 'trend' && a.status === 'open');
    if (draft && !openTrend) s.alerts.push(alertFrom(draft, sub.victimId, sub.createdAt));

    return { syncState: crisis ? 'crisis-synced' : 'synced' };
  }

  const routes: [method: string, pattern: RegExp, scopes: Role[], handler: Handler][] = [
    [
      'POST',
      /^\/v1\/checkins$/,
      ['victim', 'counselor'],
      async ({ id, body }) => {
        const sub = (await body()) as CheckInSubmission;
        if (id.role === 'victim' && sub.victimId !== id.sub) return err(403, 'forbidden', 'You can only submit your own check-ins.');
        const { syncState } = recordCheckIn(sub);
        return json(202, { id: sub.id, syncState });
      },
    ],
    [
      'DELETE',
      /^\/v1\/checkins\/([^/]+)\/free-text$/,
      ['victim'],
      ({ id, params }) => {
        const c = s.checkIns.find((x) => x.id === params[0]);
        if (!c) return err(404, 'not_found', 'No such check-in.');
        if (c.victimId !== id.sub) return err(403, 'forbidden', 'Not your check-in.');
        c.sharedText = null;
        return new Response(null, { status: 204 });
      },
    ],
    [
      'GET',
      /^\/v1\/victims\/([^/]+)\/checkins$/,
      ['counselor'],
      ({ params, url }) => {
        const limit = Math.min(100, Number(url.searchParams.get('limit') ?? 20));
        const shares = effectiveConsent(s, params[0]!).some((c) => c.scope === 'share-free-text' && c.granted);
        const checkIns = s.checkIns
          .filter((c) => c.victimId === params[0])
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, limit)
          .map((c) => ({
            id: c.id,
            createdAt: c.createdAt,
            selfReport: c.selfReport,
            sharedText: shares || (c.fastPath && c.crisisFlag) ? (c.sharedText ?? null) : null,
            crisisFlag: c.crisisFlag,
            channel: c.channel,
          }));
        return json(200, { checkIns });
      },
    ],
    [
      'GET',
      /^\/v1\/victims\/([^/]+)\/trend$/,
      ['counselor'],
      ({ params }) => {
        const pts = s.series.get(params[0]!);
        if (!pts) return err(404, 'not_found', 'No trend for this person.');
        const ev = evaluateTrend(pts, cfg);
        return json(200, {
          points: pts.map((p) => ({ at: p.at, compositeScore: Math.max(-1, Math.min(1, p.composite)) })),
          baseline: ev.baseline,
        });
      },
    ],
    ['GET', /^\/v1\/scoring-config$/, ['victim', 'counselor', 'admin'], () => json(200, cfg)],
    [
      'GET',
      /^\/v1\/alerts$/,
      ['counselor'],
      ({ url }) => {
        const status = url.searchParams.get('status');
        const alerts = s.alerts
          .filter((a) => !status || a.status === status)
          .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.createdAt - a.createdAt);
        return json(200, { alerts });
      },
    ],
    [
      'POST',
      /^\/v1\/alerts\/([^/]+)\/acknowledge$/,
      ['counselor'],
      ({ params, id }) => {
        const a = s.alerts.find((x) => x.id === params[0]);
        if (!a) return err(404, 'not_found', 'No such alert.');
        if (a.status === 'open') Object.assign(a, { status: 'acknowledged', acknowledgedAt: now(), acknowledgedBy: id.sub });
        return json(200, { alert: a });
      },
    ],
    [
      'GET',
      /^\/v1\/reminders$/,
      ['victim', 'counselor'],
      ({ url, id }) => {
        const victimId = url.searchParams.get('victimId');
        if (!victimId) return err(400, 'bad_request', 'victimId is required.');
        if (id.role === 'victim' && victimId !== id.sub) return err(403, 'forbidden', 'Not your reminders.');
        return json(200, { reminders: s.reminders.filter((r) => r.victimId === victimId).sort((a, b) => a.dueAt - b.dueAt) });
      },
    ],
    [
      'POST',
      /^\/v1\/consent$/,
      ['victim'],
      async ({ id, body }) => {
        const input = (await body()) as ConsentInput;
        if (input.victimId !== id.sub) return err(403, 'forbidden', 'You can only change your own consent.');
        grant(s, input.victimId, input.scope, input.at, input.granted);
        return json(201, { record: s.consent[s.consent.length - 1] });
      },
    ],
    [
      'GET',
      /^\/v1\/consent$/,
      ['victim', 'counselor'],
      ({ url, id }) => {
        const victimId = url.searchParams.get('victimId');
        if (!victimId) return err(400, 'bad_request', 'victimId is required.');
        if (id.role === 'victim' && victimId !== id.sub) return err(403, 'forbidden', 'Not your consent.');
        return json(200, { records: effectiveConsent(s, victimId) });
      },
    ],
    ['GET', /^\/v1\/victims\/([^/]+)\/case-links$/, ['counselor'], ({ params }) => json(200, { caseLinks: s.caseLinks.filter((c) => c.victimId === params[0]) })],
    [
      'GET',
      /^\/v1\/admin\/rollups$/,
      ['admin'],
      ({ url }) => {
        const region = url.searchParams.get('region');
        if (!region) return err(400, 'bad_request', 'region is required.');
        const cohort = s.regions.get(region) ?? new Set<string>();
        const periodDays = 28;
        const since = now() - periodDays * DAY;
        if (cohort.size < K_ANONYMITY) {
          return json(200, {
            anonymizedAggregate: { region, periodDays, suppressed: true, cohortSize: null, checkInCount: null, alerts: null, weeklyCheckIns: [] },
          });
        }
        const pts = [...cohort].flatMap((v) => (s.series.get(v) ?? []).filter((p) => p.at >= since));
        const alerts = s.alerts.filter((a) => cohort.has(a.victimId) && a.createdAt >= since);
        const acked = alerts.filter((a) => a.acknowledgedAt !== null && a.acknowledgedAt - a.createdAt <= DAY).length;
        const weeks = 4;
        const weeklyCheckIns = Array.from({ length: weeks }, (_, i) => {
          const weekStart = since + i * 7 * DAY;
          return { weekStart, count: pts.filter((p) => p.at >= weekStart && p.at < weekStart + 7 * DAY).length };
        });
        return json(200, {
          anonymizedAggregate: {
            region,
            periodDays,
            suppressed: false,
            cohortSize: cohort.size,
            checkInCount: pts.length,
            alerts: {
              urgent: alerts.filter((a) => a.severity === 'urgent').length,
              elevated: alerts.filter((a) => a.severity === 'elevated').length,
              acknowledgedWithin24hPct: alerts.length ? Math.round((acked / alerts.length) * 100) : null,
            },
            weeklyCheckIns,
          },
        });
      },
    ],
  ];

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Paths are matched from the /v1 or /auth segment, whatever the site's base path.
    const path = url.pathname.replace(/^.*?(?=\/(v1|auth)\/)/, '');

    if (req.method === 'POST' && path === '/auth/dev-token') {
      const { role, subject } = (await req.json()) as { role: Role; subject?: string };
      const sub = subject ?? (role === 'victim' ? DEMO_VICTIM_ID : `${role}_demo`);
      return json(200, { access_token: `demo.${role}.${sub}`, token_type: 'Bearer', expires_in: 3600, sub });
    }

    // /v1/admin/* is closed to every non-admin token before routing, as at the gateway.
    const id = identity(req);
    if (!id) return err(401, 'unauthorized', 'Sign in first.');
    if (path.startsWith('/v1/admin/') && id.role !== 'admin') return err(403, 'forbidden', 'Admin only.');

    for (const [method, pattern, scopes, handler] of routes) {
      const m = pattern.exec(path);
      if (!m || method !== req.method) continue;
      if (!scopes.includes(id.role)) return err(403, 'forbidden', 'Your role cannot use this endpoint.');
      const params = m.slice(1).map(decodeURIComponent);
      return handler({ req, url, id, params, body: () => req.json() });
    }
    return err(404, 'not_found', `No demo route for ${req.method} ${path}`);
  }

  return { handle, state: s };
}

/** Route this page's API traffic to the in-browser backend. Everything else passes through. */
export function installMockBackend(): void {
  const backend = createMockBackend();
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const req = new Request(input, init);
    if (!/\/(v1|auth)\//.test(new URL(req.url).pathname)) return realFetch(input, init);
    // A short, real-feeling delay so sync states are visible.
    await new Promise((r) => setTimeout(r, 250));
    if (!navigator.onLine) throw new TypeError('Failed to fetch');
    return backend.handle(req);
  };
}
