// ============================================================
// FC Savièse — Types TypeScript
// ============================================================

// ============================================================
// ENUMS
// ============================================================

export type Role = 'admin' | 'manager' | 'employee'

export type ModePaiement =
  | 'Horaire'
  | 'Mensuel fixe'
  | 'Saisonnier fixe'
  | 'Bénéfice cantine'

export type TypePaiement = 'Salaire' | 'Défraiement'

export type StatutPaiement = 'À valider' | 'Validé' | 'Payé' | 'Annulé'

export type StatutPersonne = 'Actif' | 'Inactif'

export type StatutCantine = 'En attente' | 'Validé'

export type StatutBexio = 'À exporter' | 'Envoyé' | 'Erreur'

// ============================================================
// INTERFACES MÉTIER
// ============================================================

export interface Profile {
  id: string
  email: string
  nom: string
  prenom: string
  role: Role
  personne_id: string | null
  created_at: string
}

export interface Personne {
  id: string
  code: string
  nom: string
  prenom: string
  categorie: string
  sous_categorie: string
  mode: ModePaiement
  taux_horaire: number | null
  montant_mois: number | null
  montant_saison: number | null
  mois_payes: string
  iban: string
  numero_avs: string
  email: string
  statut: StatutPersonne
  soumis_charges: boolean
  diplome_js: string
  bonus_js: boolean
  cumul_ytd: number
  created_at: string
  updated_at: string
}

export interface Paiement {
  id: string
  pay_code: string
  date_paiement: string
  personne_id: string
  nom_complet: string
  categorie: string
  periode: string
  type_paiement: TypePaiement
  brut: number
  retenue_avs: number
  retenue_ac: number
  retenue_laa: number
  retenue_alfa: number
  total_retenues: number
  net: number
  statut: StatutPaiement
  date_virement: string | null
  bexio_ref: string | null
  fiche_url: string | null
  created_at: string
  updated_at: string
  // Relations
  personne?: Personne
}

export interface Heure {
  id: string
  personne_id: string
  date_travail: string
  heure_debut: string
  heure_fin: string
  heures_decimal: number
  activite: string
  remarques: string | null
  created_at: string
  created_by: string
  // Relations
  personne?: Personne
}

export interface Cantine {
  id: string
  periode: string
  cantine: string
  recette_brute: number
  charges: number
  benefice_net: number
  part_club_60: number
  part_cantiniers_40: number
  personne_id: string
  part_cantinier: number
  statut: StatutCantine
  date_paiement: string | null
  notes: string | null
  created_at: string
  // Relations
  personne?: Personne
}

export interface Parametre {
  id: string
  cle: string
  valeur: string
  description: string
  updated_at: string
}

export interface Bareme {
  id: string
  categorie: string
  description: string
  montant_ref: number
  created_at: string
}

export interface BexioExport {
  id: string
  paiement_id: string
  date_ecriture: string
  description: string
  compte_debit: string
  compte_credit: string
  montant: number
  bexio_ref: string | null
  statut: StatutBexio
  erreur_msg: string | null
  created_at: string
  // Relations
  paiement?: Paiement
}

// ============================================================
// OBJET PARAMETRES PARSÉ
// ============================================================

export interface Parametres {
  taux_avs: number       // 0.053
  taux_ac: number        // 0.011
  taux_laa: number       // 0.01061
  taux_alfa: number      // 0.00131
  seuil: number          // 2500
  mois_payes: number[]   // [9,10,11,12,1,2,3,4,5,6]
  annee_civile: number   // 2026
  tour_courant: string   // "T2 25-26"
  bexio_api_key: string
}

// ============================================================
// RÉSULTATS DE CALCUL
// ============================================================

export interface ResultatRetenues {
  avs: number
  ac: number
  laa: number
  alfa: number
  total: number
  net: number
  type: TypePaiement
}

export interface ResultatGeneration {
  generes: number
  ignores: number    // doublons ou déjà existants
  erreurs: string[]
  paiements: Paiement[]
}

// ============================================================
// FORMES DE SAISIE (Zod inferred types — définis dans validations/)
// ============================================================

export interface PersonneFormData {
  nom: string
  prenom: string
  categorie: string
  sous_categorie: string
  mode: ModePaiement
  taux_horaire?: number | null
  montant_mois?: number | null
  montant_saison?: number | null
  mois_payes?: string
  iban?: string
  numero_avs?: string
  email?: string
  statut: StatutPersonne
  soumis_charges: boolean
  diplome_js?: string
  bonus_js?: boolean
}

export interface HeureFormData {
  personne_id: string
  date_travail: string
  heure_debut: string
  heure_fin: string
  activite: string
  remarques?: string
}

export interface CantineFormData {
  periode: string
  cantine: string
  recette_brute: number
  charges: number
  personne_id: string
  date_paiement?: string
  notes?: string
}

export interface ParametreUpdate {
  cle: string
  valeur: string
}

// ============================================================
// HELPERS UI
// ============================================================

export interface SelectOption {
  value: string
  label: string
}

export interface ActionResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

// ============================================================
// Arbitrage
// ============================================================

export type StatutMatch = 'À planifier' | 'Confirmé' | 'Joué' | 'Annulé'
export type StatutAvance = 'À verser' | 'Versé' | 'Soldé'

export interface ArbitrageMatch {
  id: string
  saison: string
  numero_match: string | null
  date_match: string
  heure_match: string | null
  equipe: string
  ligue: string
  competition: string | null
  adversaire: string
  lieu: string | null
  montant_chf: number
  statut: StatutMatch
  notes: string | null
  created_at: string
}

export interface ArbitrageAvance {
  id: string
  code: string
  saison: string
  equipe: string
  ligue: string
  nb_matches: number
  montant_par_match: number
  montant_total: number
  statut: StatutAvance
  date_versement: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Résumé d'une avance calculée (pas encore persistée)
export interface AvanceCalculee {
  equipe: string
  ligue: string
  nb_matches: number
  montant_par_match: number
  montant_total: number
}
