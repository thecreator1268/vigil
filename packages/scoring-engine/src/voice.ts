/**
 * Signal 4 — voice prosody (bonus tier). Features are extracted on-device with
 * Meyda (RMS) plus an autocorrelation pitch track; only the two summary
 * numbers below ever leave the extractor. Voice can never fire an alert on its
 * own — it only nudges the composite by its (smallest) weight.
 */
import { clamp } from './math.js';

export interface VoiceFeatures {
  /** Coefficient of variation of voiced-frame pitch (σ/μ). */
  pitchVar: number;
  /** Mean RMS energy of voiced frames (0..1 full-scale). */
  rms: number;
}

/** Reference points at which speech is considered fully "animated". */
export const PITCH_VAR_REF = 0.25;
export const RMS_REF = 0.1;

/** Normalised flatness in [0, 1]: 1 = monotone and quiet, 0 = animated. */
export function voiceFlatness(f: VoiceFeatures): number {
  const monotone = clamp(1 - f.pitchVar / PITCH_VAR_REF, 0, 1);
  const quiet = clamp(1 - f.rms / RMS_REF, 0, 1);
  return 0.7 * monotone + 0.3 * quiet;
}

/**
 * Wellbeing-oriented voice term for the composite, in [-1, 1].
 * Flatness is distress-oriented, so it is re-centred as 1 − 2·flatness:
 * higher is always better, and a missing sample contributes exactly 0.
 */
export function voiceTerm(f: VoiceFeatures | null | undefined): number | null {
  if (!f || !Number.isFinite(f.pitchVar) || !Number.isFinite(f.rms)) return null;
  return 1 - 2 * voiceFlatness(f);
}
