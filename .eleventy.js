const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const Konfigurator = require('./assets/konfigurator.js');
const Sortiment = require('./lib/sortiment.js');
const Fotomatt = require('./lib/fotomatt.js');

/*
 * Lägger innehållets fingeravtryck sist i adressen: /assets/style.css blir
 * /assets/style.css?v=8f3c1a2b.
 *
 * Cloudflare säger åt webbläsaren att spara filerna i fyra timmar. HTML:en
 * sparas inte alls, så utan detta kan en besökare som var inne före en
 * uppdatering få den nya sidan tillsammans med det gamla skriptet och den
 * gamla stilmallen. Då slutar sidan fungera på ett sätt som inte syns hos
 * den som bygger den, för hens webbläsare hämtade allt samtidigt.
 *
 * Ändras filen ändras fingeravtrycket, och då är det en ny adress som
 * ingen cache känner igen.
 */
function medVersion(adress) {
  const fil = path.join(__dirname, adress.replace(/^\//, ''));
  const summa = crypto.createHash('sha1').update(fs.readFileSync(fil)).digest('hex');
  return adress + '?v=' + summa.slice(0, 8);
}

module.exports = function (eleventyConfig) {
  // Bara det sajten faktiskt anvander laddas upp. Rakopiering av hela assets/
  // skulle ta med obehandlade originalfoton i assets/images/ och dra upp
  // uppladdningen till tiotalet megabyte i onodan.
  eleventyConfig.addPassthroughCopy('assets/logga.png');
  eleventyConfig.addPassthroughCopy('assets/favicon.svg');
  eleventyConfig.addPassthroughCopy('assets/favicon.png');
  eleventyConfig.addPassthroughCopy('assets/style.css');
  eleventyConfig.addPassthroughCopy('assets/konfigurator.js');
  eleventyConfig.addPassthroughCopy('assets/foto');
  eleventyConfig.addPassthroughCopy('assets/fonts');

  // Stilmallen och skriptet hämtas med innehållets fingeravtryck i adressen,
  // och det avtrycket sitter i HTML:en. Utan den här raden bygger inte
  // utvecklingsservern om sidorna när bara en fil i assets/ ändras, och då
  // pekar sidan på ett gammalt avtryck som webbläsaren redan har cachat.
  eleventyConfig.addWatchTarget('./assets/');

  // 1650 blir "1 650 kr", samma formatering som konfiguratorn
  eleventyConfig.addFilter('pris', (belopp) => Konfigurator.formatera(belopp));

  /*
   * När en sidas innehåll senast ändrades, till sidkartan.
   *
   * Datumet räknas ur källfilerna sidan byggs av, inte ur byggtiden. Sätter
   * man byggdatum på allt säger man till sökmotorn att hela sajten ändras
   * varje gång något laddas upp, och då slutar den tro på uppgiften. Google
   * ignorerar lastmod som inte verkar stämma.
   */
  eleventyConfig.addFilter('andrad', (filer) => {
    let senast = 0;
    for (const f of [].concat(filer)) {
      try {
        const tid = fs.statSync(path.join(__dirname, f)).mtimeMs;
        if (tid > senast) senast = tid;
      } catch (e) {
        // En källa som inte finns säger ingenting om datumet.
      }
    }
    return senast ? new Date(senast).toISOString().slice(0, 10) : '';
  });

  // Ett katalogfotos mått och variantadresser, se lib/fotomatt.js
  eleventyConfig.addFilter('foto', (fil) => Fotomatt.foto(fil));

  // Stilmall och skript hämtas med innehållets fingeravtryck i adressen
  eleventyConfig.addFilter('version', medVersion);

  // Bara brädor som går att köpa, sorterade på N:o
  eleventyConfig.addFilter('tillSalu', (produkter) => Sortiment.tillSalu(produkter));

  // Ritar en bräda som SVG. Korten i byggaren är dekor, inte information:
  // kortets egen text säger redan vad det är, så skärmläsaren hoppar över dem.
  eleventyConfig.addFilter('brada', (val, kolumner, rader) =>
    Konfigurator.rita(val, { kolumner: kolumner, rader: rader, ranna: false, dekor: true })
  );

  // Sålda brädor som fortfarande ligger inom sin vecka med bandet. Fönstret
  // räknas ut här vid bygget, så listan ändras först vid nästa uppladdning.
  eleventyConfig.addFilter('nyssSalda', (produkter) => Sortiment.nyssSalda(produkter));

  // Hela katalogen i nummerordning, sålda inräknade så länge de syns
  eleventyConfig.addFilter('katalog', (produkter) => Sortiment.katalog(produkter));

  // Brädor att länka vidare till från en brädas egen sida
  eleventyConfig.addFilter('andraBrador', (produkter, slug, antal) =>
    Sortiment.andraBrador(produkter, slug, antal)
  );

  return {
    dir: {
      input: 'src',
      includes: '_includes',
      data: '_data',
      output: '_site'
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk'
  };
};
