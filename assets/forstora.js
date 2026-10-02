/*
 * Visar brädans foto i full storlek i en ruta på sidan.
 *
 * Fotot på brädsidan är beskuret till ramen. Varje stort foto är därför en
 * länk till originalet, och utan det här skriptet öppnas originalet som en
 * vanlig bild. Med skriptet öppnas det i stället i dialogrutan i brada.njk.
 * Esc stänger, liksom ett klick bredvid fotot eller på Stäng.
 */
(function () {
  var ruta = document.getElementById('forstoring');
  if (!ruta || typeof ruta.showModal !== 'function') return;
  var bild = ruta.querySelector('img');

  document.addEventListener('click', function (e) {
    var lank = e.target.closest && e.target.closest('a[data-forstora]');
    // Ctrl- eller mittenklick ska fortfarande öppna originalet i en ny flik
    if (!lank || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    bild.src = lank.href;
    bild.alt = lank.getAttribute('data-alt') || '';
    ruta.showModal();
  });

  ruta.addEventListener('click', function (e) {
    if (e.target === ruta || e.target.closest('[data-stang]')) ruta.close();
  });

  // Nästa foto ska inte blinka fram över det förra
  ruta.addEventListener('close', function () {
    bild.removeAttribute('src');
  });
})();
