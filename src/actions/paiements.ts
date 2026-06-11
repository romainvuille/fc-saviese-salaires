'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { succes, erreur } from '@/lib/utils'
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
// MOCK DATA
// ============================================================

const MOCK_PAIEMENTS: Paiement[] = [
  {
    id: 'pay-001',
    pay_code: 'PAY00001',
    date_paiement: '2026-05-31',
    personne_id: 'pers-001',
    nom_complet: 'Ana Emery',
    categorie: 'Soigneur',
    periode: '05/2026',
    type_paiement: 'Salaire',
    brut: 800,
    retenue_avs: 42.40,
    retenue_ac: 8.80,
    retenue_laa: 8.49,
    retenue_alfa: 1.05,
    total_retenues: 60.74,
    net: 739.26,
    statut: 'À valider',
    date_virement: null,
    bexio_ref: null,
    fiche_url: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
  },
  {
    id: 'pay-002',
    pay_code: 'PAY00002',
    date_paiement: '2026-05-31',
    personne_id: 'pers-002',
    nom_complet: 'Sergio Lopez',
    categorie: 'Cantinier',
    periode: '05/2026',
    type_paiement: 'Salaire',
    brut: 1320,
    retenue_avs: 69.96,
    retenue_ac: 14.52,
    retenue_laa: 14.00,
    retenue_alfa: 1.73,
    total_retenues: 100.21,
    net: 1219.79,
    statut: 'À valider',
    date_virement: null,
    bexio_ref: null,
    fiche_url: null,
    created_at: '2026-05-20T10:05:00Z',
    updated_at: '2026-05-20T10:05:00Z',
  },
  {
    id: 'pay-003',
    pay_code: 'PAY00003',
    date_paiement: '2026-06-30',
    personne_id: 'pers-003',
    nom_complet: 'Jean-Baptiste Martin',
    categorie: 'Coach J-B',
    periode: 'T2 25-26',
    type_paiement: 'Défraiement',
    brut: 3500,
    retenue_avs: 0,
    retenue_ac: 0,
    retenue_laa: 0,
    retenue_alfa: 0,
    total_retenues: 0,
    net: 3500,
    statut: 'Validé',
    date_virement: null,
    bexio_ref: null,
    fiche_url: null,
    created_at: '2026-05-01T09:00:00Z',
    updated_at: '2026-05-15T14:00:00Z',
  },
  {
    id: 'pay-004',
    pay_code: 'PAY00004',
    date_paiement: '2026-04-30',
    personne_id: 'pers-001',
    nom_complet: 'Ana Emery',
    categorie: 'Soigneur',
    periode: '04/2026',
    type_paiement: 'Salaire',
    brut: 800,
    retenue_avs: 42.40,
    retenue_ac: 8.80,
    retenue_laa: 8.49,
    retenue_alfa: 1.05,
    total_retenues: 60.74,
    net: 739.26,
    statut: 'Payé',
    date_virement: '2026-04-30',
    bexio_ref: 'BXO-4441',
    fiche_url: null,
    created_at: '2026-04-20T10:00:00Z',
    updated_at: '2026-04-30T16:00:00Z',
  },
]

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

    let result = [...MOCK_PAIEMENTS]

    if (parsed.data.statut) {
      result = result.filter((p) => p.statut === parsed.data.statut)
    }
    if (parsed.data.periode) {
      result = result.filter((p) => p.periode === parsed.data.periode)
    }
    if (parsed.data.type_paiement) {
      result = result.filter((p) => p.type_paiement === parsed.data.type_paiement)
    }
    if (parsed.data.personne_search) {
      const q = parsed.data.personne_search.toLowerCase()
      result = result.filter(
        (p) =>
          p.nom_complet.toLowerCase().includes(q) ||
          p.pay_code.toLowerCase().includes(q)
      )
    }
    if (parsed.data.personne_id) {
      result = result.filter((p) => p.personne_id === parsed.data.personne_id)
    }
    if (parsed.data.annee) {
      result = result.filter((p) =>
        p.date_paiement.startsWith(String(parsed.data.annee))
      )
    }

    return succes(result)
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

    // TODO: prisma.paiement.update(...)
    const paiement = MOCK_PAIEMENTS.find((p) => p.id === id)
    if (!paiement) return erreur('Paiement introuvable.')

    const updated: Paiement = {
      ...paiement,
      statut,
      date_virement: dateVirement ?? paiement.date_virement,
      updated_at: new Date().toISOString(),
    }

    revalidatePath('/paiements')
    revalidatePath('/dashboard')
    return succes(updated)
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
      if (!params.mois || !params.annee) {
        return erreur('Mois et année requis.')
      }
      if (params.mois < 1 || params.mois > 12) {
        return erreur('Mois invalide (1-12).')
      }
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

    // TODO: Appeler les vraies fonctions de génération depuis @/lib/metier/paiements
    // ex: genererPaiementsMensuels(annee, mois)
    // Pour l'instant, mock
    const result: ResultatGeneration = {
      generes: 2,
      ignores: 1,
      erreurs: [],
      paiements: MOCK_PAIEMENTS.slice(0, 2),
    }

    revalidatePath('/paiements')
    revalidatePath('/dashboard')
    return succes(result)
  } catch {
    return erreur('Erreur lors de la génération des paiements.')
  }
}
