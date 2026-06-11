'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { succes, erreur } from '@/lib/utils'
import { prisma } from '@/lib/db'
import type {
  ActionResult,
  ArbitrageMatch,
  ArbitrageAvance,
  AvanceCalculee,
  StatutMatch,
  StatutAvance,
} from '@/types'

// ============================================================
// Barème arbitrage
// ============================================================

/** Retourne le montant CHF/match selon la ligue */
export async function tarifParLigue(ligue: string): Promise<number> {
  const l = ligue.trim().toLowerCase()
  // 2ème Interrégional
  if (l.includes('2. int') || l.includes('2ème inter') || l.includes('2e inter') || l === '2. int.') return 400
  // 1ère ligue
  if (l.startsWith('1.') || l.includes('1. liga') || l.includes('1ère')) return 200
  // 3ème ligue / 4ème ligue / Seniors / Juniors B C D
  if (
    l.startsWith('3.') || l.startsWith('4.') ||
    l.includes('jun.c') || l.includes('jun.d') || l.includes('jun.b') ||
    l.includes('junioren c') || l.includes('junioren d') || l.includes('junioren b') ||
    l.includes('3. liga') || l.includes('4. liga')
  ) return 50
  // Petits juniors E F G
  if (
    l.includes('jun.e') || l.includes('jun.f') || l.includes('jun.g') ||
    l.includes('junioren e') || l.includes('junioren f') || l.includes('junioren g')
  ) return 20
  // Défaut
  return 50
}

/** Détecte la saison depuis une date (ex: 2026-06-05 → "25-26") */
function saisonFromDate(d: Date): string {
  const m = d.getMonth() + 1 // 1-12
  const y = d.getFullYear()
  if (m >= 7) {
    // Juillet-décembre → saison YY-(YY+1)
    const yy1 = String(y).slice(-2)
    const yy2 = String(y + 1).slice(-2)
    return `${yy1}-${yy2}`
  } else {
    // Janvier-juin → saison (YY-1)-YY
    const yy1 = String(y - 1).slice(-2)
    const yy2 = String(y).slice(-2)
    return `${yy1}-${yy2}`
  }
}

// ============================================================
// Import CSV ClubCorner
// ============================================================

export interface ResultatImportCSV {
  importes: number
  ignores: number
  erreurs: string[]
  matches: ArbitrageMatch[]
}

/**
 * Parse un CSV ClubCorner (windows-1252, séparateur ;) et insère les matchs à domicile.
 * On filtre sur Vereinsnummer A = "8037" (FC Savièse).
 */
