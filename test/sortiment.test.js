'use strict';

const test = require('node:test');
const assert = require('node:assert');

const S = require('../lib/sortiment.js');

/* Bradorna nedan ar avskalade, bara det som sortimentslogiken tittar pa. */

const till_salu = { nr: 1, slug: 'a', sald: false };
const saldIdag = { nr: 2, slug: 'b', sald: true, saldDatum: '2026-09-07' };
const saldIForrgar = { nr: 3, slug: 'c', sald: true, saldDatum: '2026-09-05' };
const saldIFjol = { nr: 4, slug: 'd', sald: true, saldDatum: '2025-09-07' };

const IDAG = '2026-09-07';

/* ---------- datumtolkning ---------- */

test('datum tolkas som midnatt utc', () => {
  assert.equal(S.tillDygn('2026-09-07'), Date.UTC(2026, 8, 7));
  assert.equal(S.tillDygn('  2026-09-07  '), Date.UTC(2026, 8, 7));
});

test('trasiga datum ger null i stallet for ett slumpartat dygn', () => {
  assert.equal(S.tillDygn(''), null);
  assert.equal(S.tillDygn(null), null);
  assert.equal(S.tillDygn(undefined), null);
  assert.equal(S.tillDygn('7 september'), null);
  assert.equal(S.tillDygn('2026-9-7'), null, 'kraver tvasiffriga delar');
  assert.equal(S.tillDygn('2026-13-01'), null, 'manad 13 finns inte');
  assert.equal(S.tillDygn('2026-02-31'), null, 'februari har inte 31 dagar');
});

/* ---------- dagrakning ---------- */

test('dagar sedan salt raknas i hela dygn', () => {
  assert.equal(S.dagarSedanSald(saldIdag, IDAG), 0);
  assert.equal(S.dagarSedanSald(saldIForrgar, IDAG), 2);
  assert.equal(S.dagarSedanSald(saldIFjol, IDAG), 365);
});

test('dagar sedan salt ar null nar datum saknas', () => {
  assert.equal(S.dagarSedanSald({ sald: true }, IDAG), null);
});

test('dagar kvar raknar ned mot noll sista dagen', () => {
  assert.equal(S.dagarKvar(saldIdag, IDAG), 7);
  assert.equal(S.dagarKvar(saldIdag, '2026-09-13'), 1, 'sjatte dagen, en kvar');
  assert.equal(S.dagarKvar(saldIdag, '2026-09-14'), 0, 'sista dagen');
  assert.equal(S.dagarKvar(saldIdag, '2026-09-15'), -1, 'over tiden');
});

/* ---------- visningsfonstret ---------- */

test('en nyss sald brada visas', () => {
  assert.equal(S.visasAnnu(saldIdag, IDAG), true);
  assert.equal(S.visasAnnu(saldIForrgar, IDAG), true);
});

test('bandet sitter kvar hela veckan och faller darefter', () => {
  // Salsdagen ar dag noll, sa dag sex ar sista dagen med band.
  assert.equal(S.visasAnnu(saldIdag, '2026-09-13'), true, 'dag sex');
  assert.equal(S.visasAnnu(saldIdag, '2026-09-14'), false, 'dag sju');
  assert.equal(S.visasAnnu(saldIdag, '2027-01-01'), false);
});

test('en sald brada utan datum visas hellre an forsvinner tyst', () => {
  assert.equal(S.visasAnnu({ sald: true }, IDAG), true);
  assert.equal(S.visasAnnu({ sald: true, saldDatum: 'i somras' }, IDAG), true);
});

test('ett datum fram i tiden ar en felskrivning, inte ett skal att dolja', () => {
  assert.equal(S.visasAnnu({ sald: true, saldDatum: '2026-12-24' }, IDAG), true);
});

/* ---------- noindex ---------- */

test("en brada som gar att kopa ska alltid vara sokbar", () => {
  assert.equal(S.urKatalogen(till_salu, IDAG), false);
});

test("en sald brada ar sokbar hela sin vecka med bandet", () => {
  // Samma granser som visningsfonstret: sa lange bradan syns pa startsidan
  // ska den ga att hitta i Google, med sitt band och sitt overstrukna pris.
  assert.equal(S.urKatalogen(saldIdag, IDAG), false, "salsdagen");
  assert.equal(S.urKatalogen(saldIdag, "2026-09-13"), false, "dag sex");
});

test("en sald brada faller ur sokresultatet nar den faller ur katalogen", () => {
  assert.equal(S.urKatalogen(saldIdag, "2026-09-14"), true, "dag sju");
  assert.equal(S.urKatalogen(saldIFjol, IDAG), true);
});

test("en sald brada utan datum halls kvar, precis som i katalogen", () => {
  // visasAnnu visar hellre en gang for mycket an doljer tyst, och da ska
  // noindex inte ga sin egen vag och plocka bort sidan ur Google anda.
  assert.equal(S.urKatalogen({ sald: true }, IDAG), false);
  assert.equal(S.urKatalogen({ sald: true, saldDatum: "i somras" }, IDAG), false);
});

/* ---------- listorna ---------- */

const alla = [saldIFjol, saldIdag, till_salu, saldIForrgar];

test('till salu tar bara med osalda, sorterade pa nummer', () => {
  const ut = S.tillSalu([{ nr: 3, sald: false }, { nr: 1, sald: false }, saldIdag]);
  assert.deepEqual(ut.map((p) => p.nr), [1, 3]);
});

test('nyss salda tar med de som ligger inom veckan, sorterade pa nummer', () => {
  assert.deepEqual(S.nyssSalda(alla, IDAG).map((p) => p.nr), [2, 3]);
});

test('katalogen gar i nummerordning, oavsett vad som ar salt', () => {
  // Numret ar postens namn, sa sidan maste ga i samma ordning. En ny brada
  // med hogt nummer ska inte hoppa fore en aldre sald med lagre.
  assert.deepEqual(S.katalog(alla, IDAG).map((p) => p.nr), [1, 2, 3]);

  const blandat = [
    { nr: 7, sald: false },
    { nr: 2, sald: true, saldDatum: IDAG },
    { nr: 1, sald: false },
    { nr: 5, sald: true, saldDatum: IDAG }
  ];
  assert.deepEqual(S.katalog(blandat, IDAG).map((p) => p.nr), [1, 2, 5, 7]);
});

test('brador som varit salda lange faller ur bada listorna', () => {
  const nr = S.katalog(alla, IDAG).map((p) => p.nr);
  assert.ok(!nr.includes(4), 'N:o 4 saldes i fjol och ska inte visas');
});

test('listorna ror inte listan de fick in', () => {
  const in_ = [{ nr: 2, sald: false }, { nr: 1, sald: false }];
  S.katalog(in_, IDAG);
  assert.deepEqual(in_.map((p) => p.nr), [2, 1], 'ursprungsordningen ska sta kvar');
});

test('tom eller saknad lista ger tomma listor i stallet for krasch', () => {
  assert.deepEqual(S.tillSalu(null), []);
  assert.deepEqual(S.nyssSalda(undefined, IDAG), []);
  assert.deepEqual(S.katalog([], IDAG), []);
});

test('utan datumargument anvands dagens datum', () => {
  // Ett datum langt tillbaka ska vara ute ur fonstret oavsett nar testen kors.
  assert.equal(S.visasAnnu({ sald: true, saldDatum: '2020-01-01' }), false);
  assert.equal(S.visasAnnu({ sald: true, saldDatum: '2020-01-01' }, null), false);
});
