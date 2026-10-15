'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fragaD1Wrangler } = require('../verktyg/admin.js');

// Så som wrangler 4 skriver ett fel med --json: på stdout, och inget på stderr
const jsonfel = (kod, not) => '\n' + JSON.stringify({
  error: {
    text: 'A request to the Cloudflare API (/accounts/x/d1/database/y/query) failed.',
    notes: [{ text: not + ' [code: ' + kod + ']' }],
    kind: 'error', name: 'APIError', code: kod
  }
}, null, 2) + '\n';
const OBEHORIG = jsonfel(7403, 'The given account is not valid or is not authorized to access this service');
const misslyckad = (ut, felut = '') => ({
  // execFile lägger hela kommandoraden, SQL-frågan med, först i meddelandet
  err: Object.assign(new Error('Command failed: node wrangler.js d1 execute --command SELECT hemligt\n' + felut), { code: 1 }),
  ut, felut
});
const lyckad = (...listor) => ({ err: null, ut: JSON.stringify(listor.map((results) => ({ results }))), felut: '' });

// Svarar i tur och ordning med svaren och minns pauserna
function attrapp(...svar) {
  const korningar = [];
  const pauser = [];
  return {
    korningar, pauser,
    kor: async (rot, sql) => { korningar.push(sql); return svar.shift(); },
    vanta: async (ms) => { pauser.push(ms); }
  };
}

test('ett lyckat svar ger raderna för varje fråga', async () => {
  const a = attrapp(lyckad([{ id: 1 }], [{ kod: 'x' }, { kod: 'y' }]));
  assert.deepEqual(await fragaD1Wrangler('rot', 'SELECT 1', a), [[{ id: 1 }], [{ kod: 'x' }, { kod: 'y' }]]);
  assert.deepEqual(a.pauser, []);
});

test('7403 direkt efter en förnyad inloggning: samma fråga igen efter en paus', async () => {
  const a = attrapp(misslyckad(OBEHORIG), lyckad([{ id: 1 }]));
  assert.deepEqual(await fragaD1Wrangler('rot', 'DELETE FROM omdome WHERE id = 1', a), [[{ id: 1 }]]);
  assert.deepEqual(a.korningar, ['DELETE FROM omdome WHERE id = 1', 'DELETE FROM omdome WHERE id = 1']);
  assert.equal(a.pauser.length, 1);
});

test('7403 som inte går över ger Cloudflares förklaring och vad som hjälper', async () => {
  const a = attrapp(misslyckad(OBEHORIG), misslyckad(OBEHORIG), misslyckad(OBEHORIG));
  await assert.rejects(fragaD1Wrangler('rot', 'SELECT 1', a), (e) => {
    assert.match(e.message, /^Wrangler kunde inte fråga databasen: /);
    assert.match(e.message, /not authorized to access this service \[code: 7403\]/);
    assert.match(e.message, /wrangler login/);
    assert.doesNotMatch(e.message, /Command failed|hemligt/);
    return true;
  });
  assert.equal(a.korningar.length, 3);
  // Pauserna växer, så att tre försök täcker de sekunder det brukar ta
  assert.ok(a.pauser[1] > a.pauser[0]);
});

test('andra fel från D1 försöks inte igen och visar D1:s förklaring', async () => {
  const a = attrapp(misslyckad(jsonfel(7500, 'no such table: finnsinte: SQLITE_ERROR')));
  await assert.rejects(fragaD1Wrangler('rot', 'SELECT * FROM finnsinte', a),
    /Wrangler kunde inte fråga databasen: no such table: finnsinte: SQLITE_ERROR \[code: 7500\]$/);
  assert.equal(a.korningar.length, 1);
  assert.deepEqual(a.pauser, []);
});

test('fel utan JSON: raden som säger vad som hände, aldrig kommandoraden', async () => {
  const a = attrapp(misslyckad('', '▲ [WARNING] gammal version\n✘ [ERROR] Not logged in.\n'));
  await assert.rejects(fragaD1Wrangler('rot', 'SELECT 1', a), /: ✘ \[ERROR\] Not logged in\.$/);

  const b = attrapp(misslyckad('', ''));
  await assert.rejects(fragaD1Wrangler('rot', 'SELECT 1', b), (e) => {
    assert.doesNotMatch(e.message, /Command failed|hemligt/);
    assert.match(e.message, /kod 1/);
    return true;
  });
});

test('en wrangler som inte svarar inom tiden sägs som det är', async () => {
  const a = attrapp({ err: Object.assign(new Error('Command failed: SELECT hemligt'), { killed: true, code: null }), ut: '', felut: '' });
  await assert.rejects(fragaD1Wrangler('rot', 'SELECT 1', a), (e) => {
    assert.match(e.message, /svarade inte/);
    assert.doesNotMatch(e.message, /hemligt/);
    return true;
  });
});
