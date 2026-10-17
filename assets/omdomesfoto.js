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
 *
 * Knappen stängs aldrig av. En telefon kan behöva flera sekunder på
 * krympningen, och fotofältet ligger precis ovanför knappen: en avstängd
 * knapp såg ut som vanligt och svalde trycket utan ett ord. Trycker kunden
 * medan fotot förbereds väntar formuläret i stället och skickas när det är
 * klart. Blir krympningen aldrig klar ger skriptet upp efter TIDSGRANS.
 */
(function () {
  var falt = document.getElementById('foto');
  if (!falt || typeof createImageBitmap !== 'function' || typeof DataTransfer !== 'function') return;

  var MAX_SIDA = 1600;
  var MAX_BYTE = 1500000;
  var KVALITETER = [0.85, 0.7, 0.55];
  var TIDSGRANS = 20000;

  var formular = falt.form;
  var status = document.querySelector('[data-fotostatus]');
  var visning = document.querySelector('[data-fotovisning]');
  var forhand = visning.querySelector('img');
  var taBort = document.querySelector('[data-fototabort]');
  var felrad = document.querySelector('[data-fotofel]');
  var adress = null;
  // Räknas upp vid varje nytt val och vid Ta bort fotot. En krympning som
  // blir klar efter att kunden valt om lämnar fältet i fred, annars kunde
  // fotot kunden just bytt bort följa med.
  var omgang = 0;
  // Sant medan ett foto krymps, och skicka om kunden tryckt under tiden
  var pagar = false;
  var skicka = false;

  function visaFel(text) {
    felrad.textContent = text || '';
    felrad.hidden = !text;
  }

  function visaStatus(text) {
    status.textContent = text || '';
    status.hidden = !text;
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

  function inomTid(lofte) {
    return Promise.race([lofte, new Promise(function (_, nej) {
      setTimeout(function () { nej(new Error('tidsgrans')); }, TIDSGRANS);
    })]);
  }

  function klar(denna, gick) {
    if (denna !== omgang) return;
    pagar = false;
    visaStatus('');
    var nu = skicka;
    skicka = false;
    // Misslyckades det står felet kvar, och kunden väljer själv om
    // omdömet ska gå utan foto
    if (!nu || !gick) return;
    if (formular.requestSubmit) formular.requestSubmit(); else formular.submit();
  }

  falt.addEventListener('change', function () {
    var fil = falt.files && falt.files[0];
    omgang += 1;
    var denna = omgang;
    visaFel('');
    if (!fil) {
      pagar = false;
      skicka = false;
      visaStatus('');
      visaForhand(null);
      return;
    }
    pagar = true;
    visaStatus('Fotot förbereds …');
    inomTid(krymp(fil)).then(function (blob) {
      if (denna !== omgang) return false;
      if (!blob) {
        tom();
        visaFel('Fotot blev för stort även efter krympning. Välj en annan bild, eller skicka utan foto.');
        return false;
      }
      var ny = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
      var lista = new DataTransfer();
      lista.items.add(ny);
      falt.files = lista.files;
      visaForhand(ny);
      return true;
    }, function (e) {
      if (denna !== omgang) return false;
      tom();
      visaFel(e && e.message === 'tidsgrans'
        ? 'Fotot gick inte att förbereda i den här webbläsaren. Välj en annan bild, eller skicka utan foto.'
        : 'Den här bildtypen går inte att läsa här. Välj en JPEG, eller skicka utan foto.');
      return false;
    }).then(function (gick) {
      klar(denna, gick);
    });
  });

  // Medan fotot krymps får originalet inte följa med, det kan vara för stort
  formular.addEventListener('submit', function (e) {
    if (!pagar) return;
    e.preventDefault();
    skicka = true;
    visaStatus('Fotot förbereds, omdömet skickas när det är klart …');
  });

  taBort.addEventListener('click', function () {
    omgang += 1;
    pagar = false;
    skicka = false;
    visaStatus('');
    tom();
    visaFel('');
    falt.focus();
  });
})();
