// Gor mindre varianter av katalogfotona, till srcset.
//
// Fotona i assets/foto ar hogst 1400 px breda, men inte alla ar det: de ar
// beskurna olika och nagra ar smalare. Katalogkorten visar dem i rutor pa
// 190 px, och tumnaglarna i annu mindre. Utan mindre varianter laddar
// startsidan alltsa ett par megabyte foto for att fylla nagra frimarken, och
// det ar bade langsamt och nagot Google mater.
//
// Format: jpeg och avif. Webp ar med flit inte med. Matt pa de har fotona
// blev webp storre an mozjpeg, alltsa samre an det vi redan har, och ett
// format till i markupen kostar utan att ge nagot.
//
// Varianterna ar byggartefakter och skrivs rakt in i _site, inte i
// assets/foto. Det ar med flit: verkstadspanelen listar innehallet i
// assets/foto och skulle annars visa varje variant som ett oanvant foto att
// stada bort. Kallan forblir ett foto per brada.
//
// Avif tar drygt en sekund per bild att koda, sa fardiga varianter sparas i
// .bildcache och kopieras darifran nasta bygge. Nyckeln ar fotots innehall,
// sa ett andrat foto kodas om medan ororda gar pa kopiering.
//
// Kors efter eleventy, som tommer _site.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const Fotomatt = require('../lib/fotomatt.js');

const ROT = path.join(__dirname, '..');
const MAPP = path.join(ROT, '_site', 'assets', 'foto');
const CACHE = path.join(ROT, '.bildcache');
const BREDDER = Fotomatt.BREDDER;
const KVALITET = { jpeg: 72, avif: 55 };

// Namnet pa en variant. Delas med mallarna, som skriver adresserna genom
// filtret foto. Raknades namnet ut pa tva stallen skulle sidan peka pa
// bilder som inte finns sa fort de tva gick isar.
const variantnamn = Fotomatt.variantnamn;

// Adresserna i de byggda sidorna maste peka pa filer som faktiskt skapades.
// Bredderna kommer ur varje fotos egna matt, sa en mall som gissar en bredd
// ger en trasig bild bara pa de foton och de skarmar dar webblasaren valjer
// just den bredden. Det ar for lite for att marka nar man bygger sidan, sa
// bygget far leta sjalvt i stallet.
function kontrollera() {
  const sidor = [];

  const leta = (mapp) => {
    for (const post of fs.readdirSync(mapp, { withFileTypes: true })) {
      const full = path.join(mapp, post.name);
      if (post.isDirectory()) leta(full);
      else if (/\.(html|xml)$/i.test(post.name)) sidor.push(full);
    }
  };

  leta(path.join(ROT, '_site'));

  const saknade = new Map();

  for (const sida of sidor) {
    const text = fs.readFileSync(sida, 'utf8');

    // Traffar bade /assets/foto/x.jpg och samma adress med domannamnet
    // framfor, som i og:image.
    for (const trap of text.matchAll(/\/assets\/foto\/([A-Za-z0-9._-]+)/g)) {
      const namn = trap[1];
      if (!fs.existsSync(path.join(MAPP, namn))) {
        saknade.set(namn, path.relative(ROT, sida));
      }
    }
  }

  if (saknade.size) {
    const rader = [];
    for (const [namn, sida] of saknade) rader.push('  ' + namn + ', i ' + sida);
    throw new Error(
      saknade.size + ' bildadresser pekar pa filer som inte finns:\n' + rader.join('\n')
    );
  }

  return sidor.length;
}

async function skapa(kalla, mal, bredd, format) {
  const nyckel = crypto
    .createHash('sha1')
    .update(fs.readFileSync(kalla))
    .digest('hex')
    .slice(0, 16) + '-' + bredd + '.' + format;
  const cachad = path.join(CACHE, nyckel);

  if (!fs.existsSync(cachad)) {
    const bild = sharp(kalla).resize({ width: bredd });
    const kodad = format === 'avif'
      ? bild.avif({ quality: KVALITET.avif })
      : bild.jpeg({ quality: KVALITET.jpeg, mozjpeg: true });
    fs.mkdirSync(CACHE, { recursive: true });
    await kodad.toFile(cachad);
    return { fil: cachad, kodad: true };
  }

  return { fil: cachad, kodad: false };
}

async function main() {
  if (!fs.existsSync(MAPP)) {
    console.log('inga foton att skala');
    return;
  }

  const finns = (n) => fs.existsSync(path.join(MAPP, n));

  const original = fs
    .readdirSync(MAPP)
    .filter((n) => /\.jpe?g$/i.test(n))
    .filter((n) => !Fotomatt.arVariant(n, finns));

  let kodade = 0;
  let kopierade = 0;
  let jpegBytes = 0;
  let avifBytes = 0;

  for (const namn of original) {
    const kalla = path.join(MAPP, namn);
    const { width } = await sharp(kalla).metadata();

    // Originalbredden far en avif ocksa, sa hjaltebilden har ett litet
    // alternativ aven i sitt storsta lage. Samma lista som mallarna skriver
    // i srcset, se lib/fotomatt.js.
    const bredder = Fotomatt.bredderFor(width);

    for (const bredd of bredder) {
      for (const format of ['jpeg', 'avif']) {
        // Jpeg i originalbredd finns redan, det ar sjalva originalet.
        if (format === 'jpeg' && bredd === width) continue;

        const ut = variantnamn(namn, bredd, format === 'jpeg' ? 'jpg' : 'avif');
        const { fil, kodad } = await skapa(kalla, ut, bredd, format);
        fs.copyFileSync(fil, path.join(MAPP, ut));

        if (kodad) kodade += 1; else kopierade += 1;

        // Bara de bredder som finns i bada formaten gar att jamfora rakt av.
        if (bredd !== width) {
          if (format === 'avif') avifBytes += fs.statSync(fil).size;
          else jpegBytes += fs.statSync(fil).size;
        }
      }
    }
  }

  // Nu ligger varianterna pa plats, sa nu gar adresserna att kontrollera.
  const sidor = kontrollera();

  const vinst = jpegBytes ? Math.round(100 - (100 * avifBytes) / jpegBytes) : 0;
  console.log(
    'bildvarianter: ' + kodade + ' kodade, ' + kopierade + ' ur cachen, ' +
    original.length + ' foton. Avif ar ' + vinst + ' procent lattare an jpeg i samma bredd.'
  );
  console.log('bildadresser: alla stammer, ' + sidor + ' byggda sidor genomsokta.');
}

module.exports = { BREDDER, variantnamn, kontrollera };

if (require.main === module) {
  main().catch((e) => {
    console.error('bildvarianterna kunde inte skapas: ' + e.message);
    process.exit(1);
  });
}
