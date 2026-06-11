'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { createClient } from '@/lib/supabase/server'
import { succes, erreur } from '@/lib/utils'
import { calculerHeuresDecimal, isHoraireValide } from '@/lib/metier/charges'
import type { ActionResult, Heure, HeureFormData } from '@/types'

// ============================================================
// Schéma de validation
// ============================================================

const heureSchema = z.object({
  personne_id: z.string().uuid('ID personne invalide'),
  date_travail: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD)'),
  heure_debut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure de début invalide (HH:MM)'),
  heure_fin: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure de fin invalide (HH:MM)'),
  activite: z.string().min(1, "L'activité est requise"),
  remarques: z.string().optional(),
}).refine(
  (data) => {
    const debut = data.heure_debut.replace(':', '')
    const fin = data.heure_fin.replace(':', '')
    return fin > debut
  },
  { message: "L'heure de fin doit être postérieure à l'heure de début", path: ['heure_fin'] }
).refine(
  (data) => {
    const today = new Date().toISOString().split('T')[0]
    return data.date_travail <= today
  },
  { message: 'La date ne peut pas être dans le futur', path: ['date_travail'] }
)

// ============================================================
// Helper de conversion Prisma → type métier
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaToHeure(h: any): Heure {
  return {
    id: h.id,
    personne_id: h.personne_id,
    date_travail: h.date_travail instanceof Date
      ? h.date_travail.toISOString().split('T')[0]
      : String(h.date_travail),
    heure_debut: h.heure_debut,
    heure_fin: h.heure_fin,
    heures_decimal: Number(h.heures_decimal),
    activite: h.activite,
    remarques: h.remarques ?? null,
    created_at: h.created_at instanceof Date ? h.created_at.toISOString() : String(h.created_at),
    created_by: h.created_by,
  }
}

// ============================================================
// ACTIONS
// ============================================================

export async function getHeures(filters?: {
  personne_id?: string
  mois?: number
  annee?: number
}): Promise<ActionResult<Heure[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {}

    if (filters?.personne_id) {
      where.personne_id = filters.personne_id
    }
    if (filters?.annee && filters?.mois) {
      where.date_travail = {
        gte: new Date(filters.annee, filters.mois - 1, 1),
        lte: new Date(filters.annee, filters.mois, 0, 23, 59, 59),
      }
    } else if (filters?.annee) {
      where.date_travail = {
        gte: new Date(filters.annee, 0, 1),
        lte: new Date(filters.annee, 11, 31, 23, 59, 59),
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).heure.findMany({
      where,
      orderBy: { date_travail: 'desc' },
    })

    return succes(rows.map(prismaToHeure))
  } catch {
    return erreur('Erreur lors du chargement des heures.')
  }
}

export async function createHeure(data: HeureFormData): Promise<ActionResult<Heure>> {
  try {
    // Récupérer l'utilisateur authentifié (created_by = session user → FK auth.users valide)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return erreur('Utilisateur non authentifié.')
    }

    const validation = heureSchema.safeParse(data)
    if (!validation.success) {
      return erreur(validation.error.issues[0]?.message ?? 'Données invalides.')
    }

    if (!isHoraireValide(validation.data.heure_debut)) {
      return erreur('Heure de début invalide.')
    }
    if (!isHoraireValide(validation.data.heure_fin)) {
      return erreur('Heure de fin invalide.')
    }

    const heures_decimal = calculerHeuresDecimal(
      validation.data.heure_debut,
      validation.data.heure_fin
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma as any).heure.create({
      data: {
        personne_id:   validation.data.personne_id,
        date_travail:  new Date(validation.data.date_travail),
        heure_debut:   validation.data.heure_debut,
        heure_fin:     validation.data.heure_fin,
        heures_decimal,
        activite:      validation.data.activite,
        remarques:     validation.data.remarques ?? null,
        created_by:    user.id,  // ID auth.users de l'utilisateur connecté (respecte la FK)
      },
    })

    revalidatePath('/heures')
    revalidatePath(`/personnes/${validation.data.personne_id}`)
    return succes(prismaToHeure(created))
  } catch {
    return erreur("Erreur lors de l'enregistrement des heures.")
  }
}

export async function deleteHeure(id: string): Promise<ActionResult> {
  try {
    if (!id) return erreur('ID requis.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heure = await (prisma as any).heure.findUnique({ where: { id } })
    if (!heure) return erreur('Heure introuvable.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).heure.delete({ where: { id } })

    revalidatePath('/heures')
    revalidatePath(`/personnes/${heure.personne_id}`)
    return succes()
  } catch {
    return erreur('Erreur lors de la suppression.')
  }
}
