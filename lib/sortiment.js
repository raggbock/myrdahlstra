'use strict';

/*
 * Vilka brador som visas i katalogen, och hur lange en sald brada far ligga
 * kvar med sitt band.
 *
 * En sald brada forsvinner inte direkt. Den ligger kvar sist i katalogen med
 * ett band over fotot i VISNINGSDAGAR dagar, sa att den som sag den i forra
 * veckan forstar vad som hant. Darefter faller den ur listningarna.
 *
 * OBS: sajten ar statisk. Fonstret rakas fram vid bygget, inte i besokarens
 * webblasare, sa en brada forsvinner forst vid nasta `npm run build` och
 * uppladdning. `npm run build` skriver ut hur manga dagar varje sald brada
 * har kvar.
 *
 * Ren logik, inga filer och inget natverk, sa allt gar att testa rakt av.
 */

const VISNINGSDAGAR = 7;
const DYGN = 24 * 60 * 60 * 1000;

const DATUM_MONSTER = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2026-09-07" blir millisekunder vid midnatt UTC. Allt jamfors i UTC sa att
// sommartid aldrig kan flytta ett dygn fram eller tillbaka.
function tillDygn(varde) {
  const m = DATUM_MONSTER.exec(String(varde == null ? '' : varde).trim());
  if (!m) return null;

  const ar = Number(m[1]);
  const manad = Number(m[2]);
  const dag = Number(m[3]);
  if (manad < 1 || manad > 12 || dag < 1 || dag > 31) return null;

  const t = Date.UTC(ar, manad - 1, dag);

  // Fangar 2026-02-31 och liknande: Date.UTC rullar over till mars.
  const d = new Date(t);
  if (d.getUTCMonth() !== manad - 1 || d.getUTCDate() !== dag) return null;

  return t;
}

