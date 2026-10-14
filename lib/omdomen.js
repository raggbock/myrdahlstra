'use strict';

/*
 * Omdömena på sajten. De är allmänna: ett omdöme gäller en bräda kunden
 * köpt härifrån, inte en viss post i katalogen. De flesta brädor är unika och
 * lämnar katalogen en vecka efter att de sålts, så ett omdöme knutet till en
 * bräda skulle hamna på en sida som ingen länkar till.
 *
 * Samma ruta visas på startsidan, beställningssidan och brädornas sidor.
 * Ingen strukturerad data: Google visar bara stjärnor för omdömen om en
 * bestämd vara, och betyg som en verksamhet visar om sig själv räknas inte.
 *
 * Publicerade omdömen står i src/_data/omdomen.json och skrivs av
 * verkstadspanelen. Ren logik, inga filer och inget nätverk.
 */

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
  'augusti', 'september', 'oktober', 'november', 'december'];

// Hur många omdömen rutan visar. Snittet räknas ändå på alla.
const PA_SIDAN = 6;

// Nyaste först, och samma dag det senast publicerade först.
function nyastForst(a, b) {
  return a.datum === b.datum ? b.id - a.id : a.datum < b.datum ? 1 : -1;
}

// De PA_SIDAN nyaste. Urvalet görs på datum och aldrig på betyg: att sålla
// bort de dåliga vore vilseledande enligt marknadsföringslagen.
function urval(lista) {
  return (lista || []).slice().sort(nyastForst).slice(0, PA_SIDAN);
}

function betygssnitt(lista) {
  const alla = lista || [];
  if (!alla.length) return { antal: 0, snitt: null };
  const summa = alla.reduce((s, o) => s + o.betyg, 0);
  return { antal: alla.length, snitt: Math.round((summa / alla.length) * 10) / 10 };
}

function betygText(tal) {
  return String(tal).replace('.', ',');
}

function manad(datum) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(datum || ''));
  if (!m || !MANADER[Number(m[2]) - 1]) return '';
  return MANADER[Number(m[2]) - 1] + ' ' + m[1];
}

module.exports = { PA_SIDAN, urval, betygssnitt, betygText, manad };
