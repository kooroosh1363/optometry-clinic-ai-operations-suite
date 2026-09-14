import { config } from './config.js';
import { createPool, databaseReady } from './db.js';
import { createApp } from './app.js';
import { createApi } from './api.js';
const settings = config();
const pool = createPool(settings.databaseUrl);
pool.on('error', () => console.error('database_pool_error'));
const server = createApp({ ready: () => databaseReady(pool), api: createApi(pool) });
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.listen(settings.port, settings.host, () => console.log('administrative_service_started'));
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => { await pool.end(); clearTimeout(deadline); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
