import type { Pool } from '@vigil/service-kit';

export interface StoredCredential {
  id: string; // base64url credential id
  counselorId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  createdAt: number;
  lastUsedAt: number | null;
}

export type ChallengeType = 'register' | 'login';
export interface StoredChallenge {
  attemptId: string;
  type: ChallengeType;
  counselorId: string | null;
  challenge: string;
  expiresAt: number;
}

export type EnrollmentTokenType = 'bootstrap' | 'recovery';
export interface StoredEnrollmentToken {
  id: string;
  type: EnrollmentTokenType;
  counselorId: string;
  tokenHash: string;
  expiresAt: number;
}

export interface StoredOperator {
  operatorId: string;
  displayName: string;
  tokenHash: string;
  disabledAt: number | null;
}

export interface AuditEntry {
  action: string;
  actor: string;
  targetCounselorId: string | null;
  detail: Record<string, unknown>;
  at: number;
}

export interface IdentityRepo {
  // counselors
  createCounselor(id: string, displayName: string, at: number): Promise<void>;
  counselorExists(id: string): Promise<boolean>;

  // credentials
  addCredential(c: StoredCredential): Promise<void>;
  getCredential(id: string): Promise<StoredCredential | null>;
  listCredentials(counselorId: string): Promise<StoredCredential[]>;
  countCredentials(counselorId: string): Promise<number>;
  updateCounter(id: string, counter: number, lastUsedAt: number): Promise<void>;
  removeCredential(id: string, counselorId: string): Promise<boolean>;
  revokeAllCredentials(counselorId: string): Promise<void>;

  // challenges — single-use, consumed atomically
  createChallenge(c: StoredChallenge): Promise<void>;
  consumeChallenge(attemptId: string, now: number): Promise<StoredChallenge | null>;

  // enrollment tokens — single-use, hashed
  createEnrollmentToken(t: StoredEnrollmentToken, createdBy: string, at: number): Promise<void>;
  consumeEnrollmentTokenCandidates(now: number): Promise<StoredEnrollmentToken[]>;
  markEnrollmentTokenUsed(id: string, at: number): Promise<boolean>;

  // ops operators
  addOperator(o: StoredOperator, at: number): Promise<void>;
  getOperator(operatorId: string): Promise<StoredOperator | null>;

  // recovery requests — two distinct operators
  createRecoveryRequest(id: string, counselorId: string, requestedBy: string, at: number): Promise<void>;
  getRecoveryRequest(id: string): Promise<{ counselorId: string; requestedBy: string; approvedBy: string | null } | null>;
  approveRecoveryRequest(id: string, approvedBy: string): Promise<boolean>;

  // audit — append only
  audit(e: AuditEntry): Promise<void>;

  ping(): Promise<void>;
}

export const MIGRATIONS = [
  {
    id: '001_identity',
    sql: `
      CREATE TABLE counselors (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE webauthn_credentials (
        id TEXT PRIMARY KEY,
        counselor_id TEXT NOT NULL REFERENCES counselors(id),
        public_key BYTEA NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        transports_json JSONB NOT NULL DEFAULT '[]',
        created_at BIGINT NOT NULL,
        last_used_at BIGINT
      );
      CREATE INDEX webauthn_credentials_counselor ON webauthn_credentials (counselor_id);
      CREATE TABLE webauthn_challenges (
        attempt_id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('register', 'login')),
        counselor_id TEXT,
        challenge TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        used_at BIGINT
      );
      CREATE TABLE enrollment_tokens (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('bootstrap', 'recovery')),
        counselor_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        used_at BIGINT
      );
      CREATE TABLE ops_operators (
        operator_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        disabled_at BIGINT
      );
      CREATE TABLE recovery_requests (
        id TEXT PRIMARY KEY,
        counselor_id TEXT NOT NULL,
        requested_by_operator_id TEXT NOT NULL,
        approved_by_operator_id TEXT,
        created_at BIGINT NOT NULL,
        approved_at BIGINT
      );
      CREATE TABLE audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        at BIGINT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_counselor_id TEXT,
        detail_json JSONB NOT NULL DEFAULT '{}'
      );
      CREATE INDEX audit_log_target ON audit_log (target_counselor_id, at DESC);
    `,
  },
];

