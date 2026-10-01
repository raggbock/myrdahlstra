'use strict';

/*
 * Klickkartan i verkstadspanelen. Hämtar klicken från /api/klick och ritar
 * dem som en värmekarta ovanpå den byggda sidan.
 *
 * Sidan visas i en iframe från panelens egen server (/sajt/...), så kartan
 * kan mäta var katalogramen ligger och lägga prickarna rätt. Klicken är
 * sparade som andel av ramens bredd och pixlar från dess överkant, se
 * assets/klick.js.
 */

const BREDD = { dator: 1440, mobil: 390 };

const tillstand = { data: null, sida: null, lage: 'dator' };

const $ = (id) => document.getElementById(id);

function el(tag, attr, ...barn) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const b of barn) e.append(b);
  return e;
}

function rad(namn, antal, extra) {
  return [el('span', { class: 'namn', title: namn }, namn), el('span', { class: 'ledare' }),
    ...(extra ? [extra] : []), el('span', { class: 'antal' }, String(antal))];
}

function visaFel(text) {
  $('meddelanden').replaceChildren(el('div', { class: 'meddelande fel' }, text));
}

async function hamta() {
  $('meddelanden').replaceChildren();
  const dagar = $('dagar').value;
  try {
    const svar = await fetch('/api/klick?dagar=' + dagar, { headers: { 'X-Panel': '1' } });
    const data = await svar.json();
    if (!svar.ok) throw new Error((data.fel || ['Okänt fel.']).join(' '));
    tillstand.data = data;
  } catch (e) {
    tillstand.data = { sidor: [], topp: [], punkter: [] };
    visaFel(e.message);
  }
  ritaSidor();
}

function sidorForLage() {
  return tillstand.data.sidor.filter((s) => s.lage === tillstand.lage);
}

function ritaSidor() {
  const sidor = sidorForLage();
  const lista = $('sidor');
  if (!sidor.length) {
    lista.replaceChildren(el('p', { class: 'tom' }, 'Inga klick från ' +
      (tillstand.lage === 'dator' ? 'datorer' : 'mobiler') + ' under perioden.'));
    $('karta').hidden = true;
    $('summa').textContent = '';
    $('topp').replaceChildren();
    return;
  }
  if (!sidor.some((s) => s.sida === tillstand.sida)) tillstand.sida = sidor[0].sida;
  lista.replaceChildren(...sidor.map((s) => el('button', {
    type: 'button', class: 'rad', 'aria-current': String(s.sida === tillstand.sida),
    onclick: () => { tillstand.sida = s.sida; ritaSidor(); }
  }, ...rad(s.sida, s.n))));
  ritaSida();
}

function ritaSida() {
  const { data, sida, lage } = tillstand;
  const punkter = data.punkter.filter((p) => p.sida === sida && p.lage === lage);
  const topp = data.topp.filter((t) => t.sida === sida && t.lage === lage);
  const totalt = (data.sidor.find((s) => s.sida === sida && s.lage === lage) || {}).n || 0;
  const traffar = topp.reduce((s, t) => s + t.n, 0);

  $('summa').textContent = totalt + ' klick på ' + sida + '. ' + traffar +
    ' på länkar, knappar och fält, ' + (totalt - traffar) + ' bredvid.';

  $('topp').replaceChildren(el('h2', {}, 'MEST KLICKAT'), topp.length
    ? el('ol', {}, ...topp.slice(0, 40).map((t) => el('li', {},
      ...rad(t.mal, t.n, t.till ? el('span', { class: 'till', title: t.till }, t.till) : null))))
    : el('p', { class: 'tom' }, 'Inga klick på länkar eller knappar här.'));

  ritaKarta(sida, lage, punkter);
}

let ritning = 0;

