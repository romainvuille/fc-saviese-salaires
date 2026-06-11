'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { succes, erreur } from '@/lib/utils'
import {
  genererPaiementsMensuels,
  genererPaiementsTour,
  genererPaiementsHoraires,
  genererPaiementsCantines,
} from '@/lib/metier/paiements'
import type { ActionResult, Paiement, StatutPaiement, ResultatGeneration } from '@/types'

// ============================================================
// Schémas de validation
// ============================================================

const statutSchema = z.enum(['À valider', 'Validé', 'Payé', 'Annulé'])

const filtresPaiementSchema = z.object({
  statut: z.string().optional(),
  periode: z.string().optional(),
  type_paiement: z.string().optional(),
  personne_search: z.string().optional(),
  personne_id: z.string().optional(),
  annee: z.number().optional(),
})

// ============================================================
// Mappings DB ↔ UI
// ============================================================

const STATUT_DB_TO_UI: Record<string, StatutPaiement> = {
  AValider: 'À valider',
  Valide:   'Validé',
  Paye:     'Payé',
  Annule:   'Annulé',
}
const STATUT_UI_TO_DB: Record<string, string> = {
  'À valider': 'AValider',
  'Validé':    'Valide',
  'Payé':      'Paye',
  'Annulé':    'Annule',
}
const TYPE_DB_TO_UI: Record<string, string> = {
  Salaire:     'Salaire',
  Defraiement: 'Défraiement',
}

// ============================================================
// Helper de conversion Prisma → type métier
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaToPayment(p: any): Paiement {
  return {
    id: p.id,
    pay_code: p.pay_code,
    date_paiement: p.date_paiement instanceof Date
      ? p.date_paiement.toISOString().split('T')[0]
      : String(p.date_paiement),
    personne_id: p.personne_id,
    nom_complet: p.nom_complet,
    categorie: p.categorie,
    periode: p.periode,
    type_paiement: (TYPE_DB_TO_UI[p.type_paiement] ?? p.type_paiement) as Paiement['type_paiement'],
    brut: Number(p.brut),
    retenue_avs: Number(p.retenue_avs),
    retenue_ac: Number(p.retenue_ac),
    retenue_laa: Number(p.retenue_laa),
    retenue_alfa: Number(p.retenue_alfa),
    total_retenues: Number(p.total_retenues),
    net: Number(p.net),
    statut: (STATUT_DB_TO_UI[p.statut] ?? p.statut) as StatutPaiement,
    date_virement: p.date_virement instanceof Date
      ? p.date_virement.toISOString().split('T')[0]
      : (p.date_virement ?? null),
    bexio_ref: p.bexio_ref ?? null,
    fiche_url: p.fiche_url ?? null,
    created_at: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    updated_at: p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  }
}

// ============================================================
// ACTIONS
// ============================================================

export async function getPaiements(filters?: {
  statut?: string
  periode?: string
  type_paiement?: string
  personne_search?: string
  personne_id?: string
  annee?: number
}): Promise<ActionResult<Paiement[]>> {
  try {
    const parsed = filtresPaiementSchema.safeParse(filters ?? {})
    if (!parsed.success) return erreur('Filtres invalides.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {}

    if (parsed.data.statut) {
      where.statut = STATUT_UI_TO_DB[parsed.data.statut] ?? parsed.data.statut
    }
    if (parsed.data.periode) {
      where.periode = parsed.data.periode
    }
    if (parsed.data.type_paiement) {
      where.type_paiement =
        parsed.data.type_paiement === 'Défraiement' ? 'Defraiement' : parsed.data.type_paiement
    }
    if (parsed.data.personne_id) {
      where.personne_id = parsed.data.personne_id
    }
    if (parsed.data.annee) {
      where.date_paiement = {
        gte: new Date(parsed.data.annee, 0, 1),
        lte: new Date(parsed.data.annee, 11, 31, 23, 59, 59),
      }
    }
    if (parsed.data.personne_search) {
      const q = parsed.data.personne_search
      where.OR = [
        { nom_complet: { contains: q, mode: 'insensitive' } },
        { pay_code:    { contains: q, mode: 'insensitive' } },
      ]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).paiement.findMany({
      where,
      orderBy: [{ date_paiement: 'desc' }, { pay_code: 'desc' }],
    })

    return succes(rows.map(prismaToPayment))
  } catch {
    return erreur('Erreur lors du chargement des paiements.')
  }
}

export async function updateStatutPaiement(
  id: string,
  statut: StatutPaiement,
  dateVirement?: string
): Promise<ActionResult<Paiement>> {
  try {
    const statutValidation = statutSchema.safeParse(statut)
    if (!statutValidation.success) return erreur('Statut invalide.')

    if (statut === 'Payé' && !dateVirement) {
      return erreur('Une date de virement est requise pour le statut "Payé".')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {
      statut: STATUT_UI_TO_DB[statut],
    }
    if (dateVirement) {
      data.date_virement = new Date(dateVirement)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (prisma as any).paiement.update({
      where: { id },
      data,
    })

    revalidatePath('/paiements')
    revalidatePath('/dashboard')
    return succes(prismaToPayment(updated))
  } catch {
    return erreur('Erreur lors de la mise à jour du statut.')
  }
}

export async function genererPaiements(
  type: 'mensuel' | 'saisonnier' | 'horaire' | 'cantine',
  params: {
    mois?: number
    annee?: number
    tour?: string
    periode_cantine?: string
  }
): Promise<ActionResult<ResultatGeneration>> {
  try {
    // Validation des paramètres selon le type
    if (type === 'mensuel' || type === 'horaire') {
      if (!params.mois || !params.annee) return erreur('Mois et année requis.')
      if (params.mois < 1 || params.mois > 12) return erreur('Mois invalide (1-12).')
    }
    if (type === 'saisonnier') {
      if (!params.tour) return erreur('Tour requis (ex: T2 25-26).')
      if (!/^(T1|T2)\s+\d{2}-\d{2}$/i.test(params.tour)) {
        return erreur('Format de tour invalide. Attendu : T1 XX-YY ou T2 XX-YY')
      }
    }
    if (type === 'cantine') {
      if (!params.periode_cantine) return erreur('Période cantine requise.')
    }

    let result: ResultatGeneration

    if (type === 'mensuel') {
      result = await genererPaiementsMensuels(params.annee!, params.mois!)
    } else if (type === 'saisonnier') {
      result = await genererPaiementsTour(params.tour!)
    } else if (type === 'horaire') {
      result = await genererPaiementsHoraires(params.annee!, params.mois!)
    } else {
      result = await genererPaiementsCantines(params.periode_cantine!)
    }

    revalidatePath('/paiements')
    revalidatePath('/dashboard')
    return succes(result)
  } catch (err) {
    return erreur(
      `Erreur lors de la génération : ${err instanceof Error ? err.message : String(err)}`
    )
  }
}
