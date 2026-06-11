'use client'

import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, Font, Image,
} from '@react-pdf/renderer'

// ── Types ──────────────────────────────────────────────────────────────
export interface FichePaiementData {
  // Personne
  code:          string
  nom:           string
  prenom:        string
  categorie:     string
  iban:          string
  numero_avs:    string
  // Paiement
  pay_code:      string
  periode:       string
  type_paiement: string   // 'Salaire' | 'Défraiement'
  brut:          number
  retenue_avs:   number
  retenue_ac:    number
  retenue_laa:   number
  retenue_alfa:  number
  total_retenues:number
  net:           number
  date_paiement: string   // dd.mm.yyyy
  // Club
  club_nom?:     string
}

// ── Formatage CHF ───────────────────────────────────────────────────────
function chf(n: number): string {
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency', currency: 'CHF', minimumFractionDigits: 2,
  }).format(n)
}

// ── Styles ──────────────────────────────────────────────────────────────
const RED  = '#D31616'
const GREY = '#6B7280'
const LIGHT = '#F9FAFB'
const BORDER = '#E5E7EB'

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, padding: 40, color: '#111827' },
  // En-tête
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  clubName:    { fontSize: 16, fontFamily: 'Helvetica-Bold', color: RED },
  clubSub:     { fontSize: 8, color: GREY, marginTop: 2 },
  docTitle:    { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: '#111827' },
  docSub:      { fontSize: 8, color: GREY, textAlign: 'right', marginTop: 2 },
  // Section
  section:     { marginBottom: 14 },
  sectionTitle:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: RED, textTransform: 'uppercase',
                 letterSpacing: 0.8, marginBottom: 6, borderBottom: `1 solid ${RED}`, paddingBottom: 2 },
  // Grille 2 colonnes
  row2:        { flexDirection: 'row', gap: 12 },
  col:         { flex: 1 },
  // Ligne label/valeur
  field:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, paddingHorizontal: 4,
                 paddingVertical: 2 },
  fieldAlt:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, paddingHorizontal: 4,
                 paddingVertical: 2, backgroundColor: LIGHT },
  label:       { color: GREY },
  value:       { fontFamily: 'Helvetica-Bold' },
  // Tableau retenues
  tableHead:   { flexDirection: 'row', backgroundColor: '#1F2937', color: '#fff', paddingHorizontal: 4,
                 paddingVertical: 4, borderRadius: 2, marginBottom: 1 },
  tableRow:    { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 3, borderBottom: `1 solid ${BORDER}` },
  tableRowAlt: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 3, backgroundColor: LIGHT,
                 borderBottom: `1 solid ${BORDER}` },
  colDesc:     { flex: 1 },
  colMontant:  { width: 80, textAlign: 'right' },
  colTaux:     { width: 60, textAlign: 'right', color: GREY },
  // Total net
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: RED, color: '#fff',
                 paddingHorizontal: 8, paddingVertical: 6, borderRadius: 2, marginTop: 8 },
  totalLabel:  { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  totalMontant:{ fontSize: 12, fontFamily: 'Helvetica-Bold' },
  // Pied de page
  footer:      { marginTop: 20, paddingTop: 8, borderTop: `1 solid ${BORDER}`, flexDirection: 'row',
                 justifyContent: 'space-between', fontSize: 7, color: GREY },
  // Badge type
  badge:       { backgroundColor: '#DBEAFE', color: '#1D4ED8', paddingHorizontal: 6, paddingVertical: 2,
                 borderRadius: 3, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  badgeRed:    { backgroundColor: '#FEE2E2', color: '#B91C1C', paddingHorizontal: 6, paddingVertical: 2,
                 borderRadius: 3, fontSize: 8, fontFamily: 'Helvetica-Bold' },
})

