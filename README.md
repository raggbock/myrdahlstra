# Myrdahls Trä, myrdahlstra.se

Statisk katalogsajt. Byggs med Eleventy och publiceras på Cloudflare Pages.
Beställningsformuläret är en Pages Function som mejlar via Resend. Ingen
databas, ingen inloggning på sajten, inget som kan gå sönder av sig självt.

## Kom igång

Kräver Node (finns redan på den här datorn).

```
npm install      # en gång
npm run admin    # verkstadspanelen, http://localhost:4322
npm start        # snabb förhandsvisning med live reload, http://localhost:4321
npm run preview  # allt inklusive formuläret, http://localhost:4323
npm run build    # tömmer _site och bygger färdiga filer där
npm run deploy   # bygger och publicerar till Cloudflare Pages
npm test         # kör testerna
```

## Verkstadspanelen

```
npm run admin    # panelen på http://localhost:4322
```

Panelen är enklaste vägen att lägga in en ny bräda. Kör den gärna samtidigt som
`npm start`, då ser du sajten uppdateras i det andra fönstret.

Den kör **bara på din dator**, aldrig på servern. Därför finns ingen
inloggning och inget som kan angripas utifrån. Servern lyssnar på 127.0.0.1, och
mappen `verktyg/` ligger utanför det som byggs, så panelen kan inte råka
följa med i en uppladdning.

Så här går det till:

1. Tryck **Ny bräda**, eller välj en befintlig i listan.
2. Fyll i titel, pris och mått. Adressen på sajten föreslås från titeln.
   Måtten skrivs som tre fält och blir en rad som `45 × 32 × 3,8 cm`.
3. Specraderna är fria: lägg till Saftränna, Mönster, Fötter eller vad brädan
   nu har, i den ordning du vill ha dem.
4. Dra in foton. Varje bild roteras rätt, beskärs till 4:3, skalas ner, får all
   metadata rensad (inklusive GPS) och ljuset jämnat mot resten av katalogen.
   Reglaget under bilden flyttar beskärningen, med levande förhandsvisning.
   Första bilden blir stor bild på produktsidan och bild på katalogkortet.
5. **Spara och bygg** skriver `products.json`, sparar fotona och bygger om
   sajten. Uppladdningen gör du själv när du är nöjd.

Kryssa **Såld** när en bräda är borta. Sidan finns kvar så gamla länkar
fungerar, men priset stryks över och beställningsknappen byts mot en rad om att
höra av sig. Vill du ta bort brädan helt finns **Ta bort brädan**, och då
städar bygget bort sidan också.

Panelen tar aldrig bort bildfiler. Ligger det bilder i `assets/foto` som
ingen bräda använder listas de längst ner till vänster, så du kan rensa själv.

### Om något går fel

Före varje sparning kopieras föregående version till
`src/_data/products.json.bak`. Har du råkat spara fel, byt namn på den filen
tillbaka till `products.json` och bygg om.

Filen skrivs atomärt, alltså till en temporärfil som byter namn sist, så ett
avbrott mitt i en sparning kan aldrig lämna en halv `products.json`.

## Redigera brädorna för hand

Panelen är bara ett gränssnitt mot `src/_data/products.json`. Vill du hellre
redigera filen direkt fungerar det lika bra. En bräda ser ut så här:

```json
{
  "nr": 4,
  "slug": "andtraskarbrada-valnot",
  "titel": "Ändträskärbräda i massiv valnöt",
  "kort": "Kort text som står på startsidans katalogkort.",
  "beskrivning": "Längre text som står på brädans egen sida.",
  "pris": 2200,
  "spec": {
    "Mått": "45 × 32 × 3,8 cm",
    "Träslag": "Massiv valnöt, ändträ",
    "Ytbehandling": "Paraffinolja och bivax"
  },
  "textur": "valnot",
  "bilder": [],
  "lapp": "endast ett exemplar!",
  "sald": false
}
```

