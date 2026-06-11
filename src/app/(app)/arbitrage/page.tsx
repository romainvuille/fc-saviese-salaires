'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getMatches, updateStatutMatch, deleteMatch,
  getAvances, creerAvance, updateStatutAvance,
  calculerAvancesSaison, reconcilierSaison,
  importerMatchesCSV, tarifParLigue,
} from '@/actions/arbitrage'
import { fmtCHF, fmtDate } from '@/lib/utils'
import type {
  ArbitrageMatch, ArbitrageAvance, AvanceCalculee,
  StatutMatch, StatutAvance, ActionResult,
} from '@/types'

// ============================================================
// Types locaux
// ============================================================

type TabPrincipal = 'avances' | 'matches' | 'reconciliation'

const STATUTS_MATCH: StatutMatch[] = ['À planifier', 'Confirmé', 'Joué', 'Annulé']
const STATUTS_AVANCE: StatutAvance[] = ['À verser', 'Versé', 'Soldé']

const SAISONS = ['25-26', '24-25', '23-24']
const now = new Date()

// ============================================================
// Page principale
// ============================================================

export default function ArbitragePage() {
  const [tab, setTab] = useState<TabPrincipal>('avances')

  const tabs: { id: TabPrincipal; label: string }[] = [
    { id: 'avances', label: 'Avances' },
    { id: 'matches', label: 'Matchs' },
    { id: 'reconciliation', label: 'Réconciliation' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Frais d'arbitrage</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestion des avances aux arbitres, import calendrier ClubCorner et réconciliation de fin de saison.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex gap-0 -mb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-[#D31616] text-[#D31616]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'avances' && <OngletAvances />}
      {tab === 'matches' && <OngletMatches />}
      {tab === 'reconciliation' && <OngletReconciliation />}
    </div>
  )
}

// ============================================================
// Onglet 1 — Avances
// ============================================================

function OngletAvances() {
  const [saison, setSaison] = useState('25-26')
  const [avances, setAvances] = useState<ArbitrageAvance[]>([])
  const [loading, setLoading] = useState(true)
  const [calcul, setCalcul] = useState<AvanceCalculee[]>([])
  const [loadingCalc, setLoadingCalc] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; msg: string } | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)

  // Formulaire création avance manuelle
  const [fEquipe, setFEquipe] = useState('')
  const [fLigue, setFLigue] = useState('')
  const [fNbMatches, setFNbMatches] = useState('')
  const [fMontant, setFMontant] = useState('')
  const [fDate, setFDate] = useState('')
  const [fNotes, setFNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const totalAvances = avances.reduce((s, a) => s + a.montant_total, 0)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getAvances(saison)
    setAvances(res.data ?? [])
    setLoading(false)
  }, [saison])

  useEffect(() => { load() }, [load])

  // Auto-calcul tarif quand ligue change
  useEffect(() => {
    async function autoFill() {
      if (fLigue) {
        const tarif = await tarifParLigue(fLigue)
        setFMontant(String(tarif))
      }
    }
    autoFill()
  }, [fLigue])

  async function handleCalculerAvances() {
    setLoadingCalc(true)
    const res = await calculerAvancesSaison(saison)
    setCalcul(res.data ?? [])
    setLoadingCalc(false)
  }

  async function handleCreerAvance(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await creerAvance({
      saison,
      equipe: fEquipe,
      ligue: fLigue,
      nb_matches: parseInt(fNbMatches),
      montant_par_match: parseFloat(fMontant),
      notes: fNotes || undefined,
      date_versement: fDate || undefined,
    })
    if (res.success && res.data) {
      setAvances((prev) => [res.data!, ...prev])
      setShowForm(false)
      setFEquipe(''); setFLigue(''); setFNbMatches(''); setFMontant(''); setFDate(''); setFNotes('')
      setMessage({ ok: true, msg: `Avance ${res.data.code} créée.` })
      setTimeout(() => setMessage(null), 5000)
    } else {
      setMessage({ ok: false, msg: res.error ?? 'Erreur' })
    }
    setSaving(false)
  }

  async function handleStatutChange(id: string, statut: StatutAvance, dateVersement?: string) {
    setChangingId(id)
    const res = await updateStatutAvance(id, statut, statut === 'Versé' ? (dateVersement ?? new Date().toISOString().split('T')[0]) : undefined)
    if (res.success && res.data) {
      setAvances((prev) => prev.map((a) => (a.id === id ? res.data! : a)))
    }
    setChangingId(null)
  }

  const colorStatut = (s: StatutAvance) => {
    if (s === 'Versé') return 'bg-green-100 text-green-800'
    if (s === 'Soldé') return 'bg-blue-100 text-blue-800'
    return 'bg-yellow-100 text-yellow-800'
  }

  const montantPreview = fNbMatches && fMontant
    ? parseInt(fNbMatches) * parseFloat(fMontant)
    : null

  return (
    <div className="space-y-5">
      {/* Entête + sélecteur saison */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Saison</label>
          <select
            value={saison}
            onChange={(e) => setSaison(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
          >
            {SAISONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <button
          onClick={handleCalculerAvances}
          disabled={loadingCalc}
          className="border border-[#D31616] text-[#D31616] hover:bg-[#D31616]/5 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 mt-5"
        >
          {loadingCalc ? 'Calcul…' : '🧮 Calculer depuis les matchs'}
        </button>

        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors mt-5"
        >
          {showForm ? 'Annuler' : '+ Nouvelle avance'}
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm border ${message.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {message.ok ? '✅ ' : '❌ '}{message.msg}
        </div>
      )}

      {/* Résultat calcul depuis matchs */}
      {calcul.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-blue-900">Avances estimées — saison {saison}</h3>
            <button onClick={() => setCalcul([])} className="text-xs text-blue-600 hover:underline">Fermer</button>
          </div>
          <p className="text-sm text-blue-700">
            Basé sur les matchs à domicile importés (hors annulés).
            Cliquez sur <strong>Créer</strong> pour sauvegarder une avance.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-blue-200">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-blue-700 uppercase">Équipe</th>
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-blue-700 uppercase">Ligue</th>
                  <th className="text-right py-2 pr-4 text-xs font-semibold text-blue-700 uppercase">Matchs</th>
                  <th className="text-right py-2 pr-4 text-xs font-semibold text-blue-700 uppercase">CHF/match</th>
                  <th className="text-right py-2 pr-4 text-xs font-semibold text-blue-700 uppercase">Total</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {calcul.map((c, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4 font-medium text-gray-900">{c.equipe}</td>
                    <td className="py-2 pr-4 text-gray-600">{c.ligue}</td>
                    <td className="py-2 pr-4 text-right text-gray-900">{c.nb_matches}</td>
                    <td className="py-2 pr-4 text-right text-gray-600">{fmtCHF(c.montant_par_match)}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-blue-900">{fmtCHF(c.montant_total)}</td>
                    <td className="py-2">
                      <button
                        onClick={() => {
                          setFEquipe(c.equipe)
                          setFLigue(c.ligue)
                          setFNbMatches(String(c.nb_matches))
                          setFMontant(String(c.montant_par_match))
                          setShowForm(true)
                          setCalcul([])
                        }}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg"
                      >
                        Créer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-blue-300">
                  <td colSpan={4} className="py-2 pr-4 font-bold text-blue-900">Total</td>
                  <td className="py-2 pr-4 text-right font-bold text-blue-900">
                    {fmtCHF(calcul.reduce((s, c) => s + c.montant_total, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Formulaire nouvelle avance */}
      {showForm && (
        <form onSubmit={handleCreerAvance} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Nouvelle avance d'arbitrage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Équipe *</label>
              <input value={fEquipe} onChange={(e) => setFEquipe(e.target.value)}
                placeholder="ex: FC Savièse 2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ligue *</label>
              <input value={fLigue} onChange={(e) => setFLigue(e.target.value)}
                placeholder="ex: 4., 2. Int., Jun.C 1/S"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nb matchs à domicile *</label>
              <input type="number" value={fNbMatches} onChange={(e) => setFNbMatches(e.target.value)}
                min="1" max="30"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">CHF/match (barème auto) *</label>
              <input type="number" value={fMontant} onChange={(e) => setFMontant(e.target.value)}
                step="5" min="5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date versement prévu</label>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input value={fNotes} onChange={(e) => setFNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20" />
            </div>
          </div>
          {montantPreview !== null && (
            <div className="bg-[#D31616]/10 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-gray-700">Total avance calculée</span>
              <span className="text-lg font-bold text-[#D31616]">{fmtCHF(montantPreview)}</span>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm disabled:opacity-60">
              {saving ? 'Enregistrement…' : 'Créer l\'avance'}
            </button>
          </div>
        </form>
      )}

      {/* Liste des avances */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Avances saison {saison}</h3>
          {avances.length > 0 && (
            <span className="text-sm font-bold text-gray-700">Total : {fmtCHF(totalAvances)}</span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
          </div>
        ) : avances.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            Aucune avance pour la saison {saison}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Équipe</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ligue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Matchs</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">CHF/match</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {avances.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{a.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{a.equipe}</td>
                    <td className="px-4 py-3 text-gray-600">{a.ligue}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{a.nb_matches}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtCHF(a.montant_par_match)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCHF(a.montant_total)}</td>
                    <td className="px-4 py-3">
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatut(a.statut)}`}>
                          {a.statut}
                        </span>
                        {a.date_versement && (
                          <p className="text-xs text-gray-400 mt-0.5">{fmtDate(a.date_versement)}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.statut === 'À verser' && (
                        <button
                          onClick={() => handleStatutChange(a.id, 'Versé')}
                          disabled={changingId === a.id}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                        >
                          {changingId === a.id ? '…' : 'Marquer versé'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Onglet 2 — Matchs
// ============================================================

function OngletMatches() {
  const [saison, setSaison] = useState('25-26')
  const [matches, setMatches] = useState<ArbitrageMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreEquipe, setFiltreEquipe] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; msg: string } | null>(null)
  const [changingId, setChangingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getMatches({
      saison,
      statut: filtreStatut || undefined,
      equipe: filtreEquipe || undefined,
    })
    setMatches(res.data ?? [])
    setLoading(false)
  }, [saison, filtreStatut, filtreEquipe])

  useEffect(() => { load() }, [load])

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg(null)

    const content = await file.text()
    const res = await importerMatchesCSV(content, saison)
    if (res.success && res.data) {
      const { importes, ignores, erreurs } = res.data
      const msg = `✅ ${importes} importé(s), ${ignores} ignoré(s) (domicile uniquement / doublons).${erreurs.length > 0 ? ` ⚠️ ${erreurs.length} avertissement(s).` : ''}`
      setImportMsg({ ok: erreurs.length === 0, msg })
      await load()
    } else {
      setImportMsg({ ok: false, msg: res.error ?? 'Erreur import' })
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleStatut(id: string, statut: StatutMatch) {
    setChangingId(id)
    await updateStatutMatch(id, statut)
    setMatches((prev) => prev.map((m) => m.id === id ? { ...m, statut } : m))
    setChangingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce match ?')) return
    await deleteMatch(id)
    setMatches((prev) => prev.filter((m) => m.id !== id))
  }

  const totalBudget = matches
    .filter((m) => m.statut !== 'Annulé')
    .reduce((s, m) => s + m.montant_chf, 0)

  const colorStatut = (s: StatutMatch) => {
    if (s === 'Joué') return 'bg-green-100 text-green-800'
    if (s === 'Confirmé') return 'bg-blue-100 text-blue-800'
    if (s === 'Annulé') return 'bg-red-100 text-red-800'
    return 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Saison</label>
          <select value={saison} onChange={(e) => setSaison(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20">
            {SAISONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="mt-5">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={handleFileImport}
            className="hidden"
            id="csv-import"
          />
          <label
            htmlFor="csv-import"
            className={`cursor-pointer inline-flex items-center gap-2 border border-[#D31616] text-[#D31616] hover:bg-[#D31616]/5 font-medium px-4 py-2 rounded-lg text-sm transition-colors ${importing ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {importing ? (
              <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Import…</>
            ) : '📂 Importer CSV ClubCorner'}
          </label>
        </div>
      </div>

      {importMsg && (
        <div className={`p-3 rounded-lg text-sm border ${importMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
          {importMsg.msg}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none">
          <option value="">Tous les statuts</option>
          {STATUTS_MATCH.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={filtreEquipe} onChange={(e) => setFiltreEquipe(e.target.value)}
          placeholder="Filtrer équipe…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none" />
        {(filtreStatut || filtreEquipe) && (
          <button onClick={() => { setFiltreStatut(''); setFiltreEquipe('') }}
            className="text-sm text-gray-500 hover:text-gray-700 underline px-2">
            Réinitialiser
          </button>
        )}
      </div>

      {matches.length > 0 && (
        <div className="text-sm text-gray-600 font-medium">
          {matches.filter(m => m.statut !== 'Annulé').length} match(s) actif(s) — Budget total :
          <span className="text-[#D31616] font-bold ml-1">{fmtCHF(totalBudget)}</span>
        </div>
      )}

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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Équipe</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ligue</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Adversaire</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">CHF</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {matches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      Aucun match — importez un CSV ClubCorner pour commencer
                    </td>
                  </tr>
                ) : (
                  matches.map((m) => (
                    <tr key={m.id} className={`hover:bg-gray-50 transition-colors ${m.statut === 'Annulé' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(m.date_match)}{m.heure_match && <span className="text-gray-400 ml-1">{m.heure_match}</span>}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{m.equipe}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.ligue}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{m.adversaire}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCHF(m.montant_chf)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatut(m.statut)}`}>
                          {m.statut}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={m.statut}
                            onChange={(e) => handleStatut(m.id, e.target.value as StatutMatch)}
                            disabled={changingId === m.id}
                            className="border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none disabled:opacity-50"
                          >
                            {STATUTS_MATCH.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="text-xs text-red-400 hover:text-red-600 hover:underline"
                          >
                            ×
                          </button>
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
    </div>
  )
}

// ============================================================
// Onglet 3 — Réconciliation
// ============================================================

function OngletReconciliation() {
  const [saison, setSaison] = useState('25-26')
  const [loading, setLoading] = useState(false)
  const [resultats, setResultats] = useState<Awaited<ReturnType<typeof reconcilierSaison>>['data']>([])
  const [error, setError] = useState<string | null>(null)

  async function handleReconcilier() {
    setLoading(true)
    setError(null)
    const res = await reconcilierSaison(saison)
    if (res.success) {
      setResultats(res.data ?? [])
    } else {
      setError(res.error ?? 'Erreur')
    }
    setLoading(false)
  }

  const colorSolde = (statut: string) => {
    if (statut === 'OK') return 'bg-green-100 text-green-800'
    if (statut === 'Surplus') return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900">Réconciliation fin de saison</h2>
          <p className="text-sm text-gray-500 mt-1">
            Compare les avances versées en début de saison avec les montants réels (matchs marqués <strong>Joué</strong>).
            Un solde positif = trop versé, négatif = encore dû.
          </p>
        </div>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Saison</label>
            <select value={saison} onChange={(e) => setSaison(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20">
              {SAISONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={handleReconcilier}
            disabled={loading}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Calcul…' : 'Réconcilier'}
          </button>
        </div>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}
      </div>

      {resultats && resultats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Équipe</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ligue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Avance</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Matchs joués</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Montant réel</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Solde</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {resultats.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.avance_code}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.equipe}</td>
                    <td className="px-4 py-3 text-gray-600">{r.ligue}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtCHF(r.avance_montant)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.matchs_joues}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtCHF(r.montant_reel)}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      <span className={r.solde > 0 ? 'text-yellow-700' : r.solde < 0 ? 'text-red-700' : 'text-green-700'}>
                        {r.solde > 0 ? '+' : ''}{fmtCHF(r.solde)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorSolde(r.statut)}`}>
                        {r.statut}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {fmtCHF(resultats.reduce((s, r) => s + r.avance_montant, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-700">
                    {resultats.reduce((s, r) => s + r.matchs_joues, 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {fmtCHF(resultats.reduce((s, r) => s + r.montant_reel, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">
                    {(() => {
                      const total = resultats.reduce((s, r) => s + r.solde, 0)
                      return (
                        <span className={total > 0 ? 'text-yellow-700' : total < 0 ? 'text-red-700' : 'text-green-700'}>
                          {total > 0 ? '+' : ''}{fmtCHF(total)}
                        </span>
                      )
                    })()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {resultats && resultats.length === 0 && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Lancez la réconciliation pour voir les résultats
        </div>
      )}
    </div>
  )
}
