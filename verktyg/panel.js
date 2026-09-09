'use strict';

/* Verkstadspanelens klientdel. Inget ramverk, ingen byggkedja. */

const TEXTURER = ['ek', 'mix', 'valnot', 'bricka'];
const SAJT = 'http://localhost:4321';

let produkter = [];
let oanvandaFoton = [];
let valdIndex = null;
let visningsdagar = 7;

/* En sald brada ligger kvar i katalogen med sitt band i visningsdagar dagar,
   raknat fran saldDatum. Antalet kommer fran lib/sortiment.js via /api/allt. */

function idagISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function dagarKvar(b) {
  if (!b.saldDatum) return null;
  const salt = Date.parse(b.saldDatum + 'T00:00:00Z');
  if (Number.isNaN(salt)) return null;
  const idag = Date.parse(idagISO() + 'T00:00:00Z');
  return visningsdagar - Math.round((idag - salt) / 86400000);
}

function statustext(b) {
  const kvar = dagarKvar(b);
  if (kvar === null) return ' såld';
  if (kvar > 1) return ' såld, bandet visas ' + kvar + ' dagar till';
  if (kvar === 1) return ' såld, bandet visas sista dagen i morgon';
  if (kvar === 0) return ' såld, bandet visas sista dagen i dag';
  return ' såld, borta ur katalogen';
}

/* ---------- kommunikation ---------- */

async function hamta() {
  const r = await fetch('/api/allt');
  const d = await r.json();
  produkter = d.produkter;
  oanvandaFoton = d.oanvandaFoton;
  if (d.visningsdagar) visningsdagar = d.visningsdagar;
}

async function post(vag, kropp, typ) {
  const huvuden = { 'X-Panel': '1' };
  if (typ) huvuden['Content-Type'] = typ;
  return fetch(vag, { method: 'POST', headers: huvuden, body: kropp });
}

/* ---------- adress och matt, samma regler som pa servern ---------- */

const ERSATT = { 'å': 'a', 'ä': 'a', 'ö': 'o', 'é': 'e', 'è': 'e', 'ü': 'u', 'ø': 'o', 'æ': 'ae' };

function tillSlug(titel) {
  const ut = String(titel || '')
    .toLowerCase()
    .replace(/[åäöéèüøæ]/g, (t) => ERSATT[t])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ut === '' ? 'brada' : ut;
}

function delarAvMatt(strang) {
  const m = String(strang || '').match(/([\d,.]+)\s*×\s*([\d,.]+)(?:\s*×\s*([\d,.]+))?/);
  return m ? { l: m[1], b: m[2], t: m[3] || '' } : { l: '', b: '', t: '' };
}

function tillMatt(l, b, t) {
  const n = (v) => String(v == null ? '' : v).trim().replace('.', ',');
  if (n(l) === '' || n(b) === '') return '';
  const delar = n(t) === '' ? [n(l), n(b)] : [n(l), n(b), n(t)];
  return delar.join(' × ') + ' cm';
}

/* ---------- meddelanden ---------- */

function visa(html) {
  document.getElementById('meddelanden').innerHTML = html;
}

function visaFel(fel) {
  visa('<div class="meddelande fel"><strong>Det gick inte att spara.</strong><ul>' +
    fel.map((f) => '<li>' + f + '</li>').join('') + '</ul></div>');
}

/* ---------- listan ---------- */

function ritaLista() {
  const lista = document.getElementById('lista');
  lista.innerHTML = '';

  if (produkter.length === 0) {
    lista.innerHTML = '<p class="tom">Inga brädor än. Tryck Ny bräda.</p>';
  }

  produkter.forEach((b, i) => {
    const rad = document.createElement('button');
    rad.className = 'rad';
    rad.type = 'button';
    rad.setAttribute('aria-current', String(i === valdIndex));

    const nr = document.createElement('span');
    nr.className = 'nr';
    nr.textContent = 'N:o ' + b.nr;

    const titel = document.createElement('span');
    titel.className = 'titel';
    titel.textContent = b.titel || '(utan titel)';
    if (b.sald || b.pabestallning) {
      const s = document.createElement('span');
      s.className = 'sald-markering';
      s.textContent = b.sald ? statustext(b) : ' på beställning';
      titel.appendChild(s);
    }

    const pris = document.createElement('span');
    pris.className = 'pris';
    pris.textContent = (b.pris || 0) + ' kr';

    rad.appendChild(nr);
    rad.appendChild(titel);
    rad.appendChild(pris);
    rad.onclick = () => { valdIndex = i; rita(); };
    lista.appendChild(rad);
  });

  const o = document.getElementById('oanvanda');
  o.textContent = '';
  if (oanvandaFoton.length) {
    const rubrik = document.createElement('strong');
    rubrik.textContent = 'Oanvända bilder i assets/foto:';
    o.appendChild(rubrik);
    for (const f of oanvandaFoton) {
      o.appendChild(document.createElement('br'));
      const c = document.createElement('code');
      c.textContent = f;
      o.appendChild(c);
    }
    const slut = document.createElement('p');
    slut.textContent = 'De ligger kvar på disken. Ta bort dem själv om de inte ska användas.';
    o.appendChild(slut);
  }
}

