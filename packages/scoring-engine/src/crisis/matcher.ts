/**
 * Signal 5 — crisis scan. The ONLY signal allowed to bypass the composite
 * pipeline. Deterministic whole-word phrase matching over normalised text.
 *
 * Deliberately no negation suppression: "I don't want to kill myself" still
 * matches, because a false positive costs a counselor a phone call and a false
 * negative can cost a life.
 */
import {
  CRISIS_LIST_VERSION,
  CRISIS_PHRASES,
  type CrisisCategory,
  type CrisisPhrase,
} from './phrases.js';

export interface CrisisResult {
  matched: boolean;
  listVersion: string;
  matchedPhraseIds: string[];
  categories: CrisisCategory[];
}

/** NFKC, lower-case, apostrophes dropped, other punctuation/symbols → space. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scanForCrisis(
  text: string | null | undefined,
  phrases: readonly CrisisPhrase[] = CRISIS_PHRASES,
  listVersion: string = CRISIS_LIST_VERSION,
): CrisisResult {
  const haystack = ` ${normalizeForMatch(text ?? '')} `;
  const hits = haystack.trim() ? phrases.filter((p) => haystack.includes(` ${p.phrase} `)) : [];
  const categories = [...new Set(hits.map((h) => h.category))].sort();
  return {
    matched: hits.length > 0,
    listVersion,
    matchedPhraseIds: hits.map((h) => h.id),
    categories,
  };
}

/** Stable 32-bit FNV-1a over the canonical list, used for change control. */
export function phraseListChecksum(phrases: readonly CrisisPhrase[] = CRISIS_PHRASES): string {
  const canonical = phrases.map((p) => `${p.id}|${p.category}|${p.lang}|${p.phrase}`).join('\n');
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(canonical)) {
    h ^= ch;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
