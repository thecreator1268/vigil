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
- The production IdP (OIDC + PKCE) is not wired. `dev-idp` issues tokens with the same claims.
- The case-integration adapter is a clearly labelled mock.
- The Trivy scan is configured in CI but has not been run locally.
- Upstream bug found: openapi-fetch's `Readable<>` helper drops `null`-only properties such as `raw_score` from response types. The PWA parses alerts with the shared Zod schema instead, which also rejects any alert carrying a score.

## Deploying to Kubernetes

Create the secrets from your secret store, then run `kubectl apply -k infra/k8s`. The secrets needed are:

- `vigil-jwt` (`public.pem`)
- `vigil-internal` (`token`)
- `vigil-field-key` (`key`)
- `vigil-gateway-tls` (`tls.crt`, `tls.key`)
- `vigil-db` (keys `checkin`, `trend`, `alerts`, `reminders`, `cases`)
- `vigil-public-tls`

Single-host alternative:

```bash
JWT_ISSUER=https://your-idp docker compose -f compose.yaml -f infra/compose.prod.yml --profile production up -d
```
