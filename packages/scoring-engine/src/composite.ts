/**
 *   composite(i) = w1·normalize(self_report_i) + w2·sentiment_i
 *                + w3·engagement_delta_i + w4·voice_flatness_i
 *
 * Every term is wellbeing-oriented in [-1, 1] (0 = neutral), so the distressed
 * direction is always negative. A missing signal contributes 0. With the
 * default weights summing to 1 the composite is in [-1, 1]; it is clamped
 * there regardless of config.
 */
import type { ScoringConfig } from './config.js';
import { clamp } from './math.js';

export interface SignalTerms {
  selfReport: number | null;
  sentiment: number | null;
  engagement: number | null;
  voice: number | null;
}

export const TERM_KEYS = ['selfReport', 'sentiment', 'engagement', 'voice'] as const;
export type TermKey = (typeof TERM_KEYS)[number];

export function composite(terms: SignalTerms, cfg: Pick<ScoringConfig, 'weights'>): number {
  const w = cfg.weights;
  const raw =
    w.selfReport * (terms.selfReport ?? 0) +
    w.sentiment * (terms.sentiment ?? 0) +
    w.engagement * (terms.engagement ?? 0) +
    w.voice * (terms.voice ?? 0);
  return clamp(raw, -1, 1);
}
