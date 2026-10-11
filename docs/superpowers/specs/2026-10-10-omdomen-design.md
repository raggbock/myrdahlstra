# Omdömen, design

Datum: 2026-10-10. Status: väntar på Sebastians granskning.

## Mål

Kunder som köpt något ska kunna lämna ett omdöme som visas på sajten och
märks upp så att sidan kan få stjärnor i Googles sökträff. Bara riktiga
köpare ska kunna skriva, och Sebastian granskar varje omdöme innan det
publiceras.

## Förutsättningar och begränsningar

- **Google lovar inga stjärnor.** Uppmärkningen gör en sida berättigad.
  Om och när stjärnor visas avgör Google.
- **Bara Product ger stjärnor.** Google visar inte stjärnor för omdömen ett
  företag samlar om sig självt (LocalBusiness). Startsidan får därför inget
  betyg i sin strukturerade data.
- **Unika brädor försvinner ur Google.** En såld bräda får `noindex` när
  visningsveckan är slut (`src/brada.njk`), och omdömet kommer oftast efter
  leveransen. Stjärnor i sökträffen kommer därför i praktiken från
  beställningssidan och från poster med `pabestallning: true`. Omdömen på
  unika brädor visas ändå för besökarna på brädans egen sida.
- **Svensk lag (marknadsföringslagen, sedan 2022).** Den som visar omdömen
  ska upplysa om ifall och hur de kontrolleras. Det är också vilseledande
  att sålla bort dåliga betyg. Granskningen får bara stoppa skräp,
  personuppgifter om andra och påhopp, aldrig ett ärligt lågt betyg.
- Allt i den strukturerade datan ska också synas på sidan (CLAUDE.md).
- Skrivreglerna gäller all text: svenska, inga tankstreck och inga
  återbrukspåståenden.

## Dataflöde

```
panelen ──skapar inbjudan──▶ D1: inbjudan (kod, mal)
   │                                  │
   │  Sebastian klistrar in länken    │
   │  myrdahlstra.se/omdome/#<kod>    │
   │  i mejlet efter leveransen       ▼
   │                        kunden skriver på /omdome/
   │                                  │ POST /api/omdome
   │                                  ▼
   │                        D1: omdome (status väntar)
   │                                  │ notismejl till Sebastian
   ▼                                  │
panelen /omdomen ◀────────────────────┘
   │ godkänn: läggs till i src/_data/omdomen.json, raden tas ur D1
   │ avslå:   raden tas ur D1
   ▼
npm run build, sedan npm run deploy som vanligt
```

D1 är bara en inkorg. Publicerade omdömen bor i `src/_data/omdomen.json`,
som checkas in i git precis som products.json. Bygget läser bara filen och
behöver varken nätverk eller wrangler.

## Delar

### 1. Databasen: `db/omdome.sql`

Tabellerna läggs i samma D1-databas som klicken (`myrdahls-klick`, bindning
`KLICK`), så wrangler.toml behöver ingen ny bindning. Filen körs en gång
med `--remote` och en gång med `--local`, på samma sätt som `db/klick.sql`.

```sql
CREATE TABLE IF NOT EXISTS inbjudan (
  kod    TEXT PRIMARY KEY,   -- 12 tecken base64url, slumpad i panelen
  mal    TEXT NOT NULL,      -- brädans slug, eller 'bestallning'
  skapad TEXT NOT NULL,      -- 2026-10-10
  anvand TEXT                -- dagen omdömet kom in, null tills dess
);

CREATE TABLE IF NOT EXISTS omdome (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  kod    TEXT NOT NULL UNIQUE REFERENCES inbjudan(kod),
  mal    TEXT NOT NULL,      -- kopierat från inbjudan
  betyg  INTEGER NOT NULL,   -- 1 till 5
  namn   TEXT NOT NULL,      -- förnamn, eller det kunden vill stå som
  ort    TEXT NOT NULL,      -- tomt om kunden inte vill
  text   TEXT NOT NULL,
  dag    TEXT NOT NULL       -- dagen det skrevs
);
```

Ingen statuskolumn behövs: allt som ligger i `omdome` väntar på granskning.
Inget IP-nummer och ingen webbläsaruppgift sparas.

### 2. Funktionen: `functions/api/omdome.js`

