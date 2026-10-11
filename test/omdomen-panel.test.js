'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const O = require('../verktyg/omdomen.js');

const produkter = [
  { nr: 3, slug: 'ek-tre', titel: 'Ek tre' },
  { nr: 1, slug: 'ek-ett', titel: 'Ek ett' }
];

test('en kod är tolv tecken som går att skriva i en adress', () => {
  const koder = new Set(Array.from({ length: 200 }, O.nyKod));
  assert.equal(koder.size, 200);
  for (const k of koder) assert.match(k, O.KOD);
});

test('mål: beställningssidan först, sedan brädorna i nummerordning', () => {
  assert.deepEqual(O.malLista(produkter), [
    { mal: 'bestallning', namn: 'Efter mått (beställningssidan)' },
    { mal: 'ek-ett', namn: 'N:o 1. Ek ett' },
    { mal: 'ek-tre', namn: 'N:o 3. Ek tre' }
  ]);
  assert.equal(O.giltigtMal('ek-tre', produkter), true);
  assert.equal(O.giltigtMal('bestallning', produkter), true);
  assert.equal(O.giltigtMal("x'; DROP TABLE omdome;--", produkter), false);
});

test('ett publicerat omdöme läggs till en gång, även om det publiceras igen', () => {
  const rad = { id: 7, kod: 'AAAAAAAAAAAA', mal: 'ek-ett', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', dag: '2026-10-03' };
  const en = O.medOmdome([], rad);
  assert.deepEqual(en, [{ id: 7, kod: 'AAAAAAAAAAAA', mal: 'ek-ett', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', datum: '2026-10-03' }]);
  assert.equal(O.medOmdome(en, rad), en);
  assert.deepEqual(O.utanOmdome(en, 7), []);
});

test('samma id med en annan kod är ett annat omdöme och stoppas', () => {
  const publicerat = [{ id: 7, kod: 'LOKALTPROV12', mal: 'ek-ett', betyg: 5, namn: 'Prov', ort: '', text: 'Lokalt prov.', datum: '2026-10-01' }];
  const rad = { id: 7, kod: 'AAAAAAAAAAAA', mal: 'ek-ett', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', dag: '2026-10-03' };
  assert.throws(() => O.medOmdome(publicerat, rad), /id 7/);
});

test('filen: saknas den är listan tom, och fel innehåll stoppas', () => {
  const mapp = fs.mkdtempSync(path.join(os.tmpdir(), 'omdomen-'));
  assert.deepEqual(O.las(path.join(mapp, 'saknas.json')), []);
  fs.writeFileSync(path.join(mapp, 'fel.json'), '{"a":1}');
  assert.throws(() => O.las(path.join(mapp, 'fel.json')), /lista/);
  fs.rmSync(mapp, { recursive: true, force: true });
});

test('SQL-värden citeras', () => {
  assert.equal(O.sql("O'Brien"), "'O''Brien'");
  assert.equal(O.sql(12), '12');
  assert.throws(() => O.sql(1.5));
});

test('länken till skrivsidan', () => {
  assert.equal(O.lank('https://myrdahlstra.se', 'Ab3_-xYz9Q0w'), 'https://myrdahlstra.se/omdome/#Ab3_-xYz9Q0w');
});

/* ---------- panelens endpoints ---------- */

const { skapaServer } = require('../verktyg/admin.js');

// En panel mot en tillfällig rot med en bräda och en tom omdomen.json.
// fragaD1 får frågan och svarar med det testet bestämmer.
async function panel(t, fragaD1) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'myrdahl-omdome-test-'));
  fs.mkdirSync(path.join(rot, 'src/_data'), { recursive: true });
  fs.writeFileSync(path.join(rot, 'src/_data/products.json'), JSON.stringify(produkter));
  fs.writeFileSync(path.join(rot, 'src/_data/site.json'), JSON.stringify({ url: 'https://myrdahlstra.se' }));
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), '[]\n');
  const byggen = [];
  const server = skapaServer({ rot, byggSajt: async () => { byggen.push(1); return { ok: true }; }, fragaD1 });
  t.after(async () => {
    await new Promise((klar) => server.close(klar));
    fs.rmSync(rot, { recursive: true, force: true });
  });
  await new Promise((klar) => server.listen(0, '127.0.0.1', klar));
  const url = 'http://127.0.0.1:' + server.address().port;
  const anrop = (vag, kropp) => fetch(url + vag, {
    method: kropp === undefined ? 'GET' : 'POST',
    headers: { 'X-Panel': '1', 'Content-Type': 'application/json' },
    body: kropp === undefined ? undefined : JSON.stringify(kropp)
  });
  const fil = () => JSON.parse(fs.readFileSync(path.join(rot, 'src/_data/omdomen.json'), 'utf8'));
  return { url, anrop, fil, byggen, rot };
}

const vantande = { id: 9, kod: 'AAAAAAAAAAAA', mal: 'ek-ett', betyg: 2, namn: 'Per', ort: 'Ö', text: 'Sprack efter en månad.', dag: '2026-10-03' };

