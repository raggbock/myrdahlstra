/*
 * Rensar en JPEG från metadata innan den sparas, utan bildbibliotek.
 *
 * Används av functions/api/omdome.js, som körs hos Cloudflare där sharp inte
 * finns. En mobilbild bär ofta GPS-position, alltså kundens hemadress, i sitt
 * EXIF-block. Den får aldrig sparas, inte ens i inkorgen i D1.
 *
 * En JPEG är en rad block, vart och ett med en markör och en längd, fram till
 * bilddatan som börjar vid FF DA. Blocken före den gås igenom ett i taget:
 *
 *   behålls   APP0 (JFIF), APP2 med ICC-profil, APP14 (Adobe), tabeller och
 *             bildhuvud, samt orienteringen ur EXIF i ett nytt minimalt block
 *   tas bort  övrig EXIF (GPS, kamera, tid), XMP, IPTC, tillverkarnas egna
 *             block och kommentarer
 *
 * Orienteringen behövs för att ett stående mobilfoto som skickats utan
 * JavaScript ska vändas rätt när panelen behandlar det med sharp.
 *
 * Från FF DA kopieras bilddatan fram till och med FF D9, där bilden slutar.
 * Allt efter det tas bort: en "Motion Photo" från Samsung eller Pixel lägger
 * en hel film där, och filmen kan bära kamerans position. Mellan
 * skanningarna i en progressiv JPEG behålls tabeller och skanningshuvuden,
 * men APP-block och kommentarer tas bort även där.
 *
 * Ren logik utan beroenden, så både funktionen och testerna kan använda den.
 */

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const APP14 = 0xee;
const COM = 0xfe;

function borjarMed(data, text) {
  if (data.length < text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (data[i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

// Orienteringen 1 till 8 ur ett EXIF-block, eller 0 om den saknas
function orientering(data) {
  if (!borjarMed(data, 'Exif\0\0')) return 0;
  const t = data.subarray(6);
  if (t.length < 8) return 0;
  const lill = t[0] === 0x49 && t[1] === 0x49; // II, little endian
  if (!lill && !(t[0] === 0x4d && t[1] === 0x4d)) return 0; // MM, big endian
  const u16 = (o) => (lill ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const u32 = (o) => (lill
    ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16)) + t[o + 3] * 0x1000000
    : t[o] * 0x1000000 + ((t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]));
  const ifd = u32(4);
  if (ifd + 2 > t.length) return 0;
  const antal = u16(ifd);
  for (let k = 0; k < antal; k += 1) {
    const post = ifd + 2 + k * 12;
    if (post + 12 > t.length) return 0;
    if (u16(post) === 0x0112) {
      const v = u16(post + 8);
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}

// Ett EXIF-block med bara orienteringen, little endian
function orienteringsblock(v) {
  const data = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // II, 42, IFD0 på byte 8
    0x01, 0x00, // en post
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, v, 0x00, 0x00, 0x00, // 0x0112, SHORT, 1, v
    0x00, 0x00, 0x00, 0x00 // ingen IFD efter
  ];
  const langd = data.length + 2;
  return Uint8Array.from([0xff, APP1, langd >> 8, langd & 0xff, ...data]);
}

function behall(markor, data) {
  // Tabeller och bildhuvud: SOF, DHT, DAC, DQT, DRI med flera ligger alla i
  // C0 till DF, utom C8 som är reserverad. En markör utanför det och utanför
  // APP används inte i en riktig JPEG och tas bort, så att ett förvanskat
  // block aldrig följer med som om det vore en tabell.
  if (markor >= 0xc0 && markor <= 0xdf && markor !== 0xc8) return true;
  if (markor === APP0) return true;
  if (markor === APP2) return borjarMed(data, 'ICC_PROFILE\0');
  if (markor === APP14) return borjarMed(data, 'Adobe');
  return false;
}

// Markörer utan längd hör aldrig hemma där ett block väntas
function utanLangd(markor) {
  return markor === SOI || markor === EOI || markor === 0x01 || (markor >= 0xd0 && markor <= 0xd7);
}

// Bilddatan från FF DA på plats i till och med FF D9, i delar. Falskt om
// filen tar slut före FF D9 eller om ett block är trasigt.
function bilddata(b, i, delar) {
  let start = i; // det som ännu inte kopierats
  let j = i;
  for (;;) {
    // j står på en markör med längd: ett skanningshuvud, eller ett block
    // mellan skanningarna
    if (j + 4 > b.length) return false;
    const markor = b[j + 1];
    const langd = (b[j + 2] << 8) | b[j + 3];
    const slut = j + 2 + langd;
    if (langd < 2 || slut > b.length) return false;
    if (markor === COM || (markor >= APP0 && markor <= 0xef)) {
      if (j > start) delar.push(b.subarray(start, j));
      start = slut;
    }
    j = slut;

    if (markor === SOS) {
      // Kodad bilddata. Där följs FF alltid av 00 eller av D0 till D7, så
      // nästa FF med något annat efter sig är en markör.
      for (;;) {
        j = b.indexOf(0xff, j);
        if (j < 0 || j + 1 >= b.length) return false;
        const nasta = b[j + 1];
        if (nasta === 0x00 || (nasta >= 0xd0 && nasta <= 0xd7)) j += 2;
        else if (nasta === 0xff) j += 1;
        else break;
      }
    } else {
      // Fyllnadsbyte FF får stå före en markör
      while (j + 1 < b.length && b[j] === 0xff && b[j + 1] === 0xff) j += 1;
      if (j + 1 >= b.length || b[j] !== 0xff) return false;
    }

    if (b[j + 1] === EOI) {
      delar.push(b.subarray(start, j + 2));
      return true;
    }
    if (utanLangd(b[j + 1])) return false;
  }
}

// Den rensade filen som en ny Uint8Array, eller null om det inte är en hel
// JPEG från FF D8 till FF D9
export function rensaJpeg(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) return null;

  const delar = [b.subarray(0, 2)];
  let vand = 0;
  let i = 2;
  for (;;) {
    // Fyllnadsbyte FF får stå före en markör
    while (i + 1 < b.length && b[i] === 0xff && b[i + 1] === 0xff) i += 1;
    if (i + 4 > b.length || b[i] !== 0xff) return null;
    const markor = b[i + 1];

    if (markor === SOS) {
      if (vand > 1) {
        // Efter JFIF-blocket om det finns, annars direkt efter FF D8
        const plats = delar.length > 1 && delar[1][1] === APP0 ? 2 : 1;
        delar.splice(plats, 0, orienteringsblock(vand));
      }
      if (!bilddata(b, i, delar)) return null;
      break;
    }
    if (utanLangd(markor)) return null;

    const langd = (b[i + 2] << 8) | b[i + 3];
    const slut = i + 2 + langd;
    if (langd < 2 || slut > b.length) return null;
    const data = b.subarray(i + 4, slut);
    if (markor === APP1 && !vand) vand = orientering(data);
    if (behall(markor, data)) delar.push(b.subarray(i, slut));
    i = slut;
  }

  const ut = new Uint8Array(delar.reduce((summa, d) => summa + d.length, 0));
  let o = 0;
  for (const d of delar) {
    ut.set(d, o);
    o += d.length;
  }
  return ut;
}
