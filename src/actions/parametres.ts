'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
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
// Helper de conversion Prisma → type métier
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaToParametre(p: any): Parametre {
  return {
    id: p.id,
    cle: p.cle,
    valeur: p.valeur,
    description: p.description ?? '',
    updated_at: p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaToProfile(p: any): Profile {
  return {
    id: p.id,
    email: p.email ?? '',
    nom: p.nom ?? '',
    prenom: p.prenom ?? '',
    role: p.role as Profile['role'],
    personne_id: p.personne_id ?? null,
    created_at: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
  }
}

// ============================================================
// ACTIONS
// ============================================================

export async function getParametres(): Promise<ActionResult<Parametre[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).parametre.findMany({
      orderBy: { cle: 'asc' },
    })
    return succes(rows.map(prismaToParametre))
  } catch {
    return erreur('Erreur lors du chargement des paramètres.')
  }
}

export async function updateParametres(updates: ParametreUpdate[]): Promise<ActionResult> {
  try {
    for (const update of updates) {
      const validation = parametreUpdateSchema.safeParse(update)
      if (!validation.success) {
        return erreur(`Paramètre invalide : ${update.cle}`)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).parametre.upsert({
        where: { cle: validation.data.cle },
        update: {
          valeur: validation.data.valeur,
          updated_at: new Date(),
        },
        create: {
          cle: validation.data.cle,
          valeur: validation.data.valeur,
          description: '',
          updated_at: new Date(),
        },
      })
    }

    revalidatePath('/parametres')
    return succes()
  } catch {
    return erreur('Erreur lors de la mise à jour des paramètres.')
  }
}

export async function getUsers(): Promise<ActionResult<Profile[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).profile.findMany({
      orderBy: { created_at: 'asc' },
    })
    return succes(rows.map(prismaToProfile))
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

    // Invitation via Supabase Admin API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email: validation.data.email,
        email_confirm: true,
        user_metadata: { role: validation.data.role },
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      return erreur(`Erreur Supabase : ${err.message ?? res.statusText}`)
    }

    const { id: userId } = await res.json()

    // Créer le profil dans notre DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).profile.upsert({
      where: { id: userId },
      update: { role: validation.data.role, personne_id: personneId ?? null },
      create: {
        id: userId,
        email: validation.data.email,
        nom: '',
        prenom: '',
        role: validation.data.role,
        personne_id: personneId ?? null,
      },
    })

    revalidatePath('/parametres')
    return succes()
  } catch (err) {
    return erreur(`Erreur lors de l'invitation : ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function testerBexioApiKey(
  apiKey: string
): Promise<ActionResult<{ valide: boolean }>> {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return erreur('Clé API vide.')
    }

    const res = await fetch('https://api.bexio.com/2.0/users/me', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    return succes({ valide: res.ok })
  } catch {
    return erreur('Erreur lors du test de la clé API Bexio.')
  }
}
