# Foto till omdömen, implementationsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En kund kan skicka med ett foto till sitt omdöme. Fotot rensas från platsdata, väntar i D1 tills Sebastian granskat det i panelen, och visas sedan i omdömesrutan.

**Architecture:** Webbläsaren krymper fotot till en JPEG under 1,5 MB och lägger tillbaka den i formulärets filfält. Pages-funktionen tar emot multipart, rensar metadata med ren kod (`lib/jpeg.mjs`) och sparar fotot som BLOB på omdömets rad. Panelen läser fotot som hex genom wrangler, behandlar det med sharp vid publicering och sparar det med slumpat namn i `assets/foto`. Bygget gör varianterna som för katalogens foton.

**Tech Stack:** Eleventy 3 och Nunjucks, Cloudflare Pages Functions med D1, Node 22 med `node:test`, sharp i panelen, vanilla JS i webbläsaren, playwright-core med befintlig Chromium för webbläsarkontroller.

**Spec:** `docs/superpowers/specs/2026-10-14-omdomesfoto-design.md`

**Avvikelser från specen**, båda små och motiverade:
1. `rensaJpeg` behåller orienteringen ur EXIF i ett nytt, minimalt block. Specen säger att APP1 tas bort helt. Utan orienteringen skulle ett stående mobilfoto som skickats utan JavaScript publiceras liggande, eftersom sharp vänder efter just den uppgiften.
2. Publicerade foton visas i panelen genom panelens befintliga adress `/assets/` (som läser ur `_site`), inte genom en ny `/api/omdomen-foto/<fil>`. Fotona är redan offentliga på sajten, och adressen finns redan.

## Global Constraints

- All text som kunden ser på svenska. Inga tankstreck (U+2013, U+2014) någonstans. Inga återbrukspåståenden.
- Typsnitt bara EB Garamond och Caveat, färger ur designsystemet (`var(--black)`, `var(--dov)`, `var(--rost)`, `var(--kort)`, `var(--papper)`).
- Ingen ny Cloudflare-tjänst. Fotot ligger i D1-databasen `myrdahls-klick`, bindning `KLICK`.
- Fotot får vara högst 1 500 000 byte. Kroppen högst 2 MiB (`2 * 1024 * 1024`).
- I webbläsaren: högst 1 600 px på längsta sidan, JPEG-kvalitet 0,85, sedan 0,7, sedan 0,55.
- I panelen: högst 1 400 px på längsta sidan utan förstoring, JPEG kvalitet 78 med mozjpeg, ingen metadata, ingen beskärning, ingen ljusjustering.
- Publicerat filnamn: `omdome-` och 12 små hextecken och `.jpg`, regex `^omdome-[0-9a-f]{12}\.jpg$`. Skrivs med flaggan `wx`.
- Den skarpa databasen får kolumnen `bild` innan den nya funktionen publiceras.
- Kommentarer i koden på svenska och förklarar varför. Skript i webbläsaren skrivs utan byggsteg, med `var` och löften, som `assets/forstora.js`.
- Mobil under 720 px: en kolumn.
- Arbetet görs på grenen `omdomesfoto` och slås ihop med `main` i sista uppgiften.

## Review Focus

1. **Stående mobilfoto skickat utan JavaScript** (EXIF-orientering 6): ska visas rättvänt efter publicering. Prövas i uppgift 2 (orienteringen överlever rensningen) och uppgift 5 (sharp vänder efter den).
2. **Inget foto valt i ett multipartformulär:** webbläsaren skickar ändå en tom fildel. Den ska räknas som inget foto, inte som en trasig JPEG. Prövas i uppgift 3.
3. **En fil som webbläsaren inte kan läsa**, till exempel HEIC i Chrome på Windows eller en textfil med bildnamn: fältet ska tömmas och förklaringen visas, och omdömet ska gå att skicka utan foto. Prövas i uppgift 4.
4. **Skicka trycks medan fotot krymps:** knappen ska vara avstängd tills den krympta filen ligger i fältet, annars kan originalet följa med. Prövas i uppgift 4.
5. **Ta bort ett publicerat omdöme vars fotofil redan saknas:** ska fungera utan fel. Prövas i uppgift 5.

---

### Task 1: Gren och spik, wrangler läser ett foto ur D1

Ingen produktkod. Svaret avgör om panelen kan läsa fotot i ett enda anrop.

**Files:**
- Inga i repot. Tillfälliga filer i sessionens scratchpad.

**Interfaces:**
- Consumes: inget.
- Produces: beslutet "ett anrop räcker" eller "läs i bitar" för `visaFoto` och `publicera` i uppgift 5.

- [ ] **Step 1: Skapa grenen**

```bash
cd C:/Projects/myrdahlstra && git fetch -q && git status -sb && git switch -c omdomesfoto
```
Expected: `## main...origin/main` utan ändringar, sedan `Switched to a new branch 'omdomesfoto'`.

- [ ] **Step 2: Skriv spikskriptet i scratchpad**

Skapa `<scratchpad>/spik-d1.js`:

```js
// Kastas efteråt. Lägger ett slumpat "foto" på 1,5 MB i den lokala D1 och
// läser tillbaka det som hex genom wrangler, på samma sätt som panelen gör.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROT = 'C:/Projects/myrdahlstra';
const wrangler = path.join(ROT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const kor = (...arg) => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'myrdahls-klick', '--local', ...arg],
  { cwd: ROT, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

const data = crypto.randomBytes(1500000);
const sql = path.join(__dirname, 'spik.sql');
fs.writeFileSync(sql, "CREATE TABLE IF NOT EXISTS spik (id INTEGER PRIMARY KEY, bild BLOB);\n" +
  "DELETE FROM spik;\nINSERT INTO spik (id, bild) VALUES (1, X'" + data.toString('hex') + "');\n");
kor('--file', sql);
const start = Date.now();
const ut = JSON.parse(kor('--json', '--command', 'SELECT hex(bild) AS hex FROM spik WHERE id = 1'));
const tillbaka = Buffer.from(ut[0].results[0].hex, 'hex');
console.log('lika:', tillbaka.equals(data), 'byte:', tillbaka.length, 'ms:', Date.now() - start);
kor('--command', 'DROP TABLE spik');
```

- [ ] **Step 3: Kör spiken**

Run: `node <scratchpad>/spik-d1.js`
Expected: `lika: true byte: 1500000 ms: <några tusen>`.

Blir det `lika: true`: uppgift 5 läser fotot i ett anrop, som planen är skriven. Blir det fel (wrangler kraschar, svaret avkortas): ersätt i uppgift 5 läsningen av `hex(bild)` med en slinga som hämtar `substr(hex(bild), 1 + 1000000 * k, 1000000)` tills svaret är tomt, och skriv det i uppgiftens commit.

Ingen commit i den här uppgiften.

---

### Task 2: Rensningen av metadata, `lib/jpeg.mjs`

**Files:**
- Create: `lib/jpeg.mjs`
- Create: `test/hjalp/jpeg.js`
- Test: `test/jpeg.test.js`

**Interfaces:**
- Consumes: inget.
- Produces: `rensaJpeg(bytes: Uint8Array | ArrayBuffer) -> Uint8Array | null` (ESM-export). Testhjälpen `test/hjalp/jpeg.js` exporterar `block(markor, text) -> Buffer`, `medBlock(jpeg, ...block) -> Buffer`, `provJpeg({ bredd, hojd, orientering, icc, brus }) -> Promise<Buffer>` och konstanterna `GPS`, `GPS_XMP`, `XMP`, `KOMMENTAR`, `IPTC` (Buffer).

- [ ] **Step 1: Skriv testhjälpen**

Skapa `test/hjalp/jpeg.js`:

```js
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
```

- [ ] **Step 2: Skriv testerna**

Skapa `test/jpeg.test.js`:

```js
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
```

- [ ] **Step 3: Kör testerna och se dem fallera**

Run: `node --test test/jpeg.test.js`
Expected: FAIL, `Cannot find module '...lib/jpeg.mjs'`.

- [ ] **Step 4: Skriv `lib/jpeg.mjs`**

```js
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
  if (markor === COM) return false;
  if (markor < APP0 || markor > 0xef) return true; // tabeller och bildhuvud
  if (markor === APP0) return true;
  if (markor === APP2) return borjarMed(data, 'ICC_PROFILE\0');
  if (markor === APP14) return borjarMed(data, 'Adobe');
  return false;
}

// Den rensade filen som en ny Uint8Array, eller null om det inte är en hel
// JPEG fram till bilddatan
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
      delar.push(b.subarray(i));
      break;
    }
    // Markörer utan längd hör inte hemma före bilddatan
    if (markor === SOI || markor === EOI || markor === 0x01 || (markor >= 0xd0 && markor <= 0xd7)) return null;

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
```

- [ ] **Step 5: Kör testerna**

Run: `node --test test/jpeg.test.js`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add lib/jpeg.mjs test/jpeg.test.js test/hjalp/jpeg.js
git commit -F - <<'EOF'
Rensning av metadata i JPEG utan bildbibliotek

GPS, XMP, IPTC och kommentarer tas bort, orienteringen behålls i ett
minimalt EXIF-block så att ett stående foto kan vändas rätt. Används av
omdömesfunktionen, som körs där sharp inte finns.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: Databasen och funktionen

**Files:**
- Modify: `db/omdome.sql` (tabellen `omdome`)
- Create: `db/omdome-bild.sql`
- Modify: `test/hjalp/d1.js` (`sats`)
- Modify: `functions/api/omdome.js` (importer, konstanter, `notis`, `onRequestPost`)
- Test: `test/omdome.test.js`

**Interfaces:**
- Consumes: `rensaJpeg` från `lib/jpeg.mjs`; `provJpeg`, `medBlock`, `GPS` från `test/hjalp/jpeg.js`.
- Produces: kolumnen `omdome.bild BLOB` (JPEG utan metadata, eller NULL). Formulärfältet heter `foto`. Notisens ämne slutar på `, med foto` när det finns ett foto.

- [ ] **Step 1: Lär låtsasdatabasen att ta emot BLOB som D1 gör**

I `test/hjalp/d1.js`, ersätt

```js
  const sats = (sql, varden = []) => ({
    bind: (...nya) => sats(sql, nya),
```

med

```js
  // D1 tar emot en BLOB som ArrayBuffer, node:sqlite som Uint8Array
  const somD1 = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
  const sats = (sql, varden = []) => ({
    bind: (...nya) => sats(sql, nya.map(somD1)),
```

- [ ] **Step 2: Lägg kolumnen i schemat och skriv migreringen**

I `db/omdome.sql`, ersätt

```sql
  text   TEXT NOT NULL,
  dag    TEXT NOT NULL       -- dagen det skrevs
);
```

med

