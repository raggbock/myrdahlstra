'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/*
 * Ingen klickade någonsin på "Skicka förfrågan" i byggaren (klickdatan
 * 1 oktober till 7 november 2026). Knappen låg under skärmkanten medan
 * kunden valde: på telefon efter hela panelen, på laptop längst ned i en
 * sticky panel som är högre än fönstret. Skissraden på telefon bär därför
 * en egen skicka-knapp, och panelens knapp ligger i en egen fot som CSS
 * kan klistra mot skärmens underkant.
 */

const ROT = path.join(__dirname, '..');

let sida;
async function bestallning() {
  if (sida) return sida;
  const mod = await import('@11ty/eleventy');
  const Eleventy = mod.Eleventy || mod.default;
  const elev = new Eleventy(path.join(ROT, 'src'), path.join(ROT, '_site'), {
    configPath: path.join(ROT, '.eleventy.js'), quietMode: true
  });
  sida = (await elev.toJSON()).find((s) => s.url === '/bestallning/').content;
  return sida;
}

// Byggarens formulär, utan meddelandeformuläret som följer efter
async function byggaren() {
  const html = await bestallning();
  const start = html.indexOf('<form class="bestall"');
  return html.slice(start, html.indexOf('</form>', start));
}

test('skissraden ligger efter steg 5, så den följer med genom alla steg', async () => {
  const form = await byggaren();
  const steg5 = form.indexOf('Dina uppgifter');
  const rad = form.indexOf('class="miniraden"');
  assert.ok(steg5 > 0 && rad > 0);
  assert.ok(rad > steg5, 'miniraden ska komma efter steg 5');
  assert.ok(rad < form.indexOf('<aside'), 'miniraden ska ligga kvar bland stegen, före panelen');
});

test('skissraden har en riktig skicka-knapp i byggarens formulär', async () => {
  const form = await byggaren();
  const rad = form.slice(form.indexOf('class="miniraden"'), form.indexOf('<aside'));
  assert.match(rad, /<button[^>]*type="submit"[^>]*>Skicka förfrågan<\/button>/);
  // Raden är en visuell kopia av panelen, skärmläsare och tangentbord tar panelens knapp
  assert.match(rad, /<button[^>]*tabindex="-1"/);
});

test('panelens knapp ligger i en egen fot som kan klistras mot underkanten', async () => {
  const form = await byggaren();
  const panel = form.slice(form.indexOf('<aside'));
  assert.match(panel, /<div class="summering__skicka">\s*<button class="knapp knapp--ljus" type="submit">Skicka förfrågan<\/button>/);
});
