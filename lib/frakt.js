'use strict';

/*
 * Vilken fraktnivå en bräda i katalogen hamnar i.
 *
 * Kunden ser båda beloppen på sidan och får det rätta bekräftat per mejl,
 * men den strukturerade datan till sökmotorn behöver ett enda belopp per
 * bräda. Det räknas fram här ur brädans mått: ryms den inom gränsmåttet i
 * site.json (45 × 30 cm, i vilken riktning som helst) går den som liten,
 * annars som stor.
 *
 * Måttet är en tumregel för vikten, och en bräda kan ligga precis på fel
 * sida av den. Då sätter man `frakt: "liten"` eller `frakt: "stor"` på
 * posten i products.json, så gäller det i stället.
 *
 * Ren logik, inga filer och inget nätverk, så allt går att testa rakt av.
 */

// "43,5 × 27 × 3,8 cm" ger de två första talen. Tredje talet är tjockleken
// och saknas ofta, den påverkar inte nivån.
const MATT = /(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)/i;

function tal(text) {
  return Number(String(text).replace(',', '.'));
}

// Längd och bredd ur en måttsträng, längsta sidan först. null om det inte
// står något mått att tolka.
function matt(text) {
  const m = MATT.exec(String(text == null ? '' : text));
  if (!m) return null;
  const a = tal(m[1]);
  const b = tal(m[2]);
  if (!(a > 0) || !(b > 0)) return null;
  return a >= b ? [a, b] : [b, a];
}

// 'liten', 'stor', eller null om nivån inte går att avgöra.
function niva(brada, grans) {
  const b = brada || {};
  if (b.frakt === 'liten' || b.frakt === 'stor') return b.frakt;

  const egen = matt(b.spec && b.spec['Mått']);
  const g = matt(grans);
  if (!egen || !g) return null;

  return egen[0] <= g[0] && egen[1] <= g[1] ? 'liten' : 'stor';
}

// Fraktbeloppet i kronor för en bräda, eller null om nivån är okänd.
function belopp(brada, site) {
  const s = site || {};
  const n = niva(brada, s.fraktGrans);
  if (n === 'liten') return s.fraktLiten;
  if (n === 'stor') return s.fraktStor;
  return null;
}

module.exports = { matt, niva, belopp };