```sql
  text   TEXT NOT NULL,
  dag    TEXT NOT NULL,      -- dagen det skrevs
  bild   BLOB                -- JPEG utan metadata, se lib/jpeg.mjs. Null utan foto
);
```

Skapa `db/omdome-bild.sql`:

```sql
-- Fotot till ett omdöme, se docs/superpowers/specs/2026-10-14-omdomesfoto-design.md.
-- För databaser som skapades innan kolumnen fanns. Körs en gång per databas:
--   node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --local --file=db/omdome-bild.sql
--   node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --file=db/omdome-bild.sql
-- Den skarpa databasen ska ha kolumnen innan functions/api/omdome.js med
-- foto publiceras. Annars misslyckas varje inskickat omdöme, även utan foto.
ALTER TABLE omdome ADD COLUMN bild BLOB;
```

- [ ] **Step 3: Skriv de nya testerna**

Överst i `test/omdome.test.js`, efter `const { fejkD1 } = require('./hjalp/d1.js');`, lägg till:

```js
const sharp = require('sharp');
const { provJpeg, medBlock, GPS } = require('./hjalp/jpeg.js');
```

Efter funktionen `falt`, lägg till:

```js
// Samma fält som ett multipartformulär, med eller utan foto
function formular(extra = {}, foto) {
  const fd = new FormData();
  for (const [k, v] of falt(extra)) fd.append(k, v);
  if (foto !== undefined) fd.append('foto', new Blob([foto], { type: 'image/jpeg' }), foto.length ? 'foto.jpg' : '');
  return fd;
}

const oanvand = (d1) => d1.db.prepare('SELECT anvand FROM inbjudan WHERE kod = ?').get(KOD).anvand === null;
```

Ersätt testet `'en för stor kropp avvisas med 413'` med:

```js
test('en för stor kropp avvisas med 413', async (t) => {
  const { svar, rader } = await skicka(t, falt({ text: 'x'.repeat(2 * 1024 * 1024 + 10) }));
  assert.equal(svar.status, 413);
  assert.equal(rader.length, 0);
});
```

Lägg till sist i filen:

```js
/* ---------- foto ---------- */

test('ett omdöme med foto sparas utan platsdata, och notisen säger med foto', async (t) => {
  const foto = medBlock(await provJpeg(), GPS);
  const { svar, rader, brev } = await skicka(t, formular({}, foto));
  assert.equal(svar.status, 303);
  const bild = Buffer.from(rader[0].bild);
  assert.equal(bild.includes(Buffer.from('GPSLatitude')), false, 'platsdatan ska vara borta');
  assert.equal((await sharp(bild).metadata()).width, 64);
  assert.match(brev[0].subject, /, med foto$/);
  assert.match(brev[0].text, /med foto har kommit in från Karin/);
});

test('ett multipartformulär utan foto sparar ingen bild och nämner inget foto', async (t) => {
  const { svar, rader, brev } = await skicka(t, formular());
  assert.equal(svar.status, 303);
  assert.equal(rader[0].bild, null);
  assert.doesNotMatch(brev[0].subject, /foto/);
});

test('ett tomt filfält räknas som inget foto', async (t) => {
  // Så skickar webbläsaren ett filfält där kunden inte valt något
  const { svar, rader } = await skicka(t, formular({}, Buffer.alloc(0)));
  assert.equal(svar.status, 303);
  assert.equal(rader[0].bild, null);
});

test('ett för stort foto ger 413, och varken text eller kod rörs', async (t) => {
  const d1 = databas();
  const stort = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(1500000)]);
  const { svar, rader } = await skicka(t, formular({}, stort), { d1 });
  assert.equal(svar.status, 413);
  assert.match(await svar.text(), /Fotot var för stort/);
  assert.equal(rader.length, 0);
  assert.ok(oanvand(d1), 'koden ska gå att använda igen');
});

test('en fil som inte är en JPEG ger 400, och varken text eller kod rörs', async (t) => {
  const d1 = databas();
  const { svar, rader } = await skicka(t, formular({}, Buffer.from('GIF89a inte en JPEG')), { d1 });
  assert.equal(svar.status, 400);
  assert.match(await svar.text(), /Fotot kunde inte läsas/);
  assert.equal(rader.length, 0);
  assert.ok(oanvand(d1));
});

test('omdome-bild.sql lägger till kolumnen i en databas som saknar den', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(SCHEMA, 'utf8').replace(/,\s*\n\s*bild\s+BLOB[^\n]*\n/, '\n');
  db.exec(schema);
  assert.ok(!db.prepare('PRAGMA table_info(omdome)').all().some((k) => k.name === 'bild'), 'det gamla schemat ska sakna bild');
  db.exec(fs.readFileSync(path.join(__dirname, '../db/omdome-bild.sql'), 'utf8'));
  assert.ok(db.prepare('PRAGMA table_info(omdome)').all().some((k) => k.name === 'bild'));
});
```

- [ ] **Step 4: Kör testerna och se de nya fallera**

Run: `node --test test/omdome.test.js`
Expected: tre tester fallerar.
- `'ett omdöme med foto sparas utan platsdata ...'`: fotot ignoreras, `bild` är null och notisen saknar "med foto".
- `'ett för stort foto ger 413 ...'`: statusen är redan 413 men av den gamla gränsen på 8 kB, så texten "Fotot var för stort" saknas.
- `'en fil som inte är en JPEG ger 400 ...'`: filen ignoreras och omdömet sparas med 303.

Övriga passerar redan: schemat har kolumnen sedan steg 2, och den gamla gränsen ger 413 på 2 MiB också.

- [ ] **Step 5: Ändra funktionen**

I `functions/api/omdome.js`, ersätt importen och konstanterna:

```js
import { STANDARD_MOTTAGARE, STANDARD_AVSANDARE, ForStorKropp, lasFormular, svarssida, skickaMejl }
  from '../../lib/sidsvar.mjs';

const MAX_KROPP = 8 * 1024;
```

med

```js
import { STANDARD_MOTTAGARE, STANDARD_AVSANDARE, ForStorKropp, lasFormular, svarssida, skickaMejl }
  from '../../lib/sidsvar.mjs';
import { rensaJpeg } from '../../lib/jpeg.mjs';

// Fotot krymps i kundens webbläsare, se assets/omdomesfoto.js. Gränsen på
// fotot håller raden under D1:s 2 MB, kroppen rymmer fotot och texten.
const MAX_KROPP = 2 * 1024 * 1024;
const MAX_FOTO = 1500000;
```

Ersätt funktionen `notis`:

```js
function notis(omdome, avsandare, mottagare) {
  return {
    from: avsandare,
    to: [mottagare],
    subject: 'Nytt omdöme väntar, ' + omdome.betyg + ' av 5',
    text: 'Ett omdöme har kommit in från ' + omdome.namn + '.\n\n' +
```

med

```js
function notis(omdome, medFoto, avsandare, mottagare) {
  return {
    from: avsandare,
    to: [mottagare],
    subject: 'Nytt omdöme väntar, ' + omdome.betyg + ' av 5' + (medFoto ? ', med foto' : ''),
    text: 'Ett omdöme ' + (medFoto ? 'med foto ' : '') + 'har kommit in från ' + omdome.namn + '.\n\n' +
```

Ersätt läsningen av formuläret:

```js
  let omdome;
  try {
    const data = await lasFormular(request, MAX_KROPP);
    const falt = {};
    for (const [k, v] of data.entries()) if (typeof v === 'string') falt[k] = v;
    omdome = rensa(falt);
  } catch (e) {
    if (e instanceof ForStorKropp) return fel('För långt', 'Omdömet var för långt att ta emot.', 413);
    return fel('Något gick fel', 'Formuläret kunde inte läsas.', 400);
  }
  if (omdome.fel) return fel('Fyll i lite mer', omdome.fel, 400);
```

med

```js
  let omdome;
  let fil = null;
  try {
    const data = await lasFormular(request, MAX_KROPP);
    const falt = {};
    for (const [k, v] of data.entries()) if (typeof v === 'string') falt[k] = v;
    omdome = rensa(falt);
    // Ett filfält där kunden inte valt något skickas ändå, som en tom del
    const f = data.get('foto');
    if (f && typeof f !== 'string' && f.size > 0) fil = f;
  } catch (e) {
    if (e instanceof ForStorKropp) return fel('För långt', 'Omdömet var för långt att ta emot.', 413);
    return fel('Något gick fel', 'Formuläret kunde inte läsas.', 400);
  }
  if (omdome.fel) return fel('Fyll i lite mer', omdome.fel, 400);

  // Fotot prövas innan något skrivs, så ett fel i det sparar inte heller texten
  let foto = null;
  if (fil) {
    if (fil.size > MAX_FOTO) {
      return fel('För stort foto', 'Fotot var för stort. Skicka omdömet utan foto, eller välj en mindre bild.', 413);
    }
    foto = rensaJpeg(new Uint8Array(await fil.arrayBuffer()));
    if (!foto) {
      return fel('Fotot gick inte att läsa', 'Fotot kunde inte läsas. Prova en annan bild, eller skicka omdömet utan foto.', 400);
    }
  }
```

Ersätt insättningen:

```js
      env.KLICK.prepare(
        "INSERT INTO omdome (kod, mal, betyg, namn, ort, text, dag) " +
        "SELECT kod, mal, ?, ?, ?, ?, date('now') FROM inbjudan WHERE kod = ? AND anvand IS NULL"
      ).bind(omdome.betyg, omdome.namn, omdome.ort, omdome.text, omdome.kod),
```

med

```js
      env.KLICK.prepare(
        "INSERT INTO omdome (kod, mal, betyg, namn, ort, text, dag, bild) " +
        "SELECT kod, mal, ?, ?, ?, ?, date('now'), ? FROM inbjudan WHERE kod = ? AND anvand IS NULL"
      ).bind(omdome.betyg, omdome.namn, omdome.ort, omdome.text,
        // D1 sparar en ArrayBuffer som BLOB
        foto ? foto.buffer.slice(foto.byteOffset, foto.byteOffset + foto.byteLength) : null,
        omdome.kod),
```

Ersätt anropet av notisen:

```js
      const skick = skickaMejl(env.RESEND_API_KEY, notis(omdome, avsandare, mottagare))
```

med

```js
      const skick = skickaMejl(env.RESEND_API_KEY, notis(omdome, Boolean(foto), avsandare, mottagare))
```

I kommentaren överst i filen, ersätt raden

```js
 * Ingen IP-adress och ingen webbläsaruppgift sparas, bara det kunden själv
 * skrev och dagen.
```

med

```js
 * Ingen IP-adress och ingen webbläsaruppgift sparas, bara det kunden själv
 * skrev, dagen och fotot om kunden skickade med ett. Fotot rensas från
 * platsdata och annan metadata innan det sparas, se lib/jpeg.mjs.
```

- [ ] **Step 6: Kör testerna**

Run: `node --test test/omdome.test.js test/jpeg.test.js`
Expected: alla passerar.

