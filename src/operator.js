import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createPool } from './db.js';
import { config } from './config.js';
import { issueToken } from './auth.js';
import { timezone, uuid } from './validation.js';

export async function createDemo(client, zone = 'UTC') {
  timezone(zone);
  const clinic = randomUUID(), admin = randomUUID(), practitioner = randomUUID(), patient = randomUUID();
  await client.query('INSERT INTO clinics(id,name,timezone) VALUES ($1,$2,$3)', [clinic, 'Synthetic Optometry Demo', zone]);
  await client.query(`INSERT INTO staff(clinic_id,id,display_name,role) VALUES
    ($1,$2,'Demo Administrator','administrator'),($1,$3,'Demo Optometrist','optometrist')`, [clinic, admin, practitioner]);
  await client.query("INSERT INTO patients(clinic_id,id,display_name) VALUES ($1,$2,'Synthetic Patient')", [clinic, patient]);
  return { clinic_id: clinic, administrator_id: admin, practitioner_id: practitioner, patient_id: patient };
}
export async function revokeToken(client, tokenId) {
  uuid(tokenId);
  return (await client.query('UPDATE access_tokens SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL RETURNING id', [tokenId])).rowCount;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  const pool = createPool(config().databaseUrl);
  let c;
  try {
    c = await pool.connect(); await c.query('BEGIN'); let result;
    if (command === 'demo' && args.length <= 1) result = await createDemo(c, args[0]);
    else if (command === 'issue' && args.length >= 2 && args.length <= 3) result = await issueToken(c, args[0], args[1], args[2] === undefined ? 8 : Number(args[2]));
    else if (command === 'revoke' && args.length === 1) result = { revoked: await revokeToken(c, args[0]) };
    else throw new Error('Invalid command');
    await c.query('COMMIT');
    // issue deliberately displays the secret once to the trusted operator; never log this output.
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch {
    if (c) await c.query('ROLLBACK');
    console.error('Operator command failed. Usage: demo [IANA-zone] | issue CLINIC_ID STAFF_ID [HOURS] | revoke TOKEN_ID');
    process.exitCode = 1;
  } finally { c?.release(); await pool.end(); }
}
