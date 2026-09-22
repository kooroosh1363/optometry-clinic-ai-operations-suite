const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { token: '', me: null, patients: [], staff: [], appointments: [], recalls: [], automation: [], view: 'overview', modal: null };
const titles = { overview: 'Clinic overview', appointments: 'Appointment schedule', patients: 'Patient directory', recalls: 'Recall queue', automation: 'Controlled automation', analytics: 'Management reports' };
let sessionEpoch = 0, loadSequence = 0, reportSequence = 0;
let modalSequence = 0, modalOpener = null;
let sessionController = new AbortController();
const stale = () => Object.assign(new Error('Obsolete session'), { code: 'stale_session' });
function newSession() { sessionEpoch++; loadSequence++; reportSequence++; sessionController.abort(); sessionController = new AbortController(); }
const errorText = {
  consent_required: 'Messaging consent is missing or revoked.', contact_required: 'A contact email is required.',
  source_changed: 'Consent or recall details changed. This draft can no longer be approved or executed.',
  draft_exists: 'A draft already exists for this recall and consent revision. Open Automation to review it.',
  idempotency_conflict: 'This request key belongs to a different recall.', approval_required: 'Explicit approval is required before execution.',
  retry_exhausted: 'The three-attempt limit has been reached. Operator review is required.',
  unauthorized: 'This credential is invalid, expired or revoked. Connect again with a current credential.', forbidden: 'Your role has read-only access to this operation.',
  appointment_overlap: 'That time conflicts with an active patient or practitioner booking.', version_conflict: 'This record changed in another session. The workspace has been refreshed.',
  invalid_transition: 'That status change is no longer allowed.', invalid_reference: 'A selected patient or practitioner is no longer available.',
  invalid_request: 'Check the fields and try again.', clinic_configuration_invalid: 'The clinic timezone needs operator attention.', service_unavailable: 'The service is temporarily unavailable. Try again.'
};

function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function clear(node) { node.replaceChildren(); }
function initials(name = '') { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '—'; }
function person(id) { return state.patients.find(item => item.id === id)?.display_name || 'Patient unavailable'; }
function staffName(id) { return state.staff.find(item => item.id === id)?.display_name || 'Staff unavailable'; }
function statusBadge(value) { return el('span', `badge ${value}`, value.replace('_', ' ')); }
function formatInstant(value) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: state.me?.timezone }).format(new Date(value)); }
function formatTime(value) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: state.me?.timezone }).format(new Date(value)); }
function message(code, fallback) { return errorText[code] || fallback || 'Something went wrong. Try again.'; }

