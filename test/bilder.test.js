'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const B = require('../verktyg/bilder.js');
const F = require('../lib/fotomatt.js');

/*
 * Katalogfotona finns i flera bredder for srcset. Namnen och bredderna
 * anvands pa tva stallen: verktyg/bilder.js skapar filerna efter bygget,
 * och filtret foto skriver adresserna i sidorna. Gar de isar pekar sidan pa
 * bilder som inte finns, och det syns inte i bygget, bara som trasiga
 * bilder hos besokaren. De har testen haller ihop dem.
 *
 * Sa gick det till i september 2026: mallen skrev 1400w rakt ut, men tre
 * foton ar smalare an sa och far darfor sin storsta avif i sin egen bredd.
 * Pa datorn valde webblasaren 900w och allt sag helt ut. Pa mobilen, dar
 * rutan ar 92 procent av skarmen och skarmen ar tat, valde den 1400w, som
 * inte fanns for de fotona. Darav testet langst ner.
 */

// Hamtar ut filtren ur eleventykonfigurationen utan att starta Eleventy.
function filter(namn) {
  const konfig = require('../.eleventy.js');
  const funna = {};
  konfig({
    addPassthroughCopy() {},
    addWatchTarget() {},
    addFilter(n, f) { funna[n] = f; }
  });
  return funna[namn];
}

const foto = filter('foto');

// Bredderna en srcset lovar, ur strangen mallen skriver.
function bredderna(srcset) {
  return srcset.split(',').map((del) => Number(del.trim().split(' ')[1].replace('w', '')));
}

// Filnamnen en srcset pekar pa.
function filerna(srcset) {
  return srcset.split(',').map((del) => path.basename(del.trim().split(' ')[0]));
}

const fotona = fs.readdirSync(F.FOTOMAPP).filter((n) => /\.jpe?g$/i.test(n));

/* ---------- namnen ---------- */

test('mallarna och bildverktyget kommer overens om filnamnen', () => {
  // Samma funktion pa bada stallen, sa de kan inte ga isar. Testet star
  // kvar for att fanga en framtida kopia av logiken.
  assert.equal(B.variantnamn, F.variantnamn);
  assert.equal(
    F.variantnamn('andtraskarbrada-massiv-ek-1.jpg', 480),
    'andtraskarbrada-massiv-ek-1-480.jpg'
  );
  assert.equal(
    F.variantnamn('andtraskarbrada-massiv-ek-1.jpg', 900, 'avif'),
    'andtraskarbrada-massiv-ek-1-900.avif'
  );
});

test('bade jpg och jpeg funkar, och andelsen dubbleras inte', () => {
  assert.equal(F.variantnamn('a.jpg', 480), 'a-480.jpg');
  assert.equal(F.variantnamn('a.jpeg', 480), 'a-480.jpg');
  assert.equal(F.variantnamn('a.JPG', 480), 'a-480.jpg');
});

test('ett filnamn med punkter i sig behaller dem', () => {
  assert.equal(F.variantnamn('brada.nr.4.jpg', 900), 'brada.nr.4-900.jpg');
});

test('verktyget hoppar over varianter av varianter', () => {
  // Skapade filer heter nagot-480.jpg. Kors bildverktyget om utan att sidan
  // byggts pa nytt far de inte skalas i sin tur till nagot-480-480.jpg.
  const finns = (n) => n === 'brada.jpg';
  assert.ok(F.arVariant('brada-480.jpg', finns), 'en variant ska kannas igen som variant');
  assert.ok(F.arVariant('brada-900.avif', finns));
  assert.equal(F.arVariant('brada.jpg', finns), false, 'ett original ar ingen variant');
});

test('panelens egna filnamn raknas som original, inte som varianter', () => {
  /*
   * Sa gick det till i september 2026: fotona doptes om efter panelens
   * monster, slug-1.jpg, och da slutade de pa bindestreck och en siffra.
   * Verktyget sallade bort dem som varianter, inget foto fick nagra
   * varianter, och sidorna pekade pa 35 filer som aldrig skapades.
   * Siffran duger alltsa inte som kannetecken, det ar originalet intill
   * som avgor.
   */
  const finns = (n) => ['andtraskarbrada-saftranna.jpg'].includes(n);

  assert.equal(
    F.arVariant('andtraskarbrada-saftranna-1.jpg', () => false),
    false,
    'panelens forsta uppladdning ar ett original'
  );
  assert.equal(F.arVariant('schackbrade-andtra-2.jpg', () => false), false);

  // Ligger det ett original med samma stam intill ar det daremot en variant.
  assert.ok(F.arVariant('andtraskarbrada-saftranna-900.jpg', finns));
});

