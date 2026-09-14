/*
 * Tar emot bestallningar och forfragningar fran sajten.
 *
 * Tva mejl skickas via Resend:
 *   1. Notis till Sebastian, med kunden som svarsadress.
 *   2. Bekraftelse till kunden, om kunden lamnat en mejladress.
 *
 * Notisen ar det viktiga. Misslyckas bekraftelsen loggas det men kunden
 * skickas anda till tacksidan, for bestallningen har ju kommit fram.
 *
 * Ligger som en Pages Function, alltsa samma doman som sajten. Ingen egen
 * Worker, ingen CORS, en enda deploy.
 *
 * Miljovariabler pa Pages-projektet:
 *   RESEND_API_KEY  secret, nyckeln fran Resend. Enda som maste sattas.
 *   MOTTAGARE       dit notisen gar. Standard: sebastian.myrdahl@gmail.com
 *   AVSANDARE       Standard: Myrdahls Trä <bestallning@myrdahlstra.se>
 */

import { KONTAKTFALT, kundbrev, notisbrev } from '../../lib/brev.mjs';

const MAX_KROPP = 32 * 1024; // en bestallning ar text, inget mer behovs

// Tidsgrans mot Resend. Utan den kan en kund sitta med en snurrande sida till
// plattformen dödar begaran. Battre att svara med en lasbar sida och mejladress.
const TIDSGRANS_MS = 10000;


const STANDARD_MOTTAGARE = 'sebastian.myrdahl@gmail.com';
const STANDARD_AVSANDARE = 'Myrdahls Trä <bestallning@myrdahlstra.se>';

class ForStorKropp extends Error {}

// Content-Length ar bara en snabb kontroll. Rakna aven de mottagna byten
// och avbryt lasningen sa snart gransen overskrids, fore formData().
async function lasFormular(request) {
  const lasare = request.body?.getReader();
  const bitar = [];
  let storlek = 0;
  if (lasare) {
    try {
      while (true) {
        const { done, value } = await lasare.read();
        if (done) break;
        storlek += value.byteLength;
        if (storlek > MAX_KROPP) {
          await lasare.cancel().catch(() => {});
          throw new ForStorKropp();
        }
        bitar.push(value);
      }
    } finally {
      lasare.releaseLock();
    }
  }
  const kropp = new Uint8Array(storlek);
  let offset = 0;
  for (const bit of bitar) {
    kropp.set(bit, offset);
    offset += bit.byteLength;
  }
  return new Response(kropp, {
    headers: { 'Content-Type': request.headers.get('content-type') || '' }
  }).formData();
}

/* ---------- sidor ---------- */

// Enkel sida i katalogens stil, for de fall dar nagot gar fel
function svarssida(rubrik, text, mejl, status) {
  const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${rubrik} · Myrdahls Trä</title>
<style>
  body { margin:0; background:#F4EDDD; color:#2B2118;
         font-family:'EB Garamond',Georgia,serif; display:flex;
         min-height:100vh; align-items:center; justify-content:center; padding:24px; }
  .ruta { max-width:520px; text-align:center; border:1px solid #2B2118;
          outline:3px double #2B2118; outline-offset:4px; padding:40px 32px; }
  h1 { font-size:15px; letter-spacing:0.3em; color:#8a5a2c; font-weight:400; margin:0 0 18px 0; }
  p { font-size:19px; font-style:italic; line-height:1.6; color:#57503F; margin:0 0 18px 0; }
  a { color:#2B2118; }
</style></head>
<body><div class="ruta">
  <h1>${rubrik.toUpperCase()}</h1>
  <p>${text}</p>
  <p style="font-size:16px;font-style:normal">Skriv till <a href="mailto:${mejl}">${mejl}</a> eller <a href="/">gå tillbaka till katalogen</a>.</p>
</div></body></html>`;
  return new Response(html, {
    status: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

/* ---------- utskick ---------- */

async function skicka(nyckel, brev) {
  const svar = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + nyckel,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(brev),
    signal: AbortSignal.timeout(TIDSGRANS_MS)
  });

  if (!svar.ok) {
    throw new Error('Resend svarade ' + svar.status + ': ' + (await svar.text()));
  }
  return svar;
}

/* ---------- endpoint ---------- */

export async function onRequestPost(context) {
  const { request, env } = context;
  const mottagare = env.MOTTAGARE || STANDARD_MOTTAGARE;
  const avsandare = env.AVSANDARE || STANDARD_AVSANDARE;

  // Kroppen ska vara liten. En stor kropp ar antingen fel eller nagon som bokar.
  const langd = parseInt(request.headers.get('content-length') || '0', 10);
  if (langd > MAX_KROPP) {
    return svarssida('För stort', 'Meddelandet var för stort att ta emot.', mottagare, 413);
  }

  let falt;
  try {
    const data = await lasFormular(request);
    falt = {};
    for (const [k, v] of data.entries()) {
      if (typeof v === 'string') falt[k] = v.trim();
    }
  } catch (e) {
    if (e instanceof ForStorKropp) {
      return svarssida('För stort', 'Meddelandet var för stort att ta emot.', mottagare, 413);
    }
    return svarssida('Något gick fel', 'Formuläret kunde inte läsas.', mottagare, 400);
  }

  // Honungsfalla: bottar fyller i det dolda faltet. Svara som om allt gick bra,
  // sa de inte forsoker igen, men skicka ingenting.
  if (falt._gotcha) {
    return Response.redirect(new URL('/tack/', request.url).toString(), 303);
  }

  if (!falt.Namn || !falt[KONTAKTFALT]) {
    return svarssida('Fyll i lite mer',
      'Namn och en adress eller ett telefonnummer behövs för att jag ska kunna svara.',
      mottagare, 400);
  }

  if (!env.RESEND_API_KEY) {
    // Nyckeln saknas: sag det rakt ut i stallet for att tappa bestallningen tyst
    return svarssida('Formuläret är inte kopplat än',
      'Beställningen kunde inte skickas eftersom mejlkopplingen inte är färdig.',
      mottagare, 503);
  }

  // Notisen forst. Gar den inte fram har bestallningen inte kommit fram,
  // och da ska kunden veta det.
  try {
    await skicka(env.RESEND_API_KEY, notisbrev(falt, avsandare, mottagare));
  } catch (e) {
    console.error('Notis till Sebastian misslyckades: ' + e.message);
    return svarssida('Kunde inte skicka',
      'Beställningen gick inte fram just nu. Mejla gärna i stället, jag svarar lika snabbt.',
      mottagare, 502);
  }

  // Bekraftelsen till kunden ar en bonus. Misslyckas den har bestallningen
  // anda kommit fram, sa kunden ska inte se ett felmeddelande.
  const bekraftelse = kundbrev(falt, avsandare, mottagare);
  if (bekraftelse) {
    try {
      await skicka(env.RESEND_API_KEY, bekraftelse);
    } catch (e) {
      console.error('Bekräftelse till kunden misslyckades: ' + e.message);
    }
  }

  return Response.redirect(new URL('/tack/', request.url).toString(), 303);
}

// En GET pa endpointen ar ingen bestallning, skicka besokaren till katalogen
export async function onRequestGet(context) {
  return Response.redirect(new URL('/', context.request.url).toString(), 302);
}
