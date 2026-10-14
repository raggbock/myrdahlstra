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

test('omdömena är allmänna, inte knutna till en bräda', () => {
  assert.equal(O.MAL, 'allmant');
});

test('ett publicerat omdöme läggs till en gång, även om det publiceras igen', () => {
  // mal följer inte med in i filen: omdömena är allmänna
  const rad = { id: 7, kod: 'AAAAAAAAAAAA', mal: 'allmant', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', dag: '2026-10-03' };
  const en = O.medOmdome([], rad);
  assert.deepEqual(en, [{ id: 7, kod: 'AAAAAAAAAAAA', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', datum: '2026-10-03' }]);
  assert.equal(O.medOmdome(en, rad), en);
  assert.deepEqual(O.utanOmdome(en, 7), []);
});

test('samma id med en annan kod är ett annat omdöme och stoppas', () => {
  const publicerat = [{ id: 7, kod: 'LOKALTPROV12', betyg: 5, namn: 'Prov', ort: '', text: 'Lokalt prov.', datum: '2026-10-01' }];
  const rad = { id: 7, kod: 'AAAAAAAAAAAA', betyg: 2, namn: 'Per', ort: '', text: 'Sprack.', dag: '2026-10-03' };
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
async function panel(t, fragaD1, { foto } = {}) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'myrdahl-omdome-test-'));
  fs.mkdirSync(path.join(rot, 'src/_data'), { recursive: true });
  fs.writeFileSync(path.join(rot, 'src/_data/products.json'), JSON.stringify(produkter));
  fs.writeFileSync(path.join(rot, 'src/_data/site.json'), JSON.stringify({ url: 'https://myrdahlstra.se' }));
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), '[]\n');
  const byggen = [];
  const server = skapaServer({ rot, byggSajt: async () => { byggen.push(1); return { ok: true }; }, fragaD1, foto });
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
  const foton = () => {
    try { return fs.readdirSync(path.join(rot, 'assets/foto')).sort(); } catch (e) { return []; }
  };
  return { url, anrop, fil, byggen, rot, foton };
}

const vantande = { id: 9, kod: 'AAAAAAAAAAAA', betyg: 2, namn: 'Per', ort: 'Ö', text: 'Sprack efter en månad.', dag: '2026-10-03' };

test('en inbjudan sparas med ny kod och ger länken', async (t) => {
  const fragor = [];
  const { anrop } = await panel(t, async (q) => { fragor.push(q); return [[]]; });
  const svar = await anrop('/api/inbjudan', {});
  assert.equal(svar.status, 200);
  const { kod, lank } = await svar.json();
  assert.match(kod, O.KOD);
  assert.equal(lank, 'https://myrdahlstra.se/omdome/#' + kod);
  assert.match(fragor[0], new RegExp("INSERT INTO inbjudan .*'" + kod.replace(/[-_]/g, '\$&') + "', 'allmant'"));
});

test('vad anropet än skickar med sparas inbjudan som allmän', async (t) => {
  const fragor = [];
  const { anrop } = await panel(t, async (q) => { fragor.push(q); return [[]]; });
  const svar = await anrop('/api/inbjudan', { mal: "x'); DROP TABLE omdome;--" });
  assert.equal(svar.status, 200);
  assert.match(fragor[0], /, 'allmant', /);
  assert.doesNotMatch(fragor[0], /DROP/);
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
  const lokalt = { id: 9, kod: 'LOKALTPROV12', betyg: 5, namn: 'Prov', ort: '', text: 'Lokalt prov.', datum: '2026-10-01' };
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

test('listan innehåller inkorgen, inbjudningarna och filen', async (t) => {
  const { anrop } = await panel(t, async () => [[vantande], [{ kod: 'AAAAAAAAAAAA', skapad: '2026-10-01', anvand: '2026-10-03' }]]);
  const data = await (await anrop('/api/omdomen')).json();
  assert.equal(data.vantande[0].id, 9);
  assert.equal(data.inbjudningar[0].anvand, '2026-10-03');
  assert.deepEqual(data.publicerade, []);
});

test('allt om omdömen kräver panelens huvud', async (t) => {
  const { url } = await panel(t, async () => assert.fail('ska inte frågas'));
  assert.equal((await fetch(url + '/api/omdomen')).status, 403);
  assert.equal((await fetch(url + '/api/omdomen/9/foto')).status, 403);
  for (const vag of ['/api/inbjudan', '/api/omdomen/9/publicera', '/api/omdomen/9/publicera-utan-foto',
    '/api/omdomen/9/avsla', '/api/omdomen/9/ta-bort']) {
    assert.equal((await fetch(url + vag, { method: 'POST', body: '{}' })).status, 403, vag);
  }
});

/* ---------- foto ---------- */

const medFoto = { ...vantande, bildhex: 'FFD8FFD9' };
// Bildbehandlingen fejkas: testet gäller flödet, inte sharp
const behandlare = (anrop = []) => ({
  omdomesfoto: async (buf) => { anrop.push(buf); return Buffer.from('BEHANDLAD'); }
});

test('namnet på ett omdömesfoto är slumpat och har rätt form', () => {
  const namn = new Set(Array.from({ length: 50 }, O.fotonamn));
  assert.equal(namn.size, 50);
  for (const n of namn) assert.match(n, O.FOTONAMN);
  assert.doesNotMatch('omdome-ABCDEF123456.jpg', O.FOTONAMN);
  assert.doesNotMatch('../omdome-aaaaaaaaaaaa.jpg', O.FOTONAMN);
});

test('listan säger vilka väntande omdömen som har foto', async (t) => {
  const fragor = [];
  const { anrop } = await panel(t, async (q) => { fragor.push(q); return [[{ ...vantande, harFoto: 1 }], []]; });
  const data = await (await anrop('/api/omdomen')).json();
  assert.match(fragor[0], /bild IS NOT NULL AS harFoto/);
  assert.doesNotMatch(fragor[0], /hex\(bild\)/, 'själva fotot ska inte hämtas till listan');
  assert.equal(data.vantande[0].harFoto, 1);
});

test('fotot i inkorgen hämtas ur databasen', async (t) => {
  const fragor = [];
  const { url } = await panel(t, async (q) => { fragor.push(q); return [[{ hex: 'FFD8FFD9' }]]; });
  const svar = await fetch(url + '/api/omdomen/9/foto', { headers: { 'X-Panel': '1' } });
  assert.equal(svar.status, 200);
  assert.equal(svar.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await svar.arrayBuffer()), Buffer.from('FFD8FFD9', 'hex'));
  assert.equal(fragor[0], 'SELECT hex(bild) AS hex FROM omdome WHERE id = 9');
});

test('ett omdöme utan foto i inkorgen ger 404 på fotot', async (t) => {
  const { url } = await panel(t, async () => [[{ hex: null }]]);
  assert.equal((await fetch(url + '/api/omdomen/9/foto', { headers: { 'X-Panel': '1' } })).status, 404);
});

test('publicera med foto sparar det behandlade fotot under ett slumpat namn', async (t) => {
  const fragor = [];
  const behandlat = [];
  const { anrop, fil, foton, rot } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[medFoto]] : [[]];
  }, { foto: behandlare(behandlat) });
  const svar = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(svar.status, 200);
  assert.match(fragor[0], /hex\(bild\) AS bildhex/);
  assert.deepEqual(behandlat[0], Buffer.from('FFD8FFD9', 'hex'));
  const bild = fil()[0].bild;
  assert.match(bild, O.FOTONAMN);
  assert.deepEqual(foton(), [bild]);
  assert.equal(fs.readFileSync(path.join(rot, 'assets/foto', bild), 'utf8'), 'BEHANDLAD');
  assert.match(fragor[1], /^DELETE FROM omdome WHERE id = 9$/);
});

