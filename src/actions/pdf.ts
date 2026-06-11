import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { FichePaiementPDF, type FichePaiementData } from '@/components/pdf/FichePaiementPDF'
import { prisma } from '@/lib/db'

export async function genererFichePDF(paiementId: string): Promise<Buffer> {
  const p = await prisma.paiement.findUnique({
    where: { id: paiementId },
    include: { personne: true },
  })
  if (!p) throw new Error('Paiement introuvable')

  const data: FichePaiementData = {
    code:           p.personne.code,
    nom:            p.personne.nom,
    prenom:         p.personne.prenom,
    categorie:      p.categorie,
    iban:           p.personne.iban,
    numero_avs:     p.personne.numero_avs,
    pay_code:       p.pay_code,
    periode:        p.periode,
    type_paiement:  p.type_paiement,
    brut:           Number(p.brut),
    retenue_avs:    Number(p.retenue_avs),
    retenue_ac:     Number(p.retenue_ac),
    retenue_laa:    Number(p.retenue_laa),
    retenue_alfa:   Number(p.retenue_alfa),
    total_retenues: Number(p.total_retenues),
    net:            Number(p.net),
    date_paiement:  p.date_paiement
      ? new Date(p.date_paiement).toLocaleDateString('fr-CH')
      : '—',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(FichePaiementPDF, { data }) as any
  const buffer = await renderToBuffer(element)
  return Buffer.from(buffer)
}
