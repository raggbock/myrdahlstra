'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { julrad } = require('../lib/jul.js');

test('raden syns fore sista dagen, med datumet i klartext', () => {
  assert.deepEqual(julrad('2026-11-14', '2026-10-14'), { datum: '14 november' });
});

test('raden syns hela sista dagen', () => {
  assert.deepEqual(julrad('2026-11-14', '2026-11-14'), { datum: '14 november' });
});

test('dagen efter ar raden borta', () => {
  assert.equal(julrad('2026-11-14', '2026-11-15'), null);
  assert.equal(julrad('2026-11-14', '2026-12-24'), null);
});

test('forsta dagen i manaden skrivs utan nolla', () => {
  assert.deepEqual(julrad('2026-12-01', '2026-11-01'), { datum: '1 december' });
});

test('tomt eller trasigt datum ger ingen rad', () => {
  assert.equal(julrad('', '2026-10-14'), null);
  assert.equal(julrad(undefined, '2026-10-14'), null);
  assert.equal(julrad('14 november', '2026-10-14'), null);
  assert.equal(julrad('2026-11-31', '2026-10-14'), null);
});
