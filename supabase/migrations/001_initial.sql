-- ============================================================
-- FC Savièse — Migration initiale
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE role_enum AS ENUM ('admin', 'manager', 'employee');

CREATE TYPE mode_paiement_enum AS ENUM (
  'Horaire',
  'Mensuel fixe',
  'Saisonnier fixe',
  'Bénéfice cantine'
);

CREATE TYPE statut_personne_enum AS ENUM ('Actif', 'Inactif');

CREATE TYPE type_paiement_enum AS ENUM ('Salaire', 'Défraiement');

CREATE TYPE statut_paiement_enum AS ENUM ('À valider', 'Validé', 'Payé', 'Annulé');

CREATE TYPE statut_cantine_enum AS ENUM ('En attente', 'Validé');

CREATE TYPE statut_bexio_enum AS ENUM ('À exporter', 'Envoyé', 'Erreur');

-- ============================================================
-- FONCTION HELPER updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FONCTION HELPER : rôle de l'utilisateur courant
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS role_enum AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- TABLE : profiles
-- ============================================================

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  nom         TEXT NOT NULL DEFAULT '',
  prenom      TEXT NOT NULL DEFAULT '',
  role        role_enum NOT NULL DEFAULT 'employee',
  personne_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_personne_id ON profiles(personne_id);

-- ============================================================
-- TABLE : parametres
-- ============================================================

