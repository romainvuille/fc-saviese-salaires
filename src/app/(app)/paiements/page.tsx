'use client'

import { useState, useEffect, useCallback } from 'react'
import { genererPaiements, getPaiements, updateStatutPaiement } from '@/actions/paiements'
import { getCantines, createCantine, validerCantine } from '@/actions/cantines'
import { getHeures, createHeure, deleteHeure } from '@/actions/heures'
import { getPersonnes } from '@/actions/personnes'
import { getExports, genererExports, envoyerVersBexio } from '@/actions/bexio'
import { fmtCHF, fmtDate, fmtNombre, colorStatutPaiement, labelStatutPaiement } from '@/lib/utils'
import { datePaiementTour, isTourValide, formatDateCH } from '@/lib/metier/dates'
import { calculerHeuresDecimal } from '@/lib/metier/charges'
import type { ResultatGeneration, Paiement, StatutPaiement, Cantine, Personne, Heure, BexioExport } from '@/types'
import { syncHeuresGoogleSheets, type ResultatSyncHeures } from '@/actions/google-sheets'
import { envoyerFicheParEmail, envoyerRecapFinancier } from '@/actions/email'

// ============================================================
// Types & constantes
// ============================================================

type TabPrincipal = 'generer' | 'paiements' | 'export' | 'documents'
type TabGen = 'mensuel' | 'saisonnier' | 'horaire' | 'cantine'

const STATUTS: StatutPaiement[] = ['À valider', 'Validé', 'Payé', 'Annulé']
const TYPES = ['Salaire', 'Défraiement']
const CANTINES_NOMS = ['Principale', 'Juniors Synthétique'] as const

const CURRENT_ROLE: 'admin' | 'manager' | 'employee' = 'admin'

