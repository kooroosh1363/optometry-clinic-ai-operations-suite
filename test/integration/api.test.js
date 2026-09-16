import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, databaseReady } from '../../src/db.js';
import { migrateAll, migrate, migrationSql } from '../../src/migrate.js';
import { createApp } from '../../src/app.js';
import { createApi } from '../../src/api.js';
import { issueToken, tokenHash } from '../../src/auth.js';
import { createDemo, revokeToken } from '../../src/operator.js';
import { readFile } from 'node:fs/promises';
import { mockDelivery } from '../../src/automation.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required; use a disposable database');
const pool = createPool(process.env.TEST_DATABASE_URL);
test.before(() => migrateAll(pool));
test.after(() => pool.end());

async function fixture(t, options = {}) {
  const a = await createDemo(pool, 'America/Vancouver');
  const b = await createDemo(pool, 'Asia/Tbilisi');
  const admin = await issueToken(pool, a.clinic_id, a.administrator_id);
  const reader = await issueToken(pool, a.clinic_id, a.practitioner_id);
  const foreign = await issueToken(pool, b.clinic_id, b.administrator_id);
  const receptionist = randomUUID();
  await pool.query("INSERT INTO staff(clinic_id,id,display_name,role) VALUES ($1,$2,'Demo Reception','receptionist')", [a.clinic_id, receptionist]);
  const reception = await issueToken(pool, a.clinic_id, receptionist);
  const server = createApp({ ready: () => databaseReady(pool), api: createApi(pool, options) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const table of ['mock_delivery_receipts', 'automation_drafts', 'consent_events', 'audit_events', 'recalls', 'appointments', 'access_tokens', 'patients', 'staff']) {
      await pool.query(`DELETE FROM ${table} WHERE clinic_id = ANY($1::uuid[])`, [[a.clinic_id, b.clinic_id]]);
    }
    await pool.query('DELETE FROM clinics WHERE id = ANY($1::uuid[])', [[a.clinic_id, b.clinic_id]]);
  });
  const request = async (path, { method = 'GET', token = admin.token, data, raw, headers = {} } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: raw ?? (data !== undefined ? JSON.stringify(data) : undefined)
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const booking = { patient_id: a.patient_id, practitioner_id: a.practitioner_id, starts_at: '2030-01-01T10:00:00Z', ends_at: '2030-01-01T11:00:00Z' };
  const book = async (changes = {}, token = admin.token) => request('/v1/appointments', { method: 'POST', data: { ...booking, ...changes }, token });
  return { a, b, admin, reader, foreign, reception, receptionist, request, booking, book };
}

