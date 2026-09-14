import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ApiError, uuid } from './validation.js';

export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export async function authenticate(client, header) {
  if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw new ApiError(401, 'unauthorized');
  const result = await client.query(`SELECT s.clinic_id, s.id AS staff_id, s.role, s.display_name, c.timezone
    FROM access_tokens t JOIN staff s ON (s.clinic_id=t.clinic_id AND s.id=t.staff_id)
    JOIN clinics c ON c.id=s.clinic_id
    WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at > clock_timestamp() AND s.active
    FOR SHARE OF t, s`, [tokenHash(header.slice(7))]);
  if (!result.rowCount) throw new ApiError(401, 'unauthorized');
  return result.rows[0];
}
export function requireWriter(actor) {
  if (!['administrator', 'receptionist'].includes(actor.role)) throw new ApiError(403, 'forbidden');
}
export async function issueToken(client, clinicId, staffId, hours = 8) {
  uuid(clinicId); uuid(staffId);
  if (!Number.isInteger(hours) || hours < 1 || hours > 24) throw new Error('Lifetime must be 1..24 hours');
  const token = randomBytes(32).toString('base64url'), id = randomUUID();
  const r = await client.query(`INSERT INTO access_tokens(id,clinic_id,staff_id,token_hash,expires_at)
    SELECT $1,clinic_id,id,$4,now()+make_interval(hours => $5) FROM staff WHERE clinic_id=$2 AND id=$3 AND active
    RETURNING expires_at`, [id, clinicId, staffId, tokenHash(token), hours]);
  if (!r.rowCount) throw new Error('Active staff member not found');
  return { id, token, expires_at: r.rows[0].expires_at };
}
