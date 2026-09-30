import { describe, expect, it } from 'vitest';
import { normalizeForMatch, phraseListChecksum, scanForCrisis } from '../src/crisis/matcher.js';
import { CRISIS_LIST_CHECKSUM, CRISIS_LIST_VERSION, CRISIS_PHRASES, type CrisisPhrase } from '../src/crisis/phrases.js';

describe('crisis phrase list change control', () => {
  it('checksum matches the recorded value — bump CRISIS_LIST_VERSION when editing the list', () => {
    expect(phraseListChecksum()).toBe(CRISIS_LIST_CHECKSUM);
  });

  it('has unique ids and phrases already in normalised form', () => {
    const ids = CRISIS_PHRASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CRISIS_PHRASES) expect(normalizeForMatch(p.phrase)).toBe(p.phrase);
  });

  it('checksum changes when the list changes', () => {
    const edited: CrisisPhrase[] = [...CRISIS_PHRASES, { id: 'x', category: 'self_harm', lang: 'en', phrase: 'x' }];
    expect(phraseListChecksum(edited)).not.toBe(CRISIS_LIST_CHECKSUM);
  });
});

describe('normalizeForMatch', () => {
  it('lower-cases, drops apostrophes and turns punctuation/emoji into spaces', () => {
    expect(normalizeForMatch("  I DON'T want…to   LIVE!! 😔 ")).toBe('i dont want to live');
    expect(normalizeForMatch('मुझे धमकी दी।')).toBe('मुझे धमकी दी');
  });
});

describe('scanForCrisis', () => {
  it('reports no match for empty, null or ordinary text', () => {
    for (const t of [null, undefined, '', '   ', 'I had a hard day at work but I am okay']) {
      const r = scanForCrisis(t);
      expect(r).toEqual({ matched: false, listVersion: CRISIS_LIST_VERSION, matchedPhraseIds: [], categories: [] });
    }
  });

  it.each([
    ['I want to kill myself', 'sh-en-001'],
    ["Honestly I don't want to live anymore", 'sh-en-012'],
    ['sometimes I think I am better off dead.', 'sh-en-010'],
    ['I feel SUICIDAL', 'sh-en-018'],
    ['मैं आत्महत्या के बारे में सोचती हूँ', 'sh-hi-001'],
    ['ab jeena nahi chahti', 'sh-hl-009'],
  ])('flags self-harm: %s', (text, id) => {
    const r = scanForCrisis(text);
    expect(r.matched).toBe(true);
    expect(r.matchedPhraseIds).toContain(id);
    expect(r.categories).toEqual(['self_harm']);
  });

  it.each([
    ['They said they will kill me if I go to court', 'ts-en-002'],
    ['they keep telling me to withdraw the case', 'ts-en-008'],
    ['गाँव वाले धमकी दे रहे हैं', 'ts-hi-001'],
    ['unhone jaan se maar dene ki dhamki di', 'ts-hl-002'],
  ])('flags threats to safety: %s', (text, id) => {
    const r = scanForCrisis(text);
    expect(r.matched).toBe(true);
    expect(r.matchedPhraseIds).toContain(id);
    expect(r.categories).toContain('threat_to_safety');
  });

  it('does NOT suppress negated phrases (a false positive costs a phone call)', () => {
    expect(scanForCrisis("I'm not going to kill myself, don't worry").matched).toBe(true);
  });

  it('matches whole words only', () => {
    expect(scanForCrisis('the actors skill myselfie').matched).toBe(false);
    expect(scanForCrisis('dhamkiyan').matched).toBe(false);
  });

  it('reports multiple categories, sorted and de-duplicated', () => {
    const r = scanForCrisis('They threatened me and now I want to die, I want to kill myself');
    expect(r.categories).toEqual(['self_harm', 'threat_to_safety']);
    expect(r.matchedPhraseIds).toEqual(expect.arrayContaining(['sh-en-001', 'sh-en-006', 'ts-en-004']));
  });

  it('accepts an injected list and version (for audits and tests)', () => {
    const list: CrisisPhrase[] = [{ id: 't-1', category: 'self_harm', lang: 'en', phrase: 'test phrase' }];
    expect(scanForCrisis('a test phrase here', list, 'test-1')).toEqual({
      matched: true, listVersion: 'test-1', matchedPhraseIds: ['t-1'], categories: ['self_harm'],
    });
  });
});
