'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const P = require('../verktyg/produkter.js');

/* ---------- adress fran titel ---------- */

test('adress oversatter svenska tecken', () => {
  assert.equal(P.tillSlug('Ändträskärbräda i massiv ek'), 'andtraskarbrada-i-massiv-ek');
  assert.equal(P.tillSlug('Långträbräda med valnötskant'), 'langtrabrada-med-valnotskant');
  assert.equal(P.tillSlug('Skärbräda i ÖSTERGÖTLAND'), 'skarbrada-i-ostergotland');
});

test('adress tar bort tecken som inte hor i en url', () => {
  assert.equal(P.tillSlug('Bräda, 45 × 32 cm (stor)'), 'brada-45-32-cm-stor');
  assert.equal(P.tillSlug('Ek & valnöt'), 'ek-valnot');
  assert.equal(P.tillSlug('  dubbla   mellanslag  '), 'dubbla-mellanslag');
});

test('adress blir aldrig tom eller full av bindestreck', () => {
  assert.equal(P.tillSlug('!!!'), 'brada');
  assert.equal(P.tillSlug(''), 'brada');
  assert.equal(P.tillSlug('---a---'), 'a');
});

/* ---------- mattstrangen ---------- */

test('mattstrang med tjocklek', () => {
  assert.equal(P.tillMatt('45', '32', '3,8'), '45 × 32 × 3,8 cm');
  assert.equal(P.tillMatt(45, 32, 3.8), '45 × 32 × 3,8 cm');
});

test('mattstrang utan tjocklek', () => {
  assert.equal(P.tillMatt('40', '28', ''), '40 × 28 cm');
  assert.equal(P.tillMatt('40', '28', null), '40 × 28 cm');
});

test('mattstrang blir tom nar langd eller bredd saknas', () => {
  assert.equal(P.tillMatt('', '28', '2'), '');
  assert.equal(P.tillMatt('40', '', '2'), '');
});

test('mattstrang anvander decimalkomma, aldrig punkt', () => {
  assert.equal(P.tillMatt('45,5', '32', '3.8'), '45,5 × 32 × 3,8 cm');
});

/* ---------- validering ---------- */

const giltig = { nr: 7, slug: 'ny-brada', titel: 'Ny bräda', pris: 900 };

test('en giltig brada ger inga fel', () => {
  assert.deepEqual(P.validera(giltig, []), []);
});

test('titel maste finnas', () => {
  const fel = P.validera({ ...giltig, titel: '   ' }, []);
  assert.equal(fel.length, 1);
  assert.match(fel[0], /titel/i);
});

test('pris maste vara ett positivt heltal', () => {
  assert.match(P.validera({ ...giltig, pris: 0 }, [])[0], /pris/i);
  assert.match(P.validera({ ...giltig, pris: -5 }, [])[0], /pris/i);
  assert.match(P.validera({ ...giltig, pris: 12.5 }, [])[0], /pris/i);
  assert.match(P.validera({ ...giltig, pris: 'nio' }, [])[0], /pris/i);
});

test('nr och slug maste vara unika mot ovriga brador', () => {
  const ovriga = [{ nr: 7, slug: 'annan' }];
  assert.match(P.validera(giltig, ovriga)[0], /N:o/);

  const ovriga2 = [{ nr: 1, slug: 'ny-brada' }];
  assert.match(P.validera(giltig, ovriga2)[0], /adress/i);
});

test('samma brada krockar inte med sig sjalv vid redigering', () => {
  const alla = [giltig];
  assert.deepEqual(P.validera(giltig, alla.filter((_, i) => i !== 0)), []);
});

test('slug maste vara url-saker', () => {
  assert.match(P.validera({ ...giltig, slug: 'Med Mellanslag' }, [])[0], /adress/i);
  assert.match(P.validera({ ...giltig, slug: 'åäö' }, [])[0], /adress/i);
});

test('flera fel rapporteras samtidigt', () => {
  const fel = P.validera({ nr: 7, slug: 'ÅÄÖ', titel: '', pris: -1 }, []);
  assert.ok(fel.length >= 3, 'forvantade minst tre fel, fick ' + fel.length);
});

/* ---------- las och skriv ---------- */

function tempfil() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'myrdahl-'));
  return path.join(d, 'products.json');
}

test('skriv och las ger tillbaka samma data', () => {
  const f = tempfil();
  const data = [{ nr: 1, slug: 'a', titel: 'Ä', pris: 100 }];
  P.skriv(f, data);
  assert.deepEqual(P.las(f), data);
});

test('skriv sparar foregaende version som .bak', () => {
  const f = tempfil();
  P.skriv(f, [{ nr: 1, slug: 'forst', titel: 'Först', pris: 100 }]);
  P.skriv(f, [{ nr: 2, slug: 'sedan', titel: 'Sedan', pris: 200 }]);

  assert.equal(P.las(f)[0].slug, 'sedan');
  assert.equal(P.las(f + '.bak')[0].slug, 'forst', 'backupen ska ha foregaende version');
});

test('skriv lamnar ingen temporarfil kvar', () => {
  const f = tempfil();
  P.skriv(f, [{ nr: 1, slug: 'a', titel: 'A', pris: 100 }]);
  const kvar = fs.readdirSync(path.dirname(f)).filter((n) => n.includes('tmp'));
  assert.deepEqual(kvar, []);
});

test('las pa saknad fil ger tom lista i stallet for krasch', () => {
  assert.deepEqual(P.las(tempfil()), []);
});

test('skriven fil ar lasbar json med radbrytning sist', () => {
  const f = tempfil();
  P.skriv(f, [{ nr: 1, slug: 'a', titel: 'Ändträ', pris: 100 }]);
  const text = fs.readFileSync(f, 'utf8');
  assert.ok(text.endsWith('\n'), 'filen ska sluta med radbrytning');
  assert.ok(text.includes('Ändträ'), 'svenska tecken ska sparas som utf-8');
  assert.doesNotThrow(() => JSON.parse(text));
});

/* ---------- numrering ---------- */

test('nasta lediga nummer ar ett hogre an hogsta', () => {
  assert.equal(P.nastaNr([{ nr: 1 }, { nr: 5 }, { nr: 3 }]), 6);
  assert.equal(P.nastaNr([]), 1);
});

test('numrera om ger loptande nummer fran ett', () => {
  const ut = P.numreraOm([{ nr: 4, slug: 'a' }, { nr: 9, slug: 'b' }, { nr: 2, slug: 'c' }]);
  assert.deepEqual(ut.map((x) => x.nr), [1, 2, 3]);
  assert.deepEqual(ut.map((x) => x.slug), ['a', 'b', 'c'], 'ordningen ska behallas');
});
