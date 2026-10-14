'use strict';

/*
 * Julraden: sista dag att beställa en bräda som ska tillverkas, om den ska
 * hinna fram till jul. Datumet står som julSista i src/_data/site.json, och
 * lämnas det tomt syns ingen rad alls.
 *
 * Raden gäller bara det som görs efter beställning, alltså byggaren och poster
 * märkta pabestallning. En färdig bräda skickas inom några dagar och har
 * ingen sådan gräns, så produktsidor för lagerexemplar säger inget om jul.
 *
 * Som allt datumberoende på sajten räknas det fram vid bygget, inte i
 * besökarens webbläsare. Raden syns till och med sista dagen och försvinner
 * vid första bygget därefter. Laddas inget upp på ett tag ligger den kvar,
 * men den säger fortfarande sanningen: att det är för sent att beställa till
 * jul.
 */

const { tillDygn, dagensDygn } = require('./sortiment.js');

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli',
  'augusti', 'september', 'oktober', 'november', 'december'];

// { datum: '14 november' } så länge sista dagen inte har passerat, annars null.
// Testen skickar in dagens datum, bygget låter det vara tomt.
function julrad(sista, idag) {
  const t = tillDygn(sista);
  if (t === null || dagensDygn(idag) > t) return null;

  const d = new Date(t);
  return { datum: d.getUTCDate() + ' ' + MANADER[d.getUTCMonth()] };
}

module.exports = { julrad };
