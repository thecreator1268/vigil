---
name: release
description: Cut a VIGIL release — version bump, CHANGELOG, full verification, tag.
disable-model-invocation: true
---

# /release

Side-effecting (tags and pushes) — only run when explicitly asked, never as
part of unrelated work.

## Before

State in 5 lines: the version being cut, what's in it (link the PRs/commits
since the last tag), whether it includes a `scoring_config` or
`CRISIS_LIST_VERSION` bump (call this out specifically — it changes
production scoring behavior), and whether docs/CHANGELOG are ready.

## Steps

1. `git log <last-tag>..HEAD --oneline` to confirm everything expected is
   included and nothing unrelated snuck in.
2. Full verification, not a subset: `pnpm lint && pnpm typecheck && pnpm test`,
   `pnpm build`, `docker compose up --build`, `node scripts/smoke.mjs`,
   `PW_CHANNEL=chrome pnpm e2e`. All must be green — do not cut a release on
   a known-red suite.
3. Update CHANGELOG.md with a dated entry; bump `version` in the root and
   any changed package's `package.json` (semver — patch for fixes, minor for
   additive features, major for a breaking API/contract change).
4. Commit the version bump, tag it (`git tag vX.Y.Z`), confirm with the user
   before pushing the tag or triggering any deploy.
5. Never skip the Trivy/CodeQL CI gates to make a release land faster.
