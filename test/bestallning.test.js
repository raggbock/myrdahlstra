'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Pages laddar endpointen som ESM, medan verktygen i repot ar CommonJS.
// Ladda samma kallkod som ESM aven i Node, med absolut import till brev.mjs.
const fil = path.join(__dirname, '../functions/api/bestallning.js');
const source = fs.readFileSync(fil, 'utf8').replace("'../../lib/brev.mjs'",
  JSON.stringify(pathToFileURL(path.join(__dirname, '../lib/brev.mjs')).href));
const endpoint = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const env = { RESEND_API_KEY: 'endast-simulerade-utskick' };
const form = () => new URLSearchParams({ Namn: 'Test', 'Mejl eller telefon': 'test@example.invalid' });

async function skicka(t, body, headers = {}) {
  const brev = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    brev.push(JSON.parse(options.body));
    return new Response('{}');
  });
  const request = new Request('https://example.invalid/api/bestallning', {
    method: 'POST', body, headers, ...(body instanceof ReadableStream ? { duplex: 'half' } : {})
  });
  return { svar: await (await endpoint).onRequestPost({ request, env }), brev };
}

for (const headers of [{}, { 'content-length': '1' }]) {
  test('stor kropp avvisas med saknad eller for liten Content-Length: ' + JSON.stringify(headers), async (t) => {
    const body = form(); body.set('Meddelande', 'x'.repeat(40000));
    const { svar, brev } = await skicka(t, body, headers);
    assert.equal(svar.status, 413);
    assert.equal(brev.length, 0);
  });
}

test('exakt 32 KiB godtas och bade notis och bekraftelse skickas', async (t) => {
  const body = form(); body.set('Meddelande', '');
  body.set('Meddelande', 'x'.repeat(32768 - Buffer.byteLength(body.toString())));
  assert.equal(Buffer.byteLength(body.toString()), 32768);
  const { svar, brev } = await skicka(t, body);
  assert.equal(svar.status, 303);
  assert.equal(svar.headers.get('location'), 'https://example.invalid/tack/');
  assert.equal(brev.length, 2);
});

test('strommen avbryts nar flerbytesdata overskrider gransen', async (t) => {
  let avbruten = false;
  const chunk = new TextEncoder().encode('å'.repeat(10000));
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(chunk); },
    cancel() { avbruten = true; }
  });
  const { svar, brev } = await skicka(t, body, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(svar.status, 413);
  assert.equal(avbruten, true);
  assert.equal(brev.length, 0);
});

test('multipart-formular kan fortfarande skickas', async (t) => {
  const body = new FormData();
  for (const [key, value] of form()) body.set(key, value);
  const { svar, brev } = await skicka(t, body);
  assert.equal(svar.status, 303);
  assert.equal(brev.length, 2);
});

test('trasigt formular ger 400 utan mejl', async (t) => {
  const { svar, brev } = await skicka(t, 'trasigt', { 'content-type': 'multipart/form-data' });
  assert.equal(svar.status, 400);
  assert.equal(brev.length, 0);
});
