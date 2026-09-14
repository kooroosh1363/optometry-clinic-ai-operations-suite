import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
async function request(t, ready, path, method = 'GET') {
  const server = createApp({ready});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  return fetch(`http://127.0.0.1:${server.address().port}${path}`, {method});
}
test('liveness never accesses the database', async t => {
  const r = await request(t, () => { throw new Error('must not run'); }, '/health/live');
  assert.equal(r.status, 200); assert.equal((await r.json()).phase, 'foundation');
});
test('ready only after schema verification', async t => {
  const r = await request(t, async () => true, '/health/ready'); assert.equal(r.status, 200);
});
test('missing schema is not ready', async t => {
  const r = await request(t, async () => false, '/health/ready'); assert.equal(r.status, 503);
});
test('database errors are sanitized', async t => {
  const r = await request(t, async () => { throw new Error('password: PRIVATE'); }, '/health/ready');
  assert.equal(r.status, 503); assert.deepEqual(await r.json(), {status:'not_ready'});
});
for (const path of ['/patients', '/appointments', '/', '/admin', '/health/ready?x=1']) {
  test(`no accidental route ${path}`, async t => assert.equal((await request(t, async () => true, path)).status,404));
}
for (const method of ['POST', 'PUT', 'DELETE']) {
  test(`health rejects ${method}`, async t => {
    const r = await request(t, async () => true, '/health/live', method);
    assert.equal(r.status,405); assert.equal(r.headers.get('allow'), 'GET');
  });
}
test('responses cannot be cached or MIME sniffed', async t => {
  const r = await request(t, async () => true, '/health/live');
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
