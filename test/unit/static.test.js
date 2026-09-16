import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
async function request(t, path, method = 'GET') {
  const server = createApp({ ready: async () => true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, { method });
}
test('dashboard HTML is same-origin and protected by restrictive policy', async t => {
  const response = await request(t, '/dashboard');
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/); assert.equal(response.headers.get('cache-control'), 'no-store');
  const policy = response.headers.get('content-security-policy'); assert.match(policy, /connect-src 'self'/); assert.match(policy, /object-src 'none'/); assert.match(policy, /frame-ancestors 'none'/);
  const html = await response.text(); assert.match(html, /Skip to workspace/); assert.doesNotMatch(html, /https?:\/\//);
});
test('assets are served and unknown files remain 404', async t => {
  const css = await request(t, '/assets/app.css'); assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/); assert.equal(css.headers.get('cache-control'), 'public, max-age=3600');
  assert.equal((await request(t, '/assets/missing.js')).status, 404);
});
test('static endpoint does not accept writes', async t => assert.equal((await request(t, '/dashboard', 'POST')).status, 404));
