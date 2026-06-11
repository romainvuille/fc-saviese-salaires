// ============================================================
// FC Savièse — Logique de génération des paiements
// ============================================================

import { prisma } from '@/lib/db'
import { calculerRetenues, parseParametres } from './charges'
import {
  periodeLabel,
  datePaiementTour,
  datePaiementMensuel,
  getMoisPayes,
} from './dates'
import type { Parametres, ResultatGeneration, Paiement } from '@/types'

// ============================================================
// HELPERS INTERNES
// ============================================================

/**
 * Génère un code paiement au format PAY00001.
 */
export function genererPayCode(compteur: number): string {
  return `PAY${String(compteur).padStart(5, '0')}`
}

/**
 * Vérifie si un paiement existe déjà pour une personne/période.
 */
export async function paiementExisteDeja(
  personneId: string,
  periode: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (prisma as any).paiement.findFirst({
    where: { personne_id: personneId, periode },
    select: { id: true },
  })
  return existing !== null
}

/**
 * Charge les paramètres depuis la DB.
 * Si annee est fourni, utilise les taux de l'année (taux_avs_2026, etc.)
 * avec fallback sur les taux génériques.
 */
async function chargerParametres(annee?: number): Promise<Parametres> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).parametre.findMany({
    select: { cle: true, valeur: true },
  })

  const map: Record<string, string> = {}
  for (const row of rows) {
    map[row.cle] = row.valeur
  }

  // Si une année est précisée, on surcharge les taux génériques par les taux de l'année
  if (annee) {
    const suffix = `_${annee}`
    for (const base of ['taux_avs', 'taux_ac', 'taux_laa', 'taux_alfa']) {
      const key = `${base}${suffix}`
      if (map[key] !== undefined) {
        map[base] = map[key]
      }
    }
  }

  return parseParametres(rows.map((r: { cle: string; valeur: string }) => ({
    cle: map[r.cle] !== undefined && r.cle.startsWith('taux_') && !r.cle.match(/_\d{4}$/)
      ? r.cle
      : r.cle,
    valeur: map[r.cle],
  })))
}

/**
 * Génère le prochain pay_code disponible.
 */
async function prochainPayCode(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dernier = await (prisma as any).paiement.findFirst({
    orderBy: { pay_code: 'desc' },
    select: { pay_code: true },
  })

  if (!dernier) return genererPayCode(1)

  const num = parseInt(dernier.pay_code.replace('PAY', ''), 10)
  return genererPayCode(isNaN(num) ? 1 : num + 1)
}

// ============================================================
// GÉNÉRATION PAIEMENTS MENSUELS
// ============================================================

/**
 * Génère les paiements mensuels pour toutes les personnes
 * en mode "Mensuel fixe" actives dont le mois est inclus dans leurs mois_payes.
 */