- [ ] **Step 7: Lägg kolumnen i den lokala databasen**

Run: `node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --local --file=db/omdome-bild.sql`
Expected: lyckas. Svarar den `duplicate column name: bild` finns kolumnen redan, det är också rätt. Den skarpa databasen rörs inte här, se uppgift 9.

- [ ] **Step 8: Kör hela sviten och committa**

Run: `npm test`
Expected: inga fel.

```bash
git add db/omdome.sql db/omdome-bild.sql test/hjalp/d1.js functions/api/omdome.js test/omdome.test.js
git commit -F - <<'EOF'
Omdömesfunktionen tar emot ett foto och rensar det innan det sparas

Formuläret får vara 2 MiB och fotot 1,5 MB. Fotot ska vara en JPEG och
sparas utan metadata i den nya kolumnen omdome.bild. Allt prövas innan
något skrivs. Notisen säger "med foto". Den skarpa databasen behöver
db/omdome-bild.sql innan funktionen publiceras.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Skrivsidan, fotofältet och krympningen i webbläsaren

**Files:**
- Modify: `src/omdome.njk` (formuläret, raden under knappen, skriptet)
- Create: `assets/omdomesfoto.js`
- Modify: `.eleventy.js` (passthrough)
- Modify: `assets/style.css` (efter `.omdomesformular__kod`-regeln)
- Test: webbläsarkontroll med skript i scratchpad

**Interfaces:**
- Consumes: fältnamnet `foto` och gränsen 1 500 000 byte från uppgift 3.
- Produces: `assets/omdomesfoto.js`, som byter innehållet i `input#foto` mot en JPEG med namnet `foto.jpg`.

- [ ] **Step 1: Lägg till fältet och texten i `src/omdome.njk`**

Ersätt

```html
<form class="omdomesformular uppgifter" action="/api/omdome" method="POST">
```

med

```html
<form class="omdomesformular uppgifter" action="/api/omdome" method="POST" enctype="multipart/form-data">
```

Efter `<textarea id="text" ...></textarea>`, lägg till:

```html

  <div class="omdomesformular__foto">
    <label for="foto">Foto (frivilligt)</label>
    <input type="file" id="foto" name="foto" accept="image/*">
    <p class="hjalptext">Gärna brädan i ditt kök. Fotot visas på sajten tillsammans med omdömet. Undvik ansikten och sådant som visar var du bor. Platsuppgifter i bildfilen tas bort.</p>
    <p class="hjalptext omdomesformular__fotofel" data-fotofel role="alert" hidden></p>
    <div class="omdomesformular__fotovisning" data-fotovisning hidden>
      <img alt="Fotot du valt">
      <button type="button" class="omdomesformular__tabort" data-fototabort>Ta bort fotot</button>
    </div>
  </div>
```

Ersätt raden under knappen

```html
  <p class="smatext">Omdömet visas på sajten med betyget, texten, namnet och orten du skriver och vilken månad det skrevs. Jag läser det innan det publiceras. Mer om hur omdömen hanteras står i <a href="/villkor/#omdomen">villkoren</a>.</p>
```

med

```html
  <p class="smatext">Omdömet visas på sajten med betyget, texten, namnet och orten du skriver, fotot om du skickar med ett, och vilken månad det skrevs. Jag läser det innan det publiceras. Mer om hur omdömen hanteras står i <a href="/villkor/#omdomen">villkoren</a>.</p>
```

Sist i filen, efter det befintliga `</script>`, lägg till:

```html
<script defer src="{{ '/assets/omdomesfoto.js' | version }}"></script>
```

- [ ] **Step 2: Skriv `assets/omdomesfoto.js`**

```js
/*
 * Krymper fotot kunden väljer på /omdome/ innan omdömet skickas.
 *
 * En mobilbild är 5 till 12 MB, och servern tar emot högst 1,5 MB. Här läses
 * fotot in, vänds efter sin orientering, ritas om på högst 1 600 px och
 * kodas som JPEG. Den nya filen läggs tillbaka i fältet, så formuläret
 * skickas som vanligt och serverns felsidor fungerar som förut.
 *
 * En canvas skriver aldrig EXIF, så platsdatan försvinner redan här. Servern
 * rensar ändå, för den som skickar utan skript, se lib/jpeg.mjs.
 *
 * Utan createImageBitmap eller DataTransfer gör skriptet ingenting, och
 * fotot skickas som det är.
 */
(function () {
  var falt = document.getElementById('foto');
  if (!falt || typeof createImageBitmap !== 'function' || typeof DataTransfer !== 'function') return;

  var MAX_SIDA = 1600;
  var MAX_BYTE = 1500000;
  var KVALITETER = [0.85, 0.7, 0.55];

  var knapp = falt.form.querySelector('button[type="submit"]');
  var visning = document.querySelector('[data-fotovisning]');
  var forhand = visning.querySelector('img');
  var taBort = document.querySelector('[data-fototabort]');
  var felrad = document.querySelector('[data-fotofel]');
  var adress = null;

  function visaFel(text) {
    felrad.textContent = text || '';
    felrad.hidden = !text;
  }

  function visaForhand(fil) {
    if (adress) URL.revokeObjectURL(adress);
    adress = fil ? URL.createObjectURL(fil) : null;
    if (adress) forhand.src = adress; else forhand.removeAttribute('src');
    visning.hidden = !fil;
  }

  function tom() {
    falt.value = '';
    visaForhand(null);
  }

  // Lägre kvalitet tills filen ryms, eller null om den aldrig gör det
  function kodad(canvas, i) {
    return new Promise(function (klar) {
      canvas.toBlob(klar, 'image/jpeg', KVALITETER[i]);
    }).then(function (blob) {
      if (blob && blob.size <= MAX_BYTE) return blob;
      if (i + 1 < KVALITETER.length) return kodad(canvas, i + 1);
      return null;
    });
  }

  function krymp(fil) {
    // Äldre webbläsare kan sakna alternativet och kastar då, försök utan
    return createImageBitmap(fil, { imageOrientation: 'from-image' })
      .catch(function () { return createImageBitmap(fil); })
      .then(function (bild) {
        var skala = Math.min(1, MAX_SIDA / Math.max(bild.width, bild.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(bild.width * skala);
        canvas.height = Math.round(bild.height * skala);
        canvas.getContext('2d').drawImage(bild, 0, 0, canvas.width, canvas.height);
        if (bild.close) bild.close();
        return kodad(canvas, 0);
      });
  }

  falt.addEventListener('change', function () {
    var fil = falt.files && falt.files[0];
    visaFel('');
    if (!fil) {
      visaForhand(null);
      return;
    }
    // Medan fotot krymps går formuläret inte att skicka, annars kunde
    // originalet följa med och vara för stort
    knapp.disabled = true;
    krymp(fil).then(function (blob) {
      if (!blob) {
        tom();
        visaFel('Fotot blev för stort även efter krympning. Välj en annan bild, eller skicka utan foto.');
        return;
      }
      var ny = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      var lista = new DataTransfer();
      lista.items.add(ny);
      falt.files = lista.files;
      visaForhand(ny);
    }).catch(function () {
      tom();
      visaFel('Den här bildtypen går inte att läsa här. Välj en JPEG, eller skicka utan foto.');
    }).then(function () {
      knapp.disabled = false;
    });
  });

  taBort.addEventListener('click', function () {
    tom();
    visaFel('');
    falt.focus();
  });
})();
```

- [ ] **Step 3: Kopiera skriptet vid bygget**

I `.eleventy.js`, efter `eleventyConfig.addPassthroughCopy('assets/forstora.js');`, lägg till:

```js
  eleventyConfig.addPassthroughCopy('assets/omdomesfoto.js');
```

- [ ] **Step 4: Stilarna**

I `assets/style.css`, direkt efter regeln `.omdomesformular__kod { ... }`, lägg till:

```css
/* Fotot till omdömet, se assets/omdomesfoto.js */
.omdomesformular__foto {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 15px;
  color: var(--dov);
}

.omdomesformular__foto input[type='file'] {
  font: inherit;
  color: var(--black);
}

.omdomesformular__fotofel {
  color: var(--rost);
}

.omdomesformular__fotovisning {
  display: flex;
  align-items: center;
  gap: 14px;
}

.omdomesformular__fotovisning img {
  width: 120px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border: 1px solid var(--black);
}

.omdomesformular__tabort {
  font: inherit;
  background: none;
  border: none;
  padding: 0;
  color: var(--black);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
```

- [ ] **Step 5: Bygg och kör testerna**

Run: `npm test && npx @11ty/eleventy --quiet`
Expected: inga fel, och `_site/assets/omdomesfoto.js` finns.

- [ ] **Step 6: Webbläsarkontroll i scratchpad**

Skapa `<scratchpad>/kolla-skrivsidan.mjs` (playwright-core finns redan i scratchpad, annars `npm i playwright-core` där). Chromium pekas ut direkt, se minnesanteckningen om mobilgranskning:

```js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire('C:/Projects/myrdahlstra/package.json');
const sharp = require('sharp');
const { medBlock, provJpeg, GPS_XMP } = require('C:/Projects/myrdahlstra/test/hjalp/jpeg.js');

const ROT = 'C:/Projects/myrdahlstra/_site';
const typ = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROT, p), (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': typ[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(4397);

// 4000 x 3000 med brus och GPS: flera MB, som en mobilbild
const stor = medBlock(await provJpeg({ bredd: 4000, hojd: 3000, brus: true, orientering: 6 }), GPS_XMP);
console.log('original:', stor.length, 'byte');

const browser = await chromium.launch({ executablePath: 'C:/Users/SebastianMyrdahl/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
for (const [lage, opt] of Object.entries({
  dator: { viewport: { width: 1280, height: 900 } },
  mobil: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
})) {
  const page = await (await browser.newContext(opt)).newPage();
  await page.goto('http://localhost:4397/omdome/#Ab3_-xYz9Q0w', { waitUntil: 'networkidle' });

  await page.setInputFiles('#foto', { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: stor });
  const avstangd = await page.$eval('button[type="submit"]', (k) => k.disabled);
  await page.waitForSelector('[data-fotovisning]:not([hidden])');
  const ut = await page.$eval('#foto', async (f) => {
    const fil = f.files[0];
    const bytes = new Uint8Array(await fil.arrayBuffer());
    const bild = await createImageBitmap(fil);
    const gps = new TextDecoder('latin1').decode(bytes).includes('GPSLatitude');
    return { namn: fil.name, typ: fil.type, byte: fil.size, bredd: bild.width, hojd: bild.height, gps };
  });
  console.log(lage, 'knappen avstängd under krympning:', avstangd, 'resultat:', JSON.stringify(ut));
  await page.locator('.omdomesformular').screenshot({ path: `${process.argv[2]}/${lage}-skrivsida-foto.png` });

  // En fil webbläsaren inte kan läsa
  await page.setInputFiles('#foto', { name: 'IMG_0002.heic', mimeType: 'image/heic', buffer: Buffer.from('inte en bild') });
  await page.waitForSelector('[data-fotofel]:not([hidden])');
  const fel = await page.$eval('[data-fotofel]', (p) => p.textContent);
  const kvar = await page.$eval('#foto', (f) => f.files.length);
  const knapp = await page.$eval('button[type="submit"]', (k) => k.disabled);
  console.log(lage, 'oläsbar fil:', JSON.stringify({ fel, filerKvar: kvar, knappAvstangd: knapp }));
}
await browser.close();
server.close();
```