/* ---------- smabyggare ---------- */

function falt(etikett, varde, vidAndring, typ) {
  const d = document.createElement('div');
  d.className = 'falt';
  const l = document.createElement('label');
  l.textContent = etikett;
  d.appendChild(l);
  const i = document.createElement(typ === 'textarea' ? 'textarea' : 'input');
  // Typen maste sattas explicit: CSS matchar pa attributet input[type=text],
  // och utan attribut far faltet ingen bredd.
  if (typ !== 'textarea') i.type = typ || 'text';
  i.value = varde == null ? '' : varde;
  i.oninput = () => vidAndring(i.value);
  d.appendChild(i);
  return d;
}

function knapp(text, vidKlick, klass) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = klass || 'lag';
  b.textContent = text;
  b.onclick = vidKlick;
  return b;
}

/* ---------- formularet ---------- */

function ritaFormular() {
  const plats = document.getElementById('formularplats');
  plats.textContent = '';

  if (valdIndex == null || !produkter[valdIndex]) {
    const p = document.createElement('p');
    p.className = 'tom';
    p.textContent = 'Välj en bräda i listan, eller lägg till en ny.';
    plats.appendChild(p);
    return;
  }

  const b = produkter[valdIndex];

  /* Brädan */
  const g = document.createElement('fieldset');
  const gl = document.createElement('legend');
  gl.textContent = 'BRÄDAN';
  g.appendChild(gl);

  g.appendChild(falt('Titel', b.titel, (v) => {
    const foljde = !b.slug || b.slug === tillSlug(b.titel);
    b.titel = v;
    if (foljde) b.slug = tillSlug(v);
    ritaLista();
    uppdateraSlug();
  }));

  const par = document.createElement('div');
  par.className = 'par';
  par.appendChild(falt('N:o', b.nr, (v) => { b.nr = parseInt(v, 10) || 0; ritaLista(); }, 'number'));
  par.appendChild(falt('Pris i kronor', b.pris, (v) => { b.pris = parseInt(v, 10) || 0; ritaLista(); }, 'number'));
  g.appendChild(par);

  const sf = falt('Adress på sajten', b.slug, (v) => { b.slug = v; uppdateraSlug(); });
  sf.id = 'slugfalt';
  g.appendChild(sf);

  const varning = document.createElement('p');
  varning.id = 'slugvarning';
  varning.className = 'varningsrad';
  g.appendChild(varning);

  g.appendChild(falt('Kort text, står på katalogkortet', b.kort, (v) => { b.kort = v; }, 'textarea'));
  g.appendChild(falt('Längre text, står på produktsidan', b.beskrivning, (v) => { b.beskrivning = v; }, 'textarea'));
  g.appendChild(falt('Handskriven lapp, lämna tom för ingen', b.lapp, (v) => { b.lapp = v; }));

  const rad = document.createElement('div');
  rad.className = 'par';

  const td = document.createElement('div');
  td.className = 'falt';
  const tl = document.createElement('label');
  tl.textContent = 'Träplatshållare, syns bara utan foto';
  td.appendChild(tl);
  const sel = document.createElement('select');
  for (const t of TEXTURER) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    o.selected = b.textur === t;
    sel.appendChild(o);
  }
  sel.onchange = () => { b.textur = sel.value; };
  td.appendChild(sel);
  rad.appendChild(td);

  const sd = document.createElement('div');
  sd.className = 'falt';
  const sl = document.createElement('label');
  sl.textContent = 'Status';
  sd.appendChild(sl);
  const ke = document.createElement('label');
  ke.className = 'kryssrad';
  const kryss = document.createElement('input');
  kryss.type = 'checkbox';
  kryss.checked = !!b.sald;
  ke.appendChild(kryss);
  ke.appendChild(document.createTextNode('Såld'));
  sd.appendChild(ke);

  // En brada pa bestallning ligger inte fardig. Da far kortet lappen
  // "gors pa bestallning" och produktsidan skriver tillverkningstid.
  const be = document.createElement('label');
  be.className = 'kryssrad';
  const bkryss = document.createElement('input');
  bkryss.type = 'checkbox';
  bkryss.checked = !!b.pabestallning;
  bkryss.onchange = () => { b.pabestallning = bkryss.checked; ritaLista(); };
  be.appendChild(bkryss);
  be.appendChild(document.createTextNode('Görs på beställning'));
  sd.appendChild(be);

  // Datumet styr hur lange bandet sitter kvar. Det fylls i automatiskt vid
  // ikryssning men gar att backa, for en brada som salts i forra veckan.
  const datum = document.createElement('input');
  datum.type = 'date';
  datum.value = b.saldDatum || '';
  datum.hidden = !b.sald;
  datum.max = idagISO();
  datum.onchange = () => { b.saldDatum = datum.value; ritaLista(); };
  sd.appendChild(datum);

  kryss.onchange = () => {
    b.sald = kryss.checked;
    if (b.sald) {
      if (!b.saldDatum) b.saldDatum = idagISO();
    } else {
      delete b.saldDatum;
    }
    datum.value = b.saldDatum || '';
    datum.hidden = !b.sald;
    ritaLista();
  };
  rad.appendChild(sd);

  g.appendChild(rad);
  plats.appendChild(g);

  /* Mått och spec */
  const s = document.createElement('fieldset');
  const slg = document.createElement('legend');
  slg.textContent = 'MÅTT OCH SPEC';
  s.appendChild(slg);

  const d = delarAvMatt((b.spec || {})['Mått']);
  const satt = () => {
    b.spec = b.spec || {};
    const m = tillMatt(d.l, d.b, d.t);
    if (m) b.spec['Mått'] = m;
    else delete b.spec['Mått'];
    ritaSpec();
  };

  const tre = document.createElement('div');
  tre.className = 'tre';
  tre.appendChild(falt('Längd i cm', d.l, (v) => { d.l = v; satt(); }));
  tre.appendChild(falt('Bredd i cm', d.b, (v) => { d.b = v; satt(); }));
  tre.appendChild(falt('Tjocklek i cm, valfri', d.t, (v) => { d.t = v; satt(); }));
  s.appendChild(tre);

  const specplats = document.createElement('div');
  specplats.id = 'specplats';
  s.appendChild(specplats);

  s.appendChild(knapp('Lägg till specrad', () => {
    b.spec = b.spec || {};
    let n = 1;
    while (b.spec['Nytt fält ' + n] !== undefined) n += 1;
    b.spec['Nytt fält ' + n] = '';
    ritaSpec();
  }));
  plats.appendChild(s);

  /* Foton */
  const f = document.createElement('fieldset');
  const fl = document.createElement('legend');
  fl.textContent = 'FOTON';
  f.appendChild(fl);

  const bildplats = document.createElement('div');
  bildplats.id = 'bildplats';
  bildplats.className = 'bilder';
  f.appendChild(bildplats);

  const zon = document.createElement('div');
  zon.className = 'slappzon';
  const zontext = document.createElement('div');
  zontext.textContent = 'Dra in bilder här, eller ';
  const valj = document.createElement('label');
  valj.className = 'filvalj';
  valj.textContent = 'välj filer';
  const filval = document.createElement('input');
  filval.type = 'file';
  filval.accept = 'image/*';
  filval.multiple = true;
  filval.hidden = true;
  filval.onchange = () => laddaUpp(filval.files);
  valj.appendChild(filval);
  zontext.appendChild(valj);
  zon.appendChild(zontext);

  const zonhjalp = document.createElement('div');
  zonhjalp.className = 'zonhjalp';
  zonhjalp.textContent = 'Roteras, beskärs till 4:3, metadata rensas, ljuset jämnas mot resten av katalogen.';
  zon.appendChild(zonhjalp);

  zon.ondragover = (e) => { e.preventDefault(); zon.classList.add('over'); };
  zon.ondragleave = () => zon.classList.remove('over');
  zon.ondrop = (e) => {
    e.preventDefault();
    zon.classList.remove('over');
    laddaUpp(e.dataTransfer.files);
  };
  f.appendChild(zon);
  plats.appendChild(f);

  /* Knappar */
  const k = document.createElement('div');
  k.className = 'knappar';

  const upp = knapp('Flytta upp', () => flytta(-1));
  upp.disabled = valdIndex === 0;
  const ner = knapp('Flytta ner', () => flytta(1));
  ner.disabled = valdIndex === produkter.length - 1;

  const bort = knapp('Ta bort brädan', () => {
    if (!confirm('Ta bort N:o ' + b.nr + ', ' + (b.titel || 'utan titel') + '?\n\nBildfilerna ligger kvar på disken.')) return;
    produkter.splice(valdIndex, 1);
    valdIndex = null;
    rita();
  }, 'lag fara');

  k.appendChild(upp);
  k.appendChild(ner);
  k.appendChild(bort);
  plats.appendChild(k);

  ritaSpec();
  ritaBilder();
  uppdateraSlug();
}

