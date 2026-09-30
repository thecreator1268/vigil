import { describe, expect, it } from 'vitest';
import { buildCrisisAlert, buildTrendAlert, crisisReasonText, trendReasonText } from '../src/alerts.js';
import { scanForCrisis } from '../src/crisis/matcher.js';
import type { TrendEvaluation } from '../src/trend.js';

const baseEval: TrendEvaluation = {
  baseline: { mean: 0.5, stddev: 0.1, windowSize: 6, sufficient: true },
  z: -2, zPrev: -2, slope: -0.2,
  zRule: true, slopeRule: false, fired: true, severity: 'elevated',
  signalsInvolved: ['sentiment', 'self_report'],
};

const hasDigit = (s: string) => /\d/.test(s);

describe('trend alerts', () => {
  it('never includes a score, and orders signals canonically', () => {
    const a = buildTrendAlert(baseEval, 3);
    expect(a).toEqual({
      severity: 'elevated',
      signals_involved: ['self_report', 'sentiment'],
      reason_text: expect.any(String),
      raw_score: null,
      source: 'trend',
      configVersion: 3,
    });
    expect(hasDigit(a!.reason_text)).toBe(false);
  });

  it('returns null when nothing fired', () => {
    expect(buildTrendAlert({ ...baseEval, fired: false, severity: null }, 1)).toBeNull();
    expect(buildTrendAlert({ ...baseEval, severity: null }, 1)).toBeNull();
  });

  it('chooses the lead sentence from the rule(s) that fired', () => {
    expect(trendReasonText({ ...baseEval, slopeRule: true })).toMatch(/continuing a steady decline/);
    expect(trendReasonText(baseEval)).toMatch(/^Their last two check-ins were noticeably lower than what is usual for them\./);
    expect(trendReasonText({ ...baseEval, zRule: false, slopeRule: true })).toMatch(/getting steadily harder/);
  });

  it('explains each involved signal in "what they told us" language', () => {
    const text = trendReasonText({ ...baseEval, signalsInvolved: ['self_report', 'sentiment', 'engagement', 'voice'] });
    expect(text).toMatch(/In their own answers, they told us/);
    expect(text).toMatch(/words they chose/);
    expect(text).toMatch(/longer than usual/);
    expect(text).toMatch(/supporting sign only/);
  });

  it('urgent trend alerts ask for contact today', () => {
    expect(trendReasonText({ ...baseEval, severity: 'urgent' })).toMatch(/today\.$/);
    expect(trendReasonText(baseEval)).toMatch(/when you can/);
  });
});

describe('crisis alerts', () => {
  it('are always urgent, crisis_scan only, and never carry a score', () => {
    const a = buildCrisisAlert(scanForCrisis('I want to die'), 2);
    expect(a).toMatchObject({ severity: 'urgent', signals_involved: ['crisis_scan'], raw_score: null, source: 'crisis', configVersion: 2 });
    expect(hasDigit(a!.reason_text)).toBe(false);
  });

  it('returns null when nothing matched', () => {
    expect(buildCrisisAlert(scanForCrisis('a quiet day'), 1)).toBeNull();
  });

  it('describes each category plainly', () => {
    expect(crisisReasonText(['self_harm'])).toMatch(/harming themselves/);
    expect(crisisReasonText(['threat_to_safety'])).toMatch(/threatening their safety/);
    const both = crisisReasonText(['self_harm', 'threat_to_safety']);
    expect(both).toMatch(/harming themselves/);
    expect(both).toMatch(/threatening their safety/);
    expect(crisisReasonText([])).toMatch(/crisis protocol/);
  });
});
