import type { Alert, AlertStatus, Severity, SignalName } from '@vigil/shared-types';
import type { Pool } from '@vigil/service-kit';

export interface StoredAlert {
  id: string;
  victimId: string;
  severity: Severity;
  signals: SignalName[];
  reasonText: string;
  status: AlertStatus;
  source: 'trend' | 'crisis';
  configVersion: number;
  createdAt: number;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  sourceCheckInId: string;
  region: string | null;
}

/** The ONLY place an alert is serialised; raw_score is null by construction. */
export function toApi(a: StoredAlert): Alert {
  return {
    id: a.id,
    victimId: a.victimId,
    severity: a.severity,
    signals_involved: a.signals,
    reason_text: a.reasonText,
    raw_score: null,
    status: a.status,
    source: a.source,
    configVersion: a.configVersion,
    createdAt: a.createdAt,
    acknowledgedAt: a.acknowledgedAt,
    acknowledgedBy: a.acknowledgedBy,
  };
}

export interface AlertRepo {
  bySourceCheckIn(checkInId: string): Promise<StoredAlert | null>;
  openTrendAlert(victimId: string): Promise<StoredAlert | null>;
  insert(a: StoredAlert): Promise<StoredAlert>;
  escalate(id: string, patch: Pick<StoredAlert, 'severity' | 'signals' | 'reasonText' | 'configVersion'>): Promise<StoredAlert>;
  list(status?: AlertStatus): Promise<StoredAlert[]>;
  get(id: string): Promise<StoredAlert | null>;
  acknowledge(id: string, by: string, at: number): Promise<StoredAlert | null>;
  stats(region: string, since: number): Promise<{ urgent: number; elevated: number; acknowledgedWithin24hPct: number | null }>;
  ping(): Promise<void>;
}

export const MIGRATIONS = [
  {
    id: '001_alerts',
    sql: `
      CREATE TABLE alerts (
        id UUID PRIMARY KEY,
        victim_id TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('urgent', 'elevated')),
        signals_json JSONB NOT NULL,
        reason_text TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
        source TEXT NOT NULL CHECK (source IN ('trend', 'crisis')),
        config_version INTEGER NOT NULL,
        created_at BIGINT NOT NULL,
        acknowledged_at BIGINT,
        acknowledged_by TEXT,
        source_checkin_id UUID NOT NULL UNIQUE,
        region TEXT
      );
      CREATE INDEX alerts_status_severity ON alerts (status, severity, created_at DESC);
      CREATE INDEX alerts_victim_open_trend ON alerts (victim_id) WHERE status = 'open' AND source = 'trend';
    `,
  },
];

interface Row {
  id: string; victim_id: string; severity: Severity; signals_json: SignalName[]; reason_text: string; status: AlertStatus;
  source: 'trend' | 'crisis'; config_version: number; created_at: number; acknowledged_at: number | null;
  acknowledged_by: string | null; source_checkin_id: string; region: string | null;
}
const fromRow = (r: Row): StoredAlert => ({
  id: r.id, victimId: r.victim_id, severity: r.severity, signals: r.signals_json, reasonText: r.reason_text, status: r.status,
  source: r.source, configVersion: r.config_version, createdAt: r.created_at, acknowledgedAt: r.acknowledged_at,
  acknowledgedBy: r.acknowledged_by, sourceCheckInId: r.source_checkin_id, region: r.region,
});

const SEVERITY_ORDER = `CASE severity WHEN 'urgent' THEN 0 ELSE 1 END`;

