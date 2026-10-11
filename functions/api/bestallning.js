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
 *
 * Standardadresserna, felsidan och utskicket ligger i lib/sidsvar.mjs, som
 * delas med omdömesfunktionen.
 */

import { KONTAKTFALT, kundbrev, notisbrev } from '../../lib/brev.mjs';
import { STANDARD_MOTTAGARE, STANDARD_AVSANDARE, ForStorKropp, lasFormular, svarssida, skickaMejl }
  from '../../lib/sidsvar.mjs';

const MAX_KROPP = 32 * 1024; // en bestallning ar text, inget mer behovs

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
    const data = await lasFormular(request, MAX_KROPP);
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
    await skickaMejl(env.RESEND_API_KEY, notisbrev(falt, avsandare, mottagare));
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
      await skickaMejl(env.RESEND_API_KEY, bekraftelse);
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
