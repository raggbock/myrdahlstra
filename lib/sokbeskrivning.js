'use strict';

/*
 * Brädsidans beskrivning i sökresultatet, byggd ur posten i products.json.
 *
 * Förut var det bara brädans korta text, "Kraftig bräda där kniven möter
 * fibrernas ändar...", som säger hur brädan är men inte vad den är. Den som
 * söker "skärbräda ek ändträ" vill se träslag, mått, pris och var den görs
 * innan hen klickar. Allt det står redan i posten och på sidan.
 *
 * Ordningen är efter vikt, för Google kapar runt 155 tecken: först vad det
 * är och måttet, sedan att den är handgjord och var, sedan priset. Den korta
 * texten fyller på mening för mening så länge det ryms.
 *
 * Bara sådant som också syns på sidan får stå här. Frakten skrivs därför
 * som "från" det lägre beloppet: sidan visar båda nivåerna och bekräftar
 * den rätta per mejl.
 *
 * Ren logik, inga filer, så den går att testa rakt av.
 */

const Konfigurator = require('../assets/konfigurator.js');

const MAX = 155;

// "Kraftig bräda. Skonsam mot eggen." ger två meningar med punkten kvar
function meningar(text) {
  return String(text || '').match(/[^.!?]+[.!?]+/g)?.map((m) => m.trim()) || [];
}

function sokbeskrivning(brada, site) {
  const b = brada || {};
  const s = site || {};
  const matt = b.spec && b.spec['Mått'];

  const borjan = [(b.titel || '') + (matt ? ', ' + matt : '') + '.'];
  if (s.ort) borjan.push('Handgjort i ' + s.ort + '.');

  const slut = [];
  if (b.sald) {
    slut.push('Såld, en liknande går att beställa efter mått.');
  } else {
    if (b.pabestallning) slut.push('Görs på beställning.');
    if (b.pris) {
      slut.push(Konfigurator.formatera(b.pris) +
        (s.fraktLiten ? ', frakt från ' + s.fraktLiten + ' kr.' : '.'));
    }
  }

  // Meningarna ur den korta texten står var för sig, så en som inte ryms
  // hoppas över och nästa, kortare, får försöka. En som säger det slutet
  // redan säger tas inte med två gånger.
  const langd = (lista) => lista.join(' ').length;
  for (const m of meningar(b.kort)) {
    if (b.pabestallning && /beställning/i.test(m)) continue;
    if (langd(borjan.concat(m, slut)) <= MAX) borjan.push(m);
  }
  return borjan.concat(slut).join(' ');
}

module.exports = { sokbeskrivning, MAX };
