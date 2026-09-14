import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../src/config.js';
const base = { DATABASE_URL: 'postgres://user:pass@localhost/optometry' };
test('defaults to loopback and port 4000', () => assert.equal(config(base).host, '127.0.0.1'));
test('allows configured port and host', () => assert.equal(config({...base, PORT:'4400', HOST:'0.0.0.0'}).port, 4400));
for (const value of ['0', '-1', '65536', '2.2', 'abc', '']) {
  test(`rejects invalid port ${JSON.stringify(value)}`, () => assert.throws(() => config({...base, PORT:value}), /PORT/));
}
for (const value of [undefined, '', 'invalid', 'https://localhost/db', 'postgres://localhost/']) {
  test(`rejects database URL ${value}`, () => assert.throws(() => config({DATABASE_URL:value}), /DATABASE_URL/));
}
test('accepts postgresql scheme', () => assert.ok(config({DATABASE_URL:'postgresql://localhost/db'})));