async function api(path, options = {}) {
  const epoch = sessionEpoch;
  let response;
  try { response = await fetch(path, { ...options, signal: sessionController.signal, headers: { authorization: `Bearer ${state.token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } }); }
  catch (error) { if (epoch !== sessionEpoch) throw stale(); throw error; }
  let payload = {};
  try { payload = await response.json(); } catch { /* A proxy failure may have no JSON body. */ }
  if (epoch !== sessionEpoch) throw stale();
  if (!response.ok) { const error = new Error(message(payload.error)); error.code = payload.error; error.status = response.status; throw error; }
  return payload;
}
async function connect(token) {
  newSession();
  const epoch = sessionEpoch, button = $('#connect-form button[type="submit"]');
  button.disabled = true; $('#token').value = '';
  state.token = token;
  try {
    state.me = (await api('/v1/me')).data;
    $('#connect-view').hidden = true; $('#app-view').hidden = false;
    $('#staff-name').textContent = state.me.display_name; $('#staff-role').textContent = state.me.role.replace('_', ' ');
    $('#avatar').textContent = initials(state.me.display_name); $('#clinic-zone').textContent = state.me.timezone;
    document.body.classList.toggle('read-only', state.me.role === 'optometrist');
    $$('.writer-only').forEach(node => { node.hidden = state.me.role === 'optometrist'; });
    if (state.me.role === 'optometrist') showToast('Read-only role: operational changes are disabled.');
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && browserZone !== state.me.timezone) {
      const warning = $('#timezone-warning'); warning.textContent = `Clinic times display in ${state.me.timezone}. Your device uses ${browserZone}. Booking inputs require an explicit UTC offset.`; warning.hidden = false;
    }
    const today = new Intl.DateTimeFormat('en-CA', {timeZone:state.me.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    $('#report-from').value = today.slice(0,8) + '01'; $('#report-to').value = today;
    await loadAll();
  } catch (error) {
    if (error.code === 'stale_session') return;
    logout(message(error.code, error.message));
  } finally { if (epoch === sessionEpoch) button.disabled = false; }
}
function logout(reason = '') {
  newSession();
  state.token = ''; state.me = null; state.patients = []; state.staff = []; state.appointments = []; state.recalls = []; state.automation = [];
  state.view = 'overview'; closeModal();
  $('#save-record').disabled = false; $('#save-record').textContent = 'Save';
  ['#overview-appointments','#overview-recalls','#appointments-body','#patients-grid','#recalls-list','#automation-list','#report-results','#form-fields'].forEach(selector => clear($(selector)));
  ['#staff-name','#staff-role','#avatar','#clinic-zone','#form-error','#report-error','#toast'].forEach(selector => { $(selector).textContent = ''; });
  $$('.metrics strong').forEach(node => node.textContent = '0');
  $('#report-form').reset(); $('#report-loading').hidden = true; $('#run-report').disabled = false;
  $('#connect-form button[type="submit"]').disabled = false;
  $('#toast').hidden = true; clearTimeout(toastTimer); $('#global-error').hidden = true;
  $('#global-error span').textContent = ''; $('#loading').hidden = true;
  $('#token').type = 'password'; $('#reveal-token').textContent = 'Show'; $('#reveal-token').setAttribute('aria-label','Show credential');
  $('#app-view').hidden = true; $('#connect-view').hidden = false; $('#token').value = ''; $('#timezone-warning').hidden = true;
  $('#connect-error').textContent = reason;
  $('#token').focus();
}
async function loadAll() {
  const sequence = ++loadSequence;
  $('#loading').hidden = false; $('#global-error').hidden = true; $$('.view').forEach(v => v.hidden = true);
  try {
    const [patients, staff, appointments, recalls, automation] = await Promise.all(['/v1/patients?limit=100', '/v1/staff?limit=100', '/v1/appointments?limit=100', '/v1/recalls?limit=100', '/v1/automation?limit=100'].map(path => api(path)));
    if (sequence !== loadSequence || !state.me) return;
    state.automation = automation.data;
    state.patients = patients.data; state.staff = staff.data; state.appointments = appointments.data; state.recalls = recalls.data;
    render(); $('#loading').hidden = true; showView(state.view);
  } catch (error) {
    if (error.code === 'stale_session' || sequence !== loadSequence) return;
    $('#loading').hidden = true;
    if (error.status === 401) return logout(message('unauthorized'));
    const box = $('#global-error'); box.querySelector('span').textContent = message(error.code, error.message); box.hidden = false;
  }
}
function render() {
  $('#metric-scheduled').textContent = state.appointments.filter(a => a.status === 'scheduled').length;
  $('#metric-patients').textContent = state.patients.length;
  $('#metric-recalls').textContent = state.recalls.filter(r => r.status === 'pending').length;
  $('#metric-checked').textContent = state.appointments.filter(a => a.status === 'checked_in').length;
  renderOverview(); renderAppointments(); renderPatients(); renderRecalls(); renderAutomation();
}
function renderOverview() {
  const appointments = $('#overview-appointments'); clear(appointments);
  const active = state.appointments.filter(a => ['scheduled', 'checked_in'].includes(a.status)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 6);
  if (!active.length) appointments.append(emptyInline('No active appointments'));
  active.forEach(item => {
    const row = el('div', 'row'), time = el('span', 'time', formatTime(item.starts_at)), info = el('div');
    info.append(el('strong', '', person(item.patient_id)), el('small', '', `${staffName(item.practitioner_id)} · ${formatInstant(item.starts_at)}`)); row.append(time, info, statusBadge(item.status)); appointments.append(row);
  });
  const recalls = $('#overview-recalls'); clear(recalls);
  const pending = state.recalls.filter(r => r.status !== 'closed').sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
  if (!pending.length) recalls.append(emptyInline('Recall queue is clear'));
  pending.forEach(item => {
    const row = el('div', 'row'), due = el('span', 'time', new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(item.due_date + 'T00:00:00Z'))), info = el('div');
    info.append(el('strong', '', person(item.patient_id)), el('small', '', 'Manual follow-up task')); row.append(due, info, statusBadge(item.status)); recalls.append(row);
  });
}
function emptyInline(text) { const node = el('div', 'empty'); node.append(el('span', '', '○'), el('p', '', text)); return node; }
function renderAppointments() {
  const body = $('#appointments-body'); clear(body); $('#appointments-empty').hidden = state.appointments.length > 0;
  [...state.appointments].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).forEach(item => {
    const tr = document.createElement('tr'), patient = document.createElement('td'), time = document.createElement('td'), practitioner = document.createElement('td'), status = document.createElement('td'), actions = document.createElement('td');
    patient.append(el('strong', '', person(item.patient_id))); time.append(el('strong', '', formatInstant(item.starts_at)), el('small', '', `Ends ${formatTime(item.ends_at)}`)); practitioner.textContent = staffName(item.practitioner_id); status.append(statusBadge(item.status));
    const allowed = item.status === 'scheduled' ? ['checked_in', 'cancelled', 'no_show'] : item.status === 'checked_in' ? ['completed', 'cancelled'] : [];
    if (allowed.length && state.me.role !== 'optometrist') { const select = el('select', 'action-select'); select.setAttribute('aria-label', `Change status for ${person(item.patient_id)}`); select.append(new Option('Change status…', '')); allowed.forEach(value => select.append(new Option(value.replace('_', ' '), value))); select.addEventListener('change', () => updateStatus('appointments', item, select.value)); actions.append(select); }
    tr.append(patient, time, practitioner, status, actions); body.append(tr);
  });
}
function renderPatients() {
  const grid = $('#patients-grid'); clear(grid); $('#patients-empty').hidden = state.patients.length > 0;
  state.patients.forEach(item => {
    const card = el('article', 'patient-card'), icon = el('span', 'patient-initials', initials(item.display_name)), info = el('div');
    info.append(el('strong', '', item.display_name), el('small', '', item.contact_email || 'No contact email'), el('small', '', item.messaging_consent ? 'Messaging consent recorded' : 'No messaging consent'));
    if (state.me.role === 'administrator') {
      const button = el('button', 'ghost', item.messaging_consent ? 'Revoke demo consent' : 'Record demo consent');
      button.addEventListener('click', () => {
        if (confirm(`${item.messaging_consent ? 'Revoke' : 'Record'} synthetic messaging consent for ${item.display_name}? This is a demo record, not legal consent evidence.`))
          automationMutation(button, `/v1/patients/${item.id}/consent`, { version: item.consent_version, granted: !item.messaging_consent }, 'PATCH');
      }); info.append(button);
    }
    card.append(icon, info); grid.append(card);
  });
}
function renderRecalls() {
  const list = $('#recalls-list'); clear(list); $('#recalls-empty').hidden = state.recalls.length > 0;
  [...state.recalls].sort((a, b) => a.due_date.localeCompare(b.due_date)).forEach(item => {
    const card = el('article', 'recall-card'), info = el('div'); info.append(el('strong', '', person(item.patient_id)), el('small', '', `Due ${item.due_date} · manual follow-up`)); card.append(info, statusBadge(item.status));
    const allowed = item.status === 'pending' ? ['contacted', 'closed'] : item.status === 'contacted' ? ['closed'] : [];
    if (allowed.length && state.me.role !== 'optometrist') { const select = el('select', 'action-select'); select.setAttribute('aria-label', `Change recall status for ${person(item.patient_id)}`); select.append(new Option('Update…', '')); allowed.forEach(value => select.append(new Option(value, value))); select.addEventListener('change', () => updateStatus('recalls', item, select.value)); card.append(select); }
    if (item.status === 'pending' && state.me.role !== 'optometrist') {
      const button = el('button', 'ghost', 'Generate draft');
      const requestKey = crypto.randomUUID();
      button.addEventListener('click', () => automationMutation(button, '/v1/automation', { recall_id: item.id, request_key: requestKey })); card.append(button);
    }
    list.append(card);
  });
}
function renderAutomation() {
  const list = $('#automation-list'); clear(list);
  if (!state.automation.length) list.append(emptyInline('Generate a draft from a pending recall to begin.'));
  state.automation.forEach(item => {
    const card = el('article', 'panel automation-card');
    card.append(el('h3', '', person(item.patient_id)), statusBadge(item.status), el('p', '', `Recipient: ${item.recipient}`), el('blockquote', '', item.content), el('small', '', `Template: ${item.generator} · Attempts: ${item.attempts}/3 · Revision: ${item.version}`));
    if (item.approved_at) card.append(el('p', '', `Approved ${formatInstant(item.approved_at)}`));
    if (item.last_error) card.append(el('p', '', 'Mock delivery failed. An explicit retry is required.'));
    if (item.status === 'simulated') card.append(el('p', '', 'Mock receipt recorded. No real message was sent.'));
    if (state.me.role !== 'optometrist') {
      const actions = item.status === 'draft' ? [['approve','Approve exact draft'],['reject','Reject draft']] : ['approved','failed'].includes(item.status) && item.attempts < 3 ? [['execute',item.status === 'failed' ? 'Retry mock delivery' : 'Simulate delivery']] : [];
      const controls = el('div', 'automation-actions');
      actions.forEach(([action,label]) => {
        const button = el('button', 'ghost', label);
        button.addEventListener('click', () => {
          if (action === 'approve' && !confirm('Approve this exact draft and recipient for simulated delivery?')) return;
          automationMutation(button, `/v1/automation/${item.id}/${action}`, {version:item.version});
        }); controls.append(button);
      }); card.append(controls);
    }
    list.append(card);
  });
}
async function automationMutation(button, path, data, method = 'POST') {
  button.disabled = true;
  try {
    const result = await api(path, {method, body:JSON.stringify(data)});
    showToast(result.data?.status === 'failed' ? 'Mock delivery failed. Review before retrying.' : 'Operation recorded. No real message sent.');
    await loadAll();
  } catch (error) {
    if (error.code === 'stale_session') return;
    showToast(message(error.code,error.message),true);
    if (error.status === 401) logout(message('unauthorized'));
    else if (error.status === 409) await loadAll();
  } finally { button.disabled = false; }
}
async function updateStatus(collection, item, status) {
  if (!status) return;
  try { await api(`/v1/${collection}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ version: item.version, status }) }); showToast('Status updated.'); await loadAll(); }
  catch (error) { if (error.code === 'stale_session') return; showToast(message(error.code, error.message), true); if (['version_conflict', 'invalid_transition'].includes(error.code)) await loadAll(); if (error.status === 401) logout(message('unauthorized')); }
}
function showView(view) {
  if (!state.me) return;
  state.view = view; $$('.view').forEach(node => node.hidden = node.id !== view); $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#view-title').textContent = titles[view]; $('.sidebar').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false'); $('#workspace').focus();
  if (view === 'analytics') loadReport();
}
function field(name, label, type = 'text', extra = '') { return `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" ${extra} required></div>`; }
function selectField(name, label, options) { return `<div class="field"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" required><option value="">Select…</option>${options.map(o => `<option value="${o.id}"></option>`).join('')}</select></div>`; }
function openModal(type) {
  modalSequence++; modalOpener = document.activeElement;
  $('#save-record').disabled = false; $('#save-record').textContent = 'Save';
  state.modal = type; const fields = $('#form-fields');
  const titlesMap = { patient: 'Add patient', appointment: 'Book appointment', recall: 'Add recall' }; $('#modal-title').textContent = titlesMap[type];
  if (type === 'patient') fields.innerHTML = field('display_name', 'Display name') + field('contact_email', 'Contact email (optional)', 'email', 'required=""');
  if (type === 'appointment') fields.innerHTML = selectField('patient_id', 'Patient', state.patients) + selectField('practitioner_id', 'Optometrist', state.staff.filter(s => s.role === 'optometrist' && s.active)) + `<div class="field-grid">${field('starts_at', 'Starts (ISO with offset)', 'text', 'placeholder="2030-01-02T10:00:00-08:00"')}${field('ends_at', 'Ends (ISO with offset)', 'text', 'placeholder="2030-01-02T10:30:00-08:00"')}</div><p class="field-help">Include seconds and Z or a UTC offset. Choose the correct offset for that date; daylight-saving transitions can repeat a local time. Example: 2030-01-02T10:00:00-08:00.</p>`;
  if (type === 'recall') fields.innerHTML = selectField('patient_id', 'Patient', state.patients) + field('due_date', 'Due date', 'date');
  fields.querySelectorAll('select').forEach(select => { const source = select.name === 'patient_id' ? state.patients : state.staff.filter(s => s.role === 'optometrist' && s.active); [...select.options].slice(1).forEach((option, index) => option.textContent = source[index].display_name); });
  if (type === 'patient') $('#field-contact_email').required = false;
  $('#form-error').textContent = ''; $('#record-form').reset(); $('#modal-backdrop').hidden = false; document.body.style.overflow = 'hidden'; fields.querySelector('input,select').focus();
}
function closeModal() { modalSequence++; $('#modal-backdrop').hidden = true; document.body.style.overflow = ''; state.modal = null; if (modalOpener?.isConnected) modalOpener.focus(); }
async function submitRecord(form) {
  const epoch = sessionEpoch;
  const modal = modalSequence;
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form)); let path = `/v1/${state.modal === 'patient' ? 'patients' : state.modal === 'appointment' ? 'appointments' : 'recalls'}`;
  if (state.modal === 'patient' && !values.contact_email) delete values.contact_email;
  const button = $('#save-record'); button.disabled = true; button.textContent = 'Saving…';
  try { const savedType = state.modal; await api(path, { method: 'POST', body: JSON.stringify(values) }); if (modal === modalSequence) { closeModal(); showToast(`${savedType === 'patient' ? 'Patient' : savedType === 'appointment' ? 'Appointment' : 'Recall'} saved.`); } await loadAll(); }
  catch (error) { if (error.code === 'stale_session') return; if (error.status === 401) { closeModal(); return logout(message('unauthorized')); } if (modal === modalSequence) $('#form-error').textContent = message(error.code, error.message); }
  finally { if (epoch === sessionEpoch && modal === modalSequence) { button.disabled = false; button.textContent = 'Save'; } }
}
const percentage = value => value === null ? 'N/A' : new Intl.NumberFormat(undefined,{style:'percent',maximumFractionDigits:1}).format(value);
async function loadReport() {
  if (!state.me) return;
  const sequence = ++reportSequence;
  clear($('#report-results')); $('#report-error').textContent = ''; $('#report-loading').hidden = false; $('#run-report').disabled = true;
  try {
    const query = new URLSearchParams({from:$('#report-from').value,to:$('#report-to').value});
    const report = (await api('/v1/analytics?' + query)).data;
    if (sequence !== reportSequence) return;
    renderReport(report);
  } catch (error) {
    if (error.code === 'stale_session' || sequence !== reportSequence) return;
    if (error.status === 401) return logout(message('unauthorized'));
    $('#report-error').textContent = error.code === 'invalid_request' ? 'Choose valid dates in order, spanning at most 366 days.' : message(error.code,error.message);
  } finally {
    if (sequence === reportSequence) { $('#report-loading').hidden = true; $('#run-report').disabled = false; }
  }
}
function renderReport(report) {
  const root = $('#report-results'), a = report.appointments, r = report.recalls, d = report.automation;
  root.append(el('p','',`${report.from} through ${report.to} · ${report.timezone} · All matching records`));
  root.append(el('p','field-help',`Current statuses as of ${report.as_of}. Rates are descriptive, not evidence of business improvement.`));
  const metrics = el('div','metrics');
  [["No-show rate",percentage(a.no_show_rate),`${a.ended_no_show} of ${a.resolved_outcomes} ended completed/no-show bookings`],
    ['Recall closure',percentage(r.closure_rate),`${r.closed} of ${r.total} due recalls; closure does not prove attendance`],
    ['Overdue open recalls',r.overdue_open,'Pending/contacted and due before the clinic-local report date'],
    ['Simulated deliveries',d.simulated,'Mock receipts only; no real messages']].forEach(([label,value,detail])=>{
      const card=el('article'), box=el('div'); box.append(el('small','',label),el('strong','',value),el('p','',detail));card.append(box);metrics.append(card);
    });root.append(metrics);
  const summary=el('div','panel automation-card');
  summary.append(el('h3','','Cohort counts'),el('p','',`Appointments: ${a.total} total · ${a.completed} completed · ${a.no_show} no-show · ${a.cancelled} cancelled · ${a.scheduled} scheduled · ${a.checked_in} checked in`),
    el('p','',`Recalls: ${r.total} total · ${r.pending} pending · ${r.contacted} contacted · ${r.closed} closed`),
    el('p','',`Automation: ${d.total} drafts · ${d.draft} awaiting review · ${d.approved} approved · ${d.rejected} rejected · ${d.failed} failed · ${d.attempts} attempts`));root.append(summary);
  const wrap=el('div','panel table-wrap'), table=el('table'), caption=el('caption','','Daily appointment cohort (clinic-local dates)'), head=el('thead'), hr=el('tr');
  ['Date','Bookings','Ended completed','Ended no-show'].forEach(label=>{const th=el('th','',label);th.scope='col';hr.append(th);});head.append(hr);table.append(caption,head);
  const body=el('tbody');report.daily.forEach(day=>{const row=el('tr');[day.date,day.total,day.ended_completed,day.ended_no_show].forEach(value=>row.append(el('td','',value)));body.append(row);});table.append(body);wrap.append(table);root.append(wrap);
}
let toastTimer;
function showToast(text, danger = false) { const toast = $('#toast'); toast.textContent = text; toast.style.background = danger ? '#822f2f' : ''; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4200); }