`slug` blir adressen, alltså `myrdahlstra.se/brada/andtraskarbrada-valnot/`.
Bara små bokstäver, bindestreck och inga å, ä, ö. `textur` styr det randiga
träfältet som visas innan du lagt in foton: `ek`, `mix`, `valnot` eller
`bricka`.

Kör `npm run build` efteråt och ladda upp `_site/` igen.

## Brädor som görs på beställning

En post i katalogen kan vara ett unikt exemplar som ligger färdigt, eller
något du gör om varje gång någon vill ha det. Kryssa i `Görs på beställning` i
panelen, eller sätt `"pabestallning": true` för hand.

Då får katalogkortet lappen "görs på beställning" i stället för att se ut som
ett lagerexemplar, och brädans egen sida skriver ut tillverkningstiden i
stället för att låta kunden tro att den skickas i veckan. Såld och på
beställning går inte ihop, och ett test säger ifrån om båda är satta på samma
bräda.

## När en bräda blir såld

Kryssa i Såld i panelen, eller sätt `"sald": true` för hand. Panelen fyller
samtidigt i `"saldDatum": "2026-09-07"`, alltså dagens datum. Datumfältet går
att backa om brädan såldes tidigare i veckan.

Brädan försvinner inte direkt. Den flyttas sist i katalogen och får ett rött
band över fotot i en vecka, så att den som såg den förra veckan förstår vad
som hänt. Priset stryks över och beställningsformuläret tas bort, men brädans
egen sida ligger kvar även efteråt, så att gamla länkar och bokmärken inte dör.

Efter veckan faller brädan ur startsidan. Det sker vid **bygget**, inte hos
besökaren: sajten är statisk och vet inte vilken dag det är. En bräda ligger
alltså kvar tills du kör `npm run build` och laddar upp igen. Bygget skriver
ut hur många dagar varje såld bräda har kvar:

```
såld: N:o 2 Ändträskärbräda i tre träslag, bandet visas 5 dagar till
såld: N:o 5 Långträskärbräda i massiv ek, veckan är slut, faller ur katalogen i det här bygget
```

Veckan är sju dagar och står på ett enda ställe, `VISNINGSDAGAR` i
`lib/sortiment.js`. Saknar en såld bräda `saldDatum` blir bandet kvar tills du
fyller i ett datum, hellre det än att brädan försvinner tyst. Ska den bort med
detsamma, ta bort hela posten i panelen i stället.

## Foton

Två mappar, med olika roll:

- `assets/images/` är inkorgen för obehandlade original rakt ur telefonen.
  Den laddas **inte** upp till sajten. Verkstadsfotona från 2 september ligger
  kvar där orörda.
- `assets/foto/` är de webbklara bilderna, och bara den mappen laddas upp.

Sex bilder är färdigbehandlade i `assets/foto/`: roterade rätt, beskurna så
brädans yta fyller rutan i 4:3, nedskalade, och rensade från all EXIF-data
(originalen innehöll GPS-koordinater från verkstaden, de följer inte med).
Ljusheten är utjämnad mellan bilderna så korten i katalogen ser ut att höra
ihop.

Alla sju bilder är inkopplade:

| Fil | Bräda |
| --- | --- |
| `andtra-ek-jamn.jpg` | N:o 1, ändträ i massiv ek |
| `andtra-ek-valnot-lonn.jpg` | N:o 2, ek, valnöt och lönn |
| `andtra-ek-rutmonster-kant.jpg` | N:o 3, stor bild som visar saftrännan |
| `andtra-ek-rutmonster.jpg` | N:o 3, tumnagel som visar mönstret |
| `andtra-ek-mursten.jpg` | N:o 4, murstensmönster |
| `langsfibrig-ek.jpg` | N:o 5, långträ i massiv ek |
| `langsfibrig-ek-lonn-valnotskant.jpg` | N:o 6, långträ med valnötskant |

Byt bara filnamnet i `bilder` på rätt bräda om en bild sitter fel.

