'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { succes, erreur } from '@/lib/utils'
import type { ActionResult, Cantine, CantineFormData } from '@/types'

// ============================================================
// Schéma de validation
// ============================================================

const cantineSchema = z.object({
  periode: z.string().min(1, 'La période est requise'),
  cantine: z.enum(['Principale', 'Juniors Synthétique'], {
    errorMap: () => ({ message: 'Cantine invalide' }),
  }),
  recette_brute: z.number().min(0, 'La recette brute doit être positive'),
  charges: z.number().min(0, 'Les charges doivent être positives'),
  personne_id: z.string().uuid('ID personne invalide'),
  date_paiement: z.string().optional(),
  notes: z.string().optional(),
})

// ============================================================
// MOCK DATA
// ============================================================

const MOCK_CANTINES: Cantine[] = [
  {
    id: 'cant-001',
    periode: '2026-04',
    cantine: 'Principale',
    recette_brute: 4200,
    charges: 820,
    benefice_net: 3380,
    part_club_60: 2028,
    part_cantiniers_40: 1352,
    personne_id: 'pers-002',
    part_cantinier: 1352,
    statut: 'Validé',
    date_paiement: '2026-04-30',
    notes: null,
    created_at: '2026-05-01T08:00:00Z',
  },
  {
    id: 'cant-002',
    periode: '2026-05',
    cantine: 'Principale',
    recette_brute: 3800,
    charges: 750,
    benefice_net: 3050,
    part_club_60: 1830,
    part_cantiniers_40: 1220,
    personne_id: 'pers-002',
    part_cantinier: 1220,
    statut: 'En attente',
    date_paiement: null,
    notes: 'Match en retard',
    created_at: '2026-05-20T09:00:00Z',
  },
]

// ============================================================
// Calculs
// ============================================================

function calculerCantine(recette_brute: number, charges: number, part_cantinier_custom?: number) {
  const benefice_net = recette_brute - charges
  const part_club_60 = Math.round(benefice_net * 0.6 * 100) / 100
  const part_cantiniers_40 = Math.round(benefice_net * 0.4 * 100) / 100
  const part_cantinier = part_cantinier_custom ?? part_cantiniers_40

  return { benefice_net, part_club_60, part_cantiniers_40, part_cantinier }
}

// ============================================================
// ACTIONS
// ============================================================

export async function getCantines(filters?: {
  periode?: string
  cantine?: string
  statut?: string
}): Promise<ActionResult<Cantine[]>> {
  try {
    let result = [...MOCK_CANTINES]

    if (filters?.periode) {
      result = result.filter((c) => c.periode === filters.periode)
    }
    if (filters?.cantine) {
      result = result.filter((c) => c.cantine === filters.cantine)
    }
    if (filters?.statut) {
      result = result.filter((c) => c.statut === filters.statut)
    }

    return succes(result)
  } catch {
    return erreur('Erreur lors du chargement des cantines.')
  }
}

export async function createCantine(
  data: CantineFormData
): Promise<ActionResult<Cantine>> {
  try {
    const validation = cantineSchema.safeParse(data)
    if (!validation.success) {
      return erreur(validation.error.issues[0]?.message ?? 'Données invalides.')
    }

    const calculs = calculerCantine(
      validation.data.recette_brute,
      validation.data.charges
    )

    // TODO: prisma.cantine.create(...)
    const nouvelleCantine = {
      id: `cant-${Date.now()}`,
      ...validation.data,
      ...calculs,
      cantine: validation.data.cantine,
      statut: 'En attente',
      date_paiement: validation.data.date_paiement ?? null,
      notes: validation.data.notes ?? null,
      created_at: new Date().toISOString(),
    }

    revalidatePath('/cantines')
    return succes(nouvelleCantine as unknown as Cantine)
  } catch {
    return erreur('Erreur lors de la création de la cantine.')
  }
}

export async function validerCantine(id: string): Promise<ActionResult<Cantine>> {
  try {
    if (!id) return erreur('ID requis.')

    const cantine = MOCK_CANTINES.find((c) => c.id === id)
    if (!cantine) return erreur('Cantine introuvable.')
    if (cantine.statut === 'Validé') {
      return erreur('Cette cantine est déjà validée.')
    }

    // TODO: prisma.cantine.update(...)
    const updated: Cantine = {
      ...cantine,
      statut: 'Validé',
    }

    revalidatePath('/cantines')
    revalidatePath('/generer')
    return succes(updated)
  } catch {
    return erreur('Erreur lors de la validation de la cantine.')
  }
}
