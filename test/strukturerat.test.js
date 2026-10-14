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

// Det en besökare ser: sidans kropp utan skript, alltså utan den
// strukturerade datan själv
function synligt(html) {
  return html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '');
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
  assert.ok(synligt(sida.content).includes(Konfigurator.formatera(Number(produkt.offers.lowPrice))), 'lägsta priset syns inte');
  assert.ok(synligt(sida.content).toLowerCase().includes(produkt.name.toLowerCase()), 'namnet ' + produkt.name + ' syns inte');
});

test('sidkartan flyttar lastmod för sidor med omdömen när ett omdöme publiceras', async () => {
  const fs = require('node:fs');
  const fil = path.join(ROT, 'src/_data/omdomen.json');
  const fore = fs.statSync(fil);
  const framtid = new Date('2031-05-05T12:00:00Z');
  fs.utimesSync(fil, framtid, framtid);
  try {
    const mod = await import('@11ty/eleventy');
    const Eleventy = mod.Eleventy || mod.default;
    const elev = new Eleventy(path.join(ROT, 'src'), path.join(ROT, '_site'), {
      configPath: path.join(ROT, '.eleventy.js'), quietMode: true
    });
    const karta = (await elev.toJSON()).find((s) => s.url === '/sitemap.xml').content;
    const lastmod = (adress) => new RegExp('<loc>[^<]*' + adress + '</loc>\\s*<lastmod>([^<]*)').exec(karta)[1];
    assert.equal(lastmod('/'), '2031-05-05');
    assert.equal(lastmod('/bestallning/'), '2031-05-05');
    assert.match(karta, /\/brada\/[^<]*<\/loc>\s*<lastmod>2031-05-05/);
    assert.notEqual(lastmod('/verkstaden/'), '2031-05-05');
  } finally {
    fs.utimesSync(fil, fore.atime, fore.mtime);
  }
});

test('ingen strukturerad data har betyg, för omdömena gäller inte en bestämd vara', async () => {
  for (const s of await bygg()) {
    const text = JSON.stringify(block(s.content));
    assert.doesNotMatch(text, /"aggregateRating"|"review"/, s.url);
  }
});

test('omdömena syns där det handlas, precis när det finns några', async () => {
  const handel = (url) => url === '/' || url === '/bestallning/' || url.startsWith('/brada/');
  const { snitt } = O.betygssnitt(OMDOMEN);
  for (const s of await bygg()) {
    if (!s.url || !s.url.endsWith('/')) continue;
    // Klassen och inte id:t: villkorens rubrik om omdömen har samma id
    const ruta = s.content.includes('class="passage omdomen"');
    assert.equal(ruta, handel(s.url) && OMDOMEN.length > 0, s.url);
    if (ruta) assert.ok(s.content.includes(O.betygText(snitt) + ' av 5'), s.url + ' visar inte snittet');
  }
});

test('omdomen.json har bara giltiga omdömen', () => {
  assert.ok(Array.isArray(OMDOMEN));
  for (const o of OMDOMEN) {
    assert.ok(Number.isInteger(o.id) && o.betyg >= 1 && o.betyg <= 5 && o.namn && o.text && O.manad(o.datum), JSON.stringify(o));
  }
  assert.equal(new Set(OMDOMEN.map((o) => o.id)).size, OMDOMEN.length, 'två omdömen delar id');
});
