const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { token: '', me: null, patients: [], staff: [], appointments: [], recalls: [], view: 'overview', modal: null };
const titles = { overview: 'Good morning', appointments: 'Appointment schedule', patients: 'Patient directory', recalls: 'Recall queue' };
const errorText = {
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
  const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${state.token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  let payload = {};
  try { payload = await response.json(); } catch { /* A proxy failure may have no JSON body. */ }
  if (!response.ok) { const error = new Error(message(payload.error)); error.code = payload.error; error.status = response.status; throw error; }
  return payload;
}
async function connect(token) {
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
      const warning = $('#timezone-warning'); warning.textContent = `Clinic times display in ${state.me.timezone}. New booking fields use your device zone (${browserZone}); verify the converted time before saving.`; warning.hidden = false;
    }
    await loadAll();
  } catch (error) {
    state.token = ''; state.me = null;
    $('#connect-error').textContent = message(error.code, error.message);
    $('#token').focus();
  }
}
function logout(reason = '') {
  state.token = ''; state.me = null; state.patients = []; state.staff = []; state.appointments = []; state.recalls = [];
  $('#app-view').hidden = true; $('#connect-view').hidden = false; $('#token').value = ''; $('#timezone-warning').hidden = true;
  if (reason) $('#connect-error').textContent = reason;
  $('#token').focus();
}
async function loadAll() {
  $('#loading').hidden = false; $('#global-error').hidden = true; $$('.view').forEach(v => v.hidden = true);
  try {
    const [patients, staff, appointments, recalls] = await Promise.all(['/v1/patients?limit=100', '/v1/staff?limit=100', '/v1/appointments?limit=100', '/v1/recalls?limit=100'].map(api));
    state.patients = patients.data; state.staff = staff.data; state.appointments = appointments.data; state.recalls = recalls.data;
    render(); $('#loading').hidden = true; showView(state.view);
  } catch (error) {
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
  renderOverview(); renderAppointments(); renderPatients(); renderRecalls();
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
  state.patients.forEach(item => { const card = el('article', 'patient-card'), icon = el('span', 'patient-initials', initials(item.display_name)), info = el('div'); info.append(el('strong', '', item.display_name), el('small', '', item.contact_email || 'No contact email'), el('small', '', item.messaging_consent ? 'Messaging consent recorded' : 'No messaging consent')); card.append(icon, info); grid.append(card); });
}
function renderRecalls() {
  const list = $('#recalls-list'); clear(list); $('#recalls-empty').hidden = state.recalls.length > 0;
  [...state.recalls].sort((a, b) => a.due_date.localeCompare(b.due_date)).forEach(item => {
    const card = el('article', 'recall-card'), info = el('div'); info.append(el('strong', '', person(item.patient_id)), el('small', '', `Due ${item.due_date} · manual follow-up`)); card.append(info, statusBadge(item.status));
    const allowed = item.status === 'pending' ? ['contacted', 'closed'] : item.status === 'contacted' ? ['closed'] : [];
    if (allowed.length && state.me.role !== 'optometrist') { const select = el('select', 'action-select'); select.setAttribute('aria-label', `Change recall status for ${person(item.patient_id)}`); select.append(new Option('Update…', '')); allowed.forEach(value => select.append(new Option(value, value))); select.addEventListener('change', () => updateStatus('recalls', item, select.value)); card.append(select); }
    list.append(card);
  });
}
async function updateStatus(collection, item, status) {
  if (!status) return;
  try { await api(`/v1/${collection}/${item.id}`, { method: 'PATCH', body: JSON.stringify({ version: item.version, status }) }); showToast('Status updated.'); await loadAll(); }
  catch (error) { showToast(message(error.code, error.message), true); if (['version_conflict', 'invalid_transition'].includes(error.code)) await loadAll(); if (error.status === 401) logout(message('unauthorized')); }
}
function showView(view) {
  state.view = view; $$('.view').forEach(node => node.hidden = node.id !== view); $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
  $('#view-title').textContent = titles[view]; $('.sidebar').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false'); $('#workspace').focus();
}
function field(name, label, type = 'text', extra = '') { return `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" ${extra} required></div>`; }
function selectField(name, label, options) { return `<div class="field"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" required><option value="">Select…</option>${options.map(o => `<option value="${o.id}"></option>`).join('')}</select></div>`; }
function openModal(type) {
  state.modal = type; const fields = $('#form-fields');
  const titlesMap = { patient: 'Add patient', appointment: 'Book appointment', recall: 'Add recall' }; $('#modal-title').textContent = titlesMap[type];
  if (type === 'patient') fields.innerHTML = field('display_name', 'Display name') + field('contact_email', 'Contact email (optional)', 'email', 'required=""');
  if (type === 'appointment') fields.innerHTML = selectField('patient_id', 'Patient', state.patients) + selectField('practitioner_id', 'Optometrist', state.staff.filter(s => s.role === 'optometrist' && s.active)) + `<div class="field-grid">${field('starts_at', 'Starts', 'datetime-local')}${field('ends_at', 'Ends', 'datetime-local')}</div><p class="field-help">Times use your device timezone and are converted to an explicit instant.</p>`;
  if (type === 'recall') fields.innerHTML = selectField('patient_id', 'Patient', state.patients) + field('due_date', 'Due date', 'date');
  fields.querySelectorAll('select').forEach(select => { const source = select.name === 'patient_id' ? state.patients : state.staff.filter(s => s.role === 'optometrist' && s.active); [...select.options].slice(1).forEach((option, index) => option.textContent = source[index].display_name); });
  if (type === 'patient') $('#field-contact_email').required = false;
  $('#form-error').textContent = ''; $('#record-form').reset(); $('#modal-backdrop').hidden = false; document.body.style.overflow = 'hidden'; fields.querySelector('input,select').focus();
}
function closeModal() { $('#modal-backdrop').hidden = true; document.body.style.overflow = ''; state.modal = null; document.querySelector(`[data-open]`)?.focus(); }
async function submitRecord(form) {
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form)); let path = `/v1/${state.modal === 'patient' ? 'patients' : state.modal === 'appointment' ? 'appointments' : 'recalls'}`;
  if (state.modal === 'patient' && !values.contact_email) delete values.contact_email;
  if (state.modal === 'appointment') { values.starts_at = new Date(values.starts_at).toISOString().replace('.000Z', 'Z'); values.ends_at = new Date(values.ends_at).toISOString().replace('.000Z', 'Z'); }
  const button = $('#save-record'); button.disabled = true; button.textContent = 'Saving…';
  try { const savedType = state.modal; await api(path, { method: 'POST', body: JSON.stringify(values) }); closeModal(); showToast(`${savedType === 'patient' ? 'Patient' : savedType === 'appointment' ? 'Appointment' : 'Recall'} saved.`); await loadAll(); }
  catch (error) { if (error.status === 401) { closeModal(); return logout(message('unauthorized')); } $('#form-error').textContent = message(error.code, error.message); }
  finally { button.disabled = false; button.textContent = 'Save'; }
}
let toastTimer;
function showToast(text, danger = false) { const toast = $('#toast'); toast.textContent = text; toast.style.background = danger ? '#822f2f' : ''; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4200); }

