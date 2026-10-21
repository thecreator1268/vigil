# VIGIL

Dignity-first, offline-first distress sentinel for survivors of atrocities.
PWA + 5 microservices, pnpm workspaces. Full context: [README.md](README.md).

## Non-negotiable rules

- Counselors see plain-English reasons, **never** raw scores.
- A skipped question counts as zero and is never penalized.
- The deterministic crisis-phrase fast path (English, Hindi, Hinglish —
  `packages/scoring-engine/src/crisis/`) is the safety floor. Nothing,
  including any ML signal, may suppress or delay it.
- The crisis bar (KIRAN 1800-599-0019, 112) is on every person-facing screen.
  Coral is for urgency only. No motion may delay or cover the crisis bar.
- Follow the VIGIL design system ("steady"): tokens in
  `packages/design-system/src/tokens.css` / `tokens.ts`.
- Never read, edit, or print the contents of `secrets/` or `.env*`.
- Keep all existing tests green before considering a change done.

## Commands

```bash
pnpm install
pnpm secrets:dev                 # generates ./secrets (git-ignored), once
docker compose up --build        # full stack: 9 containers, health-gated

pnpm lint && pnpm typecheck && pnpm test   # what CI runs on every PR
pnpm test:coverage                         # same, with coverage
pnpm build:packages                        # rebuild packages/* dist — do this
                                            # after editing any packages/*/src,
                                            # or workspace typecheck sees stale .d.ts
PW_CHANNEL=chrome pnpm e2e                 # Playwright: offline, crisis path, axe WCAG 2.1 AA
NODE_EXTRA_CA_CERTS=secrets/tls_cert.pem node scripts/smoke.mjs   # 20 API checks via the gateway
```

Per-package: `pnpm --filter <name> <script>` (e.g. `pnpm --filter @vigil/pwa dev`).

## Layout

```
apps/pwa                  victim + counselor + admin client (React 18, Vite, Tailwind, Dexie, Zustand)
apps/marketing            public explainer page (only place GSAP/ScrollTrigger is used)
services/gateway          TLS 1.3, RS256 JWT, RBAC from the OpenAPI contract, rate limiting
services/checkin-service  check-ins (append-only), consent ledger, transactional outbox (crisis fast-path)
services/distress-trend-service   baselines, z-score/slope trend, versioned scoring config, k-anon rollups
services/alert-service    severity-sorted queue, idempotent intake, acknowledgement
services/reminder-service hearing/compensation/check-in reminders (server-authoritative LWW)
services/case-integration-service  mock government case-system adapter (clearly labelled)
services/dev-idp          DEV-ONLY token issuer; not in prod profiles
packages/scoring-engine   pure TS 5-signal engine, runs on device and server (100% branch coverage)
packages/shared-types     openapi.yaml (source of truth) → generated types + Zod + contract validator
packages/service-kit      Fastify bootstrap: redacted JSON logs, internal-token hop, db, AES-GCM, OTel
packages/design-system    tokens, motion tokens, Feather icon badges, view-transition helper
infra/                    docker-compose.yml, compose.prod.yml (+ Caddy), k8s/ (kustomize)
```

No per-package READMEs exist; this file and the table above are the map.
Scoped conventions live in `.claude/rules/`.

## Working here

- `packages/*` are built with tsup; other workspace packages import the
  **built dist**, not source. After editing `packages/*/src/**`, run
  `pnpm build:packages` before trusting a `typecheck` result elsewhere in the
  workspace — a stale `dist/*.d.ts` typechecks against the old shape and lies.
- `apps/pwa`'s production image strips sourcemaps on purpose (nothing
  consumes them yet) — don't re-enable without a consumer.
- Recharts (and any other canvas/SVG lib) needs literal color strings, not
  CSS custom properties — pull from `packages/design-system`'s `colors` TS
  export, not `tokens.css`, inside chart components.
- `localhost` and `127.0.0.1` are different origins for service-worker scope;
  useful when a stale SW is suspected during local debugging.
- One branch and one PR per feature when doing multi-part work; state a short
  plan before coding, run lint/typecheck/test/e2e+axe after, update the
  README's "Known limitations" section and add a CHANGELOG entry if behavior
  changed, and stop to summarize rather than chaining straight into the next
  PR.
