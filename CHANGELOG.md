# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Dates are UTC.

## Unreleased

### Added
- **Device-safety layer** (Phase 1, item 1): opt-in App Lock (PIN, off by
  default, salted hash, gates victim routes on open/resume — never on
  `/help`), Quick Wipe (clears this device's local data after a typed
  confirmation), and a one-time first-run notice on device monitoring and
  cloud-sync trade-offs, before onboarding. New `/settings` screen reachable
  from a header icon. Passkey app-lock deferred — see README limitations.
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
