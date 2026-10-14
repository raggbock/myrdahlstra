'use strict';

/*
 * En D1-attrapp ovanpå node:sqlite, så att funktionernas SQL körs på riktigt
 * i testerna. Bara det funktionerna använder: prepare, bind, first, all, run
 * och batch, som är en transaktion precis som i D1.
 */

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

function fejkD1(...sqlFiler) {
  const db = new DatabaseSync(':memory:');
  for (const fil of sqlFiler) db.exec(fs.readFileSync(fil, 'utf8'));

  const kor = (sql, varden) => {
    const r = db.prepare(sql).run(...varden);
    return { meta: { changes: Number(r.changes) } };
  };
  // D1 tar emot en BLOB som ArrayBuffer, node:sqlite som Uint8Array
  const somD1 = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v);
  const sats = (sql, varden = []) => ({
    bind: (...nya) => sats(sql, nya.map(somD1)),
    first: async () => db.prepare(sql).get(...varden) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...varden) }),
    run: async () => kor(sql, varden),
    _kor: () => kor(sql, varden)
  });

  return {
    db,
    prepare: (sql) => sats(sql),
    async batch(lista) {
      db.exec('BEGIN');
      try {
        const ut = lista.map((s) => s._kor());
        db.exec('COMMIT');
        return ut;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  };
}

module.exports = { fejkD1 };
