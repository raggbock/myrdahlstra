'use strict';

/*
 * Ren logik for verkstadspanelen: adresser, mattstrangar, validering och
 * las/skriv av products.json. Inget harifran ror natverk eller webblasare,
 * sa allt gar att testa rakt av.
 */

const fs = require('node:fs');
const path = require('node:path');

const MULT = '×'; // multiplikationstecken, inte bokstaven x

/* ---------- adress fran titel ---------- */

const ERSATT = {
  å: 'a', ä: 'a', ö: 'o', é: 'e', è: 'e', ü: 'u', ø: 'o', æ: 'ae',
  Å: 'a', Ä: 'a', Ö: 'o', É: 'e', È: 'e', Ü: 'u', Ø: 'o', Æ: 'ae'
};

function tillSlug(titel) {
  const ut = String(titel == null ? '' : titel)
    .replace(/[åäöéèüøæÅÄÖÉÈÜØÆ]/g, (t) => ERSATT[t])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // En tom adress skulle ge en trasig url, sa fall tillbaka pa nagot lasbart.
  return ut === '' ? 'brada' : ut;
}

/* ---------- mattstrangen ---------- */

function tal(v) {
  if (v == null) return '';
  return String(v).trim().replace('.', ',');
}

function tillMatt(langd, bredd, tjocklek) {
  const l = tal(langd);
  const b = tal(bredd);
  const t = tal(tjocklek);

  if (l === '' || b === '') return '';

  const delar = t === '' ? [l, b] : [l, b, t];
  return delar.join(' ' + MULT + ' ') + ' cm';
}

/* ---------- validering ---------- */

const SLUG_MONSTER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validera(brada, ovriga, egetNr) {
  const fel = [];
  const b = brada || {};

  if (!String(b.titel == null ? '' : b.titel).trim()) {
    fel.push('Titel måste fyllas i.');
  }

  const pris = b.pris;
  if (!Number.isInteger(pris) || pris <= 0) {
    fel.push('Pris måste vara ett positivt heltal i kronor.');
  }

  if (!SLUG_MONSTER.test(String(b.slug == null ? '' : b.slug))) {
    fel.push('Adressen får bara innehålla små bokstäver a till z, siffror och bindestreck.');
  }

  const andra = (ovriga || []).filter((x) => egetNr == null || x.nr !== egetNr);

  if (andra.some((x) => x.nr === b.nr)) {
    fel.push('N:o ' + b.nr + ' används redan av en annan bräda.');
  }

  if (andra.some((x) => x.slug === b.slug)) {
    fel.push('Adressen ' + b.slug + ' används redan av en annan bräda.');
  }

  return fel;
}

/* ---------- numrering ---------- */

function nastaNr(produkter) {
  const nummer = (produkter || []).map((x) => x.nr).filter(Number.isInteger);
  return nummer.length === 0 ? 1 : Math.max(...nummer) + 1;
}

function numreraOm(produkter) {
  return (produkter || []).map((x, i) => ({ ...x, nr: i + 1 }));
}

/* ---------- las och skriv ---------- */

function las(fil) {
  try {
    return JSON.parse(fs.readFileSync(fil, 'utf8'));
  } catch (e) {
    // Saknad fil ar ett normalt lage, inte ett fel varden att krascha pa.
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function skriv(fil, produkter) {
  const text = JSON.stringify(produkter, null, 2) + '\n';

  // Backup fore skrivning, sa ett felklick gar att backa.
  if (fs.existsSync(fil)) {
    fs.copyFileSync(fil, fil + '.bak');
  }

  // Atomart: skriv till temporarfil i samma mapp och byt namn sist. Ett
  // avbrott mitt i kan da aldrig lamna en halv products.json.
  const temp = path.join(path.dirname(fil), '.' + path.basename(fil) + '.tmp');
  fs.writeFileSync(temp, text, 'utf8');
  fs.renameSync(temp, fil);
}

module.exports = { tillSlug, tillMatt, validera, nastaNr, numreraOm, las, skriv, MULT };
