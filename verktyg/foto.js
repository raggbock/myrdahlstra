'use strict';

/*
 * Fotobehandling for verkstadspanelen.
 *
 * Telefonbilder ar staende, roterade via EXIF, tunga, och barare av
 * platsdata. Harifran kommer de ut som liggande 4:3 i rimlig storlek, med
 * all metadata rensad och ljusheten jamnad mot resten av katalogen.
 *
 * rutan() och ljusfaktor() ar ren matematik och testas direkt.
 */

const sharp = require('sharp');

const MAL_FORHALLANDE = 4 / 3;
const MAX_BREDD = 1400;
const KVALITET = 78;

// Medelljus som katalogens bilder ligger pa. Nya bilder dras mot samma varde
// sa korten i katalogen ser ut att hora ihop.
const MAL_LJUS = 103;
const GRANS_NEDRE = 0.8;
const GRANS_OVRE = 1.25;

/* ---------- ren matematik ---------- */

function rutan(bredd, hojd, offset) {
  const o = Math.min(1, Math.max(0, Number(offset) || 0));

  let width;
  let height;
  if (bredd / hojd > MAL_FORHALLANDE) {
    // Bredare an 4:3: full hojd, rutan flyttas i sidled.
    height = hojd;
    width = Math.round(hojd * MAL_FORHALLANDE);
  } else {
    // Staende eller nara 4:3: full bredd, rutan flyttas i hojd.
    width = bredd;
    height = Math.round(bredd / MAL_FORHALLANDE);
  }

  width = Math.min(width, bredd);
  height = Math.min(height, hojd);

  return {
    left: Math.round((bredd - width) * o),
    top: Math.round((hojd - height) * o),
    width,
    height
  };
}

function ljusfaktor(medelljus) {
  const f = MAL_LJUS / (Number(medelljus) || 0.0001);
  return Math.min(GRANS_OVRE, Math.max(GRANS_NEDRE, f));
}

/* ---------- bildbehandling ---------- */

async function matt(buffer) {
  const m = await sharp(buffer).metadata();
  // metadata() ger matten fore rotation, sa vand pa dem nar EXIF sager liggande
  const roterad = m.orientation >= 5;
  return {
    bredd: roterad ? m.height : m.width,
    hojd: roterad ? m.width : m.height
  };
}

async function medelljus(buffer) {
  const { channels } = await sharp(buffer).stats();
  const [r, g, b] = channels;
  return 0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean;
}

// Beskar, jamnar ljuset, skalar och kodar. Metadata foljer inte med, sharp
// tar inte med den om man inte ber om det, sa GPS-datan forsvinner har.
async function behandla(buffer, offset, val) {
  const { bredd, hojd } = await matt(buffer);
  const r = rutan(bredd, hojd, offset);

  const beskuren = await sharp(buffer).rotate().extract(r).toBuffer();
  const faktor = ljusfaktor(await medelljus(beskuren));

  const maxBredd = (val && val.maxBredd) || MAX_BREDD;
  const kvalitet = (val && val.kvalitet) || KVALITET;

  return sharp(beskuren)
    .resize({ width: Math.min(maxBredd, r.width) })
    .modulate({ brightness: faktor })
    .jpeg({ quality: kvalitet, mozjpeg: true })
    .toBuffer();
}

// Samma beskarning i litet format, for reglaget i panelen.
async function forhandsvisning(buffer, offset) {
  return behandla(buffer, offset, { maxBredd: 640, kvalitet: 70 });
}

module.exports = {
  rutan,
  ljusfaktor,
  matt,
  medelljus,
  behandla,
  forhandsvisning,
  MAL_LJUS,
  GRANS_NEDRE,
  GRANS_OVRE,
  MAX_BREDD
};
