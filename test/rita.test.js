'use strict';

const test = require('node:test');
const assert = require('node:assert');

const K = require('../assets/konfigurator.js');

/*
 * Ritningen av bradan. Rutorna ar de enda elementen med en egen fargkod, sa
 * antalet 'fill="#' ar antalet rutor. Adringens farg star orord i stroke, och
 * gar darfor att leta efter nar man vill veta vilket traslag som anvants.
 */

const EK = '#8a6238';
const VALNOT = '#3d2717';
const LONN = '#c2ac82';

// Rannan ar det enda som ritas med den har genomskinligheten.
const RANNA = 'stroke-opacity="0.42"';

function antalRutor(svg) {
  return (svg.match(/fill="#/g) || []).length;
}

function harTra(svg, adring) {
  return svg.indexOf('stroke="' + adring + '"') >= 0;
}

/* ---------- samma indata ger samma bild ---------- */

test('ritningen ar densamma varje gang', () => {
  const val = { monster: 'rutor', traA: 'ek', traB: 'valnot', storlek: '4530' };
  assert.equal(K.rita(val), K.rita(val));
});

test('ritningen ar densamma i bygget som i webblasaren', () => {
  // Adringen far inte komma ur Math.random eller Math.sin. Testet skulle inte
  // fanga en motorskillnad, men det fangar att nagon byter ut hashen.
  const val = { monster: 'mursten', traA: 'ask', traB: 'valnot', storlek: '6032' };
  const forst = K.rita(val);
  Math.random();
  assert.equal(K.rita(val), forst);
});

test('klippbanans id kommer ur bradan, inte ur en uppraknare', () => {
  const val = { monster: 'hel', traA: 'ek', storlek: '4530' };
  const id = /id="([^"]+)"/.exec(K.rita(val))[1];
  K.rita({ monster: 'rutor', traA: 'lonn', traB: 'valnot', storlek: '4026' });
  assert.equal(/id="([^"]+)"/.exec(K.rita(val))[1], id, 'samma brada ska fa samma id');
});

/* ---------- matten ---------- */

test('bilden far bradans proportioner', () => {
  assert.match(K.rita({ monster: 'hel', traA: 'ek', storlek: '4530' }), /viewBox="0 0 450 300"/);
  assert.match(K.rita({ monster: 'hel', traA: 'ek', storlek: '6032' }), /viewBox="0 0 600 320"/);
});

test('rutnatet gar att styra for de sma korten', () => {
  const svg = K.rita({ monster: 'rutor', traA: 'ek', traB: 'valnot', storlek: '4026' }, { kolumner: 4, rader: 3 });
  assert.equal(antalRutor(svg), 12);
});

test('en storre brada far fler rutor, inte storre rutor', () => {
  const liten = antalRutor(K.rita({ monster: 'hel', traA: 'ek', storlek: '4026' }));
  const stor = antalRutor(K.rita({ monster: 'hel', traA: 'ek', storlek: '6032' }));
  assert.ok(stor > liten, 'slaktarbradan ska ha fler stavar an den lilla');
});

/* ---------- monstren ---------- */

test('hel brada ritas i ett enda traslag', () => {
  const svg = K.rita({ monster: 'hel', traA: 'ek', traB: 'valnot', storlek: '4530' });
  assert.ok(harTra(svg, EK), 'eken ska finnas');
  assert.ok(!harTra(svg, VALNOT), 'andra traslaget hor inte hemma i en hel brada');
});

test('monster med tva platser ritas i bada traslagen', () => {
  for (const monster of ['rander', 'rutor', 'mursten']) {
    const svg = K.rita({ monster: monster, traA: 'ek', traB: 'valnot', storlek: '4530' });
    assert.ok(harTra(svg, EK), monster + ' saknar det forsta traslaget');
    assert.ok(harTra(svg, VALNOT), monster + ' saknar det andra traslaget');
  }
});

test('monstren ser olika ut', () => {
  const val = { traA: 'ek', traB: 'valnot', storlek: '4530' };
  const bilder = ['hel', 'rander', 'rutor', 'mursten'].map((m) => K.rita({ ...val, monster: m }));
  const unika = new Set(bilder);
  assert.equal(unika.size, 4, 'fyra monster ska ge fyra olika bilder');
});

test('mursten forskjuter varannan rad och far darfor fler rutor', () => {
  const val = { traA: 'ek', traB: 'valnot', storlek: '4530' };
  assert.ok(
    antalRutor(K.rita({ ...val, monster: 'mursten' })) > antalRutor(K.rita({ ...val, monster: 'rutor' })),
    'de forskjutna raderna behover en ruta till for att na kanten'
  );
});

/* ---------- murstenen ---------- */

// Rutorna ar de enda rektanglarna med egen fargkod, sa de gar att lasa ut.
function stavar(svg) {
  const ut = [];
  const monster = /<rect x="([-0-9.]+)" y="([-0-9.]+)" width="([0-9.]+)" height="([0-9.]+)" fill="#/g;
  let m;
  while ((m = monster.exec(svg)) !== null) {
    ut.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) });
  }
  return ut;
}

test('murstenens stenar ar liggande rektanglar, inte kvadrater', () => {
  const s = stavar(K.rita({ monster: 'mursten', traA: 'ek', traB: 'valnot', traC: 'lonn', storlek: '4530' }));
  const bredast = s.reduce((a, b) => (b.w > a.w ? b : a));
  assert.ok(bredast.w > bredast.h * 1.5, 'stenen ska vara tydligt bredare an hog, var ' + bredast.w + ' x ' + bredast.h);
});

