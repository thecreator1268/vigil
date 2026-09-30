/**
 * Compact VADER-style valence lexicon (−4..+4), focused on the vocabulary
 * people actually use when describing distress, safety and recovery. English
 * valences follow the published VADER lexicon (Hutto & Gilbert, 2014) where the
 * word exists there; Hindi (Devanagari) and romanised Hinglish entries were
 * added for this domain with matching intensities.
 *
 * Keys are lower-case, punctuation-free tokens.
 */
export const LEXICON: Readonly<Record<string, number>> = Object.freeze({
  // ---- English, negative ----
  sad: -2.1, sadness: -1.9, unhappy: -1.8, miserable: -2.2, depressed: -2.3,
  hopeless: -2.0, helpless: -2.1, worthless: -1.9, useless: -1.8, empty: -0.8,
  alone: -1.0, lonely: -1.5, isolated: -1.3, abandoned: -2.1, ignored: -1.4,
  afraid: -2.0, scared: -1.9, fear: -2.2, fearful: -2.2, terrified: -3.0,
  frightened: -1.9, panic: -2.3, panicked: -2.0, nervous: -1.2, anxious: -0.8,
  worried: -1.2, worry: -1.9, stressed: -1.4, stress: -1.8, tense: -1.4,
  hurt: -2.4, hurting: -2.3, pain: -2.3, painful: -2.4, suffering: -2.1,
  cry: -2.1, crying: -2.1, cried: -1.6, tears: -0.9, grief: -2.2, mourning: -1.9,
  angry: -2.3, anger: -2.7, furious: -2.7, rage: -2.6, bitter: -1.8,
  ashamed: -2.1, shame: -2.1, humiliated: -2.4, guilty: -1.8, blame: -1.4,
  tired: -1.2, exhausted: -1.5, weak: -1.9, sick: -1.7, broken: -2.1,
  trapped: -2.4, stuck: -1.0, lost: -1.3, confused: -1.3, numb: -1.4,
  threatened: -2.0, threat: -2.4, unsafe: -2.3, danger: -2.4, dangerous: -2.1,
  attacked: -2.1, abused: -3.2, harassed: -2.3, beaten: -2.1, violence: -3.1,
  bad: -2.5, worse: -2.1, worst: -3.1, terrible: -2.1, awful: -2.0, horrible: -2.5,
  nightmare: -1.9, nightmares: -1.9, insomnia: -1.3, sleepless: -1.6,
  die: -2.9, dead: -3.3, death: -2.9, kill: -3.7, suicide: -3.5,
  struggle: -1.4, struggling: -1.5, difficult: -1.5, hard: -0.4, heavy: -0.9,
  unfair: -2.1, injustice: -2.7, cruel: -2.8, betrayed: -3.0,

  // ---- English, positive ----
  good: 1.9, better: 1.9, best: 3.2, great: 3.1, fine: 0.8, okay: 0.9, ok: 0.9,
  happy: 2.7, glad: 2.0, joy: 2.8, relieved: 1.5, relief: 2.1, grateful: 2.0,
  thankful: 2.7, thanks: 1.9, blessed: 2.9, lucky: 1.8,
  calm: 1.3, peace: 2.5, peaceful: 2.2, rested: 1.6, relaxed: 2.2, comfortable: 1.5,
  safe: 1.9, safer: 1.7, secure: 1.4, protected: 1.9, supported: 1.9, support: 1.7,
  hope: 1.9, hopeful: 2.3, strong: 2.3, stronger: 1.9, brave: 2.4, confident: 2.2,
  love: 3.2, loved: 2.9, care: 2.2, cared: 1.8, kind: 2.4, help: 1.7, helped: 1.6,
  smile: 1.5, smiled: 2.5, laugh: 2.6, laughed: 2.0, enjoy: 2.2, enjoyed: 2.3,
  justice: 2.0, progress: 1.8, improving: 1.9, improved: 2.1, healing: 1.6,

  // ---- Hindi (Devanagari) ----
  'दुखी': -2.1, 'उदास': -2.0, 'डर': -2.0, 'डरी': -2.0, 'डरा': -2.0, 'अकेला': -1.5,
  'अकेली': -1.5, 'परेशान': -1.8, 'दर्द': -2.3, 'रोना': -2.1, 'रो': -1.8,
  'थका': -1.2, 'थकी': -1.2, 'गुस्सा': -2.3, 'शर्म': -2.0, 'खतरा': -2.4,
  'धमकी': -2.6, 'मारपीट': -2.8, 'बुरा': -2.5, 'बुरी': -2.5, 'निराश': -2.0,
  'चिंता': -1.6, 'तनाव': -1.8, 'मरना': -2.9, 'मौत': -2.9, 'अन्याय': -2.7,
  'खुश': 2.5, 'अच्छा': 1.9, 'अच्छी': 1.9, 'ठीक': 0.9, 'शांति': 2.2, 'शांत': 1.3,
  'सुरक्षित': 1.9, 'उम्मीद': 1.9, 'आशा': 1.9, 'मदद': 1.7, 'धन्यवाद': 2.0,
  'राहत': 1.8, 'हिम्मत': 2.2, 'बेहतर': 1.9, 'न्याय': 2.0, 'प्यार': 3.0,

  // ---- Hinglish (romanised Hindi) ----
  dukhi: -2.1, udaas: -2.0, udas: -2.0, darr: -2.0, dar: -2.0, akela: -1.5,
  akeli: -1.5, pareshan: -1.8, dard: -2.3, rona: -2.1, thaka: -1.2, thaki: -1.2,
  gussa: -2.3, sharam: -2.0, khatra: -2.4, dhamki: -2.6, maarpeet: -2.8,
  bura: -2.5, buri: -2.5, nirash: -2.0, chinta: -1.6, tanav: -1.8, anyay: -2.7,
  khush: 2.5, accha: 1.9, acha: 1.9, achha: 1.9, acchi: 1.9, achi: 1.9, theek: 0.9,
  thik: 0.9, shanti: 2.2, shant: 1.3, surakshit: 1.9, ummeed: 1.9, umeed: 1.9,
  asha: 1.9, madad: 1.7, dhanyavad: 2.0, shukriya: 2.0, rahat: 1.8, himmat: 2.2,
  behtar: 1.9, nyay: 2.0, pyaar: 3.0, pyar: 3.0,
});

