// ============================================================
// FC Savièse — Utilitaires généraux
// ============================================================

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { StatutPaiement, StatutPersonne, ModePaiement, Role } from '@/types'

// ============================================================
// CLASS NAMES
// ============================================================

/**
 * Fusionne des classes Tailwind en évitant les conflits.
 * ex: cn("px-2 py-1", condition && "bg-red-500")
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ============================================================
// FORMATTERS MONÉTAIRES
// ============================================================

/**
 * Formate un nombre en CHF. ex: 1234.50 → "CHF 1'234.50"
 */
export function fmtCHF(montant: number | null | undefined): string {
  if (montant === null || montant === undefined) return '—'
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(montant)
}

/**
 * Formate un pourcentage. ex: 0.053 → "5.30%"
 */
export function fmtPct(taux: number): string {
  return new Intl.NumberFormat('fr-CH', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(taux)
}

/**
 * Formate un nombre avec 2 décimales. ex: 3.5 → "3.50"
 */
export function fmtNombre(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

// ============================================================
// FORMATTERS DATE
// ============================================================

/**
 * Formate une date ISO en DD.MM.YYYY.
 */
export function fmtDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ============================================================
// LABELS MÉTIER
// ============================================================

/**
 * Retourne le libellé lisible d'un statut paiement.
 */
export function labelStatutPaiement(statut: StatutPaiement): string {
  const labels: Record<StatutPaiement, string> = {
    'À valider': 'À valider',
    'Validé': 'Validé',
    'Payé': 'Payé',
    'Annulé': 'Annulé',
  }
  return labels[statut] ?? statut
}

/**
 * Retourne la couleur Tailwind associée à un statut paiement.
 */
export function colorStatutPaiement(statut: StatutPaiement): string {
  const colors: Record<StatutPaiement, string> = {
    'À valider': 'bg-yellow-100 text-yellow-800',
    'Validé': 'bg-blue-100 text-blue-800',
    'Payé': 'bg-green-100 text-green-800',
    'Annulé': 'bg-gray-100 text-gray-600',
  }
  return colors[statut] ?? 'bg-gray-100 text-gray-600'
}

/**
 * Retourne la couleur Tailwind associée à un statut personne.
 */
export function colorStatutPersonne(statut: StatutPersonne): string {
  return statut === 'Actif'
    ? 'bg-green-100 text-green-800'
    : 'bg-gray-100 text-gray-600'
}

/**
 * Retourne le libellé d'un mode paiement.
 */
export function labelModePaiement(mode: ModePaiement): string {
  return mode // Les valeurs sont déjà lisibles
}

/**
 * Retourne le libellé d'un rôle.
 */
export function labelRole(role: Role): string {
  const labels: Record<Role, string> = {
    admin: 'Administrateur',
    manager: 'Responsable',
    employee: 'Employé',
  }
  return labels[role] ?? role
}

// ============================================================
// HELPERS GÉNÉRAUX
// ============================================================

/**
 * Tronque un texte à une longueur maximale.
 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

/**
 * Retourne les initiales d'un nom complet.
 * ex: "Romain Vuille" → "RV"
 */
export function initiales(prenom: string, nom: string): string {
  const p = prenom.trim()[0]?.toUpperCase() ?? ''
  const n = nom.trim()[0]?.toUpperCase() ?? ''
  return p + n
}

/**
 * Vérifie si une chaîne est un IBAN suisse valide (format basique).
 */
export function isIBANValide(iban: string): boolean {
  const clean = iban.replace(/\s/g, '').toUpperCase()
  return /^CH\d{19}$/.test(clean)
}

/**
 * Formate un IBAN avec des espaces tous les 4 caractères.
 * ex: "CH1234567890123456789" → "CH12 3456 7890 1234 5678 9"
 */
export function fmtIBAN(iban: string): string {
  const clean = iban.replace(/\s/g, '').toUpperCase()
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Retourne une chaîne vide ou la valeur.
 * Utile pour les champs optionnels.
 */
export function orEmpty(val: string | null | undefined): string {
  return val ?? ''
}

/**
 * Convertit un Decimal Prisma (ou tout objet toString) en number.
 */
export function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

/**
 * Génère un objet d'erreur standardisé pour les Server Actions.
 */
export function erreur(message: string): { success: false; error: string } {
  return { success: false, error: message }
}

/**
 * Génère un objet de succès standardisé pour les Server Actions.
 */
export function succes<T>(data?: T): { success: true; data?: T } {
  return { success: true, data }
}
