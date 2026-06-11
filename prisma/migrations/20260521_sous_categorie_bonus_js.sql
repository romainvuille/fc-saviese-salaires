-- Migration: ajout sous_categorie + bonus_js, suppression ajustement
-- Date: 2026-05-21
-- À exécuter sur la DB Supabase via SQL Editor

-- Ajout des nouvelles colonnes
ALTER TABLE personnes
  ADD COLUMN IF NOT EXISTS sous_categorie TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bonus_js BOOLEAN NOT NULL DEFAULT FALSE;

-- Suppression de la colonne ajustement
-- (commenter si des données doivent être préservées)
ALTER TABLE personnes
  DROP COLUMN IF EXISTS ajustement;

-- Mise à jour du paramètre bonus J+S (valeur par défaut: 500 CHF)
INSERT INTO parametres (id, cle, valeur, description, updated_at)
VALUES (gen_random_uuid(), 'montant_bonus_js', '500', 'Montant bonus diplôme J+S (CHF) par tour/mois', now())
ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, updated_at = now();

-- Suppression du paramètre mois_payes global (géré uniquement par personne)
-- DELETE FROM parametres WHERE cle = 'mois_payes';
-- (commenté par sécurité — à exécuter manuellement si souhaité)
