/**
 * Compile-time drift detector: every Zod schema must be mutually assignable
 * with the type generated from openapi.yaml. If someone edits one side only,
 * `pnpm typecheck` fails here. (No runtime code.)
 */
import type { z } from 'zod';
import type { components } from './generated/openapi.js';
import type * as S from './schemas.js';

type Schemas = components['schemas'];
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type ContractParity = [
  Assert<Same<z.infer<typeof S.Alert>, Schemas['Alert']>>,
  Assert<Same<z.infer<typeof S.CheckInSubmission>, Schemas['CheckInSubmission']>>,
  Assert<Same<z.infer<typeof S.CheckInAccepted>, Schemas['CheckInAccepted']>>,
  Assert<Same<z.infer<typeof S.CheckInSummary>, Schemas['CheckInSummary']>>,
  Assert<Same<z.infer<typeof S.TrendResponse>, Schemas['TrendResponse']>>,
  Assert<Same<z.infer<typeof S.ScoringConfig>, Schemas['ScoringConfig']>>,
  Assert<Same<z.infer<typeof S.Reminder>, Schemas['Reminder']>>,
  Assert<Same<z.infer<typeof S.ReminderInput>, Schemas['ReminderInput']>>,
  Assert<Same<z.infer<typeof S.ConsentInput>, Schemas['ConsentInput']>>,
  Assert<Same<z.infer<typeof S.ConsentRecord>, Schemas['ConsentRecord']>>,
  Assert<Same<z.infer<typeof S.CaseLink>, Schemas['CaseLink']>>,
  Assert<Same<z.infer<typeof S.AnonymizedAggregate>, Schemas['AnonymizedAggregate']>>,
  Assert<Same<z.infer<typeof S.ApiError>, Schemas['Error']>>,
];
