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
  moisPayesGlobaux,
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
  const existing = await prisma.paiement.findFirst({
    where: {
      personne_id: personneId,
      periode,
    },
    select: { id: true },
  })
  return existing !== null
}

/**
 * Charge les paramètres globaux depuis la DB.
 */
async function chargerParametres(): Promise<Parametres> {
  const rows = await prisma.parametre.findMany({
    select: { cle: true, valeur: true },
  })
  return parseParametres(rows)
}

/**
 * Génère le prochain pay_code disponible.
 */
async function prochainPayCode(): Promise<string> {
  const dernier = await prisma.paiement.findFirst({
    orderBy: { pay_code: 'desc' },
    select: { pay_code: true },
  })

  if (!dernier) {
    return genererPayCode(1)
  }

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
  const params = await chargerParametres()
  const periode = periodeLabel(annee, mois)
  const datePaiement = datePaiementMensuel(annee, mois)

  const personnes = await prisma.personne.findMany({
    where: {
      statut: 'Actif',
      mode: 'MensuelFixe',
    },
  })

  const result: ResultatGeneration = {
    generes: 0,
    ignores: 0,
    erreurs: [],
    paiements: [],
  }

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

      const montantMois = Number(personne.montant_mois ?? 0)
      const brut = montantMois

      if (brut <= 0) {
        result.erreurs.push(
          `${personne.prenom} ${personne.nom} : montant mensuel invalide (${brut})`
        )
        continue
      }

      const retenues = calculerRetenues(brut, personne.soumis_charges, params)
      const payCode = await prochainPayCode()

      const paiement = await prisma.paiement.create({
        data: {
          pay_code: payCode,
          date_paiement: datePaiement,
          personne_id: personne.id,
          nom_complet: `${personne.prenom} ${personne.nom}`,
          categorie: personne.categorie,
          periode,
          type_paiement: retenues.type === 'Salaire' ? 'Salaire' : 'Defraiement',
          brut,
          retenue_avs: retenues.avs,
          retenue_ac: retenues.ac,
          retenue_laa: retenues.laa,
          retenue_alfa: retenues.alfa,
          total_retenues: retenues.total,
          net: retenues.net,
          statut: 'AValider',
        },
        include: { personne: true },
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
 * Toutes les personnes "Saisonnier fixe" actives reçoivent leur montant_saison.
 */
export async function genererPaiementsTour(
  tour: string
): Promise<ResultatGeneration> {
  const params = await chargerParametres()
  const datePaiement = datePaiementTour(tour)

  const personnes = await prisma.personne.findMany({
    where: {
      statut: 'Actif',
      mode: 'SaisonnierFixe',
    },
  })

  const result: ResultatGeneration = {
    generes: 0,
    ignores: 0,
    erreurs: [],
    paiements: [],
  }

  for (const personne of personnes) {
    try {
      // Anti-doublon
      if (await paiementExisteDeja(personne.id, tour)) {
        result.ignores++
        continue
      }

      const montantSaison = Number(personne.montant_saison ?? 0)
      const brut = montantSaison

      if (brut <= 0) {
        result.erreurs.push(
          `${personne.prenom} ${personne.nom} : montant saisonnier invalide (${brut})`
        )
        continue
      }

      const retenues = calculerRetenues(brut, personne.soumis_charges, params)
      const payCode = await prochainPayCode()

      const paiement = await prisma.paiement.create({
        data: {
          pay_code: payCode,
          date_paiement: datePaiement,
          personne_id: personne.id,
          nom_complet: `${personne.prenom} ${personne.nom}`,
          categorie: personne.categorie,
          periode: tour,
          type_paiement: retenues.type === 'Salaire' ? 'Salaire' : 'Defraiement',
          brut,
          retenue_avs: retenues.avs,
          retenue_ac: retenues.ac,
          retenue_laa: retenues.laa,
          retenue_alfa: retenues.alfa,
          total_retenues: retenues.total,
          net: retenues.net,
          statut: 'AValider',
        },
        include: { personne: true },
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
 * Agrège toutes les heures saisies dans ce mois pour chaque personne "Horaire".
 */
export async function genererPaiementsHoraires(
  annee: number,
  mois: number
): Promise<ResultatGeneration> {
  const params = await chargerParametres()
  const periode = periodeLabel(annee, mois)
  const datePaiement = datePaiementMensuel(annee, mois)

  // Bornes du mois
  const debutMois = new Date(annee, mois - 1, 1)
  const finMois = new Date(annee, mois, 0, 23, 59, 59)

  const personnes = await prisma.personne.findMany({
    where: {
      statut: 'Actif',
      mode: 'Horaire',
    },
  })

  const result: ResultatGeneration = {
    generes: 0,
    ignores: 0,
    erreurs: [],
    paiements: [],
  }

  for (const personne of personnes) {
    try {
      // Anti-doublon
      if (await paiementExisteDeja(personne.id, periode)) {
        result.ignores++
        continue
      }

      // Agréger les heures du mois
      const heures = await prisma.heure.findMany({
        where: {
          personne_id: personne.id,
          date_travail: {
            gte: debutMois,
            lte: finMois,
          },
        },
      })

      if (heures.length === 0) {
        result.ignores++
        continue
      }

      const totalHeures = heures.reduce(
        (sum, h) => sum + Number(h.heures_decimal),
        0
      )

      const tauxHoraire = Number(personne.taux_horaire ?? 0)
      if (tauxHoraire <= 0) {
        result.erreurs.push(
          `${personne.prenom} ${personne.nom} : taux horaire non défini`
        )
        continue
      }

      const brut = Math.round(totalHeures * tauxHoraire * 100) / 100

      const retenues = calculerRetenues(brut, personne.soumis_charges, params)
      const payCode = await prochainPayCode()

      const paiement = await prisma.paiement.create({
        data: {
          pay_code: payCode,
          date_paiement: datePaiement,
          personne_id: personne.id,
          nom_complet: `${personne.prenom} ${personne.nom}`,
          categorie: personne.categorie,
          periode,
          type_paiement: retenues.type === 'Salaire' ? 'Salaire' : 'Defraiement',
          brut,
          retenue_avs: retenues.avs,
          retenue_ac: retenues.ac,
          retenue_laa: retenues.laa,
          retenue_alfa: retenues.alfa,
          total_retenues: retenues.total,
          net: retenues.net,
          statut: 'AValider',
        },
        include: { personne: true },
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
 * Lit les entrées dans la table cantines et crée un paiement par cantiniers.
 * La période est de la forme "Cantine 2026-04" ou libre.
 */
export async function genererPaiementsCantines(
  periode: string
): Promise<ResultatGeneration> {
  const params = await chargerParametres()

  const cantines = await prisma.cantine.findMany({
    where: {
      periode,
      statut: 'EnAttente',
    },
    include: { personne: true },
  })

  const result: ResultatGeneration = {
    generes: 0,
    ignores: 0,
    erreurs: [],
    paiements: [],
  }

  for (const cantine of cantines) {
    const personne = cantine.personne

    try {
      const periodePaiement = `Cantine ${periode}`

      // Anti-doublon
      if (await paiementExisteDeja(personne.id, periodePaiement)) {
        result.ignores++
        continue
      }

      const brut = Number(cantine.part_cantinier)

      if (brut <= 0) {
        result.erreurs.push(
          `${personne.prenom} ${personne.nom} : part cantinier nulle pour ${periode}`
        )
        continue
      }

      // Bénéfice cantine : jamais soumis aux charges (toujours défraiement)
      const retenues = calculerRetenues(brut, false, params)
      const datePaiement = cantine.date_paiement ?? new Date()
      const payCode = await prochainPayCode()

      const paiement = await prisma.paiement.create({
        data: {
          pay_code: payCode,
          date_paiement: datePaiement,
          personne_id: personne.id,
          nom_complet: `${personne.prenom} ${personne.nom}`,
          categorie: personne.categorie,
          periode: periodePaiement,
          type_paiement: 'Defraiement',
          brut,
          retenue_avs: 0,
          retenue_ac: 0,
          retenue_laa: 0,
          retenue_alfa: 0,
          total_retenues: 0,
          net: brut,
          statut: 'AValider',
        },
        include: { personne: true },
      })

      // Marquer la cantine comme validée
      await prisma.cantine.update({
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
 * Somme les paiements net non-annulés de l'année civile.
 */
export async function recalculerCumulYTD(annee: number): Promise<void> {
  const debutAnnee = new Date(annee, 0, 1)
  const finAnnee = new Date(annee, 11, 31, 23, 59, 59)

  const personnes = await prisma.personne.findMany({
    select: { id: true },
  })

  for (const personne of personnes) {
    const aggregate = await prisma.paiement.aggregate({
      where: {
        personne_id: personne.id,
        statut: { not: 'Annule' },
        date_paiement: {
          gte: debutAnnee,
          lte: finAnnee,
        },
      },
      _sum: { net: true },
    })

    const cumul = Number(aggregate._sum.net ?? 0)

    await prisma.personne.update({
      where: { id: personne.id },
      data: { cumul_ytd: cumul },
    })
  }
}

// ============================================================
// HELPER : Conversion Prisma → Type métier
// ============================================================

function prismaToPayment(p: {
  id: string
  pay_code: string
  date_paiement: Date
  personne_id: string
  nom_complet: string
  categorie: string
  periode: string
  type_paiement: string
  brut: unknown
  retenue_avs: unknown
  retenue_ac: unknown
  retenue_laa: unknown
  retenue_alfa: unknown
  total_retenues: unknown
  net: unknown
  statut: string
  date_virement: Date | null
  bexio_ref: string | null
  fiche_url: string | null
  created_at: Date
  updated_at: Date
}): Paiement {
  return {
    id: p.id,
    pay_code: p.pay_code,
    date_paiement: p.date_paiement.toISOString().split('T')[0],
    personne_id: p.personne_id,
    nom_complet: p.nom_complet,
    categorie: p.categorie,
    periode: p.periode,
    type_paiement: p.type_paiement as Paiement['type_paiement'],
    brut: Number(p.brut),
    retenue_avs: Number(p.retenue_avs),
    retenue_ac: Number(p.retenue_ac),
    retenue_laa: Number(p.retenue_laa),
    retenue_alfa: Number(p.retenue_alfa),
    total_retenues: Number(p.total_retenues),
    net: Number(p.net),
    statut: p.statut as Paiement['statut'],
    date_virement: p.date_virement
      ? p.date_virement.toISOString().split('T')[0]
      : null,
    bexio_ref: p.bexio_ref,
    fiche_url: p.fiche_url,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  }
}
