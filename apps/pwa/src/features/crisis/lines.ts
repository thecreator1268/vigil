/**
 * Crisis resources shipped in EVERY build — real numbers, never placeholders.
 * Numbers are rendered as tel: links so one tap dials, even offline (calls
 * don't need data).
 */
export interface CrisisLine {
  key: 'kiran' | 'icall' | 'vandrevala' | 'nhaa';
  tel?: string;
  url?: string;
}

export const EMERGENCY_TEL = 'tel:112';

export const CRISIS_LINES: readonly CrisisLine[] = [
  { key: 'kiran', tel: 'tel:18005990019' }, // KIRAN, 1800-599-0019, toll-free 24/7
  { key: 'icall', url: 'https://icallhelpline.org' },
  { key: 'vandrevala', tel: 'tel:18602662345' }, // 1860-2662-345
  { key: 'nhaa', tel: 'tel:14566' }, // National Helpline Against Atrocities (MoSJE)
];
