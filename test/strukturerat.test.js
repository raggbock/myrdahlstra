'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Konfigurator = require('../assets/konfigurator.js');
const O = require('../lib/omdomen.js');

/*
 * Bygger sajten i minnet och läser varje block med strukturerad data. Ett
 * kommatecken för mycket i en mall gör blocket oläsligt för Google utan att
 * något syns på sidan, så det är här det fångas.
 */

const ROT = path.join(__dirname, '..');
const OMDOMEN = require('../src/_data/omdomen.json');

let sidor;
async function bygg() {
  if (sidor) return sidor;
  const mod = await import('@11ty/eleventy');
  const Eleventy = mod.Eleventy || mod.default;
  const elev = new Eleventy(path.join(ROT, 'src'), path.join(ROT, '_site'), {
    configPath: path.join(ROT, '.eleventy.js'), quietMode: true
  });
  sidor = await elev.toJSON();
  return sidor;
}

function block(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

test('varje block med strukturerad data går att läsa', async () => {
  for (const s of await bygg()) {
    assert.doesNotThrow(() => block(s.content), s.url);
  }
});

test('beställningssidan är en Product vars lägsta pris står på sidan', async () => {
  const sida = (await bygg()).find((s) => s.url === '/bestallning/');
  const produkt = block(sida.content).find((b) => b['@type'] === 'Product');
  assert.ok(produkt, 'Product saknas på beställningssidan');
  assert.equal(produkt.offers['@type'], 'AggregateOffer');
  assert.ok(sida.content.includes(Konfigurator.formatera(Number(produkt.offers.lowPrice))), 'lägsta priset syns inte');
});

test('betyg finns i datan precis där omdömen syns på sidan', async () => {
  for (const s of await bygg()) {
    const produkter = block(s.content).filter((b) => b['@type'] === 'Product');
    for (const p of produkter) {
      const synligt = s.content.includes('class="omdomen__snitt"');
      assert.equal(Boolean(p.aggregateRating), synligt, s.url);
      if (p.aggregateRating) {
        const snitt = O.betygText(p.aggregateRating.ratingValue) + ' av 5';
        assert.ok(s.content.includes(snitt), s.url + ' visar inte ' + snitt);
        assert.equal(p.review.length, p.aggregateRating.reviewCount);
      }
    }
  }
});

test('startsidans företag har inget betyg', async () => {
  const start = (await bygg()).find((s) => s.url === '/');
  for (const b of block(start.content)) assert.equal(b.aggregateRating, undefined);
});

test('omdomen.json har bara giltiga omdömen', () => {
  assert.ok(Array.isArray(OMDOMEN));
  for (const o of OMDOMEN) {
    assert.ok(Number.isInteger(o.id) && o.betyg >= 1 && o.betyg <= 5 && o.namn && o.text && O.manad(o.datum), JSON.stringify(o));
  }
  assert.equal(new Set(OMDOMEN.map((o) => o.id)).size, OMDOMEN.length, 'två omdömen delar id');
});
