'use server'

import { google } from 'googleapis'
import { prisma } from '@/lib/db'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const SHEET_NAME_PERSONNES = 'Personnes'

const CATEGORIE_MAP: Record<string, { categorie: string; sous_categorie: string }> = {
  '2e Int. - Entraineur principal':    { categorie: 'Entraîneur principal',  sous_categorie: 'Savièse 1 (2e Int.)' },
  '2e Int. - Entraineur assistant':    { categorie: 'Entraîneur assistant',  sous_categorie: 'Savièse 1 (2e Int.)' },
  '2e Int. - Entraineur intendant':    { categorie: 'Intendant',             sous_categorie: 'Savièse 1 (2e Int.)' },
  '2e Int. - Entraineur soigneur':     { categorie: 'Soigneur',              sous_categorie: 'Savièse 1 (2e Int.)' },
  '3e - Entraineur principal':         { categorie: 'Entraîneur principal',  sous_categorie: 'Savièse 2 (3e LF)' },
  '3e - Entraineur assistant':         { categorie: 'Entraîneur assistant',  sous_categorie: 'Savièse 2 (3e LF)' },
  '4e - Entraineur principal':         { categorie: 'Entraîneur principal',  sous_categorie: 'Savièse 3 (4e)' },
  '4e - Entraineur assistant':         { categorie: 'Entraîneur assistant',  sous_categorie: 'Savièse 3 (4e)' },
  '5e - Entraineur principal':         { categorie: 'Entraîneur principal',  sous_categorie: 'Savièse 4 (5e)' },
  '5e - Entraineur assistant':         { categorie: 'Entraîneur assistant',  sous_categorie: 'Savièse 4 (5e)' },
  'Seniors - Entraineur principal':    { categorie: 'Entraîneur principal',  sous_categorie: 'Seniors' },
  'Seniors - Entraineur assistant':    { categorie: 'Entraîneur assistant',  sous_categorie: 'Seniors' },
  'Juniors 11 - Entraineur principal': { categorie: 'Entraîneur principal',  sous_categorie: 'Juniors 11 (J-B)' },
  'Juniors 11 - Entraineur assistant': { categorie: 'Entraîneur assistant',  sous_categorie: 'Juniors 11 (J-B)' },
  'Juniors 9 - Entraineur principal':  { categorie: 'Entraîneur principal',  sous_categorie: 'Juniors 9 (J-C)' },
  'Juniors 9 - Entraineur assistant':  { categorie: 'Entraîneur assistant',  sous_categorie: 'Juniors 9 (J-C)' },
  'Juniors 7 - Entraineur principal':  { categorie: 'Entraîneur principal',  sous_categorie: 'Juniors 7 (J-D)' },
  'Juniors 7 - Entraineur assistant':  { categorie: 'Entraîneur assistant',  sous_categorie: 'Juniors 7 (J-D)' },
  'Juniors F/G - Entraineur principal':{ categorie: 'Entraîneur principal',  sous_categorie: 'Juniors F/G' },
  'Juniors F/G - Entraineur assistant':{ categorie: 'Entraîneur assistant',  sous_categorie: 'Juniors F/G' },
  'Actifs - Entraineur gardien':       { categorie: 'Entraîneur gardien',    sous_categorie: 'Savièse 1 (2e Int.)' },
  'Juniors - Entraineur gardien':      { categorie: 'Entraîneur gardien',    sous_categorie: 'Juniors' },
  'Entraineur Attaquants':             { categorie: 'Entraîneur attaquants', sous_categorie: '' },
  'Cantine Principale':                { categorie: 'Cantinier',             sous_categorie: 'Cantine' },
  'Cantine Synthétique':               { categorie: 'Cantinier',             sous_categorie: 'Cantine' },
  'Entretien':                         { categorie: 'Entretien',             sous_categorie: 'Entretien' },
}

function parseCategorie(raw: string) {
  return CATEGORIE_MAP[raw?.trim()] ?? { categorie: raw?.trim() ?? '', sous_categorie: '' }
}

function parseMode(raw: string): 'Horaire' | 'MensuelFixe' | 'SaisonnierFixe' | 'BeneficeCantine' {
  const v = raw?.trim() ?? ''
  if (v === 'Mensuel fixe' || v === 'MensuelFixe')        return 'MensuelFixe'
  if (v === 'Saisonnier fixe' || v === 'SaisonnierFixe')  return 'SaisonnierFixe'
  if (v.includes('antine') || v === 'BeneficeCantine')    return 'BeneficeCantine'
  return 'Horaire'
}

function parseDecimal(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

function parseBool(raw: unknown): boolean {
  const s = String(raw ?? '').trim().toLowerCase()
  return s === 'oui' || s === 'true' || s === '1' || s === 'yes'
}

export type ResultatImportPersonnes = {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}


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

export async function importerPersonnesDepuisSheets(): Promise<ResultatImportPersonnes> {
  const result: ResultatImportPersonnes = { imported: 0, updated: 0, skipped: 0, errors: [] }

  try {
    const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
    if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 manquant dans .env.local')
    const jsonRaw = Buffer.from(b64.replace(/\s/g, ''), 'base64').toString('utf-8')
    const credentials = JSON.parse(fixServiceAccountJson(jsonRaw))

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })

    // Données depuis ligne 4 (row 1=titre, 2=vide, 3=headers)
    // Colonnes: A=ID B=Nom C=Prénom D=CatBareme E=Mode F=TauxH G=MtMois
    //           H=MtSaison I=MoisPayes J=IBAN K=AVS L=Email M=Statut
    //           N=CumulYTD O=SoumisCharges P=DiplomeJS Q=Ajustement(ignoré)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME_PERSONNES}!A4:Q`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })

    const rows = response.data.values ?? []
    if (rows.length === 0) {
      result.errors.push("Aucune donnée dans l'onglet Personnes")
      return result
    }

    for (const [i, row] of rows.entries()) {
      const code   = String(row[0] ?? '').trim()
      const nom    = String(row[1] ?? '').trim()
      const prenom = String(row[2] ?? '').trim()

      if (!code || !nom || !prenom) {
        if (code || nom) result.errors.push(`Ligne ${i + 4} ignorée (données incomplètes)`)
        continue
      }

      const { categorie, sous_categorie } = parseCategorie(String(row[3] ?? ''))
      const mode   = parseMode(String(row[4] ?? ''))
      const statut = String(row[12] ?? '').trim() === 'Inactif' ? 'Inactif' : 'Actif'

      const data = {
        nom, prenom, categorie, sous_categorie, mode,
        taux_horaire:   parseDecimal(row[5]),
        montant_mois:   parseDecimal(row[6]),
        montant_saison: parseDecimal(row[7]),
        mois_payes:     String(row[8] ?? '').trim(),
        iban:           String(row[9] ?? '').trim(),
        numero_avs:     String(row[10] ?? '').trim(),
        email:          String(row[11] ?? '').trim(),
        statut,
        soumis_charges: parseBool(row[14]),
        diplome_js:     '',
        bonus_js:       parseBool(row[15]),
        cumul_ytd:      parseDecimal(row[13]) ?? 0,
      }

      try {
        const existing = await prisma.personne.findUnique({ where: { code } })
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await prisma.personne.update({ where: { code }, data: data as any })
          result.updated++
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await prisma.personne.create({ data: { code, ...data } as any })
          result.imported++
        }
      } catch (err) {
        result.errors.push(`${code} (${prenom} ${nom}) : ${err instanceof Error ? err.message : String(err)}`)
        result.skipped++
      }
    }
  } catch (err) {
    result.errors.push(`Erreur globale : ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}