function uppdateraSlug() {
  const b = produkter[valdIndex];
  const v = document.getElementById('slugvarning');
  if (!b || !v) return;

  const i = document.querySelector('#slugfalt input');
  if (i && i.value !== b.slug) i.value = b.slug;

  v.textContent = b.urspSlug && b.urspSlug !== b.slug
    ? 'Adressen ändras från ' + b.urspSlug + ' till ' + b.slug + '. Gamla länkar till brädan slutar fungera.'
    : '';
}

/* ---------- spec och bilder ---------- */

function ritaSpec() {
  const plats = document.getElementById('specplats');
  if (!plats) return;
  const b = produkter[valdIndex];
  plats.textContent = '';

  if ((b.spec || {})['Mått']) {
    const info = document.createElement('p');
    info.className = 'mattinfo';
    info.textContent = 'Måttraden blir: ' + b.spec['Mått'];
    plats.appendChild(info);
  }

  for (const namn of Object.keys(b.spec || {})) {
    if (namn === 'Mått') continue; // sätts av de tre måttfälten ovan

    const rad = document.createElement('div');
    rad.className = 'specrad';

    const n = document.createElement('input');
    n.type = 'text';
    n.value = namn;
    n.onchange = () => {
      if (!n.value.trim() || n.value === namn) { ritaSpec(); return; }
      const nyckel = Object.keys(b.spec);
      const nytt = {};
      // Behall ordningen, byt bara namnet pa den rad som andrades
      for (const k of nyckel) {
        if (k === namn) nytt[n.value] = b.spec[k];
        else nytt[k] = b.spec[k];
      }
      b.spec = nytt;
      ritaSpec();
    };

    const v = document.createElement('input');
    v.type = 'text';
    v.value = b.spec[namn];
    v.oninput = () => { b.spec[namn] = v.value; };

    rad.appendChild(n);
    rad.appendChild(v);
    rad.appendChild(knapp('Ta bort', () => { delete b.spec[namn]; ritaSpec(); }, 'lag fara'));
    plats.appendChild(rad);
  }
}

