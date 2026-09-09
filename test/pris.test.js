'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Konfigurator = require('../assets/konfigurator.js');

// Hart mellanslag som tusenavskiljare, samma som sv-SE anvander.
const NBSP = ' ';

/* Priset ar bas for storleken, plus monstret, plus varje traslag som
   monstret faktiskt anvander, plus eventuell saftranna. */

test('grundpris per storlek, hel brada i ek', () => {
  const hel = { monster: 'hel', traA: 'ek', ranna: false };
  assert.equal(Konfigurator.berakna({ ...hel, storlek: '4026' }), 1750);
  assert.equal(Konfigurator.berakna({ ...hel, storlek: '4530' }), 2000);
  assert.equal(Konfigurator.berakna({ ...hel, storlek: '5032' }), 2250);
  assert.equal(Konfigurator.berakna({ ...hel, storlek: '6032' }), 2750);
});

test('tillagg for traslag', () => {
  const hel = { monster: 'hel', storlek: '4530', ranna: false };
  assert.equal(Konfigurator.berakna({ ...hel, traA: 'ek' }), 2000);
  assert.equal(Konfigurator.berakna({ ...hel, traA: 'ask' }), 2000);
  assert.equal(Konfigurator.berakna({ ...hel, traA: 'lonn' }), 2100);
  assert.equal(Konfigurator.berakna({ ...hel, traA: 'valnot' }), 2300);
});

test('tillagg for monster', () => {
  // Allt i ek, sa att bara monstrets eget tillagg skiljer raderna at.
  const ek = { traA: 'ek', traB: 'ek', traC: 'ek', storlek: '4530', ranna: false };
  assert.equal(Konfigurator.berakna({ ...ek, monster: 'naturlig' }), 2000);
  assert.equal(Konfigurator.berakna({ ...ek, monster: 'hel' }), 2000);
  assert.equal(Konfigurator.berakna({ ...ek, monster: 'rander' }), 2200);
  assert.equal(Konfigurator.berakna({ ...ek, monster: 'rutor' }), 2400);
  assert.equal(Konfigurator.berakna({ ...ek, monster: 'mursten' }), 2400);
});

test('bada traslagen betalas i ett monster med tva platser', () => {
  const bas = { monster: 'rutor', storlek: '4530', ranna: false };
  // 2000 + 400 for rutmonstret + 0 for ek + 300 for valnot
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'ek', traB: 'valnot' }), 2700);
  // ... och ordningen spelar ingen roll
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'valnot', traB: 'ek' }), 2700);
  // 2000 + 400 + 100 for lonn + 300 for valnot
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'lonn', traB: 'valnot' }), 2800);
});

test('murstenen har tre platser: tva stenar och ett bruk', () => {
  const bas = { monster: 'mursten', storlek: '4530', ranna: false };
  // 2000 + 400 for mursten + 0 for ek + 300 for valnot + 100 for lonn
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'ek', traB: 'valnot', traC: 'lonn' }), 2800);
  // Bruket i samma traslag som en av stenarna kostar inget extra
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'ek', traB: 'valnot', traC: 'ek' }), 2700);
});

test('naturlig har inga traslagstillagg, for kunden valjer inget traslag', () => {
  const bas = { monster: 'naturlig', storlek: '4530', ranna: false };
  assert.equal(Konfigurator.berakna(bas), 2000);
  // Valen ligger kvar i formularet men ska inte kosta nagot
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'valnot', traB: 'valnot', traC: 'valnot' }), 2000);
});

test('naturlig ar det billigaste monstret', () => {
  const minst = { monster: 'naturlig', storlek: '4026', ranna: false };
  const pris = Konfigurator.berakna(minst);
  assert.equal(pris, 1750);

  for (const m of Konfigurator.DEFINITIONER.monster) {
    for (const t of Konfigurator.DEFINITIONER.traslag) {
      const annat = Konfigurator.berakna({ monster: m.id, traA: t.id, traB: t.id, traC: t.id, storlek: '4026', ranna: false });
      assert.ok(annat >= pris, m.id + ' i ' + t.id + ' blev billigare an naturlig');
    }
  }
});

test('samma traslag pa bada platserna betalas en gang', () => {
  const bas = { monster: 'rutor', storlek: '4530', ranna: false };
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'valnot', traB: 'valnot' }), 2700);
  assert.equal(Konfigurator.berakna({ ...bas, traA: 'lonn', traB: 'lonn' }), 2500);
});

