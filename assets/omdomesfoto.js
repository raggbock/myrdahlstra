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
