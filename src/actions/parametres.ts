'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { succes, erreur } from '@/lib/utils'
import type { ActionResult, Parametre, ParametreUpdate, Profile } from '@/types'

// ============================================================
// Schémas
// ============================================================

const parametreUpdateSchema = z.object({
  cle: z.string().min(1),
  valeur: z.string(),
})

const invitationSchema = z.object({
  email: z.string().email("E-mail invalide"),
  role: z.enum(['admin', 'manager', 'employee']),
  personne_id: z.string().uuid().optional(),
})

// ============================================================
// MOCK DATA
// ============================================================

const MOCK_PARAMETRES: Parametre[] = [
  { id: 'p1', cle: 'taux_avs', valeur: '0.053', description: 'Taux AVS employé', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p2', cle: 'taux_ac', valeur: '0.011', description: "Taux assurance chômage", updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p3', cle: 'taux_laa', valeur: '0.01061', description: 'Taux LAA (accident)', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p4', cle: 'taux_alfa', valeur: '0.00131', description: 'Taux ALFA (formation)', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p5', cle: 'seuil', valeur: '2500', description: 'Seuil mensuel AVS', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p6', cle: 'mois_payes', valeur: '9,10,11,12,1,2,3,4,5,6', description: 'Mois payés par défaut', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p7', cle: 'annee_civile', valeur: '2026', description: 'Année civile en cours', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p8', cle: 'tour_courant', valeur: 'T2 25-26', description: 'Tour saisonnier courant', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p9', cle: 'bexio_api_key', valeur: '', description: 'Clé API Bexio', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p10', cle: 'iban_club', valeur: '', description: 'IBAN compte bancaire du club (Raiffeisen)', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p11', cle: 'bic_banque', valeur: 'RAIFCH22', description: 'BIC / SWIFT de la banque du club', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'p12', cle: 'nom_club', valeur: 'FC Savièse', description: 'Nom officiel du club (pour pain.001 et emails)', updated_at: '2026-01-01T00:00:00Z' },
]

const MOCK_USERS: Profile[] = [
  {
    id: 'user-001',
    email: 'romain.vuille@gmail.com',
    nom: 'Vuille',
    prenom: 'Romain',
    role: 'admin',
    personne_id: null,
    created_at: '2025-08-01T00:00:00Z',
  },
  {
    id: 'user-002',
    email: 'ana.emery@fcsaviese.ch',
    nom: 'Emery',
    prenom: 'Ana',
    role: 'employee',
    personne_id: 'pers-001',
    created_at: '2025-09-01T00:00:00Z',
  },
]

// ============================================================
// ACTIONS
// ============================================================

export async function getParametres(): Promise<ActionResult<Parametre[]>> {
  try {
    // TODO: prisma.parametre.findMany()
    return succes(MOCK_PARAMETRES)
  } catch {
    return erreur('Erreur lors du chargement des paramètres.')
  }
}

export async function updateParametres(
  updates: ParametreUpdate[]
): Promise<ActionResult> {
  try {
    for (const update of updates) {
      const validation = parametreUpdateSchema.safeParse(update)
      if (!validation.success) {
        return erreur(`Paramètre invalide : ${update.cle}`)
      }
    }

    // TODO: for each update: prisma.parametre.upsert(...)
    revalidatePath('/parametres')
    return succes()
  } catch {
    return erreur('Erreur lors de la mise à jour des paramètres.')
  }
}

export async function getUsers(): Promise<ActionResult<Profile[]>> {
  try {
    // TODO: prisma.profile.findMany()
    return succes(MOCK_USERS)
  } catch {
    return erreur('Erreur lors du chargement des utilisateurs.')
  }
}

export async function inviterUtilisateur(
  email: string,
  role: Profile['role'],
  personneId?: string
): Promise<ActionResult> {
  try {
    const validation = invitationSchema.safeParse({ email, role, personne_id: personneId })
    if (!validation.success) {
      return erreur(validation.error.issues[0]?.message ?? 'Données invalides.')
    }

    // TODO: supabase.auth.admin.inviteUserByEmail(email) via createAdminClient()
    // Puis: prisma.profile.create({ id: user.id, email, role, personne_id: personneId })

    revalidatePath('/parametres')
    return succes()
  } catch {
    return erreur("Erreur lors de l'invitation.")
  }
}

export async function testerBexioApiKey(apiKey: string): Promise<ActionResult<{ valide: boolean }>> {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return erreur('Clé API vide.')
    }

    // TODO: Appel réel à l'API Bexio pour tester la connexion
    // const response = await fetch('https://api.bexio.com/2.0/users/me', { headers: { Authorization: `Bearer ${apiKey}` } })
    // return succes({ valide: response.ok })

    return succes({ valide: false }) // stub
  } catch {
    return erreur('Erreur lors du test de la clé API Bexio.')
  }
}
