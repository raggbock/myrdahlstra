-- Tabellen för klickmätningen, se functions/api/klick.js.
-- Körs en gång mot den skarpa databasen:
--   npx wrangler d1 execute myrdahls-klick --remote --file=db/klick.sql
-- och mot den lokala, för npm run preview:
--   npx wrangler d1 execute myrdahls-klick --local --file=db/klick.sql

CREATE TABLE IF NOT EXISTS klick (
  dag  TEXT NOT NULL,     -- 2026-10-01, inget klockslag
  sida TEXT NOT NULL,     -- /bestallning/
  lage TEXT NOT NULL,     -- mobil eller dator
  x    REAL,              -- andel av ramens bredd, null för tangentbordsklick
  y    INTEGER,           -- px från ramens överkant
  mal  TEXT NOT NULL,     -- vad som klickades, tomt för klick bredvid
  till TEXT NOT NULL      -- vart länken gick
);

CREATE INDEX IF NOT EXISTS klick_dag ON klick (dag);
