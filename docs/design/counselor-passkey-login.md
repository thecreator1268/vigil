# Design note: counselor passkey (WebAuthn) login

**Status: third review round — not yet merge-ready, 4 items required
before merge (below).** Scope is strictly counselor identity — replacing
`services/dev-idp` in production for the `counselor` role only. RS256 JWTs,
the RBAC model, and what any role can see are all unchanged; admin *login*
stays out of scope (see §7) — but see §4 for how recovery approval is
handled without it.

## Second review round (not yet merge-ready)

1. **`trustProxy: true` trusted every hop — fixed to an exact, pinned
   address list.** Confirmed the gateway IS reachable without going through
   Caddy or the PWA proxy: `infra/docker-compose.yml` (the dev/CI stack)
   publishes its port directly (`ports: ["8080:8080"]`, for
   `scripts/smoke.mjs` and debugging) — production removes this entirely
   (`ports: !reset []`). `trustProxy` is now `o.trustedProxies`, an exact
   address list (never a subnet, never `true`): `apps/pwa`'s container gets a
   **pinned static IP** on the `edge` network (`infra/docker-compose.yml`),
   and in production Caddy's `ingress` gets one too
   (`infra/compose.prod.yml`), passed via `TRUSTED_PROXY_ADDRESSES`.
   Confirmed (via Docker's own documented NAT behavior, not assumed) that a
   request hitting the gateway's published port directly arrives with the
   Docker bridge/NAT gateway address as its source — never equal to a
   pinned container's own address — so its forged `X-Forwarded-For` is
   correctly ignored and its real (NAT'd) address is used instead. New
   gateway tests (`services/gateway/test/gateway.test.ts`) prove: a forged
   header from an untrusted direct connection is ignored; two forged headers
   from the *same* untrusted real address are correctly bucketed together
   (forging can't evade the limiter); and the gateway's own resolved address
   is forwarded downstream as `x-vigil-client-ip` — a header the client
   cannot set itself (stripped from client input, always overwritten). That
   header now drives `counselor-identity-service`'s per-IP throttle *and*
   every audit-log entry — not `req.ip` there, which would always be the
   gateway's own address. See §5.
2. **CI check for the dev-provider override.** See the project's `.github/workflows/ci.yml` addition, shown in full in the PR summary.
3. **Operator-token comparison and audit coverage — confirmed.** `verifyToken()` (`src/tokens.ts`) uses `node:crypto`'s `timingSafeEqual` on equal-length derived scrypt hashes — constant-time. Operator-token creation, use (every `/internal/ops/*` call that authenticates one), and failure are now all written to `audit_log`.
4. **What could not be run** — see the PR summary's dedicated section; exact commands and pass criteria included.
5. **Independent review requested** — see the PR summary's security-decision checklist; this note does not claim to have reviewed itself.

## Third review round (not yet merge-ready)

1. **CI assertion that the gateway port is never published in production.**
   Extended `scripts/check-no-dev-idp-in-prod.mjs`: fails if
   `infra/compose.prod.yml`'s `gateway` service doesn't reset `ports` to
   empty, if any Kubernetes `Service` selecting the gateway is typed
   `NodePort`/`LoadBalancer`, or if any `Ingress` resource backends directly
   to the `gateway` service instead of `pwa`. Verified against three
   deliberately-injected violations (one per check) and a clean pass.
2. **`TRUSTED_PROXY_ADDRESSES` in Kubernetes, where pod IPs are dynamic.**
   This genuinely was not handled: `infra/k8s/gateway.yaml` never set the
   variable at all, so in k8s `trustProxy` silently resolved to `false` —
   every request's `req.ip` would be the raw socket peer, which behind
   kube-proxy/the CNI is some shared address, not the real client; the
   per-client rate limiter and the audit log would both be keyed on that
   shared address instead. Pinning exact IPs (the compose fix) doesn't
   transfer to k8s because pod IPs are reassigned on every reschedule.
   Fixed two ways: (a) `infra/k8s/network-policies.yaml`'s
   `edge-from-ingress` policy previously also selected `app: gateway`,
   letting the ingress controller reach the gateway pod directly even
   though no `Ingress` rule used that path — the k8s-manifest equivalent of
   review-round-2's "gateway reachable without going through Caddy" gap.
   Narrowed to `app: pwa` only, so NetworkPolicy itself is now the real
   enforcement boundary: only `pwa` can open a TCP connection to the
   gateway pod at all. (b) `TRUSTED_PROXY_ADDRESSES` is now set to a CIDR
   covering the cluster's pod network (`infra/k8s/gateway.yaml`, with a
   comment to replace the placeholder with the operator's actual CNI pod
   CIDR) — broader than "only pwa" in isolation, but since (a) already
   restricts who can reach the socket to pwa alone, trusting the pod CIDR
   for X-Forwarded-For resolution only ever actually trusts pwa in
   practice. Also added `missingTrustedProxyWarning()`
   (`services/gateway/src/app.ts`), a pure, directly-unit-tested function
   that produces a startup warning (not a hard refusal — unlike the dev-idp
   boot check, a missing trusted proxy degrades rate-limiting/audit
   accuracy rather than opening a spoofing hole, so it doesn't fail closed)
   whenever `NODE_ENV=production` and no trusted proxy is configured at
   all; wired into `buildGateway()` and covered by
   `services/gateway/test/gateway.test.ts`.
3. **Failed operator-token audit entries never contain the attempted
   token — confirmed, with a new test.** `authenticateOperator()`'s audit
   detail on failure is always exactly `{ reason: ... }`, never the token
   itself; `packages/service-kit`'s logger also redacts the entire request
   `body` (`REDACT_PATHS` includes `'body'`/`'*.body'`), so the raw
   `operatorToken` field can't reach logs that way either. New test in
   `services/counselor-identity-service/test/ops.test.ts` asserts the
   attempted token string doesn't appear anywhere in a failed audit entry.
4. **Session lifetime / revocation window — options only, not
   implemented.** See the PR summary; this round does not pick one.

## Changes required on review, and how each was resolved

1. **Admin-approval circular dependency — resolved by (b).** Recovery
   approval moved entirely to an ops CLI with two distinct, token-authenticated
   operators; it no longer depends on admin web login at all. See §4.
2. **Rate limiting must throttle, not lock out — confirmed and fixed.** Tracing
   the real request path found that `apps/pwa/server/main.js`'s proxy
   **overwrote** `x-forwarded-for` instead of appending to it, which would
   have collapsed every counselor behind one key at the gateway. Fixed, with
   a test. See §5.
3. **Dev provider boot check — tightened to fail closed on any non-whitelisted
   value, including unset.** See §6. Also found (by reading every
   Dockerfile) that **today**, in the existing local/CI docker-compose stack,
   gateway and dev-idp both run with `NODE_ENV=production` already baked in
   — meaning the naive version of this check would have broken the current
   dev stack. Fixed by explicitly setting `NODE_ENV: development` for both
   services in `infra/docker-compose.yml`.
4. **Sign-count zero — not rejected; decrease is a warning, not a hard
   failure.** See §3.
5. **First-enrollment token — unified with the recovery token under the same
   single-use/short-expiry/hashed/audited mechanics.** See §4 and §7.
6. **JWT lifetime, refresh, and credential-removal-ends-session — stated.**
   See §3a (new).
7. **Ops note on RP ID / domain changes — added.** See §2.
8. **`@simplewebauthn/server` pinned to an exact version; lockfile
   committed.** See §1.

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

**Pinned exactly (change 8):** `"@simplewebauthn/server": "14.0.3"` and
`"@simplewebauthn/browser": "14.0.0"` (the two packages are versioned
independently despite shipping from the same project — confirmed directly
against the registry, not assumed to match) — no `^`/`~` range, so a transitive
minor/patch bump can't silently change verification behavior for a
security-critical dependency. `pnpm-lock.yaml` is committed with the exact
resolved tree.

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

**Ops note (change 7): the RP ID is the `VIGIL_DOMAIN` value, so changing the
domain invalidates every passkey.** WebAuthn credentials are cryptographically
scoped to the RP ID at creation time; there is no migration path for a
passkey from one RP ID to another — the authenticator simply won't offer it
for a different RP ID. A domain change (e.g. `vigil.gov.in` →
`vigil-helpline.gov.in`) means **every counselor re-enrolls from scratch**,
via the same admin-assisted recovery flow (§4), as if every passkey had been
lost simultaneously. This must be treated as a deliberate, planned migration
event if it's ever needed — not a routine DNS change.

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

**Sign-count handling (change 4): zero is never rejected; a non-zero decrease
is a warning, not a hard failure.** `@simplewebauthn/server`'s own
`verifyAuthenticationResponse` rejects when `(counter > 0 || stored.counter >
0) && counter <= stored.counter` — correct for a classic hardware key, but
**synced/multi-device passkeys always report counter `0`** (never
incrementing at all), so that condition is already false forever in the
all-zero case and nothing special is needed there. The case that needs a
deliberate decision is a credential that *does* report non-zero values and
then reports a lower one — the library's behavior is to reject outright,
which this project overrides: the stored comparison value passed to the
library is pinned to `0` (which only defeats *the library's own* replay
gate — it has no effect on the cryptographic signature check itself, since
`counter` is just a field inside the signed `authenticatorData`, not an input
to the signature verification). The application code then does its own
comparison against the *real* last-stored counter immediately afterward: a
non-zero decrease is logged as a warning (`audit_log`, category
`counter_decreased`) for an operator to review, but the login still
succeeds. This is a deliberate trade-off, not an oversight: a hard rejection
here is exactly the kind of false positive that could lock a counselor out
during a crisis over a noisy, synced-passkey-era signal, and the backstops
already in this design (≥2 passkeys, admin-assisted recovery with full
credential revocation, append-only audit log) are the actual defense against
a genuinely cloned authenticator — this check is advisory on top of them,
not the last line of defense.

**JWT lifetime, refresh, and credential removal (change 6):**

- **Lifetime: 15 minutes**, deliberately shorter than `dev-idp`'s existing 8h
  dev-token TTL. This is the real mechanism behind "removing a credential
  ends any session it created": JWTs here are stateless RS256, verified by
  the gateway with no DB lookup and no revocation list, exactly as today —
  per the brief, that verification path is unchanged. Revoking a credential
  (self-service removal, or recovery) deletes its row from
  `webauthn_credentials` immediately, so it can never be used to mint a
  *new* token again; a token already issued before revocation remains valid
  for the rest of its own (short) lifetime. 15 minutes bounds that exposure
  window tightly without making re-authentication a burden, since a passkey
  tap is a few seconds, not a typed password.
- **No refresh tokens.** When a token expires, the counselor re-authenticates
  with their passkey — low friction enough that a refresh-token flow (with
  its own storage, rotation and revocation design) isn't worth the added
  surface area here. During a crisis this means, at most, one extra
  biometric/PIN tap if a session happened to expire mid-use — not a login
  form.
- **True instant revocation was considered and rejected** as out of scope:
  it would require the gateway to perform a live lookup (to
  `counselor-identity-service`) on every counselor-scoped request, which
  conflicts directly with the brief's "keep RS256 JWT and the RBAC model
  unchanged" — today the gateway's JWT verification has zero downstream
  dependencies and zero per-request latency cost beyond signature
  verification. Trading that away for instant revocation is a bigger
  architectural change than this item's scope, and the 15-minute bound
  already makes the practical difference small.

## 4. Recovery

This is the hard part, as flagged, and the review surfaced a real
circularity in the first draft: recovery approval was specced as an admin
web-console action, but admin login is `dev-idp`-only, and `dev-idp` now
*correctly* refuses to boot in production (§6). As written, no production
admin could ever approve a recovery — the feature would ship unusable.

**Resolved by option (b): recovery moves entirely to an ops CLI, with two
distinct, token-authenticated operators — not the admin web role at all.**
I did not choose (a) (extending passkeys to admins too): that would mean
designing and building a second, parallel passkey-login system (with its own
bootstrapping — who approves the *first* admin's enrollment?) purely to
unblock this one feature, roughly doubling the size of this item and pulling
in a role explicitly marked out of scope. (b) keeps the admin web role
untouched and genuinely out of scope, at the cost of recovery being an
ops-team action rather than something available directly inside the product
— acceptable, since recovery is already meant to be a rare, deliberate,
out-of-band event (§4 already rejected self-service and automated channels
for it), not a frequent in-app workflow.

- **A small `ops_operators` registry, independent of any role in
  `openapi.yaml`.** Each row: `operator_id`, `display_name`, `token_hash`
  (salted, same pattern as the App-Lock PIN from Phase 1 item 1 — prior art
  already in this codebase), `created_at`, `disabled_at`. Rows are seeded by
  a CLI command (`ops:add-operator`) that generates a token, prints it
  **once** for the operator to store themselves, and persists only its
  hash — the service itself never holds a usable copy after that moment.
  This is deliberately separate from `counselors`/`webauthn_credentials`: an
  operator is infrastructure staff with recovery-approval power, not a
  counselor, and not (today) an in-app admin.
- **Require ≥2 registered passkeys before a counselor's account is
  "active."** After the first passkey registers, the counselor is routed to
  "add a second passkey" with a dismissible banner — dismissing does **not**
  hard-block access. I'm deliberately rejecting a hard lockout for
  non-compliance: blocking a counselor out of the alert queue over a policy
  checkbox is itself a safety regression for a system whose entire purpose
  is getting crisis alerts to a human. The soft nag is the enforcement;
  losing one of two keys is the common case this is actually solving for,
  and it requires no recovery flow at all.
- **Ops-CLI recovery, two distinct operators, for the case where all keys
  are lost.** One operator runs `recovery:request <counselorId>
  --operator-id A --operator-token …`; a **second, different** operator runs
  `recovery:approve <requestId> --operator-id B --operator-token …`. The
  service enforces `requested_by_operator_id != approved_by_operator_id` in
  code — not just a procedural convention — before minting an enrollment
  token. This mirrors why `/v1/admin/*` already requires its own scope check
  "before any routing decision" at the gateway today
  ([`services/gateway/src/app.ts:86-91`](../../services/gateway/src/app.ts))
  — one compromised or coerced operator must not be able to silently take
  over a counselor's access to victims' case data alone.
- **Enrollment tokens (first-time *and* recovery) are one mechanism (change
  5).** A single `enrollment_tokens` table (`type: 'bootstrap' |
  'recovery'`) backs both the very first counselor's enrollment (§7) and
  every recovery: random token, **stored only as a salted hash** (never
  plaintext, same pattern as the operator registry and the App-Lock PIN),
  **expiring in 24h**, **consumed exactly once** via the same
  atomic-`used_at` pattern as challenges (§3), and **logged to `audit_log`
  on both creation and consumption** — who created it (which operator, or
  the bootstrap CLI invocation), when, and when/whether it was used. A
  recovery token lets the counselor register exactly **one** new passkey,
  then immediately prompts for a second (re-establishing the ≥2 policy from
  scratch) — and on completion, **every previously-registered credential for
  that counselor is revoked**, not just marked lost, because a lockout and a
  quiet compromise (stolen device with a saved platform passkey) look
  identical from the server's side, and revoking old keys is the correct
  response to either.
- **Delivery of the link is deliberately NOT automated email/SMS.** The
  operator relays it through whatever out-of-band channel they already use
  to reach staff (phone call, in person). See rejected alternatives below for
  why.
- **Audit entry for every step.** `recovery_requests` rows plus the
  append-only `audit_log` (same append-only spirit as check-ins elsewhere in
  this codebase) record: request raised, second approval, token generated,
  token consumed or expired unused, old credentials revoked — actor (operator
  id), target counselor, timestamp, never deletable through the app's own
  API.

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
- **Single-operator-approved reset (no second approver).** This is the one
  genuinely tempting shortcut, and the one most worth naming explicitly as
  rejected: it would make one compromised or coerced operator sufficient to
  take over any counselor's access. The second approver is the actual
  control, not a formality.

## 5. Abuse controls

- **Rate limiting throttles; it must never collapse into a lockout for
  everyone (change 2).** This was flagged on review as a real availability
  risk — "counselors must still be able to log in during a crisis" — and
  tracing the actual request path found a genuine bug that would have
  caused exactly that failure mode in production:

  **The bug found:** in production, every request flows `browser → Caddy →
  apps/pwa/server/main.js's proxy() → gateway`. Caddy's `reverse_proxy`
  correctly sets `X-Forwarded-For` to the real client IP. But
  `apps/pwa/server/main.js`'s `proxy()` function
  ([`apps/pwa/server/main.js:60`](../../apps/pwa/server/main.js), before this
  fix) built its outgoing headers as `{ ...req.headers, 'x-forwarded-for':
  req.socket.remoteAddress ?? '' }` — **overwriting** the incoming
  `X-Forwarded-For` with its own immediate peer's address (Caddy's) instead
  of appending to it. The gateway would then see only Caddy's address for
  *every* counselor, no matter who they were. Since the gateway's rate
  limiter falls back to IP-keying exactly on unauthenticated requests — i.e.
  exactly the pre-login passkey endpoints — every counselor's login attempts
  would have shared one rate-limit bucket: a handful of failed logins from
  *any* counselor would have throttled *all* of them, during the exact
  moment (a crisis) when a counselor's own login must not fail.

  **Fix:** `proxy()` now appends to the existing header instead of replacing
  it (`[req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean
  ).join(', ')`), preserving the full chain client → Caddy → PWA. The
  gateway is configured with `trustProxy: true` (Fastify/`proxy-addr`'s "trust
  every hop, take the leftmost entry as `req.ip`" mode) so it resolves the
  real originating client. This is safe specifically because, in production,
  the gateway has **no exposed port at all**
  (`infra/compose.prod.yml`: `ports: !reset []`) — the only possible caller is
  the PWA container over the internal network, so there is no path for an
  external attacker to connect directly and forge the header. (In local
  docker-compose the gateway's port *is* exposed, for `scripts/smoke.mjs`
  and direct debugging — that's accepted as a dev-tooling convenience, not a
  production security boundary; nothing there has a real adversary.) A test
  (`services/gateway/test/trust-proxy.test.ts`) proves two requests carrying
  *different* real-client addresses through the same simulated proxy hop
  resolve to different rate-limit keys — i.e. counselors are never bucketed
  together by this bug again.
- **Two layers, both throttling, neither an account lockout.** The gateway's
  existing `@fastify/rate-limit` (120 req/min, now correctly IP-keyed per the
  fix above —
  [`services/gateway/src/app.ts:59-69`](../../services/gateway/src/app.ts))
  still applies as the coarse layer. `counselor-identity-service` adds a
  second, tighter limit keyed on the credential ID *after* an assertion
  resolves it, so a single targeted credential can't be hammered without
  punishing every other counselor sharing an IP. Both are **time-boxed
  backoff** (standard 429 + `Retry-After`, matching the gateway's existing
  `errorResponseBuilder` pattern) — there is deliberately **no account-level
  lockout** anywhere in this design (no "N failed attempts → account
  disabled"). An account lockout is exactly the failure mode change 2 is
  about: a brief attacker-triggered throttle recovers in seconds to minutes;
  a lockout would need an operator to clear it, which is unacceptable for a
  crisis-facing login.
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

**Tightened on review (change 3) to fail closed on anything other than an
explicit whitelist, not merely to block `'production'` specifically:**
`services/dev-idp` now refuses to **boot at all** — not just refuses the
route — unless `DEV_IDP_ENABLED === 'true'` **and** `NODE_ENV` is exactly
`'development'` or `'test'`. Any other value, including an unset
`NODE_ENV`, refuses to start. The check lives inside `buildIdp()` (not
`main.ts`) specifically so it's directly unit tested with explicit env
combinations, not exercised only by actually spawning a process.

**A real breakage this surfaced, found by reading every service's
Dockerfile, not assumed:** every service's Dockerfile
(`services/*/Dockerfile:31`) bakes `ENV NODE_ENV=production` into the image
— **including `dev-idp`'s own image** — and `infra/docker-compose.yml` (the
base file used for local dev **and CI's e2e job**) never overrides it for
either `gateway` or `dev-idp`. That means, **today, before this change**,
the existing local/CI dev stack already runs both containers with
`NODE_ENV=production`. Applying the new whitelist naively would have broken
the current dev stack and CI's e2e job outright. Fixed by adding an explicit
`NODE_ENV: development` override for `gateway` and `dev-idp` in
`infra/docker-compose.yml` only (not `compose.prod.yml`, which already sets
`NODE_ENV: production` explicitly for the gateway and never starts
`dev-idp` at all under `profiles: [dev-only]`). The Dockerfile's baked
default is intentionally left as `production`: an image run standalone
outside this project's compose files fails closed by default.

**The gateway gets the identical fail-closed whitelist**, for the same
reason: if `devIdpUrl` is truthy, `NODE_ENV` must be exactly `'development'`
or `'test'`, or the gateway refuses to boot
(`services/gateway/src/main.ts`, before calling `start()`).

## 7. Migration plan

There is effectively nothing to migrate *from*: no counselor identity is
persisted anywhere in the system today — `dev-idp` issues a token for a fixed
demo subject or any caller-supplied subject with no registration step at
all, and the README already states production's OIDC IdP "is not wired." So
there are no production counselor accounts to preserve compatibility with.

- **Bootstrapping the first enrollment.** Recovery (§4) now runs through the
  ops-operator CLI, not an admin console — but the very first counselor
  still needs a way in with no prior recovery request possible. A one-time
  **bootstrap enrollment token**, type `'bootstrap'` in the same
  `enrollment_tokens` table as recovery (change 5): generated by an ops CLI
  command (not an HTTP endpoint — no standing route in the API surface that
  could be probed), requiring one operator token for attribution, single-use
  via the same hashed/short-expiry/used-at mechanics as every other token in
  this design, logged to `audit_log` on creation and consumption.
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
