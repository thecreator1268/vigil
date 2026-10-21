---
name: a11y-check
description: Run the Playwright + axe WCAG 2.1 AA suite against the running VIGIL stack and interpret any violations.
---

# /a11y-check

Read-only — no side effects, safe to auto-invoke.

1. Confirm the stack is up and healthy: `docker compose ps` should show all
   9 containers `(healthy)`. If not, `docker compose up -d --build` and wait.
2. `PW_CHANNEL=chrome pnpm e2e` (from the repo root, or
   `pnpm --filter @vigil/pwa e2e`). This runs the full Playwright suite,
   including `e2e/victim.spec.ts`'s axe WCAG 2.1 AA test, not just a11y in
   isolation — there's no separate axe-only script.
3. On an axe violation: report the rule id, the affected selector, and which
   screen/component it's in. Cross-check against the design system's
   contrast tokens (`packages/design-system/src/tokens.css`) before changing
   component markup — a failing contrast check is often a token value
   problem, not a one-off component fix.
4. Never work around a violation by removing the crisis bar, changing its
   landmark role, or reducing its contrast — fix the actual offending
   element instead.
5. If a new screen is added anywhere in `apps/pwa`, make sure it's reachable
   from a `victim.spec.ts` or `counselor.spec.ts` flow so axe actually scans
   it — an unreached screen passes trivially and that's not a real pass.
