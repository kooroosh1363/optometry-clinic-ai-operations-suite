import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { createPool, databaseReady } from '../../src/db.js';
import { migrateAll } from '../../src/migrate.js';
import { createApp } from '../../src/app.js';
import { createApi } from '../../src/api.js';
import { createDemo } from '../../src/operator.js';
import { issueToken } from '../../src/auth.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required; use a disposable database');
const pool = createPool(process.env.TEST_DATABASE_URL); let server;
test.beforeAll(async () => { await migrateAll(pool); server = createApp({ ready: () => databaseReady(pool), api: createApi(pool) }); await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve)); });
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
async function fixture() {
  const ids = await createDemo(pool, 'America/Vancouver'), reception = randomUUID();
  await pool.query("INSERT INTO staff(clinic_id,id,display_name,role) VALUES ($1,$2,'Maya Reception','receptionist')", [ids.clinic_id, reception]);
  return { ...ids, reception, writer: await issueToken(pool, ids.clinic_id, reception), reader: await issueToken(pool, ids.clinic_id, ids.practitioner_id) };
}
async function cleanup(ids) { for (const table of ['mock_delivery_receipts','automation_drafts','consent_events','audit_events','recalls','appointments','access_tokens','patients','staff']) await pool.query(`DELETE FROM ${table} WHERE clinic_id=$1`, [ids.clinic_id]); await pool.query('DELETE FROM clinics WHERE id=$1', [ids.clinic_id]); }
async function connect(page, token) { await page.goto('/dashboard'); await page.getByLabel('Operator-issued credential').fill(token); await page.getByRole('button', { name: /Connect to clinic/ }).click(); await expect(page.getByText('Workspace at a glance')).toBeVisible(); }
function assertNoPersistence(value) { expect(value.local).toEqual([]); expect(value.session).toEqual([]); expect(value.cookie).toBe(''); expect(value.url).not.toContain('Bearer'); }

test('reception completes patient, booking, recall and status flows against real API', async ({ page }) => {
  const f = await fixture();
  try {
    await connect(page, f.writer.token); await expect(page.getByText('Maya Reception')).toBeVisible();
    await page.getByRole('button', { name: 'Patients' }).click(); await page.getByRole('button', { name: '+ Add patient' }).click(); await page.getByLabel('Display name').fill('Avery Synthetic'); await page.getByLabel('Contact email').fill('avery@example.invalid'); await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Avery Synthetic')).toBeVisible();
    await page.getByRole('button', { name: 'Appointments' }).click(); await page.getByRole('button', { name: '+ Book appointment' }).click(); await page.getByLabel('Patient', { exact: true }).selectOption({ label: 'Avery Synthetic' }); await page.getByLabel('Optometrist').selectOption({ label: 'Demo Optometrist' });
    await page.getByLabel('Starts').fill('2030-01-02T10:00:00-08:00'); await page.getByLabel('Ends').fill('2030-01-02T10:30:00-08:00'); await page.getByRole('button', { name: 'Save' }).click(); await expect(page.getByRole('cell', { name: 'Avery Synthetic' })).toBeVisible();
    await page.getByLabel('Change status for Avery Synthetic').selectOption('checked_in'); await expect(page.locator('#appointments').getByText('checked in', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Recall queue' }).click(); await page.getByRole('button', { name: '+ Add recall' }).click(); await page.getByLabel('Patient', { exact: true }).selectOption({ label: 'Avery Synthetic' }); await page.getByLabel('Due date').fill('2030-03-01'); await page.getByRole('button', { name: 'Save' }).click(); await expect(page.getByText('Due 2030-03-01')).toBeVisible();
    assertNoPersistence(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie, url: location.href })));
  } finally { await cleanup(f); }
});
test('optometrist receives a clear read-only workspace', async ({ page }) => {
  const f = await fixture(); try { await connect(page, f.reader.token); await expect(page.getByText('Read-only role: operational changes are disabled.')).toBeVisible(); await expect(page.locator('.writer-only:visible')).toHaveCount(0); await page.getByRole('button', { name: 'Appointments' }).click(); await expect(page.locator('select.action-select')).toHaveCount(0); } finally { await cleanup(f); }
});
test('invalid credential and sign-out clear session without persistence', async ({ page }) => {
  await page.goto('/dashboard'); await page.getByLabel('Operator-issued credential').fill('x'.repeat(43)); await page.getByRole('button', { name: /Connect/ }).click(); await expect(page.getByRole('alert')).toContainText('invalid, expired or revoked');
  const f = await fixture(); try { await connect(page, f.writer.token); await page.getByRole('button', { name: 'Sign out' }).click(); await expect(page.getByText('A clear view of the clinic day.')).toBeVisible(); assertNoPersistence(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), cookie: document.cookie, url: location.href }))); } finally { await cleanup(f); }
});
test('dashboard has no serious accessibility violations and works at mobile width', async ({ page }) => {
  const f = await fixture(); try { await page.setViewportSize({ width: 390, height: 844 }); await connect(page, f.writer.token); const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.filter(v => ['critical','serious'].includes(v.impact))).toEqual([]); await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible(); await page.getByRole('button', { name: 'Open navigation' }).click(); await expect(page.getByRole('button', { name: 'Patients' })).toBeVisible(); } finally { await cleanup(f); }
});

