'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const nunjucks = require('nunjucks');
const Omdomen = require('../lib/omdomen.js');
const Fotomatt = require('../lib/fotomatt.js');

/*
 * Omdömesrutan renderad med samma filter som i .eleventy.js, men med påhittade
 * omdömen. Den riktiga omdomen.json kan vara tom, och då kan bygget inte visa
 * ett foto. Eleventy ger Nunjucks { dev: true } och därmed autoescape, och det
 * gör testet också.
 */
function rendera(omdomen) {
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(path.join(__dirname, '..', 'src', '_includes')), { dev: true });
  env.addFilter('foto', (fil) => Fotomatt.foto(fil));
  env.addFilter('omdomenUrval', (lista) => Omdomen.urval(lista));
  env.addFilter('betygssnitt', (lista) => Omdomen.betygssnitt(lista));
  env.addFilter('betygText', (tal) => Omdomen.betygText(tal));
  env.addFilter('manad', (datum) => Omdomen.manad(datum));
  return env.render('omdomen.njk', { omdomen });
}

// Ett foto som finns i assets/foto, så att filtret hittar måtten
const FOTO = 'andtraskarbrada-massiv-ek-1.jpg';
const omdome = (extra) => ({ id: 1, betyg: 5, namn: 'Karin', ort: 'Västerås', text: 'Fin.', datum: '2026-10-20', ...extra });

test('ett omdöme med foto visar bilden med alt-text och länk till förstoringen', () => {
  const html = rendera([omdome({ bild: FOTO })]);
  assert.match(html, /class="omdomen__post omdomen__post--foto"/);
  assert.match(html, new RegExp('<a class="omdomen__foto" href="/assets/foto/' + FOTO + '" data-forstora'));
  assert.match(html, /alt="Foto som Karin skickade med sitt omdöme"/);
  assert.match(html, /-480\.avif 480w/);
});

test('ett omdöme utan foto har ingen bild', () => {
  const html = rendera([omdome()]);
  assert.doesNotMatch(html, /omdomen__foto|<img/);
});

test('namnet i alt-texten kan inte bryta sig ut ur attributet', () => {
  const html = rendera([omdome({ namn: 'K"><script>x</script>', bild: FOTO })]);
  assert.doesNotMatch(html, /<script>x/);
});
