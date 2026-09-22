import test from 'node:test';
import assert from 'node:assert/strict';
import { reportRange } from '../../src/analytics.js';

test('report range accepts leap-year 366-day and single-day cohorts', () => {
  assert.deepEqual(reportRange(new URLSearchParams('from=2024-01-01&to=2024-12-31')), {from:'2024-01-01',to:'2024-12-31'});
  assert.equal(reportRange(new URLSearchParams('from=2099-12-31&to=2099-12-31')).to,'2099-12-31');
});
test('report range rejects missing, duplicate, unknown, reversed and unbounded dates', () => {
  for (const query of ['', 'from=2024-01-01', 'from=2024-02-30&to=2024-03-01',
    'from=2024-01-02&to=2024-01-01', 'from=2024-01-01&to=2025-01-01',
    'from=2024-01-01&to=2024-01-01&from=2024-01-02',
    'from=2024-01-01&to=2024-01-01&clinic_id=other',
    'from=1999-12-31&to=2000-01-01']) {
    assert.throws(() => reportRange(new URLSearchParams(query)), {code:'invalid_request'});
  }
});
