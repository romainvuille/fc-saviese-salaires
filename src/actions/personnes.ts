'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { succes, erreur } from '@/lib/utils'
import type { ActionResult, Personne, PersonneFormData } from '@/types'

// ============================================================
// Schéma de validation
// ============================================================

const personneSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().min(1, 'Le prénom est requis'),
  categorie: z.string().min(1, 'La catégorie est requise'),
  sous_categorie: z.string().optional().default(''),
  mode: z.enum(['Horaire', 'Mensuel fixe', 'Saisonnier fixe', 'Bénéfice cantine']),
  taux_horaire: z.number().nullable().optional(),
  montant_mois: z.number().nullable().optional(),
  montant_saison: z.number().nullable().optional(),
  mois_payes: z.string().optional().default(''),
  iban: z.string().optional().default(''),
  numero_avs: z.string().optional().default(''),
  email: z.string().email('E-mail invalide').optional().or(z.literal('')),
  statut: z.enum(['Actif', 'Inactif']),
  soumis_charges: z.boolean(),
  diplome_js: z.string().optional().default(''),
  bonus_js: z.boolean().optional().default(false),
})

// ============================================================
// Helpers : conversion enum Prisma ↔ chaîne UI
// ============================================================

const MODE_TO_PRISMA: Record<string, string> = {
  'Horaire':          'Horaire',
  'Mensuel fixe':     'MensuelFixe',
  'Saisonnier fixe':  'SaisonnierFixe',
  'Bénéfice cantine': 'BeneficeCantine',
}
const MODE_FROM_PRISMA: Record<string, string> = {
  'Horaire':          'Horaire',
  'MensuelFixe':      'Mensuel fixe',
  'SaisonnierFixe':   'Saisonnier fixe',
  'BeneficeCantine':  'Bénéfice cantine',
}

function toPersonne(p: Record<string, unknown>): Personne {
  return {
    id:             p.id as string,
    code:           p.code as string,
    nom:            p.nom as string,
    prenom:         p.prenom as string,
    categorie:      p.categorie as string,
    sous_categorie: (p.sous_categorie as string) ?? '',
    mode:           (MODE_FROM_PRISMA[p.mode as string] ?? p.mode) as Personne['mode'],
    taux_horaire:   p.taux_horaire != null ? Number(p.taux_horaire) : null,
    montant_mois:   p.montant_mois != null ? Number(p.montant_mois) : null,
    montant_saison: p.montant_saison != null ? Number(p.montant_saison) : null,
    mois_payes:     (p.mois_payes as string) ?? '',
    iban:           (p.iban as string) ?? '',
    numero_avs:     (p.numero_avs as string) ?? '',
    email:          (p.email as string) ?? '',
    statut:         p.statut as Personne['statut'],
    soumis_charges: p.soumis_charges as boolean,
    diplome_js:     (p.diplome_js as string) ?? '',
    bonus_js:       (p.bonus_js as boolean) ?? false,
    cumul_ytd:      p.cumul_ytd != null ? Number(p.cumul_ytd) : 0,
    created_at:     p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
    updated_at:     p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  }
}

// ============================================================
// Lecture
// ============================================================