function ritaKarta(sida, lage, punkter) {
  const nr = ++ritning;
  const karta = $('karta');
  karta.hidden = false;
  karta.className = 'karta' + (lage === 'mobil' ? ' karta--mobil' : '');
  const bredd = BREDD[lage];
  const ram = el('iframe', { src: '/sajt' + sida, title: 'Sidan ' + sida, tabindex: '-1' });
  ram.style.width = bredd + 'px';
  ram.style.height = '900px';
  karta.replaceChildren(ram);

  const skala = () => karta.clientWidth / bredd;

  function anpassa() {
    if (nr !== ritning) return;
    const doc = ram.contentDocument;
    if (!doc || !doc.documentElement) return;
    const hojd = doc.documentElement.scrollHeight;
    ram.style.height = hojd + 'px';
    ram.style.transform = 'scale(' + skala() + ')';
    karta.style.height = Math.ceil(hojd * skala()) + 'px';
    lagg(doc, punkter, lage);
  }

  ram.addEventListener('load', () => {
    const doc = ram.contentDocument;
    if (!doc || !doc.querySelector('.ram')) {
      karta.style.height = 'auto';
      karta.replaceChildren(el('p', { class: 'meddelande fel' },
        'Sidan ' + sida + ' finns inte i det lokala bygget. Kör npm run build, eller så har sidan tagits bort.'));
      return;
    }
    anpassa();
    // Typsnitt och foton laddas efter sidan och ändrar höjden. Mät om tills
    // den slutat växa.
    let forra = 0;
    const koll = setInterval(() => {
      const h = doc.documentElement.scrollHeight;
      if (nr !== ritning || h === forra) return clearInterval(koll);
      forra = h;
      anpassa();
    }, 400);
  });
  window.onresize = anpassa;
}

// Ritar värmekartan på en duk ovanpå sidan i iframen. Först samlas klicken
// som genomskinlighet, sedan färgas den efter täthet, från guld via rost.
function lagg(doc, punkter, lage) {
  doc.getElementById('klickkarta')?.remove();
  const ram = doc.querySelector('.ram').getBoundingClientRect();
  const bredd = doc.documentElement.scrollWidth;
  const hojd = doc.documentElement.scrollHeight;
  const duk = doc.createElement('canvas');
  duk.id = 'klickkarta';
  duk.width = bredd;
  duk.height = hojd;
  Object.assign(duk.style, {
    position: 'absolute', left: '0', top: '0', width: bredd + 'px', height: hojd + 'px',
    pointerEvents: 'none', zIndex: '9999'
  });
  doc.body.style.position = 'relative';
  doc.body.append(duk);
  if (!punkter.length) return;

  const c = duk.getContext('2d', { willReadFrequently: true });
  const r = lage === 'mobil' ? 18 : 26;
  const vanster = ram.left + doc.defaultView.scrollX;
  const topp = ram.top + doc.defaultView.scrollY;
  c.globalAlpha = Math.max(0.04, Math.min(0.35, 6 / Math.sqrt(punkter.length)));
  for (const p of punkter) {
    const x = vanster + p.x * ram.width;
    const y = topp + p.y;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const bild = c.getImageData(0, 0, bredd, hojd);
  const d = bild.data;
  let max = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > max) max = d[i];
  if (!max) return;
  // Guld #8a5a2c för enstaka klick, rost #8a3d2c och sedan mörkt för de täta
  const steg = [[138, 90, 44], [138, 61, 44], [74, 24, 16]];
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / max;
    if (!a) continue;
    const t = a * (steg.length - 1);
    const k = Math.min(steg.length - 2, Math.floor(t));
    const f = t - k;
    d[i] = steg[k][0] + (steg[k + 1][0] - steg[k][0]) * f;
    d[i + 1] = steg[k][1] + (steg[k + 1][1] - steg[k][1]) * f;
    d[i + 2] = steg[k][2] + (steg[k + 1][2] - steg[k][2]) * f;
    d[i + 3] = Math.min(215, a * 400);
  }
  c.putImageData(bild, 0, 0);
}

$('dagar').addEventListener('change', hamta);
for (const knapp of document.querySelectorAll('[data-lage]')) {
  knapp.addEventListener('click', () => {
    tillstand.lage = knapp.dataset.lage;
    for (const k of document.querySelectorAll('[data-lage]')) {
      k.setAttribute('aria-pressed', String(k === knapp));
    }
    ritaSidor();
  });
}
hamta();
