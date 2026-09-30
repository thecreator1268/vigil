/**
 * Scoring configuration. The *authoritative* copy lives in the versioned
 * `scoring_config` table (distress-trend-service); this default is only what a
 * brand-new, never-synced device uses. Every score and alert records the
 * `version` that produced it.
 */
export interface ScoringWeights {
  selfReport: number; // w1
  sentiment: number; // w2
  engagement: number; // w3
  voice: number; // w4
}

export interface ScoringConfig {
  version: number;
  weights: ScoringWeights;
  /** T — z-score threshold in the distressed (negative) direction. */
  zThreshold: number;
  /** z at or below this upgrades a trend alert from elevated to urgent. */
  urgentZThreshold: number;
  /** Magnitude; a regression slope below -slopeThreshold is distressed. */
  slopeThreshold: number;
  /** N — rolling baseline window. */
  baselineWindow: number;
  /** Minimum prior check-ins before any trend alert can fire. */
  minBaseline: number;
  /** Number of check-ins in the slope regression. */
  slopeWindow: number;
  /** Floor for σ so a perfectly steady baseline cannot divide by zero. */
  sigmaFloor: number;
  /** How far below its own baseline a term must drop to be named in an alert. */
  involvementThreshold: number;
}

export const DEFAULT_SCORING_CONFIG: Readonly<ScoringConfig> = Object.freeze({
  version: 1,
  weights: Object.freeze({ selfReport: 0.35, sentiment: 0.3, engagement: 0.2, voice: 0.15 }),
  zThreshold: -1.5,
  urgentZThreshold: -2.5,
  slopeThreshold: 0.08,
  baselineWindow: 10,
  minBaseline: 4,
  slopeWindow: 5,
  sigmaFloor: 0.05,
  involvementThreshold: 0.25,
});
