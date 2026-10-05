'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sokbeskrivning, MAX } = require('../lib/sokbeskrivning.js');
const produkter = require('../src/_data/products.json');
const site = require('../src/_data/site.json');

const SITE = { ort: 'Stora Mellösa', fraktLiten: 189 };
const brada = (extra) => ({
  titel: 'Ändträskärbräda i massiv ek', pris: 2000, kort: 'Kraftig bräda. Oljad och klar.',
  spec: { 'Mått': '43,5 × 27 × 3,8 cm' }, ...extra
});

test('säger vad brädan är, måttet, var den görs och priset', () => {
  assert.equal(sokbeskrivning(brada(), SITE),
    'Ändträskärbräda i massiv ek, 43,5 × 27 × 3,8 cm. Handgjort i Stora Mellösa. ' +
    'Kraftig bräda. Oljad och klar. 2 000 kr, frakt från 189 kr.');
});

test('en såld bräda får inget pris', () => {
  const t = sokbeskrivning(brada({ sald: true }), SITE);
  assert.doesNotMatch(t, /kr/);
  assert.match(t, /Såld/);
});

test('en bräda på beställning säger det en gång', () => {
  const t = sokbeskrivning(brada({ pabestallning: true, kort: 'Åtta rutor. Görs på beställning.' }), SITE);
  assert.equal(t.match(/beställning/g).length, 1);
  assert.match(t, /Åtta rutor\./);
});

test('för lång kort text kortas mening för mening, priset står kvar', () => {
  const lang = 'Första meningen är lagom. ' + 'Den här är alldeles för lång '.repeat(6) + 'slut. Kort sista.';
  const t = sokbeskrivning(brada({ kort: lang }), SITE);
  assert.ok(t.length <= MAX, t.length);
  assert.match(t, /Första meningen är lagom\. Kort sista\. 2 000 kr/);
});

test('utan mått och utan frakt blir det ändå hela meningar', () => {
  assert.equal(sokbeskrivning(brada({ spec: {}, kort: '' }), { ort: 'Stora Mellösa' }),
    'Ändträskärbräda i massiv ek. Handgjort i Stora Mellösa. 2 000 kr.');
});

// Sortimentet i products.json, som det faktiskt ser ut
for (const p of produkter) {
  test('N:o ' + p.nr + ' får en beskrivning som ryms och följer skrivreglerna', () => {
    const t = sokbeskrivning(p, site);
    assert.ok(t.length <= MAX, t.length + ' tecken: ' + t);
    assert.ok(t.startsWith(p.titel));
    assert.doesNotMatch(t, /[–—]/, 'inga tankstreck');
    assert.doesNotMatch(t, /rädda|återbruk/i);
    assert.doesNotMatch(t, /\.\./);
  });
}
