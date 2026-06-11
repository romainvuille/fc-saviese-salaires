-- ============================================================
-- Module Arbitrage — FC Savièse
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Enum StatutMatch
DO $$ BEGIN
  CREATE TYPE "StatutMatch" AS ENUM ('À planifier', 'Confirmé', 'Joué', 'Annulé');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enum StatutAvance
DO $$ BEGIN
  CREATE TYPE "StatutAvance" AS ENUM ('À verser', 'Versé', 'Soldé');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Table arbitrage_matches
CREATE TABLE IF NOT EXISTS arbitrage_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saison          TEXT NOT NULL,
  numero_match    TEXT,
  date_match      DATE NOT NULL,
  heure_match     TEXT,
  equipe          TEXT NOT NULL,
  ligue           TEXT NOT NULL,
  competition     TEXT,
  adversaire      TEXT NOT NULL,
  lieu            TEXT,
  montant_chf     NUMERIC(10,2) NOT NULL,
  statut          "StatutMatch" NOT NULL DEFAULT 'À planifier',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(saison, numero_match)
);

-- Table arbitrage_avances
CREATE TABLE IF NOT EXISTS arbitrage_avances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  saison              TEXT NOT NULL,
  equipe              TEXT NOT NULL,
  ligue               TEXT NOT NULL,
  nb_matches          INTEGER NOT NULL,
  montant_par_match   NUMERIC(10,2) NOT NULL,
  montant_total       NUMERIC(10,2) NOT NULL,
  statut              "StatutAvance" NOT NULL DEFAULT 'À verser',
  date_versement      DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at on arbitrage_avances
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER arbitrage_avances_updated_at
    BEFORE UPDATE ON arbitrage_avances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT 'Tables arbitrage créées avec succès' AS result;
