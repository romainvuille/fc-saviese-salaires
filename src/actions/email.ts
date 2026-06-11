'use server'

import { Resend } from 'resend'
import { genererFichePDF } from '@/actions/pdf'
import { prisma } from '@/lib/db'
import { succes, erreur, fmtCHF } from '@/lib/utils'
import type { ActionResult } from '@/types'

// ============================================================
// Client Resend
// ============================================================

const resend = new Resend(process.env.RESEND_API_KEY)

// Expéditeur — mettre à jour quand un domaine est vérifié dans Resend
const FROM = 'FC Savièse <onboarding@resend.dev>'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'romain.vuille@gmail.com'

// ============================================================
// Helpers HTML
// ============================================================

function htmlLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#D31616;padding:24px 32px;">
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">⚽ FC Savièse</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.8);">Gestion des salaires et défraiements</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #e5e7eb;background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#6b7280;">
              FC Savièse · Valais, Suisse · Ce message est généré automatiquement.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ============================================================
// Envoyer fiche de paie individuelle
// ============================================================

export async function envoyerFicheParEmail(
  paiementId: string
): Promise<ActionResult<{ messageId: string }>> {
  try {
    // Récupère paiement + personne
    const p = await prisma.paiement.findUnique({
      where: { id: paiementId },
      include: { personne: true },
    })
    if (!p) return erreur('Paiement introuvable.')

    const destinataire = p.personne.email
    if (!destinataire) return erreur(`Aucun e-mail configuré pour ${p.personne.prenom} ${p.personne.nom}.`)

    // Génère le PDF
    const pdfBuffer = await genererFichePDF(paiementId)

    // Corps de l'email
    const nomComplet = `${p.personne.prenom} ${p.personne.nom}`
    const body = `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Votre fiche de paie — ${p.periode}</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;">
        Bonjour ${p.personne.prenom},
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#374151;">
        Veuillez trouver ci-joint votre fiche de ${p.type_paiement.toLowerCase()} pour la période
        <strong>${p.periode}</strong>.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;">Montant brut</td>
          <td align="right" style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;">${fmtCHF(Number(p.brut))}</td>
        </tr>
        ${Number(p.total_retenues) > 0 ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;">Total retenues</td>
          <td align="right" style="padding:6px 0;font-size:14px;color:#6b7280;">–${fmtCHF(Number(p.total_retenues))}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px 0 6px;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;">Net à verser</td>
          <td align="right" style="padding:10px 0 6px;font-size:16px;font-weight:700;color:#D31616;border-top:1px solid #e5e7eb;">${fmtCHF(Number(p.net))}</td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        La fiche détaillée est disponible en pièce jointe (PDF).
      </p>
    `

    const result = await resend.emails.send({
      from: FROM,
      to: [destinataire],
      cc: [ADMIN_EMAIL],
      subject: `Fiche de ${p.type_paiement.toLowerCase()} ${p.periode} — FC Savièse`,
      html: htmlLayout(`Fiche de paie ${p.periode}`, body),
      attachments: [
        {
          filename: `fiche-${p.pay_code}-${p.personne.code}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (result.error) {
      return erreur(`Resend: ${result.error.message}`)
    }

    return succes({ messageId: result.data?.id ?? '' })
  } catch (err) {
    return erreur(err instanceof Error ? err.message : 'Erreur lors de l\'envoi.')
  }
}

// ============================================================
// Envoyer récapitulatif financier mensuel à l'admin
// ============================================================

export async function envoyerRecapFinancier(
  mois: number,
  annee: number
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const periodeLabel = `${String(mois).padStart(2, '0')}/${annee}`

    // Paiements du mois
    const paiements = await prisma.paiement.findMany({
      where: { periode: periodeLabel },
      include: { personne: true },
      orderBy: [{ categorie: 'asc' }, { nom_complet: 'asc' }],
    })

    if (paiements.length === 0) {
      return erreur(`Aucun paiement trouvé pour la période ${periodeLabel}.`)
    }

    // Calculs agrégés
    const totalBrut = paiements.reduce((s, p) => s + Number(p.brut), 0)
    const totalRetenues = paiements.reduce((s, p) => s + Number(p.total_retenues), 0)
    const totalNet = paiements.reduce((s, p) => s + Number(p.net), 0)
    const parStatut: Record<string, { count: number; net: number }> = {}
    const parCategorie: Record<string, { count: number; net: number; brut: number }> = {}

    for (const p of paiements) {
      const s = p.statut
      if (!parStatut[s]) parStatut[s] = { count: 0, net: 0 }
      parStatut[s].count++
      parStatut[s].net += Number(p.net)

      const cat = p.categorie
      if (!parCategorie[cat]) parCategorie[cat] = { count: 0, net: 0, brut: 0 }
      parCategorie[cat].count++
      parCategorie[cat].net += Number(p.net)
      parCategorie[cat].brut += Number(p.brut)
    }

    // Tableau HTML des paiements
    const lignesPaiements = paiements.map(p => `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px 12px;font-size:13px;color:#111827;">${p.nom_complet}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;">${p.categorie}</td>
        <td style="padding:8px 12px;font-size:13px;color:#6b7280;">${p.type_paiement}</td>
        <td align="right" style="padding:8px 12px;font-size:13px;color:#111827;">${fmtCHF(Number(p.brut))}</td>
        <td align="right" style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;">${fmtCHF(Number(p.net))}</td>
        <td style="padding:8px 12px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;
            background:${(p.statut as string) === 'Payé' ? '#d1fae5' : (p.statut as string) === 'Validé' ? '#dbeafe' : (p.statut as string) === 'Annulé' ? '#fee2e2' : '#fef9c3'};
            color:${(p.statut as string) === 'Payé' ? '#065f46' : (p.statut as string) === 'Validé' ? '#1e40af' : (p.statut as string) === 'Annulé' ? '#991b1b' : '#854d0e'};">
            ${p.statut}
          </span>
        </td>
      </tr>`).join('')

    const body = `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Récapitulatif financier — ${periodeLabel}</h2>
      <p style="margin:0 0 28px;font-size:14px;color:#6b7280;">${paiements.length} paiement${paiements.length > 1 ? 's' : ''} sur la période</p>

      <!-- Totaux -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td width="33%" style="padding:0 8px 0 0;">
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Total brut</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#111827;">${fmtCHF(totalBrut)}</p>
            </div>
          </td>
          <td width="33%" style="padding:0 4px;">
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Retenues sociales</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#6b7280;">–${fmtCHF(totalRetenues)}</p>
            </div>
          </td>
          <td width="33%" style="padding:0 0 0 8px;">
            <div style="background:#fff0f0;border:1px solid #fca5a5;border-radius:8px;padding:16px;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#D31616;text-transform:uppercase;letter-spacing:.05em;">Total net à verser</p>
              <p style="margin:0;font-size:20px;font-weight:700;color:#D31616;">${fmtCHF(totalNet)}</p>
            </div>
          </td>
        </tr>
      </table>

      <!-- Tableau détaillé -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th align="left" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Personne</th>
            <th align="left" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Catégorie</th>
            <th align="left" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Type</th>
            <th align="right" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Brut</th>
            <th align="right" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Net</th>
            <th align="left" style="padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Statut</th>
          </tr>
        </thead>
        <tbody>${lignesPaiements}</tbody>
        <tfoot>
          <tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
            <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:#111827;">Total (${paiements.length})</td>
            <td align="right" style="padding:10px 12px;font-size:13px;font-weight:700;color:#111827;">${fmtCHF(totalBrut)}</td>
            <td align="right" style="padding:10px 12px;font-size:13px;font-weight:700;color:#D31616;">${fmtCHF(totalNet)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Généré le ${new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' })} · FC Savièse
      </p>
    `

    const result = await resend.emails.send({
      from: FROM,
      to: [ADMIN_EMAIL],
      subject: `Récap financier ${periodeLabel} — FC Savièse`,
      html: htmlLayout(`Récap financier ${periodeLabel}`, body),
    })

    if (result.error) {
      return erreur(`Resend: ${result.error.message}`)
    }

    return succes({ messageId: result.data?.id ?? '' })
  } catch (err) {
    return erreur(err instanceof Error ? err.message : 'Erreur lors de l\'envoi.')
  }
}