test('hel brada bryr sig inte om andra traslaget', () => {
  const hel = { monster: 'hel', traA: 'ek', storlek: '4530', ranna: false };
  assert.equal(Konfigurator.berakna({ ...hel, traB: 'valnot' }), 2000);
  assert.equal(Konfigurator.berakna({ ...hel, traB: 'lonn' }), 2000);
});

test('tillagg for saftranna', () => {
  const bas = { monster: 'hel', traA: 'ek', storlek: '4530' };
  assert.equal(Konfigurator.berakna({ ...bas, ranna: false }), 2000);
  assert.equal(Konfigurator.berakna({ ...bas, ranna: true }), 2150);
});

test('tillaggen adderas', () => {
  // 2750 for slaktarbradan, 400 for mursten, 100 for lonn, 300 for valnot, 150 for rannan
  assert.equal(
    Konfigurator.berakna({ monster: 'mursten', traA: 'lonn', traB: 'valnot', storlek: '6032', ranna: true }),
    3700
  );
});

test('standardvalet ar det som visas innan kunden rort nagot', () => {
  assert.equal(Konfigurator.berakna(Konfigurator.DEFINITIONER.standard), 2700);
});

test('okanda eller saknade val faller tillbaka pa standardvalet', () => {
  assert.equal(Konfigurator.berakna({}), 2700);
  assert.equal(Konfigurator.berakna(), 2700);
  assert.equal(Konfigurator.berakna({ monster: 'fiskben', traA: 'teak', traB: 'bambu', storlek: '9999' }), 2700);
});

test('formatera satter tusenavskiljare och kr', () => {
  assert.equal(Konfigurator.formatera(700), '700 kr');
  assert.equal(Konfigurator.formatera(1750), '1' + NBSP + '750 kr');
  assert.equal(Konfigurator.formatera(3700), '3' + NBSP + '700 kr');
});

/* ---------- sammanfattningen ---------- */

test('sammanfattning beskriver valen i klartext', () => {
  const s = Konfigurator.sammanfatta({ monster: 'rutor', traA: 'ek', traB: 'valnot', storlek: '5032', ranna: true });
  assert.equal(s.monster, 'Rutmönster');
  assert.equal(s.traslag, 'Ek och valnöt');
  assert.equal(s.storlek, '50 × 32 cm');
  assert.equal(s.ranna, 'Ja');
  assert.equal(s.pris, '3' + NBSP + '100 kr');
});

test('sammanfattningen namner bara de traslag brada faktiskt anvander', () => {
  const hel = Konfigurator.sammanfatta({ monster: 'hel', traA: 'ask', traB: 'valnot', storlek: '4530' });
  assert.equal(hel.traslag, 'Ask');

  const lika = Konfigurator.sammanfatta({ monster: 'rutor', traA: 'lonn', traB: 'lonn', storlek: '4530' });
  assert.equal(lika.traslag, 'Lönn');
});

test('sammanfattningen innehaller en ritning', () => {
  const s = Konfigurator.sammanfatta(Konfigurator.DEFINITIONER.standard);
  assert.match(s.bild, /^<svg /);
});

/* ---------- prislistan hanger ihop ---------- */

test('varje monster sager hur manga traslag det anvander', () => {
  for (const m of Konfigurator.DEFINITIONER.monster) {
    assert.ok(m.platser >= 0 && m.platser <= 3, m.id + ' har ett rimligt antal platser');
    assert.ok(typeof m.plus === 'number' && m.plus >= 0, m.id + ' har ett tillagg');
  }
});

test('varje storlek har mattet bade som text och som tal', () => {
  for (const s of Konfigurator.DEFINITIONER.storlekar) {
    assert.ok(s.langd > 0 && s.bredd > 0, s.id + ' har matt att rita efter');
    assert.match(s.namn, new RegExp('^' + s.langd + ' × ' + s.bredd + ' cm$'));
    assert.equal(s.id, String(s.langd) + String(s.bredd), 'id:t ska spegla mattet');
  }
});

test('basutbudet stannar vid 32 cm i bredd', () => {
  // Planhyveln tar 33 cm, sa en bredare brada maste limmas av tva plattor
  // efter hyvlingen. Det gar att gora, men det ar betydligt mer arbete och
  // hor darfor inte hemma bland standardmatten till standardpris. Bredare
  // matt prisas for sig, efter mejl.
  for (const s of Konfigurator.DEFINITIONER.storlekar) {
    assert.ok(s.bredd <= 32, s.id + ' ar ' + s.bredd + ' cm bred, basutbudet stannar vid 32');
  }
});
