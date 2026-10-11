'use strict';

/*
 * Ren logik för omdömena i verkstadspanelen: koder till inbjudningar,
 * vilka mål ett omdöme kan ha, och filen src/_data/omdomen.json där de
 * publicerade omdömena bor. Inget nätverk, så allt går att testa rakt av.
 */

const fs = require('node:fs');
const crypto = require('node:crypto');

const KOD = /^[A-Za-z0-9_-]{12}$/;

// Nio slumpade byte blir exakt tolv tecken i base64url, utan utfyllnad
function nyKod() {
  return crypto.randomBytes(9).toString('base64url');
}

function malLista(produkter) {
  return [{ mal: 'bestallning', namn: 'Efter mått (beställningssidan)' }].concat(
    produkter.slice().sort((a, b) => a.nr - b.nr)
      .map((p) => ({ mal: p.slug, namn: 'N:o ' + p.nr + '. ' + p.titel }))
  );
}

function giltigtMal(mal, produkter) {
  return mal === 'bestallning' || produkter.some((p) => p.slug === mal);
}

function las(fil) {
  let text;
  try {
    text = fs.readFileSync(fil, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const lista = JSON.parse(text);
  if (!Array.isArray(lista)) throw new Error(fil + ' ska innehålla en lista.');
  return lista;
}

// Samma omdöme två gånger blir ett. Det gör att Publicera kan tryckas igen
// om borttagningen ur D1 misslyckades förra gången.
function medOmdome(lista, rad) {
  if (lista.some((o) => o.id === rad.id)) return lista;
  return lista.concat([{
    id: rad.id, mal: rad.mal, betyg: rad.betyg, namn: rad.namn, ort: rad.ort, text: rad.text, datum: rad.dag
  }]);
}

function utanOmdome(lista, id) {
  return lista.filter((o) => o.id !== id);
}

// Frågorna går genom wrangler som text, utan bundna värden. Allt som
// skrivs in i dem går därför genom den här.
function sql(varde) {
  if (typeof varde === 'number') {
    if (!Number.isInteger(varde)) throw new Error('Bara heltal i SQL: ' + varde);
    return String(varde);
  }
  return "'" + String(varde).replace(/'/g, "''") + "'";
}

function lank(url, kod) {
  return url + '/omdome/#' + kod;
}

module.exports = { KOD, nyKod, malLista, giltigtMal, las, medOmdome, utanOmdome, sql, lank };
