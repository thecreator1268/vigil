/**
 * Signal 3 — engagement relative to the person's OWN rolling median, never a
 * population norm. Two parts, each wellbeing-oriented in [-1, 1]:
 *   latency : slower than their usual response time → negative
 *   cadence : a longer gap since last check-in than usual → negative
 * Returns their mean, or null when there isn't enough history to compare
 * against (a new user is never penalised for being new).
 */
import { clamp, mean, median } from './math.js';

export interface EngagementSample {
  createdAt: number;
  responseLatencyMs?: number | null;
}

export const MIN_ENGAGEMENT_HISTORY = 3;

function relativeDelta(usual: number, now: number): number | null {
  if (usual <= 0) return null;
  return clamp((usual - now) / usual, -1, 1);
}

/**
 * @param current  the check-in being scored
 * @param history  the person's previous check-ins, oldest first
 */
export function engagementDelta(
  current: EngagementSample,
  history: readonly EngagementSample[],
  window = 10,
): number | null {
  const recent = history.slice(-window);
  const parts: number[] = [];

  const latencies = recent
    .map((h) => h.responseLatencyMs)
    .filter((l): l is number => typeof l === 'number' && l >= 0);
  if (current.responseLatencyMs != null && latencies.length >= MIN_ENGAGEMENT_HISTORY) {
    const d = relativeDelta(median(latencies), current.responseLatencyMs);
    if (d !== null) parts.push(d);
  }

  if (recent.length >= MIN_ENGAGEMENT_HISTORY + 1) {
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      gaps.push((recent[i] as EngagementSample).createdAt - (recent[i - 1] as EngagementSample).createdAt);
    }
    const last = recent[recent.length - 1] as EngagementSample;
    const d = relativeDelta(median(gaps), current.createdAt - last.createdAt);
    if (d !== null) parts.push(d);
  }

  return parts.length ? mean(parts) : null;
}
