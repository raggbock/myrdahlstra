/*
 * Tar emot omdömen från skrivsidan /omdome/.
 *
 * Bara den som har en kod från en inbjudan kan skriva. Sebastian skapar
 * inbjudan i verkstadspanelen och klistrar in länken i mejlet efter
 * leveransen. Varje kod ger ett omdöme.
 *
 * Omdömet läggs i D1-databasen (bindning KLICK, samma som klicken) och
 * väntar där tills Sebastian har läst det i panelen. Först då hamnar det i
 * src/_data/omdomen.json och på sajten, se db/omdome.sql.
 *
 * Ingen IP-adress och ingen webbläsaruppgift sparas, bara det kunden själv
 * skrev och dagen.
 *
 * Miljövariabler: RESEND_API_KEY, MOTTAGARE och AVSANDARE, samma som för
 * beställningarna. Saknas nyckeln sparas omdömet ändå, men ingen notis går.
 */

import { STANDARD_MOTTAGARE, STANDARD_AVSANDARE, ForStorKropp, lasFormular, svarssida, skickaMejl }
  from '../../lib/sidsvar.mjs';

const MAX_KROPP = 8 * 1024;
const KOD = /^[A-Za-z0-9_-]{12}$/;

// En rad: namn och ort. Styrtecken och radbrytningar blir mellanslag.
function rad(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Brödtext: stycken behålls, men aldrig mer än en tom rad i följd.
function stycke(v) {
  return String(v == null ? '' : v)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Formulärets fält som ett omdöme, eller { fel } med en mening till kunden
function rensa(falt) {
  const kod = rad(falt.kod);
  if (!KOD.test(kod)) return { fel: 'Koden från mejlet saknas eller är felskriven. Använd länken i mejlet, så fylls den i av sig själv.' };
  if (!/^[1-5]$/.test(rad(falt.betyg))) return { fel: 'Välj ett betyg, från en till fem stjärnor.' };
  const namn = rad(falt.namn);
  if (!namn) return { fel: 'Skriv vad du vill stå som, till exempel ditt förnamn.' };
  if (namn.length > 40) return { fel: 'Namnet får vara högst 40 tecken.' };
  const ort = rad(falt.ort);
  if (ort.length > 40) return { fel: 'Orten får vara högst 40 tecken.' };
  const text = stycke(falt.text);
  if (text.length < 10) return { fel: 'Skriv minst några ord om brädan.' };
  if (text.length > 1500) return { fel: 'Texten får vara högst 1 500 tecken.' };
  return { kod, betyg: Number(rad(falt.betyg)), namn, ort, text };
}

// Bara från sajtens egen skrivsida. En främmande sida kan inte sätta Origin
// till vår domän.
function franSajten(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch (e) {
    return false;
  }
}

function notis(omdome, mal, avsandare, mottagare) {
  const vad = mal === 'bestallning' ? 'en bräda efter mått' : 'brädan ' + mal;
  return {
    from: avsandare,
    to: [mottagare],
    subject: 'Nytt omdöme väntar, ' + omdome.betyg + ' av 5',
    text: 'Ett omdöme har kommit in för ' + vad + ', från ' + omdome.namn + '.\n\n' +
      'Läs det i verkstadspanelen (npm run admin, sedan Omdömen) och publicera eller avslå.\n'
  };
}

export async function onRequestPost({ request, env, waitUntil }) {
  const mottagare = env.MOTTAGARE || STANDARD_MOTTAGARE;
  const avsandare = env.AVSANDARE || STANDARD_AVSANDARE;
  const fel = (rubrik, text, status) => svarssida(rubrik, text, mottagare, status);

  if (!franSajten(request)) {
    return fel('Något gick fel', 'Omdömet måste skickas från sidan på myrdahlstra.se.', 403);
  }
  if (!env.KLICK) {
    return fel('Omdömen tas inte emot just nu', 'Omdömet kunde inte sparas. Mejla det gärna i stället, då lägger jag in det.', 503);
  }
  if (parseInt(request.headers.get('content-length') || '0', 10) > MAX_KROPP) {
    return fel('För långt', 'Omdömet var för långt att ta emot.', 413);
  }

  let omdome;
  try {
    const data = await lasFormular(request, MAX_KROPP);
    const falt = {};
    for (const [k, v] of data.entries()) if (typeof v === 'string') falt[k] = v;
    omdome = rensa(falt);
  } catch (e) {
    if (e instanceof ForStorKropp) return fel('För långt', 'Omdömet var för långt att ta emot.', 413);
    return fel('Något gick fel', 'Formuläret kunde inte läsas.', 400);
  }
  if (omdome.fel) return fel('Fyll i lite mer', omdome.fel, 400);

  try {
    const inbjudan = await env.KLICK.prepare('SELECT mal, anvand FROM inbjudan WHERE kod = ?')
      .bind(omdome.kod).first();
    if (!inbjudan) {
      return fel('Länken känns inte igen', 'Koden finns inte. Kontrollera att hela länken från mejlet kom med.', 400);
    }
    const anvand = () => fel('Länken är redan använd',
      'Ett omdöme har redan skickats med den här länken. Vill du ändra något, mejla mig.', 410);
    if (inbjudan.anvand) return anvand();

    // Båda i en transaktion, och båda bara om koden fortfarande är oanvänd.
    // Två samtidiga försök kan då aldrig ge två omdömen.
    const [insatt] = await env.KLICK.batch([
      env.KLICK.prepare(
        "INSERT INTO omdome (kod, mal, betyg, namn, ort, text, dag) " +
        "SELECT kod, mal, ?, ?, ?, ?, date('now') FROM inbjudan WHERE kod = ? AND anvand IS NULL"
      ).bind(omdome.betyg, omdome.namn, omdome.ort, omdome.text, omdome.kod),
      env.KLICK.prepare("UPDATE inbjudan SET anvand = date('now') WHERE kod = ? AND anvand IS NULL")
        .bind(omdome.kod)
    ]);
    if (!insatt.meta.changes) return anvand();

    // Notisen är en bekvämlighet. Omdömet är redan sparat, så ett fel här
    // ska kunden inte märka.
    if (env.RESEND_API_KEY) {
      const skick = skickaMejl(env.RESEND_API_KEY, notis(omdome, inbjudan.mal, avsandare, mottagare))
        .catch((e) => console.error('Notis om omdöme misslyckades: ' + e.message));
      if (waitUntil) waitUntil(skick); else await skick;
    }
  } catch (e) {
    console.error('Omdömet kunde inte sparas: ' + e.message);
    return fel('Kunde inte spara', 'Omdömet gick inte att spara just nu. Försök igen om en stund, eller mejla det.', 500);
  }

  return Response.redirect(new URL('/omdome/tack/', request.url).toString(), 303);
}

// En GET på endpointen är inget omdöme, skicka besökaren till skrivsidan
export async function onRequestGet({ request }) {
  return Response.redirect(new URL('/omdome/', request.url).toString(), 302);
}