test('en inbjudan sparas med ny kod och ger länken', async (t) => {
  const fragor = [];
  const { anrop } = await panel(t, async (q) => { fragor.push(q); return [[]]; });
  const svar = await anrop('/api/inbjudan', { mal: 'ek-tre' });
  assert.equal(svar.status, 200);
  const { kod, lank } = await svar.json();
  assert.match(kod, O.KOD);
  assert.equal(lank, 'https://myrdahlstra.se/omdome/#' + kod);
  assert.match(fragor[0], new RegExp("INSERT INTO inbjudan .*'" + kod.replace(/[-_]/g, '\$&') + "', 'ek-tre'"));
});

test('en inbjudan till ett okänt mål avvisas utan att databasen frågas', async (t) => {
  const { anrop } = await panel(t, async () => assert.fail('ska inte frågas'));
  const svar = await anrop('/api/inbjudan', { mal: "x'); DROP TABLE omdome;--" });
  assert.equal(svar.status, 400);
});

test('publicera skriver filen, tar bort raden och bygger', async (t) => {
  const fragor = [];
  const { anrop, fil, byggen } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[vantande]] : [[]];
  });
  const svar = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(svar.status, 200);
  assert.equal(fil().length, 1);
  assert.equal(fil()[0].datum, '2026-10-03');
  assert.match(fragor[1], /^DELETE FROM omdome WHERE id = 9$/);
  assert.equal(byggen.length, 1);
});

test('misslyckas borttagningen ligger omdömet i filen, och nästa försök dubblerar inte', async (t) => {
  let felVidDelete = true;
  const { anrop, fil } = await panel(t, async (q) => {
    if (q.startsWith('DELETE') && felVidDelete) throw new Error('Wrangler kunde inte fråga databasen: nätet');
    return q.startsWith('SELECT') ? [[vantande]] : [[]];
  });
  const forsta = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(forsta.status, 502);
  assert.match((await forsta.json()).fel[0], /igen/);
  assert.equal(fil().length, 1);

  felVidDelete = false;
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 200);
  assert.equal(fil().length, 1);
});

test('ett id som redan används av ett annat publicerat omdöme stoppar utan att radera', async (t) => {
  const fragor = [];
  const { anrop, fil, byggen, rot } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[vantande]] : [[]];
  });
  // Ett omdöme publicerat från den lokala databasen, med samma id men en annan kod
  const lokalt = { id: 9, kod: 'LOKALTPROV12', mal: 'bestallning', betyg: 5, namn: 'Prov', ort: '', text: 'Lokalt prov.', datum: '2026-10-01' };
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), JSON.stringify([lokalt]));
  const svar = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(svar.status, 409);
  assert.match((await svar.json()).fel[0], /id 9/);
  assert.deepEqual(fil(), [lokalt]);
  assert.ok(!fragor.some((q) => q.startsWith('DELETE')), 'raden i inkorgen får inte raderas');
  assert.equal(byggen.length, 0);
});

test('ett omdöme som inte finns i inkorgen ger 404', async (t) => {
  const { anrop } = await panel(t, async () => [[]]);
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 404);
});

test('avslå tar bara bort raden', async (t) => {
  const fragor = [];
  const { anrop, fil } = await panel(t, async (q) => { fragor.push(q); return [[]]; });
  assert.equal((await anrop('/api/omdomen/9/avsla', {})).status, 200);
  assert.deepEqual(fragor, ['DELETE FROM omdome WHERE id = 9']);
  assert.deepEqual(fil(), []);
});

test('ta bort ett publicerat omdöme ur filen och bygg om', async (t) => {
  const { anrop, fil, byggen } = await panel(t, async (q) => (q.startsWith('SELECT') ? [[vantande]] : [[]]));
  await anrop('/api/omdomen/9/publicera', {});
  assert.equal((await anrop('/api/omdomen/9/ta-bort', {})).status, 200);
  assert.deepEqual(fil(), []);
  assert.equal(byggen.length, 2);
});

test('listan innehåller inkorgen, inbjudningarna, filen och målen', async (t) => {
  const { anrop } = await panel(t, async () => [[vantande], [{ kod: 'AAAAAAAAAAAA', mal: 'ek-ett', skapad: '2026-10-01', anvand: '2026-10-03' }]]);
  const data = await (await anrop('/api/omdomen')).json();
  assert.equal(data.vantande[0].id, 9);
  assert.equal(data.inbjudningar[0].anvand, '2026-10-03');
  assert.deepEqual(data.publicerade, []);
  assert.equal(data.mal[0].mal, 'bestallning');
});

test('allt om omdömen kräver panelens huvud', async (t) => {
  const { url } = await panel(t, async () => assert.fail('ska inte frågas'));
  assert.equal((await fetch(url + '/api/omdomen')).status, 403);
  for (const vag of ['/api/inbjudan', '/api/omdomen/9/publicera', '/api/omdomen/9/avsla', '/api/omdomen/9/ta-bort']) {
    assert.equal((await fetch(url + vag, { method: 'POST', body: '{}' })).status, 403, vag);
  }
});