// Dagens datum som samma sorts dygntal. Testen skickar in ett datum, bygget
// later den vara tom och far den riktiga dagen.
function dagensDygn(idag) {
  if (typeof idag === 'string') {
    const t = tillDygn(idag);
    if (t !== null) return t;
  }
  const d = idag == null ? new Date() : new Date(idag);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

// Antal hela dygn sedan bradan saldes, eller null om datum saknas.
function dagarSedanSald(brada, idag) {
  const t = tillDygn((brada || {}).saldDatum);
  if (t === null) return null;
  return Math.round((dagensDygn(idag) - t) / DYGN);
}

// Hur manga dagar bandet har kvar. Noll betyder sista dagen.
function dagarKvar(brada, idag) {
  const dagar = dagarSedanSald(brada, idag);
  if (dagar === null) return null;
  return VISNINGSDAGAR - dagar;
}

function visasAnnu(brada, idag) {
  const dagar = dagarSedanSald(brada, idag);

  // Utan datum vet vi inte nar den saldes. Da visas den hellre en gang for
  // mycket an att den tyst forsvinner ur katalogen.
  if (dagar === null) return true;

  // Ett datum fram i tiden ar en felskrivning, inte ett skal att dolja.
  return dagar < VISNINGSDAGAR;
}

/*
 * Har bradan fallit ur katalogen?
 *
 * En sald brada ska synas i Google precis sa lange som den syns pa sajten.
 * Under sin vecka med bandet ligger den kvar pa startsidan, och da ska den
 * ga att hitta som forut: den som sag den i forra veckan och sedan googlar
 * efter den ska hitta sidan och forsta att bradan ar sald.
 *
 * Nar veckan ar slut faller bradan ur listningarna, och da ska den ur
 * sokresultatet ocksa. Sidan ligger kvar for den som har lanken, men
 * brada.njk satter noindex utifran det har svaret.
 *
 * Att bara lyfta bort adressen ur sidkartan racker inte: sidan svarar anda
 * 200 med hela sitt innehall, och Google behaller det den redan har.
 */
function urKatalogen(brada, idag) {
  const p = brada || {};
  return Boolean(p.sald) && !visasAnnu(p, idag);
}

function nrOrdning(a, b) {
  return a.nr - b.nr;
}

// Brador som gar att kopa, sorterade pa N:o.
function tillSalu(produkter) {
  return (produkter || []).filter((p) => !p.sald).sort(nrOrdning);
}

// Salda brador som fortfarande ligger inom fonstret, sorterade pa N:o.
function nyssSalda(produkter, idag) {
  return (produkter || [])
    .filter((p) => p.sald && visasAnnu(p, idag))
    .sort(nrOrdning);
}

/*
 * Hela katalogen i visningsordning, alltsa i nummerordning.
 *
 * Numret ar postens namn, "N:o 4", och da maste sidan ga i samma ordning.
 * Sorterar man i stallet salda sist hamnar en ny bra da over en aldre sald,
 * och den som lasser N:o 7 fore N:o 2 undrar med ratta vad numret betyder.
 * Salda brador syns anda tydligt: bandet over fotot, overstruket pris och
 * ingen bestallknapp. Efter sin vecka faller de ur listan.
 */
function katalog(produkter, idag) {
  return tillSalu(produkter).concat(nyssSalda(produkter, idag)).sort(nrOrdning);
}

/*
 * Katalogens kategorier, i den ordning de star pa startsidan.
 *
 * Nyckeln ar det som star i faltet "kategori" i products.json och den ar
 * ocksa ankaret pa startsidan, /#skarbrador. En post utan kategori, eller med
 * en som inte finns har, raknas som skarbrada: det ar vad de flesta poster
 * ar, och en felskrivning ska inte fa en brada att forsvinna ur katalogen.
 */
const KATEGORIER = [
  { nyckel: 'skarbrador', namn: 'Skärbrädor' },
  {
    nyckel: 'serveringsbrickor',
    namn: 'Serveringsbrickor',
    // Nagra rader under rubriken pa startsidan. Far innehalla lankar.
    ingress: 'Brickorna är limmade i långträ och fungerar utmärkt som skärbrädor också. ' +
      'De döljer inte skärspår lika bra som <a href="/andtra/">ändträ</a>, och de är inte lika snälla mot knivarna.'
  },
  { nyckel: 'schackbraden', namn: 'Schackbräden' },
  { nyckel: 'adventsljusstakar', namn: 'Adventsljusstakar' }
];
const STANDARDKATEGORI = 'skarbrador';

function kategoriFor(brada) {
  const nyckel = (brada || {}).kategori;
  return KATEGORIER.some((k) => k.nyckel === nyckel) ? nyckel : STANDARDKATEGORI;
}

function kategorinamn(brada) {
  const nyckel = kategoriFor(brada);
  return KATEGORIER.find((k) => k.nyckel === nyckel).namn;
}

/*
 * Katalogen uppdelad i avsnitt, ett per kategori, med posterna i
 * nummerordning inom avsnittet.
 *
 * En tom kategori tas inte med, en rubrik utan nagot under ar bara forvirrande.
 * Undantaget ar skarbradorna: dar star kortet for bestallning efter matt, och
 * det gar alltid att bestalla aven nar varje fardig brada ar sald.
 */
function kategorier(produkter, idag) {
  const alla = katalog(produkter, idag);
  return KATEGORIER
    .map((k) => ({
      nyckel: k.nyckel,
      namn: k.namn,
      ingress: k.ingress || '',
      efterMatt: k.nyckel === STANDARDKATEGORI,
      poster: alla.filter((p) => kategoriFor(p) === k.nyckel)
    }))
    .filter((k) => k.poster.length > 0 || k.efterMatt);
}

/*
 * Andra brador att lanka till fran en bradas egen sida.
 *
 * Interna lankar i brodtexten hjalper bade besokaren och sokmotorn att forsta
 * vad som hor ihop. Bara brador som gar att kopa tas med: en lank till nagot
 * slutsalt hjalper ingen, och den forsvinner ur katalogen om en vecka anda.
 *
 * Poster ur samma kategori kommer forst: den som tittar pa en ljusstake vill
 * helst se de andra ljusstakarna. Racker de inte fylls det pa med resten.
 */
function andraBrador(produkter, slug, antal) {
  const alla = produkter || [];
  const denna = alla.find((p) => p.slug === slug);
  const ovriga = tillSalu(alla).filter((p) => p.slug !== slug);
  if (!denna) return ovriga.slice(0, antal || 3);

  const egen = kategoriFor(denna);
  const samma = ovriga.filter((p) => kategoriFor(p) === egen);
  const andra = ovriga.filter((p) => kategoriFor(p) !== egen);
  return samma.concat(andra).slice(0, antal || 3);
}

module.exports = {
  VISNINGSDAGAR,
  KATEGORIER,
  STANDARDKATEGORI,
  kategoriFor,
  kategorinamn,
  kategorier,
  andraBrador,
  tillDygn,
  dagensDygn,
  dagarSedanSald,
  dagarKvar,
  visasAnnu,
  tillSalu,
  urKatalogen,
  nyssSalda,
  katalog
};
