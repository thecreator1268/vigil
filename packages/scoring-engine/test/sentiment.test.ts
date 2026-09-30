import { describe, expect, it } from 'vitest';
import { normalizeCompound, sentimentCompound, tokenize } from '../src/sentiment/analyze.js';

describe('tokenize', () => {
  it('strips edge punctuation, lower-cases keys and drops apostrophes', () => {
    expect(tokenize("  I'm SAD!!  ok. ")).toEqual([
      { raw: "I'm", key: 'im' },
      { raw: 'SAD', key: 'sad' },
      { raw: 'ok', key: 'ok' },
    ]);
  });

  it('keeps Devanagari combining marks and strips the danda', () => {
    expect(tokenize('मैं दुखी हूँ।').map((t) => t.key)).toEqual(['मैं', 'दुखी', 'हूँ']);
  });

  it('drops tokens that are pure punctuation', () => {
    expect(tokenize('... !!!')).toEqual([]);
  });
});

describe('normalizeCompound', () => {
  it('uses x/√(x²+α) and stays in [-1, 1]', () => {
    expect(normalizeCompound(0)).toBe(0);
    expect(normalizeCompound(2)).toBeCloseTo(2 / Math.sqrt(19));
    expect(normalizeCompound(1000)).toBeLessThanOrEqual(1);
    expect(normalizeCompound(-1000)).toBeGreaterThanOrEqual(-1);
    expect(normalizeCompound(1, 0)).toBe(1);
  });
});

describe('sentimentCompound', () => {
  it('returns 0 for empty or neutral text', () => {
    expect(sentimentCompound('')).toBe(0);
    expect(sentimentCompound('   ')).toBe(0);
    expect(sentimentCompound('I went to the market')).toBe(0);
  });

  it('scores clearly positive and negative text in the right direction', () => {
    expect(sentimentCompound('I feel safe and hopeful')).toBeGreaterThan(0.5);
    expect(sentimentCompound('I feel scared and hopeless')).toBeLessThan(-0.5);
  });

  it('boosters increase intensity, with decay by distance', () => {
    const plain = sentimentCompound('I am sad');
    const boosted = sentimentCompound('I am very sad');
    const farBoost = sentimentCompound('very much am sad');
    expect(boosted).toBeLessThan(plain);
    expect(farBoost).toBeLessThan(plain);
    expect(farBoost).toBeGreaterThan(boosted);
    expect(sentimentCompound('very happy')).toBeGreaterThan(sentimentCompound('happy'));
  });

  it('dampeners reduce intensity', () => {
    expect(sentimentCompound('slightly sad')).toBeGreaterThan(sentimentCompound('sad'));
    expect(sentimentCompound('slightly happy')).toBeLessThan(sentimentCompound('happy'));
  });

  it('ALL-CAPS emphasis applies only in mixed-case text', () => {
    expect(sentimentCompound('I am SAD')).toBeLessThan(sentimentCompound('I am sad'));
    expect(sentimentCompound('I am HAPPY')).toBeGreaterThan(sentimentCompound('I am happy'));
    // whole text in caps → no extra emphasis
    expect(sentimentCompound('I AM SAD')).toBeCloseTo(sentimentCompound('i am sad'));
    // single-letter "I" is not treated as shouting
    expect(sentimentCompound('I sad')).toBeCloseTo(sentimentCompound('i sad'));
  });

  it('a capitalised booster in mixed-case text boosts further', () => {
    expect(sentimentCompound('I am VERY sad')).toBeLessThan(sentimentCompound('I am very sad'));
    expect(sentimentCompound('I am SLIGHTLY sad')).toBeGreaterThan(sentimentCompound('I am slightly sad'));
  });

  it('negation (pre-positional, English) flips and dampens', () => {
    expect(sentimentCompound('I am not happy')).toBeLessThan(0);
    expect(sentimentCompound("I don't feel safe")).toBeLessThan(0);
    expect(sentimentCompound('I dont feel safe')).toBeLessThan(0);
    expect(sentimentCompound('never alone')).toBeGreaterThan(0);
    // contraction not in the negator list, caught by the n't rule
    expect(sentimentCompound("mustn't be happy")).toBeLessThan(0);
  });

  it('does not treat words merely ending in "nt" as negators', () => {
    expect(sentimentCompound('I want peace')).toBeGreaterThan(0);
  });

  it('negation (post-positional, Hindi / Hinglish)', () => {
    expect(sentimentCompound('मैं ठीक नहीं हूँ')).toBeLessThan(0);
    expect(sentimentCompound('main theek nahi hoon')).toBeLessThan(0);
    expect(sentimentCompound('main khush hoon')).toBeGreaterThan(0);
    // a tag question "na" must not negate
    expect(sentimentCompound('accha hai na')).toBeGreaterThan(0);
  });

  it('applies the "but" contrast rule', () => {
    const s = sentimentCompound('I was scared but now I feel safe');
    expect(s).toBeGreaterThan(0);
    expect(sentimentCompound('I feel safe lekin I am scared')).toBeLessThan(0);
    expect(sentimentCompound('but')).toBe(0);
  });

  it('exclamation marks amplify in the direction of the sentiment, capped at 4', () => {
    expect(sentimentCompound('happy!')).toBeGreaterThan(sentimentCompound('happy'));
    expect(sentimentCompound('sad!')).toBeLessThan(sentimentCompound('sad'));
    expect(sentimentCompound('happy!!!!!!!!')).toBeCloseTo(sentimentCompound('happy!!!!'));
  });

  it('two or more question marks amplify; a single one does not', () => {
    expect(sentimentCompound('why am I so sad??')).toBeLessThan(sentimentCompound('why am I so sad'));
    expect(sentimentCompound('sad?')).toBeCloseTo(sentimentCompound('sad'));
  });
});
