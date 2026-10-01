/*
 * Räknar var på sidan besökarna klickar, till värmekartan i verkstadspanelen.
 *
 * Inga kakor, ingen lagring i webbläsaren och inget besöks-id. Varje klick
 * skickas för sig och säger bara vilken sida, ungefär var på sidan, vad som
 * klickades på och om skärmen var smal eller bred. Två klick från samma
 * person går inte att knyta ihop, och därför behövs ingen kakruta.
 *
 * Läget räknas mot katalogramen och inte mot fönstret: sidan är centrerad
 * och ramen lika bred på alla datorskärmar över 1440 px, så samma klick
 * hamnar på samma ställe oavsett hur stor skärm besökaren har.
 *
 * Skriptet gör ingenting utanför den skarpa domänen, så förhandsvisningar
 * och panelens egen värmekarta inte räknas som besök.
 */
(function () {
  var skript = document.currentScript;
  var vard = skript && skript.getAttribute('data-vard');
  if (!vard || location.hostname.replace(/^www\./, '') !== vard) return;
  if (!navigator.sendBeacon) return;

  var MAL = 'a, button, summary, label, input, select, textarea';
  var MAX_PER_SIDA = 60; // ingen ska kunna fylla databasen genom att hamra
  var skickade = 0;
  var senasteEtikett = null;

  function text(el) {
    var t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t) {
      var bild = el.querySelector('img[alt]');
      if (bild) t = bild.alt;
    }
    return t.slice(0, 80);
  }

  // Vad som klickades, med ord. Fältens innehåll skickas aldrig, bara namnet.
  function beskriv(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      var etikett = el.labels && el.labels[0] ? text(el.labels[0]) : '';
      return { mal: 'fält: ' + (etikett || el.name || tag).slice(0, 72), till: '' };
    }
    var till = '';
    if (tag === 'a' && el.href) {
      var u = new URL(el.href, location.href);
      if (u.protocol === 'mailto:') till = 'mejl';
      else if (u.origin === location.origin) till = u.pathname + u.hash;
      else till = u.hostname;
    }
    return { mal: text(el) || tag, till: till.slice(0, 200) };
  }

  document.addEventListener('click', function (e) {
    if (skickade >= MAX_PER_SIDA) return;
    var ram = document.querySelector('.ram');
    if (!ram) return;
    var r = ram.getBoundingClientRect();
    var el = e.target.closest ? e.target.closest(MAL) : null;
    // En etikett klickar även sitt fält direkt efteråt. Räkna bara etiketten,
    // annars blir varje val i byggaren två klick.
    if (el && senasteEtikett && el.labels && Array.prototype.indexOf.call(el.labels, senasteEtikett) >= 0) return;
    if (el && el.tagName === 'LABEL') {
      senasteEtikett = el;
      setTimeout(function () { senasteEtikett = null; }, 0);
    }

    var data = el ? beskriv(el) : { mal: '', till: '' };
    data.sida = location.pathname;
    data.lage = window.innerWidth <= 720 ? 'mobil' : 'dator';
    // Tangentbordsklick har ingen plats på sidan, de räknas bara i listan.
    if (e.detail > 0) {
      data.x = Math.round((e.clientX - r.left) / r.width * 1000) / 1000;
      data.y = Math.round(e.clientY - r.top);
    }
    skickade += 1;
    navigator.sendBeacon('/api/klick', JSON.stringify(data));
  }, { capture: true, passive: true });
})();