**Bilderna visar ytan, inte hela brädan.** Fotona är tagna på sned i
verkstaden med cykelhjul, oljeflaskor och sågbock i bakgrunden, så det finns
ingen beskärning som ger en hel bräda mot ren botten. Ytbilderna fungerar bra i
katalogen, referensdesignens produktbilder är också träytor som fyller rutan.
Men för en riktig produktbild behövs en omtagning: brädan rakt ovanifrån på ett
rent underlag, gärna i dagsljus.

## Fotoserien på ändträsidan

Sju foton med prefixet `process-` i `assets/foto/` visar hur en ändträbräda
blir till, från planka till färdigt bräde. De togs när schackbrädet N:o 7
gjordes (14 september 2026) och är stående telefonbilder, nedskalade till
1080 px och rensade från EXIF. Sidan beskär dem till 4:5 i CSS, så filen har
hela fotot kvar.

Ordning, rubriker och bildtexter står i `src/_data/process.json`. Vill du
byta ett foto, lägg den nya filen i `assets/foto/` och peka på den där.
Panelen räknar fotona i den filen som använda, så de dyker inte upp som
något att städa bort.

## Lägga till fler foton

Lägg de webbklara filerna i `assets/foto/` och skriv filnamnen i `bilder`:

```json
"bilder": ["no1-ovanifran.jpg", "no1-vinkel.jpg", "no1-kant.jpg", "no1-i-koket.jpg"]
```

Första bilden blir den stora på produktsidan och bilden på katalogkortet. Bild
två till fyra blir tumnaglar. Med bara en bild hoppas tumnagelraden över. Är
`bilder` tom visas de randiga platshållarna med `[FOTO]`.

Bilderna behöver ungefär 1600 px bredd i liggande 4:3. Vill du att jag kör
samma behandling på en ny omgång foton, säg till, jag har skriptet kvar.

## Publicera

```
npm run preview  # sajten OCH formuläret lokalt, http://localhost:4323
npm run deploy   # bygger och publicerar till Cloudflare Pages
```

Sajten ligger på Cloudflare Pages-projektet **myrdahls-storefront**, alltså
`myrdahls-storefront.pages.dev` tills myrdahlstra.se är registrerad och
kopplad. Varje deploy ersätter hela sajten, så en bräda du tagit bort försvinner
faktiskt. Det gör den inte vid vanlig filuppladdning över FTP.

Skillnaden mellan de två förhandsvisningarna: `npm start` är snabbare och har
live reload, men kan inte köra formuläret. `npm run preview` kör allt genom
wrangler precis som i skarpt läge, så där fungerar även beställningsformuläret.

## Formuläret

Beställningar går till `functions/api/bestallning.js`, en Pages Function som
ligger på samma domän som sajten. Ingen separat Worker, inget CORS, ingen
tredjepartstjänst för formulär. Funktionen tar emot posten, mejlar den till dig
via Resend, och skickar kunden till tacksidan.

Den behöver tre miljövariabler på Pages-projektet, satta i Cloudflares panel
under Settings, Variables and Secrets:

| Namn | Typ | Värde |
| --- | --- | --- |
| `RESEND_API_KEY` | Secret | API-nyckeln från Resend |
| `MOTTAGARE` | Text | sebastian.myrdahl@gmail.com |
| `AVSANDARE` | Text | valfri, koden använder `Myrdahls Trä <bestallning@myrdahlstra.se>` |

`myrdahlstra.se` är verifierad i Resend med sändning aktiv, så avsändaren är
`bestallning@myrdahlstra.se`. Bara `RESEND_API_KEY` behöver sättas, de andra
två har rimliga standardvärden i koden.

Adressen kan skicka men inte ta emot, eftersom mottagning är avstängd på
domänen. Vill du kunna få mejl på `@myrdahlstra.se` går det att sätta upp med
Cloudflare Email Routing, som vidarebefordrar till din Gmail gratis.

Två mejl skickas per inskick:

1. **Notisen till dig**, med allt kunden fyllt i. Kundens adress sätts som
   `reply_to`, så du svarar kunden genom att bara svara på mejlet.
