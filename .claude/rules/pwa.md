---
scope: apps/pwa/**
---

# apps/pwa

- The crisis bar (`src/features/crisis/CrisisBar.tsx`) renders on every
  person-facing screen, `sticky bottom-0`, and nothing (motion, modal,
  z-index) may cover or delay it. KIRAN 1800-599-0019 + 112, coral reserved
  for urgency only.
- Colors/radius come from Tailwind classes mapped to
  `packages/design-system/src/tokens.css` — change the *value* in tokens.css,
  don't hand-roll a new hex in a component. Exception: Recharts/canvas
  consumers (`TrendChart.tsx`, `AdminDashboard.tsx`) need literal strings —
  import `colors` from `@vigil/design-system` there, never hardcode hex.
- State persistence: Zustand + Dexie (`src/store/index.ts`,
  `dexie-storage.ts`). Only `session`, `consent`, `ui` are persisted
  (`partialize`) — never `sync`, never free-text check-in drafts. New
  persisted `ui` fields need a safe falsy default for existing users (no
  version bump needed unless you're renaming/removing a persisted field).
- Service worker scope is origin-bound; `localhost` and `127.0.0.1` are
  different origins. Don't "fix" a stale-SW symptom by changing app code
  before confirming it's not just a dev-browser cache issue.
- Motion: Framer Motion variants live near their component; respect
  `prefers-reduced-motion` (see `useMotion` in `@vigil/design-system`) and
  never animate the crisis bar's visibility or position.
- Voice. tone: sentence case, calm, specific, never alarming, never a raw
  number shown to the person.
- Before shipping a UI change, run `pnpm --filter @vigil/pwa typecheck` and
  `PW_CHANNEL=chrome pnpm e2e` against the real docker-compose stack — unit
  tests alone don't catch a11y regressions.
- Device safety (`features/security/`): no OS push-notification feature
  exists yet, but if one is added, its visible text (lock-screen preview,
  notification center) must stay neutral — never name the app, the check-in,
  or anything that would identify its purpose to someone glancing at the
  device. Same for any future export/download feature: the file name must be
  neutral, not something like "vigil-checkin-report.pdf".
