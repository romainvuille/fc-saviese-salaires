'use client'

import { useState, useEffect, useCallback } from 'react'
import { getCantines, createCantine, validerCantine } from '@/actions/cantines'
import { getPersonnes } from '@/actions/personnes'
import { fmtCHF, fmtDate } from '@/lib/utils'
import type { Cantine, Personne } from '@/types'

// Mock rôle
const CURRENT_ROLE: 'admin' | 'manager' | 'employee' = 'admin'

const CANTINES_NOMS = ['Principale', 'Juniors Synthétique'] as const

export default function CantinesPage() {
  const isAdmin = CURRENT_ROLE === 'admin'
  const isAdminOrManager = CURRENT_ROLE === 'admin' || CURRENT_ROLE === 'manager'

  const [cantines, setCantines] = useState<Cantine[]>([])
  const [personnes, setPersonnes] = useState<Personne[]>([])
  const [loading, setLoading] = useState(true)
  const [filtrePeriode, setFiltrePeriode] = useState('')
  const [filtreCantine, setFiltreCantine] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [validating, setValidating] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  // Form state
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

  const load = useCallback(async () => {
    setLoading(true)
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
    setLoading(false)
  }, [filtrePeriode, filtreCantine, filtreStatut])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    if (!formPersonneId) {
      setFormError('Veuillez sélectionner un cantinier.')
      return
    }

    const result = await createCantine({
      periode: formPeriode,
      cantine: formCantine,
      recette_brute: recette,
      charges,
      personne_id: formPersonneId,
      date_paiement: formDatePaiement || undefined,
      notes: formNotes || undefined,
    })

    if (result.success && result.data) {
      setCantines((prev) => [result.data!, ...prev])
      setFormSuccess('Cantine enregistrée avec succès.')
      setShowForm(false)
      setTimeout(() => setFormSuccess(null), 4000)
    } else {
      setFormError(result.error ?? 'Erreur')
    }
  }

  async function handleValider(id: string) {
    setValidating(id)
    const result = await validerCantine(id)
    if (result.success && result.data) {
      setCantines((prev) => prev.map((c) => (c.id === id ? result.data! : c)))
    }
    setValidating(null)
  }

  const cantiniersEligibles = personnes.filter(
    (p) => p.mode === 'Bénéfice cantine' || p.mode === 'Horaire'
  )

  const totalRecette = cantines.reduce((s, c) => s + c.recette_brute, 0)
  const totalBenefice = cantines.reduce((s, c) => s + c.benefice_net, 0)

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cantines</h1>
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

      {/* Formulaire ajout */}
      {showForm && isAdmin && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <h3 className="font-semibold text-gray-900">Nouvelle entrée cantine</h3>
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
                {personnes.map((p) => (
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

          {/* Calculs automatiques */}
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

      {/* Filtres */}
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

      {/* Table */}
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
  )
}
