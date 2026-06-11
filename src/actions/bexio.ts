'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { succes, erreur } from '@/lib/utils'
import type { ActionResult, BexioExport } from '@/types'

// ============================================================
// Mappings DB ↔ UI
// ============================================================

const STATUT_DB_TO_UI: Record<string, string> = {
  AExporter: 'À exporter',
  Envoye:    'Envoyé',
  Erreur:    'Erreur',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaToExport(e: any): BexioExport {
  return {
    id: e.id,
    paiement_id: e.paiement_id,
    date_ecriture: e.date_ecriture instanceof Date
      ? e.date_ecriture.toISOString().split('T')[0]
      : String(e.date_ecriture),
    description: e.description,
    compte_debit: e.compte_debit,
    compte_credit: e.compte_credit,
    montant: Number(e.montant),
    bexio_ref: e.bexio_ref ?? null,
    statut: (STATUT_DB_TO_UI[e.statut] ?? e.statut) as BexioExport['statut'],
    erreur_msg: e.erreur_msg ?? null,
    created_at: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
  }
}

// ============================================================
// ACTIONS
// ============================================================

export async function getExports(): Promise<ActionResult<BexioExport[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).bexioExport.findMany({
      orderBy: { created_at: 'desc' },
    })
    return succes(rows.map(prismaToExport))
  } catch {
    return erreur('Erreur lors du chargement des exports Bexio.')
  }
}

export async function genererExports(): Promise<ActionResult<{ nb_crees: number }>> {
  try {
    // Paiements Validé/Payé sans export existant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paiements = await (prisma as any).paiement.findMany({
      where: {
        statut: { in: ['Valide', 'Paye'] },
        bexio_exports: { none: {} },
      },
      include: { personne: true },
    })

    let nb_crees = 0
    const dateEcriture = new Date()

    for (const p of paiements) {
      // Écriture principale : débit 5000 (Charges salariales), crédit 1020 (Banque)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).bexioExport.create({
        data: {
          paiement_id:  p.id,
          date_ecriture: dateEcriture,
          description:  `${p.type_paiement === 'Salaire' ? 'Salaire' : 'Défraiement'} ${p.periode} — ${p.nom_complet}`,
          compte_debit:  '5000',
          compte_credit: '1020',
          montant:       Number(p.net),
          statut:        'AExporter',
        },
      })
      nb_crees++

      // Si soumis aux charges → écritures supplémentaires pour chaque retenue
      if (p.personne?.soumis_charges && Number(p.total_retenues) > 0) {
        const retenuesMap: Array<{ compte: string; montant: number }> = [
          { compte: '2270', montant: Number(p.retenue_avs)  },
          { compte: '2271', montant: Number(p.retenue_ac)   },
          { compte: '2272', montant: Number(p.retenue_laa)  },
          { compte: '2273', montant: Number(p.retenue_alfa) },
        ].filter((r) => r.montant > 0)

        for (const retenue of retenuesMap) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any).bexioExport.create({
            data: {
              paiement_id:   p.id,
              date_ecriture: dateEcriture,
              description:   `Retenue charge ${retenue.compte} — ${p.nom_complet} ${p.periode}`,
              compte_debit:  '5000',
              compte_credit: retenue.compte,
              montant:       retenue.montant,
              statut:        'AExporter',
            },
          })
          nb_crees++
        }
      }
    }

    revalidatePath('/bexio')
    return succes({ nb_crees })
  } catch (err) {
    return erreur(`Erreur lors de la génération des exports : ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function envoyerVersBexio(
  exportIds?: string[]
): Promise<ActionResult<{ envoyes: number; erreurs: number }>> {
  try {
    // Récupérer la clé API depuis les paramètres
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const param = await (prisma as any).parametre.findUnique({
      where: { cle: 'bexio_api_key' },
    })
    const apiKey = param?.valeur ?? ''
    if (!apiKey) return erreur('Clé API Bexio non configurée dans les paramètres.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { statut: 'AExporter' }
    if (exportIds && exportIds.length > 0) {
      where.id = { in: exportIds }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exports = await (prisma as any).bexioExport.findMany({ where })

    let envoyes = 0
    let erreurs = 0

    for (const exp of exports) {
      try {
        const res = await fetch('https://api.bexio.com/2.0/accounting/manual_entries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            date:          exp.date_ecriture,
            description:   exp.description,
            debit_account: exp.compte_debit,
            credit_account: exp.compte_credit,
            amount:        Number(exp.montant),
          }),
        })

        if (res.ok) {
          const data = await res.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any).bexioExport.update({
            where: { id: exp.id },
            data: { statut: 'Envoye', bexio_ref: String(data.id ?? ''), erreur_msg: null },
          })
          envoyes++
        } else {
          const err = await res.text()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any).bexioExport.update({
            where: { id: exp.id },
            data: { statut: 'Erreur', erreur_msg: err.slice(0, 500) },
          })
          erreurs++
        }
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).bexioExport.update({
          where: { id: exp.id },
          data: { statut: 'Erreur', erreur_msg: e instanceof Error ? e.message : String(e) },
        })
        erreurs++
      }
    }

    revalidatePath('/bexio')
    return succes({ envoyes, erreurs })
  } catch (err) {
    return erreur(`Erreur lors de l'envoi vers Bexio : ${err instanceof Error ? err.message : String(err)}`)
  }
}
