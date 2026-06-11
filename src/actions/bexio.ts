'use server'

import { revalidatePath } from 'next/cache'
import { succes, erreur } from '@/lib/utils'
import type { ActionResult, BexioExport } from '@/types'

// ============================================================
// MOCK DATA
// ============================================================

const MOCK_EXPORTS: BexioExport[] = [
  {
    id: 'bxo-001',
    paiement_id: 'pay-003',
    date_ecriture: '2026-05-01',
    description: 'Défraiement T2 25-26 — Jean-Baptiste Martin',
    compte_debit: '5000',
    compte_credit: '1020',
    montant: 3500,
    bexio_ref: null,
    statut: 'À exporter',
    erreur_msg: null,
    created_at: '2026-05-20T10:00:00Z',
  },
  {
    id: 'bxo-002',
    paiement_id: 'pay-004',
    date_ecriture: '2026-04-30',
    description: 'Salaire 04/2026 — Ana Emery',
    compte_debit: '5000',
    compte_credit: '1020',
    montant: 739.26,
    bexio_ref: 'BXO-4441',
    statut: 'Envoyé',
    erreur_msg: null,
    created_at: '2026-04-30T16:00:00Z',
  },
]

// ============================================================
// ACTIONS
// ============================================================

export async function getExports(): Promise<ActionResult<BexioExport[]>> {
  try {
    // TODO: prisma.bexioExport.findMany({ include: { paiement: true } })
    return succes(MOCK_EXPORTS)
  } catch {
    return erreur('Erreur lors du chargement des exports Bexio.')
  }
}

export async function genererExports(): Promise<ActionResult<{ nb_crees: number }>> {
  try {
    // TODO:
    // 1. Récupérer les paiements Validé/Payé sans bexio_export existant
    // 2. Pour chaque paiement, créer les écritures comptables
    //    - Écriture principale: débit 5000 (Salaires), crédit 1020 (Banque)
    //    - Si soumis_charges: écritures supplémentaires pour 2270/2271/2272/2273
    // 3. Créer les entrées dans bexio_exports

    revalidatePath('/bexio')
    return succes({ nb_crees: 1 })
  } catch {
    return erreur('Erreur lors de la génération des exports.')
  }
}

export async function envoyerVersBexio(
  exportIds?: string[]
): Promise<ActionResult<{ envoyes: number; erreurs: number }>> {
  try {
    // TODO:
    // 1. Récupérer les exports À exporter (filtrés par exportIds si fourni)
    // 2. Pour chaque export, appeler l'API Bexio:
    //    POST https://api.bexio.com/2.0/accounting/manual_entries
    //    Authorization: Bearer {bexio_api_key}
    // 3. Mettre à jour le statut: Envoyé ou Erreur
    // 4. Stocker la ref Bexio retournée dans bexio_ref

    revalidatePath('/bexio')
    return succes({ envoyes: 0, erreurs: 0 })
  } catch {
    return erreur("Erreur lors de l'envoi vers Bexio.")
  }
}
