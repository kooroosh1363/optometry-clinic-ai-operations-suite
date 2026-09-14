import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool, databaseReady } from '../../src/db.js';
import { migrate, migrationSql } from '../../src/migrate.js';

// Fail, never silently skip: this suite requires an isolated disposable DB.
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required; use a disposable database');
const pool = createPool(process.env.TEST_DATABASE_URL);
const sql = await migrationSql();
test.after(async () => pool.end());
test('migration is atomic, repeatable and checksum protected', async () => {
  await migrate(pool, sql);
  assert.equal(await migrate(pool,sql), false);
  assert.equal(await databaseReady(pool), true);
  await assert.rejects(() => migrate(pool,sql+'\n-- mutated'), /checksum/);
});
test('failed migration leaves no partial tables', async () => {
  const c = await pool.connect();
  const schema = 'test_' + randomUUID().replaceAll('-','');
  try {
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET search_path TO ${schema}, public`);
    // Force isolated migration metadata without touching the public migration.
    await c.query('CREATE TABLE schema_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())');
    await assert.rejects(() => migrate({connect:async()=>({query:(...args)=>c.query(...args),release:()=>{}})}, 'CREATE TABLE partial(id int); SELECT missing_function();'));
    assert.equal((await c.query("SELECT to_regclass('partial') AS found")).rows[0].found, null);
  } finally {
    await c.query('SET search_path TO public');
    await c.query(`DROP SCHEMA ${schema} CASCADE`); // Only the freshly generated test schema.
    c.release();
  }
});
async function fixture(t) {
  const c = await pool.connect();
  await c.query('BEGIN');
  t.after(async () => { await c.query('ROLLBACK'); c.release(); });
  const clinic=randomUUID(), other=randomUUID(), patient=randomUUID(), staff=randomUUID(), otherPatient=randomUUID();
  await c.query("INSERT INTO clinics(id,name) VALUES ($1,'Synthetic Clinic'),($2,'Other Synthetic Clinic')",[clinic,other]);
  await c.query("INSERT INTO patients(clinic_id,id,display_name) VALUES ($1,$2,'Synthetic Patient'),($3,$4,'Other Patient')",[clinic,patient,other,otherPatient]);
  await c.query("INSERT INTO staff(clinic_id,id,display_name,role) VALUES ($1,$2,'Synthetic Practitioner','optometrist')",[clinic,staff]);
  const insert = ({pid=patient, sid=staff, start='2030-01-01T10:00:00Z', end='2030-01-01T11:00:00Z', status='scheduled'}={}) => c.query(
    'INSERT INTO appointments(clinic_id,id,patient_id,practitioner_id,starts_at,ends_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [clinic,randomUUID(),pid,sid,start,end,status]);
  return {c,clinic,other,patient,staff,otherPatient,insert};
}
test('valid appointment persists and consent defaults false',async t=>{
  const f=await fixture(t); await f.insert();
  const r=await f.c.query('SELECT messaging_consent FROM patients WHERE clinic_id=$1',[f.clinic]);
  assert.equal(r.rows[0].messaging_consent,false);
});
test('cross-clinic patient reference is rejected',async t=>{
  const f=await fixture(t); await assert.rejects(()=>f.insert({pid:f.otherPatient}),{code:'23503'});
});
test('cross-clinic practitioner reference is rejected',async t=>{
  const f=await fixture(t); const s=randomUUID();
  await f.c.query("INSERT INTO staff VALUES ($1,$2,'Other Staff','optometrist')",[f.other,s]);
  await assert.rejects(()=>f.insert({sid:s}),{code:'23503'});
});
for (const end of ['2030-01-01T10:00:00Z','2030-01-01T09:00:00Z']) {
  test(`rejects zero/negative interval ${end}`,async t=>{ const f=await fixture(t); await assert.rejects(()=>f.insert({end}),{code:'23514'}); });
}
test('invalid appointment status is rejected',async t=>{const f=await fixture(t);await assert.rejects(()=>f.insert({status:'invented'}),{code:'23514'});});
test('same practitioner overlap rejected even for another patient',async t=>{
  const f=await fixture(t);await f.insert(); const p=randomUUID();
  await f.c.query("INSERT INTO patients(clinic_id,id,display_name) VALUES ($1,$2,'Second Patient')",[f.clinic,p]);
  await assert.rejects(()=>f.insert({pid:p,start:'2030-01-01T10:30:00Z'}),{code:'23P01'});
});
test('same patient overlap rejected even for another practitioner',async t=>{
  const f=await fixture(t);await f.insert();const s=randomUUID();
  await f.c.query("INSERT INTO staff VALUES ($1,$2,'Second Staff','optometrist')",[f.clinic,s]);
  await assert.rejects(()=>f.insert({sid:s}),{code:'23P01'});
});
test('adjacent half-open appointments are allowed',async t=>{const f=await fixture(t);await f.insert();await f.insert({start:'2030-01-01T11:00:00Z',end:'2030-01-01T12:00:00Z'});});
test('cancelled slots may be reused',async t=>{const f=await fixture(t);await f.insert({status:'cancelled'});await f.insert();});
test('checked-in appointment still blocks its slot',async t=>{const f=await fixture(t);await f.insert({status:'checked_in'});await assert.rejects(()=>f.insert(),{code:'23P01'});});
test('overlap uses instants across timezone offsets',async t=>{const f=await fixture(t);await f.insert();await assert.rejects(()=>f.insert({start:'2030-01-01T14:00:00+04:00',end:'2030-01-01T15:00:00+04:00'}),{code:'23P01'});});
