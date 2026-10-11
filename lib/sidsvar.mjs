/*
 * Det som formularfunktionerna under functions/api/ har gemensamt: en
 * felsida i katalogens stil, lasning av ett formular med storleksgrans och
 * utskick via Resend.
 *
 * Ligger utanfor functions/ med flit: allt under functions/ blir en endpoint.
 */

export const STANDARD_MOTTAGARE = 'sebastian.myrdahl@gmail.com';
export const STANDARD_AVSANDARE = 'Myrdahls Trä <bestallning@myrdahlstra.se>';

// Tidsgrans mot Resend. Utan den kan en kund sitta med en snurrande sida till
// plattformen dödar begaran. Battre att svara med en lasbar sida och mejladress.
const TIDSGRANS_MS = 10000;

export class ForStorKropp extends Error {}

// Content-Length ar bara en snabb kontroll. Rakna aven de mottagna byten
// och avbryt lasningen sa snart gransen overskrids, fore formData().
export async function lasFormular(request, max) {
  const lasare = request.body?.getReader();
  const bitar = [];
  let storlek = 0;
  if (lasare) {
    try {
      while (true) {
        const { done, value } = await lasare.read();
        if (done) break;
        storlek += value.byteLength;
        if (storlek > max) {
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

// Enkel sida i katalogens stil, for de fall dar nagot gar fel
export function svarssida(rubrik, text, mejl, status) {
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

export async function skickaMejl(nyckel, brev) {
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