export function pgRepo(pool: Pool): IdentityRepo {
  return {
    async createCounselor(id, displayName, at) {
      await pool.query('INSERT INTO counselors (id, display_name, created_at) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING', [id, displayName, at]);
    },
    async counselorExists(id) {
      const r = await pool.query('SELECT 1 FROM counselors WHERE id = $1', [id]);
      return r.rows.length > 0;
    },
    async addCredential(c) {
      await pool.query(
        `INSERT INTO webauthn_credentials (id, counselor_id, public_key, counter, transports_json, created_at, last_used_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [c.id, c.counselorId, Buffer.from(c.publicKey), c.counter, JSON.stringify(c.transports), c.createdAt, c.lastUsedAt],
      );
    },
    async getCredential(id) {
      const r = await pool.query<{
        id: string; counselor_id: string; public_key: Buffer; counter: string; transports_json: string[]; created_at: string; last_used_at: string | null;
      }>('SELECT * FROM webauthn_credentials WHERE id = $1', [id]);
      const row = r.rows[0];
      if (!row) return null;
      return {
        id: row.id, counselorId: row.counselor_id, publicKey: new Uint8Array(row.public_key),
        counter: Number(row.counter), transports: row.transports_json, createdAt: Number(row.created_at),
        lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
      };
    },
    async listCredentials(counselorId) {
      const r = await pool.query<{
        id: string; counselor_id: string; public_key: Buffer; counter: string; transports_json: string[]; created_at: string; last_used_at: string | null;
      }>('SELECT * FROM webauthn_credentials WHERE counselor_id = $1 ORDER BY created_at', [counselorId]);
      return r.rows.map((row) => ({
        id: row.id, counselorId: row.counselor_id, publicKey: new Uint8Array(row.public_key),
        counter: Number(row.counter), transports: row.transports_json, createdAt: Number(row.created_at),
        lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
      }));
    },
    async countCredentials(counselorId) {
      const r = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM webauthn_credentials WHERE counselor_id = $1', [counselorId]);
      return Number(r.rows[0]?.count ?? 0);
    },
    async updateCounter(id, counter, lastUsedAt) {
      await pool.query('UPDATE webauthn_credentials SET counter = $2, last_used_at = $3 WHERE id = $1', [id, counter, lastUsedAt]);
    },
    async removeCredential(id, counselorId) {
      const r = await pool.query('DELETE FROM webauthn_credentials WHERE id = $1 AND counselor_id = $2', [id, counselorId]);
      return (r.rowCount ?? 0) > 0;
    },
    async revokeAllCredentials(counselorId) {
      await pool.query('DELETE FROM webauthn_credentials WHERE counselor_id = $1', [counselorId]);
    },
    async createChallenge(c) {
      await pool.query(
        'INSERT INTO webauthn_challenges (attempt_id, type, counselor_id, challenge, expires_at) VALUES ($1,$2,$3,$4,$5)',
        [c.attemptId, c.type, c.counselorId, c.challenge, c.expiresAt],
      );
    },
    async consumeChallenge(attemptId, now) {
      const r = await pool.query<{ attempt_id: string; type: ChallengeType; counselor_id: string | null; challenge: string; expires_at: string }>(
        `UPDATE webauthn_challenges SET used_at = $2 WHERE attempt_id = $1 AND used_at IS NULL AND expires_at > $2 RETURNING *`,
        [attemptId, now],
      );
      const row = r.rows[0];
      if (!row) return null;
      return { attemptId: row.attempt_id, type: row.type, counselorId: row.counselor_id, challenge: row.challenge, expiresAt: Number(row.expires_at) };
    },
    async createEnrollmentToken(t, createdBy, at) {
      await pool.query('INSERT INTO enrollment_tokens (id, type, counselor_id, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)', [t.id, t.type, t.counselorId, t.tokenHash, t.expiresAt]);
      await pool.query('INSERT INTO audit_log (at, actor, action, target_counselor_id, detail_json) VALUES ($1,$2,$3,$4,$5)', [at, createdBy, 'enrollment_token_created', t.counselorId, JSON.stringify({ tokenType: t.type, tokenId: t.id })]);
    },
    async consumeEnrollmentTokenCandidates(now) {
      const r = await pool.query<{ id: string; type: EnrollmentTokenType; counselor_id: string; token_hash: string; expires_at: string }>(
        'SELECT * FROM enrollment_tokens WHERE used_at IS NULL AND expires_at > $1', [now],
      );
      return r.rows.map((row) => ({ id: row.id, type: row.type, counselorId: row.counselor_id, tokenHash: row.token_hash, expiresAt: Number(row.expires_at) }));
    },
    async markEnrollmentTokenUsed(id, at) {
      const r = await pool.query('UPDATE enrollment_tokens SET used_at = $2 WHERE id = $1 AND used_at IS NULL', [id, at]);
      return (r.rowCount ?? 0) > 0;
    },
    async addOperator(o, at) {
      await pool.query('INSERT INTO ops_operators (operator_id, display_name, token_hash, created_at, disabled_at) VALUES ($1,$2,$3,$4,$5)', [o.operatorId, o.displayName, o.tokenHash, at, o.disabledAt]);
    },
    async getOperator(operatorId) {
      const r = await pool.query<{ operator_id: string; display_name: string; token_hash: string; disabled_at: string | null }>('SELECT * FROM ops_operators WHERE operator_id = $1', [operatorId]);
      const row = r.rows[0];
      if (!row) return null;
      return { operatorId: row.operator_id, displayName: row.display_name, tokenHash: row.token_hash, disabledAt: row.disabled_at === null ? null : Number(row.disabled_at) };
    },
    async createRecoveryRequest(id, counselorId, requestedBy, at) {
      await pool.query('INSERT INTO recovery_requests (id, counselor_id, requested_by_operator_id, created_at) VALUES ($1,$2,$3,$4)', [id, counselorId, requestedBy, at]);
      await pool.query('INSERT INTO audit_log (at, actor, action, target_counselor_id, detail_json) VALUES ($1,$2,$3,$4,$5)', [at, requestedBy, 'recovery_requested', counselorId, JSON.stringify({ requestId: id })]);
    },
    async getRecoveryRequest(id) {
      const r = await pool.query<{ counselor_id: string; requested_by_operator_id: string; approved_by_operator_id: string | null }>('SELECT counselor_id, requested_by_operator_id, approved_by_operator_id FROM recovery_requests WHERE id = $1', [id]);
      const row = r.rows[0];
      if (!row) return null;
      return { counselorId: row.counselor_id, requestedBy: row.requested_by_operator_id, approvedBy: row.approved_by_operator_id };
    },
    async approveRecoveryRequest(id, approvedBy) {
      const r = await pool.query(
        'UPDATE recovery_requests SET approved_by_operator_id = $2, approved_at = $3 WHERE id = $1 AND approved_by_operator_id IS NULL AND requested_by_operator_id != $2',
        [id, approvedBy, Date.now()],
      );
      return (r.rowCount ?? 0) > 0;
    },
    async audit(e) {
      await pool.query('INSERT INTO audit_log (at, actor, action, target_counselor_id, detail_json) VALUES ($1,$2,$3,$4,$5)', [e.at, e.actor, e.action, e.targetCounselorId, JSON.stringify(e.detail)]);
    },
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

export function memoryRepo(): IdentityRepo & { _audit: AuditEntry[] } {
  const counselors = new Map<string, { id: string; displayName: string }>();
  const credentials = new Map<string, StoredCredential>();
  const challenges = new Map<string, StoredChallenge & { usedAt: number | null }>();
  const enrollmentTokens = new Map<string, StoredEnrollmentToken & { usedAt: number | null }>();
  const operators = new Map<string, StoredOperator>();
  const recoveryRequests = new Map<string, { counselorId: string; requestedBy: string; approvedBy: string | null }>();
  const _audit: AuditEntry[] = [];

  return {
    _audit,
    async createCounselor(id, displayName) {
      if (!counselors.has(id)) counselors.set(id, { id, displayName });
    },
    async counselorExists(id) {
      return counselors.has(id);
    },
    async addCredential(c) {
      credentials.set(c.id, { ...c });
    },
    async getCredential(id) {
      return credentials.get(id) ?? null;
    },
    async listCredentials(counselorId) {
      return [...credentials.values()].filter((c) => c.counselorId === counselorId).sort((a, b) => a.createdAt - b.createdAt);
    },
    async countCredentials(counselorId) {
      return [...credentials.values()].filter((c) => c.counselorId === counselorId).length;
    },
    async updateCounter(id, counter, lastUsedAt) {
      const c = credentials.get(id);
      if (c) { c.counter = counter; c.lastUsedAt = lastUsedAt; }
    },
    async removeCredential(id, counselorId) {
      const c = credentials.get(id);
      if (!c || c.counselorId !== counselorId) return false;
      credentials.delete(id);
      return true;
    },
    async revokeAllCredentials(counselorId) {
      for (const [id, c] of credentials) if (c.counselorId === counselorId) credentials.delete(id);
    },
    async createChallenge(c) {
      challenges.set(c.attemptId, { ...c, usedAt: null });
    },
    async consumeChallenge(attemptId, now) {
      const c = challenges.get(attemptId);
      if (!c || c.usedAt !== null || c.expiresAt <= now) return null;
      c.usedAt = now;
      return { attemptId: c.attemptId, type: c.type, counselorId: c.counselorId, challenge: c.challenge, expiresAt: c.expiresAt };
    },
    async createEnrollmentToken(t, createdBy, at) {
      enrollmentTokens.set(t.id, { ...t, usedAt: null });
      _audit.push({ action: 'enrollment_token_created', actor: createdBy, targetCounselorId: t.counselorId, detail: { tokenType: t.type, tokenId: t.id }, at });
    },
    async consumeEnrollmentTokenCandidates(now) {
      return [...enrollmentTokens.values()].filter((t) => t.usedAt === null && t.expiresAt > now);
    },
    async markEnrollmentTokenUsed(id, at) {
      const t = enrollmentTokens.get(id);
      if (!t || t.usedAt !== null) return false;
      t.usedAt = at;
      return true;
    },
    async addOperator(o) {
      operators.set(o.operatorId, { ...o });
    },
    async getOperator(operatorId) {
      return operators.get(operatorId) ?? null;
    },
    async createRecoveryRequest(id, counselorId, requestedBy, at) {
      recoveryRequests.set(id, { counselorId, requestedBy, approvedBy: null });
      _audit.push({ action: 'recovery_requested', actor: requestedBy, targetCounselorId: counselorId, detail: { requestId: id }, at });
    },
    async getRecoveryRequest(id) {
      return recoveryRequests.get(id) ?? null;
    },
    async approveRecoveryRequest(id, approvedBy) {
      const r = recoveryRequests.get(id);
      if (!r || r.approvedBy !== null || r.requestedBy === approvedBy) return false;
      r.approvedBy = approvedBy;
      return true;
    },
    async audit(e) {
      _audit.push(e);
    },
    async ping() {},
  };
}
