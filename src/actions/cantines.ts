'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
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
// Mappings DB ↔ UI
// ============================================================

const STATUT_DB_TO_UI: Record<string, string> = {
  EnAttente: 'En attente',
  Valide:    'Validé',
}
const STATUT_UI_TO_DB: Record<string, string> = {
  'En attente': 'EnAttente',
  'Validé':     'Valide',
}

// ============================================================
// Helper de calcul
// ============================================================

function calculerCantine(recette_brute: number, charges: number) {
  const benefice_net       = recette_brute - charges
  const part_club_60       = Math.round(benefice_net * 0.6  * 100) / 100
  const part_cantiniers_40 = Math.round(benefice_net * 0.4  * 100) / 100
  return { benefice_net, part_club_60, part_cantiniers_40 }
}

// ============================================================
// Helper de conversion Prisma → type métier
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaToCantine(c: any): Cantine {
  return {
    id: c.id,
    periode: c.periode,
    cantine: c.cantine,
    recette_brute:      Number(c.recette_brute),
    charges:            Number(c.charges),
    benefice_net:       Number(c.benefice_net),
    part_club_60:       Number(c.part_club_60),
    part_cantiniers_40: Number(c.part_cantiniers_40),
    personne_id: c.personne_id,
    part_cantinier: Number(c.part_cantinier),
    statut: (STATUT_DB_TO_UI[c.statut] ?? c.statut) as Cantine['statut'],
    date_paiement: c.date_paiement instanceof Date
      ? c.date_paiement.toISOString().split('T')[0]
      : (c.date_paiement ?? null),
    notes: c.notes ?? null,
    created_at: c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
  }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {}
    if (filters?.periode) where.periode = filters.periode
    if (filters?.cantine) where.cantine = filters.cantine
    if (filters?.statut) where.statut = STATUT_UI_TO_DB[filters.statut] ?? filters.statut

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).cantine.findMany({
      where,
      orderBy: { created_at: 'desc' },
    })

    return succes(rows.map(prismaToCantine))
  } catch {
    return erreur('Erreur lors du chargement des cantines.')
  }
}

export async function createCantine(data: CantineFormData): Promise<ActionResult<Cantine>> {
  try {
    const validation = cantineSchema.safeParse(data)
    if (!validation.success) {
      return erreur(validation.error.issues[0]?.message ?? 'Données invalides.')
    }

    const calculs = calculerCantine(validation.data.recette_brute, validation.data.charges)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (prisma as any).cantine.create({
      data: {
        periode:            validation.data.periode,
        cantine:            validation.data.cantine,
        recette_brute:      validation.data.recette_brute,
        charges:            validation.data.charges,
        benefice_net:       calculs.benefice_net,
        part_club_60:       calculs.part_club_60,
        part_cantiniers_40: calculs.part_cantiniers_40,
        personne_id:        validation.data.personne_id,
        part_cantinier:     calculs.part_cantiniers_40,
        statut:             'EnAttente',
        date_paiement:      validation.data.date_paiement
                              ? new Date(validation.data.date_paiement)
                              : null,
        notes:              validation.data.notes ?? null,
      },
    })

    revalidatePath('/cantines')
    return succes(prismaToCantine(created))
  } catch {
    return erreur('Erreur lors de la création de la cantine.')
  }
}

export async function validerCantine(id: string): Promise<ActionResult<Cantine>> {
  try {
    if (!id) return erreur('ID requis.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).cantine.findUnique({ where: { id } })
    if (!existing) return erreur('Cantine introuvable.')
    if (existing.statut === 'Valide') return erreur('Cette cantine est déjà validée.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).cantine.update({
      where: { id },
      data: { statut: 'Valide' },
    })

    revalidatePath('/cantines')
    revalidatePath('/generer')
    return succes(prismaToCantine(updated))
  } catch {
    return erreur('Erreur lors de la validation de la cantine.')
  }
}