const MOIS = [
  { value: 1, label: 'Janvier' }, { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' }, { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' }, { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' }, { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' }, { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' }, { value: 12, label: 'Décembre' },
]

const MOIS_LABELS = MOIS.map((m) => m.label)

const now = new Date()

// ============================================================
// Page principale
// ============================================================

export default function PaiementsUnifiePage() {
  const [tab, setTab] = useState<TabPrincipal>('generer')

  const tabs: { id: TabPrincipal; label: string }[] = [
    { id: 'generer', label: 'Générer' },
    { id: 'paiements', label: 'Paiements' },
    { id: 'export', label: 'Export' },
    { id: 'documents', label: 'Documents' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paiements</h1>
        <p className="text-sm text-gray-500 mt-1">
          Génération, suivi, export et documents des paiements et salaires.
        </p>
      </div>

      {/* Onglets principaux */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                px-5 py-3 text-sm font-medium border-b-2 transition-colors
                ${tab === t.id
                  ? 'border-[#D31616] text-[#D31616]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'generer' && <OngletGenerer />}
      {tab === 'paiements' && <OngletPaiements />}
      {tab === 'export' && <OngletExport />}
      {tab === 'documents' && <OngletDocuments />}
    </div>
  )
}

// ============================================================
// Onglet 1 — Générer
// ============================================================

function OngletGenerer() {
  const [tab, setTab] = useState<TabGen>('mensuel')

  const tabs: { id: TabGen; label: string }[] = [
    { id: 'mensuel', label: 'Mensuel' },
    { id: 'saisonnier', label: 'Saisonnier' },
    { id: 'horaire', label: 'Horaire' },
    { id: 'cantine', label: 'Cantine' },
  ]

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">
        Outil réservé aux administrateurs. Chaque génération crée les paiements manquants (les doublons sont ignorés).
      </p>

      {/* Sous-onglets */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${tab === t.id
                  ? 'border-[#D31616] text-[#D31616]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'mensuel' && <TabMensuel />}
      {tab === 'saisonnier' && <TabSaisonnier />}
      {tab === 'horaire' && <TabHoraire />}
      {tab === 'cantine' && <TabCantine />}
    </div>
  )
}

// ============================================================
// Composant résultat génération
// ============================================================

function ResultatGenerationView({
  result,
  onClose,
}: {
  result: ResultatGeneration
  onClose: () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Résultat de la génération</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{result.generes}</p>
          <p className="text-xs text-green-600 mt-0.5">Créés</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">{result.ignores}</p>
          <p className="text-xs text-yellow-600 mt-0.5">Ignorés (doublons)</p>
        </div>
        <div className={`border rounded-lg p-3 text-center ${result.erreurs.length > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
          <p className={`text-2xl font-bold ${result.erreurs.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{result.erreurs.length}</p>
          <p className={`text-xs mt-0.5 ${result.erreurs.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>Erreurs</p>
        </div>
      </div>

      {result.erreurs.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
          <p className="text-sm font-medium text-red-700 mb-2">Erreurs :</p>
          <ul className="space-y-1">
            {result.erreurs.map((e, i) => (
              <li key={i} className="text-sm text-red-600">• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.paiements.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Paiements créés :</p>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Code</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Personne</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Brut</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.paiements.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">{p.pay_code}</td>
                    <td className="px-3 py-2 text-gray-900">{p.nom_complet}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtCHF(p.brut)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtCHF(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Dialog de confirmation générique
// ============================================================

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  confirmLabel = 'Confirmer',
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
  confirmLabel?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm bg-[#D31616] text-white rounded-lg hover:bg-[#b91c1c] font-semibold disabled:opacity-60"
          >
            {loading ? 'Génération…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sous-onglet Mensuel
// ============================================================

function TabMensuel() {
  const [mois, setMois] = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResultatGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nomMois = MOIS.find((m) => m.value === mois)?.label ?? ''

  async function handleGenerer() {
    setLoading(true)
    setError(null)
    const res = await genererPaiements('mensuel', { mois, annee })
    setConfirming(false)
    if (res.success && res.data) {
      setResult(res.data)
    } else {
      setError(res.error ?? 'Erreur')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Paiements mensuels</h2>
        <p className="text-sm text-gray-500">
          Génère les paiements pour toutes les personnes en mode <strong>Mensuel fixe</strong> dont le mois est dans leur liste de mois payés.
        </p>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
            <select
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            >
              {MOIS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
            <input
              type="number"
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              min={2020}
              max={2030}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            />
          </div>
          <button
            onClick={() => setConfirming(true)}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Générer
          </button>
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {result && <ResultatGenerationView result={result} onClose={() => setResult(null)} />}

      {confirming && (
        <ConfirmDialog
          title="Confirmer la génération mensuelle"
          message={`Générer les paiements mensuels pour ${nomMois} ${annee} ? Les doublons seront automatiquement ignorés.`}
          onConfirm={handleGenerer}
          onCancel={() => setConfirming(false)}
          loading={loading}
        />
      )}
    </div>
  )
}

// ============================================================
// Sous-onglet Saisonnier
// ============================================================

function TabSaisonnier() {
  const [tour, setTour] = useState('T2 25-26')
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResultatGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tourValide = isTourValide(tour)
  let dateTour: string | null = null
  if (tourValide) {
    try {
      dateTour = formatDateCH(datePaiementTour(tour))
    } catch {
      dateTour = null
    }
  }

  async function handleGenerer() {
    setLoading(true)
    setError(null)
    const res = await genererPaiements('saisonnier', { tour })
    setConfirming(false)
    if (res.success && res.data) {
      setResult(res.data)
    } else {
      setError(res.error ?? 'Erreur')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Paiements saisonniers</h2>
        <p className="text-sm text-gray-500">
          Génère les paiements pour toutes les personnes en mode <strong>Saisonnier fixe</strong> actives.
          Le tour détermine la date de paiement (T1 → 30 décembre, T2 → 30 juin).
        </p>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tour</label>
            <input
              type="text"
              value={tour}
              onChange={(e) => setTour(e.target.value)}
              placeholder="ex: T2 25-26"
              className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20 w-32 ${
                tour && !tourValide ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            {tour && !tourValide && (
              <p className="text-xs text-red-600 mt-1">Format : T1 XX-YY ou T2 XX-YY</p>
            )}
          </div>
          {dateTour && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              <p className="text-xs text-blue-600">Date de paiement calculée</p>
              <p className="text-sm font-semibold text-blue-800">{dateTour}</p>
            </div>
          )}
          <button
            onClick={() => setConfirming(true)}
            disabled={!tourValide}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Générer
          </button>
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {result && <ResultatGenerationView result={result} onClose={() => setResult(null)} />}

      {confirming && (
        <ConfirmDialog
          title="Confirmer la génération saisonère"
          message={`Générer les paiements pour le tour ${tour} (date : ${dateTour}) ? Les doublons seront ignorés.`}
          onConfirm={handleGenerer}
          onCancel={() => setConfirming(false)}
          loading={loading}
        />
      )}
    </div>
  )
}

// ============================================================
// Sous-onglet Horaire
// ============================================================

function TabHoraire() {
  const isAdmin = CURRENT_ROLE === 'admin'
  const isAdminOrManager = CURRENT_ROLE === 'admin' || CURRENT_ROLE === 'manager'
  const isEmployee = CURRENT_ROLE === 'employee'
  const CURRENT_PERSONNE_ID: string | null = null

  const [mois, setMois] = useState(now.getMonth() + 1)
  const [annee, setAnnee] = useState(now.getFullYear())
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResultatGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [heures, setHeures] = useState<Heure[]>([])
  const [personnes, setPersonnes] = useState<Personne[]>([])
  const [loadingHeures, setLoadingHeures] = useState(true)
  const [filtrePersonne, setFiltrePersonne] = useState('')
  const [filtreMois, setFiltreMois] = useState(String(now.getMonth() + 1))
  const [filtreAnnee, setFiltreAnnee] = useState(String(now.getFullYear()))

  const [showForm, setShowForm] = useState(false)
  const [formPersonneId, setFormPersonneId] = useState(CURRENT_PERSONNE_ID ?? '')
  const [formDate, setFormDate] = useState(now.toISOString().split('T')[0])
  const [formDebut, setFormDebut] = useState('09:00')
  const [formFin, setFormFin] = useState('17:00')
  const [formActivite, setFormActivite] = useState('')
  const [formRemarques, setFormRemarques] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<ResultatSyncHeures | null>(null)

  const nomMois = MOIS.find((m) => m.value === mois)?.label ?? ''

  const dureeCalculee =
    formDebut && formFin && formFin > formDebut
      ? calculerHeuresDecimal(formDebut, formFin)
      : null

  const loadHeures = useCallback(async () => {
    setLoadingHeures(true)
    const [hResult, pResult] = await Promise.all([
      getHeures({
        personne_id: isEmployee ? (CURRENT_PERSONNE_ID ?? undefined) : (filtrePersonne || undefined),
        mois: filtreMois ? Number(filtreMois) : undefined,
        annee: filtreAnnee ? Number(filtreAnnee) : undefined,
      }),
      isAdminOrManager ? getPersonnes({ statut: 'Actif' }) : Promise.resolve({ data: [] as Personne[] }),
    ])
    setHeures(hResult.data ?? [])
    setPersonnes(pResult.data ?? [])
    setLoadingHeures(false)
  }, [filtrePersonne, filtreMois, filtreAnnee])

  useEffect(() => {
    loadHeures()
  }, [loadHeures])

  async function handleGenerer() {
    setLoading(true)
    setError(null)
    const res = await genererPaiements('horaire', { mois, annee })
    setConfirming(false)
    if (res.success && res.data) {
      setResult(res.data)
    } else {
      setError(res.error ?? 'Erreur')
    }
    setLoading(false)
  }

  async function handleSyncSheets() {
    setSyncing(true)
    setSyncResult(null)
    setError(null)
    try {
      const res = await syncHeuresGoogleSheets()
      setSyncResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la synchronisation')
    }
    setSyncing(false)
  }

  async function handleSubmitHeure(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!formPersonneId) {
      setFormError('Veuillez sélectionner une personne.')
      return
    }
    setSaving(true)
    const res = await createHeure({
      personne_id: formPersonneId,
      date_travail: formDate,
      heure_debut: formDebut,
      heure_fin: formFin,
      activite: formActivite,
      remarques: formRemarques || undefined,
    })
    if (res.success && res.data) {
      setHeures((prev) => [res.data!, ...prev])
      setShowForm(false)
      setFormActivite('')
      setFormRemarques('')
    } else {
      setFormError(res.error ?? 'Erreur')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette saisie d'heures ?")) return
    const res = await deleteHeure(id)
    if (res.success) {
      setHeures((prev) => prev.filter((h) => h.id !== id))
    }
  }

  const totalHeuresMois = heures.reduce((s, h) => s + h.heures_decimal, 0)

  const heuresParPersonne: Record<string, { nom: string; heures: Heure[] }> = {}
  if (isAdminOrManager) {
    for (const h of heures) {
      const p = personnes.find((p) => p.id === h.personne_id)
      const nom = p ? `${p.prenom} ${p.nom}` : h.personne_id
      if (!heuresParPersonne[h.personne_id]) {
        heuresParPersonne[h.personne_id] = { nom, heures: [] }
      }
      heuresParPersonne[h.personne_id].heures.push(h)
    }
  }

  return (
    <div className="space-y-5">
      {/* Section génération */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Paiements horaires</h2>
        <p className="text-sm text-gray-500">
          Agrège les heures saisies du mois pour chaque personne en mode <strong>Horaire</strong> et génère les paiements correspondants.
        </p>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mois</label>
            <select
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {MOIS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
            <input
              type="number"
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              min={2020}
              max={2030}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
            />
          </div>
          <button
            onClick={() => setConfirming(true)}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Générer
          </button>
          <button
            onClick={handleSyncSheets}
            disabled={syncing || loading}
            className="border border-[#D31616] text-[#D31616] hover:bg-[#D31616]/5 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Synchronisation…
              </>
            ) : '🔄 Synchroniser depuis Google Sheets'}
          </button>
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {syncResult && (
          <div className={`p-4 rounded-lg border text-sm space-y-1 ${syncResult.errors.length > 0 && syncResult.imported === 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="font-semibold text-gray-800">Résultat de la synchronisation</div>
            <div>✅ Importées : <span className="font-medium">{syncResult.imported}</span></div>
            <div>⏭ Ignorées (doublons) : <span className="font-medium">{syncResult.skipped}</span></div>
            {syncResult.errors.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-red-700">⚠️ {syncResult.errors.length} avertissement(s) :</div>
                <ul className="mt-1 space-y-0.5 text-red-600">
                  {syncResult.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                  {syncResult.errors.length > 5 && <li>… et {syncResult.errors.length - 5} autre(s)</li>}
                </ul>
              </div>
            )}
            <button onClick={() => { setSyncResult(null); loadHeures() }} className="mt-2 text-xs underline text-gray-500 hover:text-gray-700">Fermer et rafraîchir</button>
          </div>
        )}
      </div>

      {result && <ResultatGenerationView result={result} onClose={() => setResult(null)} />}

      {confirming && (
        <ConfirmDialog
          title="Confirmer la génération horaire"
          message={`Générer les paiements horaires pour ${nomMois} ${annee} sur la base des heures saisies ?`}
          onConfirm={handleGenerer}
          onCancel={() => setConfirming(false)}
          loading={loading}
        />
      )}

      {/* Section saisie heures */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Saisie des heures</h3>
            {isEmployee && (
              <p className="text-sm text-gray-500 mt-0.5">
                Total du mois : <strong>{fmtNombre(totalHeuresMois)} h</strong>
              </p>
            )}
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {showForm ? 'Annuler' : '+ Saisir des heures'}
          </button>
        </div>

        {isAdminOrManager && (
          <div className="flex flex-wrap gap-3">
            <select
              value={filtrePersonne}
              onChange={(e) => setFiltrePersonne(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            >
              <option value="">Toutes les personnes</option>
              {personnes.filter((p) => p.mode === 'Horaire').map((p) => (
                <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
              ))}
            </select>
            <select
              value={filtreMois}
              onChange={(e) => setFiltreMois(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            >
              <option value="">Tous les mois</option>
              {MOIS_LABELS.map((m, i) => (
                <option key={i + 1} value={String(i + 1)}>{m}</option>
              ))}
            </select>
            <select
              value={filtreAnnee}
              onChange={(e) => setFiltreAnnee(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
            >
              {[2024, 2025, 2026, 2027].map((a) => (
                <option key={a} value={String(a)}>{a}</option>
              ))}
            </select>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmitHeure} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h4 className="font-semibold text-gray-900">Nouvelle saisie d'heures</h4>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
            )}

            {isAdminOrManager && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Personne *</label>
                <select
                  value={formPersonneId}
                  onChange={(e) => setFormPersonneId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                >
                  <option value="">— Sélectionner —</option>
                  {personnes.filter((p) => p.mode === 'Horaire').map((p) => (
                    <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                <input
                  type="date"
                  value={formDate}
                  max={now.toISOString().split('T')[0]}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Heure début *</label>
                <input
                  type="time"
                  value={formDebut}
                  onChange={(e) => setFormDebut(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Heure fin *</label>
                <input
                  type="time"
                  value={formFin}
                  onChange={(e) => setFormFin(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Durée</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-semibold text-gray-700">
                  {dureeCalculee !== null
                    ? <span className="text-green-700">{fmtNombre(dureeCalculee)} h</span>
                    : <span className="text-gray-400">—</span>
                  }
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Activité *</label>
                <input
                  type="text"
                  value={formActivite}
                  onChange={(e) => setFormActivite(e.target.value)}
                  placeholder="ex: Match à domicile, Entraînement, Service cantine…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Remarques (optionnel)</label>
                <input
                  type="text"
                  value={formRemarques}
                  onChange={(e) => setFormRemarques(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving || dureeCalculee === null}
                className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}

        {isAdminOrManager && !loadingHeures && (
          <div className="space-y-4">
            {Object.keys(heuresParPersonne).length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">
                Aucune heure enregistrée pour les filtres sélectionnés
              </div>
            ) : (
              Object.entries(heuresParPersonne).map(([pid, { nom, heures: heuresToShow }]) => {
                const total = heuresToShow.reduce((s, h) => s + h.heures_decimal, 0)
                return (
                  <div key={pid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                      <h4 className="font-semibold text-gray-800">{nom}</h4>
                      <span className="text-sm font-bold text-gray-700">
                        {fmtNombre(total)} h au total
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Date</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Début</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Fin</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Heures</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Activité</th>
                          {isAdmin && <th className="px-4 py-2.5" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {heuresToShow.map((h) => (
                          <tr key={h.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-700">{fmtDate(h.date_travail)}</td>
                            <td className="px-4 py-2.5 text-gray-600">{h.heure_debut}</td>
                            <td className="px-4 py-2.5 text-gray-600">{h.heure_fin}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtNombre(h.heures_decimal)} h</td>
                            <td className="px-4 py-2.5 text-gray-700">
                              {h.activite}
                              {h.remarques && (
                                <span className="text-xs text-gray-400 ml-2">({h.remarques})</span>
                              )}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  onClick={() => handleDelete(h.id)}
                                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                                >
                                  Supprimer
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })
            )}
            <div className="text-right text-sm font-semibold text-gray-700 pr-1">
              Total général : {fmtNombre(totalHeuresMois)} h
            </div>
          </div>
        )}

        {isEmployee && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-700">
                Total du mois sélectionné :{' '}
                <strong className="text-blue-900">{fmtNombre(totalHeuresMois)} heures</strong>
              </p>
            </div>
            <div className="flex gap-3">
              <select
                value={filtreMois}
                onChange={(e) => setFiltreMois(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {MOIS_LABELS.map((m, i) => (
                  <option key={i + 1} value={String(i + 1)}>{m}</option>
                ))}
              </select>
              <select
                value={filtreAnnee}
                onChange={(e) => setFiltreAnnee(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {[2024, 2025, 2026, 2027].map((a) => (
                  <option key={a} value={String(a)}>{a}</option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loadingHeures ? (
                <div className="flex items-center justify-center h-24">
                  <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Début</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fin</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Heures</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Activité</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {heures.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-400">
                          Aucune heure ce mois
                        </td>
                      </tr>
                    ) : (
                      heures.map((h) => (
                        <tr key={h.id}>
                          <td className="px-4 py-3">{fmtDate(h.date_travail)}</td>
                          <td className="px-4 py-3 text-gray-600">{h.heure_debut}</td>
                          <td className="px-4 py-3 text-gray-600">{h.heure_fin}</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmtNombre(h.heures_decimal)} h</td>
                          <td className="px-4 py-3 text-gray-700">{h.activite}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {heures.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNombre(totalHeuresMois)} h</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Sous-onglet Cantine (dans Générer)
// ============================================================

function TabCantine() {
  const isAdmin = CURRENT_ROLE === 'admin'
  const isAdminOrManager = CURRENT_ROLE === 'admin' || CURRENT_ROLE === 'manager'

  const [periode, setPeriode] = useState('')
  const [confirmingGen, setConfirmingGen] = useState(false)
  const [loadingGen, setLoadingGen] = useState(false)
  const [result, setResult] = useState<ResultatGeneration | null>(null)
  const [errorGen, setErrorGen] = useState<string | null>(null)
  const periodes = ['2026-04', '2026-03', '2026-02']

  const [cantines, setCantines] = useState<Cantine[]>([])
  const [personnes, setPersonnes] = useState<Personne[]>([])
  const [loadingCantines, setLoadingCantines] = useState(true)
  const [filtrePeriode, setFiltrePeriode] = useState('')
  const [filtreCantine, setFiltreCantine] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [validating, setValidating] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [formPeriode, setFormPeriode] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
  const [formCantine, setFormCantine] = useState<typeof CANTINES_NOMS[number]>('Principale')
  const [formRecette, setFormRecette] = useState('')
  const [formCharges, setFormCharges] = useState('')
  const [formPersonneId, setFormPersonneId] = useState('')
  const [formDatePaiement, setFormDatePaiement] = useState('')
  const [formNotes, setFormNotes] = useState('')

  const recette = parseFloat(formRecette) || 0
  const charges = parseFloat(formCharges) || 0
  const beneficeNet = recette - charges
  const partClub = Math.round(beneficeNet * 0.6 * 100) / 100
  const partCantiniers = Math.round(beneficeNet * 0.4 * 100) / 100

  const loadCantines = useCallback(async () => {
    setLoadingCantines(true)
    const [cResult, pResult] = await Promise.all([
      getCantines({
        periode: filtrePeriode || undefined,
        cantine: filtreCantine || undefined,
        statut: filtreStatut || undefined,
      }),
      getPersonnes({ statut: 'Actif' }),
    ])
    setCantines(cResult.data ?? [])
    setPersonnes(pResult.data ?? [])
    setLoadingCantines(false)
  }, [filtrePeriode, filtreCantine, filtreStatut])

  useEffect(() => {
    loadCantines()
  }, [loadCantines])

  async function handleGenererCantine() {
    setLoadingGen(true)
    setErrorGen(null)
    const res = await genererPaiements('cantine', { periode_cantine: periode })
    setConfirmingGen(false)
    if (res.success && res.data) {
      setResult(res.data)
    } else {
      setErrorGen(res.error ?? 'Erreur')
    }
    setLoadingGen(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    if (!formPersonneId) {
      setFormError('Veuillez sélectionner un cantinier.')
      return
    }
    const res = await createCantine({
      periode: formPeriode,
      cantine: formCantine,
      recette_brute: recette,
      charges,
      personne_id: formPersonneId,
      date_paiement: formDatePaiement || undefined,
      notes: formNotes || undefined,
    })
    if (res.success && res.data) {
      setCantines((prev) => [res.data!, ...prev])
      setFormSuccess('Cantine enregistrée avec succès.')
      setShowForm(false)
      setTimeout(() => setFormSuccess(null), 4000)
    } else {
      setFormError(res.error ?? 'Erreur')
    }
  }

  async function handleValider(id: string) {
    setValidating(id)
    const res = await validerCantine(id)
    if (res.success && res.data) {
      setCantines((prev) => prev.map((c) => (c.id === id ? res.data! : c)))
    }
    setValidating(null)
  }

  const cantiniersEligibles = personnes.filter(
    (p) => p.mode === 'Bénéfice cantine' || p.mode === 'Horaire'
  )

  const totalRecette = cantines.reduce((s, c) => s + c.recette_brute, 0)
  const totalBenefice = cantines.reduce((s, c) => s + c.benefice_net, 0)

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Générer paiements cantine</h2>
        <p className="text-sm text-gray-500">
          Génère les paiements de bénéfice cantine pour une période validée. Seules les cantines avec le statut <strong>Validé</strong> apparaissent.
        </p>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Période</label>
            <select
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">— Sélectionner —</option>
              {periodes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button
            onClick={() => setConfirmingGen(true)}
            disabled={!periode}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Générer
          </button>
        </div>
        {errorGen && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errorGen}</div>
        )}
      </div>

      {result && <ResultatGenerationView result={result} onClose={() => setResult(null)} />}

      {confirmingGen && (
        <ConfirmDialog
          title="Confirmer la génération cantine"
          message={`Générer les paiements de bénéfice cantine pour la période ${periode} ?`}
          onConfirm={handleGenererCantine}
          onCancel={() => setConfirmingGen(false)}
          loading={loadingGen}
        />
      )}

      <div className="border-t border-gray-100 pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Enregistrements cantine</h3>
            <p className="text-sm text-gray-500 mt-0.5">{cantines.length} enregistrement{cantines.length !== 1 ? 's' : ''}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-[#D31616] hover:bg-[#b91c1c] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {showForm ? 'Annuler' : '+ Nouvelle entrée'}
            </button>
          )}
        </div>

        {formSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {formSuccess}
          </div>
        )}

        {showForm && isAdmin && (
          <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
            <h4 className="font-semibold text-gray-900">Nouvelle entrée cantine</h4>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{formError}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Période *</label>
                <input
                  type="month"
                  value={formPeriode}
                  onChange={(e) => setFormPeriode(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantine *</label>
                <select
                  value={formCantine}
                  onChange={(e) => setFormCantine(e.target.value as typeof CANTINES_NOMS[number])}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                >
                  {CANTINES_NOMS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantinier *</label>
                <select
                  value={formPersonneId}
                  onChange={(e) => setFormPersonneId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                >
                  <option value="">— Sélectionner —</option>
                  {cantiniersEligibles.map((p) => (
                    <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recette brute (CHF) *</label>
                <input
                  type="number"
                  value={formRecette}
                  onChange={(e) => setFormRecette(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Charges (CHF) *</label>
                <input
                  type="number"
                  value={formCharges}
                  onChange={(e) => setFormCharges(e.target.value)}
                  step="0.01"
                  min="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date paiement</label>
                <input
                  type="date"
                  value={formDatePaiement}
                  onChange={(e) => setFormDatePaiement(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                />
              </div>
            </div>

            {recette > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm font-semibold text-blue-800 mb-3">Calcul automatique</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-gray-500">Bénéfice net</p>
                    <p className="font-bold text-gray-900 mt-0.5">{fmtCHF(beneficeNet)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-gray-500">60 % Club</p>
                    <p className="font-bold text-gray-900 mt-0.5">{fmtCHF(partClub)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-gray-500">40 % Cantiniers</p>
                    <p className="font-bold text-gray-900 mt-0.5">{fmtCHF(partCantiniers)}</p>
                  </div>
                  <div className="bg-[#D31616]/10 rounded-lg p-3">
                    <p className="text-xs text-[#D31616]">Part cantinier</p>
                    <p className="font-bold text-[#D31616] mt-0.5">{fmtCHF(partCantiniers)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-3">
          <input
            value={filtrePeriode}
            onChange={(e) => setFiltrePeriode(e.target.value)}
            placeholder="Période (ex: 2026-04)"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
          />
          <select
            value={filtreCantine}
            onChange={(e) => setFiltreCantine(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
          >
            <option value="">Toutes les cantines</option>
            {CANTINES_NOMS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
          >
            <option value="">Tous les statuts</option>
            <option value="En attente">En attente</option>
            <option value="Validé">Validé</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            {loadingCantines ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Période</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cantine</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Recette</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Charges</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Bénéfice</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">60% Club</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Part cantinier</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                    {isAdminOrManager && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cantines.length === 0 ? (
                    <tr>
                      <td colSpan={isAdminOrManager ? 9 : 8} className="text-center py-12 text-gray-400">
                        Aucune entrée cantine
                      </td>
                    </tr>
                  ) : (
                    cantines.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.periode}</td>
                        <td className="px-4 py-3 text-gray-600">{c.cantine}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{fmtCHF(c.recette_brute)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">-{fmtCHF(c.charges)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCHF(c.benefice_net)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmtCHF(c.part_club_60)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[#D31616]">{fmtCHF(c.part_cantinier)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.statut === 'Validé'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {c.statut}
                          </span>
                        </td>
                        {isAdminOrManager && (
                          <td className="px-4 py-3 text-center">
                            {c.statut === 'En attente' && isAdmin && (
                              <button
                                onClick={() => handleValider(c.id)}
                                disabled={validating === c.id}
                                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {validating === c.id ? '…' : 'Valider'}
                              </button>
                            )}
                            {c.statut === 'Validé' && (
                              <span className="text-xs text-gray-400">Validé</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {cantines.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalRecette)}</td>
                      <td />
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalBenefice)}</td>
                      <td colSpan={isAdminOrManager ? 4 : 3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Onglet 2 — Paiements
// ============================================================

function OngletPaiements() {
  const isAdmin = CURRENT_ROLE === 'admin'
  const isAdminOrManager = CURRENT_ROLE === 'admin' || CURRENT_ROLE === 'manager'

  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [loading, setLoading] = useState(true)
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreType, setFiltreType] = useState('')
  const [filtrePeriode, setFiltrePeriode] = useState('')
  const [filtreSearch, setFiltreSearch] = useState('')
  const [changingId, setChangingId] = useState<string | null>(null)
  const [dateVirementModal, setDateVirementModal] = useState<{ id: string; current: string | null } | null>(null)
  const [dateVirementInput, setDateVirementInput] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getPaiements({
      statut: filtreStatut || undefined,
      type_paiement: filtreType || undefined,
      periode: filtrePeriode || undefined,
      personne_search: filtreSearch || undefined,
    })
    setPaiements(result.data ?? [])
    setLoading(false)
  }, [filtreStatut, filtreType, filtrePeriode, filtreSearch])

  useEffect(() => {
    load()
  }, [load])

  async function handleStatutChange(id: string, statut: StatutPaiement) {
    if (statut === 'Payé') {
      setDateVirementModal({ id, current: null })
      setDateVirementInput(new Date().toISOString().split('T')[0])
      return
    }
    setChangingId(id)
    const result = await updateStatutPaiement(id, statut)
    if (result.success && result.data) {
      setPaiements((prev) => prev.map((p) => (p.id === id ? result.data! : p)))
    }
    setChangingId(null)
  }

  async function handleConfirmPaye() {
    if (!dateVirementModal) return
    setChangingId(dateVirementModal.id)
    const result = await updateStatutPaiement(dateVirementModal.id, 'Payé', dateVirementInput)
    if (result.success && result.data) {
      setPaiements((prev) => prev.map((p) => (p.id === dateVirementModal.id ? result.data! : p)))
    }
    setDateVirementModal(null)
    setChangingId(null)
  }

  function exportCSV() {
    const headers = ['Code', 'Date', 'Personne', 'Période', 'Type', 'Brut CHF', 'Retenues', 'Net CHF', 'Statut', 'Date virement']
    const rows = paiements.map((p) => [
      p.pay_code,
      p.date_paiement,
      p.nom_complet,
      p.periode,
      p.type_paiement,
      p.brut.toFixed(2),
      p.total_retenues.toFixed(2),
      p.net.toFixed(2),
      p.statut,
      p.date_virement ?? '',
    ])
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `paiements_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalBrut = paiements.reduce((s, p) => s + p.brut, 0)
  const totalNet = paiements.reduce((s, p) => s + p.net, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{paiements.length} paiement{paiements.length !== 1 ? 's' : ''}</p>
        <button
          onClick={exportCSV}
          className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        >
          <option value="">Tous les statuts</option>
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filtreType}
          onChange={(e) => setFiltreType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        >
          <option value="">Tous les types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={filtrePeriode}
          onChange={(e) => setFiltrePeriode(e.target.value)}
          placeholder="Période (ex: 05/2026)"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        />
        <input
          value={filtreSearch}
          onChange={(e) => setFiltreSearch(e.target.value)}
          placeholder="Rechercher personne…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        />
        {(filtreStatut || filtreType || filtrePeriode || filtreSearch) && (
          <button
            onClick={() => {
              setFiltreStatut('')
              setFiltreType('')
              setFiltrePeriode('')
              setFiltreSearch('')
            }}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Personne</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Période</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Brut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Retenues</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Net</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                  {isAdminOrManager && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paiements.length === 0 ? (
                  <tr>
                    <td colSpan={isAdminOrManager ? 10 : 9} className="text-center py-12 text-gray-400">
                      Aucun paiement trouvé
                    </td>
                  </tr>
                ) : (
                  paiements.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{p.pay_code}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(p.date_paiement)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.nom_complet}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.periode}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.type_paiement}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtCHF(p.brut)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                        {p.total_retenues > 0 ? `-${fmtCHF(p.total_retenues)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtCHF(p.net)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorStatutPaiement(p.statut)}`}>
                          {labelStatutPaiement(p.statut)}
                        </span>
                        {p.date_virement && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            virement {fmtDate(p.date_virement)}
                          </span>
                        )}
                      </td>
                      {isAdminOrManager && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {p.statut !== 'Annulé' && (
                              <select
                                value={p.statut}
                                onChange={(e) => handleStatutChange(p.id, e.target.value as StatutPaiement)}
                                disabled={changingId === p.id}
                                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D31616]/30 disabled:opacity-50"
                              >
                                {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )}
                            <a
                              href={`/api/pdf/paiement/${p.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                              title={`Fiche PDF — ${p.nom_complet}`}
                            >
                              📄 PDF
                            </a>
                            {isAdmin && p.statut !== 'Annulé' && (
                              <button
                                onClick={() => handleStatutChange(p.id, 'Annulé')}
                                disabled={changingId === p.id}
                                className="text-xs text-red-500 hover:text-red-700 hover:underline whitespace-nowrap disabled:opacity-50"
                              >
                                Annuler
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {paiements.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Total ({paiements.length})
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalBrut)}</td>
                    <td />
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalNet)}</td>
                    <td colSpan={isAdminOrManager ? 2 : 1} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {dateVirementModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Date de virement</h3>
            <p className="text-sm text-gray-600">
              Indiquez la date à laquelle le virement a été effectué.
            </p>
            <input
              type="date"
              value={dateVirementInput}
              onChange={(e) => setDateVirementInput(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDateVirementModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmPaye}
                disabled={!dateVirementInput}
                className="px-4 py-2 text-sm bg-[#D31616] text-white rounded-lg hover:bg-[#b91c1c] disabled:opacity-50 font-semibold"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Onglet 3 — Export
// ============================================================

function OngletExport() {
  const [pain001Statut, setPain001Statut] = useState('Validé')
  const [pain001Periode, setPain001Periode] = useState('')
  const [pain001Date, setPain001Date] = useState(now.toISOString().split('T')[0])
  const [pain001Loading, setPain001Loading] = useState(false)
  const [pain001Msg, setPain001Msg] = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleTelechargerPain001() {
    setPain001Loading(true)
    setPain001Msg(null)
    try {
      const params = new URLSearchParams({
        statut: pain001Statut,
        date: pain001Date,
      })
      if (pain001Periode) params.set('periode', pain001Periode)

      const res = await fetch(`/api/pain001?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json()
        setPain001Msg({ ok: false, msg: err.error ?? 'Erreur lors de la génération.' })
        return
      }

      // Téléchargement du fichier
      const blob = await res.blob()
      const filename = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]
        ?? `pain001_${pain001Date}.xml`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setPain001Msg({ ok: true, msg: `Fichier ${filename} téléchargé avec succès.` })
      setTimeout(() => setPain001Msg(null), 6000)
    } catch (err) {
      setPain001Msg({ ok: false, msg: err instanceof Error ? err.message : 'Erreur réseau.' })
    }
    setPain001Loading(false)
  }

  return (
    <div className="space-y-6">
      {/* Pain.001 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Virement bancaire ISO 20022 (pain.001)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Génère un fichier XML <strong>pain.001.001.03</strong> pour les virements en masse via e-banking Raiffeisen.
            Inclut tous les paiements du statut sélectionné qui ont un IBAN configuré.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Statut des paiements</label>
            <select
              value={pain001Statut}
              onChange={(e) => setPain001Statut(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            >
              {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Période (optionnel)</label>
            <input
              value={pain001Periode}
              onChange={(e) => setPain001Periode(e.target.value)}
              placeholder="ex: 05/2026 ou T2 25-26"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date d'exécution</label>
            <input
              type="date"
              value={pain001Date}
              onChange={(e) => setPain001Date(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            />
          </div>
        </div>

        {pain001Msg && (
          <div className={`p-3 rounded-lg text-sm border ${pain001Msg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {pain001Msg.ok ? '✅ ' : '❌ '}{pain001Msg.msg}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={handleTelechargerPain001}
            disabled={pain001Loading}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {pain001Loading ? (
              <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Génération…</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Télécharger pain.001 XML</>
            )}
          </button>
          <p className="text-xs text-gray-400">
            ⚠️ Assurez-vous que <strong>iban_club</strong> est configuré dans les Paramètres avant de générer.
          </p>
        </div>
      </div>

      <SectionBexio />
    </div>
  )
}

function SectionBexio() {
  const [exports, setExports] = useState<BexioExport[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingExports, setGeneratingExports] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; msg: string } | null>(null)

  async function load() {
    setLoading(true)
    const result = await getExports()
    setExports(result.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleGenererExports() {
    setGeneratingExports(true)
    setMessage(null)
    const result = await genererExports()
    if (result.success && result.data) {
      setMessage({ ok: true, msg: `${result.data.nb_crees} écriture(s) générée(s).` })
      await load()
    } else {
      setMessage({ ok: false, msg: result.error ?? 'Erreur' })
    }
    setGeneratingExports(false)
  }

  async function handleEnvoyer() {
    setSending(true)
    setConfirmSend(false)
    setMessage(null)
    const result = await envoyerVersBexio()
    if (result.success && result.data) {
      setMessage({
        ok: true,
        msg: `${result.data.envoyes} envoyé(s), ${result.data.erreurs} erreur(s).`,
      })
      await load()
    } else {
      setMessage({ ok: false, msg: result.error ?? 'Erreur' })
    }
    setSending(false)
  }

  const aExporter = exports.filter((e) => e.statut === 'À exporter')
  const envoyes = exports.filter((e) => e.statut === 'Envoyé')
  const enErreur = exports.filter((e) => e.statut === 'Erreur')

  function colorStatutBexio(statut: BexioExport['statut']): string {
    switch (statut) {
      case 'À exporter': return 'bg-yellow-100 text-yellow-800'
      case 'Envoyé': return 'bg-green-100 text-green-800'
      case 'Erreur': return 'bg-red-100 text-red-800'
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">Export Bexio</h2>
        <p className="text-sm text-gray-500 mt-1">
          Génération et envoi des écritures comptables vers Bexio.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.msg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-xl border p-4 ${aExporter.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">À exporter</p>
          <p className={`text-2xl font-bold ${aExporter.length > 0 ? 'text-yellow-700' : 'text-gray-400'}`}>
            {aExporter.length}
          </p>
        </div>
        <div className="rounded-xl border bg-green-50 border-green-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Envoyés</p>
          <p className="text-2xl font-bold text-green-700">{envoyes.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${enErreur.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Erreurs</p>
          <p className={`text-2xl font-bold ${enErreur.length > 0 ? 'text-[#D31616]' : 'text-gray-400'}`}>
            {enErreur.length}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Actions</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-gray-900 text-sm">1. Générer les écritures comptables</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Crée les lignes d'export pour tous les paiements Validé/Payé qui n'ont pas encore d'écriture Bexio.
              </p>
            </div>
            <button
              onClick={handleGenererExports}
              disabled={generatingExports}
              className="bg-gray-800 hover:bg-gray-900 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {generatingExports ? 'Génération…' : 'Générer les écritures'}
            </button>
          </div>
          <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex-1">
              <p className="font-medium text-gray-900 text-sm">2. Envoyer vers l'API Bexio</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Envoie les {aExporter.length} écriture(s) "À exporter" vers Bexio via l'API.
                Nécessite une clé API valide dans les Paramètres.
              </p>
            </div>
            <button
              onClick={() => setConfirmSend(true)}
              disabled={aExporter.length === 0 || sending}
              className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {sending ? 'Envoi…' : `Envoyer (${aExporter.length})`}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Écritures ({exports.length})</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Paiement</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Débit</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Crédit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Montant</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Réf. Bexio</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {exports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      Aucune écriture — Cliquez sur "Générer les écritures" pour commencer
                    </td>
                  </tr>
                ) : (
                  exports.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {e.paiement_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDate(e.date_ecriture)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                        {e.description}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.compte_debit}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.compte_credit}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {fmtCHF(e.montant)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {e.bexio_ref ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatutBexio(e.statut)}`}>
                            {e.statut}
                          </span>
                          {e.erreur_msg && (
                            <p className="text-xs text-red-500 mt-0.5">{e.erreur_msg}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {confirmSend && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Confirmer l'envoi vers Bexio</h3>
            <p className="text-sm text-gray-600">
              Vous êtes sur le point d'envoyer <strong>{aExporter.length} écriture(s)</strong> vers l'API Bexio.
              Cette action est irréversible. Assurez-vous que la clé API est correcte dans les Paramètres.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmSend(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={handleEnvoyer}
                className="px-4 py-2 text-sm bg-[#D31616] text-white rounded-lg hover:bg-[#b91c1c] font-semibold"
              >
                Envoyer vers Bexio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Onglet 4 — Documents
// ============================================================

function OngletDocuments() {
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [loading, setLoading] = useState(true)
  const [filtreStatut, setFiltreStatut] = useState('Validé')
  const [filtrePeriode, setFiltrePeriode] = useState('')
  const [filtreSearch, setFiltreSearch] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendMsg, setSendMsg] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  // Récap financier
  const [recapMois, setRecapMois] = useState(now.getMonth() + 1)
  const [recapAnnee, setRecapAnnee] = useState(now.getFullYear())
  const [sendingRecap, setSendingRecap] = useState(false)
  const [recapMsg, setRecapMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getPaiements({
      statut: filtreStatut || undefined,
      periode: filtrePeriode || undefined,
      personne_search: filtreSearch || undefined,
    })
    setPaiements(result.data ?? [])
    setLoading(false)
  }, [filtreStatut, filtrePeriode, filtreSearch])

  useEffect(() => { load() }, [load])

  async function handleEnvoyerFiche(paiementId: string) {
    setSendingId(paiementId)
    setSendMsg(null)
    const res = await envoyerFicheParEmail(paiementId)
    setSendMsg({
      id: paiementId,
      ok: res.success,
      msg: res.success ? 'Fiche envoyée avec succès.' : (res.error ?? 'Erreur'),
    })
    setSendingId(null)
    if (res.success) setTimeout(() => setSendMsg(null), 5000)
  }

  async function handleEnvoyerRecap() {
    setSendingRecap(true)
    setRecapMsg(null)
    const res = await envoyerRecapFinancier(recapMois, recapAnnee)
    setRecapMsg({
      ok: res.success,
      msg: res.success
        ? `Récap envoyé à romain.vuille@gmail.com`
        : (res.error ?? 'Erreur'),
    })
    setSendingRecap(false)
    if (res.success) setTimeout(() => setRecapMsg(null), 8000)
  }

  return (
    <div className="space-y-5">
      {/* Récap financier mensuel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Récapitulatif financier mensuel</h2>
          <p className="text-sm text-gray-500 mt-1">
            Envoie un email récapitulatif de tous les paiements du mois à l'admin.
          </p>
        </div>
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mois</label>
            <select
              value={recapMois}
              onChange={(e) => setRecapMois(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            >
              {MOIS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Année</label>
            <input
              type="number"
              value={recapAnnee}
              onChange={(e) => setRecapAnnee(Number(e.target.value))}
              min={2024} max={2030}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
            />
          </div>
          <button
            onClick={handleEnvoyerRecap}
            disabled={sendingRecap}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {sendingRecap ? (
              <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Envoi…</>
            ) : '📧 Envoyer le récap'}
          </button>
        </div>
        {recapMsg && (
          <div className={`p-3 rounded-lg text-sm border ${recapMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {recapMsg.ok ? '✅ ' : '❌ '}{recapMsg.msg}
          </div>
        )}
      </div>

      {/* Fiches de paie PDF + email */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Fiches de paie individuelles</h2>
          <p className="text-sm text-gray-500 mt-1">
            Téléchargez ou envoyez par email la fiche PDF de chaque personne.
            L'email est envoyé à l'adresse configurée dans la fiche de la personne.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
          >
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            value={filtrePeriode}
            onChange={(e) => setFiltrePeriode(e.target.value)}
            placeholder="Période (ex: 05/2026)"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
          />
          <input
            value={filtreSearch}
            onChange={(e) => setFiltreSearch(e.target.value)}
            placeholder="Rechercher personne…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
          />
          {(filtreStatut || filtrePeriode || filtreSearch) && (
            <button
              onClick={() => { setFiltreStatut(''); setFiltrePeriode(''); setFiltreSearch('') }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 underline"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {sendMsg && (
          <div className={`p-3 rounded-lg text-sm border ${sendMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {sendMsg.ok ? '✅ ' : '❌ '}{sendMsg.msg}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
            </div>
          ) : paiements.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">Aucun paiement trouvé</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Personne</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Période</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Net CHF</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paiements.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.nom_complet}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.periode}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.type_paiement}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtCHF(p.net)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatutPaiement(p.statut)}`}>
                        {labelStatutPaiement(p.statut)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-3">
                        <a
                          href={`/api/pdf/paiement/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                        >
                          📄 PDF
                        </a>
                        <button
                          onClick={() => handleEnvoyerFiche(p.id)}
                          disabled={sendingId === p.id}
                          className="text-xs font-medium text-[#D31616] hover:text-[#b91c1c] hover:underline whitespace-nowrap disabled:opacity-50"
                          title="Envoyer par email à la personne"
                        >
                          {sendingId === p.id ? 'Envoi…' : '📧 Email'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Certificats */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Certificats de salaire (Lohnausweis)</h2>
        <p className="text-sm text-gray-500">
          Lohnausweis annuels disponibles prochainement.
        </p>
        <button
          disabled
          className="border border-gray-300 text-gray-400 font-medium px-4 py-2 rounded-lg text-sm cursor-not-allowed opacity-60"
        >
          Générer les Lohnausweis
        </button>
      </div>
    </div>
  )
}
