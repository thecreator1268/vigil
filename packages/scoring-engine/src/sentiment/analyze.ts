/**
 * Signal 2 — VADER-style rule-based sentiment (Hutto & Gilbert, 2014), fully
 * client-side. Returns the normalised compound score in [-1, 1].
 *
 * Implemented heuristics:
 *  - lexicon valence per token
 *  - boosters/dampeners in the 3 preceding tokens, decaying 1 / 0.95 / 0.9
 *  - ALL-CAPS emphasis (only when the text is mixed-case)
 *  - negation in the 3 preceding tokens (×−0.74), plus post-positional
 *    negation within the 2 following tokens for Hindi/Hinglish
 *  - "but"/"lekin"/"magar" contrast: before ×0.5, after ×1.5
 *  - "!" amplification (up to 4) and "?" amplification (2+)
 *  - compound = x / √(x² + 15)
 */
import { BOOSTERS, LEXICON, POST_NEGATORS, PRE_NEGATORS } from './lexicon.js';

const B_INCR = 0.293;
const C_INCR = 0.733;
const N_SCALAR = -0.74;
const ALPHA = 15;
const BOOSTER_DECAY = [1, 0.95, 0.9] as const;
const CONTRAST = new Set(['but', 'lekin', 'लेकिन', 'magar', 'मगर']);

const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

interface Token {
  raw: string;
  key: string;
}

export function tokenize(text: string): Token[] {
  return text
    .normalize('NFKC')
    .split(/\s+/)
    .map((raw) => raw.replace(EDGE_PUNCT, ''))
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ raw, key: raw.toLowerCase().replace(/['’]/g, '') }));
}

function isAllCaps(word: string): boolean {
  return word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase();
}

function isNegator(tok: Token): boolean {
  return PRE_NEGATORS.has(tok.key) || /n['’]t$/i.test(tok.raw);
}

export function normalizeCompound(score: number, alpha = ALPHA): number {
  const n = score / Math.sqrt(score * score + alpha);
  return Math.max(-1, Math.min(1, n));
}

function punctuationEmphasis(text: string): number {
  const bangs = Math.min((text.match(/!/g) ?? []).length, 4) * 0.292;
  const qCount = (text.match(/\?/g) ?? []).length;
  const qs = qCount > 1 ? Math.min(qCount * 0.18, 0.96) : 0;
  return bangs + qs;
}

export function sentimentCompound(text: string): number {
  const tokens = tokenize(text);
  if (tokens.length === 0) return 0;

  // Emphasis only counts when some words are shouted and others are not.
  const mixedCase = tokens.some((t) => isAllCaps(t.raw)) && tokens.some((t) => t.raw !== t.raw.toUpperCase());

  const valences: number[] = tokens.map((tok, i) => {
    const base = LEXICON[tok.key];
    if (base === undefined) return 0;
    let v = base;

    if (mixedCase && isAllCaps(tok.raw)) v += v > 0 ? C_INCR : -C_INCR;

    for (let back = 1; back <= 3; back++) {
      const prev = tokens[i - back];
      if (!prev) break;
      const boost = BOOSTERS[prev.key];
      if (boost !== undefined) {
        let b = boost * (BOOSTER_DECAY[back - 1] as number);
        if (mixedCase && isAllCaps(prev.raw)) b += boost > 0 ? B_INCR : -B_INCR;
        v += v > 0 ? b : -b;
      }
    }

    let negated = false;
    for (let back = 1; back <= 3; back++) {
      const prev = tokens[i - back];
      if (prev && isNegator(prev)) negated = true;
    }
    for (let fwd = 1; fwd <= 2; fwd++) {
      const next = tokens[i + fwd];
      if (next && POST_NEGATORS.has(next.key)) negated = true;
    }
    if (negated) v *= N_SCALAR;
    return v;
  });

  const contrastAt = tokens.findIndex((t) => CONTRAST.has(t.key));
  if (contrastAt >= 0) {
    valences.forEach((v, i) => {
      if (i < contrastAt) valences[i] = v * 0.5;
      else if (i > contrastAt) valences[i] = v * 1.5;
    });
  }

  let sum = valences.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const emphasis = punctuationEmphasis(text);
  sum += sum > 0 ? emphasis : -emphasis;
  return normalizeCompound(sum);
}
