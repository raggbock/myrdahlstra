-- Omdömen, se functions/api/omdome.js och verktyg/admin.js.
-- Ligger i samma databas som klicken, så wrangler.toml behöver ingen ny bindning.
-- Körs en gång mot den skarpa databasen:
--   npx wrangler d1 execute myrdahls-klick --remote --file=db/omdome.sql
-- och mot den lokala, för npm run preview:
--   npx wrangler d1 execute myrdahls-klick --local --file=db/omdome.sql
--
-- Databasen är bara en inkorg. Ett publicerat omdöme flyttas till
-- src/_data/omdomen.json, och ett avslaget raderas.

CREATE TABLE IF NOT EXISTS inbjudan (
  kod    TEXT PRIMARY KEY,   -- 12 tecken base64url, slumpad i panelen
  mal    TEXT NOT NULL,      -- alltid 'allmant': omdömena gäller inte en viss bräda, se verktyg/omdomen.js
  skapad TEXT NOT NULL,      -- 2026-10-10
  anvand TEXT                -- dagen omdömet kom in, null tills dess
);

-- AUTOINCREMENT med flit: utan det kan SQLite ge ett nytt omdöme samma id
-- som ett raderat, och id:t är det som skiljer omdömena åt i omdomen.json.
CREATE TABLE IF NOT EXISTS omdome (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  kod    TEXT NOT NULL UNIQUE REFERENCES inbjudan(kod),
  mal    TEXT NOT NULL,      -- kopierat från inbjudan
  betyg  INTEGER NOT NULL,   -- 1 till 5
  namn   TEXT NOT NULL,
  ort    TEXT NOT NULL,      -- tomt om kunden inte vill
  text   TEXT NOT NULL,
  dag    TEXT NOT NULL,      -- dagen det skrevs
  bild   BLOB                -- JPEG utan metadata, se lib/jpeg.mjs. Null utan foto
);