$('#connect-form').addEventListener('submit', event => { event.preventDefault(); $('#connect-error').textContent = ''; const token = $('#token').value.trim(); if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { $('#connect-error').textContent = 'Enter the 43-character credential issued by the operator.'; return; } connect(token); });
$('#reveal-token').addEventListener('click', () => { const input = $('#token'), show = input.type === 'password'; input.type = show ? 'text' : 'password'; $('#reveal-token').textContent = show ? 'Hide' : 'Show'; $('#reveal-token').setAttribute('aria-label', show ? 'Hide credential' : 'Show credential'); });
$('#sign-out').addEventListener('click', () => logout('Signed out. The in-memory credential was cleared.'));
$('#report-form').addEventListener('submit', event => { event.preventDefault(); if(event.currentTarget.reportValidity()) loadReport(); });
$('#retry-load').addEventListener('click', loadAll); $('#menu').addEventListener('click', () => { const open = $('.sidebar').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', String(open)); });
$$('.nav-item').forEach(node => node.addEventListener('click', () => showView(node.dataset.view))); $$('[data-go]').forEach(node => node.addEventListener('click', () => showView(node.dataset.go))); $$('[data-open]').forEach(node => node.addEventListener('click', () => openModal(node.dataset.open)));
$('#close-modal').addEventListener('click', closeModal); $('#cancel-modal').addEventListener('click', closeModal); $('#record-form').addEventListener('submit', event => { event.preventDefault(); submitRecord(event.currentTarget); });
$('#modal-backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#modal-backdrop').hidden) closeModal(); if (event.key === 'Tab' && !$('#modal-backdrop').hidden) { const items = [...$('.modal').querySelectorAll('button,input,select')].filter(x => !x.disabled); if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); } else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); } } });
