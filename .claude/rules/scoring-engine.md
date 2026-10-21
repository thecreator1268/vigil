---
scope: packages/scoring-engine/**
---

# packages/scoring-engine

- 5-signal composite, weighted sum, weights exactly `0.35 / 0.30 / 0.20 / 0.15`
  stored in the versioned `scoring_config` table — do not hardcode weights
  elsewhere.
- Every signal term maps to a wellbeing-oriented value in `[-1, 1]`. Voice
  *flatness* is inverted (`1 − 2·flatness`) because it's positive when things
  are worse, unlike every other signal. Keep that sign convention if you touch
  `voice.ts` or `composite.ts`.
- A missing/skipped answer contributes exactly `0`, never a penalty. Any
  change to scoring must keep this true — add a test for it if you touch
  `self-report.ts`, `composite.ts`, or `score-check-in.ts`.
- Baseline = mean/σ of the N=10 check-ins *before* the one being scored. σ has
  a floor so a perfectly steady baseline can't divide by zero (`trend.ts`).
- `crisis/phrases.ts`: deterministic, versioned, auditable — not ML. Any edit
  to `CRISIS_PHRASES` **must** bump `CRISIS_LIST_VERSION` and recompute
  `CRISIS_LIST_CHECKSUM`; the test suite fails otherwise by design. Only
  phrase *ids* are ever logged or transmitted, never the matched text. Do not
  add negation-suppression — threats from others (e.g. "I'll withdraw the
  case") must still fire, so "not"-handling that would silence those is a
  regression, not a fix.
- Nothing computed here may ever surface as a raw number to a counselor —
  that mapping to plain-English reasons happens in `alerts.ts`; keep it there.
- This package runs on-device (PWA, no network) and on the server
  (distress-trend-service) from the same source — don't introduce a
  Node-only or browser-only API without an equivalent for the other target.
- 100% branch coverage is the existing bar (`pnpm test:coverage`) — match it
  for new branches, don't lower the bar to get a change in.
