import test from 'node:test';
import assert from 'node:assert/strict';
import { dateOnly, instant, interval, timezone, version, object, pagination } from '../../src/validation.js';

test('accepts leap day and rejects normalized impossible dates', () => {
  assert.equal(dateOnly('2028-02-29'), '2028-02-29');
  for (const value of ['2029-02-29', '2030-02-31', '2030-13-01', '2030-00-01', '30-01-01', null]) assert.throws(() => dateOnly(value));
});
test('timestamps require seconds, explicit offset and a valid calendar date', () => {
  for (const value of ['2030-01-01T10:00:00Z', '2030-01-01T10:00:00-08:00']) assert.equal(instant(value), value);
  for (const value of ['2030-01-01T10:00:00', '2030-02-30T10:00:00Z', '2030-01-01T24:00:00Z', '2030-01-01T10:00:00+14:59']) assert.throws(() => instant(value));
});
test('intervals compare instants and reject zero, negative and over-eight-hour bookings', () => {
  interval('2030-01-01T10:00:00Z', '2030-01-01T12:00:00+01:00');
  for (const end of ['2030-01-01T10:00:00Z', '2030-01-01T09:00:00Z', '2030-01-01T19:00:00Z']) assert.throws(() => interval('2030-01-01T10:00:00Z', end));
});
test('timezone labels use supported IANA-style names', () => {
  for (const value of ['UTC', 'America/Vancouver', 'Asia/Tbilisi']) assert.equal(timezone(value), value);
  for (const value of ['Vancouver', 'Mars/Clinic', '+04:00', null]) assert.throws(() => timezone(value));
});
test('strict objects reject tenant injection, null, arrays and missing fields', () => {
  for (const value of [null, [], {}, { name: 'Demo', clinic_id: 'foreign' }]) assert.throws(() => object(value, ['name']));
});
test('versions are bounded positive integers', () => {
  assert.equal(version(1), 1);
  for (const value of [0, -1, 1.5, '1', 2147483647]) assert.throws(() => version(value));
});
test('pagination is bounded and rejects duplicates and unknown filters', () => {
  assert.deepEqual(pagination(new URLSearchParams()), { limit: 50, offset: 0 });
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'limit=1&limit=2', 'clinic_id=other', 'offset=100001']) assert.throws(() => pagination(new URLSearchParams(query)));
});