$('#connect-form').addEventListener('submit', event => { event.preventDefault(); $('#connect-error').textContent = ''; const token = $('#token').value.trim(); if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { $('#connect-error').textContent = 'Enter the 43-character credential issued by the operator.'; return; } connect(token); });
$('#reveal-token').addEventListener('click', () => { const input = $('#token'), show = input.type === 'password'; input.type = show ? 'text' : 'password'; $('#reveal-token').textContent = show ? 'Hide' : 'Show'; $('#reveal-token').setAttribute('aria-label', show ? 'Hide credential' : 'Show credential'); });
$('#sign-out').addEventListener('click', () => logout('Signed out. The in-memory credential was cleared.'));
$('#retry-load').addEventListener('click', loadAll); $('#menu').addEventListener('click', () => { const open = $('.sidebar').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', String(open)); });
$$('.nav-item').forEach(node => node.addEventListener('click', () => showView(node.dataset.view))); $$('[data-go]').forEach(node => node.addEventListener('click', () => showView(node.dataset.go))); $$('[data-open]').forEach(node => node.addEventListener('click', () => openModal(node.dataset.open)));
$('#close-modal').addEventListener('click', closeModal); $('#cancel-modal').addEventListener('click', closeModal); $('#record-form').addEventListener('submit', event => { event.preventDefault(); submitRecord(event.currentTarget); });
$('#modal-backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#modal-backdrop').hidden) closeModal(); if (event.key === 'Tab' && !$('#modal-backdrop').hidden) { const items = [...$('.modal').querySelectorAll('button,input,select')].filter(x => !x.disabled); if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); } else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); } } });
