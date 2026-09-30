import { describe, expect, it } from 'vitest';
import { normalizeSelfReport, SELF_REPORT_QUESTIONS } from '../src/self-report.js';

describe('normalizeSelfReport', () => {
  it('ships 3–5 questions (PHQ-2-style brevity)', () => {
    expect(SELF_REPORT_QUESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(SELF_REPORT_QUESTIONS.length).toBeLessThanOrEqual(5);
  });

  it('maps positive-polarity answers so higher is better', () => {
    expect(normalizeSelfReport({ safe: 4 })).toBe(1);
    expect(normalizeSelfReport({ safe: 2 })).toBe(0);
    expect(normalizeSelfReport({ safe: 0 })).toBe(-1);
  });

  it('reverses negative-polarity answers', () => {
    expect(normalizeSelfReport({ heavy: 4 })).toBe(-1);
    expect(normalizeSelfReport({ heavy: 0 })).toBe(1);
  });

  it('averages only the answered questions', () => {
    expect(normalizeSelfReport({ heavy: 4, safe: 4 })).toBe(0);
    expect(normalizeSelfReport({ heavy: 3, interest: 1, sleep: 1, safe: 1 })).toBe(-0.5);
  });

  it('returns null when everything is skipped — no penalty for skipping', () => {
    expect(normalizeSelfReport({})).toBeNull();
  });

  it('ignores unknown ids and out-of-range or non-integer answers', () => {
    expect(normalizeSelfReport({ unknown: 4 })).toBeNull();
    expect(normalizeSelfReport({ safe: 5 })).toBeNull();
    expect(normalizeSelfReport({ safe: -1 })).toBeNull();
    expect(normalizeSelfReport({ safe: 2.5 })).toBeNull();
    expect(normalizeSelfReport({ safe: 4, bogus: 0 })).toBe(1);
  });
});
