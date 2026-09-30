/**
 * Trend detection against the person's OWN baseline.
 *
 *   Baseline : rolling mean μ / sample σ of composite over the N check-ins
 *              *preceding* the one being scored (never including itself).
 *   z(i)     = (composite(i) − μ) / max(σ, sigmaFloor)
 *   Fires if : z(i) ≤ T and z(i−1) ≤ T (both computed on their own baselines),
 *              OR the least-squares slope over the last `slopeWindow` check-ins
 *              is below −slopeThreshold.
 *   Gate     : no trend alert of either kind before `minBaseline` prior
 *              check-ins exist.
 */
import type { ScoringConfig } from './config.js';
import { TERM_KEYS, type SignalTerms, type TermKey } from './composite.js';
import { linearSlope, mean, stddev } from './math.js';

export interface ScoredPoint {
  at: number;
  composite: number;
  terms: SignalTerms;
}

export interface Baseline {
  mean: number;
  stddev: number;
  windowSize: number;
  sufficient: boolean;
}

export type TrendSignal = 'self_report' | 'sentiment' | 'engagement' | 'voice';

export interface TrendEvaluation {
  baseline: Baseline;
  z: number | null;
  zPrev: number | null;
  slope: number | null;
  zRule: boolean;
  slopeRule: boolean;
  fired: boolean;
  severity: 'urgent' | 'elevated' | null;
  signalsInvolved: TrendSignal[];
}

const SIGNAL_NAME: Record<TermKey, TrendSignal> = {
  selfReport: 'self_report',
  sentiment: 'sentiment',
  engagement: 'engagement',
  voice: 'voice',
};

type BaselineCfg = Pick<ScoringConfig, 'baselineWindow' | 'minBaseline'>;

/** Baseline from the points strictly before the one being scored. */
export function computeBaseline(prior: readonly ScoredPoint[], cfg: BaselineCfg): Baseline {
  const window = prior.slice(-cfg.baselineWindow).map((p) => p.composite);
  return {
    mean: mean(window),
    stddev: stddev(window),
    windowSize: window.length,
    sufficient: window.length >= cfg.minBaseline,
  };
}

export function zScore(value: number, b: Baseline, sigmaFloor: number): number | null {
  if (!b.sufficient) return null;
  return (value - b.mean) / Math.max(b.stddev, sigmaFloor);
}

/**
 * Which signals pulled this check-in down: a term is "involved" when it sits at
 * least `involvementThreshold` below its own mean over the baseline window. If
 * none crosses the threshold (a diffuse drift), the single most-declined term
 * is named so the reason text is never empty when a term declined at all.
 */
export function signalsInvolved(
  current: ScoredPoint,
  prior: readonly ScoredPoint[],
  cfg: Pick<ScoringConfig, 'baselineWindow' | 'involvementThreshold'>,
): TrendSignal[] {
  const window = prior.slice(-cfg.baselineWindow);
  const deltas: { key: TermKey; delta: number }[] = [];
  for (const key of TERM_KEYS) {
    const now = current.terms[key];
    const past = window.map((p) => p.terms[key]).filter((v): v is number => v !== null);
    if (now === null || past.length === 0) continue;
    deltas.push({ key, delta: now - mean(past) });
  }
  const involved = deltas.filter((d) => d.delta <= -cfg.involvementThreshold);
  if (involved.length > 0) return involved.map((d) => SIGNAL_NAME[d.key]);
  const declined = deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta);
  return declined.length > 0 ? [SIGNAL_NAME[(declined[0] as { key: TermKey }).key]] : [];
}

/**
 * Evaluate the latest point of `series` (oldest first; the last element is the
 * check-in just scored).
 */
export function evaluateTrend(series: readonly ScoredPoint[], cfg: ScoringConfig): TrendEvaluation {
  const n = series.length;
  const current = series[n - 1];
  const prior = series.slice(0, -1);
  const baseline = computeBaseline(prior, cfg);

  if (!current) {
    return {
      baseline, z: null, zPrev: null, slope: null,
      zRule: false, slopeRule: false, fired: false, severity: null, signalsInvolved: [],
    };
  }

  const z = zScore(current.composite, baseline, cfg.sigmaFloor);
  const prev = series[n - 2];
  const zPrev = prev ? zScore(prev.composite, computeBaseline(series.slice(0, -2), cfg), cfg.sigmaFloor) : null;
  const zRule = z !== null && zPrev !== null && z <= cfg.zThreshold && zPrev <= cfg.zThreshold;

  const slope = baseline.sufficient && n >= cfg.slopeWindow
    ? linearSlope(series.slice(-cfg.slopeWindow).map((p) => p.composite))
    : null;
  const slopeRule = slope !== null && slope < -cfg.slopeThreshold;

  const fired = zRule || slopeRule;
  const severity = !fired ? null : zRule && (z as number) <= cfg.urgentZThreshold ? 'urgent' : 'elevated';

  return {
    baseline, z, zPrev, slope, zRule, slopeRule, fired, severity,
    signalsInvolved: fired ? signalsInvolved(current, prior, cfg) : [],
  };
}
