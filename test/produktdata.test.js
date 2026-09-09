'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../verktyg/produkter.js');
const S = require('../lib/sortiment.js');

/*
 * Sortimentet i src/_data/products.json. Filen skrivs av verkstadspanelen men
 * gar ocksa att redigera for hand, och da finns ingen validering emellan. De
 * har testen ar det natet.
 */

const ROT = path.join(__dirname, '..');
const PRODUKTER = P.las(path.join(ROT, 'src', '_data', 'products.json'));
const FOTOMAPP = path.join(ROT, 'assets', 'foto');

test('sortimentet ar inte tomt', () => {
  assert.ok(PRODUKTER.length > 0, 'products.json ska innehalla bradar');
});

test('varje brada klarar samma validering som panelen kraver', () => {
  for (const b of PRODUKTER) {
    const ovriga = PRODUKTER.filter((x) => x.nr !== b.nr);
    assert.deepEqual(P.validera(b, ovriga, b.nr), [], 'N:o ' + b.nr + ' ' + b.titel);
  }
});

test('nummer och adresser ar unika', () => {
  assert.equal(new Set(PRODUKTER.map((b) => b.nr)).size, PRODUKTER.length, 'tva bradar delar nummer');
  assert.equal(new Set(PRODUKTER.map((b) => b.slug)).size, PRODUKTER.length, 'tva bradar delar adress');
});

test('varje brada har text att visa i katalogen', () => {
  for (const b of PRODUKTER) {
    assert.ok(String(b.kort || '').trim(), 'N:o ' + b.nr + ' saknar kort text till katalogkortet');
    assert.ok(String(b.beskrivning || '').trim(), 'N:o ' + b.nr + ' saknar beskrivning');
    assert.ok(b.spec && Object.keys(b.spec).length > 0, 'N:o ' + b.nr + ' saknar spec');
  }
});

test('varje foto som pekas ut finns pa disk', () => {
  for (const b of PRODUKTER) {
    for (const bild of b.bilder || []) {
      assert.ok(
        fs.existsSync(path.join(FOTOMAPP, bild)),
        'N:o ' + b.nr + ' pekar pa ' + bild + ' som inte finns i assets/foto'
      );
    }
  }
});

test('en sald brada har ett datum, annars blir bandet kvar for alltid', () => {
  for (const b of PRODUKTER) {
    if (b.sald) {
      assert.notEqual(S.tillDygn(b.saldDatum), null, 'N:o ' + b.nr + ' ar sald men saknar giltigt saldDatum');
    }
  }
});

test('en brada ar inte bade sald och pa bestallning', () => {
  // Pa bestallning betyder att den alltid gar att fa. Da kan den inte vara
  // slutsald, och kortet skulle visa tva motstridiga besked.
  for (const b of PRODUKTER) {
    assert.ok(!(b.sald && b.pabestallning), 'N:o ' + b.nr + ' ar bade sald och pa bestallning');
  }
});

test('skrivreglerna halls i den text kunden ser', () => {
  const text = PRODUKTER.map((b) => [b.titel, b.kort, b.beskrivning, b.lapp].join(' ')).join(' ');

  // Tankstreck ar bannlyst i briefen, skriv om med komma eller kolon.
  assert.equal(/[—–]/.test(text), false, 'tankstreck i produkttexten');

  // Ateratbrukspastaenden gar inte att garantera och far darfor inte pastas.
  assert.equal(/räddad|räddat|återbruk/i.test(text), false, 'aterbrukspastaende i produkttexten');
});