test('administrator records consent and reviews an immutable draft before mock delivery', async ({ page }) => {
  const f=await fixture();
  const admin=await issueToken(pool,f.clinic_id,f.administrator_id);
  await pool.query("UPDATE patients SET contact_email='demo@example.invalid' WHERE clinic_id=$1",[f.clinic_id]);
  await pool.query("INSERT INTO recalls(clinic_id,id,patient_id,due_date) VALUES($1,$2,$3,'2030-03-01')",[f.clinic_id,randomUUID(),f.patient_id]);
  page.on('dialog',dialog=>dialog.accept());
  try {
    await connect(page,admin.token);
    await page.getByRole('button',{name:'Patients',exact:true}).click();
    await page.getByRole('button',{name:'Record demo consent'}).click();
    await expect(page.getByText('Messaging consent recorded',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Recall queue',exact:true}).click();
    await page.getByRole('button',{name:'Generate draft'}).click();
    await expect(page.getByRole('status').filter({hasText:'Operation recorded.'})).toBeVisible();
    await page.getByRole('button',{name:'Automation',exact:true}).click();
    await expect(page.locator('#automation blockquote')).toContainText('2030-03-01');
    await expect(page.getByRole('button',{name:'Simulate delivery'})).toHaveCount(0);
    await page.getByRole('button',{name:'Approve exact draft'}).click();
    await page.getByRole('button',{name:'Simulate delivery'}).click();
    await expect(page.getByText('Mock receipt recorded. No real message was sent.')).toBeVisible();
    await expect(page.getByRole('button',{name:'Simulate delivery'})).toHaveCount(0);
    const results=await new AxeBuilder({page}).analyze();
    expect(results.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally { await cleanup(f); }
});

test('reports show exact database cohorts, empty denominators, errors and mobile layout',async({page})=>{
  const f=await fixture();
  for(const [i,status] of ['completed','completed','no_show'].entries()) await pool.query(`INSERT INTO appointments(clinic_id,id,patient_id,practitioner_id,starts_at,ends_at,status)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[f.clinic_id,randomUUID(),f.patient_id,f.practitioner_id,`2020-01-01T${10+i}:00:00Z`,`2020-01-01T${10+i}:30:00Z`,status]);
  try{
    await connect(page,f.reader.token);await page.getByRole('button',{name:'Reports',exact:true}).click();
    await expect(page.getByRole('button',{name:'Run report'})).toBeEnabled();
    await page.getByLabel('From date').fill('2020-01-01');await page.getByLabel('To date').fill('2020-01-02');
    await page.getByRole('button',{name:'Run report'}).click();
    await expect(page.locator('#report-results')).toContainText('33.3%');
    await expect(page.locator('#report-results')).toContainText('1 of 3 ended completed/no-show bookings');
    await expect(page.getByRole('row',{name:'2020-01-01 3 2 1',exact:true})).toBeVisible();
    await expect(page.getByRole('row',{name:'2020-01-02 0 0 0',exact:true})).toBeVisible();
    const results=await new AxeBuilder({page}).analyze();expect(results.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
    await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByLabel('From date').fill('2020-01-03');await page.getByRole('button',{name:'Run report'}).click();
    await expect(page.locator('#report-error')).toContainText('Choose valid dates');await expect(page.locator('#report-results')).toBeEmpty();
    await page.getByLabel('To date').fill('2020-01-03');await page.getByRole('button',{name:'Run report'}).click();
    await expect(page.locator('#report-results')).toContainText('N/A');
    await page.route('**/v1/analytics?**',route=>route.fulfill({status:503,json:{error:'service_unavailable'}}));
    await page.getByRole('button',{name:'Run report'}).click();await expect(page.locator('#report-error')).toContainText('temporarily unavailable');await expect(page.locator('#report-results')).toBeEmpty();
  }finally{await cleanup(f);}
});

test('sign-out clears rendered data and discards a late report from the old session',async({page})=>{
  const f=await fixture(),other=await fixture();
  let release,started,finished;
  const gate=new Promise(r=>release=r),seen=new Promise(r=>started=r),done=new Promise(r=>finished=r);
  try{
    await connect(page,f.writer.token);
    await expect(page.getByLabel('Operator-issued credential')).toHaveValue('');
    await page.route('**/v1/analytics?**',async route=>{
      try{const response=await route.fetch();started();await gate;await route.fulfill({response});}catch{/* Browser aborts old-session responses. */}finally{finished();}
    });
    await page.getByRole('button',{name:'Reports',exact:true}).click();await seen;
    await page.getByRole('button',{name:'Sign out'}).click();
    await expect(page.locator('#patients-grid')).toBeEmpty();await expect(page.locator('#report-results')).toBeEmpty();
    await page.getByLabel('Operator-issued credential').fill(other.reader.token);await page.getByRole('button',{name:/Connect to clinic/}).click();
    await expect(page.getByText('Workspace at a glance')).toBeVisible();
    release();await done;
    await expect(page.locator('#report-results')).toBeEmpty();await expect(page.locator('#staff-name')).toHaveText('Demo Optometrist');
    await expect(page.locator('#app-view')).toBeVisible();await expect(page.locator('#connect-view')).toBeHidden();
  }finally{release?.();await cleanup(f);await cleanup(other);}
});

test('a committed mutation with a late response cannot restore the signed-out form or records',async({page})=>{
  const f=await fixture();let release,started,finished;
  const gate=new Promise(r=>release=r),seen=new Promise(r=>started=r),done=new Promise(r=>finished=r);
  try{
    await connect(page,f.writer.token);
    await page.route('**/v1/patients',async route=>{
      try{const response=await route.fetch();started();await gate;await route.fulfill({response});}catch{/* Expected when the session is cancelled. */}finally{finished();}
    });
    await page.getByRole('button',{name:'Patients',exact:true}).click();await page.getByRole('button',{name:'+ Add patient'}).click();
    await page.getByLabel('Display name').fill('Late Synthetic Response');await page.getByRole('button',{name:'Save',exact:true}).click();await seen;
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'Sign out'}).click();release();await done;
    await expect(page.locator('#form-fields')).toBeEmpty();await expect(page.locator('#patients-grid')).toBeEmpty();await expect(page.locator('#toast')).toBeHidden();
    await expect(page.locator('#connect-view')).toBeVisible();await expect(page.locator('#app-view')).toBeHidden();
    assertNoPersistence(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage),cookie:document.cookie,url:location.href})));
  }finally{release?.();await cleanup(f);}
});