Run: `cd <scratchpad> && MSYS_NO_PATHCONV=1 node kolla-skrivsidan.mjs <scratchpad>/skarm`
Expected, för både dator och mobil:
- `knappen avstängd under krympning: true`
- resultatet har `namn: "foto.jpg"`, `typ: "image/jpeg"`, `byte` under 1 500 000, `bredd: 1200`, `hojd: 1600` (orientering 6 har vänt 4000 x 3000 till stående), `gps: false`
- `oläsbar fil` har texten "Den här bildtypen går inte att läsa här...", `filerKvar: 0`, `knappAvstangd: false`

Titta på skärmbilderna: fältet, hjälptexten och förhandsvisningen med "Ta bort fotot" ska följa katalogstilen och rymmas i mobilbredd.

- [ ] **Step 7: Commit**

```bash
git add src/omdome.njk assets/omdomesfoto.js .eleventy.js assets/style.css
git commit -F - <<'EOF'
Skrivsidan får ett fält för foto som krymps i webbläsaren

Fotot vänds, ritas om på högst 1 600 px och kodas som JPEG under 1,5 MB
innan det läggs tillbaka i fältet. Knappen är avstängd medan det pågår.
En bildtyp som inte går att läsa töms med en förklaring.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Panelen, servern publicerar med och utan foto

**Files:**
- Modify: `verktyg/omdomen.js` (`FOTONAMN`, `fotonamn`, `medOmdome`, exporter)
- Modify: `verktyg/foto.js` (`omdomesfoto`, exporter)
- Modify: `verktyg/admin.js` (`hamtaAllt`, `hamtaOmdomen`, ny `visaFoto`, ny `sparaOmdomesfoto`, `publicera`, `taBort`, routerna)
- Test: `test/omdomen-panel.test.js`, `test/foto.test.js`

**Interfaces:**
- Consumes: kolumnen `omdome.bild` från uppgift 3.
- Produces:
  - `O.FOTONAMN: RegExp` (`/^omdome-[0-9a-f]{12}\.jpg$/`), `O.fotonamn() -> string`, `O.medOmdome(lista, rad, bild?)` som lägger till `bild` bara när den är satt.
  - `Foto.omdomesfoto(buffer) -> Promise<Buffer>`.
  - `GET /api/omdomen` svarar med `harFoto` (0 eller 1) på varje väntande omdöme.
  - `GET /api/omdomen/<id>/foto` svarar `image/jpeg`, kräver `X-Panel: 1`.
  - `POST /api/omdomen/<id>/publicera` och `POST /api/omdomen/<id>/publicera-utan-foto`.
  - Publicerade omdömen kan ha `bild` i `omdomen.json`.

- [ ] **Step 1: Skriv testet för `omdomesfoto`**

Sist i `test/foto.test.js`, lägg till:

```js
/* ---------- omdömesfoto ---------- */

const { provJpeg, medBlock, GPS_XMP } = require('./hjalp/jpeg.js');
const sharpForTest = require('sharp');

test('ett omdömesfoto vänds, krymps och blir av med metadata, utan beskärning', async () => {
  // 3000 x 2000 med orientering 6 är egentligen ett stående foto, 2000 x 3000
  const in_ = medBlock(await provJpeg({ bredd: 3000, hojd: 2000, orientering: 6 }), GPS_XMP);
  const ut = await F.omdomesfoto(in_);
  const m = await sharpForTest(ut).metadata();
  assert.equal(m.format, 'jpeg');
  assert.equal(m.height, 1400);
  assert.equal(m.width, 933);
  assert.equal(m.orientation, undefined);
  assert.equal(m.exif, undefined);
  assert.equal(m.xmp, undefined);
  assert.equal(Buffer.from(ut).includes(Buffer.from('GPSLatitude')), false);
});

test('ett litet omdömesfoto förstoras inte', async () => {
  const m = await sharpForTest(await F.omdomesfoto(await provJpeg({ bredd: 640, hojd: 480 }))).metadata();
  assert.equal(m.width, 640);
  assert.equal(m.height, 480);
});
```

- [ ] **Step 2: Skriv panelens tester**

I `test/omdomen-panel.test.js`, ersätt helpern `panel` och dess anrop av `skapaServer`:

```js
async function panel(t, fragaD1) {
```

med

```js
async function panel(t, fragaD1, { foto } = {}) {
```

och

```js
  const server = skapaServer({ rot, byggSajt: async () => { byggen.push(1); return { ok: true }; }, fragaD1 });
```

med

```js
  const server = skapaServer({ rot, byggSajt: async () => { byggen.push(1); return { ok: true }; }, fragaD1, foto });
```

Lägg till i `return`-objektet i `panel` en hjälp som listar fotomappen:

```js
  const foton = () => {
    try { return fs.readdirSync(path.join(rot, 'assets/foto')).sort(); } catch (e) { return []; }
  };
  return { url, anrop, fil, byggen, rot, foton };
```

(ersätter `return { url, anrop, fil, byggen, rot };`).

Ersätt testet `'allt om omdömen kräver panelens huvud'` med:

```js
test('allt om omdömen kräver panelens huvud', async (t) => {
  const { url } = await panel(t, async () => assert.fail('ska inte frågas'));
  assert.equal((await fetch(url + '/api/omdomen')).status, 403);
  assert.equal((await fetch(url + '/api/omdomen/9/foto')).status, 403);
  for (const vag of ['/api/inbjudan', '/api/omdomen/9/publicera', '/api/omdomen/9/publicera-utan-foto',
    '/api/omdomen/9/avsla', '/api/omdomen/9/ta-bort']) {
    assert.equal((await fetch(url + vag, { method: 'POST', body: '{}' })).status, 403, vag);
  }
});
```

Lägg till sist i filen:

```js
/* ---------- foto ---------- */

const medFoto = { ...vantande, bildhex: 'FFD8FFD9' };
// Bildbehandlingen fejkas: testet gäller flödet, inte sharp
const behandlare = (anrop = []) => ({
  omdomesfoto: async (buf) => { anrop.push(buf); return Buffer.from('BEHANDLAD'); }
});

test('namnet på ett omdömesfoto är slumpat och har rätt form', () => {
  const namn = new Set(Array.from({ length: 50 }, O.fotonamn));
  assert.equal(namn.size, 50);
  for (const n of namn) assert.match(n, O.FOTONAMN);
  assert.doesNotMatch('omdome-ABCDEF123456.jpg', O.FOTONAMN);
  assert.doesNotMatch('../omdome-aaaaaaaaaaaa.jpg', O.FOTONAMN);
});

test('listan säger vilka väntande omdömen som har foto', async (t) => {
  const fragor = [];
  const { anrop } = await panel(t, async (q) => { fragor.push(q); return [[{ ...vantande, harFoto: 1 }], []]; });
  const data = await (await anrop('/api/omdomen')).json();
  assert.match(fragor[0], /bild IS NOT NULL AS harFoto/);
  assert.doesNotMatch(fragor[0], /hex\(bild\)/, 'själva fotot ska inte hämtas till listan');
  assert.equal(data.vantande[0].harFoto, 1);
});

test('fotot i inkorgen hämtas ur databasen', async (t) => {
  const fragor = [];
  const { url } = await panel(t, async (q) => { fragor.push(q); return [[{ hex: 'FFD8FFD9' }]]; });
  const svar = await fetch(url + '/api/omdomen/9/foto', { headers: { 'X-Panel': '1' } });
  assert.equal(svar.status, 200);
  assert.equal(svar.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await svar.arrayBuffer()), Buffer.from('FFD8FFD9', 'hex'));
  assert.equal(fragor[0], 'SELECT hex(bild) AS hex FROM omdome WHERE id = 9');
});

test('ett omdöme utan foto i inkorgen ger 404 på fotot', async (t) => {
  const { url } = await panel(t, async () => [[{ hex: null }]]);
  assert.equal((await fetch(url + '/api/omdomen/9/foto', { headers: { 'X-Panel': '1' } })).status, 404);
});

test('publicera med foto sparar det behandlade fotot under ett slumpat namn', async (t) => {
  const fragor = [];
  const behandlat = [];
  const { anrop, fil, foton, rot } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[medFoto]] : [[]];
  }, { foto: behandlare(behandlat) });
  const svar = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(svar.status, 200);
  assert.match(fragor[0], /hex\(bild\) AS bildhex/);
  assert.deepEqual(behandlat[0], Buffer.from('FFD8FFD9', 'hex'));
  const bild = fil()[0].bild;
  assert.match(bild, O.FOTONAMN);
  assert.deepEqual(foton(), [bild]);
  assert.equal(fs.readFileSync(path.join(rot, 'assets/foto', bild), 'utf8'), 'BEHANDLAD');
  assert.match(fragor[1], /^DELETE FROM omdome WHERE id = 9$/);
});

test('publicera utan foto skriver ingen fil och hämtar inte fotot', async (t) => {
  const fragor = [];
  const behandlat = [];
  const { anrop, fil, foton } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[vantande]] : [[]];
  }, { foto: behandlare(behandlat) });
  assert.equal((await anrop('/api/omdomen/9/publicera-utan-foto', {})).status, 200);
  assert.doesNotMatch(fragor[0], /hex\(bild\)/);
  assert.equal(fil()[0].bild, undefined);
  assert.deepEqual(foton(), []);
  assert.equal(behandlat.length, 0);
  assert.match(fragor[1], /^DELETE FROM omdome WHERE id = 9$/);
});

test('går fotot inte att behandla skrivs och raderas ingenting', async (t) => {
  const fragor = [];
  const { anrop, fil, foton, byggen } = await panel(t, async (q) => {
    fragor.push(q);
    return q.startsWith('SELECT') ? [[medFoto]] : [[]];
  }, { foto: { omdomesfoto: async () => { throw new Error('Input buffer contains unsupported image format'); } } });
  const svar = await anrop('/api/omdomen/9/publicera', {});
  assert.equal(svar.status, 422);
  assert.match((await svar.json()).fel[0], /Publicera utan foto/);
  assert.deepEqual(fil(), []);
  assert.deepEqual(foton(), []);
  assert.ok(!fragor.some((q) => q.startsWith('DELETE')));
  assert.equal(byggen.length, 0);
});

