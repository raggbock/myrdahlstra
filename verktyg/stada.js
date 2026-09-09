// Tommer _site fore bygget och rapporterar de salda bradorna.
//
// Eleventy skriver nya filer men tar inte bort gamla. Utan detta ligger sidan
// for en borttagen eller omdopt brada kvar i _site och foljer med nasta
// uppladdning, alltsa kvar live pa sajten.
const fs = require('fs');
const path = require('path');

const S = require('../lib/sortiment.js');

fs.rmSync('_site', { recursive: true, force: true });
console.log('_site tomd');

/* Salda brador ligger kvar i katalogen med sitt band en vecka, raknat fran
   saldDatum. Fonstret rakas fram har vid bygget, inte hos besokaren, sa en
   brada faller ur katalogen forst vid det bygge som gors efter att veckan
   tagit slut. Darfor skrivs laget ut: da syns det att det ar dags att bygga
   och ladda upp igen. */
function rapporteraSalda() {
  const fil = path.join(__dirname, '..', 'src', '_data', 'products.json');

  let produkter;
  try {
    produkter = JSON.parse(fs.readFileSync(fil, 'utf8'));
  } catch (e) {
    // Bygget far gnalla om filen sjalvt, stadningen ska inte stoppa det.
    return;
  }

  const salda = (produkter || []).filter((p) => p.sald);
  if (salda.length === 0) return;

  for (const b of salda) {
    const kvar = S.dagarKvar(b);
    let lage;

    if (kvar === null) {
      lage = 'saknar saldDatum, bandet blir kvar tills datum fylls i';
    } else if (kvar > 1) {
      lage = 'bandet visas ' + kvar + ' dagar till';
    } else if (kvar === 1) {
      lage = 'bandet visas sista dagen i morgon';
    } else if (kvar === 0) {
      lage = 'bandet visas sista dagen i dag';
    } else {
      lage = 'veckan är slut, faller ur katalogen i det här bygget';
    }

    console.log('såld: N:o ' + b.nr + ' ' + b.titel + ', ' + lage);
  }
}

rapporteraSalda();
