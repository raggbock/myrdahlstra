# Myrdahls Trä, webbshop

Statisk webbplats för Myrdahls Trä, en enmansverkstad i Stora Mellösa utanför Örebro som tillverkar och säljer ändträskärbrädor och serveringsbrickor. Ägare: Sebastian Myrdahl. Detta dokument är hela briefen. Designen är redan bestämd och godkänd, bygg troget mot den.

## Designriktningen: Katalogen

Sidan ser ut som en gammaldags svensk postorderkatalog. Färdiga referenssidor ligger i `design/` som HTML-filer (Main = startsida, Produkt = produktsida, Bestall = beställningssida). De är ritade i ett canvasformat men markup och inline-stilar är den exakta designen: återge den pixeltroget som riktig responsiv HTML/CSS. Den delade designen finns även publicerad som artifact: https://claude.ai/code/artifact/107acfba-94d8-4788-9abc-e1ee2824bad6

Designsystem:

- Bakgrund #F4EDDD, bläck #2B2118, dov guldbrun #8a5a2c, rostroed handskriftsaccent #8a3d2c, kortbakgrund #FBF6E9, dämpad text #57503F
- Typsnitt: EB Garamond (Google Fonts) för allt utom handskrivna accenter som sätts i Caveat. Inga andra typsnitt.
- Dubbel ram runt varje sidas innehåll (1px solid + 3px double, offset 4px)
- Ornament: linje, romb, linje (SVG, finns i referensfilerna)
- Numrerade katalogposter ("N:o 1.") med punktlinjer (dotted leaders) fram till priset
- Handskrivna lappar i Caveat, lätt roterade, färg #8a3d2c
- Inga foton finns ännu: randiga träplatshållare i referensfilerna ersätts med riktiga bilder när Sebastian fotat. Behåll [FOTO]-markörerna tills dess.

## Sidor

1. Startsida: katalogframsida med huvud (SORTIMENTSKATALOG, logotyp, ornament, nav), fyra poster i 2x2-grid (tre produkter + mörkt kort för beställning efter mått), Om verkstaden-passage med signatur, sidfot.
2. Produktsida: en mall som återanvänds per produkt. Inramat foto + tumnaglar, N:o-rubrik, spectabell med punktlinjer, pris, beställknapp, skötselruta med handskriven lapp.
3. Beställningssidan har två lägen som växlas i ren CSS: skärbrädsbyggaren eller ett fritt meddelande (för frågor och önskemål). Två separata formulär, så inga fält kan läcka mellan lägena. Adressen /bestallning/#skriv landar i meddelandeläget. I byggaren väljer kunden mönster, träslag, storlek och saftränna. Mönstret bestämmer hur många träslag som väljs: naturlig 0 (Sebastian väljer i verkstaden), hel 1, ränder och rutmönster 2, mursten 3 (två stenar plus bruket emellan). Träslag: ek, ask, lönn, valnöt. Brädan ritas upp live som SVG vid sidan om, som ändträ med rutor, aldrig som långa stavar. Murstenen har liggande stenar och bruk i eget virke. Ritningen och prislistan bor i assets/konfigurator.js och används av både bygget och webbläsaren. Priser: storlekar 40 × 26, 45 × 30, 50 × 32 och 60 × 32 cm (basutbudet stannar vid 32 cm i bredd: planhyveln tar 33 cm, så bredare måste limmas av två plattor efter hyvlingen, vilket är betydligt mer arbete och prisas för sig efter mejl) med grundpris 1750/2000/2250/2750 kr, tillägg per valt träslag (ek 0, ask 0, lönn +100, valnöt +300), tillägg för mönster (naturlig 0, hel 0, ränder +200, rutmönster +400, mursten +400), saftränna +150. Naturlig har inga träslagstillägg och är därför billigast. Priserna är fastställda av Sebastian och ändras bara i konfigurator.js.

## Produkter

