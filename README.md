# VIGIL

A dignity-first distress sentinel for survivors of atrocities: an offline-first PWA plus five microservices. Built for **SIH26094** (Ministry of Social Justice & Empowerment) by Team CODE CRAFTERS, DYPIU Pune.

People check in briefly by tapping, writing or speaking. Five signals are scored **on the device**, with no network needed. Counselors get alerts with a plain-English reason and never a score. A crisis helpline bar sits at the top of every screen.

## Quick start

```bash
corepack enable
pnpm install
pnpm secrets:dev              # generates ./secrets (git-ignored): JWT keys, TLS cert, field key, internal token
docker compose up --build     # the whole system: 9 containers, health-gated startup
```

| URL | What |
|---|---|
| http://localhost:5173 | PWA (victim app). Staff sign-in is at `/staff` |
| https://localhost:8080 | API gateway (TLS 1.3 only, self-signed dev cert) |

Verify the running stack:

```bash
NODE_EXTRA_CA_CERTS=secrets/tls_cert.pem node scripts/smoke.mjs   # 20 API checks through the gateway
PW_CHANNEL=chrome pnpm e2e                                        # Playwright: offline, crisis path, axe WCAG 2.1 AA
pnpm lint && pnpm typecheck && pnpm test                          # what CI runs on every PR
```

## Clickable prototype (no install)

**https://thecreator1268.github.io/vigil/** is the real PWA built in demo mode. It has an in-browser backend and sample data, so no services are running and no real data is involved. Use the **View as Person / Counselor / Admin** strip at the top to switch roles. To try it out, check in as the person and write something like *"I don't want to live anymore"*, then switch to Counselor to see the crisis alert.

- The demo backend (`apps/pwa/src/demo`) uses the real scoring engine and crisis matcher. It enforces the same roles, consent rules and k-anonymity as the services, and a test validates each response against `openapi.yaml`. It is only compiled in when `VITE_DEMO_MODE=true`; the normal build contains none of it.
- State lives in memory, so a reload starts again from the same sample data. Check-ins stay on the device (IndexedDB), as in the real app.
- It is deployed by `.github/workflows/pages.yml` on every push to `main`. One-time setup: **Settings → Pages → Source: GitHub Actions**.
- To run it locally: `VITE_DEMO_MODE=true pnpm --filter @vigil/pwa dev`.

## Layout

```
apps/pwa                  victim + counselor + admin client (React 18, Vite, Tailwind, Dexie, Zustand)
apps/marketing            public explainer page (the only place GSAP/ScrollTrigger is used)
services/gateway          TLS 1.3, RS256 JWT, RBAC derived from the OpenAPI contract, rate limiting
services/checkin-service  check-ins (append-only), consent ledger, transactional outbox (crisis fast-path)
services/distress-trend-service   baselines, z-score/slope trend, versioned scoring config, k-anonymous rollups
services/alert-service    severity-sorted queue, idempotent intake, acknowledgement
services/reminder-service hearing/compensation/check-in reminders (server-authoritative LWW)
services/case-integration-service  the only external foreign key (mock government case system adapter)
services/dev-idp          DEVELOPMENT-ONLY token issuer standing in for OIDC; not in prod profiles
packages/scoring-engine   pure TS 5-signal engine, runs on device and server (100% branch coverage)
packages/shared-types     openapi.yaml (source of truth) → generated types + Zod mirror + contract validator
packages/service-kit      Fastify bootstrap: JSON logs with content redaction, internal-token hop, db, AES-GCM, OTel
packages/design-system    tokens, motion tokens, Feather icon badges, view-transition helper
infra/                    docker-compose.yml, compose.prod.yml (+ Caddy), k8s/ (kustomize)
```

## How the spec was implemented, and where it was interpreted