export async function importerMatchesCSV(
  csvContent: string,
  saison?: string
): Promise<ActionResult<ResultatImportCSV>> {
  try {
    const lines = csvContent.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return erreur('CSV vide ou sans données.')

    // Parser la ligne d'en-têtes
    const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''))
    const idx = {
      spielTyp:      headers.indexOf('SpielTyp'),
      spielnummer:   headers.indexOf('Spielnummer'),
      spieldatum:    headers.indexOf('Spieldatum'),
      spielzeit:     headers.indexOf('Spielzeit'),
      bezeichnung:   headers.indexOf('Bezeichnung'),
      teamnameA:     headers.indexOf('Teamname A'),
      teamLigaA:     headers.indexOf('TeamLiga A'),
      vereinsnrA:    headers.indexOf('Vereinsnummer A'),
      teamnameB:     headers.indexOf('Teamname B'),
      spielort:      headers.indexOf('Spielort'),
      wettspielfeld: headers.indexOf('Wettspielfeld'),
    }

    const FC_NUMMER = '8037'
    const resultats: ArbitrageMatch[] = []
    let importes = 0
    let ignores = 0
    const erreurs: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i]
      if (!raw.trim()) continue

      // Split CSV en tenant compte des guillemets
      const cols = raw.split(';').map((c) => c.trim().replace(/^"|"$/g, ''))

      // Filtrer : seulement les matchs à domicile de FC Savièse
      const vereinsnrA = cols[idx.vereinsnrA] ?? ''
      if (vereinsnrA !== FC_NUMMER) {
        ignores++
        continue
      }

      const spielnummer = cols[idx.spielnummer] ?? null
      const datumRaw = cols[idx.spieldatum] ?? ''
      const zeitRaw = cols[idx.spielzeit] ?? null

      // Parse date DD.MM.YYYY → YYYY-MM-DD
      const dateParts = datumRaw.split('.')
      if (dateParts.length !== 3) {
        erreurs.push(`Ligne ${i + 1} : date invalide "${datumRaw}"`)
        continue
      }
      const dateISO = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`
      const dateObj = new Date(dateISO)

      const equipe = cols[idx.teamnameA] ?? ''
      const ligue = cols[idx.teamLigaA] ?? ''
      const competition = cols[idx.bezeichnung] ?? null
      const adversaire = cols[idx.teamnameB] ?? ''
      const lieu = cols[idx.spielort] ?? null
      const montant = await tarifParLigue(ligue)
      const saisonMatch = saison ?? saisonFromDate(dateObj)

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (prisma as any).arbitrageMatch.findUnique({
          where: {
            saison_numero_match: {
              saison: saisonMatch,
              numero_match: spielnummer ?? '',
            },
          },
        })

        if (existing) {
          ignores++
          continue
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await (prisma as any).arbitrageMatch.create({
          data: {
            saison: saisonMatch,
            numero_match: spielnummer,
            date_match: new Date(dateISO),
            heure_match: zeitRaw,
            equipe,
            ligue,
            competition,
            adversaire,
            lieu,
            montant_chf: montant,
            statut: 'À planifier',
          },
        })

        resultats.push(mapMatch(created))
        importes++
      } catch (err) {
        erreurs.push(`Ligne ${i + 1} (${equipe} vs ${adversaire}) : ${err instanceof Error ? err.message : 'Erreur'}`)
      }
    }

    revalidatePath('/arbitrage')
    return succes({ importes, ignores, erreurs, matches: resultats })
  } catch (err) {
    return erreur(err instanceof Error ? err.message : 'Erreur lors de l\'import CSV.')
  }
}

// ============================================================
// CRUD Matches
// ============================================================

const filtresMatchSchema = z.object({
  saison: z.string().optional(),
  equipe: z.string().optional(),
  statut: z.string().optional(),
})

export async function getMatches(
  filtres?: z.infer<typeof filtresMatchSchema>
): Promise<ActionResult<ArbitrageMatch[]>> {
  try {
    const where: Record<string, unknown> = {}
    if (filtres?.saison) where.saison = filtres.saison
    if (filtres?.equipe) where.equipe = { contains: filtres.equipe, mode: 'insensitive' }
    if (filtres?.statut) where.statut = filtres.statut

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).arbitrageMatch.findMany({
      where,
      orderBy: [{ date_match: 'asc' }, { equipe: 'asc' }],
    })
    return succes(rows.map(mapMatch))
  } catch {
    return erreur('Erreur lors du chargement des matchs.')
  }
}

export async function updateStatutMatch(
  id: string,
  statut: StatutMatch
): Promise<ActionResult<ArbitrageMatch>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).arbitrageMatch.update({
      where: { id },
      data: { statut },
    })
    revalidatePath('/arbitrage')
    return succes(mapMatch(row))
  } catch {
    return erreur('Erreur lors de la mise à jour du statut.')
  }
}

export async function deleteMatch(id: string): Promise<ActionResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).arbitrageMatch.delete({ where: { id } })
    revalidatePath('/arbitrage')
    return succes(undefined)
  } catch {
    return erreur('Erreur lors de la suppression du match.')
  }
}

// ============================================================
// Calcul avances
// ============================================================

/**
 * Calcule les avances nécessaires pour une saison, groupées par équipe/ligue.
 * Compte uniquement les matchs à domicile (tous les matchs importés sont déjà à domicile).
 */
export async function calculerAvancesSaison(
  saison: string
): Promise<ActionResult<AvanceCalculee[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches = await (prisma as any).arbitrageMatch.findMany({
      where: { saison, statut: { not: 'Annulé' } },
      orderBy: [{ equipe: 'asc' }, { ligue: 'asc' }],
    })

    // Grouper par (equipe, ligue)
    const groupes: Record<string, AvanceCalculee> = {}
    for (const m of matches) {
      const key = `${m.equipe}||${m.ligue}`
      if (!groupes[key]) {
        groupes[key] = {
          equipe: m.equipe,
          ligue: m.ligue,
          nb_matches: 0,
          montant_par_match: Number(m.montant_chf),
          montant_total: 0,
        }
      }
      groupes[key].nb_matches++
      groupes[key].montant_total += Number(m.montant_chf)
    }

    return succes(Object.values(groupes))
  } catch {
    return erreur('Erreur lors du calcul des avances.')
  }
}

// ============================================================
// CRUD Avances
// ============================================================

const avanceCreateSchema = z.object({
  saison: z.string().min(1),
  equipe: z.string().min(1),
  ligue: z.string().min(1),
  nb_matches: z.number().int().positive(),
  montant_par_match: z.number().positive(),
  notes: z.string().optional(),
  date_versement: z.string().optional(),
})

export async function getAvances(
  saison?: string
): Promise<ActionResult<ArbitrageAvance[]>> {
  try {
    const where: Record<string, unknown> = {}
    if (saison) where.saison = saison

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).arbitrageAvance.findMany({
      where,
      orderBy: [{ saison: 'desc' }, { equipe: 'asc' }],
    })
    return succes(rows.map(mapAvance))
  } catch {
    return erreur('Erreur lors du chargement des avances.')
  }
}

export async function creerAvance(
  data: z.infer<typeof avanceCreateSchema>
): Promise<ActionResult<ArbitrageAvance>> {
  try {
    const v = avanceCreateSchema.safeParse(data)
    if (!v.success) return erreur(v.error.errors[0].message)

    const montant_total = v.data.nb_matches * v.data.montant_par_match

    // Génère le prochain code AVA
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last = await (prisma as any).arbitrageAvance.findFirst({
      orderBy: { code: 'desc' },
    })
    const nextNum = last
      ? parseInt(last.code.replace('AVA', ''), 10) + 1
      : 1
    const code = `AVA${String(nextNum).padStart(3, '0')}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).arbitrageAvance.create({
      data: {
        code,
        saison: v.data.saison,
        equipe: v.data.equipe,
        ligue: v.data.ligue,
        nb_matches: v.data.nb_matches,
        montant_par_match: v.data.montant_par_match,
        montant_total,
        notes: v.data.notes ?? null,
        date_versement: v.data.date_versement ? new Date(v.data.date_versement) : null,
      },
    })
    revalidatePath('/arbitrage')
    return succes(mapAvance(row))
  } catch {
    return erreur('Erreur lors de la création de l\'avance.')
  }
}