`POST /api/omdome`, ett vanligt formulär (`application/x-www-form-urlencoded`).

- Samma skydd som `klick.js`: Origin ska vara sajtens egen domän, och
  kroppen får vara högst 8 kB.
- Fält och regler. Text rensas från styrtecken och trimmas.
  - `kod`: krävs, 12 tecken `[A-Za-z0-9_-]`
  - `betyg`: heltal 1 till 5
  - `namn`: 1 till 40 tecken
  - `ort`: 0 till 40 tecken
  - `text`: 10 till 1500 tecken
- Koden ska finnas i `inbjudan` och ha `anvand` null. Insättningen i
  `omdome` och markeringen `anvand = date('now')` görs i en och samma
  `batch`, så att en kod aldrig kan ge två omdömen. UNIQUE på `kod` är
  det sista skyddet.
- Lyckat: 303 till `/omdome/tack/`. Därefter skickas ett notismejl till
  Sebastian via Resend ("Ett nytt omdöme väntar i verkstadspanelen", med
  betyg och mål, utan kundens text). Mejlet återanvänder miljövariablerna
  från `bestallning.js`. Misslyckas mejlet loggas det, men kunden får ändå
  tacksidan.
- Fel: en enkel läsbar HTML-sida i sajtens stil med skälet ("Länken är redan
  använd", "Länken känns inte igen", "Skriv minst några ord") och
  mejladressen. Felsidan har samma status som skälet: 400 eller 410.
- Saknas bindningen `KLICK`: 503 med samma felsida.

### 3. Skrivsidan: `src/omdome.njk` och `src/omdome-tack.njk`

`/omdome/` med `noindex: true`. Katalogstil: ornament, rubriken OMDÖME och
en handskriven lapp i Caveat ("Tack för att du tar dig tid").

- Fem stjärnor som radioknappar (1 till 5), dragbara med tangentbordet,
  ritade som SVG i #8a5a2c. Ingen förvald.
- Namn (krävs), ort (frivilligt), text (krävs).
- Fältet `kod` fylls i av ett litet skript från adressens `#kod`. Utan
  skript syns fältet som en vanlig textruta ("Koden från mejlet"), så att
  sidan fungerar ändå.
- Under knappen står det i klartext att omdömet visas med förnamn, ort och
  månad, och att Sebastian läser det innan det publiceras.

`/omdome/tack/` med `noindex: true`, byggd som `tack.njk`.

### 4. Verkstadspanelen: fliken `/omdomen`

I `verktyg/admin.js` och en ny sida `verktyg/omdomen.html`. Alla anrop till
D1 går genom den befintliga `fragaD1Wrangler`, och alla skrivande anrop
kräver huvudet `x-panel: 1`.

- **Ny inbjudan:** välj en bräda ur products.json eller "Efter mått
  (beställningssidan)". Panelen slumpar en kod med
  `crypto.randomBytes(9).toString('base64url')`, sparar den och visar
  länken med en kopieraknapp. Målet kontrolleras mot products.json.
- **Väntande omdömen:** betyg, namn, ort, text, mål och dag. Två knappar:
  - *Publicera:* lägger till omdömet i `src/_data/omdomen.json` och tar
    sedan bort raden ur D1. Om borttagningen misslyckas ligger omdömet
    redan i filen under sitt id. Nästa försök hoppar då över filen och
    tar bara bort raden, så ingenting dubbleras. Efteråt körs
    `npm run build`, som när sortimentet sparas.
  - *Avslå:* tar bort raden ur D1. Panelen visar en fast påminnelse:
    "Avslå bara skräp, uppgifter om andra personer eller påhopp. Ett
    ärligt lågt betyg ska publiceras."
- **Publicerade omdömen:** listan ur omdomen.json med en knapp *Ta bort*,
  till exempel när en kund ber om det. Bygger om efteråt.
- **Inbjudningar:** de senaste 50 med mål, dag och om de är använda.

Ren logik (läsa och skriva omdomen.json, slumpa koder, kontrollera mål)
läggs i `verktyg/omdomen.js`, som `produkter.js`, så att den kan testas
utan nätverk.

### 5. Datafilen: `src/_data/omdomen.json`

```json
[
  {
    "id": 3,
    "mal": "bestallning",
    "betyg": 5,
    "namn": "Karin",
    "ort": "Västerås",
    "text": "…",
    "datum": "2026-10-14"
  }
]
```

`datum` är dagen omdömet skrevs. Filen börjar som `[]`.

### 6. Visning: `src/_includes/omdomen.njk`

Logiken ligger i `lib/omdomen.js`, med Eleventy-filtren `omdomenFor(mal)`
(nyaste först) och `betygssnitt` (`{ antal, snitt }`, snittet avrundat till
en decimal).

- Läggs på brädsidan (`mal` = brädans slug) och på beställningssidan
  (`mal` = `bestallning`). Utan omdömen syns ingenting.
- Rubriken OMDÖMEN med ornament. Under den snittet ("4,8 av 5, 6 omdömen")
  med stjärnor i SVG och `aria-label="Betyg 4,8 av 5"`.
- Varje omdöme som en post på kortbakgrund #FBF6E9: stjärnor, texten i
  EB Garamond kursiv, och sedan namn, ort och månad ("Karin, Västerås,
  oktober 2026") i dämpad text #57503F.
- Sist kontrollraden i liten text: "Omdömena skrivs av kunder som köpt
  härifrån, via en personlig länk som skickas efter leveransen. Jag läser
  dem innan de publiceras, och alla som följer reglerna publiceras oavsett
  betyg." Länkar till villkorssidan.
- Fungerar i enkolumn under 720 px utan särskilda regler.

### 7. Strukturerad data: `src/_includes/strukturerat.njk`

- **Brädsidan:** när brädan har omdömen får Product:
  - `aggregateRating` (`ratingValue`, `reviewCount`, `bestRating` 5,
    `worstRating` 1)
  - `review`, en lista med `Review`: `reviewRating`, `author` (`Person`
    med namnet), `datePublished` och `reviewBody`

  Värdena räknas med samma filter som visningen, så sida och data inte
  kan skilja sig.
- **Beställningssidan:** ett nytt Product-block, "Ändträskärbräda efter
  mått", med `brand`, `countryOfOrigin` och ett `AggregateOffer`
  (`lowPrice` och `highPrice` räknas ur prislistan i
  `assets/konfigurator.js`, och båda måste synas på sidan). Betyg och
  omdömen läggs till på samma sätt som på brädsidan när de finns.
- **Startsidans ItemList** får inga betyg: de korta posterna där visar inga
  omdömen.

### 8. Villkorssidan

Ett nytt stycke i `src/villkor.njk` om omdömen: vem som kan skriva, att
förnamn, ort, betyg, text och månad publiceras, att inget annat sparas, att
Sebastian granskar enligt reglerna ovan och att kunden kan be om att få
omdömet borttaget per mejl.

## Tester

- `test/omdome.test.js`, funktionen: godkänt omdöme sparas och koden märks
  som använd; en använd kod ger 410; en okänd kod ger 400; betyg 0, 6 och
  2,5 avvisas; för kort och för lång text avvisas; en främmande Origin
  avvisas; styrtecken rensas; ett misslyckat notismejl ger ändå 303. D1
  och Resend ersätts med enkla attrapper, som i `klick.test.js` och
  `bestallning.test.js`.
- `test/omdomen-panel.test.js`: koden har rätt form; ett okänt mål avvisas;
  publicering skriver filen och tar bort raden; ett nytt försök efter
  misslyckad borttagning dubblerar inte; *Ta bort* tar ur filen; anrop utan
  `x-panel` avvisas. Detta görs med `skapaServer` och en `fragaD1`-attrapp.
- `test/omdomen-visning.test.js`, lib: snitt och antal, sortering och tomt mål.
- Byggtest: med en omdömesfil som testdata innehåller brädsidans JSON-LD
  `aggregateRating` med samma snitt som syns i HTML, och utan omdömen finns
  varken `aggregateRating` eller `review`. Beställningssidans
  `AggregateOffer` har priser som också står på sidan.

## Utanför ramen

- Länk till Google-företagsprofilen.
- Citat på startsidan.
- Att skicka inbjudningsmejlet automatiskt: Sebastian klistrar in länken
  själv.
- Att redigera kundens text: ett omdöme publiceras som det är eller avslås.
- Svar från Sebastian under ett omdöme.
