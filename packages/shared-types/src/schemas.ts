/**
 * Zod mirrors of the OpenAPI component schemas — the ONE schema set used for
 * both client-side form validation (React Hook Form) and server-side request
 * validation. `contract-parity.ts` fails the typecheck if these drift from the
 * generated OpenAPI types.
 */
import { z } from 'zod';

export const VictimId = z.string().regex(/^v_[A-Za-z0-9_-]{6,64}$/, 'invalid victim id');
export const Timestamp = z.number().int().min(0);
export const Severity = z.enum(['urgent', 'elevated']);
export const AlertStatus = z.enum(['open', 'acknowledged', 'resolved']);
export const SignalName = z.enum(['self_report', 'sentiment', 'engagement', 'voice', 'crisis_scan']);
export const Channel = z.enum(['app', 'ivrs', 'sms']);
export const ReminderType = z.enum(['hearing', 'compensation', 'checkin']);
export const ConsentScope = z.enum([
  'share-free-text',
  'share-voice-features',
  'voice-transcription',
  'counselor-contact',
  'case-linking',
]);
export const CrisisCategory = z.enum(['self_harm', 'threat_to_safety']);

const unit = z.number().min(-1).max(1);
const likert = z.number().int().min(0).max(4);

export const SignalTerms = z.strictObject({
  selfReport: unit.nullable(),
  sentiment: unit.nullable(),
  engagement: unit.nullable(),
  voice: unit.nullable(),
});

export const CrisisMatch = z.strictObject({
  listVersion: z.string(),
  matchedPhraseIds: z.array(z.string()),
  categories: z.array(CrisisCategory),
});

export const SelfReport = z
  .record(z.string(), likert)
  .refine((r) => Object.keys(r).length <= 10, 'too many answers');

export const CheckInSubmission = z.strictObject({
  id: z.uuid(),
  victimId: VictimId,
  createdAt: Timestamp,
  selfReport: SelfReport,
  freeText: z.string().max(4000).optional(),
  sentimentScore: unit.nullable().optional(),
  voiceFeatures: z
    .strictObject({ pitchVar: z.number().min(0), rms: z.number().min(0) })
    .nullable()
    .optional(),
  crisisFlag: z.boolean(),
  crisis: CrisisMatch.nullable().optional(),
  compositeScore: unit,
  signalTerms: SignalTerms,
  responseLatencyMs: z.number().int().min(0).nullable().optional(),
  configVersion: z.number().int().min(1),
  channel: Channel,
  fastPath: z.boolean(),
  region: z.string().max(64).optional(),
});

export const CheckInAccepted = z.strictObject({
  id: z.uuid(),
  syncState: z.enum(['synced', 'crisis-synced']),
});

export const CheckInSummary = z.strictObject({
  id: z.uuid(),
  createdAt: Timestamp,
  selfReport: z.record(z.string(), likert),
  sharedText: z.string().nullable().optional(),
  crisisFlag: z.boolean(),
  channel: Channel,
});

export const Baseline = z.strictObject({
  mean: z.number(),
  stddev: z.number().min(0),
  windowSize: z.number().int().min(0),
  sufficient: z.boolean(),
});

export const TrendPoint = z.strictObject({ at: Timestamp, compositeScore: unit });
export const TrendResponse = z.strictObject({
  points: z.array(TrendPoint),
  baseline: Baseline.nullable(),
});

export const ScoringConfig = z.strictObject({
  version: z.number().int().min(1),
  weights: z.strictObject({
    selfReport: z.number().min(0).max(1),
    sentiment: z.number().min(0).max(1),
    engagement: z.number().min(0).max(1),
    voice: z.number().min(0).max(1),
  }),
  zThreshold: z.number().max(0),
  urgentZThreshold: z.number().max(0),
  slopeThreshold: z.number().gt(0),
  baselineWindow: z.number().int().min(2),
  minBaseline: z.number().int().min(2),
  slopeWindow: z.number().int().min(2),
  sigmaFloor: z.number().gt(0),
  involvementThreshold: z.number().gt(0),
});

