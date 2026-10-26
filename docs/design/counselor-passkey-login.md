# Design note: counselor passkey (WebAuthn) login

**Status: awaiting approval. Nothing in this note is implemented.** Scope is
strictly counselor identity — replacing `services/dev-idp` in production for
the `counselor` role only. RS256 JWTs, the RBAC model, and what any role can
see are all unchanged; admin login is explicitly out of scope (see §7).

## Architecture in one paragraph

A new service, `services/counselor-identity-service`, owns counselor
identity: passkey registration, login, recovery, and an append-only audit
log, in its own Postgres schema. It mints RS256 JWTs shaped identically to
`dev-idp`'s today (`iss`/`aud`/`sub`/`scope`/`exp`, signed with the same
`jwt_private_key` secret) — so `services/gateway`'s verification logic
(`services/gateway/src/app.ts`'s `authenticate()`) needs **zero** changes.
The gateway proxies new `/auth/passkey/*` routes to it exactly as it already
proxies `/auth/dev-token` to `dev-idp`
([`services/gateway/src/app.ts:131-135`](../../services/gateway/src/app.ts)).
In production, `apps/pwa/server/main.js` already proxies everything under
`/auth/*` to the gateway — no change needed there either.

### Pre-satisfying `/new-service`'s 5-line check

- **Responsibility:** counselor passkey registration/login/recovery, credential storage, audit log; mints the same-shaped RS256 JWT `dev-idp` mints today.
- **Resembles:** `dev-idp` in purpose (production replacement for counselor auth); `checkin-service` in shape (owns its own Postgres schema, has an append-only table).
- **Auth scope:** its own pre-login endpoints are unauthenticated (`security: []` override); recovery-initiation/approval endpoints are `admin`-scoped, per `openapi.yaml`.
- **Postgres schema:** yes — `counselors`, `webauthn_credentials`, `webauthn_challenges`, `recovery_requests`, `audit_log`.
- **Health check:** standard `/healthz` + DB reachability, matching the existing per-service pattern — to be confirmed against an existing service's exact shape at implementation time.

## 1. Server library

**Decision: `@simplewebauthn/server` (+ `@simplewebauthn/browser` on the PWA side), v14.0.3.**

Verified via Context7 against the library's own docs
([`/masterkale/simplewebauthn`](https://github.com/masterkale/simplewebauthn/blob/master/_autodocs/api-reference/server/verifyRegistrationResponse.md),
[`verifyAuthenticationResponse` docs](https://github.com/masterkale/simplewebauthn/blob/master/_autodocs/api-reference/server/verifyAuthenticationResponse.md)):
MIT licensed, current major version 14.0.3, exports `generateRegistrationOptions`,
`verifyRegistrationResponse`, `generateAuthenticationOptions`,
`verifyAuthenticationResponse` with a clean, fully-typed API that matches
what this design needs directly (expected-challenge/origin/RPID options,
explicit counter-based replay protection — see §3). Maintenance confirmed via
npm: ~3,041,210 weekly downloads, last published within months of writing
([npm package page](https://www.npmjs.com/package/@simplewebauthn/server)).

**Risk noted, not hidden:** the project has one listed maintainer — a
bus-factor risk for a security-critical dependency. Mitigated by very high
adoption and close spec tracking (the docs explicitly track FIDO Conformance
rules and recent browser quirks, e.g. a dated note on Safari's `topOrigin`
behavior), but this should be revisited if the project goes quiet. No
alternative library was found with comparable TypeScript-native ergonomics
and adoption during this research pass; if this is a blocking concern, say so
before I proceed — I have not done an exhaustive library bake-off.

## 2. Relying-party settings

The request path matters here: in every environment, the WebAuthn ceremony
runs from the browser against the **PWA's own origin** (`navigator.credentials
.create/get` executes against `document.location`, not against the
gateway's origin) — and I confirmed production is single-origin end to end:
Caddy fronts only `pwa:5173` ([`infra/caddy/Caddyfile`](../../infra/caddy/Caddyfile)),
and the PWA's own server proxies `/v1/*` and `/auth/*` to the gateway
internally ([`apps/pwa/server/main.js:95`](../../apps/pwa/server/main.js)).
So RP ID and allowed origins are a property of wherever the PWA is served,
not the gateway.

| Setting | Local Docker | Staging | Production |
|---|---|---|---|
| RP ID | `localhost` | registrable host of the staging domain (e.g. `staging.<VIGIL_DOMAIN>`) | `VIGIL_DOMAIN` value — same host Caddy terminates TLS for |
| Allowed origin(s) | `http://localhost:5173` | `https://<staging host>` | `https://${VIGIL_DOMAIN}` |
| User verification | `required` | `required` | `required` |
| Attestation | `none` | `none` | `none` |
| Discoverable credentials | `required` | `required` | `required` |

- **`localhost` over plain HTTP is intentional, not an oversight.** The
  WebAuthn spec special-cases `localhost` as a secure context even without
  TLS; this repo's docker-compose base file serves the PWA on plain
  `http://localhost:5173` with no TLS (only `infra/compose.prod.yml` adds
  Caddy), so this is required for local dev and e2e to work at all, not a
  relaxed security posture.
- **User verification `required`** (not the library's default `preferred`,
  per `generateRegistrationOptions`' documented default
  `{ residentKey: 'preferred', userVerification: 'preferred' }`) — an explicit
  decision: this authenticates access to victims' distress data, so the
  authenticator must confirm the counselor's own PIN/biometric, not merely
  that *a* key was present.
- **Attestation `none`** — this happens to already be the library default,
  called out explicitly rather than silently relied on. VIGIL doesn't need to
  vet specific hardware vendors (not a high-assurance PKI deployment); `none`
  also avoids collecting attestation statements that would themselves need
  secure handling for no real benefit here.
- **Discoverable credentials `required`** (`residentKey: 'required'`, which
  the library's own option-mutation logic also sets `requireResidentKey:
  true` for) — chosen specifically to make login **usernameless**: the
  counselor taps "sign in" and picks their passkey; the server never sees an
  identifier to look up *before* the assertion arrives. This is load-bearing
  for §5's "don't reveal whether an account exists."

## 3. Challenge handling

- A `webauthn_challenges` table: `attempt_id` (PK, server-generated, opaque —
  returned to the client instead of exposing the raw challenge as a lookup
  key), `type` (`register`/`login`), `counselor_id` (nullable — unknown for
  usernameless login until the assertion resolves it), `challenge`,
  `expires_at`, `used_at` (nullable).
- **Single use, enforced atomically:** verification runs inside one
  transaction: `UPDATE webauthn_challenges SET used_at = now() WHERE
  attempt_id = $1 AND used_at IS NULL AND expires_at > now() RETURNING
  challenge`. A zero-row result (already used, or expired) fails closed
  *before* any cryptographic verification is attempted — a replayed request
  is rejected by the single-use gate, not by re-deriving that the signature
  happens to still check out.
- **Short expiry: 2 minutes server-side.** The library's own client-side
  prompt `timeout` defaults to 60s
  (`generateRegistrationOptions`'s documented default); 2 minutes gives
  round-trip slack without leaving a long-lived usable challenge sitting in
  the database.
- **Bound to the attempt:** for registration, `counselor_id` is set from
  either an authenticated counselor session (adding a 2nd+ key) or a
  recovery-enrollment token (§4) — never client-supplied. For login,
  identity is only known *after* the assertion resolves the credential; the
  attempt row still records a hash of IP/user-agent for audit correlation
  only, never as an enforcement check (a counselor roaming between networks
  must not be blocked).

## 4. Recovery

This is the hard part, as flagged. Design, point by point:

- **Require ≥2 registered passkeys before an account is "active."** After
  the first passkey registers, the counselor is routed to "add a second
  passkey" with a dismissible banner — dismissing does **not** hard-block
  access. I'm deliberately rejecting a hard lockout for non-compliance:
  blocking a counselor out of the alert queue over a policy checkbox is
  itself a safety regression for a system whose entire purpose is getting
  crisis alerts to a human. The soft nag is the enforcement; losing one of
  two keys is the common case this is actually solving for, and it requires
  no recovery flow at all.
- **Admin-assisted recovery, two distinct approvers, for the case where all
  keys are lost.** An admin initiates a recovery request naming the
  counselor; a **second, different** admin must approve it (enforced in
  code — `requested_by != approved_by`, not just a UI convention) before an
  enrollment token is minted. This mirrors why `/v1/admin/*` already requires
  its own scope check "before any routing decision" at the gateway today
  ([`services/gateway/src/app.ts:86-91`](../../services/gateway/src/app.ts))
  — a single compromised or coerced admin must not be able to silently take
  over a counselor's access to victims' case data alone.
- **Time-limited, single-use enrollment link.** A random token, stored only
  as a salted hash (same pattern as the existing App-Lock PIN from Phase 1
  item 1 — prior art already in this codebase), expiring in 24h, consumed
  exactly once via the same used-at pattern as challenges (§3). It lets the
  counselor register exactly **one** new passkey, then immediately prompts
  for a second (re-establishing the ≥2 policy from scratch) — and on
  completion, **every previously-registered credential for that counselor is
  revoked**, not just marked lost, because a lockout and a quiet compromise
  (stolen device with a saved platform passkey) look identical from the
  server's side, and revoking old keys is the correct response to either.
- **Delivery of the link is deliberately NOT automated email/SMS.** The admin
  relays it through whatever out-of-band channel they already use to reach
  staff (phone call, in person). See rejected alternatives below for why.
- **Audit entry for every step.** `recovery_requests` rows plus an
  append-only `audit_log` (same append-only spirit as check-ins elsewhere in
  this codebase) record: request raised, second approval, link generated,
  link consumed or expired unused, old credentials revoked — actor, target
  counselor, timestamp, never deletable through the app's own API.

**Rejected, and why:**

- **Email reset link.** Re-introduces exactly the single point of failure
  passkeys are replacing — email takeover becomes counselor-account
  takeover, entirely outside VIGIL's own audit trail. Also adds a new PII
  category (email addresses) and a new sending integration solely for
  recovery, which cuts against this project's existing minimal-PII posture.
- **SMS reset code.** Same account-takeover-equivalence problem (SIM swap is
  a well-known real attack), and the README already notes "IVRS and SMS
  channels exist in the data model... but no telephony adapter is built" —
  building one just for auth recovery, before it exists for its actual
  intended purpose, is the wrong order of operations.
- **Security questions.** Low-entropy, guessable, and this project has
  already made a point of not collecting biographical PII beyond what's
  operationally necessary.
- **Single-admin-approved reset (no second approver).** This is the one
  genuinely tempting shortcut, and the one most worth naming explicitly as
  rejected: it would make one compromised or coerced admin sufficient to
  take over any counselor's access. The second approver is the actual
  control, not a formality.

## 5. Abuse controls

- **Rate limiting, two layers.** The gateway's existing `@fastify/rate-limit`
  (120 req/min, keyed on hashed bearer token or IP —
  [`services/gateway/src/app.ts:59-69`](../../services/gateway/src/app.ts))
  still applies, but pre-auth passkey endpoints have no bearer token, so
  they'd fall back to its IP-keyed path — too coarse on its own (a shared
  NAT, e.g. a village kiosk, could lock out everyone; conversely an attacker
  can rotate IPs). Add a second, endpoint-specific limit inside
  `counselor-identity-service`: a per-IP cap before the credential is known,
  plus a tighter per-credential-ID cap after the assertion arrives — so a
  single targeted credential can't be hammered, without punishing everyone
  behind one IP for someone else's attempts.
- **No account-existence leakage.** Usernameless login (§2) already means the
  server never receives an identifier to look up before the assertion
  arrives — there is no "no such user" branch to leak through response shape
  or timing. Every failure mode (unknown credential, bad signature, expired
  challenge, counter replay) collapses to the same generic 401 to the
  client; the specific reason is logged server-side only, for operators.
- **Audit logging of every login, failure, registration and removal.** Same
  `audit_log` table as recovery (§4) — reusing one durable, append-only
  record rather than two parallel logging paths. Operational logs (via
  `packages/service-kit`'s existing redacted-JSON-log convention) can roll
  off; `audit_log` rows are the compliance record and are never deleted
  through the app's own API.

## 6. Dev identity provider

`services/dev-idp` itself is already in reasonable shape: gated behind
`DEV_IDP_ENABLED=true`, excluded from `infra/compose.prod.yml` via
`profiles: [dev-only]`, and absent from `infra/k8s` entirely. No change
proposed there.

**The actual gap is in the gateway**, which only *not*-proxies to dev-idp
because an operator correctly left `DEV_IDP_URL` empty in
`infra/compose.prod.yml` — that's a configuration guarantee, not a code
guarantee. Proposed fix, in `services/gateway/src/main.ts`: if
`process.env.NODE_ENV === 'production'` and `devIdpUrl` is truthy, log a
fatal error and `process.exit(1)` **before** calling `start()`. This turns
"an operator must remember to leave one var blank" into "the process will
not boot misconfigured this way" — directly enforcing in code what
`.claude/rules/services.md` already states as a rule.

As defense in depth, add the identical guard to `services/dev-idp/src/main.ts`
itself (refuse to boot at all under `NODE_ENV=production`, independent of
the existing `DEV_IDP_ENABLED` flag, which today only gates the *route*, not
whether the process starts).

## 7. Migration plan

There is effectively nothing to migrate *from*: no counselor identity is
persisted anywhere in the system today — `dev-idp` issues a token for a fixed
demo subject or any caller-supplied subject with no registration step at
all, and the README already states production's OIDC IdP "is not wired." So
there are no production counselor accounts to preserve compatibility with.

- **Bootstrapping the first admin-initiated enrollment.** Recovery (§4)
  requires an admin to generate an enrollment link for a counselor — but the
  very first counselor (and the admins themselves, who are explicitly out of
  scope for passkeys in this item) need a way in with no prior admin action
  possible. Proposed: a one-time **bootstrap enrollment token**, generated by
  an ops CLI script at deploy time (not an HTTP endpoint — no standing route
  in the API surface that could be probed), single-use via the same
  used-at mechanics as every other token in this design, logged to
  `audit_log` on creation and consumption like any other enrollment.
- **Rollback path.** Purely additive: a new service plus new, separately
  versioned `/auth/passkey/*` routes. Rollback is "stop routing those paths,
  remove the service from compose/k8s" — no data migration to reverse,
  because no prior counselor data existed to begin with. If rolled back after
  real counselors have registered passkeys, their credential rows simply sit
  untouched in the service's own database, ready to resume from when
  re-enabled, rather than being deleted or migrated elsewhere.
- **Admin login stays out of scope.** `/staff`'s admin sign-in button
  continues to use `dev-idp` only — meaning admin still has no real
  production identity story. That's an existing, already-documented gap
  (README: "production IdP... is not wired"), not newly introduced here; it
  should be named plainly in the follow-up README update rather than
  silently left ambiguous.
- **Frontend sketch** (to finalize at implementation, not decided here):
  `StaffSignIn.tsx`'s counselor button switches to the passkey flow; the
  existing dev-sign-in buttons remain available only when a build-time dev
  flag is set, so the demo/local-dev experience (`VITE_DEMO_MODE`, already
  used for the GitHub Pages prototype) isn't broken by this change.

## Open questions / things I have not decided here

- Exact admin-facing UI for initiating/approving recovery requests —
  deferred to implementation; this note fixes the data model and the
  two-approver rule, not the screen.
- Exact per-credential and per-IP rate-limit numbers for §5 — I've described
  the shape (two layers, keyed differently) but not picked numbers; I'd
  rather tune those against a real test than assert made-up thresholds here.
- Counselor profile data stored is deliberately minimal — a display name and
  an opaque staff reference (e.g. `c_<slug>`, matching `dev-idp`'s existing
  `c_demo_01` subject format) — no email, no phone, consistent with the
  recovery design not depending on either. If any workflow later needs more,
  that's a separate decision, not assumed here.
