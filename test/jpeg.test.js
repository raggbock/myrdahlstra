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

test('tar emot ArrayBuffer lika väl som Uint8Array', async () => {
  const { rensaJpeg } = await jpeg;
  const hel = await provJpeg();
  const ab = hel.buffer.slice(hel.byteOffset, hel.byteOffset + hel.byteLength);
  assert.ok(rensaJpeg(ab) instanceof Uint8Array);
});