export async function genererPaiementsMensuels(
  annee: number,
  mois: number
): Promise<ResultatGeneration> {
  const params = await chargerParametres(annee)
  const periode = periodeLabel(annee, mois)
  const datePaiement = datePaiementMensuel(annee, mois)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personnes = await (prisma as any).personne.findMany({
    where: { statut: 'Actif', mode: 'MensuelFixe' },
  })

  const result: ResultatGeneration = { generes: 0, ignores: 0, erreurs: [], paiements: [] }

  for (const personne of personnes) {
    try {
      // Vérifier mois payés
      const moisPayes = getMoisPayes(personne.mois_payes, params.mois_payes)
      if (!moisPayes.includes(mois)) {
        result.ignores++
        continue
      }

      // Anti-doublon
      if (await paiementExisteDeja(personne.id, periode)) {
        result.ignores++
        continue
      }

      const brut = Number(personne.montant_mois ?? 0)

      // Ignorer silencieusement si montant nul ou négatif
      if (brut <= 0) {
        result.ignores++
        continue
      }

      const retenues = calculerRetenues(brut, personne.soumis_charges, params)
      const payCode = await prochainPayCode()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paiement = await (prisma as any).paiement.create({
        data: {
          pay_code:       payCode,
          date_paiement:  datePaiement,
          personne_id:    personne.id,
          nom_complet:    `${personne.prenom} ${personne.nom}`,
          categorie:      personne.categorie,
          periode,
          type_paiement:  retenues.type === 'Salaire' ? 'Salaire' : 'Defraiement',
          brut,
          retenue_avs:    retenues.avs,
          retenue_ac:     retenues.ac,
          retenue_laa:    retenues.laa,
          retenue_alfa:   retenues.alfa,
          total_retenues: retenues.total,
          net:            retenues.net,
          statut:         'AValider',
        },
      })

      result.generes++
      result.paiements.push(prismaToPayment(paiement))
    } catch (err) {
      result.erreurs.push(
        `${personne.prenom} ${personne.nom} : ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return result
}

// ============================================================
// GÉNÉRATION PAIEMENTS SAISONNIERS
// ============================================================

/**
 * Génère les paiements pour un tour saisonnier (T1 ou T2).
 */
export async function genererPaiementsTour(tour: string): Promise<ResultatGeneration> {
  // Extraire l'année depuis le tour (T1 XX-YY → annee XX, T2 XX-YY → annee YY)
  const match = tour.match(/^(T1|T2)\s+(\d{2})-(\d{2})$/i)
  let annee: number | undefined
  if (match) {
    annee = match[1].toUpperCase() === 'T1'
      ? 2000 + parseInt(match[2], 10)
      : 2000 + parseInt(match[3], 10)
  }

  const params = await chargerParametres(annee)
  const datePaiement = datePaiementTour(tour)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personnes = await (prisma as any).personne.findMany({
    where: { statut: 'Actif', mode: 'SaisonnierFixe' },
  })

  const result: ResultatGeneration = { generes: 0, ignores: 0, erreurs: [], paiements: [] }

  for (const personne of personnes) {
    try {
      if (await paiementExisteDeja(personne.id, tour)) {
        result.ignores++
        continue
      }

      const brut = Number(personne.montant_saison ?? 0)

      if (brut <= 0) {
        result.ignores++
        continue
      }

      const retenues = calculerRetenues(brut, personne.soumis_charges, params)
      const payCode = await prochainPayCode()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paiement = await (prisma as any).paiement.create({
        data: {
          pay_code:       payCode,
          date_paiement:  datePaiement,
          personne_id:    personne.id,
          nom_complet:    `${personne.prenom} ${personne.nom}`,
          categorie:      personne.categorie,
          periode:        tour,
          type_paiement:  retenues.type === 'Salaire' ? 'Salaire' : 'Defraiement',
          brut,
          retenue_avs:    retenues.avs,
          retenue_ac:     retenues.ac,
          retenue_laa:    retenues.laa,
          retenue_alfa:   retenues.alfa,
          total_retenues: retenues.total,
          net:            retenues.net,
          statut:         'AValider',
        },
      })

      result.generes++
      result.paiements.push(prismaToPayment(paiement))
    } catch (err) {
      result.erreurs.push(
        `${personne.prenom} ${personne.nom} : ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return result
}

// ============================================================
// GÉNÉRATION PAIEMENTS HORAIRES
// ============================================================

/**
 * Génère les paiements horaires pour un mois donné.
 */
export async function genererPaiementsHoraires(
  annee: number,
  mois: number
): Promise<ResultatGeneration> {
  const params = await chargerParametres(annee)
  const periode = periodeLabel(annee, mois)
  const datePaiement = datePaiementMensuel(annee, mois)

  const debutMois = new Date(annee, mois - 1, 1)
  const finMois   = new Date(annee, mois, 0, 23, 59, 59)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personnes = await (prisma as any).personne.findMany({
    where: { statut: 'Actif', mode: 'Horaire' },
  })

  const result: ResultatGeneration = { generes: 0, ignores: 0, erreurs: [], paiements: [] }

  for (const personne of personnes) {
    try {
      if (await paiementExisteDeja(personne.id, periode)) {
        result.ignores++
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heures = await (prisma as any).heure.findMany({
        where: {
          personne_id: personne.id,
          date_travail: { gte: debutMois, lte: finMois },
        },
      })

      if (heures.length === 0) {
        result.ignores++
        continue
      }

      const totalHeures = heures.reduce((sum: number, h: { heures_decimal: unknown }) => sum + Number(h.heures_decimal), 0)
      const tauxHoraire = Number(personne.taux_horaire ?? 0)

      if (tauxHoraire <= 0) {
        result.erreurs.push(`${personne.prenom} ${personne.nom} : taux horaire non défini`)
        continue
      }

      const brut = Math.round(totalHeures * tauxHoraire * 100) / 100

      if (brut <= 0) {
        result.ignores++
        continue
      }

      const retenues = calculerRetenues(brut, personne.soumis_charges, params)
      const payCode = await prochainPayCode()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paiement = await (prisma as any).paiement.create({
        data: {
          pay_code:       payCode,
          date_paiement:  datePaiement,
          personne_id:    personne.id,
          nom_complet:    `${personne.prenom} ${personne.nom}`,
          categorie:      personne.categorie,
          periode,
          type_paiement:  retenues.type === 'Salaire' ? 'Salaire' : 'Defraiement',
          brut,
          retenue_avs:    retenues.avs,
          retenue_ac:     retenues.ac,
          retenue_laa:    retenues.laa,
          retenue_alfa:   retenues.alfa,
          total_retenues: retenues.total,
          net:            retenues.net,
          statut:         'AValider',
        },
      })

      result.generes++
      result.paiements.push(prismaToPayment(paiement))
    } catch (err) {
      result.erreurs.push(
        `${personne.prenom} ${personne.nom} : ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return result
}

// ============================================================
// GÉNÉRATION PAIEMENTS CANTINES
// ============================================================

/**
 * Génère les paiements de bénéfice cantine pour une période donnée.
 */
export async function genererPaiementsCantines(periode: string): Promise<ResultatGeneration> {
  const params = await chargerParametres()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cantines = await (prisma as any).cantine.findMany({
    where: { periode, statut: 'EnAttente' },
    include: { personne: true },
  })

  const result: ResultatGeneration = { generes: 0, ignores: 0, erreurs: [], paiements: [] }

  for (const cantine of cantines) {
    const personne = cantine.personne

    try {
      const periodePaiement = `Cantine ${periode}`

      if (await paiementExisteDeja(personne.id, periodePaiement)) {
        result.ignores++
        continue
      }

      const brut = Number(cantine.part_cantinier)

      if (brut <= 0) {
        result.ignores++
        continue
      }

      // Bénéfice cantine : jamais soumis aux charges
      const retenues = calculerRetenues(brut, false, params)
      const datePaiement = cantine.date_paiement ?? new Date()
      const payCode = await prochainPayCode()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paiement = await (prisma as any).paiement.create({
        data: {
          pay_code:       payCode,
          date_paiement:  datePaiement,
          personne_id:    personne.id,
          nom_complet:    `${personne.prenom} ${personne.nom}`,
          categorie:      personne.categorie,
          periode:        periodePaiement,
          type_paiement:  'Defraiement',
          brut,
          retenue_avs:    0,
          retenue_ac:     0,
          retenue_laa:    0,
          retenue_alfa:   0,
          total_retenues: 0,
          net:            brut,
          statut:         'AValider',
        },
      })

      // Marquer la cantine comme validée
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).cantine.update({
        where: { id: cantine.id },
        data: { statut: 'Valide' },
      })

      result.generes++
      result.paiements.push(prismaToPayment(paiement))
    } catch (err) {
      result.erreurs.push(
        `${personne.prenom} ${personne.nom} : ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return result
}

// ============================================================
// RECALCUL CUMUL YTD
// ============================================================

/**
 * Recalcule le cumul annuel (year-to-date) pour toutes les personnes.
 */
export async function recalculerCumulYTD(annee: number): Promise<void> {
  const debutAnnee = new Date(annee, 0, 1)
  const finAnnee   = new Date(annee, 11, 31, 23, 59, 59)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personnes = await (prisma as any).personne.findMany({
    select: { id: true },
  })

  for (const personne of personnes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aggregate = await (prisma as any).paiement.aggregate({
      where: {
        personne_id:   personne.id,
        statut:        { not: 'Annule' },
        date_paiement: { gte: debutAnnee, lte: finAnnee },
      },
      _sum: { net: true },
    })

    const cumul = Number(aggregate._sum.net ?? 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).personne.update({
      where: { id: personne.id },
      data: { cumul_ytd: cumul },
    })
  }
}

// ============================================================
// HELPER : Conversion Prisma → Type métier
// ============================================================

const STATUT_DB_TO_UI: Record<string, string> = {
  AValider: 'À valider',
  Valide:   'Validé',
  Paye:     'Payé',
  Annule:   'Annulé',
}
const TYPE_DB_TO_UI: Record<string, string> = {
  Salaire:     'Salaire',
  Defraiement: 'Défraiement',
}

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
    statut: (STATUT_DB_TO_UI[p.statut] ?? p.statut) as Paiement['statut'],
    date_virement: p.date_virement instanceof Date
      ? p.date_virement.toISOString().split('T')[0]
      : (p.date_virement ?? null),
    bexio_ref: p.bexio_ref ?? null,
    fiche_url: p.fiche_url ?? null,
    created_at: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    updated_at: p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  }
}
