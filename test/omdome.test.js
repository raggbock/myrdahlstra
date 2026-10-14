'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fejkD1 } = require('./hjalp/d1.js');
const sharp = require('sharp');
const { provJpeg, medBlock, GPS } = require('./hjalp/jpeg.js');

// Pages laddar endpointen som ESM. Importerna från lib/ skrivs om till
// absoluta adresser, som i bestallning.test.js.
const fil = path.join(__dirname, '../functions/api/omdome.js');
const source = fs.readFileSync(fil, 'utf8').replace(/'\.\.\/\.\.\/lib\/([\w-]+\.mjs)'/g, (_, namn) =>
  JSON.stringify(pathToFileURL(path.join(__dirname, '../lib', namn)).href));
const endpoint = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const SCHEMA = path.join(__dirname, '../db/omdome.sql');

const KOD = 'Ab3_-xYz9Q0w';

function databas() {
  const d1 = fejkD1(SCHEMA);
  d1.db.prepare("INSERT INTO inbjudan (kod, mal, skapad) VALUES (?, 'allmant', '2026-10-01')").run(KOD);
  return d1;
}

const falt = (extra = {}) => new URLSearchParams({
  kod: KOD, betyg: '4', namn: 'Karin', ort: 'Västerås',
  text: 'Fin bräda, används varje dag.', ...extra
});

// Samma fält som ett multipartformulär, med eller utan foto
function formular(extra = {}, foto) {
  const fd = new FormData();
  for (const [k, v] of falt(extra)) fd.append(k, v);
  if (foto !== undefined) fd.append('foto', new Blob([foto], { type: 'image/jpeg' }), foto.length ? 'foto.jpg' : '');
  return fd;
}

const oanvand = (d1) => d1.db.prepare('SELECT anvand FROM inbjudan WHERE kod = ?').get(KOD).anvand === null;

async function skicka(t, body, { d1 = databas(), origin = 'https://myrdahlstra.se', env = {}, resend } = {}) {
  const brev = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (resend) return resend();
    brev.push(JSON.parse(options.body));
    return new Response('{}');
  });
  const headers = origin ? { origin } : {};
  const request = new Request('https://myrdahlstra.se/api/omdome', { method: 'POST', body, headers });
  const svar = await (await endpoint).onRequestPost({
    request, env: { KLICK: d1, RESEND_API_KEY: 'test', ...env }
  });
  return { svar, brev, d1, rader: d1.db.prepare('SELECT * FROM omdome').all() };
}

