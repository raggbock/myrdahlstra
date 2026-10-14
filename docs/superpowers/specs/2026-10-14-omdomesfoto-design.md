# Foto till omdömen, design

Datum: 2026-10-14. Status: väntar på Sebastians granskning.

## Mål

En kund som skriver ett omdöme ska kunna skicka med ett foto, helst brädan i
sitt eget kök. Fotot väntar tillsammans med omdömet tills Sebastian har läst
det i verkstadspanelen, och visas sedan i omdömesrutan på startsidan,
beställningssidan och brädornas sidor. Ett foto från en köpare övertygar mer
än text, särskilt så länge katalogen har få foton.

## Förutsättningar och begränsningar

- **Omdömena är allmänna** sedan commit 6144405: de gäller en bräda kunden
  köpt, inte en viss post i katalogen. Fotot följer omdömet och är inte
  heller knutet till en bräda.
- **Ett foto per omdöme, och det är frivilligt.**
- **Platsdata får aldrig sparas.** En mobilbild bär ofta GPS-position och
  därmed kundens hemadress. Den rensas bort innan fotot sparas någonstans,
  även i inkorgen i D1.
- **Pages Functions kan inte köra sharp.** Fotot krymps därför i kundens
  webbläsare, och servern rensar metadata med ren kod som läser JPEG-filens
  block. Den slutliga behandlingen med sharp görs i panelen vid publicering.
- **D1 tar högst 2 MB per rad.** Fotot får vara högst 1,5 MB, så att det ryms
  ihop med texten.
- **Gratisnivån ger cirka 10 ms CPU-tid per anrop.** Att tolka ett formulär på
  1 till 2 MB kan komma nära. Det går inte att mäta lokalt, se Risker.
- **Granskningsregeln gäller fotot också.** Ett foto som visar andra personer
  är en uppgift om andra personer. Sebastian kan då publicera omdömet utan
  fotot. Det sållar inte bort ett betyg, så det är förenligt med
  marknadsföringslagen.
- Ingen strukturerad data för omdömen eller foton, som i dag.
- Skrivreglerna gäller all text: svenska, inga tankstreck, inga
  återbrukspåståenden.

## Dataflöde

```
kunden väljer foto på /omdome/
   │ webbläsaren krymper till JPEG, högst 1 600 px
   │ (utan JavaScript skickas filen som den är)
   ▼
POST /api/omdome  (multipart/form-data, högst 2 MiB)
   │ kontrollerar koden, texten och att fotot är en JPEG
   │ tar bort metadatablock (plats, kamera, kommentarer)
   ▼
D1: omdome.bild (BLOB)  ── notismejl "med foto" ──▶ Sebastian
   │
   ▼
panelen /omdomen visar fotot bredvid texten
   │ Publicera:            sharp behandlar fotot, sparas som
   │                       assets/foto/omdome-<12 hex>.jpg,
   │                       omdomen.json får fältet bild
   │ Publicera utan foto:  bara texten publiceras
   │ Avslå:                raden och fotot raderas
   ▼
npm run build (bilder.js gör varianterna), sedan npm run deploy
```

## Delar

### 1. Databasen: `db/omdome.sql` och `db/omdome-bild.sql`

`omdome` får en kolumn:

```sql
bild   BLOB               -- JPEG utan metadata, null utan foto
```

- `db/omdome.sql` får kolumnen i sin `CREATE TABLE`, för nya databaser.
- Den nya filen `db/omdome-bild.sql` innehåller
  `ALTER TABLE omdome ADD COLUMN bild BLOB;` för de databaser som redan finns.
  Den körs en gång med `--local` och en gång med `--remote`.
- **Den skarpa databasen ska ha kolumnen innan den nya funktionen
  publiceras.** Annars misslyckas varje inskickat omdöme, även de utan foto.

### 2. Rensningen: `lib/jpeg.mjs`

