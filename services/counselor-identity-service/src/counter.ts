/**
 * Synced/multi-device passkeys always report a sign count of 0 — never
 * flagged, by construction, since `incoming !== 0 && stored !== 0` is
 * already false in that case. A non-zero decrease (the classic cloned-
 * hardware-key signal) is logged as a warning, not rejected: see
 * docs/design/counselor-passkey-login.md §3 for why a hard rejection here
 * would risk locking a counselor out during a crisis over a noisy signal.
 */
export function counterDecreased(stored: number, incoming: number): boolean {
  return incoming !== 0 && stored !== 0 && incoming <= stored;
}
