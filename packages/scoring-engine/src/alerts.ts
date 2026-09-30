/**
 * Alert construction. Every alert carries a plain-English, template-generated
 * reason and NEVER a score: `raw_score` is typed as the literal `null`.
 *
 * Tone rules (trauma-informed, counselor-facing): describe what the person
 * told us, not what we "detected" about them; no clinical labels; no numbers.
 */
import type { CrisisResult } from './crisis/matcher.js';
import type { TrendEvaluation, TrendSignal } from './trend.js';

export type AlertSignal = TrendSignal | 'crisis_scan';

export interface AlertDraft {
  severity: 'urgent' | 'elevated';
  signals_involved: AlertSignal[];
  reason_text: string;
  raw_score: null;
  source: 'trend' | 'crisis';
  configVersion: number;
}

const SIGNAL_SENTENCE: Record<TrendSignal, string> = {
  self_report: 'In their own answers, they told us things have been harder than usual.',
  sentiment: 'The words they chose carried more distress than they usually do.',
  engagement: 'They took longer than usual to respond or to check in.',
  voice: 'Their voice sounded flatter than usual (a supporting sign only, never used on its own).',
};

const SIGNAL_ORDER: readonly TrendSignal[] = ['self_report', 'sentiment', 'engagement', 'voice'];

export function trendReasonText(ev: Pick<TrendEvaluation, 'zRule' | 'slopeRule' | 'signalsInvolved' | 'severity'>): string {
  let lead: string;
  if (ev.zRule && ev.slopeRule) {
    lead = 'Their last two check-ins were noticeably lower than what is usual for them, continuing a steady decline.';
  } else if (ev.zRule) {
    lead = 'Their last two check-ins were noticeably lower than what is usual for them.';
  } else {
    lead = 'Their check-ins have been getting steadily harder over the past several days.';
  }
  const details = SIGNAL_ORDER.filter((s) => ev.signalsInvolved.includes(s)).map((s) => SIGNAL_SENTENCE[s]);
  const close =
    ev.severity === 'urgent'
      ? 'Please reach out to them today.'
      : 'Please reach out when you can and ask how they are doing.';
  return [lead, ...details, close].join(' ');
}

export function buildTrendAlert(ev: TrendEvaluation, configVersion: number): AlertDraft | null {
  if (!ev.fired || ev.severity === null) return null;
  return {
    severity: ev.severity,
    signals_involved: SIGNAL_ORDER.filter((s) => ev.signalsInvolved.includes(s)),
    reason_text: trendReasonText(ev),
    raw_score: null,
    source: 'trend',
    configVersion,
  };
}

export function crisisReasonText(categories: readonly CrisisResult['categories'][number][]): string {
  const parts: string[] = [];
  if (categories.includes('self_harm')) {
    parts.push('During a check-in they used words suggesting they may be thinking about ending their life or harming themselves.');
  }
  if (categories.includes('threat_to_safety')) {
    parts.push('During a check-in they said something suggesting someone may be threatening their safety.');
  }
  parts.push('Please contact them as soon as possible. If you cannot reach them, follow your crisis protocol.');
  return parts.join(' ');
}

export function buildCrisisAlert(match: CrisisResult, configVersion: number): AlertDraft | null {
  if (!match.matched) return null;
  return {
    severity: 'urgent',
    signals_involved: ['crisis_scan'],
    reason_text: crisisReasonText(match.categories),
    raw_score: null,
    source: 'crisis',
    configVersion,
  };
}
