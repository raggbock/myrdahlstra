'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Sortiment = require('../lib/sortiment.js');
const Konfigurator = require('../assets/konfigurator.js');
const { MAX } = require('../lib/sokbeskrivning.js');
const PRODUKTER = require('../src/_data/products.json');
const PROCESS = require('../src/_data/process.json');

/*
 * Ändträguiden är sajtens mest visade sida i Google men gav nästan inga
 * klick vidare. Den länkar därför till brädorna som går att köpa, och
 * listan räknas fram ur products.json så att den aldrig pekar på något
 * som är sålt.
 */

const ROT = path.join(__dirname, '..');

let sida;
async function guiden() {
  if (sida) return sida;
  const mod = await import('@11ty/eleventy');
  const Eleventy = mod.Eleventy || mod.default;
  const elev = new Eleventy(path.join(ROT, 'src'), path.join(ROT, '_site'), {
    configPath: path.join(ROT, '.eleventy.js'), quietMode: true
  });
  sida = (await elev.toJSON()).find((s) => s.url === '/andtra/').content;
  return sida;
}

const arAndtra = (p) => p.titel.toLowerCase().includes('ändträ');

test('guiden länkar till varje ändträbräda som går att köpa, med pris', async () => {
  const html = await guiden();
  const andtra = Sortiment.tillSalu(PRODUKTER).filter(arAndtra);
  assert.ok(andtra.length, 'testet behöver minst en ändträbräda till salu');
  for (const p of andtra) {
    assert.ok(html.includes('href="/brada/' + p.slug + '/"'), 'länk saknas till ' + p.slug);
    assert.ok(html.includes(Konfigurator.formatera(p.pris)), 'priset för ' + p.slug + ' saknas');
  }
});

test('guiden länkar aldrig till en såld bräda', async () => {
  const html = await guiden();
  for (const p of PRODUKTER.filter((p) => p.sald)) {
    assert.ok(!html.includes('href="/brada/' + p.slug + '/"'), 'länk till såld ' + p.slug);
  }
});

/*
 * Beskrivningen svarade förut på frågan direkt i sökresultatet, och sidan
 * fick 1 klick på 254 visningar kring plats 7. Nu lockar den med fotoserien,
 * och antalet foton räknas ur process.json så att det alltid stämmer.
 */
test('sökbeskrivningen ryms och räknar fotona i serien', async () => {
  const html = await guiden();
  const beskrivning = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(beskrivning.length <= MAX, beskrivning.length + ' tecken: ' + beskrivning);
  assert.ok(beskrivning.includes(PROCESS.steg.length + ' foton'), beskrivning);
});

test('guiden nämner inga katalognummer för hand', async () => {
  const html = await guiden();
  assert.doesNotMatch(html, /N:o \d+ till \d+|N:o \d+ och \d+/);
});