test('ett nytt försök efter misslyckad radering behandlar inget nytt foto', async (t) => {
  let felVidDelete = true;
  const behandlat = [];
  const { anrop, fil, foton } = await panel(t, async (q) => {
    if (q.startsWith('DELETE') && felVidDelete) throw new Error('Wrangler kunde inte fråga databasen: nätet');
    return q.startsWith('SELECT') ? [[medFoto]] : [[]];
  }, { foto: behandlare(behandlat) });
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 502);
  felVidDelete = false;
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 200);
  assert.equal(behandlat.length, 1);
  assert.equal(fil().length, 1);
  assert.equal(foton().length, 1);
});

test('ett namn som redan finns ger ett nytt, och den gamla filen rörs inte', async (t) => {
  const namn = ['omdome-aaaaaaaaaaaa.jpg', 'omdome-bbbbbbbbbbbb.jpg'];
  t.mock.method(O, 'fotonamn', () => namn.shift());
  const { anrop, fil, rot } = await panel(t, async (q) => (q.startsWith('SELECT') ? [[medFoto]] : [[]]),
    { foto: behandlare() });
  fs.mkdirSync(path.join(rot, 'assets/foto'), { recursive: true });
  fs.writeFileSync(path.join(rot, 'assets/foto/omdome-aaaaaaaaaaaa.jpg'), 'GAMMAL');
  assert.equal((await anrop('/api/omdomen/9/publicera', {})).status, 200);
  assert.equal(fil()[0].bild, 'omdome-bbbbbbbbbbbb.jpg');
  assert.equal(fs.readFileSync(path.join(rot, 'assets/foto/omdome-aaaaaaaaaaaa.jpg'), 'utf8'), 'GAMMAL');
});

test('ta bort raderar fotot med omdömet', async (t) => {
  const { anrop, fil, foton } = await panel(t, async (q) => (q.startsWith('SELECT') ? [[medFoto]] : [[]]),
    { foto: behandlare() });
  await anrop('/api/omdomen/9/publicera', {});
  assert.equal(foton().length, 1);
  assert.equal((await anrop('/api/omdomen/9/ta-bort', {})).status, 200);
  assert.deepEqual(fil(), []);
  assert.deepEqual(foton(), []);
});

test('ta bort fungerar även när fotofilen redan saknas', async (t) => {
  const { anrop, fil, rot } = await panel(t, async () => [[]]);
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), JSON.stringify([
    { id: 9, kod: 'AAAAAAAAAAAA', betyg: 5, namn: 'Per', ort: '', text: 'Fin.', datum: '2026-10-03', bild: 'omdome-cccccccccccc.jpg' }
  ]));
  assert.equal((await anrop('/api/omdomen/9/ta-bort', {})).status, 200);
  assert.deepEqual(fil(), []);
});

test('omdömesfoton räknas inte som oanvända', async (t) => {
  const { anrop, rot } = await panel(t, async () => [[]]);
  fs.mkdirSync(path.join(rot, 'assets/foto'), { recursive: true });
  fs.writeFileSync(path.join(rot, 'assets/foto/omdome-dddddddddddd.jpg'), 'x');
  fs.writeFileSync(path.join(rot, 'assets/foto/glomd.jpg'), 'x');
  fs.writeFileSync(path.join(rot, 'src/_data/omdomen.json'), JSON.stringify([
    { id: 1, kod: 'AAAAAAAAAAAA', betyg: 5, namn: 'Per', ort: '', text: 'Fin.', datum: '2026-10-03', bild: 'omdome-dddddddddddd.jpg' }
  ]));
  const data = await (await anrop('/api/allt')).json();
  assert.deepEqual(data.oanvandaFoton, ['glomd.jpg']);
});
```

- [ ] **Step 3: Kör testerna och se dem fallera**

Run: `node --test test/omdomen-panel.test.js test/foto.test.js`
Expected: FAIL, bland annat `O.fotonamn is not a function`, `F.omdomesfoto is not a function` och 404 på `publicera-utan-foto`.

- [ ] **Step 4: `verktyg/omdomen.js`**

Efter `const MAL = 'allmant';`, lägg till:

```js

// Namnet på ett publicerat omdömesfoto i assets/foto. Slumpat, så att det
// aldrig krockar och ett nytt foto aldrig får ett gammalt fotos adress i
// någon cache. Inbjudningskoden används inte, den ska inte synas offentligt.
// Små hextecken, så att två namn aldrig skiljer sig bara i versaler, vilket
// Windows inte ser.
const FOTONAMN = /^omdome-[0-9a-f]{12}\.jpg$/;

function fotonamn() {
  return 'omdome-' + crypto.randomBytes(6).toString('hex') + '.jpg';
}
```

Ersätt slutet av `medOmdome`:

```js
  return lista.concat([{
    id: rad.id, kod: rad.kod, betyg: rad.betyg, namn: rad.namn, ort: rad.ort, text: rad.text, datum: rad.dag
  }]);
}
```

med

```js
  const ny = { id: rad.id, kod: rad.kod, betyg: rad.betyg, namn: rad.namn, ort: rad.ort, text: rad.text, datum: rad.dag };
  if (bild) ny.bild = bild;
  return lista.concat([ny]);
}
```

och funktionens första rad `function medOmdome(lista, rad) {` med `function medOmdome(lista, rad, bild) {`.

Ersätt exporten:

```js
module.exports = { KrockandeId, KOD, MAL, nyKod, las, medOmdome, utanOmdome, sql, lank };
```

med

```js
module.exports = { KrockandeId, KOD, MAL, FOTONAMN, nyKod, fotonamn, las, medOmdome, utanOmdome, sql, lank };
```

- [ ] **Step 5: `verktyg/foto.js`**

Efter funktionen `forhandsvisning`, lägg till:

```js
// Ett foto som en kund skickat med sitt omdöme. Ingen beskärning och ingen
// ljusjustering, det är kundens bild och kundens utsnitt. Vänds efter EXIF,
// krymps till katalogens största bredd, och metadata följer inte med.
async function omdomesfoto(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: MAX_BREDD, height: MAX_BREDD, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: KVALITET, mozjpeg: true })
    .toBuffer();
}
```

och lägg `omdomesfoto,` i `module.exports` efter `forhandsvisning,`.

- [ ] **Step 6: `verktyg/admin.js`, listan och fotot i inkorgen**

I `hamtaAllt`, ersätt

```js
    const anvanda = new Set(
      produkter.flatMap((x) => x.bilder || []).concat((serie.steg || []).map((s) => s.fil))
    );
```

med

```js
    const anvanda = new Set(
      produkter.flatMap((x) => x.bilder || []).concat((serie.steg || []).map((s) => s.fil))
        // Omdömenas foton ligger i samma mapp men hör inte till någon bräda
        .concat(O.las(OMDOMESFIL).map((o) => o.bild).filter(Boolean))
    );
```

I `hamtaOmdomen`, ersätt

```js
        'SELECT id, kod, betyg, namn, ort, text, dag FROM omdome ORDER BY id; ' +
```

med

```js
        // Bara om det finns ett foto. Själva fotot hämtas ett i taget, se visaFoto.
        'SELECT id, kod, betyg, namn, ort, text, dag, bild IS NOT NULL AS harFoto FROM omdome ORDER BY id; ' +
```

Efter `nyInbjudan`, lägg till:

```js
  // Fotot i inkorgen. wrangler svarar med text, så fotot hämtas som hex.
  async function visaFoto(res, id) {
    let rad;
    try {
      [[rad] = []] = await d1('SELECT hex(bild) AS hex FROM omdome WHERE id = ' + O.sql(id));
    } catch (e) {
      return json(res, 502, { fel: [e.message] });
    }
    if (!rad || !rad.hex) return json(res, 404, { fel: ['Omdömet har inget foto i inkorgen.'] });
    const data = Buffer.from(rad.hex, 'hex');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    res.end(data);
  }

  // Skriver aldrig över en fil. Ett namn som redan finns ger ett nytt.
  function sparaOmdomesfoto(data) {
    fs.mkdirSync(FOTOMAPP, { recursive: true });
    for (let forsok = 0; forsok < 5; forsok += 1) {
      const namn = O.fotonamn();
      let fd;
      try {
        fd = fs.openSync(path.join(FOTOMAPP, namn), 'wx');
      } catch (e) {
        if (e.code === 'EEXIST') continue;
        throw e;
      }
      try { fs.writeFileSync(fd, data); } finally { fs.closeSync(fd); }
      return namn;
    }
    throw new Error('Hittade inget ledigt namn för fotot.');
  }
