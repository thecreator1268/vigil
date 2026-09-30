/**
 * Crisis phrase list — deterministic, versioned, auditable. NOT ML.
 *
 * Change control: any edit to CRISIS_PHRASES must bump CRISIS_LIST_VERSION and
 * update CRISIS_LIST_CHECKSUM (the test suite recomputes it and fails
 * otherwise). Every alert records the list version that matched, and only
 * phrase *ids* are ever transmitted or logged — never the text that matched.
 *
 * Phrases are written in their normalised form (see normalizeForMatch):
 * lower-case, no punctuation, apostrophes removed, single spaces.
 */
export type CrisisCategory = 'self_harm' | 'threat_to_safety';

export interface CrisisPhrase {
  id: string;
  category: CrisisCategory;
  lang: 'en' | 'hi' | 'hi-Latn';
  phrase: string;
}

export const CRISIS_LIST_VERSION = '2026.09.1';
export const CRISIS_LIST_CHECKSUM = '7783cba5';

export const CRISIS_PHRASES: readonly CrisisPhrase[] = Object.freeze([
  // ---- self-harm, English ----
  { id: 'sh-en-001', category: 'self_harm', lang: 'en', phrase: 'kill myself' },
  { id: 'sh-en-002', category: 'self_harm', lang: 'en', phrase: 'killing myself' },
  { id: 'sh-en-003', category: 'self_harm', lang: 'en', phrase: 'end my life' },
  { id: 'sh-en-004', category: 'self_harm', lang: 'en', phrase: 'ending my life' },
  { id: 'sh-en-005', category: 'self_harm', lang: 'en', phrase: 'take my own life' },
  { id: 'sh-en-006', category: 'self_harm', lang: 'en', phrase: 'want to die' },
  { id: 'sh-en-007', category: 'self_harm', lang: 'en', phrase: 'wanna die' },
  { id: 'sh-en-008', category: 'self_harm', lang: 'en', phrase: 'wish i was dead' },
  { id: 'sh-en-009', category: 'self_harm', lang: 'en', phrase: 'wish i were dead' },
  { id: 'sh-en-010', category: 'self_harm', lang: 'en', phrase: 'better off dead' },
  { id: 'sh-en-011', category: 'self_harm', lang: 'en', phrase: 'no reason to live' },
  { id: 'sh-en-012', category: 'self_harm', lang: 'en', phrase: 'dont want to live' },
  { id: 'sh-en-013', category: 'self_harm', lang: 'en', phrase: 'do not want to live' },
  { id: 'sh-en-014', category: 'self_harm', lang: 'en', phrase: 'hurt myself' },
  { id: 'sh-en-015', category: 'self_harm', lang: 'en', phrase: 'harm myself' },
  { id: 'sh-en-016', category: 'self_harm', lang: 'en', phrase: 'cut myself' },
  { id: 'sh-en-017', category: 'self_harm', lang: 'en', phrase: 'suicide' },
  { id: 'sh-en-018', category: 'self_harm', lang: 'en', phrase: 'suicidal' },
  { id: 'sh-en-019', category: 'self_harm', lang: 'en', phrase: 'not be here anymore' },
  { id: 'sh-en-020', category: 'self_harm', lang: 'en', phrase: 'cant go on' },
  // ---- self-harm, Hindi (Devanagari) ----
  { id: 'sh-hi-001', category: 'self_harm', lang: 'hi', phrase: 'आत्महत्या' },
  { id: 'sh-hi-002', category: 'self_harm', lang: 'hi', phrase: 'खुदकुशी' },
  { id: 'sh-hi-003', category: 'self_harm', lang: 'hi', phrase: 'मर जाना चाहता' },
  { id: 'sh-hi-004', category: 'self_harm', lang: 'hi', phrase: 'मर जाना चाहती' },
  { id: 'sh-hi-005', category: 'self_harm', lang: 'hi', phrase: 'जीना नहीं चाहता' },
  { id: 'sh-hi-006', category: 'self_harm', lang: 'hi', phrase: 'जीना नहीं चाहती' },
  { id: 'sh-hi-007', category: 'self_harm', lang: 'hi', phrase: 'अपनी जान दे' },
  // ---- self-harm, Hinglish ----
  { id: 'sh-hl-001', category: 'self_harm', lang: 'hi-Latn', phrase: 'aatmahatya' },
  { id: 'sh-hl-002', category: 'self_harm', lang: 'hi-Latn', phrase: 'atmahatya' },
  { id: 'sh-hl-003', category: 'self_harm', lang: 'hi-Latn', phrase: 'khudkushi' },
  { id: 'sh-hl-004', category: 'self_harm', lang: 'hi-Latn', phrase: 'mar jana chahta' },
  { id: 'sh-hl-005', category: 'self_harm', lang: 'hi-Latn', phrase: 'mar jana chahti' },
  { id: 'sh-hl-006', category: 'self_harm', lang: 'hi-Latn', phrase: 'marna chahta' },
  { id: 'sh-hl-007', category: 'self_harm', lang: 'hi-Latn', phrase: 'marna chahti' },
  { id: 'sh-hl-008', category: 'self_harm', lang: 'hi-Latn', phrase: 'jeena nahi chahta' },
  { id: 'sh-hl-009', category: 'self_harm', lang: 'hi-Latn', phrase: 'jeena nahi chahti' },
  { id: 'sh-hl-010', category: 'self_harm', lang: 'hi-Latn', phrase: 'apni jaan de' },
  // ---- threat to safety (from others), English ----
  { id: 'ts-en-001', category: 'threat_to_safety', lang: 'en', phrase: 'going to kill me' },
  { id: 'ts-en-002', category: 'threat_to_safety', lang: 'en', phrase: 'will kill me' },
  { id: 'ts-en-003', category: 'threat_to_safety', lang: 'en', phrase: 'threatening me' },
  { id: 'ts-en-004', category: 'threat_to_safety', lang: 'en', phrase: 'threatened me' },
  { id: 'ts-en-005', category: 'threat_to_safety', lang: 'en', phrase: 'threatening my family' },
  { id: 'ts-en-006', category: 'threat_to_safety', lang: 'en', phrase: 'attacked me' },
  { id: 'ts-en-007', category: 'threat_to_safety', lang: 'en', phrase: 'came to my house' },
  { id: 'ts-en-008', category: 'threat_to_safety', lang: 'en', phrase: 'withdraw the case' },
  { id: 'ts-en-009', category: 'threat_to_safety', lang: 'en', phrase: 'not safe at home' },
  { id: 'ts-en-010', category: 'threat_to_safety', lang: 'en', phrase: 'i am not safe' },
  { id: 'ts-en-011', category: 'threat_to_safety', lang: 'en', phrase: 'im not safe' },
  // ---- threat to safety, Hindi (Devanagari) ----
  { id: 'ts-hi-001', category: 'threat_to_safety', lang: 'hi', phrase: 'धमकी' },
  { id: 'ts-hi-002', category: 'threat_to_safety', lang: 'hi', phrase: 'जान से मार' },
  { id: 'ts-hi-003', category: 'threat_to_safety', lang: 'hi', phrase: 'मार डालेंगे' },
  { id: 'ts-hi-004', category: 'threat_to_safety', lang: 'hi', phrase: 'केस वापस' },
  { id: 'ts-hi-005', category: 'threat_to_safety', lang: 'hi', phrase: 'सुरक्षित नहीं' },
  // ---- threat to safety, Hinglish ----
  { id: 'ts-hl-001', category: 'threat_to_safety', lang: 'hi-Latn', phrase: 'dhamki' },
  { id: 'ts-hl-002', category: 'threat_to_safety', lang: 'hi-Latn', phrase: 'jaan se maar' },
  { id: 'ts-hl-003', category: 'threat_to_safety', lang: 'hi-Latn', phrase: 'maar dalenge' },
  { id: 'ts-hl-004', category: 'threat_to_safety', lang: 'hi-Latn', phrase: 'case wapas' },
  { id: 'ts-hl-005', category: 'threat_to_safety', lang: 'hi-Latn', phrase: 'surakshit nahi' },
]);
