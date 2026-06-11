// ============================================================
// FC Savièse — Logique charges sociales
// COL soumis_charges = SEUL décideur
// ============================================================

import type { Parametres, ResultatRetenues } from '@/types'

/**
 * Calcule les retenues sociales sur un montant brut.
 *
 * Règle unique : si soumis_charges === false → défraiement, 0 charges.
 * Si soumis_charges === true → AVS/AC/LAA/ALFA calculés sur le brut entier,
 * dès le premier franc (pas de seuil).
 */
export function calculerRetenues(
  brut: number,
  soumisCharges: boolean,
  params: Parametres
): ResultatRetenues {
  if (!soumisCharges) {
    return {
      avs: 0,
      ac: 0,
      laa: 0,
      alfa: 0,
      total: 0,
      net: brut,
      type: 'Défraiement',
    }
  }

  const avs = arrondir(brut * params.taux_avs)
  const ac = arrondir(brut * params.taux_ac)
  const laa = arrondir(brut * params.taux_laa)
  const alfa = arrondir(brut * params.taux_alfa)
  const total = arrondir(avs + ac + laa + alfa)
  const net = arrondir(brut - total)

  return {
    avs,
    ac,
    laa,
    alfa,
    total,
    net,
    type: 'Salaire',
  }
}

/**
 * Formate un montant en CHF selon la locale fr-CH.
 * ex : 1234.5 → "CHF 1'234.50"
 */
export function fmtCHF(montant: number): string {
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(montant)
}

/**
 * Calcule la durée en heures décimales entre deux horaires HH:MM.
 * ex : "08:00" et "11:30" → 3.5
 * Gère le cas passage minuit (fin < début).
 */
export function calculerHeuresDecimal(debut: string, fin: string): number {
  const [hDebut, mDebut] = debut.split(':').map(Number)
  const [hFin, mFin] = fin.split(':').map(Number)

  const minutesDebut = hDebut * 60 + mDebut
  let minutesFin = hFin * 60 + mFin

  // Passage minuit
  if (minutesFin < minutesDebut) {
    minutesFin += 24 * 60
  }

  const diff = minutesFin - minutesDebut
  return arrondir(diff / 60)
}

/**
 * Arrondit à 2 décimales (arrondi bancaire).
 */
function arrondir(valeur: number): number {
  return Math.round(valeur * 100) / 100
}

/**
 * Valide le format HH:MM d'un horaire.
 */
export function isHoraireValide(horaire: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(horaire)
}

/**
 * Parse les paramètres bruts (table parametres) en objet Parametres typé.
 */
export function parseParametres(
  rows: Array<{ cle: string; valeur: string }>
): import('@/types').Parametres {
  const map: Record<string, string> = {}
  for (const row of rows) {
    map[row.cle] = row.valeur
  }

  return {
    taux_avs: parseFloat(map['taux_avs'] ?? '0.053'),
    taux_ac: parseFloat(map['taux_ac'] ?? '0.011'),
    taux_laa: parseFloat(map['taux_laa'] ?? '0.01061'),
    taux_alfa: parseFloat(map['taux_alfa'] ?? '0.00131'),
    seuil: parseFloat(map['seuil'] ?? '2500'),
    mois_payes: (map['mois_payes'] ?? '9,10,11,12,1,2,3,4,5,6')
      .split(',')
      .map((m) => parseInt(m.trim(), 10))
      .filter((n) => !isNaN(n)),
    annee_civile: parseInt(map['annee_civile'] ?? '2026', 10),
    tour_courant: map['tour_courant'] ?? 'T2 25-26',
    bexio_api_key: map['bexio_api_key'] ?? '',
  }
}
