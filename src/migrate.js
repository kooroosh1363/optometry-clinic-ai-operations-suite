import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createPool } from './db.js';
import { config } from './config.js';

export async function migrate(pool, sql, version = '001') {
  const checksum = createHash('sha256').update(sql).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(17310201)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const previous = await client.query('SELECT checksum FROM schema_migrations WHERE version = $1', [version]);
    if (previous.rowCount && previous.rows[0].checksum !== checksum) throw new Error('Migration checksum mismatch');
    if (!previous.rowCount) {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)', [version, checksum]);
    }
    await client.query('COMMIT');
    return !previous.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export const migrationSql = () => readFile(new URL('../db/migrations/001_foundation.sql', import.meta.url), 'utf8');
export async function migrateAll(pool) {
  await migrate(pool, await migrationSql());
  await migrate(pool, await readFile(new URL('../db/migrations/002_administrative_api.sql', import.meta.url), 'utf8'), '002');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool(config().databaseUrl);
  try { await migrateAll(pool); console.log('schema_002_ready'); }
  catch { console.error('migration_failed'); process.exitCode = 1; }
  finally { await pool.end(); }
}
