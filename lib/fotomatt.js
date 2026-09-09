'use strict';

/*
 * Måtten på ett katalogfoto, och adresserna till dess varianter.
 *
 * Bakgrund: verktyg/bilder.js skalar varje foto till 480 och 900 px, och
 * lägger dessutom en avif i fotots egen bredd. Den bredden är olika för
 * olika foton, för de är beskurna olika. Skriver mallen i stället en fast
 * bredd i srcset pekar den på filer som bara finns för en del av fotona,
 * och webbläsaren väljer den bredden så fort skärmen är tät nog. Då blir
 * bilden trasig på mobilen men hel på datorn, alltså precis den sorts fel
 * som inte syns för den som bygger sidan.
 *
 * Därför läses måtten här, ur filen, och mallen får både srcset och
 * width/height räknade ur samma källa som varianterna.
 *
 * Måtten läses direkt ur jpeg-huvudet i stället för med sharp, eftersom
 * Eleventys filter är synkrona och sharp bara svarar med löften.
 */

const fs = require('node:fs');
const path = require('node:path');

const FOTOMAPP = path.join(__dirname, '..', 'assets', 'foto');
const ADRESS = '/assets/foto/';

// Bredderna som skalas fram. Fotots egen bredd läggs till per foto.
const BREDDER = [480, 900];

// Namnet på en variant. verktyg/bilder.js skapar filerna med samma namn.
function variantnamn(fil, bredd, format) {
  return String(fil).replace(/\.jpe?g$/i, '') + '-' + bredd + '.' + (format || 'jpg');
}

// Bredderna ett foto får, givet originalets bredd. Bredder som är lika
// stora som eller större än originalet hoppas över: att skala upp ett foto
// ger inga fler bildpunkter, bara en större fil.
function bredderFor(bredd) {
  return BREDDER.filter((b) => b < bredd).concat([bredd]);
}

/*
 * Är det här en skalad variant och inte ett original?
 *
 * Körs bildverktyget om utan att sidan byggts på nytt ligger varianterna
 * kvar i mappen, och då får de inte skalas i sin tur till
 * brada-900-480.jpg. Siffran i slutet duger däremot inte som kännetecken:
 * verkstadspanelen döper varje uppladdning till slug-1.jpg, slug-2.jpg,
 * så ett riktigt foto slutar också på bindestreck och en siffra. Ett foto
 * som sållades bort här får inga varianter alls, och sidan pekar då på
 * bilder som aldrig skapades.
 *
 * Därför frågas det efter originalet i stället: brada-900.jpg är en
 * variant eftersom brada.jpg ligger intill, medan slug-1.jpg är ett
 * original eftersom det inte finns någon slug.jpg.
 */
function arVariant(namn, finns) {
  const delar = /^(.*)-(\d+)\.(jpe?g|avif)$/i.exec(String(namn));
  if (!delar) return false;
  return finns(delar[1] + '.jpg') || finns(delar[1] + '.jpeg');
}

/*
 * Bredd och höjd ur ett jpeg-huvud.
 *
 * Filen är en kedja av segment som börjar med 0xFF. Måtten står i
 * ramhuvudet, SOF0 till SOF15, som är 0xC0 till 0xCF med undantag för
 * 0xC4, 0xC8 och 0xCC, vilka är tabeller och inte ramar.
 */
function matt(buffert) {
  if (buffert.length < 4 || buffert[0] !== 0xff || buffert[1] !== 0xd8) return null;

  let i = 2;
  while (i < buffert.length - 9) {
    if (buffert[i] !== 0xff) { i += 1; continue; }

    const markor = buffert[i + 1];

    // Utfyllnad mellan segment
    if (markor === 0xff) { i += 1; continue; }

    // Markörer som saknar längdfält, och alltså inget att hoppa över
    if (markor === 0x01 || (markor >= 0xd0 && markor <= 0xd9)) { i += 2; continue; }

    const ram = markor >= 0xc0 && markor <= 0xcf
      && markor !== 0xc4 && markor !== 0xc8 && markor !== 0xcc;

    if (ram) {
      return { bredd: buffert.readUInt16BE(i + 7), hojd: buffert.readUInt16BE(i + 5) };
    }

    i += 2 + buffert.readUInt16BE(i + 2);
  }

  return null;
}

// Ett foto som inte gick att läsa får bara sin egen adress. Ett test ser
// till att inget foto i sortimentet saknas, så det här är sista utposten
// och inte ett läge sidan ska hamna i.
function utanMatt(fil) {
  return { bredd: null, hojd: null, avif: '', jpeg: '', reserv: ADRESS + fil };
}

const minne = new Map();

function foto(fil) {
  const namn = String(fil);

  let stat;
  try {
    stat = fs.statSync(path.join(FOTOMAPP, namn));
  } catch (e) {
    return utanMatt(namn);
  }

  // Fotots ändringstid ligger i nyckeln, så utvecklingsservern som lever
  // vidare mellan byggen läser om ett foto som bytts ut.
  const nyckel = namn + ':' + stat.mtimeMs;
  if (minne.has(nyckel)) return minne.get(nyckel);

  const m = matt(fs.readFileSync(path.join(FOTOMAPP, namn)));
  const svar = m ? {
    bredd: m.bredd,
    hojd: m.hojd,
    avif: bredderFor(m.bredd)
      .map((b) => ADRESS + variantnamn(namn, b, 'avif') + ' ' + b + 'w')
      .join(', '),
    // I originalbredd finns ingen skalad jpeg, där är originalet självt
    // den största varianten.
    jpeg: bredderFor(m.bredd)
      .map((b) => ADRESS + (b === m.bredd ? namn : variantnamn(namn, b, 'jpg')) + ' ' + b + 'w')
      .join(', '),
    // Adressen för en webbläsare som inte förstår srcset. Största skalade
    // jpeg om den finns, annars originalet.
    reserv: ADRESS + (BREDDER.filter((b) => b < m.bredd).length
      ? variantnamn(namn, BREDDER.filter((b) => b < m.bredd).pop(), 'jpg')
      : namn)
  } : utanMatt(namn);

  minne.set(nyckel, svar);
  return svar;
}

module.exports = { BREDDER, FOTOMAPP, ADRESS, variantnamn, bredderFor, arVariant, matt, foto };
