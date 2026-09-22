import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['../public/index.html', 'text/html; charset=utf-8']],
  ['/dashboard', ['../public/index.html', 'text/html; charset=utf-8']],
  ['/assets/app.css', ['../public/app.css', 'text/css; charset=utf-8']],
  ['/assets/app.js', ['../public/app.js', 'text/javascript; charset=utf-8']],
  ['/assets/mark.svg', ['../public/mark.svg', 'image/svg+xml']]
]);

export async function serveStatic(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  const path = new URL(req.url, 'http://localhost').pathname;
  const item = files.get(path);
  if (!item) return false;
  try {
    const content = await readFile(new URL(item[0], import.meta.url));
    res.setHeader('Content-Type', item[1]);
    // Asset names are not content-hashed: revalidate to avoid mixing a new HTML
    // document with an old cached script after an upgrade.
    res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'no-cache' : 'no-store');
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(503); res.end(); }
  return true;
}
