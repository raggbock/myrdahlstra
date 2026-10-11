'use strict';

/*
 * Omdömena på sajten: vilka som hör till en sida, snittet, och samma
 * uppgifter som strukturerad data till Google. Sidan och den strukturerade
 * datan räknas med samma funktioner, så de kan aldrig visa olika betyg.
 *
 * Publicerade omdömen står i src/_data/omdomen.json och skrivs av
 * verkstadspanelen. Ren logik, inga filer och inget nätverk.
 */

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
  'augusti', 'september', 'oktober', 'november', 'december'];

function omdomenFor(lista, mal) {
  return (lista || [])
    .filter((o) => o.mal === mal)
    .sort((a, b) => (a.datum === b.datum ? b.id - a.id : a.datum < b.datum ? 1 : -1));
}

function betygssnitt(lista) {
  if (!lista.length) return { antal: 0, snitt: null };
  const summa = lista.reduce((s, o) => s + o.betyg, 0);
  return { antal: lista.length, snitt: Math.round((summa / lista.length) * 10) / 10 };
}

function betygText(tal) {
  return String(tal).replace('.', ',');
}

function manad(datum) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(datum || ''));
  if (!m || !MANADER[Number(m[2]) - 1]) return '';
  return MANADER[Number(m[2]) - 1] + ' ' + m[1];
}

const betyg = (varde) => ({ '@type': 'Rating', ratingValue: varde, bestRating: 5, worstRating: 1 });

function strukturerat(lista) {
  if (!lista.length) return null;
  const { antal, snitt } = betygssnitt(lista);
  return {
    aggregateRating: { '@type': 'AggregateRating', ratingValue: snitt, reviewCount: antal, bestRating: 5, worstRating: 1 },
    review: lista.map((o) => ({
      '@type': 'Review',
      reviewRating: betyg(o.betyg),
      author: { '@type': 'Person', name: o.namn },
      datePublished: o.datum,
      reviewBody: o.text
    }))
  };
}

// Kundens text hamnar i ett <script>-block. Utan det här kunde en text med
// </script> avsluta blocket och resten tolkas som sidans egen kod.
function jsonld(varde) {
  return JSON.stringify(varde)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

module.exports = { omdomenFor, betygssnitt, betygText, manad, strukturerat, jsonld };