2. **Bekräftelsen till kunden**, som återger vad som skickats in och säger att
   du svarar personligen inom ett par dagar. Svarsadressen är din Gmail,
   eftersom `bestallning@myrdahlstra.se` kan skicka men inte ta emot.

Notisen skickas först och är den som räknas. Har kunden bara lämnat ett
telefonnummer skickas ingen bekräftelse, det finns ingen adress att skicka till.
Misslyckas bekräftelsen loggas det, men kunden får ändå tacksidan, för
beställningen har ju kommit fram till dig.

Funktionen har inbyggda skydd: en dold honungsfälla mot bottar, krav på namn och
kontaktuppgift, en tidsgräns på tio sekunder mot Resend, och en storleksgräns på
inskicket. Går något fel får kunden en läsbar sida med din mejladress i stället
för ett tekniskt felmeddelande, och felet loggas i Cloudflares loggar.

Är `RESEND_API_KEY` inte satt svarar formuläret att det inte är kopplat än,
med din mejladress. Vill du hellre ha mejl-fallbacken tillbaka, töm
`formEndpoint` i `src/_data/site.json`, då blir beställningsknapparna
förifyllda mejl igen.

## Två lägen på beställningssidan

Sidan har en väljare överst: bygg en bräda, eller skriv ett meddelande. Det
andra läget finns för den som bara har en fråga, vill ha ett mått som inte
ligger i byggaren, eller helt enkelt inte vill klicka sig igenom fem steg.

Lägena är två separata `form`-element. Det är med flit: hade de varit ett
gemensamt formulär med gömda fält hade byggarens val kunnat följa med i ett
meddelande, och tvärtom. Nu kan inget läcka mellan dem.

Växlingen görs i ren CSS, med `:has()` på de två kryssrutorna, så den fungerar
utan skript. Det enda skriptet gör är att låta adressen `/bestallning/#skriv`
landa direkt i meddelandeläget, vilket kontaktrutan på startsidan länkar till.
Utan skript visas byggaren, vilket inte är trasigt, bara ett klick ifrån.

Båda formulären går till samma funktion och har samma honungsfälla mot bottar.
Skillnaden syns i ämnesraden i mejlet: "Förfrågan: bräda efter mått" respektive
"Meddelande från hemsidan".

## Skärbrädsbyggaren

Beställningssidan är en byggare: kunden väljer mönster, träslag, mått och
saftränna, och brädan ritas upp vid sidan om medan hon väljer. Ritningen är
en SVG som byggs som text i `assets/konfigurator.js`, av bygget och av
webbläsaren, ur samma funktion. Det finns alltså ingen bildfil att hålla
uppdaterad, och sidan visar rätt bräda redan innan skriptet vaknat.

Brädan ritas som ändträ, alltså rutor och inte långa stavar. Det är hela
poängen: stavarna kapas och vänds ett kvarts varv, så det är ändytan kunden
skär mot, och en skiss med långa ränder visar fel vara.

Ådringen slumpas fram, men alltid likadant. Slumpen kommer ur en heltalshash
(`Math.imul`), aldrig ur `Math.random` eller `Math.sin`, för de sista
decimalerna i `Math.sin` får skilja mellan webbläsare. Skulle ådringen kunna
hoppa till mellan bygget och webbläsaren vore det synligt på skärmen.

Mönstret bestämmer hur många träslag kunden får välja. `hel` har en plats,
resten har två, och skriptet gömmer och kopplar ur det andra träslaget när
det inte behövs, så att det inte följer med i mejlet. Väljer kunden samma
träslag på båda platserna blir brädan enfärgad och betalas som ett träslag.

Mönstret bestämmer hur många träslag kunden får välja, fältet `platser`:

| Mönster | Platser | Vad kunden väljer |
|---|---|---|
| Naturlig | 0 | inget, du väljer i verkstaden |
| Hel | 1 | ett träslag |
| Ränder | 2 | två träslag |
| Rutmönster | 2 | två träslag |
| Mursten | 3 | två till stenarna, ett till bruket |

