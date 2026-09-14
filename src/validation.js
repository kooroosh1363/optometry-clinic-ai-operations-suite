export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const invalid = () => { throw new ApiError(400, 'invalid_request'); };
export function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (required.some(key => !Object.hasOwn(value, key))) invalid();
  if (Object.keys(value).some(key => ![...required, ...optional].includes(key))) invalid();
  return value;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid();
  return value.toLowerCase();
}
export function name(value) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) invalid();
  return value.trim();
}
export function dateOnly(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) invalid();
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) invalid();
  return value;
}
export function instant(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)) invalid();
  dateOnly(value.slice(0, 10));
  if (/[+-]14:(?!00)/.test(value) || !Number.isFinite(Date.parse(value))) invalid();
  return value;
}
export function interval(start, end) {
  instant(start); instant(end);
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0 || duration > 8 * 60 * 60 * 1000) invalid();
}
export function version(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value >= 2147483647) invalid();
  return value;
}
export function timezone(value) {
  // IANA-style names (plus UTC); do not accept offset-only identifiers.
  if (typeof value !== 'string' || !(value === 'UTC' || /^[A-Za-z_]+\/[A-Za-z_+\-/]+$/.test(value))) invalid();
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { invalid(); }
  return value;
}
export function pagination(params) {
  for (const key of params.keys()) if (!['limit', 'offset'].includes(key) || params.getAll(key).length !== 1) invalid();
  const parse = (key, fallback, max) => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    if (!/^(0|[1-9]\d{0,5})$/.test(raw) || Number(raw) > max) invalid();
    return Number(raw);
  };
  const limit = parse('limit', 50, 100), offset = parse('offset', 0, 100000);
  if (!limit) invalid();
  return { limit, offset };
}
