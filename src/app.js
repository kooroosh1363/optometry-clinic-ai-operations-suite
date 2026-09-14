import { createServer } from 'node:http';

export function createApp({ ready, api }) {
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    if (req.url.startsWith('/v1/') && api) return api(req, res, send);
    if (!['/health/live', '/health/ready'].includes(req.url)) return send(404, { error: 'not_found' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, { error: 'method_not_allowed' }); }
    if (req.url === '/health/live') return send(200, { status: 'alive', phase: 'administrative_api' });
    try {
      if (await ready()) return send(200, { status: 'ready', schema: '002' });
    } catch { /* Dependency errors must not expose URLs, passwords or SQL. */ }
    return send(503, { status: 'not_ready' });
  });
}
