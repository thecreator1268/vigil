# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Dates are UTC.

## Unreleased

### Added
- **Counselor passkey (WebAuthn) login** (Phase 1, item 4): a new
  `services/counselor-identity-service` replaces `dev-idp` for the
  `counselor` role in production — passkey registration, usernameless
  login (discoverable credentials, user verification required,
  attestation `none`), self-service second-key registration, and
  admin-assisted recovery. RS256 JWTs and the RBAC model are unchanged; the
  `victim` scope's ownership rules and admin login are untouched. Full
  design rationale, the 8 changes required on review, and rejected
  alternatives (email/SMS reset, single-approver recovery) are in
  `docs/design/counselor-passkey-login.md`.
- Recovery and first-time enrollment run through a new **ops CLI**
  (`services/counselor-identity-service/src/cli.ts`), never an HTTP route
  reachable from outside the service's own network: a lightweight
  `ops_operators` registry (salted-hash tokens, printed once) and a
  requirement that recovery approval come from a *different* operator than
  whoever requested it, enforced in code. Approving a recovery revokes
  every existing credential for that counselor and mints a single-use,
  24h, hashed enrollment token; every step writes to an append-only
  `audit_log`.
- Sign-count handling: a synced/multi-device passkey reporting counter `0`
  is never flagged (the common case); a non-zero *decrease* is logged as a
  warning and the login still succeeds — a deliberate choice to avoid
  locking a counselor out mid-crisis over a signal that's noisy for synced
  passkeys, backed instead by the ≥2-passkey policy and the recovery/audit
  trail.
- `services/gateway` and `services/dev-idp` now **refuse to boot** (not
  just refuse the route) unless dev tokens are explicitly enabled AND
  `NODE_ENV` is exactly `development` or `test` — any other value,
  including unset, fails closed.
- A new CI check (`scripts/check-no-dev-idp-in-prod.mjs`, wired into
  `.github/workflows/ci.yml`) fails the build if `infra/k8s/**` ever
  references `dev-idp`, or if `infra/compose.prod.yml` (or any other
  production-labelled compose file) sets `DEV_IDP_ENABLED: true`, points
  `DEV_IDP_URL` anywhere, or defines a `dev-idp` service not gated behind
  `profiles: [dev-only]`. Verified against both a clean pass and three
  deliberately-injected violations (one per check).

### Fixed (second review round)
- `services/gateway`'s `trustProxy: true` trusted **every** hop
  unconditionally — including a request that reaches the gateway directly,
  which the local/CI docker-compose stack allows (its port is published for
  `scripts/smoke.mjs`). Replaced with an exact, pinned address list
  (`trustedProxies` / `TRUSTED_PROXY_ADDRESSES`): `apps/pwa`'s container
  now gets a static IP on a fixed-subnet `edge` network, and in production
  Caddy's `ingress` gets one too. A direct hit on the gateway's exposed
  port arrives via Docker's NAT at the bridge gateway address, never equal
  to either pinned address, so its forged `X-Forwarded-For` is correctly
  ignored. The gateway now also forwards its own resolved client address
  downstream as `x-vigil-client-ip` (never client-settable — always
  overwritten), which `counselor-identity-service`'s per-IP throttle and
  every audit-log entry now use instead of `req.ip` (which, behind the
  gateway, would always just be the gateway's own address).
- Operator-token authentication (`authenticateOperator()`) previously threw
  on failure with no audit trail at all, and recorded no "token used" entry
  on success either. Both now write to `audit_log` on every call,
  success or failure, across all three ops endpoints that authenticate an
  operator (bootstrap, recovery request, recovery approve).
- Unit/contract tests for real WebAuthn registration and login round
  trips (`services/counselor-identity-service/test/webauthn-fixture.ts`
  hand-builds cryptographically real ECDSA P-256 ceremony responses — no
  mocking of `@simplewebauthn/server`'s own verification), challenge
  single-use/expiry, sign-count handling, two-distinct-operator recovery
  enforcement, rate-limit throttling (never an account lockout), and RBAC
  after login. An e2e test
  (`apps/pwa/e2e/counselor-passkey.spec.ts`) drives a real registration and
  usernameless login through Playwright's virtual WebAuthn authenticator,
  bootstrapped via the real ops CLI running inside the container (never by
  reading `secrets/` from the test host).
- `packages/shared-types`: `/auth/passkey/*` and
  `/v1/counselor/passkeys*` added to `openapi.yaml`. The four pre-auth
  `/auth/passkey/*` operations are deliberately scope-less
  (`x-vigil-scopes: []`, documentation only) and hand-wired at the gateway
  outside the generic scope-checked proxy loop, since no bearer token
  exists yet for a login/registration ceremony — covered by a new
  contract test asserting this is deliberate, not an oversight.

### Fixed
- `apps/pwa/server/main.js`'s same-origin proxy **overwrote**
  `X-Forwarded-For` with its own immediate peer's address instead of
  appending to it. In production this would have collapsed every
  counselor's login attempts behind one shared rate-limit key — found
  while verifying the "rate limiting must throttle, not lock out" review
  requirement, not by accident.
- The existing local/CI docker-compose stack already ran `gateway` and
  `dev-idp` with `NODE_ENV=production` baked in from their Dockerfiles
  (every service's Dockerfile sets this); the new boot-check would have
  broken that stack outright. Fixed with an explicit `NODE_ENV:
  development` override for both services in `infra/docker-compose.yml`.