test('varje foto i fotomappen raknas som ett original', () => {
  // Samma sallning som verktyget gor. Inget foto som sortimentet anvander
  // far falla bort har, for da byggs inga varianter till det.
  const finns = (n) => fs.existsSync(path.join(F.FOTOMAPP, n));
  for (const namn of fotona) {
    assert.equal(F.arVariant(namn, finns), false, namn + ' sallas bort som variant');
  }
});

/* ---------- bredderna ---------- */

test('varianterna kommer i flera bredder, annars ar srcset meningslos', () => {
  assert.ok(F.BREDDER.length >= 2, 'det behovs minst tva bredder att valja mellan');
  assert.equal(B.BREDDER, F.BREDDER, 'verktyget och mallarna ska rakna pa samma lista');
});

test('en bredd som ar lika stor som fotot eller storre hoppas over', () => {
  // Att skala upp ger inga fler bildpunkter, bara en storre fil.
  assert.deepEqual(F.bredderFor(1400), [480, 900, 1400]);
  assert.deepEqual(F.bredderFor(1035), [480, 900, 1035]);
  assert.deepEqual(F.bredderFor(900), [480, 900], 'fotots egen bredd ska inte komma tva ganger');
  assert.deepEqual(F.bredderFor(700), [480, 700]);
  assert.deepEqual(F.bredderFor(300), [300], 'ett litet foto far bara sig sjalvt');
});

test('fotots egen bredd ar alltid med och ligger sist', () => {
  for (const bredd of [200, 480, 481, 900, 1035, 1264, 1400, 3000]) {
    const lista = F.bredderFor(bredd);
    assert.equal(lista[lista.length - 1], bredd, bredd + ' saknar sin egen bredd sist');
    assert.deepEqual(lista, [...lista].sort((a, b) => a - b), bredd + ' ger obestigande ordning');
  }
});

/* ---------- matten ---------- */

test('matten lases ratt ur ett jpeg-huvud', () => {
  const m = F.matt(fs.readFileSync(path.join(F.FOTOMAPP, 'andtraskarbrada-massiv-ek-1.jpg')));
  assert.equal(m.bredd, 1400);
  assert.equal(m.hojd, 1050);
});

test('varje foto i sortimentet gar att lasa matten pa', () => {
  for (const namn of fotona) {
    const f = foto(namn);
    assert.ok(f.bredd > 0 && f.hojd > 0, namn + ' gav inga matt');
  }
});

test('nagot som inte ar ett foto ger inga matt i stallet for att krascha', () => {
  assert.equal(F.matt(Buffer.from('inte en bild')), null);
  const f = foto('finns-inte.jpg');
  assert.equal(f.bredd, null);
  assert.equal(f.avif, '', 'utan matt ska ingen srcset gissas fram');
  assert.equal(f.reserv, '/assets/foto/finns-inte.jpg');
});

/* ---------- srcset mot verkligheten ---------- */

test('srcset lovar bara bredder som verktyget faktiskt skapar', () => {
  for (const namn of fotona) {
    const f = foto(namn);
    const vantade = F.bredderFor(f.bredd);

    assert.deepEqual(bredderna(f.avif), vantade, namn + ' lovar andra avif-bredder an som skapas');
    assert.deepEqual(bredderna(f.jpeg), vantade, namn + ' lovar andra jpeg-bredder an som skapas');
  }
});

test('storsta jpeg ar originalet sjalvt, det skalas aldrig om', () => {
  for (const namn of fotona) {
    const f = foto(namn);
    const filer = filerna(f.jpeg);
    assert.equal(filer[filer.length - 1], namn, namn + ' pekar inte pa sig sjalv i sin storsta bredd');
    assert.equal(filer.filter((n) => n === namn).length, 1);
  }
});

test('reservadressen pekar pa en fil som verktyget skapar', () => {
  for (const namn of fotona) {
    const f = foto(namn);
    const fil = path.basename(f.reserv);
    assert.ok(
      filerna(f.jpeg).includes(fil),
      namn + ' har en reservadress, ' + fil + ', som ingen srcset namner'
    );
  }
});

test('bildadresserna pekar in i fotomappen', () => {
  const f = foto('andtraskarbrada-massiv-ek-1.jpg');
  for (const adress of [f.reserv].concat(f.avif.split(',')).concat(f.jpeg.split(','))) {
    assert.match(adress.trim(), /^\/assets\/foto\//);
  }
});
