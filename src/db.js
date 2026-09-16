import pg from 'pg';
export function createPool(connectionString) {
  return new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000, statement_timeout: 2000, query_timeout: 3000 });
}
export async function databaseReady(pool) {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return result.rows.map(row => row.version).join(',') === '001,002,003';
}
