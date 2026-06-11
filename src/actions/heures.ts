'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
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
// MOCK DATA
// ============================================================

const MOCK_HEURES: Heure[] = [
  {
    id: 'heure-001',
    personne_id: 'pers-002',
    date_travail: '2026-05-03',
    heure_debut: '09:00',
    heure_fin: '15:00',
    heures_decimal: 6,
    activite: 'Match à domicile',
    remarques: null,
    created_at: '2026-05-03T16:00:00Z',
    created_by: 'pers-002',
  },
  {
    id: 'heure-002',
    personne_id: 'pers-002',
    date_travail: '2026-05-10',
    heure_debut: '09:00',
    heure_fin: '14:00',
    heures_decimal: 5,
    activite: 'Match à domicile',
    remarques: 'Match reporté, service plus court',
    created_at: '2026-05-10T15:00:00Z',
    created_by: 'pers-002',
  },
  {
    id: 'heure-003',
    personne_id: 'pers-001',
    date_travail: '2026-05-05',
    heure_debut: '14:00',
    heure_fin: '17:30',
    heures_decimal: 3.5,
    activite: 'Entraînement + soins',
    remarques: null,
    created_at: '2026-05-05T18:00:00Z',
    created_by: 'pers-001',
  },
]

// ============================================================
// ACTIONS
// ============================================================

export async function getHeures(filters?: {
  personne_id?: string
  mois?: number
  annee?: number
}): Promise<ActionResult<Heure[]>> {
  try {
    let result = [...MOCK_HEURES]

    if (filters?.personne_id) {
      result = result.filter((h) => h.personne_id === filters.personne_id)
    }

    if (filters?.annee && filters?.mois) {
      const prefix = `${filters.annee}-${String(filters.mois).padStart(2, '0')}`
      result = result.filter((h) => h.date_travail.startsWith(prefix))
    } else if (filters?.annee) {
      result = result.filter((h) => h.date_travail.startsWith(String(filters.annee)))
    }

    return succes(result)
  } catch {
    return erreur('Erreur lors du chargement des heures.')
  }
}

export async function createHeure(
  data: HeureFormData
): Promise<ActionResult<Heure>> {
  try {
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

    // TODO: prisma.heure.create(...)
    const nouvelleHeure = {
      id: `heure-${Date.now()}`,
      ...validation.data,
      heures_decimal,
      remarques: validation.data.remarques ?? null,
      created_at: new Date().toISOString(),
      created_by: validation.data.personne_id,
    }

    revalidatePath('/heures')
    revalidatePath(`/personnes/${validation.data.personne_id}`)
    return succes(nouvelleHeure as unknown as Heure)
  } catch {
    return erreur("Erreur lors de l'enregistrement des heures.")
  }
}

export async function deleteHeure(id: string): Promise<ActionResult> {
  try {
    if (!id) return erreur('ID requis.')

    // TODO: prisma.heure.delete(...)
    const heure = MOCK_HEURES.find((h) => h.id === id)
    if (!heure) return erreur('Heure introuvable.')

    revalidatePath('/heures')
    revalidatePath(`/personnes/${heure.personne_id}`)
    return succes()
  } catch {
    return erreur('Erreur lors de la suppression.')
  }
}
