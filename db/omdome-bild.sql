-- Fotot till ett omdöme, se docs/superpowers/specs/2026-10-14-omdomesfoto-design.md.
-- För databaser som skapades innan kolumnen fanns. Körs en gång per databas:
--   node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --local --file=db/omdome-bild.sql
--   node node_modules/wrangler/bin/wrangler.js d1 execute myrdahls-klick --remote --file=db/omdome-bild.sql
-- Den skarpa databasen ska ha kolumnen innan functions/api/omdome.js med
-- foto publiceras. Annars misslyckas varje inskickat omdöme, även utan foto.
ALTER TABLE omdome ADD COLUMN bild BLOB;
