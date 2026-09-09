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
const F = require('./foto.js');

const PORT = 4322;
const VARD = '127.0.0.1'; // aldrig 0.0.0.0, panelen skriver filer
const ROT = path.join(__dirname, '..');
const PRODUKTFIL = path.join(ROT, 'src', '_data', 'products.json');
const FOTOMAPP = path.join(ROT, 'assets', 'foto');

// Uppladdade original ligger i minnet tills de sparas, sa reglaget kan
// forhandsvisa utan att skicka upp filen en gang till.
const original = new Map();

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

function nyttFilnamn(slug) {
  const finns = new Set(fotolista());
  for (let i = 1; i < 500; i += 1) {
    const namn = slug + '-' + i + '.jpg';
    if (!finns.has(namn)) return namn;
  }
  throw new Error('Hittade inget ledigt filnamn för ' + slug);
}

function bygg() {
  return new Promise((klar) => {
    const p = spawn('npm', ['run', 'build'], { cwd: ROT, shell: true });
    let ut = '';
    p.stdout.on('data', (d) => { ut += d; });
    p.stderr.on('data', (d) => { ut += d; });
    p.on('close', (kod) => klar({ ok: kod === 0, utskrift: ut.trim() }));
  });
}

/* ---------- endpoints ---------- */

async function hamtaAllt(res) {
  const produkter = P.las(PRODUKTFIL);
  const anvanda = new Set(produkter.flatMap((x) => x.bilder || []));
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
  const data = JSON.parse((await lasKropp(req)).toString('utf8'));
  const inkommande = Array.isArray(data.produkter) ? data.produkter : [];

  // Validera allt innan nagot skrivs. Halva sparningar vill vi inte ha.
  const fel = [];
  inkommande.forEach((b, i) => {
    const ovriga = inkommande.filter((_, j) => j !== i);
    for (const f of P.validera(b, ovriga, b.nr)) {
      fel.push('N:o ' + b.nr + ': ' + f);
    }
  });
  if (fel.length) return json(res, 400, { fel });

  // Los ut nya bilder: {bildId, offset} blir en fil pa disk.
  fs.mkdirSync(FOTOMAPP, { recursive: true });
  for (const b of inkommande) {
    const klara = [];
    for (const bild of b.bilder || []) {
      if (typeof bild === 'string') {
        klara.push(bild);
        continue;
      }
      const buf = original.get(bild.bildId);
      if (!buf) {
        return json(res, 400, { fel: ['En uppladdad bild försvann, ladda upp den igen.'] });
      }
      const namn = nyttFilnamn(b.slug);
      fs.writeFileSync(path.join(FOTOMAPP, namn), await F.behandla(buf, bild.offset));
      original.delete(bild.bildId);
      klara.push(namn);
    }
    b.bilder = klara;
  }

  P.skriv(PRODUKTFIL, inkommande);
  const resultat = await bygg();
  json(res, 200, { produkter: inkommande, bygge: resultat });
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
  const u = new URL(req.url, 'http://' + VARD);
  const väg = u.pathname;

  try {
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
      return hamtaAllt(res);
    }

    // Allt som skriver kraver panelens eget huvud
    if (req.method === 'POST' && !franPanelen(req)) {
      return json(res, 403, { fel: ['Anropet kom inte från panelen.'] });
    }

    if (req.method === 'POST' && väg === '/api/bild') {
      return laggUppBild(req, res);
    }
    if (req.method === 'POST' && väg === '/api/spara') {
      return spara(req, res);
    }

    const fv = väg.match(/^\/api\/bild\/([0-9a-f-]+)\/forhandsvisning$/);
    if (req.method === 'POST' && fv) {
      return forhandsvisa(req, res, fv[1], parseFloat(u.searchParams.get('offset') || '0.5'));
    }

    json(res, 404, { fel: ['Okänd adress: ' + väg] });
  } catch (e) {
    json(res, 500, { fel: [e.message] });
  }
});

server.listen(PORT, VARD, () => {
  console.log('Verkstadspanelen: http://localhost:' + PORT);
  console.log('Förhandsvisning av sajten: kör "npm start" i ett annat fönster.');
});