En ren funktion utan beroenden, som både funktionen och testerna använder.

`rensaJpeg(bytes) -> Uint8Array | null`

- Filen ska börja med `FF D8`. Annars `null`.
- Blocken före bilddatan (`FF DA`) gås igenom ett i taget med sina
  längdfält. Ett längdfält som pekar utanför filen ger `null`.
- **Behålls:** APP0 (JFIF), APP2 bara om det är en ICC-profil
  (`ICC_PROFILE\0`), APP14 (Adobe, behövs för att avkoda vissa filer) och alla
  block som inte är APP eller kommentar (tabeller, bildhuvud).
- **Tas bort:** övriga APP1 till APP15 (EXIF med GPS, XMP, tillverkarnas
  egna block) och COM (kommentarer).
- Från `FF DA` kopieras resten som det är.
- En fil som tar slut före `FF DA` ger `null`.

### 3. Funktionen: `functions/api/omdome.js`

- `MAX_KROPP` höjs från 8 kB till 2 MiB. `lasFormular` tolkar redan
  multipart, eftersom den lämnar vidare till `formData()`.
- Fältet `foto`: saknas det eller är tomt finns inget foto. Annars:
  - större än 1 500 000 byte: 413, "Fotot var för stort. Skicka omdömet utan
    foto, eller välj en mindre bild."
  - `rensaJpeg` ger `null`: 400, "Fotot kunde inte läsas. Prova en annan bild,
    eller skicka omdömet utan foto."
- Allt kontrolleras innan något skrivs. Ett fel i fotot sparar alltså inte
  heller texten.
- Insättningen i samma `batch` som i dag, med `bild` som ett extra värde
  (`Uint8Array`, eller `null`).
- Notismejlet: ämnet får "med foto" sist när det finns ett foto, och texten
  blir "Ett omdöme med foto har kommit in från Karin." Ingen bild bifogas.

### 4. Skrivsidan: `src/omdome.njk` och `assets/omdomesfoto.js`

- Formuläret får `enctype="multipart/form-data"`.
- Nytt fält under texten: `<input type="file" name="foto" accept="image/*">`
  med etiketten **Foto (frivilligt)** och hjälptexten: "Gärna brädan i ditt
  kök. Fotot visas på sajten tillsammans med omdömet. Undvik ansikten och
  sådant som visar var du bor. Platsuppgifter i bildfilen tas bort."
- Raden under knappen blir: "Omdömet visas på sajten med betyget, texten,
  namnet och orten du skriver, fotot om du skickar med ett, och vilken månad
  det skrevs. Jag läser det innan det publiceras."
- `assets/omdomesfoto.js`, med fingeravtryck som de andra skripten:
  - När kunden väljer en fil läses den med
    `createImageBitmap(fil, { imageOrientation: 'from-image' })` och ritas på
    en canvas med högst 1 600 px på längsta sidan.
  - Ut kommer en JPEG med kvalitet 0,85. Blir den större än 1,5 MB görs ett
    nytt försök med 0,7 och sedan 0,55.
  - Den krympta filen läggs tillbaka i fältet med `DataTransfer`, så att
    formuläret skickas som vanligt och serverns felsidor fungerar som förut.
  - En liten förhandsvisning visas under fältet, med knappen **Ta bort
    fotot**.
  - Går filen inte att läsa (till exempel HEIC i Chrome på Windows) töms
    fältet, och texten "Den här bildtypen går inte att läsa här. Välj en JPEG,
    eller skicka utan foto." visas.
  - Canvas skriver aldrig EXIF, så platsdata försvinner redan här. Servern
    rensar ändå, för den som skickar utan skript.
- Utan JavaScript skickas filen som den är, och serverns gränser gäller.

### 5. Verkstadspanelen: `verktyg/admin.js`, `verktyg/omdomen.js`, `verktyg/omdomen.html`, `verktyg/foto.js`

