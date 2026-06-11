'use client'

import { useState, useEffect, useCallback } from 'react'
import { getHeures, createHeure, deleteHeure } from '@/actions/heures'
import { getPersonnes } from '@/actions/personnes'
import { fmtDate, fmtNombre } from '@/lib/utils'
import { calculerHeuresDecimal } from '@/lib/metier/charges'
import type { Heure, Personne } from '@/types'

// Mock rôle courant et personne
const CURRENT_ROLE: 'admin' | 'manager' | 'employee' = 'admin'
const CURRENT_PERSONNE_ID: string | null = null // 'pers-002' pour un employee

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function HeuresPage() {
  const isAdmin = CURRENT_ROLE === 'admin'
  const isAdminOrManager = CURRENT_ROLE === 'admin' || CURRENT_ROLE === 'manager'
  const isEmployee = CURRENT_ROLE === 'employee'

  const now = new Date()
  const [heures, setHeures] = useState<Heure[]>([])
  const [personnes, setPersonnes] = useState<Personne[]>([])
  const [loading, setLoading] = useState(true)

  // Filtres admin/manager
  const [filtrePersonne, setFiltrePersonne] = useState('')
  const [filtreMois, setFiltreMois] = useState(String(now.getMonth() + 1))
  const [filtreAnnee, setFiltreAnnee] = useState(String(now.getFullYear()))

  // Formulaire saisie employee / admin
  const [showForm, setShowForm] = useState(false)
  const [formPersonneId, setFormPersonneId] = useState(CURRENT_PERSONNE_ID ?? '')
  const [formDate, setFormDate] = useState(now.toISOString().split('T')[0])
  const [formDebut, setFormDebut] = useState('09:00')
  const [formFin, setFormFin] = useState('17:00')
  const [formActivite, setFormActivite] = useState('')
  const [formRemarques, setFormRemarques] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const dureeCalculee =
    formDebut && formFin && formFin > formDebut
      ? calculerHeuresDecimal(formDebut, formFin)
      : null

  const load = useCallback(async () => {
    setLoading(true)
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
    setLoading(false)
  }, [filtrePersonne, filtreMois, filtreAnnee])

  useEffect(() => {
    load()
  }, [load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!formPersonneId) {
      setFormError('Veuillez sélectionner une personne.')
      return
    }
    setSaving(true)
    const result = await createHeure({
      personne_id: formPersonneId,
      date_travail: formDate,
      heure_debut: formDebut,
      heure_fin: formFin,
      activite: formActivite,
      remarques: formRemarques || undefined,
    })
    if (result.success && result.data) {
      setHeures((prev) => [result.data!, ...prev])
      setShowForm(false)
      setFormActivite('')
      setFormRemarques('')
    } else {
      setFormError(result.error ?? 'Erreur')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette saisie d'heures ?")) return
    const result = await deleteHeure(id)
    if (result.success) {
      setHeures((prev) => prev.filter((h) => h.id !== id))
    }
  }

  const totalHeuresMois = heures.reduce((s, h) => s + h.heures_decimal, 0)

  // Grouper par personne pour la vue admin
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
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Heures</h1>
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

      {/* Filtres admin/manager */}
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

      {/* Formulaire de saisie */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Nouvelle saisie d'heures</h3>
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

      {/* Vue admin — groupé par personne */}
      {isAdminOrManager && !loading && (
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
                    <h3 className="font-semibold text-gray-800">{nom}</h3>
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

      {/* Vue employee — ses propres heures */}
      {isEmployee && (
        <div className="space-y-4">
          {/* Récapitulatif mois */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-700">
              Total du mois sélectionné :{' '}
              <strong className="text-blue-900">{fmtNombre(totalHeuresMois)} heures</strong>
            </p>
          </div>

          {/* Filtres mois/année employee */}
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
            {loading ? (
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
  )
}