Storlekarna är 40 × 26, 45 × 30, 50 × 32 och 60 × 32 cm. Basutbudet stannar vid
32 cm i bredd, och det är ett prisbeslut snarare än en maskingräns: planhyveln
tar 33 cm, så en bredare bräda måste limmas av två plattor efter hyvlingen.
Det går att göra, men det är betydligt mer arbete, så bredare mått prisas för
sig efter mejl. Slaktarbrädan växer på längden i stället. Ett test vaktar
gränsen, så en för bred storlek inte kan smyga sig in i standardlistan.

Skriptet gömmer och kopplar ur de platser mönstret inte har, så ett träslag som
inte sitter på brädan följer aldrig med i mejlet. Väljer kunden samma träslag på
flera platser betalas det en gång.

Naturlig har inga träslagstillägg alls, eftersom kunden inte väljer virke. Den
blir därmed billigast i praktiken, i nivå med en hel bräda i ek eller ask.

Murstenens bruk är ett eget träslag, alltså riktiga remsor virke mellan
stenarna och inte ett streck i bläck. Stenarna dras in en halv brukbredd på
varje sida, precis som en sten sitter indragen i sin fog i en mur. Bredden
styrs av `fog` på mönstret, och stenarna är liggande genom `stavform: 2`,
alltså dubbelt så breda som höga. De andra mönstren har kvadratiska stavar och
en tunn limfog i bläck.

## Ändra priser i byggaren

Priserna står på ett enda ställe, i toppen av `assets/konfigurator.js`:

- grundpris per storlek (`bas`): 1750, 2000, 2250, 2750
- tillägg per valt träslag (`plus`): ek 0, ask 0, lönn 100, valnöt 300
- tillägg för mönster (`plus`): naturlig 0, hel 0, ränder 200, rutmönster 400, mursten 400
- tillägg för saftränna: 150

Priset blir grundpriset för storleken, plus mönstret, plus varje träslag som
mönstret faktiskt använder, plus rännan.

Ändrar du där följer alternativkorten, cirkapriset i webbläsaren och testerna
med automatiskt. Vill du lägga till ett träslag räcker det att lägga till en
rad i `TRASLAG` med `bas` och `adring`, alltså grundton och ådringsfärg, så
ritas det överallt.

Varje mönster har också ett `fog`, limfogens bredd i ritningen som andel av en
rutas höjd. Murstenen har en tjockare fog än de andra, för det är den som
läser som murbruk mellan skiften. Höjer du den för mycket flyter mörk valnöt
ihop med fogen och mönstret försvinner, så 0,06 är avvägt mot just den
kombinationen. Kör `npm test` efteråt, då ser du att räknandet
fortfarande stämmer.

## Stilmall och skript hämtas med fingeravtryck

Cloudflare säger åt webbläsaren att spara `style.css` och `konfigurator.js` i
fyra timmar, men HTML:en sparas inte alls. En besökare som var inne strax före
en uppdatering kan därför få den nya sidan tillsammans med den gamla
stilmallen och det gamla skriptet. Sidan ser då trasig ut på ett sätt som inte
syns hos dig, eftersom din webbläsare hämtade allt samtidigt.

Därför läggs innehållets fingeravtryck sist i adressen vid bygget:
`/assets/style.css?v=6eb3fb06`. Ändras filen ändras fingeravtrycket, och då är
det en ny adress som ingen cache känner igen. Det sköts av filtret `version` i
`.eleventy.js` och behöver inget underhåll.

## Sökmotorer

Sidkartan och robots.txt räknas fram vid bygget ur samma källor som sidorna,
så de kan inte hamna på efterkälken. `src/sitemap.njk` hämtar brädorna ur
katalogfiltret: en bräda som fallit ur katalogen ligger alltså inte kvar och
lockar sökmotorn till en sida ingen längre länkar till.

Tacksidan och 404 är märkta `noindex: true` i sin frontmatter. Flaggan sätts av
sidan själv och gissas inte ur adressen, för Eleventy skriver `page.url` olika
beroende på om permalänken slutar på `index.html` eller inte, och det är lätt
att tro fel om.