export const Alert = z.strictObject({
  id: z.uuid(),
  victimId: VictimId,
  severity: Severity,
  signals_involved: z.array(SignalName),
  reason_text: z.string().min(1),
  raw_score: z.null(),
  status: AlertStatus,
  source: z.enum(['trend', 'crisis']),
  configVersion: z.number().int().min(1),
  createdAt: Timestamp,
  acknowledgedAt: Timestamp.nullable(),
  acknowledgedBy: z.string().nullable(),
});

export const ReminderInput = z.strictObject({
  id: z.uuid(),
  victimId: VictimId,
  dueAt: Timestamp,
  type: ReminderType,
  note: z.string().max(500),
});
export const Reminder = ReminderInput.extend({ updatedAt: Timestamp });

export const ConsentInput = z.strictObject({
  id: z.uuid(),
  victimId: VictimId,
  scope: ConsentScope,
  granted: z.boolean(),
  at: Timestamp,
});
export const ConsentRecord = ConsentInput.extend({
  updatedAt: Timestamp,
  ledgerVersion: z.number().int().min(1),
});

export const CaseLink = z.strictObject({
  id: z.uuid(),
  victimId: VictimId,
  externalSystem: z.string(),
  externalCaseRef: z.string(),
  stage: z.enum(['fir_registered', 'investigation', 'chargesheet', 'trial', 'disposed']),
  nextHearingAt: Timestamp.nullable(),
  compensationStatus: z.enum(['not_applied', 'applied', 'sanctioned', 'disbursed']),
  updatedAt: Timestamp,
});

export const AnonymizedAggregate = z.strictObject({
  region: z.string(),
  periodDays: z.number().int().min(1),
  suppressed: z.boolean(),
  cohortSize: z.number().int().min(0).nullable(),
  checkInCount: z.number().int().min(0).nullable(),
  alerts: z
    .strictObject({
      urgent: z.number().int().min(0),
      elevated: z.number().int().min(0),
      acknowledgedWithin24hPct: z.number().min(0).max(100).nullable(),
    })
    .nullable(),
  weeklyCheckIns: z.array(z.strictObject({ weekStart: Timestamp, count: z.number().int().min(0) })),
});

export const ApiError = z.strictObject({ error: z.string(), message: z.string() });

export type VictimId = z.infer<typeof VictimId>;
export type Severity = z.infer<typeof Severity>;
export type AlertStatus = z.infer<typeof AlertStatus>;
export type SignalName = z.infer<typeof SignalName>;
export type Channel = z.infer<typeof Channel>;
export type ReminderType = z.infer<typeof ReminderType>;
export type ConsentScope = z.infer<typeof ConsentScope>;
export type CrisisCategory = z.infer<typeof CrisisCategory>;
export type SignalTerms = z.infer<typeof SignalTerms>;
export type CrisisMatch = z.infer<typeof CrisisMatch>;
export type CheckInSubmission = z.infer<typeof CheckInSubmission>;
export type CheckInAccepted = z.infer<typeof CheckInAccepted>;
export type CheckInSummary = z.infer<typeof CheckInSummary>;
export type Baseline = z.infer<typeof Baseline>;
export type TrendPoint = z.infer<typeof TrendPoint>;
export type TrendResponse = z.infer<typeof TrendResponse>;
export type ScoringConfig = z.infer<typeof ScoringConfig>;
export type Alert = z.infer<typeof Alert>;
export type ReminderInput = z.infer<typeof ReminderInput>;
export type Reminder = z.infer<typeof Reminder>;
export type ConsentInput = z.infer<typeof ConsentInput>;
export type ConsentRecord = z.infer<typeof ConsentRecord>;
export type CaseLink = z.infer<typeof CaseLink>;
export type AnonymizedAggregate = z.infer<typeof AnonymizedAggregate>;
export type ApiError = z.infer<typeof ApiError>;
