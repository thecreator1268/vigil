/**
 * Transactional-outbox dispatcher: delivers crisis alerts (first) and trend
 * points to downstream services with exponential backoff (5s → 5min cap).
 */
import type { FastifyBaseLogger } from 'fastify';
import type { InternalClient } from '@vigil/service-kit';
import type { CheckinRepo, OutboxEvent } from './repo.js';

export interface DispatcherOptions {
  repo: CheckinRepo;
  call: InternalClient;
  urls: { alert: string; trend: string };
  log: FastifyBaseLogger;
  intervalMs?: number;
  now?: () => number;
}

export const backoffMs = (attempts: number) => Math.min(5_000 * 2 ** attempts, 300_000);

export function createDispatcher(o: DispatcherOptions) {
  const now = o.now ?? Date.now;
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  async function deliver(e: OutboxEvent) {
    const url = e.topic === 'alert.crisis' ? `${o.urls.alert}/internal/alerts` : `${o.urls.trend}/internal/points`;
    await o.call(url, { method: 'POST', body: e.payload });
  }

  async function drain(): Promise<number> {
    if (running) return 0;
    running = true;
    let delivered = 0;
    try {
      for (;;) {
        const batch = await o.repo.claimOutbox(20, now());
        if (batch.length === 0) break;
        for (const e of batch) {
          try {
            await deliver(e);
            await o.repo.markDelivered(e.id, now());
            delivered++;
          } catch (err) {
            const next = now() + backoffMs(e.attempts);
            await o.repo.markFailed(e.id, (err as Error).message, next);
            const level = e.topic === 'alert.crisis' ? 'error' : 'warn';
            o.log[level]({ outboxId: e.id, topic: e.topic, attempts: e.attempts + 1 }, 'outbox delivery failed; will retry');
          }
        }
      }
    } finally {
      running = false;
    }
    return delivered;
  }

  return {
    drain,
    kick: () => void drain().catch((err) => o.log.error({ err: (err as Error).message }, 'outbox drain failed')),
    start() {
      timer = setInterval(() => void drain().catch(() => undefined), o.intervalMs ?? 2000);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}
