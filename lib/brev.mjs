/*
 * Bygger mejlen som formularet skickar. Ren logik, inga anrop, inga globaler
 * fran Workers, sa den gar att testa rakt av.
 *
 * Ligger utanfor functions/ med flit: allt under functions/ blir en endpoint
 * hos Cloudflare Pages, och den har filen ska inte vara nabar utifran.
 * Andelsen .mjs gor den till ESM oavsett vad package.json sager.
 */

// Falt som styr formularet och inte hor i mejlet
const INTERNA = new Set(['_gotcha', '_subject', '_next']);

export const KONTAKTFALT = 'Mejl eller telefon';

export function arMejl(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// "Namn: Anna" per rad. Tomma och interna falt hoppas over.
export function raderAv(falt, uteslut) {
  const bort = new Set([...INTERNA, ...(uteslut || [])]);
  return Object.entries(falt || {})
    .filter(([k, v]) => !bort.has(k) && String(v || '').trim() !== '')
    .map(([k, v]) => k + ': ' + v)
    .join('\n');
}

// Notisen till Sebastian. Svarar han pa den hamnar svaret hos kunden.
export function notisbrev(falt, avsandare, mottagare) {
  const brev = {
    from: avsandare,
    to: [mottagare],
    subject: String(falt._subject || '').trim() || 'Ny förfrågan från myrdahlstra.se',
    text: raderAv(falt) + '\n\nSkickat från formuläret på sajten.\n'
  };

  const kontakt = falt[KONTAKTFALT];
  if (arMejl(kontakt)) brev.reply_to = [kontakt.trim()];

  return brev;
}

// Bekraftelsen till kunden. Null om kunden inte lamnat nagon mejladress,
// till exempel bara ett telefonnummer.
export function kundbrev(falt, avsandare, svarsadress) {
  const kontakt = falt[KONTAKTFALT];
  if (!arMejl(kontakt)) return null;

  // Kunden vet vad hen heter och hur hen gar att na, sa de raderna utesluts
  const sammanfattning = raderAv(falt, ['Namn', KONTAKTFALT]);
  const tilltal = String(falt.Namn || '').trim().split(/\s+/)[0] || 'och tack';

  // Finns inget att lista, till exempel om kunden bara fyllt i namn och
  // mejladress, ska rubriken inte sta kvar och peka pa tomhet.
  const inledning = sammanfattning
    ? ['tack för din förfrågan. Det här kom in:', '', sammanfattning]
    : ['tack för din förfrågan.'];

  const text = [
    'Hej ' + tilltal + ',',
    '',
    ...inledning,
    '',
    'Jag läser den och svarar personligen inom ett par dagar, med bekräftelse,',
    'leveranstid och Swishnummer. Du binder dig inte förrän vi kommit överens.',
    '',
    'Sebastian, Stora Mellösa',
    'myrdahlstra.se',
    ''
  ].join('\n');

  return {
    from: avsandare,
    to: [kontakt.trim()],
    // bestallning@myrdahlstra.se kan skicka men inte ta emot, sa ett svar dit
    // skulle studsa. Svar ska ga till Sebastian.
    reply_to: [svarsadress],
    subject: 'Tack för din förfrågan, Myrdahls Trä',
    text: text
  };
}
