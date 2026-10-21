---
name: new-service
description: Scaffold a new backend service under services/ using the existing Fastify + service-kit + distroless Docker pattern.
disable-model-invocation: true
---

# /new-service

Scaffold a new `services/<name>` following the pattern of the existing
services (`gateway`, `checkin-service`, `alert-service`,
`distress-trend-service`, `reminder-service`, `case-integration-service`,
`dev-idp`).

## Before touching code

State in 5 lines: the service's single responsibility, which existing
service it most resembles, its auth scope (victim/counselor/admin, per
`openapi.yaml`), whether it needs a Postgres schema, and its health-check
shape.

## Scaffold

1. `package.json` scripts: `build` (tsup), `dev` (tsup --watch +
   onSuccess node), `start`, `typecheck` (tsc --noEmit), `test` / `test:coverage`
   (vitest).
2. Bootstrap with `packages/service-kit`: Fastify instance, JSON logs with
   content redaction, the internal-token hop for service-to-service calls,
   `db` helper if it needs Postgres, AES-GCM helper for any field that needs
   encryption at rest, OTel wiring. Do not hand-roll any of these.
3. RBAC and request/response shapes come from `packages/shared-types`
   (generated from `openapi.yaml`) — add the new endpoints to
   `openapi.yaml` first, regenerate (`pnpm contract:generate`), then
   implement against the generated types.
4. Dockerfile: deps → build → `gcr.io/distroless/nodejs22-debian13`,
   non-root, no shell — copy an existing service's Dockerfile as the
   starting point, don't write one from scratch.
5. Add the service to `docker-compose.yml` with a health check and to
   `infra/compose.prod.yml` / `infra/k8s` if it belongs in production.
6. `scripts/smoke.mjs`: add checks for the new endpoints' happy path and
   RBAC rejection.

## After

`pnpm --filter <name> typecheck && pnpm --filter <name> test`, then
`docker compose up --build` and re-run `scripts/smoke.mjs` and `pnpm e2e`
against the full stack before opening the PR.
