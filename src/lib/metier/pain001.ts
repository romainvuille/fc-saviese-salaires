/**
 * Génération de fichier pain.001.001.03 (ISO 20022 / SPS suisse)
 * pour virements en masse via e-banking Raiffeisen.
 */

export interface Pain001Transaction {
  endToEndId: string      // référence unique (pay_code)
  nom:        string      // nom bénéficiaire
  iban:       string      // IBAN bénéficiaire
  montant:    number      // montant CHF
  motif:      string      // unstructured remittance info
}

export interface Pain001Params {
  msgId:          string               // identifiant message unique
  dateExecution:  string               // YYYY-MM-DD
  debiteurNom:    string               // ex: "FC Savièse"
  debiteurIban:   string               // IBAN compte club
  bicBanque:      string               // BIC Raiffeisen, ex: RAIFCH22
  transactions:   Pain001Transaction[]
}

/** Escapes XML special chars */
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Formate un montant en CHF avec 2 décimales */
function fmtAmt(n: number): string {
  return n.toFixed(2)
}

/** Génère le XML pain.001.001.03 en string */
export function genererPain001(params: Pain001Params): string {
  const { msgId, dateExecution, debiteurNom, debiteurIban, bicBanque, transactions } = params

  if (transactions.length === 0) throw new Error('Aucune transaction à inclure.')

  const now = new Date()
  const creDtTm = now.toISOString().replace(/\.\d{3}Z$/, '+00:00')
  const nbOfTxs = transactions.length
  const ctrlSum = transactions.reduce((s, t) => s + t.montant, 0)
  const pmtInfId = `PMT-${msgId}`

  const txLines = transactions.map((tx) => `
        <CdtTrfTxInf>
          <PmtId>
            <EndToEndId>${xmlEsc(tx.endToEndId)}</EndToEndId>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="CHF">${fmtAmt(tx.montant)}</InstdAmt>
          </Amt>
          <Cdtr>
            <Nm>${xmlEsc(tx.nom)}</Nm>
          </Cdtr>
          <CdtrAcct>
            <Id>
              <IBAN>${xmlEsc(tx.iban.replace(/\s/g, ''))}</IBAN>
            </Id>
          </CdtrAcct>
          <RmtInf>
            <Ustrd>${xmlEsc(tx.motif)}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xmlEsc(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${fmtAmt(ctrlSum)}</CtrlSum>
      <InitgPty>
        <Nm>${xmlEsc(debiteurNom)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEsc(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${fmtAmt(ctrlSum)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>NURG</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CH01</Cd>
        </LclInstrm>
      </PmtTpInf>
      <ReqdExctnDt>${xmlEsc(dateExecution)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${xmlEsc(debiteurNom)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${xmlEsc(debiteurIban.replace(/\s/g, ''))}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${xmlEsc(bicBanque)}</BIC>
        </FinInstnId>
      </DbtrAgt>${txLines}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`
}
