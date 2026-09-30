import type { ConsentInput, ConsentRecord, ConsentScope } from '@vigil/shared-types';
import type { Pool } from '@vigil/service-kit';

export type SyncState = 'synced' | 'crisis-synced';
export type OutboxTopic = 'alert.crisis' | 'trend.point';

export interface StoredCheckIn {
  id: string;
  victimId: string;
  createdAt: number;
  receivedAt: number;
  selfReport: Record<string, number>;
  freeTextEnc: string | null;
  sentimentScore: number | null;
  voiceFeatures: { pitchVar: number; rms: number } | null;
  crisisFlag: boolean;
  crisis: unknown;
  compositeScore: number;
  signalTerms: Record<string, number | null>;
  responseLatencyMs: number | null;
  configVersion: number;
  channel: 'app' | 'ivrs' | 'sms';
  fastPath: boolean;
  region: string | null;
  syncState: SyncState;
}

export interface OutboxEvent {
  id: number;
  topic: OutboxTopic;
  payload: unknown;
  attempts: number;
}

export interface CheckinRepo {
  /** Append-only insert + outbox events in ONE transaction. Idempotent on id. */
  insertCheckIn(row: StoredCheckIn, events: { topic: OutboxTopic; payload: unknown }[]): Promise<{ inserted: boolean; syncState: SyncState }>;
  getCheckIn(id: string): Promise<StoredCheckIn | null>;
  eraseFreeText(id: string): Promise<void>;
  listCheckIns(victimId: string, limit: number): Promise<StoredCheckIn[]>;
  appendConsent(input: ConsentInput, now: number): Promise<ConsentRecord>;
  effectiveConsent(victimId: string): Promise<ConsentRecord[]>;
  claimOutbox(limit: number, now: number): Promise<OutboxEvent[]>;
  markDelivered(id: number, now: number): Promise<void>;
  markFailed(id: number, error: string, nextAttemptAt: number): Promise<void>;
  ping(): Promise<void>;
}

export function consentGranted(records: readonly ConsentRecord[], scope: ConsentScope): boolean {
  return records.some((r) => r.scope === scope && r.granted);
}

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

export const MIGRATIONS = [
  {
    id: '001_check_ins',
    sql: `
      CREATE TABLE check_ins (
        id UUID PRIMARY KEY,
        victim_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        received_at BIGINT NOT NULL,
        self_report JSONB NOT NULL,
        free_text_enc TEXT,
        sentiment_score DOUBLE PRECISION,
        voice_features JSONB,
        crisis_flag BOOLEAN NOT NULL,
        crisis JSONB,
        composite_score DOUBLE PRECISION NOT NULL,
        signal_terms JSONB NOT NULL,
        response_latency_ms INTEGER,
        config_version INTEGER NOT NULL,
        channel TEXT NOT NULL,
        fast_path BOOLEAN NOT NULL,
        region TEXT,
        sync_state TEXT NOT NULL
      );
      CREATE INDEX check_ins_victim_created ON check_ins (victim_id, created_at DESC);

      -- Check-ins are append-only and immutable. The ONLY permitted update is the
      -- person erasing their own free text (free_text_enc → NULL); every other
      -- column is forced back to its old value. Deletes are refused.
      CREATE FUNCTION check_ins_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'check_ins are append-only';
        END IF;
        IF NEW.free_text_enc IS NOT NULL THEN
          RAISE EXCEPTION 'check_ins are immutable (only free-text erasure is allowed)';
        END IF;
        NEW := OLD;
        NEW.free_text_enc := NULL;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER check_ins_guard BEFORE UPDATE OR DELETE ON check_ins
        FOR EACH ROW EXECUTE FUNCTION check_ins_guard();

      CREATE TABLE consent_records (
        id UUID PRIMARY KEY,
        victim_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        granted BOOLEAN NOT NULL,
        at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        ledger_version INTEGER NOT NULL,
        UNIQUE (victim_id, ledger_version)
      );

      CREATE TABLE outbox (
        id BIGSERIAL PRIMARY KEY,
        topic TEXT NOT NULL,
        payload JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at BIGINT NOT NULL,
        last_error TEXT,
        delivered_at BIGINT
      );
      CREATE INDEX outbox_pending ON outbox (next_attempt_at) WHERE delivered_at IS NULL;
    `,
  },
];

