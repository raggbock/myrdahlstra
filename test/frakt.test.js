'use strict';

const test = require('node:test');
const assert = require('node:assert');

const F = require('../lib/frakt.js');

const SITE = { fraktLiten: 189, fraktStor: 249, fraktGrans: '45 × 30 cm' };

const brada = (mattText, extra) => ({ spec: { 'Mått': mattText }, ...(extra || {}) });

/* ---------- mattolkning ---------- */

test('matt laser de tva forsta talen och lagger langsta sidan forst', () => {
  assert.deepEqual(F.matt('43,5 × 27 × 3,8 cm'), [43.5, 27]);
  assert.deepEqual(F.matt('45 × 30 cm'), [45, 30]);
  assert.deepEqual(F.matt('30 x 45'), [45, 30], 'liggande eller staende spelar ingen roll');
  assert.deepEqual(F.matt('34 × 34 cm'), [34, 34]);
});

test('text utan matt ger null i stallet for en gissning', () => {
  assert.equal(F.matt(''), null);
  assert.equal(F.matt(null), null);
  assert.equal(F.matt(undefined), null);
  assert.equal(F.matt('stor bräda'), null);
  assert.equal(F.matt('0 × 30'), null);
});

/* ---------- niva ---------- */

test('en brada som ryms inom gransen gar som liten', () => {
  assert.equal(F.niva(brada('43,5 × 27 × 3,8 cm'), SITE.fraktGrans), 'liten');
  assert.equal(F.niva(brada('45 × 24 × 4 cm'), SITE.fraktGrans), 'liten');
  assert.equal(F.niva(brada('45 × 30 cm'), SITE.fraktGrans), 'liten', 'precis pa gransen ar inte storre an');
});

test('en brada som sticker ut pa nagon sida gar som stor', () => {
  assert.equal(F.niva(brada('50 × 32 × 4 cm'), SITE.fraktGrans), 'stor');
  assert.equal(F.niva(brada('36 × 31 × 4 cm'), SITE.fraktGrans), 'stor', 'bredare an 30 aven om den ar kort');
  assert.equal(F.niva(brada('34 × 34 cm'), SITE.fraktGrans), 'stor');
});

test('ett utsatt frakt-falt pa posten gar fore mattet', () => {
  assert.equal(F.niva(brada('36 × 31 × 4 cm', { frakt: 'liten' }), SITE.fraktGrans), 'liten');
  assert.equal(F.niva(brada('40 × 26 cm', { frakt: 'stor' }), SITE.fraktGrans), 'stor');
  assert.equal(F.niva(brada('36 × 31 cm', { frakt: 'mellan' }), SITE.fraktGrans), 'stor', 'okant varde ignoreras');
});

test('utan matt och utan falt ar nivan okand', () => {
  assert.equal(F.niva({ spec: {} }, SITE.fraktGrans), null);
  assert.equal(F.niva({}, SITE.fraktGrans), null);
  assert.equal(F.niva(brada('40 × 26 cm'), ''), null, 'gransen saknas');
});

/* ---------- belopp ---------- */

test('beloppet hamtas ur site.json efter nivan', () => {
  assert.equal(F.belopp(brada('43,5 × 27 cm'), SITE), 189);
  assert.equal(F.belopp(brada('50 × 32 cm'), SITE), 249);
  assert.equal(F.belopp({ spec: {} }, SITE), null);
});