export function pgRepo(pool: Pool): AlertRepo {
  const one = async (sql: string, args: unknown[]) => {
    const r = await pool.query<Row>(sql, args);
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  };
  return {
    bySourceCheckIn: (id) => one('SELECT * FROM alerts WHERE source_checkin_id = $1', [id]),
    openTrendAlert: (victimId) =>
      one(`SELECT * FROM alerts WHERE victim_id = $1 AND status = 'open' AND source = 'trend' ORDER BY created_at DESC LIMIT 1`, [victimId]),
    async insert(a) {
      const r = await one(
        `INSERT INTO alerts (id, victim_id, severity, signals_json, reason_text, status, source, config_version, created_at,
           acknowledged_at, acknowledged_by, source_checkin_id, region)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (source_checkin_id) DO UPDATE SET source_checkin_id = EXCLUDED.source_checkin_id
         RETURNING *`,
        [a.id, a.victimId, a.severity, JSON.stringify(a.signals), a.reasonText, a.status, a.source, a.configVersion, a.createdAt,
          a.acknowledgedAt, a.acknowledgedBy, a.sourceCheckInId, a.region],
      );
      return r as StoredAlert;
    },
    async escalate(id, p) {
      return (await one(
        `UPDATE alerts SET severity=$2, signals_json=$3, reason_text=$4, config_version=$5 WHERE id=$1 RETURNING *`,
        [id, p.severity, JSON.stringify(p.signals), p.reasonText, p.configVersion],
      )) as StoredAlert;
    },
    async list(status) {
      const r = await pool.query<Row>(
        `SELECT * FROM alerts WHERE ($1::text IS NULL OR status = $1) ORDER BY ${SEVERITY_ORDER}, created_at DESC LIMIT 200`,
        [status ?? null],
      );
      return r.rows.map(fromRow);
    },
    get: (id) => one('SELECT * FROM alerts WHERE id = $1', [id]),
    acknowledge: (id, by, at) =>
      one(
        `UPDATE alerts SET status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
           acknowledged_at = COALESCE(acknowledged_at, $3), acknowledged_by = COALESCE(acknowledged_by, $2)
         WHERE id = $1 RETURNING *`,
        [id, by, at],
      ),
    async stats(region, since) {
      const r = await pool.query<{ urgent: number; elevated: number; acked: number; total: number }>(
        `SELECT COUNT(*) FILTER (WHERE severity = 'urgent')::int AS urgent,
                COUNT(*) FILTER (WHERE severity = 'elevated')::int AS elevated,
                COUNT(*) FILTER (WHERE acknowledged_at IS NOT NULL AND acknowledged_at - created_at <= 86400000)::int AS acked,
                COUNT(*)::int AS total
         FROM alerts WHERE region = $1 AND created_at >= $2`,
        [region, since],
      );
      const s = r.rows[0] ?? { urgent: 0, elevated: 0, acked: 0, total: 0 };
      return { urgent: s.urgent, elevated: s.elevated, acknowledgedWithin24hPct: s.total ? Math.round((s.acked / s.total) * 1000) / 10 : null };
    },
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

export function memoryRepo(): AlertRepo & { alerts: StoredAlert[] } {
  const alerts: StoredAlert[] = [];
  const rank = (s: Severity) => (s === 'urgent' ? 0 : 1);
  return {
    alerts,
    async bySourceCheckIn(id) {
      return alerts.find((a) => a.sourceCheckInId === id) ?? null;
    },
    async openTrendAlert(victimId) {
      return alerts.filter((a) => a.victimId === victimId && a.status === 'open' && a.source === 'trend').sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    },
    async insert(a) {
      const dup = alerts.find((x) => x.sourceCheckInId === a.sourceCheckInId);
      if (dup) return dup;
      alerts.push({ ...a });
      return a;
    },
    async escalate(id, p) {
      const a = alerts.find((x) => x.id === id) as StoredAlert;
      Object.assign(a, p);
      return a;
    },
    async list(status) {
      return alerts.filter((a) => !status || a.status === status).sort((a, b) => rank(a.severity) - rank(b.severity) || b.createdAt - a.createdAt);
    },
    async get(id) {
      return alerts.find((a) => a.id === id) ?? null;
    },
    async acknowledge(id, by, at) {
      const a = alerts.find((x) => x.id === id);
      if (!a) return null;
      if (a.status === 'open') a.status = 'acknowledged';
      a.acknowledgedAt ??= at;
      a.acknowledgedBy ??= by;
      return a;
    },
    async stats(region, since) {
      const rs = alerts.filter((a) => a.region === region && a.createdAt >= since);
      const acked = rs.filter((a) => a.acknowledgedAt !== null && a.acknowledgedAt - a.createdAt <= 86_400_000).length;
      return {
        urgent: rs.filter((a) => a.severity === 'urgent').length,
        elevated: rs.filter((a) => a.severity === 'elevated').length,
        acknowledgedWithin24hPct: rs.length ? Math.round((acked / rs.length) * 1000) / 10 : null,
      };
    },
    async ping() {},
  };
}