interface CheckInRow {
  id: string; victim_id: string; created_at: number; received_at: number; self_report: Record<string, number>;
  free_text_enc: string | null; sentiment_score: number | null; voice_features: StoredCheckIn['voiceFeatures'];
  crisis_flag: boolean; crisis: unknown; composite_score: number; signal_terms: Record<string, number | null>;
  response_latency_ms: number | null; config_version: number; channel: StoredCheckIn['channel'];
  fast_path: boolean; region: string | null; sync_state: SyncState;
}

const fromRow = (r: CheckInRow): StoredCheckIn => ({
  id: r.id, victimId: r.victim_id, createdAt: r.created_at, receivedAt: r.received_at, selfReport: r.self_report,
  freeTextEnc: r.free_text_enc, sentimentScore: r.sentiment_score, voiceFeatures: r.voice_features,
  crisisFlag: r.crisis_flag, crisis: r.crisis, compositeScore: r.composite_score, signalTerms: r.signal_terms,
  responseLatencyMs: r.response_latency_ms, configVersion: r.config_version, channel: r.channel,
  fastPath: r.fast_path, region: r.region, syncState: r.sync_state,
});

interface ConsentRow {
  id: string; victim_id: string; scope: ConsentScope; granted: boolean; at: number; updated_at: number; ledger_version: number;
}
const consentFromRow = (r: ConsentRow): ConsentRecord => ({
  id: r.id, victimId: r.victim_id, scope: r.scope, granted: r.granted, at: r.at, updatedAt: r.updated_at, ledgerVersion: r.ledger_version,
});

