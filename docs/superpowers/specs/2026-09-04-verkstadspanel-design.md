# Verkstadspanelen, design

Datum: 2026-09-04
Status: godkänd i chatt, klar att bygga

## Problem

Sortimentet ligger i `src/_data/products.json` och redigeras för hand. Det
fungerar men kräver att Sebastian skriver JSON korrekt, hittar rätt filnamn på
foton, och kör fotobehandlingen separat. När en bräda blir klar i verkstaden ska
det gå att registrera den utan att röra kod.

## Avgränsning

Panelen körs lokalt på Sebastians dator. Den ligger **inte** på webbhotellet.
Det bevarar briefens krav "Helt statisk sajt, ingen backend", och innebär att
det inte finns någon inloggning, inga lösenord och ingen angreppsyta på
servern.

Beslut som togs bort medvetet: inget gränssnitt från telefonen (kräver server
som alltid är igång), ingen FTP-uppladdning från panelen (lösenord i fil, och
publicering i ett steg är lätt att göra av misstag).

## Arkitektur

```
npm run admin
  -> verktyg/admin.js          server, bunden till 127.0.0.1:4322
       verktyg/panel.html      sidan, vanlig HTML plus lite JS
       verktyg/produkter.js    ren logik: adress, mått, validering, läs/skriv
       verktyg/foto.js         fotobehandling via sharp
  -> skriver src/_data/products.json och assets/foto/
  -> kör om bygget och rapporterar utfallet
```

`verktyg/` ligger utanför Eleventys indatamapp (`src/`), så panelen kan aldrig
byggas in i sajten eller laddas upp.

Foton skickas en fil per anrop med filen som rå request-body, inte som
multipart. Det gör att servern kan läsa bodyn direkt som en Buffer, utan
beroende för multipart-tolkning.

Förhandsvisningen ligger kvar på 4321 (`npm start`). Panelen länkar dit.

## Fält

Listan sorteras på N:o och har redigera, sålt-kryss, ta bort, samt flytta upp
och ner (som numrerar om).

| Fält | Form i panelen |
| --- | --- |
| `nr` | föreslås automatiskt som nästa lediga, går att ändra |
| `slug` | föreslås från titeln med å, ä, ö översatta, går att ändra |
| `titel` | textfält, obligatoriskt |
| `kort` | textarea, texten på katalogkortet |
| `beskrivning` | textarea, texten på produktsidan |
| `pris` | heltal i kronor |
| `spec` | repeterbara rader med namn och värde |
| Mått | tre fält (längd, bredd, tjocklek) som sätts samman till specraden |
| `textur` | val: ek, mix, valnot, bricka. Används bara som platshållare utan foto |
| `lapp` | textfält, den handskrivna lappen |
| `bilder` | dra in filer, se nedan |
| `sald` | kryssruta |

Måttsträngen sätts samman som `45 × 32 × 3,8 cm`, med multiplikationstecken
(U+00D7) och decimalkomma. Tjockleken är valfri, då blir strängen `40 × 28 cm`.

Ändrad `slug` betyder ändrad URL. Panelen varnar när slug ändras på en bräda
som redan finns i filen.

## Fotobehandling

Per bild, i ordning:

1. Rotera enligt EXIF (`orientation`).
2. Beskär till 4:3 liggande. Rutan placeras med ett reglage i panelen, med
   levande förhandsvisning. Automatisk beskärning provades på de sex befintliga
   bilderna och behövde handpåläggning på två av dem, därför reglage och inte
   gissning.
3. Skala till max 1400 px bredd, aldrig upp.
4. Jämna ljusheten mot medelljus omkring 103, samma mål som befintliga bilder.
   Den varma tonen från verkstadslampan lämnas orörd.
5. Spara som JPEG kvalitet 78 (mozjpeg) i `assets/foto/`, namnad efter brädans
   slug plus löpnummer. All metadata rensas, inklusive GPS.

Första bilden blir stor bild på produktsidan och bild på katalogkortet, resten
blir tumnaglar.

## Skydd mot misstag

- `products.json` skrivs atomärt: till temporärfil som byter namn sist, så ett
  avbrott inte kan lämna en halv fil.
- Föregående version sparas som `products.json.bak` före varje skrivning.
- Validering: `titel` ifylld, `pris` positivt heltal, `nr` unikt, `slug` unik
  och URL-säker.
- Borttagen bräda lämnar sina bildfiler kvar. Panelen listar oanvända bilder i
  stället för att radera. Radering är destruktivt och ska vara ett aktivt val.
- Servern binds till `127.0.0.1`, aldrig `0.0.0.0`.

## Efter Spara

Bygget körs om och panelen visar om det gick igenom, med länk till
förhandsvisningen. Har Sebastian `npm start` igång sker ombyggnaden ändå
automatiskt, eftersom dev-servern bevakar `products.json`.

## Test

Testdrivet, som prislogiken. Rena funktioner i `verktyg/produkter.js`:

- adress från svensk titel (å, ä, ö, versaler, mellanslag, tecken som ska bort)
- måttsträngen, med och utan tjocklek
- valideringen, varje regel var för sig
- läs och skriv: rundgång, atomär skrivning, att backup skapas

Fotobehandlingen kontrolleras genom att köra den på befintliga original och
mäta utfallet (mått, metadata borta, medelljus). Formuläret kontrolleras i
webbläsaren.

## Nytt beroende

`sharp`, som devDependency. Följer inte med i uppladdningen.
