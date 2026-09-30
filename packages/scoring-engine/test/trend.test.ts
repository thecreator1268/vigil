import { describe, expect, it } from 'vitest';
import type { SignalTerms } from '../src/composite.js';
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from '../src/config.js';
import { computeBaseline, evaluateTrend, signalsInvolved, zScore, type ScoredPoint } from '../src/trend.js';

const cfg = DEFAULT_SCORING_CONFIG as ScoringConfig;
const neutral: SignalTerms = { selfReport: 0.5, sentiment: 0.5, engagement: 0, voice: null };

function series(composites: number[], terms: (i: number) => SignalTerms = () => neutral): ScoredPoint[] {
  return composites.map((c, i) => ({ at: i * 86_400_000, composite: c, terms: terms(i) }));
}

describe('computeBaseline', () => {
  it('uses the last N prior points and flags sufficiency at minBaseline', () => {
    const b = computeBaseline(series([9, 9, 1, 1, 1, 1]), { baselineWindow: 4, minBaseline: 4 });
    expect(b).toEqual({ mean: 1, stddev: 0, windowSize: 4, sufficient: true });
    expect(computeBaseline(series([1, 1, 1]), cfg).sufficient).toBe(false);
  });
});

describe('zScore', () => {
  it('is null until the baseline is sufficient', () => {
    expect(zScore(0, { mean: 0, stddev: 1, windowSize: 3, sufficient: false }, 0.05)).toBeNull();
  });

  it('floors σ so a perfectly steady baseline cannot divide by zero', () => {
    expect(zScore(0.4, { mean: 0.5, stddev: 0, windowSize: 5, sufficient: true }, 0.05)).toBeCloseTo(-2);
    expect(zScore(0, { mean: 0.5, stddev: 0.25, windowSize: 5, sufficient: true }, 0.05)).toBeCloseTo(-2);
  });
});

describe('evaluateTrend', () => {
  it('returns a quiet evaluation for an empty series', () => {
    const ev = evaluateTrend([], cfg);
    expect(ev.fired).toBe(false);
    expect(ev.z).toBeNull();
    expect(ev.severity).toBeNull();
  });

  it('never fires before the minimum of 4 prior check-ins, however steep', () => {
    for (let n = 1; n <= 4; n++) {
      const ev = evaluateTrend(series([0.9, 0.3, -0.3, -0.9].slice(0, n)), cfg);
      expect(ev.fired).toBe(false);
      expect(ev.z).toBeNull();
      expect(ev.slope).toBeNull();
    }
  });

  it('fires on z(i) and z(i−1) both ≤ T', () => {
    const noSlope = { ...cfg, slopeThreshold: 10 };
    const ev = evaluateTrend(series([0.5, 0.52, 0.48, 0.5, 0.51, -0.3, -0.35]), noSlope);
    expect(ev.zRule).toBe(true);
    expect(ev.slopeRule).toBe(false);
    expect(ev.z).toBeLessThanOrEqual(cfg.zThreshold);
    expect(ev.zPrev).toBeLessThanOrEqual(cfg.zThreshold);
    expect(ev.fired).toBe(true);
    expect(ev.severity).toBe('elevated');
  });

  it('does not fire on a single low check-in (z(i−1) above T)', () => {
    const noSlope = { ...cfg, slopeThreshold: 10 };
    const ev = evaluateTrend(series([0.5, 0.52, 0.48, 0.5, 0.51, 0.49, -0.35]), noSlope);
    expect(ev.z).toBeLessThanOrEqual(cfg.zThreshold);
    expect(ev.zPrev).toBeGreaterThan(cfg.zThreshold);
    expect(ev.fired).toBe(false);
  });

  it('upgrades to urgent when z(i) ≤ the urgent threshold', () => {
    const ev = evaluateTrend(series([0.5, 0.51, 0.49, 0.5, 0.52, 0.48, 0.5, 0.51, -0.5, -0.6]), cfg);
    expect(ev.zRule).toBe(true);
    expect(ev.z).toBeLessThanOrEqual(cfg.urgentZThreshold);
    expect(ev.severity).toBe('urgent');
  });

  it('fires on the slope rule alone (elevated) when z never crosses T', () => {
    const noZ = { ...cfg, zThreshold: -100 };
    const ev = evaluateTrend(series([0.6, 0.6, 0.5, 0.4, 0.3, 0.2]), noZ);
    expect(ev.zRule).toBe(false);
    expect(ev.slope).toBeLessThan(-cfg.slopeThreshold);
    expect(ev.slopeRule).toBe(true);
    expect(ev.severity).toBe('elevated');
  });

  it('allows the slope rule at exactly minBaseline prior points', () => {
    const ev = evaluateTrend(series([0.8, 0.6, 0.4, 0.2, 0.0]), cfg);
    expect(ev.baseline.sufficient).toBe(true);
    expect(ev.zPrev).toBeNull();
    expect(ev.slopeRule).toBe(true);
  });

  it('skips the slope when there are fewer points than the slope window', () => {
    const ev = evaluateTrend(series([0.5, 0.5, 0.1]), { ...cfg, minBaseline: 2 });
    expect(ev.baseline.sufficient).toBe(true);
    expect(ev.slope).toBeNull();
  });

  it('does not fire on a stable or improving series', () => {
    expect(evaluateTrend(series([0.1, 0.2, 0.2, 0.3, 0.4, 0.5, 0.6]), cfg).fired).toBe(false);
  });

  it('names the signals that pulled the check-in down', () => {
    const terms = (i: number): SignalTerms =>
      i < 6 ? neutral : { selfReport: -0.5, sentiment: -0.6, engagement: 0, voice: null };
    const ev = evaluateTrend(series([0.5, 0.52, 0.48, 0.5, 0.51, -0.3, -0.35], terms), cfg);
    expect(ev.signalsInvolved).toEqual(['self_report', 'sentiment']);
  });
});

describe('signalsInvolved', () => {
  const opts = { baselineWindow: 10, involvementThreshold: 0.25 };
  const prior = series([0.5, 0.5, 0.5, 0.5]);

  it('falls back to the single most-declined term on a diffuse drift', () => {
    const current: ScoredPoint = { at: 0, composite: 0, terms: { selfReport: 0.4, sentiment: 0.35, engagement: 0, voice: null } };
    expect(signalsInvolved(current, prior, opts)).toEqual(['sentiment']);
  });

  it('returns nothing when no term declined', () => {
    const current: ScoredPoint = { at: 0, composite: 0, terms: { selfReport: 0.9, sentiment: 0.9, engagement: 0.1, voice: null } };
    expect(signalsInvolved(current, prior, opts)).toEqual([]);
  });

  it('skips terms that are missing now or have no history', () => {
    const current: ScoredPoint = { at: 0, composite: 0, terms: { selfReport: null, sentiment: 0.5, engagement: 0, voice: -1 } };
    expect(signalsInvolved(current, prior, opts)).toEqual([]);
  });
});
