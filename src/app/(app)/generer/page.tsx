'use client'

import { useState } from 'react'
import { genererPaiements } from '@/actions/paiements'
import { fmtCHF } from '@/lib/utils'
import { datePaiementTour, isTourValide, formatDateCH } from '@/lib/metier/dates'
import type { ResultatGeneration } from '@/types'

type TabGen = 'mensuel' | 'saisonnier' | 'horaire' | 'cantine'

const MOIS = [
  { value: 1, label: 'Janvier' }, { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' }, { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' }, { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' }, { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' }, { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' }, { value: 12, label: 'Décembre' },
]

const now = new Date()

export default function GenererPage() {
  const [tab, setTab] = useState<TabGen>('mensuel')

  const tabs: { id: TabGen; label: string }[] = [
    { id: 'mensuel', label: 'Mensuel' },
    { id: 'saisonnier', label: 'Saisonnier' },
    { id: 'horaire', label: 'Horaire' },
    { id: 'cantine', label: 'Cantine' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Générer des paiements</h1>
        <p className="text-sm text-gray-500 mt-1">
          Outil réservé aux administrateurs. Chaque génération crée les paiements manquants (les doublons sont ignorés).
        </p>
      </div>

      {/* Onglets */}
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

      {tab === 'mensuel' && <TabMensuel />}
      {tab === 'saisonnier' && <TabSaisonnier />}
      {tab === 'horaire' && <TabHoraire />}
      {tab === 'cantine' && <TabCantine />}
    </div>
  )
}

// ============================================================
// Composant résultat commun
// ============================================================

function ResultatGeneration({
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
// Dialog de confirmation
// ============================================================

function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
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
            {loading ? 'Génération…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Onglet Mensuel
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

      {result && <ResultatGeneration result={result} onClose={() => setResult(null)} />}

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
// Onglet Saisonnier
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

      {result && <ResultatGeneration result={result} onClose={() => setResult(null)} />}

      {confirming && (
        <ConfirmDialog
          title="Confirmer la génération saisonnière"
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
// Onglet Horaire
// ============================================================

function TabHoraire() {
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
    const res = await genererPaiements('horaire', { mois, annee })
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
        <h2 className="font-semibold text-gray-900">Paiements horaires</h2>
        <p className="text-sm text-gray-500">
          Agrège les heures saisies du mois pour chaque personne en mode <strong>Horaire</strong> et génère les paiements correspondants.
        </p>
        <div className="flex gap-4 items-end">
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
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {result && <ResultatGeneration result={result} onClose={() => setResult(null)} />}

      {confirming && (
        <ConfirmDialog
          title="Confirmer la génération horaire"
          message={`Générer les paiements horaires pour ${nomMois} ${annee} sur la base des heures saisies ?`}
          onConfirm={handleGenerer}
          onCancel={() => setConfirming(false)}
          loading={loading}
        />
      )}
    </div>
  )
}

// ============================================================
// Onglet Cantine
// ============================================================

function TabCantine() {
  const [periode, setPeriode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResultatGeneration | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Périodes mockées (validées dans la table cantines)
  const periodes = ['2026-04', '2026-03', '2026-02']

  async function handleGenerer() {
    setLoading(true)
    setError(null)
    const res = await genererPaiements('cantine', { periode_cantine: periode })
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
        <h2 className="font-semibold text-gray-900">Paiements cantine</h2>
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
            onClick={() => setConfirming(true)}
            disabled={!periode}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            Générer
          </button>
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {result && <ResultatGeneration result={result} onClose={() => setResult(null)} />}

      {confirming && (
        <ConfirmDialog
          title="Confirmer la génération cantine"
          message={`Générer les paiements de bénéfice cantine pour la période ${periode} ?`}
          onConfirm={handleGenerer}
          onCancel={() => setConfirming(false)}
          loading={loading}
        />
      )}
    </div>
  )
}
