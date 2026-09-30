import pg from 'pg';

export type Pool = pg.Pool;

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  // BIGINT (epoch-ms timestamps) come back as strings by default; they fit in a double.
  pg.types.setTypeParser(20, (v) => Number(v));
  return pool;
}

/**
 * Minimal forward-only migrator. Each migration runs once, in order, inside a
 * transaction, and is recorded in `schema_migrations`. A Postgres advisory lock
 * keeps two replicas from migrating concurrently.
 */
export async function migrate(pool: pg.Pool, migrations: readonly { id: string; sql: string }[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const done = new Set((await client.query<{ id: string }>('SELECT id FROM schema_migrations')).rows.map((r) => r.id));
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
}
