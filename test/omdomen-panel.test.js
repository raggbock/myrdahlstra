'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const O = require('../verktyg/omdomen.js');

const produkter = [
  { nr: 3, slug: 'ek-tre', titel: 'Ek tre' },
  { nr: 1, slug: 'ek-ett', titel: 'Ek ett' }
];

test('en kod är tolv tecken som går att skriva i en adress', () => {
  const koder = new Set(Array.from({ length: 200 }, O.nyKod));
  assert.equal(koder.size, 200);
  for (const k of koder) assert.match(k, O.KOD);
});

test('mål: beställningssidan först, sedan brädorna i nummerordning', () => {
  assert.deepEqual(O.malLista(produkter), [
    { mal: 'bestallning', namn: 'Efter mått (beställningssidan)' },
    { mal: 'ek-ett', namn: 'N:o 1. Ek ett' },
    { mal: 'ek-tre', namn: 'N:o 3. Ek tre' }
  ]);
  assert.equal(O.giltigtMal('ek-tre', produkter), true);
  assert.equal(O.giltigtMal('bestallning', produkter), true);
  assert.equal(O.giltigtMal("x'; DROP TABLE omdome;--", produkter), false);
});

test('ett publicerat omdöme läggs till en gång, även om det publiceras igen', () => {
  const rad = { id: 7, kod: 'AAAAAAAAAAAA', mal: 'ek-ett', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', dag: '2026-10-03' };
  const en = O.medOmdome([], rad);
  assert.deepEqual(en, [{ id: 7, mal: 'ek-ett', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', datum: '2026-10-03' }]);
  assert.equal(O.medOmdome(en, rad), en);
  assert.deepEqual(O.utanOmdome(en, 7), []);
});

test('filen: saknas den är listan tom, och fel innehåll stoppas', () => {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'omdomen-'));
  assert.deepEqual(O.las(path.join(mapp, 'saknas.json')), []);
  fs.writeFileSync(path.join(mapp, 'fel.json'), '{"a":1}');
  assert.throws(() => O.las(path.join(mapp, 'fel.json')), /lista/);
  fs.rmSync(mapp, { recursive: true, force: true });
});

test('SQL-värden citeras', () => {
  assert.equal(O.sql("O'Brien"), "'O''Brien'");
  assert.equal(O.sql(12), '12');
  assert.throws(() => O.sql(1.5));
});

test('länken till skrivsidan', () => {
  assert.equal(O.lank('https://myrdahlstra.se', 'Ab3_-xYz9Q0w'), 'https://myrdahlstra.se/omdome/#Ab3_-xYz9Q0w');
});
