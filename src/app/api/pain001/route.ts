import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { genererPain001, type Pain001Transaction } from '@/lib/metier/pain001'

export async function GET(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const statut  = searchParams.get('statut')  ?? 'Validé'
  const periode = searchParams.get('periode') ?? undefined
  const dateExecution = searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  // Récupère les paramètres club depuis DB
  const params = await prisma.parametre.findMany({
    where: { cle: { in: ['iban_club', 'bic_banque', 'nom_club'] } },
  })
  const getParam = (cle: string, def: string) =>
    params.find((p) => p.cle === cle)?.valeur ?? def

  const debiteurNom  = getParam('nom_club',   'FC Savièse')
  const debiteurIban = getParam('iban_club',  '')
  const bicBanque    = getParam('bic_banque', 'RAIFCH22')

  if (!debiteurIban) {
    return NextResponse.json(
      { error: 'IBAN du club non configuré. Allez dans Paramètres → iban_club.' },
      { status: 400 }
    )
  }

  // Récupère les paiements filtrés
  const where: Record<string, unknown> = { statut }
  if (periode) where.periode = periode

  const paiements = await prisma.paiement.findMany({
    where,
    include: { personne: { select: { nom: true, prenom: true, iban: true } } },
    orderBy: { nom_complet: 'asc' },
  })

  const transactions: Pain001Transaction[] = paiements
    .filter((p) => p.personne.iban && p.personne.iban.trim().length > 0)
    .map((p) => ({
      endToEndId: p.pay_code,
      nom:        p.nom_complet,
      iban:       p.personne.iban,
      montant:    Number(p.net),
      motif:      `FC Saviese ${p.type_paiement} ${p.periode}`,
    }))

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: 'Aucun paiement avec IBAN valide trouvé pour les filtres sélectionnés.' },
      { status: 400 }
    )
  }

  // Génère le XML
  const msgId = `FCSAVIESE-${dateExecution.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`

  const xml = genererPain001({
    msgId,
    dateExecution,
    debiteurNom,
    debiteurIban,
    bicBanque,
    transactions,
  })

  const filename = `pain001_${statut.replace(/\s/g, '_')}_${dateExecution}.xml`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