CREATE TABLE parametres (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cle         TEXT NOT NULL UNIQUE,
  valeur      TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : bareme
-- ============================================================

CREATE TABLE bareme (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie   TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  montant_ref NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE : personnes
-- ============================================================

CREATE TABLE personnes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  nom             TEXT NOT NULL,
  prenom          TEXT NOT NULL,
  categorie       TEXT NOT NULL DEFAULT '',
  mode            mode_paiement_enum NOT NULL,
  taux_horaire    NUMERIC(10, 2),
  montant_mois    NUMERIC(10, 2),
  montant_saison  NUMERIC(10, 2),
  mois_payes      TEXT NOT NULL DEFAULT '',
  iban            TEXT NOT NULL DEFAULT '',
  numero_avs      TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  statut          statut_personne_enum NOT NULL DEFAULT 'Actif',
  soumis_charges  BOOLEAN NOT NULL DEFAULT FALSE,
  diplome_js      TEXT NOT NULL DEFAULT '',
  ajustement      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cumul_ytd       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_personnes_statut ON personnes(statut);
CREATE INDEX idx_personnes_mode ON personnes(mode);

CREATE TRIGGER set_personnes_updated_at
  BEFORE UPDATE ON personnes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- FK profile → personne (ajoutée après création de personnes)
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_personne
  FOREIGN KEY (personne_id) REFERENCES personnes(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE : paiements
-- ============================================================

CREATE TABLE paiements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_code        TEXT NOT NULL UNIQUE,
  date_paiement   DATE NOT NULL,
  personne_id     UUID NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  nom_complet     TEXT NOT NULL,
  categorie       TEXT NOT NULL DEFAULT '',
  periode         TEXT NOT NULL,
  type_paiement   type_paiement_enum NOT NULL,
  brut            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  retenue_avs     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  retenue_ac      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  retenue_laa     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  retenue_alfa    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_retenues  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  net             NUMERIC(10, 2) NOT NULL DEFAULT 0,
  statut          statut_paiement_enum NOT NULL DEFAULT 'À valider',
  date_virement   DATE,
  bexio_ref       TEXT,
  fiche_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (personne_id, periode)
);

CREATE INDEX idx_paiements_personne_id ON paiements(personne_id);
CREATE INDEX idx_paiements_statut ON paiements(statut);
CREATE INDEX idx_paiements_periode ON paiements(periode);
CREATE INDEX idx_paiements_date_paiement ON paiements(date_paiement);

CREATE TRIGGER set_paiements_updated_at
  BEFORE UPDATE ON paiements
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABLE : heures
-- ============================================================

CREATE TABLE heures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personne_id     UUID NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  date_travail    DATE NOT NULL,
  heure_debut     TEXT NOT NULL,
  heure_fin       TEXT NOT NULL,
  heures_decimal  NUMERIC(5, 2) NOT NULL,
  activite        TEXT NOT NULL DEFAULT '',
  remarques       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_heures_personne_id ON heures(personne_id);
CREATE INDEX idx_heures_date_travail ON heures(date_travail);

-- ============================================================
-- TABLE : cantines
-- ============================================================

CREATE TABLE cantines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode             TEXT NOT NULL,
  cantine             TEXT NOT NULL,
  recette_brute       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  charges             NUMERIC(10, 2) NOT NULL DEFAULT 0,
  benefice_net        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  part_club_60        NUMERIC(10, 2) NOT NULL DEFAULT 0,
  part_cantiniers_40  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  personne_id         UUID NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  part_cantinier      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  statut              statut_cantine_enum NOT NULL DEFAULT 'En attente',
  date_paiement       DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cantines_personne_id ON cantines(personne_id);
CREATE INDEX idx_cantines_periode ON cantines(periode);

-- ============================================================
-- TABLE : bexio_exports
-- ============================================================

CREATE TABLE bexio_exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paiement_id   UUID NOT NULL UNIQUE REFERENCES paiements(id) ON DELETE RESTRICT,
  date_ecriture DATE NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  compte_debit  TEXT NOT NULL,
  compte_credit TEXT NOT NULL,
  montant       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  bexio_ref     TEXT,
  statut        statut_bexio_enum NOT NULL DEFAULT 'À exporter',
  erreur_msg    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bexio_exports_statut ON bexio_exports(statut);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bareme          ENABLE ROW LEVEL SECURITY;
ALTER TABLE personnes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE heures          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cantines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bexio_exports   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES : profiles
-- ============================================================

-- Chaque utilisateur peut lire son propre profil
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid() OR get_user_role() IN ('admin', 'manager'));

CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "profiles_delete_admin" ON profiles
  FOR DELETE USING (get_user_role() = 'admin');

-- ============================================================
-- POLICIES : parametres
-- ============================================================

CREATE POLICY "parametres_select_authenticated" ON parametres
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "parametres_insert_admin" ON parametres
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "parametres_update_admin" ON parametres
  FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "parametres_delete_admin" ON parametres
  FOR DELETE USING (get_user_role() = 'admin');

-- ============================================================
-- POLICIES : bareme
-- ============================================================

CREATE POLICY "bareme_select_authenticated" ON bareme
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "bareme_insert_admin" ON bareme
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "bareme_update_admin" ON bareme
  FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "bareme_delete_admin" ON bareme
  FOR DELETE USING (get_user_role() = 'admin');

-- ============================================================
-- POLICIES : personnes
-- ============================================================

CREATE POLICY "personnes_select_all_auth" ON personnes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "personnes_insert_admin" ON personnes
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "personnes_update_admin" ON personnes
  FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "personnes_delete_admin" ON personnes
  FOR DELETE USING (get_user_role() = 'admin');

-- ============================================================
-- POLICIES : paiements
-- ============================================================

-- Admin : tout
CREATE POLICY "paiements_all_admin" ON paiements
  FOR ALL USING (get_user_role() = 'admin');

-- Manager : lecture tout + update statut/date_virement
CREATE POLICY "paiements_select_manager" ON paiements
  FOR SELECT USING (get_user_role() = 'manager');

CREATE POLICY "paiements_update_manager" ON paiements
  FOR UPDATE USING (get_user_role() = 'manager');

-- Employee : lecture de ses propres paiements uniquement
CREATE POLICY "paiements_select_employee" ON paiements
  FOR SELECT USING (
    get_user_role() = 'employee'
    AND personne_id = (
      SELECT personne_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
-- POLICIES : heures
-- ============================================================

-- Admin : tout
CREATE POLICY "heures_all_admin" ON heures
  FOR ALL USING (get_user_role() = 'admin');

-- Manager : lecture tout
CREATE POLICY "heures_select_manager" ON heures
  FOR SELECT USING (get_user_role() = 'manager');

-- Employee : lecture + insert/update ses propres heures
CREATE POLICY "heures_select_employee" ON heures
  FOR SELECT USING (
    get_user_role() = 'employee'
    AND personne_id = (
      SELECT personne_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "heures_insert_employee" ON heures
  FOR INSERT WITH CHECK (
    get_user_role() = 'employee'
    AND personne_id = (
      SELECT personne_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "heures_update_employee" ON heures
  FOR UPDATE USING (
    get_user_role() = 'employee'
    AND personne_id = (
      SELECT personne_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ============================================================
-- POLICIES : cantines
-- ============================================================

CREATE POLICY "cantines_select_all_auth" ON cantines
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cantines_insert_admin" ON cantines
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "cantines_update_admin" ON cantines
  FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "cantines_delete_admin" ON cantines
  FOR DELETE USING (get_user_role() = 'admin');

-- ============================================================
-- POLICIES : bexio_exports
-- ============================================================

CREATE POLICY "bexio_select_admin_manager" ON bexio_exports
  FOR SELECT USING (get_user_role() IN ('admin', 'manager'));

CREATE POLICY "bexio_insert_admin" ON bexio_exports
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "bexio_update_admin" ON bexio_exports
  FOR UPDATE USING (get_user_role() = 'admin');

CREATE POLICY "bexio_delete_admin" ON bexio_exports
  FOR DELETE USING (get_user_role() = 'admin');

-- ============================================================
-- DONNÉES INITIALES : parametres
-- ============================================================

INSERT INTO parametres (cle, valeur, description) VALUES
  ('taux_avs',      '0.053',                    'Taux AVS employé (5.3%)'),
  ('taux_ac',       '0.011',                    'Taux AC employé (1.1%)'),
  ('taux_laa',      '0.01061',                  'Taux LAA employé (1.061%)'),
  ('taux_alfa',     '0.00131',                  'Taux ALFA employé (0.131%)'),
  ('seuil',         '2500',                     'Seuil annuel CHF en dessous duquel aucune charge (non utilisé si soumis_charges=true)'),
  ('mois_payes',    '9,10,11,12,1,2,3,4,5,6',  'Mois payés par défaut (saison football)'),
  ('annee_civile',  '2026',                     'Année civile courante'),
  ('tour_courant',  'T2 25-26',                 'Tour saisonnier courant'),
  ('bexio_api_key', '',                         'Clé API Bexio pour export comptable');
