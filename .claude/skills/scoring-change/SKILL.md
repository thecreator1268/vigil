---
name: scoring-change
description: Change a scoring weight, signal mapping, or the crisis phrase list in packages/scoring-engine, with the required version bump and tests.
disable-model-invocation: true
---

# /scoring-change

Use for any edit to `packages/scoring-engine/src/**` that changes scoring
behavior: a weight, a signal's `[-1, 1]` mapping, the baseline window, or the
crisis phrase list.

## Before touching code

State in 5 lines: what's changing, why, which signal(s)/weights are affected,
whether it touches the crisis fast-path, and how you'll test it. Wait for
confirmation if the change affects weights or the crisis list — these are
safety-critical and versioned for audit.

## Rules (see `.claude/rules/scoring-engine.md` for full detail)

- Weights are `0.35/0.30/0.20/0.15`, stored in the versioned `scoring_config`
  table — never hardcode a different split without bumping the config
  version.
- A skipped/missing answer contributes exactly `0`. Never a penalty.
- Voice flatness is inverted (`1 − 2·flatness`) — don't "fix" this sign.
- Any edit to `CRISIS_PHRASES` (`crisis/phrases.ts`) **must**:
  1. Bump `CRISIS_LIST_VERSION`.
  2. Recompute `CRISIS_LIST_CHECKSUM` (run the test suite — it computes the
     expected value and fails with it if wrong).
  3. Never suppress on negation — threats from others must still fire.
- Composite scores never reach a counselor-facing response — only the
  plain-English reason from `alerts.ts`.

## After

1. `pnpm --filter @vigil/scoring-engine test:coverage` — keep 100% branch
   coverage; add a test for any new branch, especially the skip-is-zero and
   crisis-checksum paths.
2. `pnpm build:packages` — rebuild dist so downstream typecheck isn't stale.
3. `pnpm typecheck` at the root (catches `distress-trend-service` and
   `apps/pwa`, both of which consume this package).
4. Add a CHANGELOG entry noting the config/list version bump.
5. One branch, one PR, for this change alone.