test('de andra monstren har kvadratiska stavar', () => {
  for (const monster of ['hel', 'rander', 'rutor']) {
    const s = stavar(K.rita({ monster: monster, traA: 'ek', traB: 'valnot', storlek: '4530' }));
    const kvot = s[0].w / s[0].h;
    assert.ok(kvot > 0.8 && kvot < 1.25, monster + ' ska ha kvadratiska stavar, kvoten var ' + kvot);
  }
});

test('murstenens bruk ritas i det tredje traslaget', () => {
  const svg = K.rita({ monster: 'mursten', traA: 'ek', traB: 'valnot', traC: 'lonn', storlek: '4530' });
  assert.ok(harTra(svg, EK), 'forsta stenen saknas');
  assert.ok(harTra(svg, VALNOT), 'andra stenen saknas');
  assert.ok(harTra(svg, LONN), 'bruket saknas');
});

test('bruket byter traslag nar kunden byter', () => {
  const bas = { monster: 'mursten', traA: 'ek', traB: 'ask', storlek: '4530' };
  assert.ok(harTra(K.rita({ ...bas, traC: 'valnot' }), VALNOT), 'bruk i valnot');
  assert.equal(harTra(K.rita({ ...bas, traC: 'lonn' }), VALNOT), false, 'inget valnotsbruk kvar');
});

test('murstenen har inga limfogar i black, bruket ar sjalva fogen', () => {
  const fogar = /stroke-opacity="0.3"[^>]*>(.*?)<\/g>/.exec(
    K.rita({ monster: 'mursten', traA: 'ek', traB: 'valnot', traC: 'lonn', storlek: '4530' })
  );
  assert.equal(fogar[1], '', 'murstenen ska inte rita nagra fogstreck');
});

test('de andra monstren har kvar sina limfogar', () => {
  const fogar = /stroke-opacity="0.3"[^>]*>(.*?)<\/g>/.exec(
    K.rita({ monster: 'rutor', traA: 'ek', traB: 'valnot', storlek: '4530' })
  );
  assert.ok(fogar[1].length > 0, 'rutmonstret ska ha limfogar');
});

/* ---------- naturlig ---------- */

test('naturlig blandar flera traslag utan att kunden valt nagot', () => {
  const svg = K.rita({ monster: 'naturlig', storlek: '4530' });
  const anvanda = K.DEFINITIONER.traslag.filter((t) => harTra(svg, t.adring));
  assert.ok(anvanda.length >= 2, 'naturlig ska blanda, inte bli enfargad');
});

test('naturlig har olika breda stavar', () => {
  const s = stavar(K.rita({ monster: 'naturlig', storlek: '4530' }));
  const bredder = new Set(s.map((r) => r.w));
  assert.ok(bredder.size > 1, 'stavarna ska inte vara lika breda, det ar poangen');
});

test('naturlig ritas likadant varje gang', () => {
  assert.equal(K.rita({ monster: 'naturlig', storlek: '4530' }), K.rita({ monster: 'naturlig', storlek: '4530' }));
});

test('naturlig namner inga traslag i beskrivningen', () => {
  const svg = K.rita({ monster: 'naturlig', storlek: '4530' });
  assert.match(svg, /aria-label="Skiss av brädan: naturlig, 45 × 30 cm"/);
});

test('traslaget syns i bilden', () => {
  const svg = K.rita({ monster: 'rutor', traA: 'lonn', traB: 'valnot', storlek: '4530' });
  assert.ok(harTra(svg, LONN));
  assert.ok(harTra(svg, VALNOT));
  assert.ok(!harTra(svg, EK));
});

/* ---------- saftrannan ---------- */

test('rannan ritas bara nar den ar vald', () => {
  const bas = { monster: 'hel', traA: 'ek', storlek: '4530' };
  assert.equal(K.rita({ ...bas, ranna: false }).indexOf(RANNA) >= 0, false);
  assert.ok(K.rita({ ...bas, ranna: true }).indexOf(RANNA) >= 0, 'rannan ska synas');
});

test('de sma korten ritar aldrig ranna', () => {
  const svg = K.rita({ monster: 'hel', traA: 'ek', storlek: '4530', ranna: true }, { kolumner: 3, rader: 3, ranna: false });
  assert.equal(svg.indexOf(RANNA) >= 0, false);
});

/* ---------- tillganglighet ---------- */

test('den stora bilden beskrivs for skarmlasare', () => {
  const svg = K.rita({ monster: 'rutor', traA: 'ek', traB: 'valnot', storlek: '4530', ranna: true });
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Skiss av brädan: rutmönster i ek och valnöt, 45 × 30 cm, med saftränna"/);
});

test('dekorbilder hoppas over av skarmlasare', () => {
  const svg = K.rita({ monster: 'rutor', traA: 'ek', traB: 'valnot', storlek: '4026' }, { kolumner: 4, rader: 3, dekor: true });
  assert.match(svg, /aria-hidden="true"/);
  assert.equal(svg.indexOf('aria-label') >= 0, false);
});

/* ---------- svg:n ar hel ---------- */

test('taggarna gar ihop', () => {
  const svg = K.rita({ monster: 'mursten', traA: 'ek', traB: 'valnot', storlek: '4530', ranna: true });
  assert.match(svg, /^<svg [^>]*>/);
  assert.match(svg, /<\/svg>$/);
  assert.equal((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, 'lika manga g som slut-g');
});
