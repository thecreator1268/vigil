/**
 * One-call entry point used by the device (and IVRS/SMS adapters server-side):
 * scores all five signals for a single check-in against the person's history.
 */
import { composite, type SignalTerms } from './composite.js';
import type { ScoringConfig } from './config.js';
import { scanForCrisis, type CrisisResult } from './crisis/matcher.js';
import { engagementDelta, type EngagementSample } from './engagement.js';
import { normalizeSelfReport } from './self-report.js';
import { sentimentCompound } from './sentiment/analyze.js';
import { voiceTerm, type VoiceFeatures } from './voice.js';

export interface CheckInInput {
  createdAt: number;
  selfReport: Readonly<Record<string, number>>;
  /** Typed text and/or a voice transcript. Scanned, scored, never stored here. */
  text?: string | null;
  responseLatencyMs?: number | null;
  voiceFeatures?: VoiceFeatures | null;
}

export interface CheckInScore {
  terms: SignalTerms;
  compositeScore: number;
  sentimentScore: number | null;
  crisis: CrisisResult;
  configVersion: number;
}

export function scoreCheckIn(
  input: CheckInInput,
  history: readonly EngagementSample[],
  cfg: ScoringConfig,
): CheckInScore {
  const text = input.text?.trim() ? input.text : null;
  const sentimentScore = text ? sentimentCompound(text) : null;
  const terms: SignalTerms = {
    selfReport: normalizeSelfReport(input.selfReport),
    sentiment: sentimentScore,
    engagement: engagementDelta(
      { createdAt: input.createdAt, responseLatencyMs: input.responseLatencyMs ?? null },
      history,
      cfg.baselineWindow,
    ),
    voice: voiceTerm(input.voiceFeatures),
  };
  return {
    terms,
    compositeScore: composite(terms, cfg),
    sentimentScore,
    crisis: scanForCrisis(text),
    configVersion: cfg.version,
  };
}