`src/_includes/strukturerat.njk` lägger in det Google läser i stället för att
gissa ur texten. Produktsidor får `Product` med pris, valuta och lagerstatus,
alltså det som kan visas direkt i träfflistan. Status följer posten: i lager,
slutsåld, eller förbeställning för det som görs på beställning. Startsidan får
`LocalBusiness` med ort och kontakt.

**Allt som står i den strukturerade datan måste också stå synligt på sidan.**
Priset hämtas därför ur samma `products.json` som prisraden. Att lova ett pris
i koden och visa ett annat för besökaren är precis vad Google straffar.

Delas en länk visas `assets/foto/delbild.jpg`, beskuren till 1200 × 630 som
Facebook och X vill ha den. Produktsidor delar sitt eget foto i stället. Utan
det blir en delad länk en tom grå ruta.

### Bilderna

Fotona ligger i 1400 px, men katalogkorten visar dem i rutor på 190 px. Utan
mindre varianter laddar startsidan ett par megabyte foto för att fylla några
frimärken, och det är både långsamt och något Google mäter.

`verktyg/bilder.js` gör därför varianter i 480 och 900 px efter bygget, i både
jpeg och avif, och `src/_includes/bild.njk` pekar ut dem med `srcset`.
Webbläsaren tar avif om den kan och jpeg annars.

Webp är med flit inte med. Mätt på just de här fotona blev webp **större** än
vår mozjpeg, alltså sämre än det vi redan hade, och ett format till i markupen
kostar utan att ge något.

| Startsidans foton | |
|---|---|
| originalen | 1 656 kB |
| 480 px jpeg | 197 kB |
| 480 px avif | **157 kB** |

Avif tar drygt en sekund per bild att koda, så färdiga varianter sparas i
`.bildcache` i projektroten och kopieras därifrån nästa bygge. Nyckeln är
fotots innehåll, så ett ändrat foto kodas om medan orörda går på kopiering.
Kallt bygge tar ungefär 35 sekunder, varmt tre. Mappen kan raderas när som
helst, den byggs upp igen.

Varianterna skrivs rakt in i `_site` och inte i `assets/foto`, för
verkstadspanelen listar den mappen och skulle annars visa varje variant som
ett oanvänt foto att städa bort.

Namnen räknas ut på två ställen, i bildverktyget och i filtret `bildbredd`.
Går de isär pekar sidan på bilder som inte finns, vilket inte syns i bygget
utan bara som trasiga bilder hos besökaren. `test/bilder.test.js` håller ihop
dem.

Varje bild har `width` och `height` i markupen. Det är inte dekoration: utan
dem vet webbläsaren inte hur mycket plats bilden ska ha och sidan hoppar till
när fotona dyker upp. Foton under första skärmen laddas lätt, medan brädans
hjältebild laddas ivrigt eftersom den är det första man ser.

### Cachehuvuden

Allt under `/assets/` levereras med ett år och `immutable`, sidorna med
`max-age=0`. Det är säkert eftersom varje fil byter adress när innehållet
byter: stilmall, skript och logga har fingeravtryck, typsnitten är namngivna
efter innehållet, och panelen ger varje uppladdat foto ett nytt filnamn i
stället för att skriva över. Reglerna står i `src/headers.njk`.

**En fälla värd att känna till:** Pages tillämpar *alla* regler i `_headers`
som matchar, och slår ihop dem. Den mest specifika vinner inte. En rad för
`/*` i botten klistras alltså på varje tillgång också, och resultatet blir

```
public, max-age=31536000, immutable, public, max-age=0, must-revalidate
```

som är motsägelsefullt och gör att ettårscachen aldrig gäller. Därför finns
ingen catch-all i filen. Sidorna får `max-age=0, must-revalidate` av Pages
ändå, vilket är precis vad vi vill.

**Byt aldrig ut ett foto genom att skriva över filen med samma namn.** Då
sitter den gamla bilden kvar hos besökaren i upp till ett år. Ladda upp på
nytt i panelen i stället, så får den ett nytt namn.

### Typsnitten

