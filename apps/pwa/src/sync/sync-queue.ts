/**
 * Application-level Sync Queue — distinct from Workbox's asset caching.
 *
 *  - persisted in Dexie, so it survives app restarts and reloads
 *  - exponential backoff from 5s, capped at 5min
 *  - tracks retry count and last error per item
 *  - permanent (4xx) failures are parked, not retried forever
 *
 * Crisis check-ins never enter this queue; they go through the separate
 * Crisis Fast-Path (./crisis-fast-path.ts).
 */
import { tables, type SyncKind, type SyncQueueItem } from '../db';

export const BASE_DELAY_MS = 5_000;
export const MAX_DELAY_MS = 300_000;

/** Delay before retry number `attempts` (1 = first retry). */
export const backoffMs = (attempts: number) => Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);

export interface Transport {
  send(item: SyncQueueItem): Promise<void>;
}

export interface QueueEvents {
  onChange?: (s: { pending: number; syncing: boolean; delivered: number; lastError: string | null }) => void;
}

function isPermanent(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'permanent' in err && (err as { permanent: boolean }).permanent;
}

export class SyncQueue {
  private inFlight: Promise<number> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly transport: Transport,
    private readonly events: QueueEvents = {},
    private readonly now: () => number = Date.now,
  ) {}

  async enqueue(kind: SyncKind, refId: string): Promise<void> {
    // one live item per (kind, refId)
    const dup = await tables.syncQueue.where('refId').equals(refId).filter((i) => i.kind === kind && !i.parked).first();
    if (!dup) {
      await tables.syncQueue.add({ kind, refId, attempts: 0, lastError: null, nextAttemptAt: this.now(), createdAt: this.now() });
    }
    await this.report(false, 0, null);
    void this.runOnce();
  }

  async pendingCount(): Promise<number> {
    return tables.syncQueue.filter((i) => !i.parked).count();
  }

  /**
   * Process every item that is due. Concurrent callers join the pass already
   * in flight, so `await runOnce()` always means "after a full pass".
   */
  runOnce(): Promise<number> {
    this.inFlight ??= this.pass().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async pass(): Promise<number> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    let delivered = 0;
    let lastError: string | null = null;
    try {
      const due = await tables.syncQueue
        .where('nextAttemptAt')
        .belowOrEqual(this.now())
        .filter((i) => !i.parked)
        .sortBy('seq');
      if (due.length) await this.report(true, delivered, null);
      for (const item of due) {
        try {
          await this.transport.send(item);
          await tables.syncQueue.delete(item.seq as number);
          delivered++;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          const attempts = item.attempts + 1;
          await tables.syncQueue.update(item.seq as number, {
            attempts,
            lastError,
            nextAttemptAt: this.now() + backoffMs(attempts),
            parked: isPermanent(err),
          });
        }
      }
    } finally {
      await this.report(false, delivered, lastError);
    }
    return delivered;
  }

  start(intervalMs = 2_000): void {
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    window.addEventListener('online', this.onOnline);
    void this.runOnce();
  }

  stop(): void {
    clearInterval(this.timer);
    window.removeEventListener('online', this.onOnline);
  }

  private onOnline = () => {
    // Coming back online: everything is due now, not at its backed-off time.
    void tables.syncQueue
      .filter((i) => !i.parked)
      .modify({ nextAttemptAt: this.now() })
      .then(() => this.runOnce());
  };

  private async report(syncing: boolean, delivered: number, lastError: string | null) {
    this.events.onChange?.({ pending: await this.pendingCount(), syncing, delivered, lastError });
  }
}