- **Listan** (`GET /api/omdomen`) hämtar `bild IS NOT NULL AS harFoto` i
  stället för själva fotot.
- **Fotot i inkorgen:** `GET /api/omdomen/<id>/foto` läser
  `SELECT hex(bild) FROM omdome WHERE id = <id>` genom wrangler och svarar
  med `image/jpeg`. Panelsidan hämtar det med samma `X-Panel`-huvud som allt
  annat och visar det som en blob-adress. Inget i panelen går att nå utan
  huvudet.
- **Knapparna** på ett väntande omdöme med foto: **Publicera**, **Publicera
  utan foto** och **Avslå**. Utan foto som i dag.
- **Publicera** (`POST /api/omdomen/<id>/publicera`), med foto:
  1. Finns omdömet redan i `omdomen.json` (ett tidigare försök där
     raderingen ur D1 misslyckades) behandlas inget nytt foto.
  2. Annars behandlas fotot med `Foto.omdomesfoto(buffer)` i
     `verktyg/foto.js`: vrids efter EXIF, högst 1 400 px på längsta sidan
     utan att förstoras, JPEG med kvalitet 78 som katalogens foton
     (`KVALITET` i `verktyg/foto.js`), ingen metadata. Ingen beskärning och ingen ljusjustering, för det är kundens
     bild.
  3. Filnamnet blir `omdome-` och 12 slumpade små hextecken
     (`crypto.randomBytes(6)`), till exempel `omdome-3f9a1c7b2e4d.jpg`.
     Inbjudningskoden används inte, den ska inte synas offentligt. Filen
     skrivs med flaggan `wx`. Finns namnet redan slumpas ett nytt.
  4. Omdömet läggs i `omdomen.json` med fältet `bild`, sajten byggs, och
     sist raderas raden i D1, i samma ordning som i dag.
  5. Kan sharp inte läsa fotot svarar panelen med felet och ingenting
     skrivs eller raderas. **Publicera utan foto** fungerar ändå.
- **Publicera utan foto** (`POST /api/omdomen/<id>/publicera-utan-foto`):
  som Publicera, men fotot behandlas inte. Det raderas med raden i D1.
- **Avslå**: som i dag. Fotot ligger på raden och raderas med den.
- **Ta bort** ett publicerat omdöme raderar också `assets/foto/<bild>`.
- **Oanvända foton:** `hamtaAllt` räknar `bild` i `omdomen.json` som
  använda, så omdömesfoton visas inte som något att städa bort.
- **Publicerade omdömen** i panelen visar sitt foto genom
  `GET /api/omdomen-foto/<fil>`, som bara godtar namn på formen
  `omdome-[0-9a-f]{12}.jpg` och kräver `X-Panel`.

### 6. Datafilen: `src/_data/omdomen.json`

Ett omdöme kan få fältet `bild`:

```json
{ "id": 4, "kod": "Ab3_xYz9Q0wE", "betyg": 5, "namn": "Karin", "ort": "Västerås",
  "text": "…", "datum": "2026-10-20", "bild": "omdome-3f9a1c7b2e4d.jpg" }
```

Saknas fältet finns inget foto.

### 7. Visning: `src/_includes/omdomen.njk`, `src/_includes/base.njk`

- Ett omdöme med `bild` får en liten bild i kortet, beskuren till 4:3 med
  `object-fit`. Den sätts med `bild`-makrot i `src/_includes/bild.njk`, så
  att `verktyg/bilder.js` gör varianterna i 480 och 900 px som för katalogen.
- Bilden är en länk till originalet med `data-forstora`. Alt-texten blir
  "Foto som Karin skickade med sitt omdöme".
- På skärm står bilden bredvid texten, på mobil under den. Ramen är samma
  tunna linje i bläck som omdömeskortet.