- **Scoring formula.** The spec's formula mixes directions: sentiment is positive when things are better, but voice *flatness* is positive when things are worse. The engine keeps the weighted-sum structure and the weights exactly (0.35/0.30/0.20/0.15, stored in the versioned `scoring_config` table). Every term is mapped to a wellbeing-oriented value in [-1, 1], and flatness enters as `1 − 2·flatness`. Missing signals contribute 0, so skipping a question is never a penalty. The baseline uses the N=10 check-ins *before* the one being scored, and σ has a floor so a perfectly steady baseline can't divide by zero.
- **Server recomputation.** The trend service recomputes composites from the stored per-signal terms using the *active* config. A person's history is therefore always scored consistently, and every alert records the config version that produced it.
- **Crisis scan.** A deterministic, versioned phrase list in English, Hindi and Hinglish. It covers self-harm *and threats from others*, because for atrocity survivors, threats to withdraw a case are a real danger. It deliberately does not suppress negations. A checksum test forces a version bump on any edit.
- **Auth.** The spec says every endpoint needs a `counselor | admin` token, but victims must be able to submit check-ins. A third `victim` scope was added, limited to the person's own records.
- **Dexie.** The spec's schema is kept verbatim in `apps/pwa/src/db/schema.ts`. The sync queues and kv store are an additive `version(2)`.
- **Added endpoints.** `DELETE /v1/checkins/{id}/free-text` supports the Empowerment principle. The other additions are consent listing, the scoring config, case links, reminder upsert and "what they told us". All of them are in `openapi.yaml`.
- **Dockerfiles.** They follow the spec's deps → build → distroless pattern, but the build context is the repo root and the `deps` stage uses `pnpm fetch`. That is what makes pnpm workspaces cacheable. Images run as non-root with no shell.
- **Error reporting.** `@sentry/node` v11 was replaced by a small Sentry-protocol reporter that works with Sentry or GlitchTip. The full SDK added about 60 MB per image (CLI, Babel, Rollup). Service `node_modules` dropped from 151 MB to 43 MB.
- **Crisis resources.** KIRAN 1800-599-0019, iCall, Vandrevala 1860-2662-345, plus the National Helpline Against Atrocities (14566) and emergency 112.

## Known limitations / next steps

