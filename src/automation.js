import { randomUUID } from 'node:crypto';
import { ApiError, object, uuid, version, pagination, invalid } from './validation.js';
import { requireWriter } from './auth.js';

// Fixed administrative content; no untrusted prompt or clinical generation.
export function recallDraft(dueDate) {
  return `This is a synthetic recall reminder for ${dueDate}. Please contact the clinic to arrange your next appointment. This is not clinical advice.`;
}

// Transaction-local mock only. Do not replace this with a network send: an external
// provider requires a durable outbox, provider idempotency and reconciliation.
export async function mockDelivery(c, clinic, draft) {
  const result = await c.query(`INSERT INTO mock_delivery_receipts(clinic_id,draft_id,id)
    VALUES ($1,$2,$3) ON CONFLICT(clinic_id,draft_id) DO UPDATE SET draft_id=EXCLUDED.draft_id RETURNING id`,
  [clinic, draft.id, randomUUID()]);
  return result.rows[0].id;
}
async function event(c, actor, type, id, action, v) {
  await c.query(`INSERT INTO audit_events(id,clinic_id,actor_id,entity_type,entity_id,action,entity_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(),actor.clinic_id,actor.staff_id,type,id,action,v]);
}
async function source(c, clinic, recallId) {
  const recall = (await c.query('SELECT *,due_date::text AS due_date FROM recalls WHERE clinic_id=$1 AND id=$2 FOR SHARE', [clinic,recallId])).rows[0];
  if (!recall) throw new ApiError(404,'not_found');
  const patient = (await c.query('SELECT * FROM patients WHERE clinic_id=$1 AND id=$2 FOR SHARE', [clinic,recall.patient_id])).rows[0];
  return { recall, patient };
}
function eligible({ recall, patient }, draft) {
  if (!patient.messaging_consent) throw new ApiError(409,'consent_required');
  if (!patient.contact_email) throw new ApiError(409,'contact_required');
  if (recall.status !== 'pending') throw new ApiError(409,'source_changed');
  if (draft && (recall.version !== draft.recall_version || patient.consent_version !== draft.consent_version ||
    patient.contact_email !== draft.recipient || patient.id !== draft.patient_id)) throw new ApiError(409,'source_changed');
}
async function receipt(c, clinic, draft) {
  const r = await c.query('SELECT id FROM mock_delivery_receipts WHERE clinic_id=$1 AND draft_id=$2',[clinic,draft.id]);
  return { data: draft, receipt_id: r.rows[0]?.id ?? null, delivery_mode: 'mock' };
}

export async function automation(c, actor, req, url, input, deliver) {
  const consent = /^\/v1\/patients\/([0-9a-f-]+)\/consent$/.exec(url.pathname);
  const match = /^\/v1\/automation(?:\/([0-9a-f-]+)(?:\/(approve|reject|execute))?)?$/.exec(url.pathname);
  if (!consent && !match) return null;
  if (consent) {
    if (req.method !== 'PATCH') throw new ApiError(405,'method_not_allowed');
    if (actor.role !== 'administrator') throw new ApiError(403,'forbidden');
    if (url.search) invalid();
    object(input,['version','granted']); version(input.version);
    if (typeof input.granted !== 'boolean') invalid();
    const id = uuid(consent[1]);
    const p = (await c.query('SELECT consent_version FROM patients WHERE clinic_id=$1 AND id=$2 FOR UPDATE',[actor.clinic_id,id])).rows[0];
    if (!p) throw new ApiError(404,'not_found');
    if (p.consent_version !== input.version) throw new ApiError(409,'version_conflict');
    const r = await c.query(`UPDATE patients SET messaging_consent=$3,consent_version=consent_version+1
      WHERE clinic_id=$1 AND id=$2 RETURNING id,messaging_consent,consent_version`,[actor.clinic_id,id,input.granted]);
    await c.query(`INSERT INTO consent_events(clinic_id,id,patient_id,actor_id,granted,version) VALUES($1,$2,$3,$4,$5,$6)`,
      [actor.clinic_id,randomUUID(),id,actor.staff_id,input.granted,p.consent_version+1]);
    await event(c,actor,'patient',id,'consent_changed',p.consent_version+1);
    return { data:r.rows[0] };
  }
  const id = match[1] ? uuid(match[1]) : null, action = match[2];
  if (req.method === 'GET' && !action) {
    const {limit,offset} = pagination(url.searchParams);
    if (id) {
      const r = await c.query('SELECT * FROM automation_drafts WHERE clinic_id=$1 AND id=$2',[actor.clinic_id,id]);
      if (!r.rowCount) throw new ApiError(404,'not_found');
      return receipt(c,actor.clinic_id,r.rows[0]);
    }
    return {data:(await c.query('SELECT * FROM automation_drafts WHERE clinic_id=$1 ORDER BY created_at,id LIMIT $2 OFFSET $3',[actor.clinic_id,limit,offset])).rows,limit,offset};
  }
  if (req.method !== 'POST' || (id && !action)) throw new ApiError(405,'method_not_allowed');
  requireWriter(actor); if (url.search) invalid();
  if (!id) {
    object(input,['recall_id','request_key']);
    const recallId=uuid(input.recall_id), key=uuid(input.request_key);
    // Serializes same-clinic request keys without a unique-violation retry race.
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor.clinic_id}:${key}`]);
    const prior=(await c.query('SELECT * FROM automation_drafts WHERE clinic_id=$1 AND request_key=$2',[actor.clinic_id,key])).rows[0];
    if (prior) {
      if (prior.recall_id !== recallId) throw new ApiError(409,'idempotency_conflict');
      return receipt(c,actor.clinic_id,prior);
    }
    const current=await source(c,actor.clinic_id,recallId); eligible(current);
    const {recall,patient}=current;
    const result=await c.query(`INSERT INTO automation_drafts(clinic_id,id,request_key,recall_id,patient_id,recall_version,consent_version,recipient,content)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(clinic_id,recall_id,recall_version,consent_version) DO NOTHING RETURNING *`,
      [actor.clinic_id,randomUUID(),key,recallId,patient.id,recall.version,patient.consent_version,patient.contact_email,recallDraft(recall.due_date)]);
    if (!result.rowCount) throw new ApiError(409,'draft_exists');
    await event(c,actor,'automation',result.rows[0].id,'created',1);
    return receipt(c,actor.clinic_id,result.rows[0]);
  }
  object(input,['version']); version(input.version);
  const draft=(await c.query('SELECT * FROM automation_drafts WHERE clinic_id=$1 AND id=$2 FOR UPDATE',[actor.clinic_id,id])).rows[0];
  if (!draft) throw new ApiError(404,'not_found');
  // A response lost after COMMIT must not cause another mock delivery.
  if (action==='execute' && draft.status==='simulated') return receipt(c,actor.clinic_id,draft);
  if (draft.version !== input.version) throw new ApiError(409,'version_conflict');
  let next, error=null;
  if (action==='approve' || action==='reject') {
    if (draft.status!=='draft') throw new ApiError(409,'invalid_transition');
    if (action==='approve') eligible(await source(c,actor.clinic_id,draft.recall_id),draft);
    next=action==='approve'?'approved':'rejected';
  } else {
    if (!['approved','failed'].includes(draft.status)) throw new ApiError(409,'approval_required');
    if (draft.attempts>=3) throw new ApiError(409,'retry_exhausted');
    eligible(await source(c,actor.clinic_id,draft.recall_id),draft);
    // Adapter failure can include a partial mock insert; undo it before recording
    // failure. Unexpected errors abort the entire request transaction.
    await c.query('SAVEPOINT mock_attempt');
    try { await deliver(c,actor.clinic_id,draft); next='simulated'; }
    catch (e) {
      if (e.code!=='mock_unavailable') throw e;
      await c.query('ROLLBACK TO SAVEPOINT mock_attempt'); next='failed'; error='mock_unavailable';
    }
    await c.query('RELEASE SAVEPOINT mock_attempt');
  }
  const result=await c.query(`UPDATE automation_drafts SET status=$3,version=version+1,last_error=$4,
    attempts=attempts+$5,approved_by=CASE WHEN $3='approved' THEN $6 ELSE approved_by END,
    approved_at=CASE WHEN $3='approved' THEN now() ELSE approved_at END
    WHERE clinic_id=$1 AND id=$2 RETURNING *`,[actor.clinic_id,id,next,error,action==='execute'?1:0,actor.staff_id]);
  await event(c,actor,'automation',id,next,draft.version+1);
  return receipt(c,actor.clinic_id,result.rows[0]);
}
