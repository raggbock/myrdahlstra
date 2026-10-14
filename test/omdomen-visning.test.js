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

/* ---------- startsidans ruta med omdömen om sålda brädor ---------- */

const produkter = [
  { nr: 1, slug: 'ek-1', titel: 'Bräda i ek', sald: false },
  { nr: 2, slug: 'tre-traslag', titel: 'Bräda i tre träslag', sald: true, saldDatum: '2026-09-07' },
  { nr: 5, slug: 'langtra', titel: 'Långträbräda', sald: true, saldDatum: '2026-09-07' }
];

test('bara omdömen om sålda brädor, med brädans nummer och namn', () => {
  const salda = O.omSalda([
    ...lista,
    { id: 5, mal: 'tre-traslag', betyg: 5, namn: 'Eva', ort: 'Örebro', text: 'Vacker.', datum: '2026-10-10' }
  ], produkter);
  assert.equal(salda.length, 1, 'beställningssidans och osålda brädors omdömen ska inte med');
  assert.equal(salda[0].id, 5);
  assert.deepEqual(salda[0].brada, { nr: 2, slug: 'tre-traslag', titel: 'Bräda i tre träslag' });
  assert.equal(salda[0].text, 'Vacker.');
});

test('ett omdöme vars bräda tagits bort ur sortimentet hoppas över', () => {
  const borta = [{ id: 9, mal: 'finns-inte', betyg: 5, namn: 'Ola', ort: '', text: 'Fin.', datum: '2026-10-10' }];
  assert.deepEqual(O.omSalda(borta, produkter), []);
  assert.deepEqual(O.omSalda(undefined, produkter), []);
  assert.deepEqual(O.omSalda(borta, undefined), []);
});

test('nyaste först, högst sex, och urvalet bryr sig inte om betyget', () => {
  const manga = [];
  for (let i = 1; i <= 8; i += 1) {
    // Det nyaste har lägst betyg. Det ska ändå komma först.
    manga.push({ id: i, mal: i % 2 ? 'tre-traslag' : 'langtra', betyg: i === 8 ? 1 : 5, namn: 'K' + i, ort: '', text: 'T', datum: '2026-10-' + String(10 + i) });
  }
  const salda = O.omSalda(manga, produkter);
  assert.equal(O.PA_STARTSIDAN, 6);
  assert.deepEqual(salda.map((o) => o.id), [8, 7, 6, 5, 4, 3]);
  assert.equal(salda[0].betyg, 1);
});