// ── Composant principal ─────────────────────────────────────────────────
export function FichePaiementPDF({ data }: { data: FichePaiementData }) {
  const isSalaire = data.type_paiement === 'Salaire'

  return (
    <Document title={`Fiche ${data.pay_code} — ${data.prenom} ${data.nom}`}>
      <Page size="A4" style={s.page}>

        {/* En-tête */}
        <View style={s.header}>
          <View>
            <Text style={s.clubName}>{data.club_nom ?? 'FC Savièse'}</Text>
            <Text style={s.clubSub}>Valais · Suisse</Text>
          </View>
          <View>
            <Text style={s.docTitle}>
              {isSalaire ? 'Fiche de salaire' : 'Décompte de défraiement'}
            </Text>
            <Text style={s.docSub}>{data.pay_code} · Période : {data.periode}</Text>
          </View>
        </View>

        {/* Identité + coordonnées */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Bénéficiaire</Text>
          <View style={s.row2}>
            <View style={s.col}>
              <View style={s.fieldAlt}>
                <Text style={s.label}>Nom</Text>
                <Text style={s.value}>{data.prenom} {data.nom}</Text>
              </View>
              <View style={s.field}>
                <Text style={s.label}>Code</Text>
                <Text style={s.value}>{data.code}</Text>
              </View>
              <View style={s.fieldAlt}>
                <Text style={s.label}>Catégorie</Text>
                <Text style={s.value}>{data.categorie}</Text>
              </View>
            </View>
            <View style={s.col}>
              <View style={s.fieldAlt}>
                <Text style={s.label}>IBAN</Text>
                <Text style={s.value}>{data.iban || '—'}</Text>
              </View>
              {isSalaire && (
                <View style={s.field}>
                  <Text style={s.label}>N° AVS</Text>
                  <Text style={s.value}>{data.numero_avs || '—'}</Text>
                </View>
              )}
              <View style={s.fieldAlt}>
                <Text style={s.label}>Date de paiement</Text>
                <Text style={s.value}>{data.date_paiement}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Détail rémunération */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Détail de la rémunération</Text>

          {/* En-tête tableau */}
          <View style={s.tableHead}>
            <Text style={s.colDesc}>Description</Text>
            <Text style={s.colTaux}>Taux</Text>
            <Text style={s.colMontant}>Montant CHF</Text>
          </View>

          {/* Brut */}
          <View style={s.tableRowAlt}>
            <Text style={s.colDesc}>
              {isSalaire ? 'Salaire brut' : 'Défraiement brut'}
            </Text>
            <Text style={s.colTaux}></Text>
            <Text style={[s.colMontant, s.value]}>{chf(data.brut)}</Text>
          </View>

          {/* Retenues (uniquement si salaire) */}
          {isSalaire && data.total_retenues > 0 && (
            <>
              <View style={s.tableRow}>
                <Text style={s.colDesc}>Cotisation AVS (part employé)</Text>
                <Text style={s.colTaux}>5.30%</Text>
                <Text style={[s.colMontant, { color: '#DC2626' }]}>-{chf(data.retenue_avs)}</Text>
              </View>
              <View style={s.tableRowAlt}>
                <Text style={s.colDesc}>Cotisation AC</Text>
                <Text style={s.colTaux}>1.10%</Text>
                <Text style={[s.colMontant, { color: '#DC2626' }]}>-{chf(data.retenue_ac)}</Text>
              </View>
              <View style={s.tableRow}>
                <Text style={s.colDesc}>Assurance LAA</Text>
                <Text style={s.colTaux}>1.061%</Text>
                <Text style={[s.colMontant, { color: '#DC2626' }]}>-{chf(data.retenue_laa)}</Text>
              </View>
              <View style={s.tableRowAlt}>
                <Text style={s.colDesc}>ALFA</Text>
                <Text style={s.colTaux}>0.131%</Text>
                <Text style={[s.colMontant, { color: '#DC2626' }]}>-{chf(data.retenue_alfa)}</Text>
              </View>
              <View style={s.tableRow}>
                <Text style={[s.colDesc, { color: GREY }]}>Total des retenues</Text>
                <Text style={s.colTaux}></Text>
                <Text style={[s.colMontant, { color: '#DC2626', fontFamily: 'Helvetica-Bold' }]}>
                  -{chf(data.total_retenues)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Net à payer */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>
            {isSalaire ? 'Net à verser' : 'Montant à verser'}
          </Text>
          <Text style={s.totalMontant}>{chf(data.net)}</Text>
        </View>

        {/* IBAN rappel */}
        {data.iban && (
          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#F0FDF4', borderRadius: 2 }}>
            <Text style={{ fontSize: 8, color: '#166534' }}>
              Virement sur : <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.iban}</Text>
            </Text>
          </View>
        )}

        {/* Pied de page */}
        <View style={s.footer}>
          <Text>FC Savièse · Document généré automatiquement</Text>
          <Text>Réf. {data.pay_code} · {data.periode}</Text>
          <Text>
            {isSalaire
              ? 'Document confidentiel — Salaire soumis aux charges sociales'
              : 'Défraiement — Non soumis aux charges sociales'}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