Sortimentet står i `src/_data/products.json`, som är enda sanningskällan. Ingen produktlista i det här dokumentet, den blir bara omodern. De flesta posterna är unika exemplar: sålda brädor markeras med `sald: true` plus `saldDatum` (dagens datum, sätts av panelen). En såld bräda flyttas sist i katalogen och får ett rött band över fotot i en vecka, sedan faller den ur listningarna vid nästa bygge medan brädans egen sida ligger kvar. Fönstret är `VISNINGSDAGAR` i `lib/sortiment.js`, som också äger filtren `tillSalu` och `nyssSalda`. Ska en bräda bort direkt, ta bort hela posten. En post kan också vara märkt `pabestallning: true`, alltså något som görs om varje gång i stället för ett unikt lagerexemplar: då får kortet lappen "görs på beställning" och produktsidan skriver tillverkningstid. Sortimentet omfattar även annat än skärbrädor, till exempel schackbrädet N:o 7.

## Funktionella krav

- Helt statisk sajt, ingen backend. Vanilla HTML/CSS/JS eller enkel statisk generator (Astro eller Eleventy är okej), inget tungt ramverk.
- Sortimentet redigeras genom verkstadspanelen, `npm run admin` (`verktyg/`). Den körs bara lokalt på Sebastians dator, aldrig på webbhotellet, och bryter därför inte mot kravet ovan. `verktyg/` ligger utanför Eleventys indatamapp och byggs inte.
- Beställningar sker endast via hemsidan eller mejl (aldrig "i butiken"). Beställknappar och konfiguratorns "Skicka förfrågan" skickar till formulärtjänst som mejlar sebastian.myrdahl@gmail.com (Formspree eller motsvarande gratisnivå). Ingen kortbetalning, ingen varukorg: kunden skickar förfrågan, Sebastian svarar per mejl, betalning med Swish.
- Responsiv: katalograman och punktlinjerna ska fungera på mobil (enkolumn under ca 720 px).
- Sidfot på varje sida: "Beställningar görs här på hemsidan eller per mejl till sebastian.myrdahl@gmail.com." samt raden "SWISH · MOMSFRI FÖRSÄLJNING ENLIGT 18 KAP. MERVÄRDESSKATTELAGEN · STORA MELLÖSA"
- Domän: myrdahlstra.se, registrerad och live sedan 7 september 2026. Zonen ligger på Cloudflare, både apex och www pekar på Pages-projektet myrdahls-storefront. Hosting: Cloudflare Pages, inte webbhotell, eftersom beställningsformuläret behöver en funktion i functions/. Deploy sker med npm run deploy. Kanonisk adress är https://myrdahlstra.se utan www, den sätts i src/_data/site.json.
- Frakt i två nivåer efter vikt, beloppen i src/_data/site.json (fraktLiten, fraktStor, fraktGrans). En bräda väger 3,2 till 5,6 kg med kartong, vilket spänner över tre viktklasser.
- Sökmotorer: sidkarta och robots.txt byggs ur samma källor som sidorna (src/sitemap.njk, src/robots.njk). Strukturerad data i src/_includes/strukturerat.njk, Product med pris och lagerstatus på produktsidor, LocalBusiness på startsidan. Allt som står där måste också stå synligt på sidan. Sidor som inte ska indexeras sätter noindex: true i sin frontmatter. Katalogfotona skalas till 480 och 900 px i jpeg och avif av verktyg/bilder.js efter bygget, pekas ut med srcset via makrot i src/_includes/bild.njk, och cachas i .bildcache. Varianterna hamnar i _site och aldrig i assets/foto. Webp används inte, det blev större än mozjpeg på de här fotona. Typsnitten är självhostade i assets/fonts, inga anrop till Google. Cloudflare Web Analytics fungerar inte på en Pages-sajt: beaconen postar till /cdn-cgi/rum som svarar 404 där. Fyra vägar prövade, se README. Zonens RUM står på manuell och site.analys är tom, så sajten har noll externa anrop.
- Logotyp: assets/logga.png (transparent, mörk). Original i hög upplösning finns hos Sebastian.

## Skrivregler

- All text på svenska.
- Använd aldrig tankstreck i texter, skriv om med komma, kolon eller parentes i stället.
- Skriv ALDRIG "räddad ek", "räddat virke" eller liknande återbrukspåståenden, det kan inte garanteras. Säg "utvald bit för bit", "massiv ek", "handgjort i Stora Mellösa".
- Tonen är varm, saklig och hantverksnära, som en katalog från en riktig snickare, inte reklamspråk.
