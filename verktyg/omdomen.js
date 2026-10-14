'use strict';

/*
 * Ren logik för omdömena i verkstadspanelen: koder till inbjudningar och
 * filen src/_data/omdomen.json där de publicerade omdömena bor. Inget
 * nätverk, så allt går att testa rakt av.
 */

const fs = require('node:fs');
const crypto = require('node:crypto');

const KOD = /^[A-Za-z0-9_-]{12}$/;

// Nio slumpade byte blir exakt tolv tecken i base64url, utan utfyllnad
function nyKod() {
  return crypto.randomBytes(9).toString('base64url');
}

/*
 * Omdömena är allmänna, om en bräda kunden köpt härifrån, och knyts inte
 * till en viss post i katalogen: de flesta brädor är unika och lämnar
 * katalogen en vecka efter försäljningen. Databasens kolumn mal finns kvar,
 * se db/omdome.sql, och får alltid det här värdet.
 */
const MAL = 'allmant';

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
// om borttagningen ur D1 misslyckades förra gången. Koden följer med in i
// filen, för id:t ensamt räcker inte: den lokala databasen från npm run
// preview räknar sina id från 1 precis som den skarpa, och ett lokalt
// provomdöme i filen skulle annars få ett riktigt omdöme att försvinna.
function medOmdome(lista, rad) {
  const finns = lista.find((o) => o.id === rad.id);
  if (finns && finns.kod === rad.kod) return lista;
  if (finns) {
    throw new KrockandeId('Ett annat publicerat omdöme har redan id ' + rad.id +
      ' (' + finns.namn + '). Ta bort det i listan Publicerade, eller ändra dess id i omdomen.json, och publicera sedan igen.');
  }
  return lista.concat([{
    id: rad.id, kod: rad.kod, betyg: rad.betyg, namn: rad.namn, ort: rad.ort, text: rad.text, datum: rad.dag
  }]);
}

class KrockandeId extends Error {}

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

module.exports = { KrockandeId, KOD, MAL, nyKod, las, medOmdome, utanOmdome, sql, lank };
