'use strict';

/*
 * Verkstadspanelen. Lokal server for att lagga in och redigera bradorna.
 *
 * Kors med: npm run admin
 *
 * Ligger medvetet utanfor src/, sa Eleventy varken bygger eller kopierar den.
 * Den ska aldrig hamna pa webbhotellet.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');

const P = require('./produkter.js');
const S = require('../lib/sortiment.js');
const Foto = require('./foto.js');

const PORT = 4322;
const VARD = '127.0.0.1'; // aldrig 0.0.0.0, panelen skriver filer
function skapaServer({ rot = path.join(__dirname, '..'), foto = Foto,
  byggSajt, skrivProdukter = P.skriv } = {}) {
  const F = foto;
  const ROT = rot;
  const PRODUKTFIL = path.join(ROT, 'src', '_data', 'products.json');
  const PROCESSFIL = path.join(ROT, 'src', '_data', 'process.json');
  const FOTOMAPP = path.join(ROT, 'assets', 'foto');

  // Uppladdade original ligger i minnet tills de sparas, sa reglaget kan
  // forhandsvisa utan att skicka upp filen en gang till.
  const original = new Map();
  let sparar = false;

  /* ---------- hjalpare ---------- */

  function json(res, kod, data) {
    const kropp = JSON.stringify(data);
    res.writeHead(kod, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(kropp)
    });
    res.end(kropp);
  }

  function lasKropp(req) {
    return new Promise((klar, fel) => {
      const bitar = [];
      let storlek = 0;
      req.on('data', (b) => {
        storlek += b.length;
        if (storlek > 60 * 1024 * 1024) {
          fel(new Error('Filen är för stor, max 60 MB.'));
          req.destroy();
          return;
        }
        bitar.push(b);
      });
      req.on('end', () => klar(Buffer.concat(bitar)));
      req.on('error', fel);
    });
  }

  // Skydd mot att en illvillig webbsida i samma webblasare skriver i dina filer.
  // Panelens egen JS satter huvudet, en frammande sida kan inte gora det utan
  // att forst fa ett CORS-godkannande som vi aldrig ger.
  function franPanelen(req) {
    return req.headers['x-panel'] === '1';
  }

  function fotolista() {
    try {
      return fs.readdirSync(FOTOMAPP).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort();
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  function nyttFilnamn(slug, finns) {
    for (let i = 1; i < 500; i += 1) {
      const namn = slug + '-' + i + '.jpg';
      if (!finns.has(namn)) {
        finns.add(namn);
        return namn;
      }
    }
    throw new Error('Hittade inget ledigt filnamn för ' + slug);
  }

  function bygg() {
    return new Promise((klar) => {
      const p = spawn('npm', ['run', 'build'], { cwd: ROT, shell: true });
      let ut = '';
      p.stdout.on('data', (d) => { ut += d; });
      p.stderr.on('data', (d) => { ut += d; });
      p.on('error', (e) => klar({ ok: false, utskrift: e.message }));
      p.on('close', (kod) => klar({ ok: kod === 0, utskrift: ut.trim() }));
    });
  }

  /* ---------- endpoints ---------- */

  async function hamtaAllt(res) {
    const produkter = P.las(PRODUKTFIL);
    // Fotoserien på ändträsidan hör inte till någon bräda men är i bruk, och
    // ska inte ligga i panelen som något att städa bort.
    const serie = P.las(PROCESSFIL);
    const anvanda = new Set(
      produkter.flatMap((x) => x.bilder || []).concat((serie.steg || []).map((s) => s.fil))
    );
    const alla = fotolista();
    json(res, 200, {
      produkter,
      foton: alla,
      oanvandaFoton: alla.filter((f) => !anvanda.has(f)),
      // Panelen visar hur lange bandet sitter kvar. Antalet dagar star i
      // lib/sortiment.js, sa panelen slipper ha en egen kopia som glider isar.
      visningsdagar: S.VISNINGSDAGAR
    });
  }

  async function laggUppBild(req, res) {
    const buf = await lasKropp(req);
    if (buf.length === 0) return json(res, 400, { fel: ['Tom fil.'] });

    let m;
    try {
      m = await F.matt(buf);
    } catch (e) {
      return json(res, 400, { fel: ['Kunde inte läsa bilden: ' + e.message] });
    }

    const id = crypto.randomUUID();
    original.set(id, buf);
    json(res, 200, { id, bredd: m.bredd, hojd: m.hojd });
  }

  async function forhandsvisa(req, res, id, offset) {
    const buf = original.get(id);
    if (!buf) return json(res, 404, { fel: ['Bilden finns inte kvar, ladda upp den igen.'] });

    const ut = await F.forhandsvisning(buf, offset);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': ut.length });
    res.end(ut);
  }

  async function spara(req, res) {
    if (sparar) return json(res, 409, { fel: ['En sparning pågår redan. Försök igen när den är klar.'] });
    sparar = true;
    try {
      let data;
      try {
        data = JSON.parse((await lasKropp(req)).toString('utf8'));
      } catch (e) {
        return json(res, 400, { fel: ['Sparningen innehöll ogiltig data.'] });
      }
      if (!data || !Array.isArray(data.produkter)) {
        return json(res, 400, { fel: ['Produktlistan saknas.'] });
      }
      const inkommande = data.produkter;

      // Validera allt innan nagot skrivs. Halva sparningar vill vi inte ha.
      const fel = [];
      inkommande.forEach((b, i) => {
        const ovriga = inkommande.filter((_, j) => j !== i);
        for (const f of P.validera(b, ovriga.filter(Boolean))) {
          fel.push('N:o ' + (b && b.nr) + ': ' + f);
        }
      });
      if (fel.length) return json(res, 400, { fel });

      // Kontrollera alla uppladdningar innan behandling eller skrivning borjar.
      for (const b of inkommande) {
        if (b.bilder != null && !Array.isArray(b.bilder)) {
          return json(res, 400, { fel: ['Bildlistan är ogiltig.'] });
        }
        for (const bild of b.bilder || []) {
          if (typeof bild !== 'string' && (!bild || !original.has(bild.bildId))) {
            return json(res, 400, { fel: ['En uppladdad bild försvann, ladda upp den igen.'] });
          }
        }
      }

      // Forbered allt i minnet. Originalen behalls tills produktfilen ar sparad,
      // sa en misslyckad behandling eller skrivning kan forsokas igen.
      const finns = new Set(fotolista());
      const nyaBilder = [];
      for (const b of inkommande) {
        const klara = [];
        for (const bild of b.bilder || []) {
          if (typeof bild === 'string') {
            klara.push(bild);
            continue;
          }
          const buf = original.get(bild.bildId);
          const namn = nyttFilnamn(b.slug, finns);
          nyaBilder.push({ namn, id: bild.bildId, data: await F.behandla(buf, bild.offset) });
          klara.push(namn);
        }
        b.bilder = klara;
      }

      fs.mkdirSync(FOTOMAPP, { recursive: true });
      const skapade = [];
      try {
        for (const bild of nyaBilder) {
          const fil = path.join(FOTOMAPP, bild.namn);
          // Skriv aldrig over ett befintligt foto, inte heller vid namnkonflikt.
          const fd = fs.openSync(fil, 'wx');
          skapade.push(fil);
          try { fs.writeFileSync(fd, bild.data); } finally { fs.closeSync(fd); }
        }
        skrivProdukter(PRODUKTFIL, inkommande);
      } catch (e) {
        for (const fil of skapade) fs.unlinkSync(fil);
        throw e;
      }
      for (const bild of nyaBilder) original.delete(bild.id);
      const resultat = await (byggSajt || bygg)();
      json(res, 200, { produkter: inkommande, bygge: resultat });
    } finally {
      sparar = false;
    }
  }

  function statisk(res, fil, typ) {
    fs.readFile(path.join(__dirname, fil), (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Kunde inte läsa ' + fil);
        return;
      }
      res.writeHead(200, { 'Content-Type': typ, 'Content-Length': data.length });
      res.end(data);
    });
  }

  /* ---------- servern ---------- */

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://' + VARD);
      const väg = u.pathname;

      if (req.method === 'GET' && (väg === '/' || väg === '/index.html')) {
        return statisk(res, 'panel.html', 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && väg === '/panel.js') {
        return statisk(res, 'panel.js', 'text/javascript; charset=utf-8');
      }
      if (req.method === 'GET' && väg === '/favicon.ico') {
        const logga = fs.readFileSync(path.join(ROT, 'assets', 'logga.png'));
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': logga.length });
        return res.end(logga);
      }
      if (req.method === 'GET' && väg === '/api/allt') {
        return await hamtaAllt(res);
      }

      // Allt som skriver kraver panelens eget huvud
      if (req.method === 'POST' && !franPanelen(req)) {
        return json(res, 403, { fel: ['Anropet kom inte från panelen.'] });
      }

      if (req.method === 'POST' && väg === '/api/bild') {
        return await laggUppBild(req, res);
      }
      if (req.method === 'POST' && väg === '/api/spara') {
        return await spara(req, res);
      }

      const fv = väg.match(/^\/api\/bild\/([0-9a-f-]+)\/forhandsvisning$/);
      if (req.method === 'POST' && fv) {
        return await forhandsvisa(req, res, fv[1], parseFloat(u.searchParams.get('offset') || '0.5'));
      }

      json(res, 404, { fel: ['Okänd adress: ' + väg] });
    } catch (e) {
      json(res, 500, { fel: [e.message] });
    }
  });
  return server;
}

if (require.main === module) skapaServer().listen(PORT, VARD, () => {
  console.log('Verkstadspanelen: http://localhost:' + PORT);
  console.log('Förhandsvisning av sajten: kör "npm start" i ett annat fönster.');
});

module.exports = { skapaServer };
