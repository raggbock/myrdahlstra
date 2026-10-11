'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../lib/omdomen.js');

const lista = [
  { id: 1, mal: 'bestallning', betyg: 5, namn: 'Karin', ort: 'Västerås', text: 'Mycket fin.', datum: '2026-09-02' },
  { id: 2, mal: 'ek-1', betyg: 4, namn: 'Per', ort: '', text: 'Bra bräda.', datum: '2026-10-01' },
  { id: 3, mal: 'bestallning', betyg: 4, namn: 'Lena', ort: 'Örebro', text: 'Som beställt.', datum: '2026-10-05' },
  { id: 4, mal: 'bestallning', betyg: 5, namn: 'Ali', ort: '', text: 'Samma dag.', datum: '2026-10-05' }
];

test('omdömen för ett mål, nyaste först och högst id först samma dag', () => {
  assert.deepEqual(O.omdomenFor(lista, 'bestallning').map((o) => o.id), [4, 3, 1]);
  assert.deepEqual(O.omdomenFor(lista, 'saknas'), []);
  assert.deepEqual(O.omdomenFor(undefined, 'bestallning'), []);
});

test('snitt och antal', () => {
  assert.deepEqual(O.betygssnitt(O.omdomenFor(lista, 'bestallning')), { antal: 3, snitt: 4.7 });
  assert.deepEqual(O.betygssnitt([]), { antal: 0, snitt: null });
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

test('strukturerad data med betyg och varje omdöme, eller ingenting', () => {
  const d = O.strukturerat(O.omdomenFor(lista, 'bestallning'));
  assert.deepEqual(d.aggregateRating, {
    '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 3, bestRating: 5, worstRating: 1
  });
  assert.equal(d.review.length, 3);
  assert.deepEqual(d.review[0], {
    '@type': 'Review',
    reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 },
    author: { '@type': 'Person', name: 'Ali' },
    datePublished: '2026-10-05',
    reviewBody: 'Samma dag.'
  });
  assert.equal(O.strukturerat([]), null);
});

test('JSON till ett script-block kan inte avsluta blocket', () => {
  const ut = O.jsonld({ text: '</script><script>alert(1)</script> & <b>' });
  assert.doesNotMatch(ut, /<|>/);
  assert.deepEqual(JSON.parse(ut), { text: '</script><script>alert(1)</script> & <b>' });
});
