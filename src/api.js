import { randomUUID } from 'node:crypto';
import { automation, mockDelivery } from './automation.js';
import { authenticate, requireWriter } from './auth.js';
import { ApiError, invalid, object, uuid, name, interval, version, timezone, dateOnly, pagination } from './validation.js';

const transitions = {
  scheduled: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['completed', 'cancelled'],
  completed: [], cancelled: [], no_show: []
};
const recallTransitions = { pending: ['contacted', 'closed'], contacted: ['closed'], closed: [] };
const patientColumns = 'id,display_name,contact_email,messaging_consent,consent_version,created_at';
const appointmentColumns = 'id,patient_id,practitioner_id,starts_at,ends_at,status,version';
const recallColumns = 'id,patient_id,due_date::text,status,version,created_at';

async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'json_required');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new ApiError(415, 'unsupported_encoding');
  const chunks = []; let size = 0;
  // A deadline is explicit: Node's requestTimeout alone may be checked too late.
  const deadline = setTimeout(() => req.destroy(), 5000); deadline.unref();
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > 16384) { req.resume(); throw new ApiError(413, 'body_too_large'); }
      chunks.push(chunk);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { invalid(); }
  } finally { clearTimeout(deadline); }
}
async function audit(c, a, type, id, action, v) {
  await c.query(`INSERT INTO audit_events(id,clinic_id,actor_id,entity_type,entity_id,action,entity_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), a.clinic_id, a.staff_id, type, id, action, v]);
}
async function exists(c, table, clinic, id) {
  // table comes only from fixed server constants below.
  const r = await c.query(`SELECT id FROM ${table} WHERE clinic_id=$1 AND id=$2`, [clinic, uuid(id)]);
  if (!r.rowCount) throw new ApiError(400, 'invalid_reference');
}
async function practitioner(c, clinic, id) {
  const r = await c.query("SELECT id FROM staff WHERE clinic_id=$1 AND id=$2 AND role='optometrist' AND active FOR SHARE", [clinic, uuid(id)]);
  if (!r.rowCount) throw new ApiError(400, 'invalid_reference');
}
async function dispatch(c, actor, req, url, input, deliver) {
  const automated = await automation(c, actor, req, url, input, deliver);
  if (automated) return automated;
  const path = url.pathname, method = req.method;
  const match = /^\/v1\/(patients|appointments|recalls)(?:\/([0-9a-f-]+))?$/.exec(path);
  if (path === '/v1/me' && method === 'GET') return { data: actor };
  if (path === '/v1/staff' && method === 'GET') {
    const { limit, offset } = pagination(url.searchParams);
    return { data: (await c.query('SELECT id,display_name,role,active FROM staff WHERE clinic_id=$1 ORDER BY id LIMIT $2 OFFSET $3', [actor.clinic_id, limit, offset])).rows, limit, offset };
  }
  if (!match) throw new ApiError(404, 'not_found');
  const [, kind, rawId] = match;
  const id = rawId ? uuid(rawId) : null;
  const columns = { patients: patientColumns, appointments: appointmentColumns, recalls: recallColumns }[kind];
  if (method === 'GET') {
    const { limit, offset } = pagination(url.searchParams);
    if (id) {
      const r = await c.query(`SELECT ${columns} FROM ${kind} WHERE clinic_id=$1 AND id=$2`, [actor.clinic_id, id]);
      if (!r.rowCount) throw new ApiError(404, 'not_found');
      return { data: r.rows[0] };
    }
    return { data: (await c.query(`SELECT ${columns} FROM ${kind} WHERE clinic_id=$1 ORDER BY id LIMIT $2 OFFSET $3`, [actor.clinic_id, limit, offset])).rows, limit, offset };
  }
  if (!((method === 'POST' && !id) || (method === 'PATCH' && id && kind !== 'patients'))) throw new ApiError(405, 'method_not_allowed');
  if (url.search) invalid();
  requireWriter(actor);
  if (method === 'POST' && kind === 'patients') {
    object(input, ['display_name'], ['contact_email']);
    const displayName = name(input.display_name);
    const email = input.contact_email ?? null;
    if (email !== null && (typeof email !== 'string' || email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email))) invalid();
    const newId = randomUUID();
    const r = await c.query(`INSERT INTO patients(clinic_id,id,display_name,contact_email) VALUES ($1,$2,$3,$4) RETURNING ${patientColumns}`, [actor.clinic_id, newId, displayName, email]);
    await audit(c, actor, 'patient', newId, 'created', 1);
    return { data: r.rows[0] };
  }
  if (method === 'POST' && kind === 'appointments') {
    object(input, ['patient_id', 'practitioner_id', 'starts_at', 'ends_at']);
    interval(input.starts_at, input.ends_at);
    await exists(c, 'patients', actor.clinic_id, input.patient_id);
    await practitioner(c, actor.clinic_id, input.practitioner_id);
    const newId = randomUUID();
    const r = await c.query(`INSERT INTO appointments(clinic_id,id,patient_id,practitioner_id,starts_at,ends_at)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${appointmentColumns}`, [actor.clinic_id, newId, input.patient_id, input.practitioner_id, input.starts_at, input.ends_at]);
    await audit(c, actor, 'appointment', newId, 'created', 1);
    return { data: r.rows[0] };
  }
  if (method === 'POST' && kind === 'recalls') {
    object(input, ['patient_id', 'due_date']); dateOnly(input.due_date);
    await exists(c, 'patients', actor.clinic_id, input.patient_id);
    const newId = randomUUID();
    const r = await c.query(`INSERT INTO recalls(clinic_id,id,patient_id,due_date) VALUES ($1,$2,$3,$4) RETURNING ${recallColumns}`, [actor.clinic_id, newId, input.patient_id, input.due_date]);
    await audit(c, actor, 'recall', newId, 'created', 1);
    return { data: r.rows[0] };
  }
  object(input, ['version'], kind === 'appointments' ? ['status', 'starts_at', 'ends_at', 'practitioner_id'] : ['status']);
  version(input.version);
  const locked = await c.query(`SELECT ${columns} FROM ${kind} WHERE clinic_id=$1 AND id=$2 FOR UPDATE`, [actor.clinic_id, id]);
  if (!locked.rowCount) throw new ApiError(404, 'not_found');
  const current = locked.rows[0];
  if (current.version !== input.version) throw new ApiError(409, 'version_conflict');
  const changingStatus = Object.hasOwn(input, 'status');
  if (changingStatus) {
    object(input, ['version', 'status']);
    const allowed = kind === 'appointments' ? transitions : recallTransitions;
    if (typeof input.status !== 'string' || !allowed[current.status]?.includes(input.status)) throw new ApiError(409, 'invalid_transition');
    const r = await c.query(`UPDATE ${kind} SET status=$3,version=version+1 WHERE clinic_id=$1 AND id=$2 RETURNING ${columns}`, [actor.clinic_id, id, input.status]);
    await audit(c, actor, kind === 'appointments' ? 'appointment' : 'recall', id, 'status_changed', current.version + 1);
    return { data: r.rows[0] };
  }
  if (kind !== 'appointments') invalid();
  object(input, ['version', 'starts_at', 'ends_at'], ['practitioner_id']);
  if (current.status !== 'scheduled') throw new ApiError(409, 'invalid_transition');
  interval(input.starts_at, input.ends_at);
  const staffId = input.practitioner_id ?? current.practitioner_id;
  await practitioner(c, actor.clinic_id, staffId);
  const r = await c.query(`UPDATE appointments SET starts_at=$3,ends_at=$4,practitioner_id=$5,version=version+1
    WHERE clinic_id=$1 AND id=$2 RETURNING ${appointmentColumns}`, [actor.clinic_id, id, input.starts_at, input.ends_at, staffId]);
  await audit(c, actor, 'appointment', id, 'rescheduled', current.version + 1);
  return { data: r.rows[0] };
}

export function createApi(pool, { deliver = mockDelivery } = {}) {
  return async (req, res, send) => {
    let c;
    try {
      // Reject obvious missing credentials before consuming a body or acquiring a connection.
      if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(req.headers.authorization ?? '')) throw new ApiError(401, 'unauthorized');
      const url = new URL(req.url, 'http://localhost');
      const input = ['POST', 'PATCH'].includes(req.method) ? await body(req) : null;
      c = await pool.connect();
      await c.query('BEGIN');
      const actor = await authenticate(c, req.headers.authorization);
      try { timezone(actor.timezone); } catch { throw new ApiError(409, 'clinic_configuration_invalid'); }
      const output = await dispatch(c, actor, req, url, input, deliver);
      await c.query('COMMIT');
      send(req.method === 'POST' ? 201 : 200, output);
    } catch (error) {
      if (c) { try { await c.query('ROLLBACK'); } catch { /* Discard below. */ } }
      if (error instanceof ApiError) {
        if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
        if (error.status === 413) res.setHeader('Connection', 'close');
        return send(error.status, { error: error.code });
      }
      if (error.code === '23P01') return send(409, { error: 'appointment_overlap' });
      if (['23503', '23514', '22P02', '22007', '22008'].includes(error.code)) return send(400, { error: 'invalid_request' });
      if (['40P01', '40001', '55P03'].includes(error.code)) return send(409, { error: 'retry_request' });
      send(503, { error: 'service_unavailable' });
    } finally { c?.release(); }
  };
}
