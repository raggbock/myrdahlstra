'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { medBlock, provJpeg, GPS, XMP, KOMMENTAR, IPTC } = require('./hjalp/jpeg.js');

const jpeg = import('../lib/jpeg.mjs');

const innehaller = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

test('platsdata, XMP, IPTC och kommentarer tas bort men bilden går att läsa', async () => {
  const { rensaJpeg } = await jpeg;
  const in_ = medBlock(await provJpeg({ icc: true }), GPS, XMP, KOMMENTAR, IPTC);
  const ut = rensaJpeg(in_);
  assert.ok(ut instanceof Uint8Array);
  for (const text of ['GPSLatitude', 'ns.adobe.com/xap', 'kamera: Telefon', 'Photoshop', 'Stora Mell']) {
    assert.equal(innehaller(ut, text), false, text + ' finns kvar');
  }
  const m = await sharp(Buffer.from(ut)).metadata();
  assert.equal(m.width, 64);
  assert.equal(m.height, 48);
  assert.ok(m.icc, 'ICC-profilen ska följa med');
});

test('orienteringen överlever, så ett stående foto kan vändas rätt', async () => {
  const { rensaJpeg } = await jpeg;
  // GPS-blocket först: orienteringen ska ändå hittas i kamerans riktiga EXIF
  const ut = rensaJpeg(medBlock(await provJpeg({ orientering: 6 }), GPS));
  assert.equal(innehaller(ut, 'GPSLatitude'), false);
  assert.equal((await sharp(Buffer.from(ut)).metadata()).orientation, 6);
});

test('utan orientering blir det inget nytt EXIF-block', async () => {
  const { rensaJpeg } = await jpeg;
  const ut = rensaJpeg(medBlock(await provJpeg(), GPS));
  assert.equal(innehaller(ut, 'Exif'), false);
});

test('bilddatan från FF DA är orörd', async () => {
  const { rensaJpeg } = await jpeg;
  const in_ = medBlock(await provJpeg(), GPS, KOMMENTAR);
  const ut = Buffer.from(rensaJpeg(in_));
  const sos = (b) => b.indexOf(Buffer.from([0xff, 0xda]));
  assert.ok(ut.subarray(sos(ut)).equals(in_.subarray(sos(in_))));
});

test('allt som inte är en hel JPEG avvisas', async () => {
  const { rensaJpeg } = await jpeg;
  const hel = await provJpeg();
  const fall = {
    'GIF': Buffer.from('GIF89a........'),
    'tom': Buffer.alloc(0),
    'bara FF D8': Buffer.from([0xff, 0xd8]),
    'avkortad före FF DA': hel.subarray(0, 30),
    'längd utanför filen': Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00, 0x00]),
    'markör utan FF': Buffer.from([0xff, 0xd8, 0x00, 0xe1, 0x00, 0x04, 0x00, 0x00]),
    'slut före bilddata': Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x00]),
    'längd under två': Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, 0x00, 0x00])
  };
  for (const [namn, bytes] of Object.entries(fall)) {
    assert.equal(rensaJpeg(bytes), null, namn);
  }
});

test('allt efter FF D9 tas bort, så en film efter bilden följer inte med', async () => {
  // En "Motion Photo" från Samsung eller Pixel har en hel MP4 efter bilden,
  // och filmens platsatom kan bära kamerans position
  const { rensaJpeg } = await jpeg;
  const hel = await provJpeg();
  const film = Buffer.from('\0\0\0\x18ftypmp42 \xa9xyz+59.2700+015.5000/', 'latin1');
  const ut = Buffer.from(rensaJpeg(Buffer.concat([hel, film])));
  assert.equal(innehaller(ut, 'xyz+59'), false, 'platsatomen efter bilden finns kvar');
  assert.ok(ut.equals(hel), 'bilden själv ska vara orörd');
});

test('APP-block mellan skanningarna i en progressiv JPEG tas bort', async () => {
  const { rensaJpeg } = await jpeg;
  const prog = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#a97c46' } })
    .jpeg({ progressive: true }).toBuffer();
  // I bilddatan följs FF alltid av 00 eller D0 till D7, så nästa FF DA är
  // nästa skanningshuvud
  const forsta = prog.indexOf(Buffer.from([0xff, 0xda]));
  const andra = prog.indexOf(Buffer.from([0xff, 0xda]), forsta + 2);
  assert.ok(andra > forsta, 'provbilden ska ha minst två skanningar');
  const in_ = Buffer.concat([prog.subarray(0, andra), GPS, KOMMENTAR, prog.subarray(andra)]);
  const ut = Buffer.from(rensaJpeg(in_));
  assert.equal(innehaller(ut, 'GPSLatitude'), false);
  assert.equal(innehaller(ut, 'kamera: Telefon'), false);
  assert.ok(ut.equals(prog), 'resten av bilden ska vara orörd');
  assert.equal((await sharp(ut).metadata()).width, 64);
});

test('block med markörer som inte finns i JPEG tas bort', async () => {
  // Hittades med fuzzning: ett APP1 vars markör förstörts till FF 90 följde
  // med som om det vore en tabell
  const { rensaJpeg } = await jpeg;
  const hel = await provJpeg();
  // 90 och 2F finns inte, C8 och F0 är reserverade och används aldrig
  for (const markor of [0x90, 0x2f, 0xc8, 0xf0]) {
    const okand = Buffer.from(GPS);
    okand[1] = markor;
    const ut = Buffer.from(rensaJpeg(medBlock(hel, okand)));
    assert.equal(innehaller(ut, 'GPSLatitude'), false, 'markör ' + markor.toString(16));
    assert.ok(ut.equals(hel), 'markör ' + markor.toString(16));
  }
});

test('en fil som tar slut i bilddatan, utan FF D9, avvisas', async () => {
  const { rensaJpeg } = await jpeg;
  const hel = await provJpeg();
  assert.equal(rensaJpeg(hel.subarray(0, hel.length - 2)), null);
});

test('tar emot ArrayBuffer lika väl som Uint8Array', async () => {
  const { rensaJpeg } = await jpeg;
  const hel = await provJpeg();
  const ab = hel.buffer.slice(hel.byteOffset, hel.byteOffset + hel.byteLength);
  assert.ok(rensaJpeg(ab) instanceof Uint8Array);
});