test('002 upgrades existing 001 records, repeats safely and protects both checksums', async () => {
  const c = await pool.connect(), schema = 'upgrade_' + randomUUID().replaceAll('-', '');
  try {
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET search_path TO ${schema}, public`);
    await c.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())');
    const isolated = { connect: async () => ({ query: (...args) => c.query(...args), release() {} }) };
    await migrate(isolated, await migrationSql());
    const clinic = randomUUID(), staff = randomUUID();
    await c.query("INSERT INTO clinics(id,name) VALUES ($1,'Pre-upgrade Clinic')", [clinic]);
    await c.query("INSERT INTO staff(clinic_id,id,display_name,role) VALUES ($1,$2,'Existing Staff','administrator')", [clinic, staff]);
    assert.equal(await databaseReady(c), false);
    await migrateAll(isolated); await migrateAll(isolated);
    assert.equal(await databaseReady(c), true);
    assert.equal((await c.query('SELECT active FROM staff WHERE id=$1', [staff])).rows[0].active, true);
    const second = await readFile(new URL('../../db/migrations/002_administrative_api.sql', import.meta.url), 'utf8');
    await assert.rejects(() => migrate(isolated, second + '\n--changed', '002'), /checksum/);
    await assert.rejects(() => migrate(isolated, 'changed', '001'), /checksum/);
  } finally {
    await c.query('SET search_path TO public'); await c.query(`DROP SCHEMA ${schema} CASCADE`); c.release();
  }
});
test('opaque credential is hashed at rest and identity is derived from the database', async t => {
  const f = await fixture(t);
  const stored = (await pool.query('SELECT token_hash FROM access_tokens WHERE id=$1', [f.admin.id])).rows[0].token_hash;
  assert.equal(stored === tokenHash(f.admin.token), true); assert.equal(stored === f.admin.token, false);
  const r = await f.request('/v1/me', { headers: { 'x-clinic-id': f.b.clinic_id, 'x-role': 'optometrist' } });
  assert.equal(r.status, 200); assert.equal(r.body.data.clinic_id, f.a.clinic_id); assert.equal(r.body.data.role, 'administrator');
});
test('missing, malformed and unknown credentials are rejected with Bearer challenge', async t => {
  const f = await fixture(t);
  for (const token of [null, 'bad', 'x'.repeat(43)]) {
    const r = await f.request('/v1/patients', { token });
    assert.equal(r.status, 401); assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  }
});
test('expiry, revocation and staff deactivation take effect on subsequent requests', async t => {
  const f = await fixture(t);
  await pool.query("UPDATE access_tokens SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1", [f.admin.id]);
  assert.equal((await f.request('/v1/me')).status, 401);
  assert.equal(await revokeToken(pool, f.reader.id), 1); assert.equal(await revokeToken(pool, f.reader.id), 0);
  assert.equal((await f.request('/v1/me', { token: f.reader.token })).status, 401);
  await pool.query('UPDATE staff SET active=false WHERE clinic_id=$1 AND id=$2', [f.a.clinic_id, f.receptionist]);
  assert.equal((await f.request('/v1/me', { token: f.reception.token })).status, 401);
});
test('operator cannot issue overlong credentials or credentials for inactive staff', async t => {
  const f = await fixture(t);
  await assert.rejects(() => issueToken(pool, f.a.clinic_id, f.a.administrator_id, 25));
  await pool.query('UPDATE staff SET active=false WHERE clinic_id=$1 AND id=$2', [f.a.clinic_id, f.a.administrator_id]);
  await assert.rejects(() => issueToken(pool, f.a.clinic_id, f.a.administrator_id));
});
test('reception may write while optometrist is read-only', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/v1/patients', { token: f.reader.token })).status, 200);
  for (const [path, data] of [['patients', { display_name: 'Demo Person' }], ['appointments', f.booking], ['recalls', { patient_id: f.a.patient_id, due_date: '2030-01-01' }]]) {
    assert.equal((await f.request('/v1/' + path, { method: 'POST', token: f.reader.token, data })).status, 403);
  }
  assert.equal((await f.book({}, f.reception.token)).status, 201);
});
test('patient lists and details remain clinic scoped', async t => {
  const f = await fixture(t);
  const r = await f.request('/v1/patients');
  assert.deepEqual(r.body.data.map(row => row.id), [f.a.patient_id]);
  assert.equal((await f.request('/v1/patients/' + f.b.patient_id)).status, 404);
  const staff = await f.request('/v1/staff'); assert.equal(staff.body.data.some(row => row.id === f.b.administrator_id), false);
});
test('patient creation validates fields and stores false consent plus minimal audit metadata', async t => {
  const f = await fixture(t);
  const r = await f.request('/v1/patients', { method: 'POST', data: { display_name: '  Demo Person  ', contact_email: 'synthetic@example.invalid' } });
  assert.equal(r.status, 201); assert.equal(r.body.data.messaging_consent, false); assert.equal(r.body.data.display_name, 'Demo Person');
  const events = (await pool.query('SELECT * FROM audit_events WHERE clinic_id=$1', [f.a.clinic_id])).rows;
  assert.equal(events.length, 1); assert.equal(events[0].action, 'created');
  assert.equal(JSON.stringify(events).includes('synthetic@example.invalid'), false);
  for (const data of [{ display_name: 'Demo', clinic_id: f.b.clinic_id }, { display_name: 'Demo', messaging_consent: true }, { display_name: 'x' }, { display_name: 'Demo', contact_email: 'bad' }]) {
    assert.equal((await f.request('/v1/patients', { method: 'POST', data })).status, 400);
  }
});
test('appointment references must be in-clinic active optometrists and patients', async t => {
  const f = await fixture(t);
  for (const changes of [{ patient_id: f.b.patient_id }, { practitioner_id: f.b.practitioner_id }, { practitioner_id: f.a.administrator_id }, { patient_id: randomUUID() }]) {
    const r = await f.book(changes); assert.equal(r.status, 400); assert.equal(r.body.error, 'invalid_reference');
  }
  await pool.query('UPDATE staff SET active=false WHERE clinic_id=$1 AND id=$2', [f.a.clinic_id, f.a.practitioner_id]);
  assert.equal((await f.book()).status, 400);
});
test('appointment timestamps, durations and unknown fields are validated', async t => {
  const f = await fixture(t);
  for (const changes of [{ starts_at: '2030-01-01T10:00:00' }, { ends_at: f.booking.starts_at }, { starts_at: '2030-02-30T10:00:00Z' }, { ends_at: '2030-01-01T19:00:00Z' }, { status: 'completed' }, { clinic_id: f.b.clinic_id }]) assert.equal((await f.book(changes)).status, 400);
});
test('invalid clinic timezone blocks API use and demo provisioning rejects it', async t => {
  const f = await fixture(t);
  await assert.rejects(() => createDemo(pool, 'Mars/Clinic'));
  await pool.query("UPDATE clinics SET timezone='Mars/Clinic' WHERE id=$1", [f.a.clinic_id]);
  const r = await f.book(); assert.equal(r.status, 409); assert.equal(r.body.error, 'clinic_configuration_invalid');
});
test('parallel booking requests reserve a conflicting slot only once with one audit event', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.book(), f.book()]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(results.find(r => r.status === 409).body.error, 'appointment_overlap');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE clinic_id=$1', [f.a.clinic_id])).rows[0].n, 1);
});
test('adjacent bookings work and offset-equivalent overlaps fail', async t => {
  const f = await fixture(t); assert.equal((await f.book()).status, 201);
  assert.equal((await f.book({ starts_at: '2030-01-01T02:00:00-08:00', ends_at: '2030-01-01T03:00:00-08:00' })).status, 409);
  assert.equal((await f.book({ starts_at: '2030-01-01T11:00:00Z', ends_at: '2030-01-01T12:00:00Z' })).status, 201);
});
test('cross-clinic appointment detail, list and update reveal no foreign record', async t => {
  const f = await fixture(t), booked = await f.book(), id = booked.body.data.id;
  assert.equal((await f.request('/v1/appointments/' + id, { token: f.foreign.token })).status, 404);
  assert.deepEqual((await f.request('/v1/appointments', { token: f.foreign.token })).body.data, []);
  assert.equal((await f.request('/v1/appointments/' + id, { token: f.foreign.token, method: 'PATCH', data: { version: 1, status: 'cancelled' } })).status, 404);
});
test('parallel updates accept one current version and reject the stale writer', async t => {
  const f = await fixture(t), r = await f.book(), path = '/v1/appointments/' + r.body.data.id;
  const results = await Promise.all(['cancelled', 'checked_in'].map(status => f.request(path, { method: 'PATCH', data: { version: 1, status } })));
  assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
  assert.equal(results.find(item => item.status === 409).body.error, 'version_conflict');
  assert.equal((await f.request(path)).body.data.version, 2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE clinic_id=$1', [f.a.clinic_id])).rows[0].n, 2);
});
test('appointment lifecycle forbids skipped transitions and terminal reopening', async t => {
  const f = await fixture(t), r = await f.book(), path = '/v1/appointments/' + r.body.data.id;
  const patch = data => f.request(path, { method: 'PATCH', data });
  assert.equal((await patch({ version: 1, status: 'completed' })).status, 409);
  assert.equal((await patch({ version: 1, status: 'checked_in' })).status, 200);
  assert.equal((await patch({ version: 2, starts_at: '2030-01-02T10:00:00Z', ends_at: '2030-01-02T11:00:00Z' })).status, 409);
  assert.equal((await patch({ version: 2, status: 'completed' })).status, 200);
  assert.equal((await patch({ version: 3, status: 'scheduled' })).status, 409);
});
test('rescheduling is versioned and overlap failure preserves interval and audit count', async t => {
  const f = await fixture(t), r = await f.book(), path = '/v1/appointments/' + r.body.data.id;
  await f.book({ starts_at: '2030-01-02T10:00:00Z', ends_at: '2030-01-02T11:00:00Z' });
  const overlap = await f.request(path, { method: 'PATCH', data: { version: 1, starts_at: '2030-01-02T10:00:00Z', ends_at: '2030-01-02T11:00:00Z' } });
  assert.equal(overlap.status, 409); assert.equal((await f.request(path)).body.data.version, 1);
  const moved = await f.request(path, { method: 'PATCH', data: { version: 1, starts_at: '2030-01-03T10:00:00Z', ends_at: '2030-01-03T11:00:00Z' } });
  assert.equal(moved.status, 200); assert.equal(moved.body.data.version, 2);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_events WHERE clinic_id=$1', [f.a.clinic_id])).rows[0].n, 3);
});
test('cancelled slots may be rebooked and read-only staff cannot patch', async t => {
  const f = await fixture(t), r = await f.book(), path = '/v1/appointments/' + r.body.data.id;
  assert.equal((await f.request(path, { method: 'PATCH', token: f.reader.token, data: { version: 1, status: 'cancelled' } })).status, 403);
  assert.equal((await f.request(path, { method: 'PATCH', data: { version: 1, status: 'cancelled' } })).status, 200);
  assert.equal((await f.book()).status, 201);
});
test('recall create, tenant isolation, optimistic updates and lifecycle', async t => {
  const f = await fixture(t);
  for (const data of [{ patient_id: f.b.patient_id, due_date: '2030-01-01' }, { patient_id: f.a.patient_id, due_date: '2030-02-30' }]) assert.equal((await f.request('/v1/recalls', { method: 'POST', data })).status, 400);
  const r = await f.request('/v1/recalls', { method: 'POST', data: { patient_id: f.a.patient_id, due_date: '2030-01-01' } });
  assert.equal(r.status, 201); assert.equal(r.body.data.due_date, '2030-01-01');
  const path = '/v1/recalls/' + r.body.data.id;
  assert.equal((await f.request(path, { token: f.foreign.token })).status, 404);
  assert.deepEqual((await f.request('/v1/recalls', { token: f.foreign.token })).body.data, []);
  assert.equal((await f.request(path, { token: f.foreign.token, method: 'PATCH', data: { version: 1, status: 'closed' } })).status, 404);
  assert.equal((await f.request(path, { method: 'PATCH', data: { version: 1, status: 'contacted' } })).status, 200);
  assert.equal((await f.request(path, { method: 'PATCH', data: { version: 1, status: 'closed' } })).status, 409);
  assert.equal((await f.request(path, { method: 'PATCH', data: { version: 2, status: 'closed' } })).status, 200);
  assert.equal((await f.request(path, { method: 'PATCH', data: { version: 3, status: 'pending' } })).status, 409);
});
test('invalid JSON, unsupported content type, oversize and invalid UTF-8 are rejected', async t => {
  const f = await fixture(t), path = '/v1/patients';
  assert.equal((await f.request(path, { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await f.request(path, { method: 'POST', raw: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.request(path, { method: 'POST', raw: 'x'.repeat(17000) })).status, 413);
  assert.equal((await f.request(path, { method: 'POST', raw: Buffer.from([0xff]) })).status, 400);
});
test('pagination and unsupported API operations are explicit', async t => {
  const f = await fixture(t);
  for (const path of ['/v1/patients?limit=101', '/v1/appointments?clinic_id=other', '/v1/recalls?limit=1&limit=2', '/v1/staff?offset=-1']) assert.equal((await f.request(path)).status, 400);
  assert.equal((await f.request('/v1/patients?limit=1&offset=1')).body.data.length, 0);
  assert.equal((await f.request('/v1/patients/' + f.a.patient_id, { method: 'DELETE' })).status, 405);
  assert.equal((await f.request('/v1/unknown')).status, 404);
});

async function automationFixture(t, options) {
  const f = await fixture(t, options);
  await pool.query("UPDATE patients SET contact_email='demo@example.invalid' WHERE clinic_id=$1 AND id=$2",[f.a.clinic_id,f.a.patient_id]);
  f.consent = (granted, v=1, token=f.admin.token) => f.request(`/v1/patients/${f.a.patient_id}/consent`,{method:'PATCH',token,data:{version:v,granted}});
  const recall=await f.request('/v1/recalls',{method:'POST',data:{patient_id:f.a.patient_id,due_date:'2030-03-01'}});
  f.recall=recall.body.data;
  f.draft = (key=randomUUID(), token=f.admin.token) => f.request('/v1/automation',{method:'POST',token,data:{recall_id:f.recall.id,request_key:key}});
  f.action = (id, action, v, token=f.admin.token) => f.request(`/v1/automation/${id}/${action}`,{method:'POST',token,data:{version:v}});
  f.prepare = async () => {
    assert.equal((await f.consent(true)).status,200);
    const d=await f.draft(); assert.equal(d.status,201);
    return d.body.data;
  };
  return f;
}
test('consent is administrator-only, versioned, tenant-scoped and audited', async t => {
  const f=await automationFixture(t);
  assert.equal((await f.consent(true,1,f.reception.token)).status,403);
  assert.equal((await f.consent(true,1,f.reader.token)).status,403);
  assert.equal((await f.consent(true,1,f.foreign.token)).status,404);
  assert.equal((await f.consent('true')).status,400);
  assert.equal((await f.consent(true)).body.data.consent_version,2);
  assert.equal((await f.consent(false)).status,409);
  assert.equal((await f.consent(false,2)).body.data.messaging_consent,false);
  const events=await pool.query('SELECT granted,version FROM consent_events WHERE clinic_id=$1 ORDER BY version',[f.a.clinic_id]);
  assert.deepEqual(events.rows,[{granted:true,version:2},{granted:false,version:3}]);
});
test('draft generation requires consent, contact and a pending recall', async t => {
  const f=await automationFixture(t);
  assert.equal((await f.draft()).body.error,'consent_required');
  await f.consent(true);
  await pool.query('UPDATE patients SET contact_email=NULL WHERE clinic_id=$1',[f.a.clinic_id]);
  assert.equal((await f.draft()).body.error,'contact_required');
  await pool.query("UPDATE patients SET contact_email='demo@example.invalid' WHERE clinic_id=$1",[f.a.clinic_id]);
  await f.request('/v1/recalls/'+f.recall.id,{method:'PATCH',data:{version:1,status:'closed'}});
  assert.equal((await f.draft()).body.error,'source_changed');
});
test('concurrent same-key draft requests produce one immutable draft and one creation audit', async t => {
  const f=await automationFixture(t); await f.consent(true); const key=randomUUID();
  const result=await Promise.all([f.draft(key),f.draft(key)]);
  assert.deepEqual(result.map(r=>r.status),[201,201]); assert.equal(result[0].body.data.id,result[1].body.data.id);
  const d=result[0].body.data;
  assert.match(d.content,/2030-03-01/); assert.equal(d.generator,'recall-template-v1');
  assert.equal((await f.draft()).body.error,'draft_exists');
  const other=await f.request('/v1/recalls',{method:'POST',data:{patient_id:f.a.patient_id,due_date:'2030-04-01'}});
  assert.equal((await f.request('/v1/automation',{method:'POST',data:{request_key:key,recall_id:other.body.data.id}})).body.error,'idempotency_conflict');
  const count=await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE clinic_id=$1 AND entity_type='automation' AND action='created'",[f.a.clinic_id]);
  assert.equal(count.rows[0].n,1);
  assert.equal((await f.request('/v1/automation/'+d.id,{method:'PATCH',data:{version:1,content:'override'}})).status,405);
});
test('different concurrent keys cannot create duplicate source revision drafts', async t => {
  const f=await automationFixture(t); await f.consent(true);
  const result=await Promise.all([f.draft(),f.draft()]);
  assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
});
test('automation reads and mutations enforce roles and tenant isolation', async t => {
  const f=await automationFixture(t), d=await f.prepare();
  assert.equal((await f.draft(randomUUID(),f.reader.token)).status,403);
  assert.equal((await f.draft(randomUUID(),f.foreign.token)).status,404);
  assert.deepEqual((await f.request('/v1/automation',{token:f.foreign.token})).body.data,[]);
  assert.equal((await f.request('/v1/automation/'+d.id,{token:f.foreign.token})).status,404);
  for (const action of ['approve','reject','execute']) {
    assert.equal((await f.action(d.id,action,1,f.reader.token)).status,403);
    assert.equal((await f.action(d.id,action,1,f.foreign.token)).status,404);
  }
  assert.equal((await f.action(d.id,'approve',1,f.reception.token)).status,201);
});
test('unapproved and rejected drafts cannot execute, approval is optimistic', async t => {
  const f=await automationFixture(t), d=await f.prepare();
  assert.equal((await f.action(d.id,'execute',1)).body.error,'approval_required');
  assert.equal((await f.action(d.id,'approve',2)).body.error,'version_conflict');
  assert.equal((await f.action(d.id,'reject',1)).body.data.status,'rejected');
  assert.equal((await f.action(d.id,'execute',2)).body.error,'approval_required');
  assert.equal((await f.action(d.id,'approve',2)).body.error,'invalid_transition');
});
test('revocation and regrant invalidate old drafts at approval and execution', async t => {
  const f=await automationFixture(t), d=await f.prepare();
  await f.consent(false,2);
  assert.equal((await f.action(d.id,'approve',1)).body.error,'consent_required');
  await f.consent(true,3);
  assert.equal((await f.action(d.id,'approve',1)).body.error,'source_changed');
  const fresh=(await f.draft()).body.data;
  await f.action(fresh.id,'approve',1); await f.consent(false,4);
  assert.equal((await f.action(fresh.id,'execute',2)).body.error,'consent_required');
  await f.consent(true,5);
  assert.equal((await f.action(fresh.id,'execute',2)).body.error,'source_changed');
});
test('changed recall or recipient invalidates approved content', async t => {
  const f=await automationFixture(t),d=await f.prepare(); await f.action(d.id,'approve',1);
  await pool.query("UPDATE patients SET contact_email='changed@example.invalid' WHERE clinic_id=$1",[f.a.clinic_id]);
  assert.equal((await f.action(d.id,'execute',2)).body.error,'source_changed');
  await pool.query("UPDATE patients SET contact_email='demo@example.invalid' WHERE clinic_id=$1",[f.a.clinic_id]);
  await f.request('/v1/recalls/'+f.recall.id,{method:'PATCH',data:{version:1,status:'contacted'}});
  assert.equal((await f.action(d.id,'execute',2)).body.error,'source_changed');
});
test('concurrent execution and lost-response replay create exactly one database mock receipt', async t => {
  const f=await automationFixture(t),d=await f.prepare(); await f.action(d.id,'approve',1);
  const result=await Promise.all([f.action(d.id,'execute',2),f.action(d.id,'execute',2)]);
  assert.deepEqual(result.map(r=>r.status),[201,201]);
  assert.equal(result[0].body.receipt_id,result[1].body.receipt_id);
  assert.equal(result[0].body.data.attempts,1); assert.equal(result[0].body.delivery_mode,'mock');
  const replay=await f.action(d.id,'execute',2); assert.equal(replay.body.receipt_id,result[0].body.receipt_id);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM mock_delivery_receipts WHERE clinic_id=$1',[f.a.clinic_id])).rows[0].n,1);
  const audit=await pool.query("SELECT action FROM audit_events WHERE clinic_id=$1 AND entity_id=$2 ORDER BY entity_version",[f.a.clinic_id,d.id]);
  assert.deepEqual(audit.rows.map(x=>x.action),['created','approved','simulated']);
});
test('failure is sanitized, partial receipt rolled back, explicit retry succeeds', async t => {
  let attempts=0;
  const f=await automationFixture(t,{deliver:async(c,clinic,draft)=>{
    await mockDelivery(c,clinic,draft);
    if (++attempts===1) throw Object.assign(new Error('sensitive adapter details'),{code:'mock_unavailable'});
  }}),d=await f.prepare(); await f.action(d.id,'approve',1);
  const failed=await f.action(d.id,'execute',2);
  assert.equal(failed.body.data.status,'failed'); assert.equal(failed.body.data.last_error,'mock_unavailable');
  assert.equal(failed.body.receipt_id,null); assert.equal(JSON.stringify(failed).includes('sensitive'),false);
  assert.equal((await f.action(d.id,'execute',2)).body.error,'version_conflict');
  const retried=await f.action(d.id,'execute',3);
  assert.equal(retried.body.data.status,'simulated'); assert.equal(retried.body.data.attempts,2);
});
test('retry exhaustion stops further adapter calls', async t => {
  let attempts=0;
  const f=await automationFixture(t,{deliver:async()=>{attempts++;throw Object.assign(new Error(),{code:'mock_unavailable'});}}),d=await f.prepare();
  await f.action(d.id,'approve',1);
  for(let v=2;v<=4;v++) assert.equal((await f.action(d.id,'execute',v)).body.data.status,'failed');
  assert.equal((await f.action(d.id,'execute',5)).body.error,'retry_exhausted'); assert.equal(attempts,3);
});
test('unexpected adapter error rolls receipt, state and attempt back atomically', async t => {
  const f=await automationFixture(t,{deliver:async(c,clinic,draft)=>{await mockDelivery(c,clinic,draft);throw new Error('unexpected');}}),d=await f.prepare();
  await f.action(d.id,'approve',1);
  assert.equal((await f.action(d.id,'execute',2)).status,503);
  const saved=(await f.request('/v1/automation/'+d.id)).body;
  assert.equal(saved.data.status,'approved');assert.equal(saved.data.attempts,0);assert.equal(saved.receipt_id,null);
});
test('003 migration repeats safely and refuses checksum changes',async()=>{
  await migrateAll(pool); assert.equal(await databaseReady(pool),true);
  const sql=await readFile(new URL('../../db/migrations/003_controlled_automation.sql',import.meta.url),'utf8');
  await assert.rejects(()=>migrate(pool,sql+'\n-- changed','003'),/checksum/);
});
