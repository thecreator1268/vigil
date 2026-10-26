/**
 * In-memory, time-boxed throttle — not a durable security control, just a
 * backoff. Deliberately no account-level lockout anywhere in this module:
 * see docs/design/counselor-passkey-login.md §5 ("throttle, never lock
 * out" — a counselor must still be able to log in during a crisis).
 */
export class SlidingWindowThrottle {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records one attempt for `key` and returns whether it's allowed. */
  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    return recent.length <= this.max;
  }
}