function ritaBilder() {
  const plats = document.getElementById('bildplats');
  if (!plats) return;
  const b = produkter[valdIndex];
  plats.textContent = '';

  (b.bilder || []).forEach((bild, i) => {
    const ruta = document.createElement('div');
    ruta.className = 'bild';

    const img = document.createElement('img');
    const nyBild = typeof bild !== 'string';
    img.src = nyBild ? (bild.forhandsvisning || '') : SAJT + '/assets/foto/' + bild;
    img.alt = nyBild ? 'ny bild' : bild;
    ruta.appendChild(img);

    const under = document.createElement('div');
    under.className = 'under';
    const namn = document.createElement('span');
    namn.textContent = nyBild ? 'ny, sparas vid Spara' : bild;
    under.appendChild(namn);
    under.appendChild(knapp('Ta bort', () => { b.bilder.splice(i, 1); ritaBilder(); }, 'lag fara'));
    ruta.appendChild(under);

    if (i === 0) {
      const flagga = document.createElement('div');
      flagga.className = 'forsta';
      flagga.textContent = 'Stor bild och katalogkort';
      ruta.appendChild(flagga);
    }

    if (nyBild) {
      const reg = document.createElement('input');
      reg.type = 'range';
      reg.min = '0';
      reg.max = '1';
      reg.step = '0.02';
      reg.value = String(bild.offset);
      reg.title = 'Flytta beskärningen';
      let vantar = null;
      reg.oninput = () => {
        bild.offset = parseFloat(reg.value);
        clearTimeout(vantar);
        vantar = setTimeout(async () => {
          const r = await post('/api/bild/' + bild.bildId + '/forhandsvisning?offset=' + bild.offset);
          if (!r.ok) return;
          if (bild.forhandsvisning) URL.revokeObjectURL(bild.forhandsvisning);
          bild.forhandsvisning = URL.createObjectURL(await r.blob());
          img.src = bild.forhandsvisning;
        }, 120);
      };
      ruta.appendChild(reg);
    }

    plats.appendChild(ruta);
  });
}

