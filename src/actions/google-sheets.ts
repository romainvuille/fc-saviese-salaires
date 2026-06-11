'use server'

// ============================================================
// FC Savièse — Sync heures depuis Google Sheets
// Sheet : "Heures saisies Ana+ Sergio"
// Structure colonnes (confirmée Apps Script v0.10) :
//   col A (index 0) = Horodateur Google Forms (Date)
//   col B (index 1) = Prénom : "Ana" ou "Sergio"
//   col E (index 4) = Heure début (fraction de journée, ex: 0.375 = 09:00)
//   col F (index 5) = Heure fin (même format)
//   col G (index 6) = Heures décimal (calculé, peut être fraction < 1 ou ×24)
//   col H (index 7) = Activité
//   col J (index 9) = Remarques
// ============================================================

import { google } from 'googleapis'
import { prisma } from '@/lib/db'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const SHEET_NAME = 'Heures saisies Ana+ Sergio'

export type ResultatSyncHeures = {
  imported: number
  skipped: number
  errors: string[]
}

// ── Helpers ─────────────────────────────────────────────────

/** Convertit une fraction de journée en HH:MM (ex: 0.375 → "09:00") */
function fractionToHHMM(fraction: number): string {
  const totalMinutes = Math.round(fraction * 24 * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Parse les heures décimal : si < 1 c'est une fraction de jour (×24), sinon déjà en heures */
function parseHeuresDecimal(val: number): number {
  if (val <= 0) return 0
  const h = val < 1 ? val * 24 : val
  return Math.round(h * 100) / 100
}

/** Parse un horodateur Google Sheets (string ou serial number) en Date */
function parseTimestamp(raw: unknown): Date | null {
  if (!raw) return null
  // Google Sheets renvoie souvent une string ISO via l'API
  const d = new Date(String(raw))
  return isNaN(d.getTime()) ? null : d
}

// ── Action principale ────────────────────────────────────────


// Certains outils produisent un service account JSON avec des vrais \n dans private_key
// (caractères de contrôle invalides en JSON). On les ré-échappe.
function fixServiceAccountJson(raw: string): string {
  const keyStart = raw.indexOf('"private_key"')
  if (keyStart === -1) return raw
  const colonIdx = raw.indexOf(':', keyStart)
  const openQuote = raw.indexOf('"', colonIdx) + 1
  let closeQuote = openQuote
  while (closeQuote < raw.length) {
    if (raw[closeQuote] === '"' && raw[closeQuote - 1] !== '\\') break
    closeQuote++
  }
  const fixedVal = raw.slice(openQuote, closeQuote).replace(/\n/g, '\\n')
  return raw.slice(0, openQuote) + fixedVal + raw.slice(closeQuote)
}

export async function syncHeuresGoogleSheets(): Promise<ResultatSyncHeures> {
  const result: ResultatSyncHeures = { imported: 0, skipped: 0, errors: [] }

  try {
    // 1. Auth Google
    const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
    if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 non défini dans .env.local')

    const jsonRaw = Buffer.from(b64.replace(/\s/g, ''), 'base64').toString('utf-8')
    const credentials = JSON.parse(fixServiceAccountJson(jsonRaw))
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    // 2. Lire l'onglet (A2:J = toutes lignes de données, skip row 1 = headers)
    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:J`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    })

    const rows = response.data.values ?? []
    if (rows.length === 0) {
      result.errors.push('Aucune donnée trouvée dans le Sheet')
      return result
    }

    // 3. Charger les personnes mode Horaire (actives)
    const personnes = await prisma.personne.findMany({
      where: { statut: 'Actif', mode: 'Horaire' },
      select: { id: true, prenom: true },
    })

    // 4. Récupérer un profil admin pour created_by (obligatoire en DB)
    const adminProfile = await prisma.profile.findFirst({
      where: { role: 'admin' },
      select: { id: true },
    })
    const createdById = adminProfile?.id ?? ''

    // 5. Traiter chaque ligne
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lineNum = i + 2 // numéro de ligne dans le sheet (1-indexé, skip header)

      try {
        const timestampRaw = row[0]   // col A
        const prenomForm   = String(row[1] ?? '').trim()  // col B
        const tDebutRaw    = Number(row[4] ?? 0)          // col E
        const tFinRaw      = Number(row[5] ?? 0)          // col F
        const gValRaw      = Number(row[6] ?? 0)          // col G
        const activite     = String(row[7] ?? '').trim()  // col H
        const remarques    = String(row[9] ?? '').trim()  // col J

        // Skip lignes vides
        if (!prenomForm || !timestampRaw) continue

        // Parse la date depuis l'horodateur
        const date = parseTimestamp(timestampRaw)
        if (!date) {
          result.errors.push(`Ligne ${lineNum} : horodateur invalide "${timestampRaw}"`)
          continue
        }
        // Date locale Suisse → YYYY-MM-DD sans décalage UTC
        const year  = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day   = String(date.getDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`

        // Calculer heureDebut, heureFin, heuresDecimal
        let heureDebut    = ''
        let heureFin      = ''
        let heuresDecimal = 0

        const debutValide = tDebutRaw > 0 && tDebutRaw < 1
        const finValide   = tFinRaw   > 0 && tFinRaw   < 1

        if (debutValide && finValide) {
          heureDebut    = fractionToHHMM(tDebutRaw)
          heureFin      = fractionToHHMM(tFinRaw)
          heuresDecimal = Math.round((tFinRaw - tDebutRaw) * 24 * 100) / 100
        } else if (gValRaw > 0) {
          // Fallback : col G (heures décimal direct ou fraction)
          heuresDecimal = parseHeuresDecimal(gValRaw)
          heureDebut    = '00:00'
          heureFin      = '00:00'
        } else {
          result.errors.push(`Ligne ${lineNum} : aucune donnée d'heures valide (E=${tDebutRaw}, F=${tFinRaw}, G=${gValRaw})`)
          continue
        }

        if (heuresDecimal <= 0) {
          result.errors.push(`Ligne ${lineNum} : heures décimal = 0 pour ${prenomForm}`)
          continue
        }

        // Matcher la personne par prénom (insensible à la casse)
        const personne = personnes.find(
          (p) => p.prenom.toLowerCase() === prenomForm.toLowerCase()
        )
        if (!personne) {
          result.errors.push(`Ligne ${lineNum} : personne "${prenomForm}" introuvable (mode Horaire/Actif)`)
          continue
        }

        // Anti-doublon : même personne, même date, mêmes heures
        const existing = await prisma.heure.findFirst({
          where: {
            personne_id:    personne.id,
            date_travail:   new Date(dateStr),
            heures_decimal: heuresDecimal,
          },
          select: { id: true },
        })

        if (existing) {
          result.skipped++
          continue
        }

        // Créer l'entrée
        await prisma.heure.create({
          data: {
            personne_id:    personne.id,
            date_travail:   new Date(dateStr),
            heure_debut:    heureDebut,
            heure_fin:      heureFin,
            heures_decimal: heuresDecimal,
            activite:       activite || 'Import Google Forms',
            remarques:      remarques,
            created_by:     createdById,
          },
        })

        result.imported++
      } catch (rowErr) {
        result.errors.push(
          `Ligne ${lineNum} : ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`
        )
      }
    }
  } catch (err) {
    result.errors.push(
      `Erreur API Google Sheets : ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return result
}
