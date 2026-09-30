import { describe, expect, it } from 'vitest';
import { composite } from '../src/composite.js';
import { DEFAULT_SCORING_CONFIG } from '../src/config.js';
import { engagementDelta, type EngagementSample } from '../src/engagement.js';
import { voiceFlatness, voiceTerm } from '../src/voice.js';

const DAY = 86_400_000;
const daily = (n: number, latency: number | null = 10_000): EngagementSample[] =>
  Array.from({ length: n }, (_, i) => ({ createdAt: i * DAY, responseLatencyMs: latency }));

describe('engagementDelta', () => {
  it('is null for a new person (never penalised for being new)', () => {
    expect(engagementDelta({ createdAt: 0, responseLatencyMs: 5000 }, [])).toBeNull();
    expect(engagementDelta({ createdAt: 3 * DAY, responseLatencyMs: 5000 }, daily(2))).toBeNull();
  });

  it('is 0 when latency and cadence match their own median', () => {
    expect(engagementDelta({ createdAt: 5 * DAY, responseLatencyMs: 10_000 }, daily(5))).toBe(0);
  });

  it('is negative when slower and less frequent than usual', () => {
    const d = engagementDelta({ createdAt: 7 * DAY, responseLatencyMs: 20_000 }, daily(5));
    expect(d).toBeLessThan(0);
    expect(d).toBeGreaterThanOrEqual(-1);
  });

  it('is positive when quicker than usual, clamped to 1', () => {
    expect(engagementDelta({ createdAt: 4.5 * DAY, responseLatencyMs: 0 }, daily(5))).toBeCloseTo(0.75);
  });

  it('uses latency alone when there is too little cadence history', () => {
    expect(engagementDelta({ createdAt: 3 * DAY, responseLatencyMs: 20_000 }, daily(3))).toBe(-1);
  });

  it('uses cadence alone when latency is missing now or in history', () => {
    expect(engagementDelta({ createdAt: 6 * DAY, responseLatencyMs: null }, daily(5))).toBe(-1);
    expect(engagementDelta({ createdAt: 6 * DAY }, daily(5, null))).toBe(-1);
  });

  it('skips a part whose own median is zero', () => {
    const same: EngagementSample[] = Array.from({ length: 5 }, () => ({ createdAt: 0, responseLatencyMs: 0 }));
    expect(engagementDelta({ createdAt: DAY, responseLatencyMs: 100 }, same)).toBeNull();
  });

  it('ignores invalid (negative) historical latencies', () => {
    const history = daily(5).map((h, i) => (i < 3 ? { ...h, responseLatencyMs: -1 } : h));
    // only 2 valid latencies remain → latency part skipped, cadence part only
    expect(engagementDelta({ createdAt: 5 * DAY, responseLatencyMs: 999_999 }, history)).toBe(0);
  });

  it('only looks at the configured window', () => {
    const history = [...daily(5, 1_000_000), ...daily(5).map((h) => ({ ...h, createdAt: h.createdAt + 5 * DAY }))];
    expect(engagementDelta({ createdAt: 10 * DAY, responseLatencyMs: 10_000 }, history, 5)).toBe(0);
  });
});

describe('voice', () => {
  it('flatness is 1 for monotone+quiet speech and 0 for animated speech', () => {
    expect(voiceFlatness({ pitchVar: 0, rms: 0 })).toBe(1);
    expect(voiceFlatness({ pitchVar: 1, rms: 1 })).toBe(0);
  });

  it('voiceTerm re-centres flatness as 1 − 2·flatness', () => {
    expect(voiceTerm({ pitchVar: 0, rms: 0 })).toBe(-1);
    expect(voiceTerm({ pitchVar: 1, rms: 1 })).toBe(1);
  });

  it('voiceTerm is null when there is no usable sample', () => {
    expect(voiceTerm(null)).toBeNull();
    expect(voiceTerm(undefined)).toBeNull();
    expect(voiceTerm({ pitchVar: Number.NaN, rms: 0.1 })).toBeNull();
    expect(voiceTerm({ pitchVar: 0.1, rms: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('composite', () => {
  const cfg = DEFAULT_SCORING_CONFIG;

  it('uses w1=0.35, w2=0.30, w3=0.20, w4=0.15 by default', () => {
    expect(cfg.weights).toEqual({ selfReport: 0.35, sentiment: 0.3, engagement: 0.2, voice: 0.15 });
  });

  it('is the weighted sum of the four terms', () => {
    const c = composite({ selfReport: 1, sentiment: -1, engagement: 0.5, voice: -0.5 }, cfg);
    expect(c).toBeCloseTo(0.35 - 0.3 + 0.1 - 0.075);
  });

  it('treats missing signals as neutral (0)', () => {
    expect(composite({ selfReport: null, sentiment: null, engagement: null, voice: null }, cfg)).toBe(0);
    expect(composite({ selfReport: -1, sentiment: null, engagement: null, voice: null }, cfg)).toBeCloseTo(-0.35);
  });

  it('is clamped to [-1, 1] even with over-weighted configs', () => {
    const heavy = { weights: { selfReport: 1, sentiment: 1, engagement: 1, voice: 1 } };
    expect(composite({ selfReport: 1, sentiment: 1, engagement: 1, voice: 1 }, heavy)).toBe(1);
    expect(composite({ selfReport: -1, sentiment: -1, engagement: -1, voice: -1 }, heavy)).toBe(-1);
  });
});