/* ---------- atgarder ---------- */

async function laddaUpp(filer) {
  const b = produkter[valdIndex];
  b.bilder = b.bilder || [];

  for (const fil of filer) {
    const r = await post('/api/bild', fil, fil.type || 'application/octet-stream');
    const d = await r.json();
    if (!r.ok) { visaFel(d.fel || ['Kunde inte läsa bilden.']); continue; }

    const bild = { bildId: d.id, offset: 0.5, forhandsvisning: '' };
    const fv = await post('/api/bild/' + d.id + '/forhandsvisning?offset=0.5');
    if (fv.ok) bild.forhandsvisning = URL.createObjectURL(await fv.blob());
    b.bilder.push(bild);
    ritaBilder();
  }
}

function flytta(steg) {
  const j = valdIndex + steg;
  if (j < 0 || j >= produkter.length) return;
  const t = produkter[valdIndex];
  produkter[valdIndex] = produkter[j];
  produkter[j] = t;
  produkter.forEach((b, n) => { b.nr = n + 1; }); // N:o följer ordningen
  valdIndex = j;
  rita();
}

function nyBrada() {
  const nr = produkter.reduce((h, b) => Math.max(h, b.nr || 0), 0) + 1;
  produkter.push({
    nr: nr,
    slug: '',
    titel: '',
    kort: '',
    beskrivning: '',
    pris: 0,
    spec: { 'Ytbehandling': 'Paraffinolja och bivax' },
    textur: 'ek',
    bilder: [],
    lapp: '',
    pabestallning: false,
    sald: false
  });
  valdIndex = produkter.length - 1;
  rita();
}

async function spara(sparaKnapp) {
  sparaKnapp.disabled = true;
  const text = sparaKnapp.textContent;
  sparaKnapp.textContent = 'Sparar och bygger...';
  visa('');

  const rent = produkter.map((b) => {
    const kopia = Object.assign({}, b);
    delete kopia.urspSlug;
    kopia.bilder = (b.bilder || []).map((x) =>
      typeof x === 'string' ? x : { bildId: x.bildId, offset: x.offset });
    return kopia;
  });

  try {
    const r = await post('/api/spara', JSON.stringify({ produkter: rent }), 'application/json');
    const d = await r.json();

    if (!r.ok) { visaFel(d.fel || ['Okänt fel.']); return; }

    if (d.bygge.ok) {
      visa('<div class="meddelande ok"><strong>Sparat och byggt.</strong> ' +
        '<a href="' + SAJT + '/" target="_blank" rel="noreferrer">Titta på sajten</a></div>');
    } else {
      const ruta = document.createElement('div');
      ruta.className = 'meddelande fel';
      const r1 = document.createElement('strong');
      r1.textContent = 'Sparat, men bygget gick fel.';
      const pre = document.createElement('pre');
      pre.textContent = d.bygge.utskrift;
      ruta.appendChild(r1);
      ruta.appendChild(pre);
      document.getElementById('meddelanden').textContent = '';
      document.getElementById('meddelanden').appendChild(ruta);
    }

    await hamta();
    produkter.forEach((b) => { b.urspSlug = b.slug; });
    if (valdIndex != null && valdIndex >= produkter.length) valdIndex = null;
    rita();
  } catch (e) {
    visaFel(['Kunde inte nå panelen: ' + e.message]);
  } finally {
    sparaKnapp.disabled = false;
    sparaKnapp.textContent = text;
  }
}

/* ---------- start ---------- */

function rita() {
  ritaLista();
  ritaFormular();
}

document.getElementById('ny').onclick = nyBrada;
document.getElementById('spara').onclick = function () { spara(this); };

hamta().then(() => {
  produkter.forEach((b) => { b.urspSlug = b.slug; });
  rita();
}).catch((e) => visaFel(['Kunde inte hämta brädorna: ' + e.message]));
