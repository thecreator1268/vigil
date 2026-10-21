---
scope: services/**
---

# services/*

- Every endpoint's auth/RBAC is derived from `packages/shared-types/openapi.yaml`
  — that file is the source of truth; hand-written route guards that drift
  from it are a bug, not a feature.
- Victims get a `victim` scope limited to *their own* records only. Never
  widen a victim-scoped query without a `subject`/owner filter.
- Composite scores are never returned to a counselor-facing endpoint — only
  the plain-English reason from `packages/scoring-engine`'s `alerts.ts`. If a
  response type could carry `raw_score`, the shared Zod schema must reject it
  (see README's "Upstream bug" note on `openapi-fetch`'s `Readable<>` helper
  dropping null-only fields — don't rely on the generated type alone).
- The crisis fast-path (checkin-service's transactional outbox →
  alert-service) must stay synchronous/ahead of the trend pipeline. Don't
  route it through anything retried on a longer interval than the existing
  aggressive-retry crisis queue.
- Admin/rollup endpoints enforce k-anonymity suppression — a cohort of one
  must never be returned, even partially.
- Use `packages/service-kit` for bootstrap (Fastify, logging with redaction,
  internal-token hop, db, AES-GCM, OTel) rather than reimplementing any of it
  per-service.
- `services/dev-idp` is development-only and must never be referenced from a
  production compose/k8s profile.
- `services/case-integration-service` is a clearly-labelled mock of an
  external government system — keep it labelled as such in any docs or UI
  that surface it.
- New service: see the `/new-service` skill rather than copying an existing
  one by hand.
