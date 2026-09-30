import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_CONFIG } from '../src/config.js';
import { scoreCheckIn } from '../src/score-check-in.js';

const cfg = DEFAULT_SCORING_CONFIG;

describe('scoreCheckIn', () => {
  it('scores a tap-only check-in with no text or voice', () => {
    const s = scoreCheckIn({ createdAt: 0, selfReport: { safe: 4, heavy: 0 } }, [], cfg);
    expect(s.terms).toEqual({ selfReport: 1, sentiment: null, engagement: null, voice: null });
    expect(s.sentimentScore).toBeNull();
    expect(s.compositeScore).toBeCloseTo(0.35);
    expect(s.crisis.matched).toBe(false);
    expect(s.configVersion).toBe(1);
  });

  it('treats whitespace-only text as no text', () => {
    expect(scoreCheckIn({ createdAt: 0, selfReport: {}, text: '   ' }, [], cfg).terms.sentiment).toBeNull();
  });

  it('scores text sentiment and runs the crisis scan on it', () => {
    const s = scoreCheckIn({ createdAt: 0, selfReport: {}, text: 'I feel hopeless, I want to die' }, [], cfg);
    expect(s.sentimentScore).toBeLessThan(0);
    expect(s.crisis.matched).toBe(true);
  });

  it('includes engagement and voice when available', () => {
    const history = Array.from({ length: 5 }, (_, i) => ({ createdAt: i * 1000, responseLatencyMs: 100 }));
    const s = scoreCheckIn(
      { createdAt: 5000, selfReport: {}, responseLatencyMs: 100, voiceFeatures: { pitchVar: 1, rms: 1 } },
      history,
      cfg,
    );
    expect(s.terms.engagement).toBe(0);
    expect(s.terms.voice).toBe(1);
    expect(s.compositeScore).toBeCloseTo(0.15);
  });
});
