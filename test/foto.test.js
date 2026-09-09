'use strict';

const test = require('node:test');
const assert = require('node:assert');
const F = require('../verktyg/foto.js');

/* ---------- beskarningsrutan ---------- */

test('staende bild ger full bredd och en rutan som gar att flytta i hojd', () => {
  // 3000x4000, alltsa staende. 4:3 av full bredd blir 3000x2250.
  const r = F.rutan(3000, 4000, 0);
  assert.equal(r.width, 3000);
  assert.equal(r.height, 2250);
  assert.equal(r.left, 0);
  assert.equal(r.top, 0, 'offset 0 ska ligga i overkant');

  const mitt = F.rutan(3000, 4000, 0.5);
  assert.equal(mitt.top, Math.round((4000 - 2250) / 2));

  const botten = F.rutan(3000, 4000, 1);
  assert.equal(botten.top, 4000 - 2250, 'offset 1 ska ligga i underkant');
});

test('liggande bild bredare an 4:3 ger full hojd och flyttas i sidled', () => {
  // 4000x2000 ar bredare an 4:3. 4:3 av full hojd blir 2667x2000.
  const r = F.rutan(4000, 2000, 0);
  assert.equal(r.height, 2000);
  assert.equal(r.width, Math.round(2000 * 4 / 3));
  assert.equal(r.top, 0);
  assert.equal(r.left, 0);

  const hoger = F.rutan(4000, 2000, 1);
  assert.equal(hoger.left, 4000 - Math.round(2000 * 4 / 3));
});

test('bild som redan ar 4:3 ger hela bilden och ingen rorelse', () => {
  const a = F.rutan(1600, 1200, 0);
  const b = F.rutan(1600, 1200, 1);
  assert.deepEqual(a, b, 'utan slack ska offset inte spela roll');
  assert.equal(a.width, 1600);
  assert.equal(a.height, 1200);
});

test('rutan hamnar aldrig utanfor bilden', () => {
  for (const [w, h] of [[3000, 4000], [4000, 3000], [1000, 1000], [2500, 1300]]) {
    for (const o of [-1, 0, 0.37, 1, 2]) {
      const r = F.rutan(w, h, o);
      assert.ok(r.left >= 0 && r.top >= 0, 'negativ position for ' + w + 'x' + h + ' offset ' + o);
      assert.ok(r.left + r.width <= w, 'sticker ut i bredd for ' + w + 'x' + h);
      assert.ok(r.top + r.height <= h, 'sticker ut i hojd for ' + w + 'x' + h);
    }
  }
});

test('rutan halller 4:3 inom en pixel', () => {
  for (const [w, h] of [[3000, 4000], [4000, 3000], [2500, 1300], [999, 1777]]) {
    const r = F.rutan(w, h, 0.5);
    assert.ok(Math.abs(r.width / r.height - 4 / 3) < 0.01, 'fel forhallande for ' + w + 'x' + h);
  }
});

/* ---------- ljusjusteringen ---------- */

test('ljusfaktor lyfter en mork bild och dampar en ljus', () => {
  assert.ok(F.ljusfaktor(78) > 1.2, 'mork bild ska lyftas');
  assert.ok(F.ljusfaktor(140) < 0.85, 'ljus bild ska dampas');
});

test('ljusfaktor lamnar en bild pa malet i stort sett orord', () => {
  const f = F.ljusfaktor(103);
  assert.ok(Math.abs(f - 1) < 0.02, 'forvantade nara 1, fick ' + f);
});

test('ljusfaktor begransas sa bilder inte blir onaturliga', () => {
  assert.equal(F.ljusfaktor(5), F.GRANS_OVRE, 'nastan svart bild ska inte skruvas orimligt');
  assert.equal(F.ljusfaktor(250), F.GRANS_NEDRE);
});

test('ljusfaktor pa noll kraschar inte', () => {
  assert.ok(Number.isFinite(F.ljusfaktor(0)));
});
