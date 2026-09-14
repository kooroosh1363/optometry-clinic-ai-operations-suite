import pg from 'pg';
export function createPool(connectionString) {
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000, statement_timeout: 2000, query_timeout: 3000 });
}
export async function databaseReady(pool) {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  return result.rows[0]?.version === '001';
}
