'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { skapaServer } = require('../verktyg/admin.js');
const P = require('../verktyg/produkter.js');

const brada = (bilder = []) => ({ nr: 1, slug: 'test', titel: 'Test', pris: 100, bilder });

async function panel(t, options = {}) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'myrdahl-panel-test-'));
  const produktfil = path.join(rot, 'src/_data/products.json');
  const fotomapp = path.join(rot, 'assets/foto');
  fs.mkdirSync(path.dirname(produktfil), { recursive: true });
  fs.mkdirSync(fotomapp, { recursive: true });
  fs.writeFileSync(produktfil, JSON.stringify([brada()]));
  const foto = {
    matt: async () => ({ bredd: 100, hojd: 75 }),
    behandla: async (buf) => buf,
    forhandsvisning: async (buf) => buf,
    ...options.foto
  };
  const server = skapaServer({ rot, byggSajt: async () => ({ ok: true }), ...options, foto });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(rot, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const post = (vag, body) => fetch(url + vag, { method: 'POST', headers: { 'X-Panel': '1' }, body });
  const upload = async (text) => (await (await post('/api/bild', text)).json()).id;
  const save = (produkter) => post('/api/spara', JSON.stringify({ produkter }));
  return { rot, produktfil, fotomapp, url, post, upload, save };
}

test('felaktig sparning ger felsvar och panelen fortsatter svara', async (t) => {
  const p = await panel(t);
  const fore = fs.readFileSync(p.produktfil, 'utf8');
  for (const body of ['{', '{}', 'null', '{"produkter":[null]}']) {
    const res = await p.post('/api/spara', body);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).fel.length);
  }
  assert.equal((await fetch(p.url + '/api/allt')).status, 200);
  assert.equal(fs.readFileSync(p.produktfil, 'utf8'), fore);
});

test('asynkront bildfel ger 500 i stallet for att stoppa panelen', async (t) => {
  const p = await panel(t, { foto: { forhandsvisning: async () => { throw Error('bildfel'); } } });
  const id = await p.upload('bild');
  const res = await p.post('/api/bild/' + id + '/forhandsvisning');
  assert.equal(res.status, 500);
  assert.match((await res.json()).fel[0], /bildfel/);
  assert.equal((await fetch(p.url + '/api/allt')).status, 200);
});

test('dubbla nummer och adresser stoppas fore skrivning', async (t) => {
  const p = await panel(t);
  for (const andra of [brada(), { ...brada(), slug: 'annan' }, { ...brada(), nr: 2 }]) {
    const res = await p.save([brada(), andra]);
    assert.equal(res.status, 400);
    assert.ok((await res.json()).fel.length);
  }
  assert.equal(P.las(p.produktfil).length, 1);
  assert.equal((await p.save([brada()])).status, 200);
});

test('saknad andra bild bevarar forsta uppladdningen for nytt forsok', async (t) => {
  const p = await panel(t);
  const id = await p.upload('forsta');
  const res = await p.save([brada([{ bildId: id }, { bildId: 'saknas' }])]);
  assert.equal(res.status, 400);
  assert.deepEqual(fs.readdirSync(p.fotomapp), []);
  assert.deepEqual(P.las(p.produktfil)[0].bilder, []);
  assert.equal((await p.save([brada([{ bildId: id }])])).status, 200);
  assert.equal(fs.readFileSync(path.join(p.fotomapp, 'test-1.jpg'), 'utf8'), 'forsta');
});

test('behandlingsfel bevarar alla original och inga halvfardiga bilder skrivs', async (t) => {
  let misslyckas = true;
  const p = await panel(t, { foto: { behandla: async (buf) => {
    if (misslyckas && buf.toString() === 'andra') throw Error('kodningsfel');
    return buf;
  } } });
  const bilder = [{ bildId: await p.upload('forsta') }, { bildId: await p.upload('andra') }];
  assert.equal((await p.save([brada(bilder)])).status, 500);
  assert.deepEqual(fs.readdirSync(p.fotomapp), []);
  assert.deepEqual(P.las(p.produktfil)[0].bilder, []);
  misslyckas = false;
  assert.equal((await p.save([brada(bilder)])).status, 200);
  assert.deepEqual(P.las(p.produktfil)[0].bilder, ['test-1.jpg', 'test-2.jpg']);
});

test('fel vid produktskrivning rullar tillbaka nya foton men behaller gamla', async (t) => {
  let misslyckas = true;
  const p = await panel(t, { skrivProdukter: (fil, produkter) => {
    if (misslyckas) throw Error('skrivfel');
    P.skriv(fil, produkter);
  } });
  fs.writeFileSync(path.join(p.fotomapp, 'test-1.jpg'), 'befintlig');
  const fore = fs.readFileSync(p.produktfil, 'utf8');
  const bilder = [{ bildId: await p.upload('ny') }];
  assert.equal((await p.save([brada(bilder)])).status, 500);
  assert.equal(fs.readFileSync(p.produktfil, 'utf8'), fore);
  assert.deepEqual(fs.readdirSync(p.fotomapp), ['test-1.jpg']);
  assert.equal(fs.readFileSync(path.join(p.fotomapp, 'test-1.jpg'), 'utf8'), 'befintlig');
  misslyckas = false;
  assert.equal((await p.save([brada(bilder)])).status, 200);
  assert.deepEqual(P.las(p.produktfil)[0].bilder, ['test-2.jpg']);
});

test('en samtidig sparning avvisas tills forsta sparningen ar klar', async (t) => {
  let fortsatt, startad;
  const vantar = new Promise((r) => { fortsatt = r; });
  const borjat = new Promise((r) => { startad = r; });
  const p = await panel(t, { foto: { behandla: async (buf) => { startad(); await vantar; return buf; } } });
  t.after(() => fortsatt());
  const id = await p.upload('bild');
  const forsta = p.save([brada([{ bildId: id }])]);
  await borjat;
  try { assert.equal((await p.save([brada()])).status, 409); }
  finally { fortsatt(); }
  assert.equal((await forsta).status, 200);
  assert.deepEqual(P.las(p.produktfil)[0].bilder, ['test-1.jpg']);
});