- IVRS and SMS channels exist in the data model and scoring (`channel`), but no telephony adapter is built.
- BHASHINI transcription calls a configurable **server-side proxy** (`VITE_SPEECH_PROXY_URL`), which is not included. Without it, the app falls back to text entry, and voice features are still extracted on-device.
- The production IdP (OIDC + PKCE) is not wired for **admin**. `dev-idp` issues admin tokens with the same claims it always has, gated behind an explicit `NODE_ENV` whitelist that refuses to boot outside development/test (see below) — admin passkey login was deliberately out of scope for this item, not forgotten.
- **Counselor passkey login** (`services/counselor-identity-service`, `apps/pwa/src/api/passkey.ts`): production counselor sign-in is now WebAuthn passkeys — usernameless, user-verification required, discoverable credentials — replacing `dev-idp` for that one role. Design rationale, rejected alternatives, and the 8 changes required on review are in `docs/design/counselor-passkey-login.md`. Notable decisions: recovery is an **ops CLI** process requiring two distinct, token-authenticated operators (never a single admin, and deliberately not admin-console-based, since admin has no production identity of its own yet); a non-zero sign-count decrease is logged as a warning, not a hard rejection, so a noisy synced-passkey signal can't lock a counselor out mid-crisis; issued tokens live 15 minutes with no refresh — removing a credential bounds rather than instantly ends an already-issued token, which is a deliberate trade-off against adding a stateful revocation check to the otherwise-stateless gateway. **Both `dev-idp` and the gateway now refuse to boot** unless `NODE_ENV` is exactly `development` or `test` when dev tokens would be reachable — found, while adding this, that the existing local/CI docker-compose stack already ran both containers with `NODE_ENV=production` baked in from their Dockerfiles, which the new check would have broken; fixed with an explicit override in `infra/docker-compose.yml`. Also found and fixed a real bug while verifying the rate limiter stays available during a crisis: `apps/pwa/server/main.js`'s proxy was overwriting `X-Forwarded-For` instead of appending to it, which would have bucketed every counselor's login attempts behind one shared key. A second review round replaced the gateway's initial `trustProxy: true` (which trusted every hop unconditionally, including a request that reaches the gateway directly — its port is published in the local/CI stack for `scripts/smoke.mjs`) with an exact, pinned-address trust list (`apps/pwa` and, in production, Caddy's `ingress` each get a static IP); the gateway now also forwards its own resolved client address downstream as `x-vigil-client-ip`, which drives `counselor-identity-service`'s per-IP throttle and audit log instead of `req.ip` (always just the gateway's own address from behind it). A new CI check (`scripts/check-no-dev-idp-in-prod.mjs`) fails the build if `dev-idp` is ever enabled or referenced in a production compose file or Kubernetes manifest. Operator-token authentication now writes to the audit log on every call, success or failure, not just on success. A third review round found `TRUSTED_PROXY_ADDRESSES` was never actually wired up for the Kubernetes manifests (pod IPs are dynamic, so the compose fix's exact-IP pinning doesn't transfer) — fixed by narrowing `infra/k8s/network-policies.yaml`'s `edge-from-ingress` policy to `pwa` only (closing a k8s-manifest equivalent of the direct-reachability gap) and setting `TRUSTED_PROXY_ADDRESSES` to the cluster's pod CIDR, plus a startup warning when `NODE_ENV=production` has no trusted proxy configured at all. `scripts/check-no-dev-idp-in-prod.mjs` also now fails the build if the gateway port is ever published in a production compose file or exposed via a Kubernetes `Service`/`Ingress`.
- **Not verified in this environment:** Docker Desktop's daemon is not reachable here, so the full `docker compose up` stack, the Playwright e2e suite (including the new `counselor-passkey.spec.ts`, which drives a real registration + usernameless login through Playwright's virtual WebAuthn authenticator), and `scripts/smoke.mjs` could not be run end-to-end this pass — only the full unit/contract test suite (every workspace project, including 25 tests in `counselor-identity-service` that exercise real ECDSA P-256 signing and the actual `@simplewebauthn/server` verification functions, not mocks of them) was run and is green. Real hardware authenticators, platform authenticators (Windows Hello, Touch ID, Android biometrics), and cross-device/hybrid passkey sign-in were not tested at all — only Playwright's virtual authenticator and hand-built cryptographic fixtures were.
- The case-integration adapter is a clearly labelled mock.
- The Trivy scan is configured in CI but has not been run locally.
- Upstream bug found: openapi-fetch's `Readable<>` helper drops `null`-only properties such as `raw_score` from response types. The PWA parses alerts with the shared Zod schema instead, which also rejects any alert carrying a score.

## Deploying to Kubernetes

Create the secrets from your secret store, then run `kubectl apply -k infra/k8s`. The secrets needed are:

- `vigil-jwt` (`public.pem`, and now also `private.pem` — `counselor-identity-service` signs counselor tokens itself)
- `vigil-internal` (`token`)
- `vigil-field-key` (`key`)
- `vigil-gateway-tls` (`tls.crt`, `tls.key`)
- `vigil-db` (keys `checkin`, `trend`, `alerts`, `reminders`, `cases`, `identity`)
- `vigil-public-tls`
- `vigil-auth` **ConfigMap** (not a Secret — these aren't sensitive): `jwtIssuer`, `jwtAudience`, `passkeyRpId`, `passkeyOrigin`. `passkeyRpId` must be the exact domain counselors reach the PWA on — changing it invalidates every registered passkey (see `docs/design/counselor-passkey-login.md` §2/§7).

Single-host alternative:

```bash
JWT_ISSUER=https://your-idp docker compose -f compose.yaml -f infra/compose.prod.yml --profile production up -d
```
