/**
 * Adapter boundary to the external government case system (e.g. a state PoA
 * Act case tracker / eCourts). Only this module knows the external schema.
 *
 * `MockCaseSystem` is a deterministic stand-in for local development and
 * demos: it is NOT a real integration and returns fabricated, clearly-labelled
 * test data for the seeded demo identities only.
 */
import { createHash } from 'node:crypto';

export type CaseStage = 'fir_registered' | 'investigation' | 'chargesheet' | 'trial' | 'disposed';
export type CompensationStatus = 'not_applied' | 'applied' | 'sanctioned' | 'disbursed';

export interface ExternalCaseRecord {
  externalCaseRef: string;
  victimId: string;
  stage: CaseStage;
  nextHearingAt: number | null;
  compensationStatus: CompensationStatus;
}

export interface ExternalCaseSystem {
  readonly name: string;
  fetchCases(victimIds: readonly string[], now: number): Promise<ExternalCaseRecord[]>;
}

/** Deterministic UUID (v5-style layout) from a stable name. */
export function uuidFrom(name: string): string {
  const h = createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16] as string, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const DAY = 86_400_000;
const STAGES: CaseStage[] = ['fir_registered', 'investigation', 'chargesheet', 'trial'];
const COMP: CompensationStatus[] = ['applied', 'sanctioned', 'applied', 'disbursed'];

export class MockCaseSystem implements ExternalCaseSystem {
  readonly name = 'mock-case-tracker';

  async fetchCases(victimIds: readonly string[], now: number): Promise<ExternalCaseRecord[]> {
    return victimIds.map((victimId) => {
      const n = parseInt(createHash('sha256').update(victimId).digest('hex').slice(0, 6), 16);
      const stage = STAGES[n % STAGES.length] as CaseStage;
      const hearingDay = Math.floor(now / DAY) * DAY + (3 + (n % 20)) * DAY + 10.5 * 3_600_000;
      return {
        externalCaseRef: `DEMO/${2025 + (n % 2)}/${String(n % 9000).padStart(4, '0')}`,
        victimId,
        stage,
        nextHearingAt: stage === 'trial' || stage === 'chargesheet' ? hearingDay : null,
        compensationStatus: COMP[n % COMP.length] as CompensationStatus,
      };
    });
  }
}