export async function getPersonnes(filters?: {
  statut?: string
  mode?: string
  categorie?: string
}): Promise<ActionResult<Personne[]>> {
  try {
    const where: Record<string, unknown> = {}
    if (filters?.statut)    where.statut    = filters.statut
    if (filters?.mode)      where.mode      = MODE_TO_PRISMA[filters.mode] ?? filters.mode
    if (filters?.categorie) where.categorie = filters.categorie

    const rows = await prisma.personne.findMany({
      where,
      orderBy: [{ statut: 'asc' }, { code: 'asc' }],
    })
    return succes(rows.map(r => toPersonne(r as unknown as Record<string, unknown>)))
  } catch (err) {
    return erreur(`Erreur chargement personnes: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function getPersonne(id: string): Promise<ActionResult<Personne>> {
  try {
    const row = await prisma.personne.findUnique({ where: { id } })
    if (!row) return erreur('Personne introuvable.')
    return succes(toPersonne(row as unknown as Record<string, unknown>))
  } catch (err) {
    return erreur(`Erreur: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ============================================================
// Création
// ============================================================

export async function createPersonne(
  data: PersonneFormData
): Promise<ActionResult<Personne>> {
  try {
    const validation = personneSchema.safeParse(data)
    if (!validation.success) {
      return erreur(validation.error.issues[0]?.message ?? 'Données invalides.')
    }

    // Code séquentiel auto-généré
    const last = await prisma.personne.findFirst({
      where:   { code: { startsWith: 'P' } },
      orderBy: { code: 'desc' },
    })
    const lastNum = last?.code ? parseInt(last.code.replace(/\D/g, '')) : 0
    const code = `P${String(lastNum + 1).padStart(3, '0')}`

    const d = validation.data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await prisma.personne.create({
      data: {
        code,
        nom:            d.nom,
        prenom:         d.prenom,
        categorie:      d.categorie,
        sous_categorie: d.sous_categorie ?? '',
        mode:           (MODE_TO_PRISMA[d.mode] ?? d.mode) as never,
        taux_horaire:   d.taux_horaire ?? null,
        montant_mois:   d.montant_mois ?? null,
        montant_saison: d.montant_saison ?? null,
        mois_payes:     d.mois_payes ?? '',
        iban:           d.iban ?? '',
        numero_avs:     d.numero_avs ?? '',
        email:          d.email ?? '',
        statut:         d.statut as never,
        soumis_charges: d.soumis_charges,
        diplome_js:     d.diplome_js ?? '',
        bonus_js:       d.bonus_js ?? false,
      } as any,
    })

    revalidatePath('/personnes')
    return succes(toPersonne(row as unknown as Record<string, unknown>))
  } catch (err) {
    return erreur(`Erreur création: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ============================================================
// Mise à jour
// ============================================================

export async function updatePersonne(
  id: string,
  data: Partial<PersonneFormData>
): Promise<ActionResult<Personne>> {
  try {
    const validation = personneSchema.partial().safeParse(data)
    if (!validation.success) {
      return erreur(validation.error.issues[0]?.message ?? 'Données invalides.')
    }

    const d = validation.data
    const update: Record<string, unknown> = {}
    if (d.nom            !== undefined) update.nom            = d.nom
    if (d.prenom         !== undefined) update.prenom         = d.prenom
    if (d.categorie      !== undefined) update.categorie      = d.categorie
    if (d.sous_categorie !== undefined) update.sous_categorie = d.sous_categorie
    if (d.mode           !== undefined) update.mode           = MODE_TO_PRISMA[d.mode] ?? d.mode
    if (d.taux_horaire   !== undefined) update.taux_horaire   = d.taux_horaire
    if (d.montant_mois   !== undefined) update.montant_mois   = d.montant_mois
    if (d.montant_saison !== undefined) update.montant_saison = d.montant_saison
    if (d.mois_payes     !== undefined) update.mois_payes     = d.mois_payes
    if (d.iban           !== undefined) update.iban           = d.iban
    if (d.numero_avs     !== undefined) update.numero_avs     = d.numero_avs
    if (d.email          !== undefined) update.email          = d.email
    if (d.statut         !== undefined) update.statut         = d.statut
    if (d.soumis_charges !== undefined) update.soumis_charges = d.soumis_charges
    if (d.diplome_js     !== undefined) update.diplome_js     = d.diplome_js
    if (d.bonus_js       !== undefined) update.bonus_js       = d.bonus_js

    const row = await prisma.personne.update({
      where: { id },
      data:  update as never,
    })

    revalidatePath('/personnes')
    revalidatePath(`/personnes/${id}`)
    return succes(toPersonne(row as unknown as Record<string, unknown>))
  } catch (err) {
    return erreur(`Erreur mise à jour: ${err instanceof Error ? err.message : String(err)}`)
  }
}
