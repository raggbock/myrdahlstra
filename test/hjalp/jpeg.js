'use strict';

/*
 * JPEG-filer till testerna av omdömesfotot. sharp gör en riktig bild, och
 * block kan stoppas in direkt efter FF D8 för att efterlikna det en
 * mobilkamera skriver: EXIF med GPS, XMP, kommentarer och IPTC.
 */

const sharp = require('sharp');

// Ett block: markör, längd och innehåll, texten byte för byte
function block(markor, text) {
  const data = Buffer.from(text, 'latin1');
  const langd = data.length + 2;
  return Buffer.concat([Buffer.from([0xff, markor, langd >> 8, langd & 0xff]), data]);
}

// Blocken läggs direkt efter FF D8
function medBlock(jpeg, ...block) {
  return Buffer.concat([jpeg.subarray(0, 2), ...block, jpeg.subarray(2)]);
}

// GPS i ett EXIF-block, som en kamera skriver det. Står det först i filen
// kan en webbläsare eller sharp läsa det i stället för kamerans riktiga
// EXIF och då missa orienteringen. Prov som gäller vändningen i webbläsaren
// eller i sharp använder därför GPS_XMP.
const GPS = block(0xe1, 'Exif\0\0GPSLatitude 59 16 N GPSLongitude 15 30 E');
const GPS_XMP = block(0xe1, 'http://ns.adobe.com/xap/1.0/\0<exif:GPSLatitude>59,16.2N</exif:GPSLatitude>');
const XMP = block(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Stora Mellösa</x:xmpmeta>');
const KOMMENTAR = block(0xfe, 'kamera: Telefon X');
const IPTC = block(0xed, 'Photoshop 3.0\0IPTC Stora Mellösa');

// En riktig JPEG. orientering skriver EXIF-orienteringen, icc en sRGB-profil
// i APP2, och brus gör filen lika svår att packa som ett riktigt foto.
async function provJpeg({ bredd = 64, hojd = 48, orientering, icc, brus } = {}) {
  const skapa = brus
    ? { width: bredd, height: hojd, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } }
    : { width: bredd, height: hojd, channels: 3, background: '#a97c46' };
  let bild = sharp({ create: skapa }).jpeg({ quality: 90 });
  if (orientering) bild = bild.withMetadata({ orientation: orientering });
  if (icc) bild = bild.withIccProfile('srgb');
  return bild.toBuffer();
}

module.exports = { block, medBlock, provJpeg, GPS, GPS_XMP, XMP, KOMMENTAR, IPTC };
