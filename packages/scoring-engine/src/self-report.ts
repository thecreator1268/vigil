/**
 * Signal 1 — structured self-report. PHQ-2-style brevity: four questions, each
 * answered on a 0..4 scale, every one skippable without penalty. Question text
 * lives in the PWA's i18n bundles; only ids and polarity live here.
 *
 * polarity 'positive' → a higher answer means the person is doing better.
 * polarity 'negative' → a higher answer means things are harder.
 */
export interface SelfReportQuestion {
  id: string;
  polarity: 'positive' | 'negative';
}

export const SELF_REPORT_QUESTIONS: readonly SelfReportQuestion[] = Object.freeze([
  { id: 'heavy', polarity: 'negative' }, // how heavy things have felt
  { id: 'interest', polarity: 'positive' }, // felt like doing usual things
  { id: 'sleep', polarity: 'positive' }, // rest / sleep
  { id: 'safe', polarity: 'positive' }, // felt safe where they are
]);

const BY_ID = new Map(SELF_REPORT_QUESTIONS.map((q) => [q.id, q]));

/**
 * normalize(self_report) → wellbeing-oriented mean in [-1, 1], or null if every
 * question was skipped (a skipped check-in contributes nothing, never a penalty).
 * Unknown question ids and out-of-range answers are ignored.
 */
export function normalizeSelfReport(answers: Readonly<Record<string, number>>): number | null {
  const values: number[] = [];
  for (const [id, raw] of Object.entries(answers)) {
    const q = BY_ID.get(id);
    if (!q || !Number.isInteger(raw) || raw < 0 || raw > 4) continue;
    values.push(q.polarity === 'positive' ? (raw - 2) / 2 : (2 - raw) / 2);
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