test('publicera utan foto skriver ingen fil och hämtar inte fotot', async (t) => {
  const fragor = [];
  const behandlat = [];
  const { anrop, fil, foton } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[vantande]] : [[]];
  }, { foto: behandlare(behandlat) });
  assert.equal((await anrop('/api/omdomen/9/publicera-utan-foto', {})).status, 200);
  assert.doesNotMatch(fragor[0], /hex\(bild\)/);
  assert.equal(fil()[0].bild, undefined);
  assert.deepEqual(foton(), []);
  assert.equal(behandlat.length, 0);
  assert.match(fragor[1], /^DELETE FROM omdome WHERE id = 9$/);
});

test('går fotot inte att behandla skrivs och raderas ingenting', async (t) => {
  const fragor = [];
  const { anrop, fil, foton, byggen } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[medFoto]] : [[]];
  }, { foto: { omdomesfoto: async () => { throw new Error('Input buffer contains unsupported image format'); } } });
  const svar = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(svar.status, 422);
  assert.match((await svar.json()).fel[0], /Publicera utan foto/);
  assert.deepEqual(fil(), []);
  assert.deepEqual(foton(), []);
  assert.ok(!fragor.some((q) => q.startsWith('DELETE')));
  assert.equal(byggen.length, 0);
});

test('ett nytt försök efter misslyckad radering behandlar inget nytt foto', async (t) => {
  let felVidDelete = true;
  const behandlat = [];
  const { anrop, fil, foton } = await panel(t, async (q) => {
    if (q.startsWith('DELETE') && felVidDelete) throw new Error('Wrangler kunde inte fråga databasen: nätet');
    return q.startsWith('SELECT') ? [[medFoto]] : [[]];
  }, { foto: behandlare(behandlat) });
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 502);
  felVidDelete = false;
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 200);
  assert.equal(behandlat.length, 1);
  assert.equal(fil().length, 1);
  assert.equal(foton().length, 1);
});

