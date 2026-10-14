'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { fejkD1 } = require('./hjalp/d1.js');

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
  const { svar, rader } = await skicka(t, falt({ text: 'x'.repeat(9000) }));
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