/** Intensifiers (+) and dampeners (−), VADER B_INCR / B_DECR = ±0.293. */
export const BOOSTERS: Readonly<Record<string, number>> = Object.freeze({
  very: 0.293, really: 0.293, so: 0.293, extremely: 0.293, totally: 0.293,
  completely: 0.293, absolutely: 0.293, deeply: 0.293, incredibly: 0.293,
  terribly: 0.293, utterly: 0.293, too: 0.293, bahut: 0.293, 'बहुत': 0.293,
  bohot: 0.293, zyada: 0.293, 'ज़्यादा': 0.293, 'ज्यादा': 0.293,
  slightly: -0.293, somewhat: -0.293, barely: -0.293, little: -0.293,
  marginally: -0.293, thoda: -0.293, thodi: -0.293, 'थोड़ा': -0.293, 'थोड़ी': -0.293,
});

/** Negators that precede the word they negate (English). */
export const PRE_NEGATORS: ReadonlySet<string> = new Set([
  'not', 'no', 'never', 'nothing', 'nobody', 'none', 'neither', 'nor', 'without',
  'cannot', 'cant', 'dont', 'doesnt', 'didnt', 'isnt', 'arent', 'wasnt', 'werent',
  'wont', 'wouldnt', 'shouldnt', 'couldnt', 'havent', 'hasnt', 'hadnt', 'aint',
]);

/** Negators that follow the word they negate (Hindi word order). */
export const POST_NEGATORS: ReadonlySet<string> = new Set([
  // 'na'/'ना' deliberately excluded: far more often a tag question ("theek hai na?").
  'nahi', 'nahin', 'nai', 'mat', 'नहीं', 'नही', 'मत',
]);