```

- [ ] **Step 7: `verktyg/admin.js`, publicera med och utan foto**

Ersätt hela `publicera`:

```js
  async function publicera(res, id) {
    return medLas(res, async () => {
      let rad;
      try {
        [[rad] = []] = await d1('SELECT id, kod, betyg, namn, ort, text, dag FROM omdome WHERE id = ' + O.sql(id));
      } catch (e) {
        return json(res, 502, { fel: [e.message] });
      }
      if (!rad) return json(res, 404, { fel: ['Omdömet finns inte i inkorgen. Ladda om sidan.'] });

      // Filen först. Går borttagningen ur D1 fel efteråt ligger omdömet redan
      // publicerat, och ett nytt försök lägger inte till det igen.
      let lista;
      try {
        lista = O.medOmdome(O.las(OMDOMESFIL), rad);
      } catch (e) {
        if (e instanceof O.KrockandeId) return json(res, 409, { fel: [e.message] });
        throw e;
      }
      P.skriv(OMDOMESFIL, lista);
```

med

```js
  // medFoto false publicerar bara texten. Fotot raderas då med raden i D1,
  // till exempel när det visar andra personer.
  async function publicera(res, id, medFoto) {
    return medLas(res, async () => {
      let rad;
      try {
        [[rad] = []] = await d1('SELECT id, kod, betyg, namn, ort, text, dag' +
          (medFoto ? ', hex(bild) AS bildhex' : '') + ' FROM omdome WHERE id = ' + O.sql(id));
      } catch (e) {
        return json(res, 502, { fel: [e.message] });
      }
      if (!rad) return json(res, 404, { fel: ['Omdömet finns inte i inkorgen. Ladda om sidan.'] });

      // Filen först. Går borttagningen ur D1 fel efteråt ligger omdömet redan
      // publicerat, och ett nytt försök lägger inte till det igen.
      const fore = O.las(OMDOMESFIL);
      let lista;
      try {
        lista = O.medOmdome(fore, rad);
      } catch (e) {
        if (e instanceof O.KrockandeId) return json(res, 409, { fel: [e.message] });
        throw e;
      }
      // Samma lista tillbaka betyder att omdömet redan var publicerat, och
      // då är fotot också redan sparat
      if (medFoto && rad.bildhex && lista !== fore) {
        let jpeg;
        try {
          jpeg = await F.omdomesfoto(Buffer.from(rad.bildhex, 'hex'));
        } catch (e) {
          return json(res, 422, { fel: [
            'Fotot gick inte att behandla (' + e.message + '). Tryck Publicera utan foto, eller Avslå.'
          ] });
        }
        lista = O.medOmdome(fore, rad, sparaOmdomesfoto(jpeg));
      }
      P.skriv(OMDOMESFIL, lista);
```

(resten av funktionen, borttagningen ur D1 och bygget, är oförändrad).

Ersätt hela `taBort`:

```js
  async function taBort(res, id) {
    return medLas(res, async () => {
      P.skriv(OMDOMESFIL, O.utanOmdome(O.las(OMDOMESFIL), id));
      const bygge = await (byggSajt || bygg)();
      json(res, 200, { publicerade: O.las(OMDOMESFIL), bygge });
    });
  }
```

med

```js
  async function taBort(res, id) {
    return medLas(res, async () => {
      const lista = O.las(OMDOMESFIL);
      const borta = lista.find((o) => o.id === id);
      P.skriv(OMDOMESFIL, O.utanOmdome(lista, id));
      // Fotot hör till omdömet. Ber kunden om att få omdömet borttaget ska
      // bilden försvinna med texten. Bara namn på rätt form, så att en
      // felskriven omdomen.json aldrig kan radera något annat.
      if (borta && borta.bild && O.FOTONAMN.test(borta.bild)) {
        fs.rmSync(path.join(FOTOMAPP, borta.bild), { force: true });
      }
      const bygge = await (byggSajt || bygg)();
      json(res, 200, { publicerade: O.las(OMDOMESFIL), bygge });
    });
  }
```

- [ ] **Step 8: `verktyg/admin.js`, routerna**

Efter blocket för `GET /api/omdomen`, lägg till:

```js
      const fo = väg.match(/^\/api\/omdomen\/(\d{1,9})\/foto$/);
      if (req.method === 'GET' && fo) {
        if (!franPanelen(req)) return json(res, 403, { fel: ['Anropet kom inte från panelen.'] });
        return await visaFoto(res, Number(fo[1]));
      }
```

Ersätt

```js
      const om = väg.match(/^\/api\/omdomen\/(\d{1,9})\/(publicera|avsla|ta-bort)$/);
      if (req.method === 'POST' && om) {
        const id = Number(om[1]);
        if (om[2] === 'publicera') return await publicera(res, id);
```

med

```js
      const om = väg.match(/^\/api\/omdomen\/(\d{1,9})\/(publicera|publicera-utan-foto|avsla|ta-bort)$/);
      if (req.method === 'POST' && om) {
        const id = Number(om[1]);
        if (om[2] === 'publicera') return await publicera(res, id, true);
        if (om[2] === 'publicera-utan-foto') return await publicera(res, id, false);
```

- [ ] **Step 9: Kör testerna**

Run: `node --test test/omdomen-panel.test.js test/foto.test.js`
Expected: alla passerar. Om spiken i uppgift 1 krävde bitvis läsning: byt läsningen i `visaFoto` och `publicera` mot slingan med `substr` och kör igen.

- [ ] **Step 10: Hela sviten och commit**

Run: `npm test`
Expected: inga fel.

```bash
git add verktyg/omdomen.js verktyg/foto.js verktyg/admin.js test/omdomen-panel.test.js test/foto.test.js
git commit -F - <<'EOF'
Panelen publicerar omdömen med eller utan foto

Fotot läses ur D1 som hex, behandlas med sharp utan beskärning och sparas
i assets/foto under ett slumpat namn som aldrig skriver över något. Ta bort
raderar fotot med omdömet, och omdömesfoton räknas inte som oanvända.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Panelen, sidan visar fotona och knapparna

**Files:**
- Modify: `verktyg/omdomen.html` (stil, `omdomeskort`, väntande och publicerade)
- Test: webbläsarkontroll mot den lokala databasen

**Interfaces:**
- Consumes: `harFoto`, `GET /api/omdomen/<id>/foto`, `POST .../publicera-utan-foto` från uppgift 5. Publicerade foton nås på `/assets/foto/<bild>`, som panelen redan serverar ur `_site`.
- Produces: inget som andra uppgifter använder.

- [ ] **Step 1: Stilen**

I `<style>` i `verktyg/omdomen.html`, efter regeln `.kort .vem { ... }`, lägg till:

```css
  .kort img.foto { display: block; max-width: 320px; max-height: 240px; margin: 8px 0; border: 1px solid var(--linje); }
```

- [ ] **Step 2: Kortet tar emot ett foto**

Ersätt

```js
  function omdomeskort(o, datum, knappar) {
    const kort = el('div', 'kort');
    kort.append(el('div', 'betyg', stjarnor(o.betyg) + '  ' + o.betyg + ' av 5'));
    kort.append(el('p', 'text', o.text));
```

med

```js
  function omdomeskort(o, datum, knappar, foto) {
    const kort = el('div', 'kort');
    kort.append(el('div', 'betyg', stjarnor(o.betyg) + '  ' + o.betyg + ' av 5'));
    kort.append(el('p', 'text', o.text));
    if (foto) kort.append(foto);
```

Efter funktionen `omdomeskort`, lägg till:

```js
  // Fotot i inkorgen hämtas med panelens huvud, som allt annat från D1, och
  // visas som en blob-adress. En vanlig <img src> kan inte skicka huvudet.
  function vantandeFoto(id) {
    const img = el('img', 'foto');
    img.alt = 'Fotot som skickades med omdömet';
    fetch('/api/omdomen/' + id + '/foto', { headers: huvud })
      .then((svar) => {
        if (!svar.ok) throw new Error('Fotot kunde inte hämtas.');
        return svar.blob();
      })
      .then((blob) => { img.src = URL.createObjectURL(blob); })
      .catch((e) => { img.replaceWith(el('p', 'fel', e.message)); });
    return img;
  }

  // Ett publicerat foto ligger i den byggda sajten, som panelen serverar
  function publiceratFoto(bild) {
    const img = el('img', 'foto');
    img.alt = 'Fotot som publicerades med omdömet';
    img.src = '/assets/foto/' + encodeURIComponent(bild);
    return img;
  }
```

- [ ] **Step 3: Knapparna på väntande omdömen**

Ersätt

```js
    for (const o of data.vantande) {
      vant.append(omdomeskort(o, o.dag, [
        ['Publicera', async () => { visaFel(''); await anrop('/api/omdomen/' + o.id + '/publicera', {}); await ladda(); }, 'huvud'],
        ['Avslå', async () => {
```

med

```js
    for (const o of data.vantande) {
      const utanFoto = o.harFoto ? [['Publicera utan foto', async () => {
        if (!confirm('Publicera omdömet från ' + o.namn + ' utan fotot? Fotot raderas och går inte att få tillbaka.')) return;
        visaFel('');
        await anrop('/api/omdomen/' + o.id + '/publicera-utan-foto', {});
        await ladda();
      }]] : [];
      vant.append(omdomeskort(o, o.dag, [
        ['Publicera', async () => { visaFel(''); await anrop('/api/omdomen/' + o.id + '/publicera', {}); await ladda(); }, 'huvud'],
        ...utanFoto,
        ['Avslå', async () => {
```

och, i samma anrop, avslutningen

```js
          await anrop('/api/omdomen/' + o.id + '/avsla', {});
          await ladda();
        }]
      ]));
    }
```

med

```js
          await anrop('/api/omdomen/' + o.id + '/avsla', {});
          await ladda();
        }]
      ], o.harFoto ? vantandeFoto(o.id) : null));
    }
```

- [ ] **Step 4: Fotot på publicerade omdömen**

Ersätt

```js
          await anrop('/api/omdomen/' + o.id + '/ta-bort', {});
          await ladda();
        }]
      ]));
```

med

```js
          await anrop('/api/omdomen/' + o.id + '/ta-bort', {});
          await ladda();
        }]
      ], o.bild ? publiceratFoto(o.bild) : null));
```

och bekräftelsetexten `'Ta bort omdömet från ' + o.namn + ' från sajten?'` med `'Ta bort omdömet från ' + o.namn + ' från sajten?' + (o.bild ? ' Fotot raderas också.' : '')`.

- [ ] **Step 5: Kontroll mot den lokala databasen**

Skapa `<scratchpad>/kolla-panelen.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const ROT = 'C:/Projects/myrdahlstra';
const require = createRequire(ROT + '/package.json');
const { provJpeg } = require(ROT + '/test/hjalp/jpeg.js');
const wrangler = path.join(ROT, 'node_modules/wrangler/bin/wrangler.js');
const lokal = (...a) => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'myrdahls-klick', '--local', ...a],
  { cwd: ROT, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });

// Ett väntande omdöme med foto i den lokala databasen
const foto = await provJpeg({ bredd: 1600, hojd: 1200, brus: true });
const sql = path.join(process.argv[2], 'panelprov.sql');
fs.writeFileSync(sql,
  "INSERT OR IGNORE INTO inbjudan (kod, mal, skapad, anvand) VALUES ('PROVPANEL001', 'allmant', '2026-10-14', '2026-10-14');\n" +
  "DELETE FROM omdome WHERE kod = 'PROVPANEL001';\n" +
  "INSERT INTO omdome (kod, mal, betyg, namn, ort, text, dag, bild) VALUES ('PROVPANEL001', 'allmant', 4, 'Provkund', 'Örebro', " +
  "'Påhittat omdöme för att se fotot i panelen.', '2026-10-14', X'" + foto.toString('hex') + "');\n");
lokal('--file', sql);

process.env.KLICK_LOKAL = '1';
const { skapaServer } = require(ROT + '/verktyg/admin.js');
const server = skapaServer();
await new Promise((klar) => server.listen(0, '127.0.0.1', klar));
const url = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ executablePath: 'C:/Users/SebastianMyrdahl/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(url + '/omdomen', { waitUntil: 'networkidle' });
await page.waitForFunction(() => [...document.querySelectorAll('[data-vantande] img.foto')].some((i) => i.naturalWidth > 0), null, { timeout: 60000 });
const knappar = await page.$$eval('[data-vantande] .kort button', (b) => b.map((x) => x.textContent));
console.log('knappar:', JSON.stringify(knappar));
await page.locator('[data-vantande]').screenshot({ path: path.join(process.argv[2], 'panel-vantande-foto.png') });
await browser.close();
server.close();

lokal('--command', "DELETE FROM omdome WHERE kod = 'PROVPANEL001'; DELETE FROM inbjudan WHERE kod = 'PROVPANEL001'");
console.log('provraderna borttagna');
```

Run: `cd <scratchpad> && MSYS_NO_PATHCONV=1 node kolla-panelen.mjs <scratchpad>`
Expected: `knappar: ["Publicera","Publicera utan foto","Avslå"]` och `provraderna borttagna`. Skärmbilden visar kortet med fotot under texten.

Ingen knapp trycks här. Publicering skriver i repots riktiga `omdomen.json` och `assets/foto`, och det flödet täcks av testerna i uppgift 5.

- [ ] **Step 6: Commit**

```bash
git add verktyg/omdomen.html
git commit -F - <<'EOF'
Panelen visar omdömenas foton och knappen Publicera utan foto

Fotot i inkorgen hämtas med panelens huvud och visas som blob, publicerade
foton läses ur den byggda sajten.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Visningen på sajten och förstoringen

**Files:**
- Modify: `src/_includes/omdomen.njk`
- Create: `src/_includes/forstoring.njk`
- Modify: `src/_includes/base.njk` (efter `{{ content | safe }}`-blocket)
- Modify: `src/brada.njk` (tar bort dialogen)
- Modify: `src/index.njk`, `src/bestallning.njk` (frontmatter)
- Modify: `assets/style.css` (efter `.omdomen__vem`)
- Test: `test/omdomesfoto-visning.test.js` (ny), `test/strukturerat.test.js`

**Interfaces:**
- Consumes: fältet `bild` i `omdomen.json` från uppgift 5, bildmakrot `bild(fil, alt, sizes, klass, ivrig)` i `src/_includes/bild.njk`, `assets/forstora.js` som öppnar länkar med `data-forstora` i `<dialog id="forstoring">`.
- Produces: inget som andra uppgifter använder.

- [ ] **Step 1: Skriv testerna**

Skapa `test/omdomesfoto-visning.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const nunjucks = require('nunjucks');
const Omdomen = require('../lib/omdomen.js');
const Fotomatt = require('../lib/fotomatt.js');

/*
 * Omdömesrutan renderad med samma filter som i .eleventy.js, men med påhittade
 * omdömen. Den riktiga omdomen.json kan vara tom, och då kan bygget inte visa
 * ett foto. Eleventy ger Nunjucks { dev: true } och därmed autoescape, och det
 * gör testet också.
 */
function rendera(omdomen) {
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(path.join(__dirname, '..', 'src', '_includes')), { dev: true });
  env.addFilter('foto', (fil) => Fotomatt.foto(fil));
  env.addFilter('omdomenUrval', (lista) => Omdomen.urval(lista));
  env.addFilter('betygssnitt', (lista) => Omdomen.betygssnitt(lista));
  env.addFilter('betygText', (tal) => Omdomen.betygText(tal));
  env.addFilter('manad', (datum) => Omdomen.manad(datum));
  return env.render('omdomen.njk', { omdomen });
}

// Ett foto som finns i assets/foto, så att filtret hittar måtten
const FOTO = 'andtraskarbrada-massiv-ek-1.jpg';
const omdome = (extra) => ({ id: 1, betyg: 5, namn: 'Karin', ort: 'Västerås', text: 'Fin.', datum: '2026-10-20', ...extra });

test('ett omdöme med foto visar bilden med alt-text och länk till förstoringen', () => {
  const html = rendera([omdome({ bild: FOTO })]);
  assert.match(html, /class="omdomen__post omdomen__post--foto"/);
  assert.match(html, new RegExp('<a class="omdomen__foto" href="/assets/foto/' + FOTO + '" data-forstora'));
  assert.match(html, /alt="Foto som Karin skickade med sitt omdöme"/);
  assert.match(html, /-480\.avif 480w/);
});

test('ett omdöme utan foto har ingen bild', () => {
  const html = rendera([omdome()]);
  assert.doesNotMatch(html, /omdomen__foto|<img/);
});

test('namnet i alt-texten kan inte bryta sig ut ur attributet', () => {
  const html = rendera([omdome({ namn: 'K"><script>x</script>', bild: FOTO })]);
  assert.doesNotMatch(html, /<script>x/);
});
```

I `test/strukturerat.test.js`, lägg till före testet `'omdomen.json har bara giltiga omdömen'`:

```js
test('förstoringsrutan och dess skript finns där omdömen kan visa foton', async () => {
  for (const s of await bygg()) {
    if (!(s.url === '/' || s.url === '/bestallning/' || (s.url || '').startsWith('/brada/'))) continue;
    assert.match(s.content, /<dialog class="forstoring" id="forstoring"/, s.url);
    assert.match(s.content, /\/assets\/forstora\.js\?v=/, s.url);
    assert.equal((s.content.match(/id="forstoring"/g) || []).length, 1, s.url + ' har dialogen två gånger');
  }
});
```

och i testet `'omdomen.json har bara giltiga omdömen'`, efter `for`-slingans `assert.ok(...)`, inne i slingan:

```js
    if (o.bild !== undefined) {
      assert.match(o.bild, /^omdome-[0-9a-f]{12}\.jpg$/, 'fotonamnet för omdöme ' + o.id);
      assert.ok(require('node:fs').existsSync(path.join(ROT, 'assets/foto', o.bild)), o.bild + ' finns inte i assets/foto');
    }
```

- [ ] **Step 2: Kör testerna och se dem fallera**

Run: `node --test test/omdomesfoto-visning.test.js test/strukturerat.test.js`
Expected: FAIL för fotot i rutan och för förstoringsrutan på `/` och `/bestallning/`.

- [ ] **Step 3: Rutan visar fotot**

I `src/_includes/omdomen.njk`, ersätt

```njk
{%- from "stjarnor.njk" import stjarnor %}
```

med

```njk
{%- from "stjarnor.njk" import stjarnor %}
{%- from "bild.njk" import bild %}
```

och ersätt

```njk
    <li class="omdomen__post">
      {{ stjarnor(o.betyg, 'omdome' + o.id) }}
      <p class="omdomen__text">{{ o.text }}</p>
      <p class="omdomen__vem">{{ o.namn }}{% if o.ort %}, {{ o.ort }}{% endif %}, {{ o.datum | manad }}</p>
    </li>
```

med

```njk
    <li class="omdomen__post{% if o.bild %} omdomen__post--foto{% endif %}">
      {#- Kundens foto, beskuret i kortet och helt i förstoringen. Vad det visar
          vet vi inte, så alt-texten säger vems det är. -#}
      {%- if o.bild %}
      {%- set alt = 'Foto som ' + o.namn + ' skickade med sitt omdöme' %}
      <a class="omdomen__foto" href="/assets/foto/{{ o.bild }}" data-forstora data-alt="{{ alt }}" aria-label="Visa fotot större: {{ alt }}">{{ bild(o.bild, alt, '(max-width: 720px) 92vw, 160px') }}</a>
      {%- endif %}
      <div class="omdomen__innehall">
        {{ stjarnor(o.betyg, 'omdome' + o.id) }}
        <p class="omdomen__text">{{ o.text }}</p>
        <p class="omdomen__vem">{{ o.namn }}{% if o.ort %}, {{ o.ort }}{% endif %}, {{ o.datum | manad }}</p>
      </div>
    </li>
```

- [ ] **Step 4: Förstoringen flyttar till grundmallen**

Skapa `src/_includes/forstoring.njk`:

```njk
{#- Rutan där ett foto visas i full storlek, se assets/forstora.js. Renderas av
    base.njk på sidor med forstora: true: brädornas sidor, och startsidan och
    beställningssidan där omdömenas foton visas. -#}
<dialog class="forstoring" id="forstoring" aria-label="Fotot i full storlek">
  <div class="forstoring__ram">
    <img class="forstoring__bild" alt="">
    <button type="button" class="forstoring__stang" data-stang>Stäng</button>
  </div>
</dialog>
```

I `src/brada.njk`, ta bort blocket

```njk
{%- if foton.length %}
<dialog class="forstoring" id="forstoring" aria-label="Fotot i full storlek">
  <div class="forstoring__ram">
    <img class="forstoring__bild" alt="">
    <button type="button" class="forstoring__stang" data-stang>Stäng</button>
  </div>
</dialog>
{%- endif %}
```

I `src/_includes/base.njk`, ersätt

```njk
  {% if forstora %}<script defer src="{{ '/assets/forstora.js' | version }}"></script>{% endif %}
```

med

```njk
  {% if forstora %}{% include "forstoring.njk" %}
  <script defer src="{{ '/assets/forstora.js' | version }}"></script>{% endif %}
```

I frontmattern i `src/index.njk` och `src/bestallning.njk`, lägg till raden

```yaml
forstora: true
```

direkt efter `layout: base.njk`.

- [ ] **Step 5: Stilarna**

I `assets/style.css`, direkt efter regeln `.omdomen__vem { ... }`, lägg till:

```css
/* Kundens foto i omdömet: beskuret till 4:3 i kortet, helt i förstoringen */
.omdomen__post--foto {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 18px;
  align-items: start;
}

.omdomen__post--foto .omdomen__foto {
  grid-column: 2;
  grid-row: 1;
}

.omdomen__foto {
  display: block;
  border: 1px solid var(--black);
  line-height: 0;
}

.omdomen__foto .foto {
  aspect-ratio: 4 / 3;
  height: auto;
}

@media (max-width: 720px) {
  .omdomen__post--foto {
    grid-template-columns: 1fr;
  }

  .omdomen__post--foto .omdomen__foto {
    grid-column: 1;
    grid-row: 2;
  }
}
```

- [ ] **Step 6: Kör testerna**

Run: `npm test`
Expected: inga fel.

- [ ] **Step 7: Skärmbilder med provdata**

Säkerhetskopiera och prova med påhittade omdömen, som vid de tidigare omdömesändringarna:

```bash
cd C:/Projects/myrdahlstra && cp src/_data/omdomen.json <scratchpad>/omdomen.backup.json && node -e '
const fs=require("fs");
fs.writeFileSync("src/_data/omdomen.json", JSON.stringify([
 {id:1,kod:"PROVKOD00001",betyg:5,namn:"Provkund Ett",ort:"Örebro",text:"Påhittat provomdöme med foto.",datum:"2026-10-12",bild:"andtraskarbrada-ek-lonn-mursten-1.jpg"},
 {id:2,kod:"PROVKOD00002",betyg:4,namn:"Provkund Två",ort:"",text:"Påhittat provomdöme utan foto.",datum:"2026-10-13"}
],null,2)+"\n");' && npm run build
```

Ta skärmbilder av `.passage.omdomen` på `/` och `/bestallning/` i dator- och mobilbredd med skärmbildsskriptet från tidigare (scratchpad `skarm.mjs`, lista `[['omdomen-start', '/', '.passage.omdomen'], ['omdomen-bestall', '/bestallning/', '.passage.omdomen']]`). Klicka på fotot i en av dem och ta en skärmbild av `#forstoring` öppen.

Expected: fotot står till höger om texten på dator och under texten på mobil, med tunn ram. Förstoringen öppnar fotot i full storlek.

Återställ:

```bash
cp <scratchpad>/omdomen.backup.json src/_data/omdomen.json && git diff --quiet src/_data/omdomen.json && echo återställd && npm run build
```

Provdatans `bild` pekar på ett katalogfoto och följer inte namnformen. Den får aldrig committas, och testet för `omdomen.json` stoppar det.

- [ ] **Step 8: Commit**

```bash
git add src/_includes/omdomen.njk src/_includes/forstoring.njk src/_includes/base.njk src/brada.njk src/index.njk src/bestallning.njk assets/style.css test/omdomesfoto-visning.test.js test/strukturerat.test.js
git commit -F - <<'EOF'
Omdömesrutan visar kundens foto och kan förstora det

Fotot står i kortet, beskuret till 4:3, och öppnas i full storlek i samma
ruta som brädornas foton. Rutan flyttar till grundmallen så att den finns
på startsidan och beställningssidan också.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Villkoren och README

**Files:**
- Modify: `src/villkor.njk` (stycket under Omdömen)
- Modify: `README.md` (avsnittet Omdömen)

**Interfaces:**
- Consumes: inget.
- Produces: inget.

- [ ] **Step 1: Villkoren**

I `src/villkor.njk`, ersätt

```html
  <p>Efter leveransen kan du få en personlig länk där du skriver ett omdöme. Bara den som köpt något får en sådan länk, och varje länk ger ett omdöme. På sajten visas betyget, texten, namnet och orten du själv skriver, och vilken månad omdömet skrevs. Inget annat sparas om dig, inte heller din mejladress eller IP-adress.</p>
  <p>Jag läser varje omdöme innan det publiceras. Alla publiceras oavsett betyg. Det enda jag inte publicerar är skräp, uppgifter om andra personer och påhopp. Vill du ändra eller ta bort ditt omdöme, mejla mig, så gör jag det.</p>
```

med

```html
  <p>Efter leveransen kan du få en personlig länk där du skriver ett omdöme. Bara den som köpt något får en sådan länk, och varje länk ger ett omdöme. På sajten visas betyget, texten, namnet och orten du själv skriver, fotot om du skickar med ett, och vilken månad omdömet skrevs. Platsuppgifter och annan information i bildfilen tas bort innan fotot sparas. Inget annat sparas om dig, inte heller din mejladress eller IP-adress.</p>
  <p>Jag läser varje omdöme innan det publiceras. Alla publiceras oavsett betyg. Det enda jag inte publicerar är skräp, uppgifter om andra personer och påhopp. Visar fotot andra personer publicerar jag omdömet utan fotot. Vill du ändra eller ta bort ditt omdöme, mejla mig, så gör jag det, och fotot tas bort med det.</p>
```

- [ ] **Step 2: README**

I `README.md`, i avsnittet `## Omdömen`, efter punktlistan "Så går det till" (punkt 4 slutar med "Sedan `npm run deploy` som vanligt."), lägg till:

````markdown
Kunden kan skicka med ett foto. Webbläsaren krymper det till en JPEG under
1,5 MB, och `functions/api/omdome.js` rensar bort platsdata och annan
metadata (`lib/jpeg.mjs`) innan det sparas i kolumnen `bild` i D1. I panelen
syns fotot bredvid texten. **Publicera** behandlar det med sharp och sparar
det som `assets/foto/omdome-<slumpat>.jpg`, **Publicera utan foto** tar bara
texten, till exempel när fotot visar andra personer. **Ta bort** på ett
publicerat omdöme raderar fotot också. Glöm inte att checka in fotot i git
tillsammans med `omdomen.json`.

Kolumnen för fotot lades till efter tabellerna. En databas som skapades
innan dess behöver den en gång:

```
node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --file=db/omdome-bild.sql
```
````

- [ ] **Step 3: Kontrollera skrivreglerna och bygg**

Run: `node -e 'for (const f of ["src/villkor.njk","README.md","src/omdome.njk","assets/omdomesfoto.js","src/_includes/omdomen.njk"]) { const t=require("fs").readFileSync(f,"utf8"); const n=(t.match(/[\u2013\u2014]/g)||[]).length; console.log(f, n); }' && npm test && npm run build`
Expected: varje fil `0`, inga testfel, bygget lyckas.

- [ ] **Step 4: Commit**

```bash
git add src/villkor.njk README.md
git commit -F - <<'EOF'
Villkoren och README berättar om foton till omdömen

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: Slå ihop, publicera och pröva skarpt

**Files:**
- Inga ändringar i koden, om inte provet visar ett fel.

**Interfaces:**
- Consumes: allt ovan.
- Produces: funktionen live på myrdahlstra.se.

- [ ] **Step 1: Slå ihop med main**

```bash
cd C:/Projects/myrdahlstra && git fetch -q && git switch main && git status -sb | head -1 && git merge --ff-only omdomesfoto && npm test
```
Expected: `## main...origin/main` före sammanslagningen (origin ligger inte före), snabbspolning, inga testfel.

- [ ] **Step 2: Stäm av med Sebastian**

Säg att nästa steg ändrar den skarpa databasen och publicerar, och att ett provmejl "med foto" kommer till hans Gmail under provet. Vänta på klartecken om han inte redan gett det för publiceringen.

- [ ] **Step 3: Kolumnen i den skarpa databasen, före publiceringen**

Run: `node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --file=db/omdome-bild.sql`
Expected: lyckas. Svarar den 7403 ("not authorized"), kör samma kommando en gång till, se minnesanteckningen om klickdata.

Kontroll: `node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --json --command "PRAGMA table_info(omdome)"` ska lista `bild`.

- [ ] **Step 4: Publicera och pusha**

```bash
npm run deploy && git push -q origin main && git status -sb | head -1
```
Expected: `Deployment complete!` och `## main...origin/main`.

- [ ] **Step 5: Prov med JavaScript, som en kund i mobilen**

Lägg en provinbjudan i den skarpa databasen:

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --command "INSERT INTO inbjudan (kod, mal, skapad) VALUES ('PROVFOTO0001', 'allmant', date('now'))"
```

Skapa `<scratchpad>/prova-skarpt.mjs`, som fyller i formuläret på riktigt med ett stort foto med GPS och skickar det utan att klicka (klickräkningen räknar bara klick):

```js
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

const require = createRequire('C:/Projects/myrdahlstra/package.json');
const { medBlock, provJpeg, GPS_XMP } = require('C:/Projects/myrdahlstra/test/hjalp/jpeg.js');
const foto = medBlock(await provJpeg({ bredd: 4000, hojd: 3000, brus: true, orientering: 6 }), GPS_XMP);

const browser = await chromium.launch({ executablePath: 'C:/Users/SebastianMyrdahl/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' });
const page = await browser.newPage();
await page.goto('https://myrdahlstra.se/omdome/#PROVFOTO0001', { waitUntil: 'networkidle' });
await page.setInputFiles('#foto', { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: foto });
await page.waitForSelector('[data-fotovisning]:not([hidden])');
await page.evaluate(() => {
  document.getElementById('betyg4').checked = true;
  document.getElementById('namn').value = 'Provkund';
  document.getElementById('text').value = 'Prov av foto efter publicering. Avslås direkt.';
  document.querySelector('.omdomesformular').requestSubmit();
});
await page.waitForLoadState('networkidle');
console.log('landade på:', page.url());
console.log(await page.locator('body').innerText());
await browser.close();
```

Run: `cd <scratchpad> && MSYS_NO_PATHCONV=1 node prova-skarpt.mjs`
Expected: `landade på: https://myrdahlstra.se/omdome/tack/`.

Svarar Cloudflare i stället med ett fel om CPU-tid (felkod 1102, eller en sida om att arbetaren överskred sina gränser): stoppa här, låt kolumnen ligga kvar (den är ofarlig), och rapportera till Sebastian. Reservvägen i specen, fotot i ett eget anrop, blir då en egen uppgift.

- [ ] **Step 6: Kontrollera det som sparades**

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --json --command "SELECT length(bild) AS byte, instr(bild, CAST('GPSLatitude' AS BLOB)) AS gps FROM omdome WHERE kod = 'PROVFOTO0001'"
```
Expected: `byte` under 1 500 000 och `gps: 0`.

Läs sedan fotot på samma sätt som panelen och pröva det med sharp:

```bash
node -e '
const { execFileSync } = require("child_process");
const sharp = require("sharp");
const ut = JSON.parse(execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js","d1","execute","myrdahls-klick","--remote","--json","--command","SELECT hex(bild) AS hex FROM omdome WHERE kod = \x27PROVFOTO0001\x27"], { maxBuffer: 64*1024*1024, encoding: "utf8" }));
sharp(Buffer.from(ut[0].results[0].hex, "hex")).metadata().then((m) => console.log(m.format, m.width, m.height));'
```
Expected: `jpeg 1200 1600`.

- [ ] **Step 7: Prov utan JavaScript**

Lägg en andra provinbjudan `PROVFOTO0002` som i steg 5. Skicka ett litet stående foto med GPS direkt med curl, som en webbläsare utan skript:

```bash
node -e '
const { medBlock, provJpeg, GPS } = require("./test/hjalp/jpeg.js");
provJpeg({ bredd: 800, hojd: 600, orientering: 6 }).then((j) => require("fs").writeFileSync(process.argv[1], medBlock(j, GPS)));' <scratchpad>/utan-skript.jpg
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -X POST https://myrdahlstra.se/api/omdome -H 'Origin: https://myrdahlstra.se' -F kod=PROVFOTO0002 -F betyg=5 -F namn=Provkund -F ort= -F 'text=Prov utan skript efter publicering. Avslås direkt.' -F 'foto=@<scratchpad>/utan-skript.jpg;type=image/jpeg'
```
Expected: `303 https://myrdahlstra.se/omdome/tack/`.

Kontroll som i steg 6, med `PROVFOTO0002`: `gps: 0`, och sharp-metadatan ger `orientation` 6 när den läses med `.metadata()` på det hämtade fotot (lägg till `m.orientation` i utskriften).

- [ ] **Step 8: Städa bort proven**

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --command "DELETE FROM omdome WHERE kod IN ('PROVFOTO0001', 'PROVFOTO0002'); DELETE FROM inbjudan WHERE kod IN ('PROVFOTO0001', 'PROVFOTO0002')"
node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --json --command "SELECT COUNT(*) AS kvar FROM omdome WHERE kod LIKE 'PROVFOTO%'"
```
Expected: `kvar: 0`.

- [ ] **Step 9: Uppdatera minnet och rapportera**

Uppdatera minnesanteckningen om omdömen (eller skapa en): fotot finns sedan dagens datum, den skarpa databasen har kolumnen `bild`, provkoderna `PROVFOTO0001/0002` är borttagna, och två provmejl "med foto" i Sebastians Gmail kom från provet. Rapportera till Sebastian vad som prövades skarpt och att två provmejl kommit.