- **Förstoringen** finns i dag bara på brädsidorna: `<dialog id="forstoring">`
  ligger i `src/brada.njk`. Den flyttas till `base.njk` och renderas när
  sidan har `forstora: true`, tillsammans med skriptet som redan styrs av
  samma flagga. `src/index.njk` och `src/bestallning.njk` får `forstora: true`.

### 8. Villkoren: `src/villkor.njk`

Stycket under Omdömen får fotot med:

- "På sajten visas betyget, texten, namnet och orten du själv skriver, fotot
  om du skickar med ett, och vilken månad omdömet skrevs. Platsuppgifter och
  annan information i bildfilen tas bort innan fotot sparas."
- Granskningsstycket får: "Visar fotot andra personer publicerar jag
  omdömet utan fotot."

## Fel och kantfall

| Läge | Vad händer |
|---|---|
| Fotot större än 1,5 MB | 413 med felsida, inget sparas |
| Fotot är inte en JPEG eller trasigt | 400 med felsida, inget sparas |
| Bildtypen går inte att läsa i webbläsaren | Fältet töms, texten förklarar |
| Kroppen större än 2 MiB | 413 som i dag |
| sharp kan inte läsa fotot vid publicering | Felet visas, inget raderas |
| Publicera trycks igen efter misslyckad radering | Inget nytt foto, ingen dubblett |
| Filnamnet finns redan | Nytt slumpat namn |
| Filen skrevs men `omdomen.json` kunde inte skrivas | Filen syns bland oanvända foton och kan städas bort |

## Risker som prövas tidigt

1. **CPU-tiden i Pages Functions.** Prövas skarpt efter publicering: en
   testinbjudan, ett omdöme med ett riktigt mobilfoto, kontroll i panelen,
   sedan Avslå. Räcker tiden inte skickas fotot i ett eget anrop som läses
   med `request.arrayBuffer()` utan att tolkas.
2. **wrangler och stora svar.** Panelen läser fotot som hex-text, ungefär
   dubbla storleken. Det prövas som första steg i bygget mot den lokala
   databasen med ett foto på 1,5 MB. Fungerar det inte läses fotot i bitar
   med `substr(hex(bild), …)`.
3. **2 MB per rad i D1.** Täckt av gränsen på 1,5 MB.

## Tester

- **`lib/jpeg.mjs`:** en JPEG med EXIF och GPS kommer ut utan APP1 men med
  APP0, ICC-profil och bilddata orörda. Filer som inte är JPEG, avkortade
  filer och längdfält som pekar utanför filen ger `null`.
- **Funktionen** mot låtsasdatabasen i `test/hjalp/d1.js`:
  - omdöme med foto sparar en BLOB utan GPS, och koden förbrukas
  - för stort foto ger 413 och inget sparas
  - fil som inte är JPEG ger 400 och inget sparas
  - omdöme utan foto fungerar som förut
  - notismejlet säger "med foto" bara när det finns ett
- **Panelen**, med fejkad D1 och fejkad bildbehandling:
  - publicera med foto skriver en fil med rätt namnform och fältet `bild`
  - publicera utan foto skriver ingen fil
  - ett andra försök efter misslyckad radering skriver ingen ny fil
  - ta bort raderar fotot
  - omdömesfoton räknas inte som oanvända
  - fotoadressen godtar bara namn på rätt form och kräver `X-Panel`
- **Bygget:** ett omdöme med `bild` ger en bild med alt-text och länk med
  `data-forstora`, och förstoringsrutan finns på startsidan,
  beställningssidan och brädsidorna. `omdomen.json` får bara ha `bild` på
  rätt form och för filer som finns.
- **I webbläsaren** (headless Chromium): en stor testbild med GPS krymps under
  gränsen, och det som når servern saknar GPS. Skärmbilder av formuläret
  och omdömesrutan med foto i dator- och mobilbredd.

## Utanför ramen

- Flera foton per omdöme.
- Att Sebastian själv lägger till eller byter foto i panelen.
- Beskärning eller vridning i panelen.
- Foton i den strukturerade datan.
