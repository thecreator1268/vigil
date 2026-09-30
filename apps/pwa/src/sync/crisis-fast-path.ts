/**
 * Crisis Fast-Path — an isolated module with its own, more aggressive policy:
 *
 *  - an immediate send attempt the moment a crisis check-in is saved locally
 *  - a hard 3s timeout per attempt (a slow network must not stall it)
 *  - a fixed retry every 15s until delivered (no exponential backoff)
 *  - its own Dexie queue, so it survives restarts and never waits behind
 *    ordinary sync traffic
 *  - surfaced distinctly in the sync-status indicator
 *
 * It bypasses the composite/trend pipeline entirely; the server raises an
 * urgent alert straight from it.
 */
import { tables, type CrisisQueueItem } from '../db';

export const CRISIS_TIMEOUT_MS = 3_000;
export const CRISIS_RETRY_MS = 15_000;

export type CrisisSender = (checkInId: string, signal: AbortSignal) => Promise<void>;

export interface CrisisEvents {
  onChange?: (s: { pending: number; delivered: number; lastError: string | null }) => void;
}

export class CrisisFastPath {
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = new Set<string>();

  constructor(
    private readonly send: CrisisSender,
    private readonly events: CrisisEvents = {},
    private readonly now: () => number = Date.now,
  ) {}

  /** Register a crisis check-in (already durable in Dexie) and attempt delivery immediately. */
  async flag(checkInId: string): Promise<boolean> {
    const existing = await tables.crisisQueue.where('checkInId').equals(checkInId).first();
    if (!existing) {
      await tables.crisisQueue.add({ checkInId, attempts: 0, lastError: null, nextAttemptAt: this.now(), createdAt: this.now() });
    }
    const item = (await tables.crisisQueue.where('checkInId').equals(checkInId).first()) as CrisisQueueItem;
    return this.attempt(item);
  }

  async pendingCount(): Promise<number> {
    return tables.crisisQueue.count();
  }

  /** One delivery attempt with a 3s timeout. Returns true when delivered. */
  async attempt(item: CrisisQueueItem): Promise<boolean> {
    if (this.inFlight.has(item.checkInId)) return false;
    this.inFlight.add(item.checkInId);
    try {
      await this.send(item.checkInId, AbortSignal.timeout(CRISIS_TIMEOUT_MS));
      await tables.crisisQueue.delete(item.seq as number);
      await this.report(1, null);
      return true;
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      await tables.crisisQueue.update(item.seq as number, {
        attempts: item.attempts + 1,
        lastError,
        nextAttemptAt: this.now() + CRISIS_RETRY_MS,
      });
      await this.report(0, lastError);
      return false;
    } finally {
      this.inFlight.delete(item.checkInId);
    }
  }

  /** Attempt everything that is due. */
  async runOnce(): Promise<number> {
    const due = await tables.crisisQueue.where('nextAttemptAt').belowOrEqual(this.now()).toArray();
    let delivered = 0;
    for (const item of due) if (await this.attempt(item)) delivered++;
    return delivered;
  }

  start(): void {
    this.timer = setInterval(() => void this.runOnce(), CRISIS_RETRY_MS);
    window.addEventListener('online', this.onOnline);
    void this.runOnce();
  }

  stop(): void {
    clearInterval(this.timer);
    window.removeEventListener('online', this.onOnline);
  }

  private onOnline = () => {
    void tables.crisisQueue.toCollection().modify({ nextAttemptAt: this.now() }).then(() => this.runOnce());
  };

  private async report(delivered: number, lastError: string | null) {
    this.events.onChange?.({ pending: await this.pendingCount(), delivered, lastError });
  }
}