test('ett namn som redan finns ger ett nytt, och den gamla filen rörs inte', async (t) => {
  const namn = ['omdome-aaaaaaaaaaaa.jpg', 'omdome-bbbbbbbbbbbb.jpg'];
  t.mock.method(O, 'fotonamn', () => namn.shift());
  const { anrop, fil, rot } = await panel(t, async (q) => (q.startsWith('SELECT') ? [[medFoto]] : [[]]),
    { foto: behandlare() });
  fs.mkdirSync(path.join(rot, 'assets/foto'), { recursive: true });
  fs.writeFileSync(path.join(rot, 'assets/foto/omdome-aaaaaaaaaaaa.jpg'), 'GAMMAL');
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 200);
  assert.equal(fil()[0].bild, 'omdome-bbbbbbbbbbbb.jpg');
  assert.equal(fs.readFileSync(path.join(rot, 'assets/foto/omdome-aaaaaaaaaaaa.jpg'), 'utf8'), 'GAMMAL');
});

test('ta bort raderar fotot med omdömet', async (t) => {
  const { anrop, fil, foton } = await panel(t, async (q) => (q.startsWith('SELECT') ? [[medFoto]] : [[]]),
    { foto: behandlare() });
  await anrop('/api/omdomen/9/publicera', {});
  assert.equal(foton().length, 1);
  assert.equal((await anrop('/api/omdomen/9/ta-bort', {})).status, 200);
  assert.deepEqual(fil(), []);
  assert.deepEqual(foton(), []);
});

test('ta bort fungerar även när fotofilen redan saknas', async (t) => {
  const { anrop, fil, rot } = await panel(t, async () => [[]]);
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), JSON.stringify([
    { id: 9, kod: 'AAAAAAAAAAAA', betyg: 5, namn: 'Per', ort: '', text: 'Fin.', datum: '2026-10-03', bild: 'omdome-cccccccccccc.jpg' }
  ]));
  assert.equal((await anrop('/api/omdomen/9/ta-bort', {})).status, 200);
  assert.deepEqual(fil(), []);
});

test('omdömesfoton räknas inte som oanvända', async (t) => {
  const { anrop, rot } = await panel(t, async () => [[]]);
  fs.mkdirSync(path.join(rot, 'assets/foto'), { recursive: true });
  fs.writeFileSync(path.join(rot, 'assets/foto/omdome-dddddddddddd.jpg'), 'x');
  fs.writeFileSync(path.join(rot, 'assets/foto/glomd.jpg'), 'x');
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), JSON.stringify([
    { id: 1, kod: 'AAAAAAAAAAAA', betyg: 5, namn: 'Per', ort: '', text: 'Fin.', datum: '2026-10-03', bild: 'omdome-dddddddddddd.jpg' }
  ]));
  const data = await (await anrop('/api/allt')).json();
  assert.deepEqual(data.oanvandaFoton, ['glomd.jpg']);
});