export function pgRepo(pool: Pool): CheckinRepo {
  return {
    async insertCheckIn(c, events) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await client.query(
          `INSERT INTO check_ins (id, victim_id, created_at, received_at, self_report, free_text_enc, sentiment_score,
             voice_features, crisis_flag, crisis, composite_score, signal_terms, response_latency_ms, config_version,
             channel, fast_path, region, sync_state)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           ON CONFLICT (id) DO NOTHING`,
          [c.id, c.victimId, c.createdAt, c.receivedAt, JSON.stringify(c.selfReport), c.freeTextEnc, c.sentimentScore,
            c.voiceFeatures ? JSON.stringify(c.voiceFeatures) : null, c.crisisFlag, c.crisis ? JSON.stringify(c.crisis) : null,
            c.compositeScore, JSON.stringify(c.signalTerms), c.responseLatencyMs, c.configVersion, c.channel, c.fastPath,
            c.region, c.syncState],
        );
        if (res.rowCount === 0) {
          await client.query('ROLLBACK');
          const existing = await pool.query<{ sync_state: SyncState }>('SELECT sync_state FROM check_ins WHERE id = $1', [c.id]);
          return { inserted: false, syncState: existing.rows[0]?.sync_state ?? c.syncState };
        }
        for (const e of events) {
          await client.query('INSERT INTO outbox (topic, payload, next_attempt_at) VALUES ($1, $2, $3)', [
            e.topic, JSON.stringify(e.payload), c.receivedAt,
          ]);
        }
        await client.query('COMMIT');
        return { inserted: true, syncState: c.syncState };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },

    async getCheckIn(id) {
      const r = await pool.query<CheckInRow>('SELECT * FROM check_ins WHERE id = $1', [id]);
      return r.rows[0] ? fromRow(r.rows[0]) : null;
    },

    async eraseFreeText(id) {
      await pool.query('UPDATE check_ins SET free_text_enc = NULL WHERE id = $1 AND free_text_enc IS NOT NULL', [id]);
    },

    async listCheckIns(victimId, limit) {
      const r = await pool.query<CheckInRow>(
        'SELECT * FROM check_ins WHERE victim_id = $1 ORDER BY created_at DESC LIMIT $2',
        [victimId, limit],
      );
      return r.rows.map(fromRow);
    },

    async appendConsent(input, now) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.victimId]);
        const existing = await client.query<ConsentRow>('SELECT * FROM consent_records WHERE id = $1', [input.id]);
        if (existing.rows[0]) {
          await client.query('COMMIT');
          return consentFromRow(existing.rows[0]);
        }
        const v = await client.query<{ next: number }>(
          'SELECT COALESCE(MAX(ledger_version), 0) + 1 AS next FROM consent_records WHERE victim_id = $1',
          [input.victimId],
        );
        const r = await client.query<ConsentRow>(
          `INSERT INTO consent_records (id, victim_id, scope, granted, at, updated_at, ledger_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [input.id, input.victimId, input.scope, input.granted, input.at, now, v.rows[0]?.next ?? 1],
        );
        await client.query('COMMIT');
        return consentFromRow(r.rows[0] as ConsentRow);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },

    async effectiveConsent(victimId) {
      const r = await pool.query<ConsentRow>(
        `SELECT DISTINCT ON (scope) * FROM consent_records WHERE victim_id = $1 ORDER BY scope, ledger_version DESC`,
        [victimId],
      );
      return r.rows.map(consentFromRow);
    },

    async claimOutbox(limit, now) {
      // Lease rows for 30s so a crashed dispatcher's work is picked up again.
      const r = await pool.query<{ id: number; topic: OutboxTopic; payload: unknown; attempts: number }>(
        `UPDATE outbox SET next_attempt_at = $2 + 30000
         WHERE id IN (
           SELECT id FROM outbox WHERE delivered_at IS NULL AND next_attempt_at <= $2
           ORDER BY (topic = 'alert.crisis') DESC, id LIMIT $1 FOR UPDATE SKIP LOCKED)
         RETURNING id, topic, payload, attempts`,
        [limit, now],
      );
      return r.rows;
    },

    async markDelivered(id, now) {
      await pool.query('UPDATE outbox SET delivered_at = $2 WHERE id = $1', [id, now]);
    },

    async markFailed(id, error, nextAttemptAt) {
      await pool.query('UPDATE outbox SET attempts = attempts + 1, last_error = $2, next_attempt_at = $3 WHERE id = $1', [
        id, error.slice(0, 500), nextAttemptAt,
      ]);
    },

    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory (tests and the contract stub mode)
// ---------------------------------------------------------------------------

export function memoryRepo(): CheckinRepo & { outbox: (OutboxEvent & { deliveredAt: number | null; nextAttemptAt: number })[] } {
  const checkIns = new Map<string, StoredCheckIn>();
  const consent: ConsentRecord[] = [];
  const outbox: (OutboxEvent & { deliveredAt: number | null; nextAttemptAt: number })[] = [];
  let seq = 0;
  return {
    outbox,
    async insertCheckIn(c, events) {
      const existing = checkIns.get(c.id);
      if (existing) return { inserted: false, syncState: existing.syncState };
      checkIns.set(c.id, { ...c });
      for (const e of events) outbox.push({ id: ++seq, ...e, attempts: 0, deliveredAt: null, nextAttemptAt: c.receivedAt });
      return { inserted: true, syncState: c.syncState };
    },
    async getCheckIn(id) {
      return checkIns.get(id) ?? null;
    },
    async eraseFreeText(id) {
      const c = checkIns.get(id);
      if (c) c.freeTextEnc = null;
    },
    async listCheckIns(victimId, limit) {
      return [...checkIns.values()]
        .filter((c) => c.victimId === victimId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
    async appendConsent(input, now) {
      const dup = consent.find((r) => r.id === input.id);
      if (dup) return dup;
      const ledgerVersion = consent.filter((r) => r.victimId === input.victimId).length + 1;
      const rec: ConsentRecord = { ...input, updatedAt: now, ledgerVersion };
      consent.push(rec);
      return rec;
    },
    async effectiveConsent(victimId) {
      const latest = new Map<string, ConsentRecord>();
      for (const r of consent.filter((c) => c.victimId === victimId)) {
        const prev = latest.get(r.scope);
        if (!prev || r.ledgerVersion > prev.ledgerVersion) latest.set(r.scope, r);
      }
      return [...latest.values()];
    },
    async claimOutbox(limit, now) {
      return outbox
        .filter((e) => e.deliveredAt === null && e.nextAttemptAt <= now)
        .sort((a, b) => Number(b.topic === 'alert.crisis') - Number(a.topic === 'alert.crisis') || a.id - b.id)
        .slice(0, limit)
        .map((e) => {
          e.nextAttemptAt = now + 30_000;
          return { id: e.id, topic: e.topic, payload: e.payload, attempts: e.attempts };
        });
    },
    async markDelivered(id, now) {
      const e = outbox.find((x) => x.id === id);
      if (e) e.deliveredAt = now;
    },
    async markFailed(id, _error, nextAttemptAt) {
      const e = outbox.find((x) => x.id === id);
      if (e) {
        e.attempts += 1;
        e.nextAttemptAt = nextAttemptAt;
      }
    },
    async ping() {},
  };
}