test('ett omdöme sparas, koden märks som använd och Sebastian får en notis', async (t) => {
  const { svar, brev, d1, rader } = await skicka(t, falt());
  assert.equal(svar.status, 303);
  assert.equal(new URL(svar.headers.get('location')).pathname, '/omdome/tack/');
  assert.equal(rader.length, 1);
  assert.equal(rader[0].mal, 'allmant');
  assert.equal(rader[0].betyg, 4);
  assert.equal(rader[0].namn, 'Karin');
  assert.equal(rader[0].ort, 'Västerås');
  assert.match(rader[0].dag, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(d1.db.prepare('SELECT anvand FROM inbjudan WHERE kod = ?').get(KOD).anvand);
  assert.equal(brev.length, 1);
  assert.match(brev[0].subject, /4 av 5/);
  assert.match(brev[0].text, /från Karin/);
  assert.doesNotMatch(brev[0].text, /allmant/, 'databasens interna värde ska inte stå i notisen');
  assert.doesNotMatch(brev[0].text, /används varje dag/, 'kundens text ska inte stå i notisen');
});

test('samma kod två gånger ger ett omdöme och sedan 410', async (t) => {
  const d1 = databas();
  assert.equal((await skicka(t, falt(), { d1 })).svar.status, 303);
  const andra = await skicka(t, falt({ text: 'Ett andra försök med samma kod.' }), { d1 });
  assert.equal(andra.svar.status, 410);
  assert.equal(andra.rader.length, 1);
});

test('en okänd kod ger 400 och sparar ingenting', async (t) => {
  const { svar, rader } = await skicka(t, falt({ kod: 'ZZZZZZZZZZZZ' }));
  assert.equal(svar.status, 400);
  assert.equal(rader.length, 0);
});

test('felaktiga fält avvisas med 400', async (t) => {
  const fall = [
    { kod: 'kort' }, { betyg: '0' }, { betyg: '6' }, { betyg: '2.5' }, { betyg: '' },
    { namn: '' }, { namn: 'x'.repeat(41) }, { ort: 'x'.repeat(41) },
    { text: 'Kort' }, { text: 'x'.repeat(1501) }
  ];
  for (const extra of fall) {
    const { svar, rader } = await skicka(t, falt(extra));
    assert.equal(svar.status, 400, JSON.stringify(extra).slice(0, 60));
    assert.equal(rader.length, 0);
  }
});

test('ort får vara tom', async (t) => {
  const { svar, rader } = await skicka(t, falt({ ort: '' }));
  assert.equal(svar.status, 303);
  assert.equal(rader[0].ort, '');
});

test('stycken behålls men styrtecken och extra tomrader tas bort', async (t) => {
  const { rader } = await skicka(t, falt({
    namn: 'Kar\u0000in\n', text: 'Första stycket.\r\n\r\n\r\n\r\nAndra\u0007 stycket.  \r\nSista raden.'
  }));
  assert.equal(rader[0].namn, 'Kar in');
  assert.equal(rader[0].text, 'Första stycket.\n\nAndra stycket.\nSista raden.');
});

test('från en annan domän eller utan Origin sparas ingenting', async (t) => {
  for (const origin of ['https://annan.example', null]) {
    const { svar, rader } = await skicka(t, falt(), { origin });
    assert.equal(svar.status, 403);
    assert.equal(rader.length, 0);
  }
});

test('en för stor kropp avvisas med 413', async (t) => {
  const { svar, rader } = await skicka(t, falt({ text: 'x'.repeat(2 * 1024 * 1024 + 10) }));
  assert.equal(svar.status, 413);
  assert.equal(rader.length, 0);
});

test('utan databas svarar sidan 503 och säger det rakt ut', async (t) => {
  const { svar } = await skicka(t, falt(), { env: { KLICK: undefined } });
  assert.equal(svar.status, 503);
  assert.match(await svar.text(), /mejl/i);
});

test('ett misslyckat notismejl stoppar inte omdömet', async (t) => {
  const { svar, rader } = await skicka(t, falt(), { resend: () => new Response('nej', { status: 500 }) });
  assert.equal(svar.status, 303);
  assert.equal(rader.length, 1);
});

test('utan Resend-nyckel sparas omdömet ändå', async (t) => {
  const { svar, brev, rader } = await skicka(t, falt(), { env: { RESEND_API_KEY: '' } });
  assert.equal(svar.status, 303);
  assert.equal(brev.length, 0);
  assert.equal(rader.length, 1);
});

test('ett raderat omdömes id ges aldrig till ett nytt', () => {
  const d1 = fejkD1(SCHEMA);
  const ny = (kod) => {
    d1.db.prepare("INSERT INTO inbjudan (kod, mal, skapad) VALUES (?, 'allmant', '2026-10-01')").run(kod);
    return Number(d1.db.prepare(
      "INSERT INTO omdome (kod, mal, betyg, namn, ort, text, dag) VALUES (?, 'allmant', 5, 'A', '', 'Bra bräda!', '2026-10-01')"
    ).run(kod).lastInsertRowid);
  };
  const forsta = ny('AAAAAAAAAAAA');
  d1.db.prepare('DELETE FROM omdome WHERE id = ?').run(forsta);
  assert.ok(ny('BBBBBBBBBBBB') > forsta);
});

test('en GET skickar besökaren till skrivsidan', async () => {
  const svar = await (await endpoint).onRequestGet({ request: new Request('https://myrdahlstra.se/api/omdome') });
  assert.equal(svar.status, 302);
  assert.equal(new URL(svar.headers.get('location')).pathname, '/omdome/');
});

/* ---------- foto ---------- */

test('ett omdöme med foto sparas utan platsdata, och notisen säger med foto', async (t) => {
  const foto = medBlock(await provJpeg(), GPS);
  const { svar, rader, brev } = await skicka(t, formular({}, foto));
  assert.equal(svar.status, 303);
  const bild = Buffer.from(rader[0].bild);
  assert.equal(bild.includes(Buffer.from('GPSLatitude')), false, 'platsdatan ska vara borta');
  assert.equal((await sharp(bild).metadata()).width, 64);
  assert.match(brev[0].subject, /, med foto$/);
  assert.match(brev[0].text, /med foto har kommit in från Karin/);
});

test('ett multipartformulär utan foto sparar ingen bild och nämner inget foto', async (t) => {
  const { svar, rader, brev } = await skicka(t, formular());
  assert.equal(svar.status, 303);
  assert.equal(rader[0].bild, null);
  assert.doesNotMatch(brev[0].subject, /foto/);
});

test('ett tomt filfält räknas som inget foto', async (t) => {
  // Så skickar webbläsaren ett filfält där kunden inte valt något
  const { svar, rader } = await skicka(t, formular({}, Buffer.alloc(0)));
  assert.equal(svar.status, 303);
  assert.equal(rader[0].bild, null);
});

test('ett för stort foto ger 413, och varken text eller kod rörs', async (t) => {
  const d1 = databas();
  const stort = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(1500000)]);
  const { svar, rader } = await skicka(t, formular({}, stort), { d1 });
  assert.equal(svar.status, 413);
  assert.match(await svar.text(), /Fotot var för stort/);
  assert.equal(rader.length, 0);
  assert.ok(oanvand(d1), 'koden ska gå att använda igen');
});

test('en fil som inte är en JPEG ger 400, och varken text eller kod rörs', async (t) => {
  const d1 = databas();
  const { svar, rader } = await skicka(t, formular({}, Buffer.from('GIF89a inte en JPEG')), { d1 });
  assert.equal(svar.status, 400);
  assert.match(await svar.text(), /Fotot kunde inte läsas/);
  assert.equal(rader.length, 0);
  assert.ok(oanvand(d1));
});

test('omdome-bild.sql lägger till kolumnen i en databas som saknar den', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  // Kommatecknet efter dag tas bort, kommentaren efter det står kvar
  const schema = fs.readFileSync(SCHEMA, 'utf8').replace(/,([^\n]*)\n\s*bild\s+BLOB[^\n]*\n/, '$1\n');
  db.exec(schema);
  assert.ok(!db.prepare('PRAGMA table_info(omdome)').all().some((k) => k.name === 'bild'), 'det gamla schemat ska sakna bild');
  db.exec(fs.readFileSync(path.join(__dirname, '../db/omdome-bild.sql'), 'utf8'));
  assert.ok(db.prepare('PRAGMA table_info(omdome)').all().some((k) => k.name === 'bild'));
});
