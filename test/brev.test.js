'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const url = require('node:url');

// Funktionen ar en ES-modul, sa den importeras dynamiskt.
// Den har inga sidoeffekter vid import.
const modul = url.pathToFileURL(
  path.join(__dirname, '..', 'lib', 'brev.mjs')
).href;

let F;
test.before(async () => { F = await import(modul); });

const bestallning = {
  Namn: 'Anna Andersson',
  'Mejl eller telefon': 'anna@example.com',
  'Bräda': 'N:o 1. Ändträskärbräda i massiv ek',
  Pris: '1 650 kr',
  Meddelande: 'Går det att få den före jul?',
  _subject: 'Beställning: N:o 1',
  _gotcha: ''
};

/* ---------- raderna som listar vad kunden skickat ---------- */

test('raderna listar ifyllda falt men inte de interna', () => {
  const r = F.raderAv(bestallning);
  assert.match(r, /Namn: Anna Andersson/);
  assert.match(r, /Bräda: N:o 1\. Ändträskärbräda i massiv ek/);
  assert.match(r, /Pris: 1 650 kr/);
  assert.doesNotMatch(r, /_subject/, 'interna falt ska inte med');
  assert.doesNotMatch(r, /_gotcha/, 'honungsfallan ska inte med');
});

test('raderna hoppar over tomma falt', () => {
  const r = F.raderAv({ Namn: 'Anna', Meddelande: '', Pris: '100 kr' });
  assert.doesNotMatch(r, /Meddelande/);
  assert.match(r, /Namn: Anna/);
});

/* ---------- kundens bekraftelse ---------- */

test('bekraftelse skickas till kundens mejladress', () => {
  const b = F.kundbrev(bestallning, 'Avs <a@b.se>', 'sebastian@example.com');
  assert.deepEqual(b.to, ['anna@example.com']);
  assert.equal(b.from, 'Avs <a@b.se>');
});

test('svarsadressen ar Sebastians, inte avsandardomanen', () => {
  // bestallning@myrdahlstra.se kan skicka men inte ta emot, sa ett svar
  // dit skulle studsa
  const b = F.kundbrev(bestallning, 'Avs <a@b.se>', 'sebastian@example.com');
  assert.deepEqual(b.reply_to, ['sebastian@example.com']);
});

test('bekraftelsen aterger vad kunden skickat in', () => {
  const b = F.kundbrev(bestallning, 'Avs <a@b.se>', 's@e.se');
  assert.match(b.text, /Anna/, 'ska halsa pa kunden');
  assert.match(b.text, /N:o 1\. Ändträskärbräda i massiv ek/);
  assert.match(b.text, /1 650 kr/);
  assert.match(b.text, /Sebastian/, 'ska signeras');
});

test('bekraftelsen namner inte de interna falten', () => {
  const b = F.kundbrev(bestallning, 'Avs <a@b.se>', 's@e.se');
  assert.doesNotMatch(b.text, /_subject|_gotcha/);
});

test('ingen bekraftelse nar kunden lamnat telefonnummer i stallet', () => {
  const utan = { ...bestallning, 'Mejl eller telefon': '070 123 45 67' };
  assert.equal(F.kundbrev(utan, 'Avs <a@b.se>', 's@e.se'), null);
});

test('ingen bekraftelse nar kontaktfaltet ar skrap', () => {
  for (const v of ['', '   ', 'anna', 'anna@', '@example.com', 'anna example.com']) {
    const utan = { ...bestallning, 'Mejl eller telefon': v };
    assert.equal(F.kundbrev(utan, 'Avs <a@b.se>', 's@e.se'), null, 'gav brev for: "' + v + '"');
  }
});

test('bekraftelsen fungerar aven for konfiguratorns falt', () => {
  const forfragan = {
    Namn: 'Bo Bengtsson',
    'Mejl eller telefon': 'bo@example.com',
    Traslag: 'Massiv valnöt',
    Storlek: '60 × 40 cm',
    Saftranna: 'Med saftränna, plus 150 kr',
    Cirkapris: '3 050 kr'
  };
  const b = F.kundbrev(forfragan, 'Avs <a@b.se>', 's@e.se');
  assert.match(b.text, /Massiv valnöt/);
  assert.match(b.text, /60 × 40 cm/);
  assert.match(b.text, /3 050 kr/);
});

/* ---------- notisen till Sebastian ---------- */

test('notisen gar till Sebastian med kunden som svarsadress', () => {
  const n = F.notisbrev(bestallning, 'Avs <a@b.se>', 'sebastian@example.com');
  assert.deepEqual(n.to, ['sebastian@example.com']);
  assert.deepEqual(n.reply_to, ['anna@example.com'], 'svar ska ga till kunden');
  assert.equal(n.subject, 'Beställning: N:o 1');
});

test('notisen far ingen svarsadress nar kunden bara lamnat telefon', () => {
  const utan = { ...bestallning, 'Mejl eller telefon': '070 123 45 67' };
  const n = F.notisbrev(utan, 'Avs <a@b.se>', 's@e.se');
  assert.equal(n.reply_to, undefined);
  assert.match(n.text, /070 123 45 67/, 'telefonnummret ska anda med i texten');
});

test('notisen far ett standardamne nar formularet inte satt nagot', () => {
  const n = F.notisbrev({ Namn: 'A', 'Mejl eller telefon': 'a@b.se' }, 'Avs <a@b.se>', 's@e.se');
  assert.ok(n.subject && n.subject.length > 5);
});

test('bekraftelsen hoppar over rubriken nar det inte finns nagot att lista', () => {
  // Bara namn och kontakt, och bada utesluts ur sammanfattningen.
  // Da ska rubriken inte sta kvar och peka pa tomhet.
  const b = F.kundbrev(
    { Namn: 'Anna', 'Mejl eller telefon': 'anna@example.com' },
    'Avs <a@b.se>',
    's@e.se'
  );
  assert.doesNotMatch(b.text, /Det här kom in/, 'rubriken ska bort nar listan ar tom');
  assert.match(b.text, /Hej Anna/, 'halsningen ska finnas kvar');
  assert.match(b.text, /svarar personligen/, 'loftet ska finnas kvar');
  assert.doesNotMatch(b.text, /\n\n\n/, 'inga tomma hal i texten');
});

test('bekraftelsen har rubriken kvar nar det finns nagot att lista', () => {
  const b = F.kundbrev(
    { Namn: 'Anna', 'Mejl eller telefon': 'anna@example.com', 'Bräda': 'N:o 1' },
    'Avs <a@b.se>',
    's@e.se'
  );
  assert.match(b.text, /Det här kom in:/);
  assert.match(b.text, /Bräda: N:o 1/);
});