export async function updateStatutAvance(
  id: string,
  statut: StatutAvance,
  date_versement?: string
): Promise<ActionResult<ArbitrageAvance>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).arbitrageAvance.update({
      where: { id },
      data: {
        statut,
        date_versement: date_versement ? new Date(date_versement) : undefined,
      },
    })
    revalidatePath('/arbitrage')
    return succes(mapAvance(row))
  } catch {
    return erreur('Erreur lors de la mise à jour de l\'avance.')
  }
}

// ============================================================
// Réconciliation
// ============================================================

export interface ReconciliationResult {
  equipe: string
  ligue: string
  avance_code: string
  avance_montant: number
  matchs_joues: number
  montant_reel: number
  solde: number   // positif = trop versé, négatif = encore dû
  statut: 'OK' | 'Déficit' | 'Surplus'
}

export async function reconcilierSaison(
  saison: string
): Promise<ActionResult<ReconciliationResult[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [avances, matches] = await Promise.all([
      (prisma as any).arbitrageAvance.findMany({ where: { saison } }),
      (prisma as any).arbitrageMatch.findMany({ where: { saison, statut: 'Joué' } }),
    ])

    const resultats: ReconciliationResult[] = avances.map((av: any) => {
      const matchsEquipe = matches.filter(
        (m: any) => m.equipe === av.equipe && m.ligue === av.ligue
      )
      const montantReel = matchsEquipe.reduce((s: number, m: any) => s + Number(m.montant_chf), 0)
      const solde = Number(av.montant_total) - montantReel

      return {
        equipe: av.equipe,
        ligue: av.ligue,
        avance_code: av.code,
        avance_montant: Number(av.montant_total),
        matchs_joues: matchsEquipe.length,
        montant_reel: montantReel,
        solde,
        statut: Math.abs(solde) < 0.01 ? 'OK' : solde > 0 ? 'Surplus' : 'Déficit',
      }
    })

    return succes(resultats)
  } catch {
    return erreur('Erreur lors de la réconciliation.')
  }
}

// ============================================================
// Mappers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMatch(row: any): ArbitrageMatch {
  return {
    id: row.id,
    saison: row.saison,
    numero_match: row.numero_match ?? null,
    date_match: row.date_match instanceof Date
      ? row.date_match.toISOString().split('T')[0]
      : row.date_match,
    heure_match: row.heure_match ?? null,
    equipe: row.equipe,
    ligue: row.ligue,
    competition: row.competition ?? null,
    adversaire: row.adversaire,
    lieu: row.lieu ?? null,
    montant_chf: Number(row.montant_chf),
    statut: row.statut as StatutMatch,
    notes: row.notes ?? null,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : row.created_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAvance(row: any): ArbitrageAvance {
  return {
    id: row.id,
    code: row.code,
    saison: row.saison,
    equipe: row.equipe,
    ligue: row.ligue,
    nb_matches: row.nb_matches,
    montant_par_match: Number(row.montant_par_match),
    montant_total: Number(row.montant_total),
    statut: row.statut as StatutAvance,
    date_versement: row.date_versement
      ? (row.date_versement instanceof Date ? row.date_versement.toISOString().split('T')[0] : row.date_versement)
      : null,
    notes: row.notes ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}
