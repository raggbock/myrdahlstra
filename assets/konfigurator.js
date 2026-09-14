/*
 * Skärbrädsbyggaren: mönster, träslag, storlek och saftränna.
 *
 * ================== PRISLISTA, ÄNDRA HÄR ==================
 * Detta är enda stället priserna står. Samma tabell används av
 * webbläsaren, av bygget när alternativkorten ritas, och av testen.
 * Priserna är fastställda av Sebastian 2026-09-04, mönstertilläggen
 * 2026-09-07.
 * ==========================================================
 *
 * Filen ritar också brädan. En färdig ändträbräda är rutor, inte långa
 * stavar: stavarna kapas och vänds ett kvarts varv, så det är ändytan man
 * ser. Ritningen görs som SVG av ren strängbyggnad, utan DOM, så att bygget
 * kan lägga in samma bild i sidan som webbläsaren sedan ritar om. Slumpen i
 * ådringen kommer ur en heltalshash, aldrig ur Math.random eller Math.sin,
 * så att bygget och webbläsaren ritar exakt samma bräda.
 */
(function (root) {
  'use strict';

  /* ---------- prislista ---------- */

  var TRASLAG = [
    {
      id: 'ek',
      namn: 'Ek',
      tillagg: 'grundpris',
      plus: 0,
      bas: '#a97c46',
      adring: '#8a6238'
    },
    {
      id: 'ask',
      namn: 'Ask',
      tillagg: 'grundpris',
      plus: 0,
      bas: '#cbb188',
      adring: '#a98d63'
    },
    {
      id: 'lonn',
      namn: 'Lönn',
      tillagg: 'plus 100 kr',
      plus: 100,
      bas: '#e2d0aa',
      adring: '#c2ac82'
    },
    {
      id: 'valnot',
      namn: 'Valnöt',
      tillagg: 'plus 300 kr',
      plus: 300,
      bas: '#573b26',
      adring: '#3d2717'
    }
  ];

  /*
   * platser är hur många träslag kunden väljer. Naturlig har noll, för då
   * väljer Sebastian i verkstaden. Murstenen har tre: två till stenarna och
   * ett till bruket emellan.
   *
   * fog är brukets bredd i ritningen, som andel av en rutas höjd. För de
   * vanliga mönstren är det bara en limfog i bläck. För murstenen är fogen
   * ett eget träslag, och då behöver den vara bred nog att synas som virke.
   *
   * stavform är stavens bredd delat med dess höjd. Murstenen har liggande
   * stenar, resten kvadratiska stavar.
   */
  var MONSTER = [
    {
      id: 'naturlig',
      namn: 'Naturlig',
      beskrivning: 'du överlåter mönstret till mig',
      platser: 0,
      tillagg: 'grundpris',
      plus: 0,
      fog: 0.03,
      stavform: 1
    },
    {
      id: 'hel',
      namn: 'Hel',
      beskrivning: 'ett träslag rakt igenom',
      platser: 1,
      tillagg: 'grundpris',
      plus: 0,
      fog: 0.03,
      stavform: 1
    },
    {
      id: 'rander',
      namn: 'Ränder',
      beskrivning: 'två träslag i lodräta rader',
      platser: 2,
      tillagg: 'plus 200 kr',
      plus: 200,
      fog: 0.03,
      stavform: 1
    },
    {
      id: 'rutor',
      namn: 'Rutmönster',
      beskrivning: 'varannan ruta, som ett schackbräde',
      platser: 2,
      tillagg: 'plus 400 kr',
      plus: 400,
      fog: 0.03,
      stavform: 1
    },
    {
      id: 'mursten',
      namn: 'Mursten',
      beskrivning: 'liggande stenar i två träslag, med bruk i ett tredje',
      platser: 3,
      tillagg: 'plus 400 kr',
      plus: 400,
      fog: 0.16,
      stavform: 2
    }
  ];

  /*
   * Basutbudet stannar vid 32 cm i bredd. Planhyveln tar 33 cm, så en bredare
   * bräda måste limmas av två plattor efter hyvlingen. Det går att göra, men
   * det är betydligt mer arbete, så bredare mått prisas för sig efter mejl i
   * stället för att ligga här. Slaktarbrädan växer på längden i stället.
   */
  var STORLEKAR = [
    { id: '4026', namn: '40 × 26 cm', beskrivning: 'liten', langd: 40, bredd: 26, bas: 1750 },
    { id: '4530', namn: '45 × 30 cm', beskrivning: 'standard', langd: 45, bredd: 30, bas: 2000 },
    { id: '5032', namn: '50 × 32 cm', beskrivning: 'stor', langd: 50, bredd: 32, bas: 2250 },
    { id: '6032', namn: '60 × 32 cm', beskrivning: 'slaktarbräda', langd: 60, bredd: 32, bas: 2750 }
  ];

  /*
   * namn står på kortet, svar är det som följer med i mejlet. Utan den
   * delningen får du raden "Saftränna: Med saftränna, plus 150 kr" i
   * beställningen, alltså både en upprepning och ett pris mitt i.
   */
  var RANNA = [
    { id: 'nej', namn: 'Utan', svar: 'Nej', plus: 0 },
    { id: 'ja', namn: 'Med saftränna, plus 150 kr', svar: 'Ja', plus: 150 }
  ];

  // Standardvalet, det som visas innan kunden rört något.
  var STANDARD = { monster: 'rutor', traA: 'ek', traB: 'valnot', traC: 'lonn', storlek: '4530', ranna: false };

  var NBSP = ' ';

  /* ---------- val och pris ---------- */

  function hitta(lista, id, fallbackId) {
    var i;
    for (i = 0; i < lista.length; i += 1) {
      if (lista[i].id === id) {
        return lista[i];
      }
    }
    for (i = 0; i < lista.length; i += 1) {
      if (lista[i].id === fallbackId) {
        return lista[i];
      }
    }
    return lista[0];
  }

  function normalisera(val) {
    var v = val || {};
    return {
      monster: hitta(MONSTER, v.monster, STANDARD.monster),
      traA: hitta(TRASLAG, v.traA, STANDARD.traA),
      traB: hitta(TRASLAG, v.traB, STANDARD.traB),
      traC: hitta(TRASLAG, v.traC, STANDARD.traC),
      storlek: hitta(STORLEKAR, v.storlek, STANDARD.storlek),
      ranna: hitta(RANNA, v.ranna === true ? 'ja' : v.ranna === false ? 'nej' : v.ranna, STANDARD.ranna ? 'ja' : 'nej')
    };
  }

  /*
   * Träslagen som mönstret faktiskt använder. Ett mönster tittar bara på så
   * många platser som det har, och samma träslag på två platser betalas en
   * gång: det är ett träslag att köpa hem, inte två. Naturlig har noll
   * platser och alltså inga träslagstillägg, för då är det verkstadens lager
   * som avgör, inte kunden.
   */
  function traslagIVal(n) {
    var platser = [n.traA, n.traB, n.traC].slice(0, n.monster.platser);
    var unika = [];
    var i;
    var j;
    var finns;

    for (i = 0; i < platser.length; i += 1) {
      finns = false;
      for (j = 0; j < unika.length; j += 1) {
        if (unika[j].id === platser[i].id) {
          finns = true;
        }
      }
      if (!finns) {
        unika.push(platser[i]);
      }
    }
    return unika;
  }

  function berakna(val) {
    var n = normalisera(val);
    var summa = n.storlek.bas + n.monster.plus + n.ranna.plus;
    var tra = traslagIVal(n);
    var i;
    for (i = 0; i < tra.length; i += 1) {
      summa += tra[i].plus;
    }
    return summa;
  }

  function formatera(belopp) {
    var heltal = String(Math.round(belopp));
    var ut = '';
    var i;
    for (i = 0; i < heltal.length; i += 1) {
      if (i > 0 && (heltal.length - i) % 3 === 0) {
        ut += NBSP;
      }
      ut += heltal.charAt(i);
    }
    return ut + ' kr';
  }

  // "Ek", "Ek och valnöt", "Ek, valnöt och lönn". Naturlig nämner inga
  // träslag alls, de bestäms av vad som finns hemma när brädan görs.
  function traslagText(n) {
    var tra = traslagIVal(n);
    var namn = [];
    var i;

    if (tra.length === 0) {
      return 'Väljs i verkstaden';
    }
    for (i = 0; i < tra.length; i += 1) {
      namn.push(i === 0 ? tra[i].namn : tra[i].namn.toLowerCase());
    }
    if (namn.length === 1) {
      return namn[0];
    }
    return namn.slice(0, -1).join(', ') + ' och ' + namn[namn.length - 1];
  }

  function sammanfatta(val) {
    var n = normalisera(val);
    return {
      monster: n.monster.namn,
      traslag: traslagText(n),
      storlek: n.storlek.namn,
      ranna: n.ranna.plus > 0 ? 'Ja' : 'Nej',
      pris: formatera(berakna(val)),
      bild: rita(val)
    };
  }

  /* ---------- ritningen ---------- */

  /*
   * Heltalshash, 0 till 1. Math.imul räknar exakt i 32 bitar överallt, till
   * skillnad från Math.sin vars sista decimaler får skilja mellan motorer.
   * Det spelar roll här: bygget ritar brädan en gång och webbläsaren ritar om
   * den, och ådringen ska inte hoppa till när sidan vaknar.
   */
  function hash(a, b, c) {
    var h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263) ^ Math.imul(c + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  function avr(n) {
    return Math.round(n * 10) / 10;
  }

  // Ljusar upp eller mörkar en färg. Varje stav kommer ur sin egen bit virke,
  // så rutorna får aldrig vara exakt lika.
  function skift(hex, faktor) {
    var n = parseInt(hex.slice(1), 16);
    var delar = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    var ut = '#';
    var i;
    var v;
    for (i = 0; i < 3; i += 1) {
      v = Math.round(delar[i] * faktor);
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      ut += (v < 16 ? '0' : '') + v.toString(16);
    }
    return ut;
  }

  // Vilket träslag en ruta får. Det är här mönstret bor.
  function rutansTra(monsterId, rad, kol, n) {
    if (monsterId === 'hel') {
      return n.traA;
    }
    if (monsterId === 'naturlig') {
      // Ingen har valt något, så staven får det virke som råkar ligga
      // överst. Hashen gör slumpen till samma slump varje gång.
      return TRASLAG[Math.floor(hash(kol, 0, 11) * TRASLAG.length) % TRASLAG.length];
    }
    if (monsterId === 'rander') {
      return kol % 2 === 0 ? n.traA : n.traB;
    }
    // Rutmönster och mursten varvar åt båda hållen. Skillnaden är att
    // murstenens rader är förskjutna en halv sten, vilket sker i rita.
    return (rad + kol) % 2 === 0 ? n.traA : n.traB;
  }

  /*
   * Kolumnernas kanter. Vanliga mönster har lika breda stavar. Naturlig har
   * det inte: den limmas av det som finns, och då blir stavarna olika breda.
   * Bredderna kommer ur hashen, så samma bräda ritas likadant varje gång.
   */
  function kolumnkanter(monsterId, W, cw) {
    var kanter = [0];
    var x = 0;
    var i = 0;

    if (monsterId !== 'naturlig') {
      while (x < W - 0.5) {
        x = Math.min(W, x + cw);
        kanter.push(x);
      }
      return kanter;
    }

    while (x < W - cw * 0.35) {
      x += cw * (0.6 + 0.9 * hash(i, 0, 21));
      i += 1;
      kanter.push(Math.min(W, x));
    }
    kanter[kanter.length - 1] = W;
    return kanter;
  }

  // Ändytan på en stav: grundton med lite variation, och några årsringar.
  function ruta(x, y, w, h, tra, rad, kol) {
    var ut = '';
    var ton = skift(tra.bas, 0.94 + 0.12 * hash(kol, rad, 1));
    var antal = 2 + Math.floor(hash(kol, rad, 2) * 2);
    var vand = hash(kol, rad, 9) > 0.5 ? -1 : 1;
    var i;
    var dy;
    var bukt;

    ut += '<rect x="' + avr(x) + '" y="' + avr(y) + '" width="' + avr(w) +
      '" height="' + avr(h) + '" fill="' + ton + '"/>';

    for (i = 0; i < antal; i += 1) {
      dy = h * (0.24 + 0.25 * i + 0.08 * hash(kol, rad, 3 + i));
      bukt = h * (0.09 + 0.07 * hash(kol, rad, 6 + i)) * vand;
      ut += '<path d="M' + avr(x + w * 0.07) + ' ' + avr(y + dy) +
        'Q' + avr(x + w / 2) + ' ' + avr(y + dy - bukt) +
        ' ' + avr(x + w * 0.93) + ' ' + avr(y + dy) + '"/>';
    }

    return ut;
  }

  /*
   * Ritar brädan uppifrån som SVG-sträng.
   *
   * opts.kolumner och opts.rader styr rutnätet för de små korten, annars
   * räknas det ur måtten med rutor på ungefär fyra centimeter.
   * opts.ranna satt till false ritar aldrig ränna, oavsett vad kunden valt.
   */
  function rita(val, opts) {
    var n = normalisera(val);
    var o = opts || {};

    var langd = o.langd || n.storlek.langd;
    var bredd = o.bredd || n.storlek.bredd;
    var W = langd * 10;
    var H = bredd * 10;

    var murar = n.monster.id === 'mursten';

    // Stavarna är kvadratiska på ungefär fyra centimeter, utom murstenens
    // som är liggande: lika höga, dubbelt så breda.
    var rader = o.rader || Math.max(3, Math.round(bredd / 4));
    var ch = H / rader;
    var kolumner = o.kolumner || Math.max(3, Math.round(W / (ch * n.monster.stavform)));
    var cw = W / kolumner;

    var visaRanna = o.ranna === false ? false : n.ranna.plus > 0;

    // Bruket är ett eget träslag, alltså riktiga remsor virke mellan stenarna
    // och inte ett streck. Stenarna dras in en halv brukbredd på varje sida,
    // precis som en sten sitter indragen i sin fog i en mur.
    var brukbredd = murar ? ch * n.monster.fog : 0;

    // Id:t måste vara unikt på sidan men får inte räknas upp, för då skulle
    // bygget och webbläsaren hamna på olika nummer. Innehållet räcker: två
    // likadana brädor kan dela klippbana utan att det märks.
    var id = 'bb-' + n.monster.id + '-' + n.traA.id + '-' + n.traB.id + '-' + n.traC.id +
      '-' + kolumner + 'x' + rader + (visaRanna ? '-r' : '');

    var etikett = '';
    var rutor = '';
    var fogar = '';
    var kanter;
    var rad;
    var kol;
    var start;
    var x;
    var w;
    var tra;

    if (!o.dekor) {
      etikett = 'Skiss av brädan: ' + n.monster.namn.toLowerCase() +
        (n.monster.platser > 0 ? ' i ' + traslagText(n).toLowerCase() : '') +
        ', ' + n.storlek.namn + (visaRanna ? ', med saftränna' : '');
    }

    function stav(x, y, w, h, tra, rad, kol) {
      return '<g stroke="' + tra.adring + '" stroke-width="' +
        avr(Math.max(0.8, ch * 0.028)) + '" stroke-opacity="0.5" fill="none">' +
        ruta(x, y, w, h, tra, rad, kol) + '</g>';
    }

    // Bruket ligger underst som en hel yta i sitt träslag. Stenarna läggs
    // ovanpå med en glipa runt om, och det som lyser igenom är bruket.
    if (murar) {
      for (rad = 0; rad < rader; rad += 1) {
        for (kol = 0; kol < kolumner; kol += 1) {
          // Egna hashnummer, annars får bruket samma ådring som stenen ovanpå.
          rutor += stav(kol * cw, rad * ch, cw, ch, n.traC, rad + 40, kol + 40);
        }
      }
    }

    for (rad = 0; rad < rader; rad += 1) {
      // Murstenens udda rader börjar en halv sten utanför kanten, så att
      // skiften förskjuts mot varandra som i en riktig mur.
      start = murar && rad % 2 === 1 ? -cw / 2 : 0;
      kanter = kolumnkanter(n.monster.id, W - start, cw);

      for (kol = 0; kol < kanter.length - 1; kol += 1) {
        x = start + kanter[kol];
        w = kanter[kol + 1] - kanter[kol];
        tra = rutansTra(n.monster.id, rad, kol, n);

        rutor += stav(
          x + brukbredd / 2,
          rad * ch + brukbredd / 2,
          w - brukbredd,
          ch - brukbredd,
          tra,
          rad,
          kol
        );

        // Limfogen till vänster om staven, utom vid brädans kant. Murstenen
        // har inga: där är bruket självt fogen.
        if (x > 0 && !murar) {
          fogar += '<path d="M' + avr(x) + ' ' + avr(rad * ch) + 'v' + avr(ch) + '"/>';
        }
      }
    }

    if (!murar) {
      for (rad = 1; rad < rader; rad += 1) {
        fogar += '<path d="M0 ' + avr(rad * ch) + 'H' + avr(W) + '"/>';
      }
    }

    var ranna = '';
    var inatt;
    if (visaRanna) {
      inatt = Math.min(W, H) * 0.075;
      ranna = '<rect x="' + avr(inatt) + '" y="' + avr(inatt) +
        '" width="' + avr(W - 2 * inatt) + '" height="' + avr(H - 2 * inatt) +
        '" rx="' + avr(inatt * 0.7) + '" fill="none" stroke="#2B2118" stroke-opacity="0.42" stroke-width="' +
        avr(Math.max(2, H * 0.012)) + '"/>';
    }

    return '<svg class="bradbild" viewBox="0 0 ' + avr(W) + ' ' + avr(H) + '" ' +
      (o.dekor ? 'aria-hidden="true" focusable="false"' : 'role="img" aria-label="' + etikett + '"') +
      ' xmlns="http://www.w3.org/2000/svg">' +
      '<defs><clipPath id="' + id + '"><rect x="0" y="0" width="' + avr(W) +
      '" height="' + avr(H) + '" rx="6"/></clipPath></defs>' +
      '<g clip-path="url(#' + id + ')">' + rutor +
      '<g fill="none" stroke="#2B2118" stroke-opacity="0.3" stroke-width="' +
      avr(Math.max(1, ch * n.monster.fog)) + '" stroke-linecap="square">' + fogar + '</g>' +
      ranna +
      '</g>' +
      '<rect x="0.5" y="0.5" width="' + avr(W - 1) + '" height="' + avr(H - 1) +
      '" rx="6" fill="none" stroke="#2B2118" stroke-width="1.5"/>' +
      '</svg>';
  }

  var api = {
    DEFINITIONER: {
      traslag: TRASLAG,
      monster: MONSTER,
      storlekar: STORLEKAR,
      ranna: RANNA,
      standard: STANDARD
    },
    berakna: berakna,
    formatera: formatera,
    sammanfatta: sammanfatta,
    rita: rita
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.Konfigurator = api;

  /* ---------- Koppling mot sidan, hoppas över utanför webbläsaren ---------- */

  if (typeof document === 'undefined') {
    return;
  }

  function koppla() {
    var form = document.querySelector('[data-konfigurator]');
    if (!form) {
      return;
    }

    // Fältens value är läslig text så mejlet går att förstå utan JS.
    // Nyckeln som prislistan använder ligger i data-id.
    function nyckel(falt, standard) {
      if (!falt) {
        return standard;
      }
      return falt.getAttribute('data-id') || falt.value;
    }

    function las() {
      return {
        monster: nyckel(form.querySelector('input[name="Mönster"]:checked'), STANDARD.monster),
        traA: nyckel(form.querySelector('input[name="Träslag"]:checked'), STANDARD.traA),
        traB: nyckel(form.querySelector('input[name="Andra träslaget"]:checked'), STANDARD.traB),
        traC: nyckel(form.querySelector('input[name="Träslag i bruket"]:checked'), STANDARD.traC),
        storlek: nyckel(form.querySelector('input[name="Storlek"]:checked'), STANDARD.storlek),
        ranna: nyckel(form.querySelector('input[name="Saftränna"]:checked'), STANDARD.ranna ? 'ja' : 'nej')
      };
    }

    function skriv(namn, text) {
      var ut = form.querySelector('[data-ut="' + namn + '"]');
      if (ut) {
        ut.textContent = text;
      }
    }

    var traplatser = form.querySelectorAll('[data-traplats]');
    var traplatstext = form.querySelector('[data-traplatstext]');
    var naturligtext = form.querySelector('[data-naturligtext]');
    var monsterbilder = form.querySelectorAll('[data-monsterbild]');

    // Mönsterkorten ritas om i kundens egna träslag, annars väljer hen mönster
    // på en bild som visar helt andra träslag än brädan hen håller på att bygga.
    function ritaOmKorten(val, platser) {
      // Har mönstret inga platser är träslagsvalen gömda, och då vore det
      // förvirrande att rita korten i virke kunden varken ser eller kan
      // ändra. Då får korten standardträslagen i stället.
      var tra = platser > 0 ? val : STANDARD;
      var i;

      for (i = 0; i < monsterbilder.length; i += 1) {
        monsterbilder[i].innerHTML = rita(
          {
            monster: monsterbilder[i].getAttribute('data-monsterbild'),
            traA: tra.traA,
            traB: tra.traB,
            traC: tra.traC,
            storlek: '4026'
          },
          { kolumner: 4, rader: 3, ranna: false, dekor: true }
        );
      }
    }

    function uppdatera() {
      var val = las();
      var n = normalisera(val);
      var s = sammanfatta(val);
      var bild = form.querySelector('[data-ut="bild"]');
      var dolt = form.querySelector('input[name="Cirkapris"]');
      var falt;
      var behovs;
      var i;
      var j;

      skriv('monster', s.monster);
      skriv('traslag', s.traslag);
      skriv('storlek', s.storlek);
      skriv('ranna', s.ranna);
      skriv('pris', s.pris);
      skriv('total-liten', formatera(berakna(val) + Number(form.getAttribute('data-frakt-liten'))));
      skriv('total-stor', formatera(berakna(val) + Number(form.getAttribute('data-frakt-stor'))));
      skriv('total-hamtning', s.pris);

      if (bild) {
        bild.innerHTML = s.bild;
      }

      ritaOmKorten(val, n.monster.platser);

      // Mönstret bestämmer hur många träslag som ska väljas: naturlig noll,
      // hel ett, ränder och rutmönster två, murstenen tre. Platser som inte
      // behövs göms och kopplas ur, annars följer ett träslag med i mejlet
      // som inte finns på brädan.
      for (i = 0; i < traplatser.length; i += 1) {
        behovs = Number(traplatser[i].getAttribute('data-traplats')) <= n.monster.platser;
        traplatser[i].hidden = !behovs;
        falt = traplatser[i].querySelectorAll('input');
        for (j = 0; j < falt.length; j += 1) {
          falt[j].disabled = !behovs;
        }
      }

      if (traplatstext) {
        traplatstext.hidden = n.monster.platser < 2;
      }
      if (naturligtext) {
        naturligtext.hidden = n.monster.platser > 0;
      }

      // Följer med i mejlet så beställningen går att läsa utan att gissa.
      if (dolt) {
        dolt.value = s.pris;
      }
    }

    form.addEventListener('change', uppdatera);
    uppdatera();
  }

  /*
   * Länken /bestallning/#skriv ska landa i meddelandeläget. Växlingen mellan
   * lägena görs annars helt i CSS, det här är den enda biten som behöver
   * skript. Utan skript visas byggaren, vilket inte är trasigt, bara ett klick
   * ifrån.
   */
  function kopplaLage() {
    if (window.location.hash !== '#skriv') {
      return;
    }
    var val = document.querySelector('input[name="lage"][value="meddelande"]');
    var mal = document.getElementById('skriv');
    if (!val || !mal) {
      return;
    }
    val.checked = true;
    // Webbläsaren hann inte rulla dit, målet var gömt när sidan laddades.
    mal.scrollIntoView();
  }

  function start() {
    koppla();
    kopplaLage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
