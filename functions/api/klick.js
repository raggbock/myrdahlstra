/*
 * Tar emot klick från assets/klick.js och lägger dem i D1-databasen
 * myrdahls-klick, till värmekartan i verkstadspanelen.
 *
 * Bara det skriptet skickar sparas: sida, läge (mobil eller dator), plats på
 * sidan, vad som klickades och dagen. Ingen IP-adress, ingen webbläsare,
 * inget klockslag, inget som kan knyta två klick till samma person.
 *
 * Svaret är alltid 204 utan innehåll. Besökaren märker ingenting av mätningen,
 * inte ens när något går fel, och den som skickar skräp får ingen ledtråd.
 *
 * Bindningen KLICK sätts i wrangler.toml. Saknas den sparas ingenting.
 */

const MAX_KROPP = 1024;
const SPARAS_DAGAR = 180;

const tomt = () => new Response(null, { status: 204 });

// Text från besökaren: bara en sträng, utan styrtecken, högst max tecken
function strang(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

// Gör om det som skickats till en rad, eller null om det inte ser ut som
// ett klick från sajten.
function rensa(data) {
  if (!data || typeof data !== 'object') return null;
  const sida = strang(data.sida, 200);
  if (!sida.startsWith('/')) return null;
  if (data.lage !== 'mobil' && data.lage !== 'dator') return null;

  let x = null;
  let y = null;
  if (data.x != null || data.y != null) {
    // Utanför ramen men på sidan är tillåtet, en bit åt sidorna och uppåt
    if (typeof data.x !== 'number' || !(data.x >= -0.5 && data.x <= 1.5)) return null;
    if (!Number.isInteger(data.y) || data.y < -500 || data.y > 50000) return null;
    x = Math.round(data.x * 1000) / 1000;
    y = data.y;
  }

  return { sida, lage: data.lage, x, y, mal: strang(data.mal, 80), till: strang(data.till, 200) };
}

// Bara klick från sajtens egna sidor. sendBeacon skickar alltid Origin på
// en POST, och en främmande sida kan inte sätta den till vår domän.
function franSajten(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch (e) {
    return false;
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  if (!env.KLICK || !franSajten(request)) return tomt();
  if (Number(request.headers.get('content-length') || 0) > MAX_KROPP) return tomt();

  let rad;
  try {
    const text = await request.text();
    if (text.length > MAX_KROPP) return tomt();
    rad = rensa(JSON.parse(text));
  } catch (e) {
    return tomt();
  }
  if (!rad) return tomt();

  const skriv = (async () => {
    try {
      await env.KLICK.prepare(
        "INSERT INTO klick (dag, sida, lage, x, y, mal, till) VALUES (date('now'), ?, ?, ?, ?, ?, ?)"
      ).bind(rad.sida, rad.lage, rad.x, rad.y, rad.mal, rad.till).run();
      // Gamla klick städas bort då och då, inte vid varje anrop
      if (Math.random() < 0.01) {
        await env.KLICK.prepare("DELETE FROM klick WHERE dag < date('now', ?)")
          .bind('-' + SPARAS_DAGAR + ' days').run();
      }
    } catch (e) {
      console.error('Klicket kunde inte sparas:', e.message);
    }
  })();
  if (waitUntil) waitUntil(skriv); else await skriv;
  return tomt();
}
