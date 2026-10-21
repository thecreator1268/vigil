# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Dates are UTC.

## Unreleased

### Added
- **Background Sync** (Phase 1, item 2): the standard check-in queue
  registers a one-off Background Sync tag whenever work is pending; an
  installed, permitted Chrome PWA also registers Periodic Background Sync.
  Both are feature-detected independently and are a best-effort addition on
  top of the existing, unconditional sync-on-open and sync-on-`online`
  paths — not a replacement for them. The crisis fast-path never uses
  either API, keeping its own fixed 15s-while-open retry regardless of
  browser support, exactly as before. The service worker switched from
  Workbox's `generateSW` to a hand-written `src/sw.ts` (`injectManifest`)
  specifically so its `sync`/`periodicsync` handlers reuse the real
  `SyncQueue`/`CrisisFastPath`/consent logic — see README limitations for
  what this does and doesn't let us verify without a real phone.
- Sync pill simplified to exactly three states — Saved on this device /
  Syncing quietly / Synced — and now goes silent entirely while App Lock is
  engaged (new ephemeral, never-persisted `appLockEngaged` store flag).
- Unit tests for queue FIFO ordering, idempotent retries (a retried send
  always carries the check-in's own id — confirmed end to end against
  checkin-service's `ON CONFLICT (id) DO NOTHING`), and crisis/standard
  queue independence under failure; an e2e test confirming Background Sync
  registration against Chromium's real `SyncManager`, not a mock.
- **Device-safety layer** (Phase 1, item 1): opt-in App Lock (PIN, off by
  default, salted hash, gates victim routes on open/resume — never on
  `/help`), Quick Wipe (clears this device's local data after a typed
  confirmation), a one-time first-run notice before onboarding, and a
  one-time install-time notice on `beforeinstallprompt` — both on device
  monitoring and cloud-sync trade-offs, both dismissible, neither blocks
  installing or using the app. New `/settings` screen reachable from a
  header icon. Passkey app-lock deferred — see README limitations.
- `wipeDevice()` now audited end to end: clears every Dexie table,
  localStorage, sessionStorage, every Cache Storage cache, and unregisters
  the service worker — not just check-in data. Covered by a unit test that
  seeds every storage mechanism first and asserts each is empty afterwards.
- `src/test/device-safety-guardrails.test.ts`: a static scan that fails the
  build if any `<video>`/`<audio>` autoplays, or any exported/downloaded
  file name would identify the app or its purpose. Enforced, not just
  documented — it caught a real pre-existing bug (see Fixed, below).
- Phase 0 tooling: root `CLAUDE.md`, scoped `.claude/rules/`, safety hooks
  (block edits to `secrets/`/`.env*`; scoped lint+typecheck after an edit),
  four skills (`/scoring-change`, `/new-service`, `/a11y-check`, `/release`).
- Project MCP config (`.mcp.json`): GitHub (remote, token via environment
  variable, never committed), Context7, Playwright.

### Changed
- CI: a failing E2E job now retries twice with a trace captured on the first
  retry (was: no trace, no retry), and asserts every container is healthy
  with an explicit, loud failure instead of relying only on an implicit
  `--wait` timeout.
- `apps/pwa`'s production image no longer ships source maps (nothing
  consumed them; they were 81% of `dist/assets`).

### Fixed
- Counselor/admin dashboards and the trend chart were still reading
  hardcoded pre-redesign hex colors instead of the design system's tokens.
- The check-in "before you start" disclosure showed on every check-in
  instead of once per device.
- `AlertDetail.tsx`'s case-PDF export was named `vigil-<victimId>-<date>.pdf`
  — it named the app and the victim ID in a file name that could land in a
  Downloads folder or an email attachment list. Pre-existing, caught by the
  new guardrail test; renamed to `report-<victimId>-<date>.pdf`.
- `AppLockGate` locked the app the instant someone turned App Lock on from
  Settings — for the PIN they had just set, mid-session. Caught by its own
  test before reaching review; now only locks on the next open/resume.
