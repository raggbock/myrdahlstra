'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/omdomen.js');

const lista = [
  { id: 1, betyg: 5, namn: 'Karin', ort: 'Västerås', text: 'Mycket fin.', datum: '2026-09-02' },
  { id: 2, betyg: 4, namn: 'Per', ort: '', text: 'Bra bräda.', datum: '2026-10-01' },
  { id: 3, betyg: 4, namn: 'Lena', ort: 'Örebro', text: 'Som beställt.', datum: '2026-10-05' },
  { id: 4, betyg: 5, namn: 'Ali', ort: '', text: 'Samma dag.', datum: '2026-10-05' }
];

test('urvalet är de nyaste, och högst id först samma dag', () => {
  assert.deepEqual(O.urval(lista).map((o) => o.id), [4, 3, 2, 1]);
  assert.deepEqual(O.urval(undefined), []);
});

test('urvalet ändrar inte ordningen i listan det fick', () => {
  const kopia = lista.slice();
  O.urval(kopia);
  assert.deepEqual(kopia.map((o) => o.id), [1, 2, 3, 4]);
});

test('högst sex, och urvalet bryr sig inte om betyget', () => {
  const manga = [];
  for (let i = 1; i <= 8; i += 1) {
    // Det nyaste har lägst betyg. Det ska ändå komma först.
    manga.push({ id: i, betyg: i === 8 ? 1 : 5, namn: 'K' + i, ort: '', text: 'T', datum: '2026-10-' + String(10 + i) });
  }
  assert.equal(O.PA_SIDAN, 6);
  assert.deepEqual(O.urval(manga).map((o) => o.id), [8, 7, 6, 5, 4, 3]);
  assert.equal(O.urval(manga)[0].betyg, 1);
});

test('snitt och antal räknas på alla omdömen', () => {
  assert.deepEqual(O.betygssnitt(lista), { antal: 4, snitt: 4.5 });
  assert.deepEqual(O.betygssnitt([]), { antal: 0, snitt: null });
  assert.deepEqual(O.betygssnitt(undefined), { antal: 0, snitt: null });
});

test('betyg skrivs med decimalkomma och utan onödig decimal', () => {
  assert.equal(O.betygText(4.7), '4,7');
  assert.equal(O.betygText(5), '5');
});

test('månad och år på svenska', () => {
  assert.equal(O.manad('2026-10-14'), 'oktober 2026');
  assert.equal(O.manad('2027-01-01'), 'januari 2027');
  assert.equal(O.manad('trasigt'), '');
});
