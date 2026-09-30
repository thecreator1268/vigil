import { DEFAULT_SCORING_CONFIG, type ScoringConfig, type SignalTerms } from '@vigil/scoring-engine';
import type { Pool } from '@vigil/service-kit';

export interface TrendPointRow {
  checkInId: string;
  victimId: string;
  at: number;
  terms: SignalTerms;
  region: string | null;
}

export interface Evaluation {
  composite: number;
  z: number | null;
  zPrev: number | null;
  slope: number | null;
  fired: boolean;
  configVersion: number;
}

export interface TrendRepo {
  activeConfig(): Promise<ScoringConfig>;
  /** Idempotent on checkInId. */
  insertPoint(p: TrendPointRow): Promise<void>;
  /** The victim's points with at <= `upTo`, oldest first, at most `limit` (the most recent ones). */
  series(victimId: string, upTo: number, limit: number): Promise<TrendPointRow[]>;
  recordEvaluation(checkInId: string, e: Evaluation): Promise<void>;
  upsertBaseline(victimId: string, b: { mean: number; stddev: number; windowSize: number; sufficient: boolean; configVersion: number }, now: number): Promise<void>;
  regionStats(region: string, since: number): Promise<{ cohortSize: number; checkInCount: number; byWeek: { weekStart: number; count: number }[] }>;
  ping(): Promise<void>;
}

export const MIGRATIONS = [
  {
    id: '001_trend',
    sql: `
      -- Versioned scoring config: weights and thresholds live here, not in code.
      CREATE TABLE scoring_config (
        version INTEGER PRIMARY KEY,
        config JSONB NOT NULL,
        active BOOLEAN NOT NULL DEFAULT false,
        note TEXT,
        created_at BIGINT NOT NULL
      );
      CREATE UNIQUE INDEX scoring_config_one_active ON scoring_config (active) WHERE active;

      CREATE TABLE trend_snapshots (
        checkin_id UUID PRIMARY KEY,
        victim_id TEXT NOT NULL,
        at BIGINT NOT NULL,
        terms JSONB NOT NULL,
        region TEXT,
        composite DOUBLE PRECISION,
        z DOUBLE PRECISION,
        z_prev DOUBLE PRECISION,
        slope DOUBLE PRECISION,
        fired BOOLEAN,
        eval_config_version INTEGER
      );
      CREATE INDEX trend_snapshots_victim_at ON trend_snapshots (victim_id, at);
      CREATE INDEX trend_snapshots_region_at ON trend_snapshots (region, at);

      CREATE TABLE baselines (
        victim_id TEXT PRIMARY KEY,
        mean DOUBLE PRECISION NOT NULL,
        stddev DOUBLE PRECISION NOT NULL,
        window_size INTEGER NOT NULL,
        sufficient BOOLEAN NOT NULL,
        config_version INTEGER NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `,
  },
  {
    id: '002_seed_config_v1',
    sql: `INSERT INTO scoring_config (version, config, active, note, created_at)
          VALUES (1, '${JSON.stringify(DEFAULT_SCORING_CONFIG)}', true, 'Initial spec values (w=.35/.30/.20/.15, T=-1.5, N=10, min 4)', ${Date.UTC(2026, 8, 1)})
          ON CONFLICT DO NOTHING`,
  },
];

const WEEK = 7 * 86_400_000;

export function pgRepo(pool: Pool): TrendRepo {
  return {
    async activeConfig() {
      const r = await pool.query<{ config: ScoringConfig }>('SELECT config FROM scoring_config WHERE active');
      return r.rows[0]?.config ?? { ...DEFAULT_SCORING_CONFIG };
    },
    async insertPoint(p) {
      await pool.query(
        `INSERT INTO trend_snapshots (checkin_id, victim_id, at, terms, region) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (checkin_id) DO NOTHING`,
        [p.checkInId, p.victimId, p.at, JSON.stringify(p.terms), p.region],
      );
    },
    async series(victimId, upTo, limit) {
      const r = await pool.query<{ checkin_id: string; victim_id: string; at: number; terms: SignalTerms; region: string | null }>(
        `SELECT * FROM (
           SELECT checkin_id, victim_id, at, terms, region FROM trend_snapshots
           WHERE victim_id = $1 AND at <= $2 ORDER BY at DESC, checkin_id DESC LIMIT $3
         ) recent ORDER BY at ASC, checkin_id ASC`,
        [victimId, upTo, limit],
      );
      return r.rows.map((x) => ({ checkInId: x.checkin_id, victimId: x.victim_id, at: x.at, terms: x.terms, region: x.region }));
    },
    async recordEvaluation(checkInId, e) {
      await pool.query(
        `UPDATE trend_snapshots SET composite=$2, z=$3, z_prev=$4, slope=$5, fired=$6, eval_config_version=$7 WHERE checkin_id=$1`,
        [checkInId, e.composite, e.z, e.zPrev, e.slope, e.fired, e.configVersion],
      );
    },
    async upsertBaseline(victimId, b, now) {
      await pool.query(
        `INSERT INTO baselines (victim_id, mean, stddev, window_size, sufficient, config_version, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (victim_id) DO UPDATE SET mean=$2, stddev=$3, window_size=$4, sufficient=$5, config_version=$6, updated_at=$7`,
        [victimId, b.mean, b.stddev, b.windowSize, b.sufficient, b.configVersion, now],
      );
    },
    async regionStats(region, since) {
      const totals = await pool.query<{ cohort: number; n: number }>(
        `SELECT COUNT(DISTINCT victim_id)::int AS cohort, COUNT(*)::int AS n FROM trend_snapshots WHERE region = $1 AND at >= $2`,
        [region, since],
      );
      const weeks = await pool.query<{ week: number; n: number }>(
        `SELECT (at / ${WEEK})::bigint * ${WEEK} AS week, COUNT(*)::int AS n FROM trend_snapshots
         WHERE region = $1 AND at >= $2 GROUP BY 1 ORDER BY 1`,
        [region, since],
      );
      return {
        cohortSize: totals.rows[0]?.cohort ?? 0,
        checkInCount: totals.rows[0]?.n ?? 0,
        byWeek: weeks.rows.map((w) => ({ weekStart: Number(w.week), count: w.n })),
      };
    },
    async ping() {
      await pool.query('SELECT 1');
    },
  };
}

export function memoryRepo(config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG }): TrendRepo & { points: TrendPointRow[]; evaluations: Map<string, Evaluation> } {
  const points: TrendPointRow[] = [];
  const evaluations = new Map<string, Evaluation>();
  return {
    points,
    evaluations,
    async activeConfig() {
      return config;
    },
    async insertPoint(p) {
      if (!points.some((x) => x.checkInId === p.checkInId)) points.push(p);
    },
    async series(victimId, upTo, limit) {
      return points
        .filter((p) => p.victimId === victimId && p.at <= upTo)
        .sort((a, b) => a.at - b.at || a.checkInId.localeCompare(b.checkInId))
        .slice(-limit);
    },
    async recordEvaluation(checkInId, e) {
      evaluations.set(checkInId, e);
    },
    async upsertBaseline() {},
    async regionStats(region, since) {
      const inRegion = points.filter((p) => p.region === region && p.at >= since);
      const byWeek = new Map<number, number>();
      for (const p of inRegion) {
        const w = Math.floor(p.at / WEEK) * WEEK;
        byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
      }
      return {
        cohortSize: new Set(inRegion.map((p) => p.victimId)).size,
        checkInCount: inRegion.length,
        byWeek: [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([weekStart, count]) => ({ weekStart, count })),
      };
    },
    async ping() {},
  };
}
