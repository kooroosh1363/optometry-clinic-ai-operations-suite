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
async function cleanup(ids) { for (const table of ['audit_events','recalls','appointments','access_tokens','patients','staff']) await pool.query(`DELETE FROM ${table} WHERE clinic_id=$1`, [ids.clinic_id]); await pool.query('DELETE FROM clinics WHERE id=$1', [ids.clinic_id]); }
async function connect(page, token) { await page.goto('/dashboard'); await page.getByLabel('Operator-issued credential').fill(token); await page.getByRole('button', { name: /Connect to clinic/ }).click(); await expect(page.getByText('Today at a glance')).toBeVisible(); }
function assertNoPersistence(value) { expect(value.local).toEqual([]); expect(value.session).toEqual([]); expect(value.cookie).toBe(''); expect(value.url).not.toContain('Bearer'); }

test('reception completes patient, booking, recall and status flows against real API', async ({ page }) => {
  const f = await fixture();
  try {
    await connect(page, f.writer.token); await expect(page.getByText('Maya Reception')).toBeVisible();
    await page.getByRole('button', { name: 'Patients' }).click(); await page.getByRole('button', { name: '+ Add patient' }).click(); await page.getByLabel('Display name').fill('Avery Synthetic'); await page.getByLabel('Contact email').fill('avery@example.invalid'); await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Avery Synthetic')).toBeVisible();
    await page.getByRole('button', { name: 'Appointments' }).click(); await page.getByRole('button', { name: '+ Book appointment' }).click(); await page.getByLabel('Patient', { exact: true }).selectOption({ label: 'Avery Synthetic' }); await page.getByLabel('Optometrist').selectOption({ label: 'Demo Optometrist' });
    await page.getByLabel('Starts').fill('2030-01-02T10:00'); await page.getByLabel('Ends').fill('2030-01-02T10:30'); await page.getByRole('button', { name: 'Save' }).click(); await expect(page.getByRole('cell', { name: 'Avery Synthetic' })).toBeVisible();
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
