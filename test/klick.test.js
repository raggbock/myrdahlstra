'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { skapaServer } = require('../verktyg/admin.js');

// Pages laddar endpointen som ESM, repot i övrigt är CommonJS
const kalla = fs.readFileSync(path.join(__dirname, '../functions/api/klick.js'), 'utf8');
const endpoint = import('data:text/javascript;base64,' + Buffer.from(kalla).toString('base64'));

function fejkD1() {
  const rader = [];
  return {
    rader,
    prepare(sql) {
      return { bind: (...v) => ({ run: async () => { if (sql.startsWith('INSERT')) rader.push(v); } }) };
    }
  };
}

async function skicka(data, { origin = 'https://myrdahlstra.se', env } = {}) {
  const db = fejkD1();
  const headers = origin ? { origin } : {};
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  const request = new Request('https://myrdahlstra.se/api/klick', { method: 'POST', headers, body });
  const svar = await (await endpoint).onRequestPost({ request, env: env || { KLICK: db } });
  return { svar, rader: db.rader };
}

const klick = { sida: '/bestallning/', lage: 'dator', x: 0.42, y: 812, mal: 'Valnöt', till: '' };

test('ett klick från sajten sparas med just de fälten', async () => {
  const { svar, rader } = await skicka(klick);
  assert.equal(svar.status, 204);
  assert.deepEqual(rader, [['/bestallning/', 'dator', 0.42, 812, 'Valnöt', '']]);
});

test('tangentbordsklick sparas utan plats', async () => {
  const { rader } = await skicka({ sida: '/', lage: 'mobil', mal: 'Beställ', till: '/bestallning/' });
  assert.deepEqual(rader, [['/', 'mobil', null, null, 'Beställ', '/bestallning/']]);
});

test('klick från en annan domän eller utan Origin sparas inte', async () => {
  for (const origin of ['https://annan.example', null]) {
    const { svar, rader } = await skicka(klick, { origin });
    assert.equal(svar.status, 204);
    assert.equal(rader.length, 0);
  }
});

test('skräp sparas inte, och svaret är ändå 204', async () => {
  const fall = [
    '{', 'null', '[]', JSON.stringify({ ...klick, sida: 'https://x' }),
    JSON.stringify({ ...klick, lage: 'surfplatta' }), JSON.stringify({ ...klick, x: 'mitt' }),
    JSON.stringify({ ...klick, y: 1.5 }), JSON.stringify({ ...klick, y: undefined }),
    JSON.stringify({ ...klick, mal: 'x'.repeat(2000) })
  ];
  for (const body of fall) {
    const { svar, rader } = await skicka(body);
    assert.equal(svar.status, 204);
    assert.equal(rader.length, 0, body.slice(0, 60));
  }
});

test('långa texter kortas och styrtecken tas bort', async () => {
  const { rader } = await skicka({ ...klick, mal: 'N:o\n3\t' + 'a'.repeat(100) });
  assert.equal(rader[0][4].length, 80);
  assert.ok(rader[0][4].startsWith('N:o3'));
});

test('utan databas sparas ingenting och inget går sönder', async () => {
  const { svar } = await skicka(klick, { env: {} });
  assert.equal(svar.status, 204);
});

/* ---------- panelen ---------- */

async function panel(t, fragaD1) {
  const rot = fs.mkdtempSync(path.join(os.tmpdir(), 'myrdahl-klick-test-'));
  fs.mkdirSync(path.join(rot, '_site/assets'), { recursive: true });
  fs.writeFileSync(path.join(rot, '_site/index.html'), '<div class="ram"></div>');
  fs.writeFileSync(path.join(rot, '_site/assets/style.css'), 'body{}');
  fs.writeFileSync(path.join(rot, 'hemlig.txt'), 'nej');
  const server = skapaServer({ rot, byggSajt: async () => ({ ok: true }), fragaD1 });
  t.after(async () => {
    await new Promise((klar) => server.close(klar));
    fs.rmSync(rot, { recursive: true, force: true });
  });
  await new Promise((klar) => server.listen(0, '127.0.0.1', klar));
  return 'http://127.0.0.1:' + server.address().port;
}

test('panelen hämtar klicken med en fråga och ett godkänt antal dagar', async (t) => {
  const fragor = [];
  const url = await panel(t, async (sql) => {
    fragor.push(sql);
    return [[{ sida: '/', lage: 'dator', n: 2 }], [], [{ sida: '/', lage: 'dator', x: 0.5, y: 10 }]];
  });
  const svar = await fetch(url + '/api/klick?dagar=7', { headers: { 'X-Panel': '1' } });
  const data = await svar.json();
  assert.equal(data.dagar, 7);
  assert.equal(data.sidor[0].n, 2);
  assert.equal(data.punkter.length, 1);
  assert.match(fragor[0], /-7 days/);

  // Ett påhittat antal dagar kommer aldrig in i SQL-frågan
  await fetch(url + "/api/klick?dagar=1'--", { headers: { 'X-Panel': '1' } });
  assert.match(fragor[1], /-30 days/);
  assert.doesNotMatch(fragor[1], /'--/);
});

test('klickfrågan kräver panelens huvud', async (t) => {
  const url = await panel(t, async () => assert.fail('ska inte frågas'));
  assert.equal((await fetch(url + '/api/klick')).status, 403);
});

test('ett fel från wrangler blir ett läsbart felsvar', async (t) => {
  const url = await panel(t, async () => { throw new Error('Wrangler kunde inte hämta klicken: inloggad?'); });
  const svar = await fetch(url + '/api/klick', { headers: { 'X-Panel': '1' } });
  assert.equal(svar.status, 502);
  assert.match((await svar.json()).fel[0], /inloggad/);
});

test('panelen visar det byggda, men inget utanför _site', async (t) => {
  const url = await panel(t, async () => []);
  assert.equal(await (await fetch(url + '/sajt/')).text(), '<div class="ram"></div>');
  const css = await fetch(url + '/assets/style.css');
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
  for (const vag of ['/sajt/..%2fhemlig.txt', '/sajt/%2e%2e/hemlig.txt', '/assets/..%2f..%2fhemlig.txt']) {
    const svar = await fetch(url + vag);
    assert.equal(svar.status, 404, vag);
  }
});