EB Garamond och Caveat ligger i `assets/fonts` i stället för att hämtas från
Google. Ett anrop till fonts.googleapis.com blockerar renderingen tills det
svarat, och det är en uppkoppling till en annan domän innan besökaren sett en
enda bokstav.

EB Garamond är en variabel font, så samma fil täcker hela viktspannet och vikt
400 och 500 pekar med flit på samma fil. Vikt 600 hämtades förut men används
inte av en enda regel i stilmallen. En svensk besökare laddar tre filer på
sammanlagt 140 kB, latin-ext hämtas bara om en bokstav i det spannet dyker upp.

Båda typsnitten är under SIL Open Font License 1.1, texten ligger i
`assets/fonts/LICENS.txt`.

### Interna länkar

Varje sida hade bara menyns och sidfotens länkar, noll i brödtexten. Nu länkar
brädornas sidor till tre andra brädor i katalogen, till `/andtra/` och till
byggaren, och innehållssidorna länkar vidare till varandra. Länkarna har
beskrivande text, alltså brädans namn och inte "klicka här", eftersom det är
texten i länken som säger vad sidan handlar om.

### Mätning

**Sajten mäter ingenting, och Cloudflare Web Analytics går inte att få igång
här.** Fyra vägar är prövade skarpt mot den riktiga domänen:

1. **Zonens automatiska injicering.** Cloudflare injicerar beaconen åt riktiga
   webbläsare, det syns bara i webbläsaren och inte om man hämtar sidan med
   curl. Beaconen laddas, men postar sedan till `/cdn-cgi/rum` på egen domän,
   som svarar **404**. Den adressen finns inte på en sajt som serveras av
   Pages.
2. **Egen beacon med zonens site_tag.** Insamlaren avvisar den, 404, vilket
   webbläsaren rapporterar som CORS-fel.
3. **Egen beacon med en värdnamnsbunden sajt.** Samma fel. Sajten registreras
   dessutom utan värdregel.
4. **Lägga till värdregeln via API.** Rulesetet saknar id och anropet nekas.

Slutsats: Cloudflare Web Analytics är byggt för zoner där Cloudflare står
framför en egen server. En Pages-sajt går en annan väg, och `/cdn-cgi/rum`
finns inte där.

Därför är zonens RUM-inställning satt till manuell och `analys` i
`src/_data/site.json` står tom. Utan det låg ett misslyckat anrop på varje
besökares sidladdning, utan att något samlades in. Sidan har nu noll externa
anrop.

**Under tiden:** Cloudflares vanliga zonstatistik fungerar utan någon kod
alls. Cloudflare, myrdahlstra.se, Analytics & Logs, Traffic. Den räknar
requests och inte unika besökare, så siffrorna är grövre, men den visar
trafikens riktning och kostar ingenting att slå på, för den är redan på.

Vill du ha riktig besöksstatistik är nästa steg antingen att fråga Cloudflares
support varför `/cdn-cgi/rum` inte finns på ett Pages-projekt, eller att välja
en tjänst som inte förutsätter Cloudflares proxy. Kravet från briefen är att
det ska fungera utan kakruta, alltså ingen spårning av enskilda personer.

### Kvar att göra hos dig

Verifiera domänen i Google Search Console och skicka in
`https://myrdahlstra.se/sitemap.xml`. Utan det hittar Google sajten ändå, men
långsammare, och du ser inte vad som indexerats.

## Frakt

Frakten går i två nivåer efter vikt, och beloppen står på ett enda ställe:
`fraktLiten`, `fraktStor` och `fraktGrans` i `src/_data/site.json`. Därifrån
hämtas de av produktsidorna, byggaren, kontaktrutan och köpvillkoren.

| Storlek | Vikt med kartong | Nivå |
|---|---|---|
| 40 × 26 cm | 3,2 kg | låg |
| 45 × 30 cm | 4,0 kg | låg |
| 50 × 32 cm | 4,7 kg | hög |
| 60 × 32 cm | 5,6 kg | hög |

