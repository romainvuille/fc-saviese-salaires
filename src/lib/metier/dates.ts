// ============================================================
// FC Savièse — Logique dates et périodes
// ============================================================

import { format, parseISO, isValid } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Calcule la date de paiement d'un tour saisonnier.
 * T1 XX-YY → 30 décembre 20XX
 * T2 XX-YY → 30 juin 20YY
 *
 * ex: datePaiementTour("T1 25-26") → Date(2025, 11, 30)
 * ex: datePaiementTour("T2 25-26") → Date(2026, 5, 30)
 */
export function datePaiementTour(tour: string): Date {
  const match = tour.match(/^(T1|T2)\s+(\d{2})-(\d{2})$/i)
  if (!match) {
    throw new Error(`Format de tour invalide : "${tour}". Attendu : T1 XX-YY ou T2 XX-YY`)
  }

  const [, t, yy1, yy2] = match
  const annee =
    t.toUpperCase() === 'T1'
      ? 2000 + parseInt(yy1, 10)
      : 2000 + parseInt(yy2, 10)

  const mois = t.toUpperCase() === 'T1' ? 11 : 5 // 0-indexed : 11=décembre, 5=juin

  return new Date(annee, mois, 30)
}

/**
 * Génère un label de période mensuelle.
 * ex: periodeLabel(2026, 5) → "05/2026"
 */
export function periodeLabel(annee: number, mois: number): string {
  const moisStr = String(mois).padStart(2, '0')
  return `${moisStr}/${annee}`
}

/**
 * Formate une date en format suisse DD.MM.YYYY.
 * Accepte un objet Date ou une chaîne ISO.
 * ex: formatDateCH(new Date(2026, 4, 20)) → "20.05.2026"
 */
export function formatDateCH(date: Date | string): string {
  let d: Date

  if (typeof date === 'string') {
    // Gestion des dates ISO partielles (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, day] = date.split('-').map(Number)
      d = new Date(y, m - 1, day)
    } else {
      d = parseISO(date)
    }
  } else {
    d = date
  }

  if (!isValid(d)) {
    return '—'
  }

  return format(d, 'dd.MM.yyyy', { locale: fr })
}

/**
 * Parse la valeur du paramètre mois_payes en tableau de nombres.
 * ex: "9,10,11,12,1,2,3,4,5,6" → [9, 10, 11, 12, 1, 2, 3, 4, 5, 6]
 */
export function moisPayesGlobaux(valeur: string): number[] {
  return valeur
    .split(',')
    .map((m) => parseInt(m.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 12)
}

/**
 * Retourne la liste des mois à payer pour une personne donnée.
 * Si la personne a ses propres mois_payes, on les utilise.
 * Sinon on utilise les mois globaux.
 */
export function getMoisPayes(
  personnesMoisPayes: string,
  globaux: number[]
): number[] {
  const trim = personnesMoisPayes.trim()
  if (trim === '' || trim === null) {
    return globaux
  }
  return moisPayesGlobaux(trim)
}

/**
 * Retourne le label d'un mois en français.
 * ex: nomMois(5) → "mai"
 */
export function nomMois(mois: number): string {
  const date = new Date(2024, mois - 1, 1)
  return format(date, 'MMMM', { locale: fr })
}

/**
 * Parse une période mensuelle "MM/YYYY" en { mois, annee }.
 * ex: parsePeriodeMensuelle("05/2026") → { mois: 5, annee: 2026 }
 */
export function parsePeriodeMensuelle(periode: string): { mois: number; annee: number } | null {
  const match = periode.match(/^(\d{2})\/(\d{4})$/)
  if (!match) return null
  return {
    mois: parseInt(match[1], 10),
    annee: parseInt(match[2], 10),
  }
}

/**
 * Retourne la date du dernier jour du mois.
 * ex: dernierJourMois(2026, 5) → Date(2026, 4, 31) ... → 31 mai 2026
 */
export function dernierJourMois(annee: number, mois: number): Date {
  // Date avec jour 0 du mois suivant = dernier jour du mois courant
  return new Date(annee, mois, 0)
}

/**
 * Retourne la date de paiement mensuelle standard : dernier jour du mois.
 * ex: datePaiementMensuel(2026, 5) → 31 mai 2026
 */
export function datePaiementMensuel(annee: number, mois: number): Date {
  return dernierJourMois(annee, mois)
}

/**
 * Vérifie si un tour est au bon format.
 * ex: isTourValide("T2 25-26") → true
 */
export function isTourValide(tour: string): boolean {
  return /^(T1|T2)\s+\d{2}-\d{2}$/i.test(tour)
}

/**
 * Formate une date ISO pour l'utiliser dans un input type="date".
 * ex: toInputDate(new Date(2026, 4, 20)) → "2026-05-20"
 */
export function toInputDate(date: Date | string): string {
  let d: Date

  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
    d = parseISO(date)
  } else {
    d = date
  }

  if (!isValid(d)) return ''

  return format(d, 'yyyy-MM-dd')
}
