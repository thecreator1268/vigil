# On-device language signal for Hindi / English / Hinglish check-ins — research only

**Status: research only. Nothing in this document is wired into scoring. No model
dependency has been added to the PWA bundle.** This is a feasibility and risk
assessment for a possible future signal, written to Phase 1 item 3's brief.

Everything below is either cited to a specific, checkable source, or explicitly
marked **unverified**. Where I could not find a citable source for a claim
(rather than just not looking hard enough), I say so rather than presenting a
guess as fact.

## 1. Candidate models

All of these are text classifiers or NLI/zero-shot backbones that would need to
run through [Transformers.js](https://huggingface.co/docs/transformers.js) in
ONNX format. "Size at q8/q4" means the quantized `.onnx` weight file a browser
would actually download — fp32 source sizes are given for context, since that's
what most model cards publish directly.

| Model | License | Size (fp32 → q8 → q4) | Languages | Output |
|---|---|---|---|---|
| [`google/muril-large-cased`](https://huggingface.co/google/muril-large-cased) | Apache 2.0 | 236M params; fp32 ~950MB. q8/q4 ONNX sizes: **unverified** — no official ONNX export found on the Hub at time of writing. | 17 languages: Hindi + 16 other Indian languages + English, incl. transliterated (romanized) text ([MuRIL paper](https://arxiv.org/pdf/2103.10730)) | Encoder only — produces embeddings, not a sentiment/emotion label. Would need a fine-tuned classification head of our own; out of scope for "self-hosted, off-the-shelf." |
| [`ai4bharat/indic-bert`](https://huggingface.co/ai4bharat/indic-bert) (v1, ALBERT-based) | MIT | 128.3MB fp32 (already small — ALBERT shares layers). q8/q4: **unverified**, no published quantized export found. | 12 languages: Hindi, English, + 10 other Indian languages ([AI4Bharat GitHub](https://github.com/AI4Bharat/Indic-BERT-v1)) | Encoder only, same caveat as MuRIL — no off-the-shelf sentiment head. |
| [`ai4bharat/IndicBERTv2-MLM-Back-TLM`](https://huggingface.co/ai4bharat/IndicBERTv2-MLM-Back-TLM) | MIT | 278M params fp32. q8/q4: **unverified**. | 23 Indic languages + English, trained on IndicCorp v2 (20.9B tokens) ([AI4Bharat/IndicBERT GitHub](https://github.com/AI4Bharat/IndicBERT)) | Encoder only, same caveat. |
| [`l3cube-pune/hing-bert`](https://huggingface.co/l3cube-pune/hing-bert) / `hing-roberta` / `hing-roberta-mixed` | CC-BY-4.0 | BERT/RoBERTa-base scale (~110–125M params typical for this architecture family — exact file size **unverified**, not stated directly on the model cards found). | Hinglish specifically — trained on 52.93M sentences / 1.04B tokens of Twitter code-mixed Hindi-English (HingCorpus); separate romanized-script and mixed-script (Devanagari+Roman) checkpoints ([L3Cube-HingCorpus paper, arXiv:2204.08398](https://arxiv.org/abs/2204.08398)) | Encoder, but L3Cube also publish task-specific fine-tunes evaluated on code-mixed sentiment analysis via the GLUECoS benchmark — the base checkpoints linked here are *not* the classifier itself; a sentiment-specific L3Cube checkpoint would need to be located and verified separately. **Not independently verified beyond the paper abstract.** |
| [`cardiffnlp/twitter-xlm-roberta-base-sentiment`](https://huggingface.co/cardiffnlp/twitter-xlm-roberta-base-sentiment) | Not stated on model card found; XLM-R base is MIT — **license of the fine-tune itself unverified**, treat as unresolved until confirmed. | XLM-R-base scale, ~278M params fp32. q8/q4: **unverified** — no Transformers.js/ONNX port located. | Fine-tuned and evaluated on 8 languages incl. **Hindi**, English, Arabic, French, German, Italian, Spanish, Portuguese; pretrained base covers 100 languages ([XLM-T paper, arXiv:2104.12250](https://arxiv.org/pdf/2104.12250)) | 3-class sentiment (negative/neutral/positive). Ready-to-use classification head, which the Indic models above lack. No Hinglish (code-mixed) training data specifically — code-mixed behavior is **unverified**. |
| [`lxyuan/distilbert-base-multilingual-cased-sentiments-student`](https://huggingface.co/lxyuan/distilbert-base-multilingual-cased-sentiments-student) | Apache 2.0 | 135M params fp32. [Xenova/transformers.js](https://huggingface.co/Xenova/transformers.js) hosts ONNX ports of many Xenova-mirrored models with q8 variants typically ~4x smaller than fp32 and q4 ~8x smaller per Hugging Face's general quantization guidance — **whether this specific model has a Xenova ONNX mirror is unverified**, I did not find one directly. | 12 languages incl. **Hindi**: English, Arabic, German, Spanish, French, Japanese, Chinese, Indonesian, Italian, Malay, Portuguese. | 3-class sentiment, distilled from `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` (88.3% agreement with the teacher per its own model card). No Hinglish-specific training; code-mixed behavior **unverified**. |
| [`MoritzLaurer/mDeBERTa-v3-base-mnli-xnli`](https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-mnli-xnli) | MIT | 0.3B params fp32, ~432MB `.onnx` fp32 per a community ONNX port (`statelet/nli-mdeberta-en`); that same port's `model_int8.onnx` (q8-equivalent) is ~242MB. q4: **unverified**, no q4 export located. Roughly 770MB of the full checkpoint is the multilingual embedding table alone — a structural reason this model stays large even after quantization. | NLI/zero-shot over up to 100 languages; XNLI covers 15 incl. **Hindi** ([model card](https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-mnli-xnli)) | Zero-shot classification (e.g. "is this text about: distress, neutral, relief" as arbitrary candidate labels) rather than a fixed sentiment/emotion head — flexible, but 242MB+ even at q8 is a heavy download for this project's "hard bundle and download budget" requirement (§3). |
| [`j-hartmann/emotion-english-distilroberta-base`](https://huggingface.co/j-hartmann/emotion-english-distilroberta-base) | **No license stated on the model card** — would need the author's clarification before any use. | 82M params, 660MB listed on its Hugging Face page (inconsistent with typical 82M-param fp32 sizes — **this figure is as reported, unverified against the actual file**). | **English only.** Does not cover Hindi or Hinglish. | 7-way Ekman emotion classification (anger, disgust, fear, joy, neutral, sadness, surprise). Included only to show why an "emotion, not just sentiment" model is harder to find multilingual — no viable Hindi/Hinglish emotion-specific model was found in this research pass. |

**Takeaway:** every readily available *classifier* with a real sentiment head
and Hindi coverage (`cardiffnlp/twitter-xlm-roberta-base-sentiment`,
`lxyuan/distilbert-base-multilingual-cased-sentiments-student`) was trained on
general multilingual data, not Hinglish specifically. The one model trained
*specifically* on Hinglish (L3Cube's HingBERT family) is a base encoder, and
locating and verifying an actual ready-to-use L3Cube Hinglish sentiment
*classifier* checkpoint (as opposed to the base encoder) is unfinished —
flagged as a concrete follow-up, not assumed.

## 2. Runtime options in the browser

[Transformers.js](https://huggingface.co/docs/transformers.js/en/index) runs
ONNX models via `onnxruntime-web`, with two backends:

- **WASM (default).** Uses `q8` quantization by default. A benchmark cited by
  [SitePoint's WebGPU vs WASM comparison](https://www.sitepoint.com/webgpu-vs-webasm-transformers-js/)
  showed ~386ms WASM latency at batch size 1 for one embedding model, vs.
  ~24ms on WebGPU for the same model — roughly a 16x gap in that specific
  case, not a fixed ratio across all models/devices. INT8 (q8) is ~4x smaller
  than fp32 with "minimal quality loss" per general Transformers.js guidance;
  INT4 (q4) is ~8x smaller "with some degradation on complex reasoning but
  fine for classification," which is the relevant case here.
- **WebGPU (optional).** Chrome shipped WebGPU on desktop from Chrome 113
  (2023); **Android support landed in Chrome 121**, gated to devices running
  Android 12+ with a Qualcomm or ARM GPU recent enough to support it — i.e.
  not universal on low-end Android. Firefox on Android still has it behind a
  flag. On a phone that doesn't qualify, `onnxruntime-web` falls back to WASM
  automatically; the risk noted in the sources is that forcing GPU work on a
  phone whose driver/GPU combination is marginal "can cause the phone to
  overheat before the OS kills the process" rather than failing cleanly.

**Cost on a low-end Android phone specifically:** I found no benchmark numbers
for a *low-end* Android device running Transformers.js — every number above
is from a desktop or unspecified-device benchmark. **Low-end Android
inference latency and battery/thermal cost are unverified** and would need to
be measured on real low-end hardware (e.g. a sub-₹10,000 Android device)
before any ship decision, not estimated from desktop numbers.

**Implication for this project:** feature-detect WebGPU
(`navigator.gpu` present and `requestAdapter()` resolves) and use it only as
an optional accelerant; default to WASM q8 everywhere, since that's the
Transformers.js default and the only path confirmed to work broadly on
low-end Android hardware today. Never require WebGPU.

## 3. Delivery

- **Self-hosted model files.** VIGIL already avoids third-party runtime calls
  for anything privacy-sensitive (BHASHINI goes through a configurable
  server-side proxy per the README). The same posture applies here: model
  weights would need to be hosted from VIGIL's own origin, not fetched from
  `huggingface.co` at runtime, both for privacy (no third party sees a
  download pattern correlated with check-in timing) and for offline
  reliability.
- **Lazy loading after the first check-in, not at install time.** Transformers.js
  guidance is explicit that a multi-megabyte model download should never block
  initial page render — "lazy-load models after the page renders and show a
  loading state" ([SitePoint, Optimizing Transformers.js for Production Web Apps](https://www.sitepoint.com/optimizing-transformers-js-production/)).
  For VIGIL this means: never part of the initial app-shell precache list in
  `sw.ts`; only requested after a person has completed at least one check-in
  *and* explicitly consented (see §5) — never pre-fetched speculatively.
- **Caching through the service worker.** Once downloaded, the model file(s)
  should be added to a dedicated Cache Storage cache (not the existing
  `vigil-static` cache used for the app shell, so Quick Wipe's existing
  "clear every Cache Storage cache" step — already audited in `wipe.ts`'s doc
  comment — continues to catch it with zero additional wipe logic). The
  `transformers.js` runtime itself defaults to IndexedDB-backed caching of
  fetched weights; if a future implementation uses that default cache instead
  of (or in addition to) Cache Storage, Quick Wipe's Dexie/IndexedDB-clearing
  step would need to be re-audited to confirm it reaches it, since
  `transformers.js`'s own cache is a separate IndexedDB database from the
  app's `vigil-local` database Dexie manages.
- **A hard bundle and download budget.** Two separate budgets, not one:
  - **JS bundle budget (no model dependency today, by this item's own
    instruction):** if `@xenova/transformers` or `@huggingface/transformers`
    is ever added as a dependency, it must be dynamically imported
    (`import()`) from inside the lazy-loaded feature module, never from a
    top-level import — otherwise it inflates every route's shared chunk
    regardless of whether the feature is ever used.
  - **Model download budget:** the smallest *viable classifier with a real
    sentiment head and Hindi coverage* found in §1 is
    `lxyuan/distilbert-base-multilingual-cased-sentiments-student` at 135M
    params fp32 — call it roughly 35–70MB once quantized to q8/q4, though the
    exact ONNX file size is unverified (no confirmed Xenova mirror found). A
    firm number should be pinned once an actual ONNX export is located and
    measured directly, rather than estimated from parameter count.
- **Offline and metered-connection behavior.** If the model isn't yet
  downloaded, the feature must behave exactly as if it doesn't exist —
  scoring proceeds using the other four signals, the skipped-signal-contributes-
  zero rule (`.claude/rules/scoring-engine.md`) covers this with no new code
  path. The download itself should only be attempted when `navigator.onLine`
  is true, and should check the Network Information API's `saveData` flag
  and `effectiveType` where available (Chrome/Android; **not available on
  Safari/iOS — unverified whether that matters for VIGIL's user base**) to
  avoid starting a large download on a connection the person has marked as
  constrained.
- **Avoiding a large download without consent.** This has to be an explicit,
  separate consent scope — e.g. `enable-on-device-language-signal` — distinct
  from the existing consent scopes in `apps/pwa/src/sync/resolvers.ts`
  (`share-free-text`, `case-linking`). The install-time and first-run notices
  already built for Phase 1 item 1 are the wrong place for this: those are
  about monitoring/cloud-sync trade-offs that apply regardless of whether this
  feature ships; a model download is an additional, optional, data-cost
  decision that deserves its own explicit opt-in at the point it would first
  matter (after the first check-in), not bundled into onboarding.

## 4. Safety design

- **The model is advisory only, full stop.** It must never be able to
  suppress, delay, or downgrade anything the deterministic crisis-phrase fast
  path (`packages/scoring-engine/src/crisis/`) already does. That fast path
  runs synchronously ahead of the trend pipeline today per
  `.claude/rules/services.md`; a language-signal model — which would
  necessarily be slower (model load + inference) and sometimes wrong — must
  sit entirely downstream of it, contributing only to the existing composite
  score's weighted-sum signals, never to the crisis-phrase match itself.
  Concretely: if this were ever implemented, the crisis scan would run first
  on the raw text, unconditionally, before the model is even invoked, exactly
  as it does today with no model present.
- **If the model is missing:** the signal contributes 0, under the existing
  "a missing/skipped answer contributes exactly 0, never a penalty" rule
  (`.claude/rules/scoring-engine.md`) extended to this new signal. This is the
  same behavior as someone skipping a question — no special-case code path,
  which is itself a safety property (fewer new branches to get wrong).
- **If the model is slow:** it must run with a hard timeout (comparable in
  spirit to the crisis fast-path's existing 3-second `AbortSignal.timeout` in
  `crisis-fast-path.ts`) after which it is treated as missing (contributes 0)
  rather than blocking check-in submission. The check-in itself must never
  wait on model inference to complete before being saved locally — inference
  would need to run as a background enhancement to an already-saved check-in,
  never gating the save.
- **If the model is wrong** (an incorrect sentiment/emotion label): because
  it's one of five weighted signals (weights fixed at
  `0.35/0.30/0.20/0.15` plus a hypothetical fifth, which would require a
  weight-scheme change reviewed on its own, not assumed here) and never shown
  to a counselor as a raw score (`.claude/rules/services.md`,
  `.claude/rules/scoring-engine.md`), a single wrong inference can shift a
  composite score but cannot, on its own, either trigger or suppress a crisis
  alert — that path is untouched by this model entirely, by construction, not
  by tuning.
- **Skipped questions still count as zero.** This signal is derived from
  free-text, not a Likert question, so it has no "skip" in the same UI sense
  — but the equivalent case (no free text entered, or free text present but
  model unavailable) must resolve to the same 0 contribution, not to a
  different code path that could accidentally diverge from the existing rule.

## 5. Privacy

- **All inference on device.** This is the entire premise of using
  Transformers.js over a server call — the text a person writes during a
  check-in never needs to leave the device to get a sentiment/emotion
  estimate. This matches the project's existing posture (five signals already
  scored on-device per the README) and extends it rather than introducing a
  new exception.
- **No text leaves the device because of the model.** The model's weights
  are downloaded *to* the device; nothing about running inference sends
  anything *from* the device. This needs to be an explicit test once
  implemented (network-request assertion during a check-in with the feature
  enabled, equivalent in spirit to the existing device-safety guardrail
  tests), not just an assumption from "it's WASM/WebGPU so it must be local."
- **Nothing is logged.** Only the signal's *numeric contribution* to the
  composite (already covered by the existing "composite scores are never
  returned to a counselor-facing endpoint" rule) would ever be persisted or
  transmitted — never the raw text, never the model's intermediate output
  (e.g. per-class probabilities), never which model version produced it in a
  way that could be correlated back to content. This mirrors how voice
  flatness and self-report signals already work: the *term*, not the
  underlying input, is what's stored.

## 6. Evaluation plan

**Labelled test set design.** Three balanced sub-sets, not one mixed pool,
because the known failure modes differ by language:

- **English** — baseline, most existing sentiment benchmarks apply.
- **Hindi** (Devanagari script) — distinct from Hinglish; most Indic models
  in §1 were trained on Devanagari Hindi, not romanized.
- **Hinglish** (code-mixed, typically Roman script with Hindi grammar/lexicon
  mixed with English, the register most people actually type on a phone
  keyboard) — the hardest case; SemEval-2020 Task 9's Hindi-English SentiMix
  dataset (20,000 tweets: 14K train / 3K dev / 3K test, sentence-level
  sentiment + word-level language-ID labels,
  [overview paper](https://aclanthology.org/2020.semeval-1.100.pdf)) is a
  usable reference point for what a labelled set in this register looks like,
  though tweets are a different register from a private check-in and
  should not be used as the actual eval set without adaptation.

Each sub-set must deliberately include, not just incidentally contain:

- **Negation** ("I'm not okay" vs. "I'm not *not* okay") — known to be hard
  for bag-of-words-style approaches, and scope detection (how many words a
  negation cue affects) remains an open technical problem in the literature
  (general NLP negation-scope research, no code-mixed-specific resolution
  found).
- **Sarcasm** — specifically documented as a Hindi-English code-mixed
  failure mode in the literature (["Did you really mean what you said?"
  Sarcasm Detection in Hindi-English Code-Mixed Data](https://arxiv.org/pdf/2010.00310)),
  where the model's naive sentiment read is the opposite of the intended one.
- **Indirect distress** — expressions that don't contain an obviously
  negative word at all ("I don't think anyone would notice," "it doesn't
  matter anymore") — the case most likely to produce a false negative, and
  the case general-purpose sentiment models are least likely to have been
  trained to catch, since they're trained on product/tweet sentiment, not
  clinical distress framing.

**Metrics, in order of what actually matters:**

1. **False-negative rate first**, not accuracy or F1 as the headline number.
   This mirrors established practice in actual crisis-text-line NLP research:
   one peer-reviewed study on text-based crisis counseling explicitly frames
   false-negative reduction as "clinically more critical than false
   positives" and reports both models' false-negative rates as the primary
   comparison point (37.98% vs. 60.47% for a neural vs. tf-idf baseline,
   [PMC10076638](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10076638/)).
   VIGIL's equivalent: for this signal, the question that matters is "how
   often does the model call something *fine* when the person meant
   *distress*" — the opposite direction (over-flagging) only costs noise in
   an already-advisory, non-crisis-overriding signal; under-flagging costs
   the thing the whole app exists to catch.
2. **Per-sub-set breakdown, never a pooled average.** A model that's strong
   on English and weak on Hinglish must not have that weakness hidden by
   averaging with the stronger English numbers — report English, Hindi, and
   Hinglish false-negative rates separately, and gate on the *worst* of the
   three, not the mean.
3. **Negation/sarcasm/indirect-distress subset performance reported
   separately again** from the general per-language numbers, since a model
   could pass on common phrasing and still fail specifically on these harder
   cases — which is exactly the failure mode most likely to matter for a
   distress signal.
4. Standard precision/recall/F1 as secondary, diagnostic numbers only — never
   the bar for a ship decision.

**Minimum bar before any model may influence a score:** proposed as a
starting point for discussion, not a finalized threshold — that decision
belongs with whoever reviews the labels (next point), informed by real
labelled-data results, not asserted here from research alone:

- False-negative rate on the indirect-distress subset, for *every* language
  sub-set individually, below some agreed ceiling — I'm deliberately not
  proposing a specific percentage, because doing so without real labelled
  data to validate it would be asserting a number with no evidence behind
  it, which is worse than leaving it open.
- No sub-set may be skipped to hit an average — all three languages must
  individually clear the bar.
- The bar must be re-validated any time the model, its quantization, or its
  prompt/label set changes — a passing evaluation is tied to a specific
  model version, not a one-time gate.

**Who must review the labels:** this is a mental-health-adjacent labelling
task on text from a vulnerable population (survivors of atrocities); the
literature on crisis-text NLP treats clinical/counseling review as a
baseline expectation, not an optional nicety (the PMC study above was run in
partnership with a crisis counseling organization with clinical input into
labelling). For VIGIL specifically, labels should be reviewed by: (a) a
native/fluent Hindi-Hinglish speaker, for the same reason Phase 1 item 1's
follow-up work already flagged Hindi UI strings as needing native-speaker
review — sentiment labelling has the same risk, arguably higher, since
getting an emotional register wrong in a label corrupts the ground truth
itself; and (b) someone with counseling/clinical-safety background to judge
the indirect-distress and sarcasm subsets, where a lay labeller is most
likely to mis-score what "clearly fine" vs. "clearly distressed" text
actually looks like. Both reviewers are a people/process decision for the
project owner to assign — no such review has happened yet; this document
does not claim any evaluation has been run.

## 7. Recommendation

**Do not build this yet.** The technical path is real and the pieces exist
(Transformers.js, several multilingual-with-Hindi sentiment models,
on-device-only inference consistent with VIGIL's existing architecture), but
three gaps make it premature to even prototype wiring:

1. **No model found in this research pass is both (a) a ready-to-use
   classifier with a real sentiment/emotion head and (b) actually trained on
   Hinglish.** The Hinglish-specific option (L3Cube HingBERT) is a base
   encoder requiring a classification head built and evaluated from scratch;
   the ready-to-use classifiers (CardiffNLP, lxyuan) have Hindi but not
   Hinglish in their training data, and their code-mixed behavior is
   unverified, not just untested — nobody has published numbers on it that I
   could find.
2. **No labelled evaluation has been run.** Every claim in §6 is a plan, not
   a result. Shipping — or even soft-launching behind a flag — before a real
   evaluation exists would mean putting an unvalidated signal in front of a
   scoring pipeline that currently has a 100%-branch-coverage bar and a
   deterministic, audited crisis path. That's the wrong order of operations.
3. **Low-end Android performance is unverified.** This is the device class
   VIGIL is built for, and no benchmark found in this research targets it
   specifically — every number is desktop or unspecified-device. A model
   that's fine on a mid-range or high-end phone could still be a battery/
   thermal problem on the hardware VIGIL's actual users are most likely to
   have.

**Do-not-ship condition, explicit:** this signal must not be wired into
scoring — even behind a flag, even for a subset of users — until all of the
following are true simultaneously: (a) a specific model has been chosen with
a verified, measured (not estimated) quantized file size; (b) a labelled
evaluation per §6 has actually been run, reviewed by both a native
Hindi/Hinglish speaker and someone with clinical-safety background, and has
cleared an agreed false-negative-rate bar on every language sub-set
individually, including the negation/sarcasm/indirect-distress sub-cases;
and (c) real low-end Android device testing (not desktop extrapolation) has
confirmed the inference cost is acceptable. Absent any one of these three,
the correct action is to keep this document as research and not proceed —
not to ship a partial version "to start somewhere," since a partial,
unvalidated distress signal is worse than no signal at all for exactly the
population this app serves.

## What this document does not claim

- It does not claim any of the candidate models were run or benchmarked —
  every size/performance number is as reported by its source, not measured
  directly against VIGIL's content or hardware.
- It does not claim a final model choice — that depends on the unresolved
  Hinglish-classifier gap in finding/verifying §1's follow-up noted above.
- It does not claim any consent-flow, caching, or UI design here is final —
  §3's consent-scope and caching sketch is a direction, not a committed
  design, and would need its own plan-and-review pass if this item is ever
  approved to move past research.