Vikterna är räknade på 3,8 cm tjocklek och lufttorr ek, alltså det tyngsta
vanliga fallet, plus dubbelwellkartong och stötdämpning. Spannet 3,2 till 5,6
kg går över tre viktklasser hos fraktbolagen, och det är därför en enda platt
avgift antingen blir för dyr för den lilla brädan eller för billig för
slaktarbrädan.

Beloppen är 189 och 249 kr, satta efter självkostnad. Två saker gör den högre
än man först tror:

**Momsen är en kostnad här.** Fraktbolagen anger priser exklusive moms och ett
vanligt företag drar av den. Verksamheten är momsfri enligt 18 kap.
mervärdesskattelagen och kan alltså inte det, så 149 kr ex moms betyder 186 kr
ur egen ficka.

**Kartongen kostar 22,57 kr styck**, och med tejp och stötdämpning kring 27 kr
per försändelse.

Självkostnaden landar därmed på ungefär 180 kr för den minsta brädan och 227 kr
för slaktarbrädan. Den tidigare avgiften på 99 kr täckte alltså ungefär halva
kostnaden.

**Instabox tar inte den största brädan.** Deras största paketbox mäter
590 × 390 × 240 mm, och en 60 × 32-bräda i kartong blir kring 650 mm lång.
PostNord har ingen sådan gräns, så vill du ha ett enda arbetssätt i verkstaden
skickar du allt med dem.

## Köpvillkoren

`src/villkor.njk` innehåller ångerrätt, reklamation, betalning, frakt och
företagsuppgifter. Uppgifterna hämtas från `src/_data/site.json`:

| Nyckel | Vad den gör |
| --- | --- |
| `innehavare` | ditt namn i företagsuppgifterna |
| `orgnr` | **tom i dag.** Är den tom hoppas raden över helt, ingen platshållare visas för kunden. Fyll i den innan du börjar sälja, en näringsidkare ska gå att identifiera |
| `fskatt` | `true` visar stycket om F-skatt |
| `returfrakt` | vem som betalar returfrakten vid ångerköp |

**Läs igenom villkoren själv.** Jag har skrivit dem i standardform utifrån
distansavtalslagen och konsumentköplagen, men jag är ingen jurist och det är
din verksamhet som står bakom texten. Särskilt undantaget för brädor
tillverkade efter mått är värt att kontrollera att du är bekväm med.

## Ändra texter, mejladress och sidfot

`src/_data/site.json` innehåller mejladress, ort, katalogtitel ("SORTIMENTSKATALOG
· HÖSTEN 2026"), fraktvillkor, leveranstid och skötseltexten.

## Vad som ligger var

```
src/_data/products.json    brädorna, det panelen skriver i
src/_data/site.json        mejl, ort, katalogtitel, formulärets adress
src/index.njk              startsidan
src/brada.njk              mallen som ger en sida per bräda
src/bestallning.njk        beställning efter mått
src/tack.njk               sidan kunden landar på efter skickat formulär
src/andtra.njk             Varför ändträ, förklaringssidan
src/verkstaden.njk         om verkstaden
src/villkor.njk            köpvillkor och företagsuppgifter
src/404.njk                sidan för adresser som inte finns
src/_includes/             huvud, sidfot, ornament, katalogkort, formulär
assets/style.css           all formgivning
assets/konfigurator.js     prislistan och räknandet
functions/api/            beställningsformuläret, körs på Cloudflare
lib/brev.mjs               bygger mejlen, delas av funktionen och testerna
assets/foto/               webbklara brädfoton, laddas upp
assets/images/             obehandlade original, laddas inte upp
design/                    de godkända referensdesignerna, byggs inte
verktyg/admin.js           verkstadspanelens server
verktyg/panel.html         panelens sida
verktyg/panel.js           panelens klientdel
verktyg/produkter.js       adresser, mått, validering, läs och skriv
verktyg/foto.js            fotobehandlingen
verktyg/stada.js           tömmer _site före bygget
test/                      test för prisräkning, panelen och mejlen
_site/                     resultatet, det som publiceras
```

`design/` är kvar som referens och rörs inte av bygget.
