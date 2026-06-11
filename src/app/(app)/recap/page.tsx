'use client'

import { useState, useEffect } from 'react'
import { getPaiements } from '@/actions/paiements'
import { getPersonnes } from '@/actions/personnes'
import { fmtCHF, colorStatutPaiement, labelStatutPaiement } from '@/lib/utils'
import type { Paiement, Personne } from '@/types'

export default function RecapPage() {
  const currentYear = new Date().getFullYear()
  const [annee, setAnnee] = useState(currentYear)
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [personnes, setPersonnes] = useState<Personne[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pResult, personnesResult] = await Promise.all([
        getPaiements({ annee }),
        getPersonnes(),
      ])
      setPaiements(pResult.data ?? [])
      setPersonnes(personnesResult.data ?? [])
      setLoading(false)
    }
    load()
  }, [annee])

  // Section A : par personne
  const parPersonne: Record<string, {
    personne: Personne
    paiements: Paiement[]
    totalBrut: number
    totalRetenues: number
    totalNet: number
    nbPaiements: number
  }> = {}

  for (const p of paiements) {
    if (!parPersonne[p.personne_id]) {
      const pers = personnes.find((pp) => pp.id === p.personne_id)
      if (!pers) continue
      parPersonne[p.personne_id] = {
        personne: pers,
        paiements: [],
        totalBrut: 0,
        totalRetenues: 0,
        totalNet: 0,
        nbPaiements: 0,
      }
    }
    parPersonne[p.personne_id].paiements.push(p)
    parPersonne[p.personne_id].totalBrut += p.brut
    parPersonne[p.personne_id].totalRetenues += p.total_retenues
    parPersonne[p.personne_id].totalNet += p.net
    parPersonne[p.personne_id].nbPaiements++
  }

  // Section B : par type
  const parType: Record<string, { brut: number; net: number; nb: number }> = {}
  for (const p of paiements) {
    if (!parType[p.type_paiement]) {
      parType[p.type_paiement] = { brut: 0, net: 0, nb: 0 }
    }
    parType[p.type_paiement].brut += p.brut
    parType[p.type_paiement].net += p.net
    parType[p.type_paiement].nb++
  }

  // Section C : à valider
  const aValider = paiements.filter((p) => p.statut === 'À valider')

  // Totaux globaux
  const totalGlobalBrut = paiements.reduce((s, p) => s + p.brut, 0)
  const totalGlobalRetenues = paiements.reduce((s, p) => s + p.total_retenues, 0)
  const totalGlobalNet = paiements.reduce((s, p) => s + p.net, 0)

  function exportPDF() {
    window.print()
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Récapitulatif annuel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vue consolidée de tous les paiements de l'année.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none"
          >
            {[2024, 2025, 2026, 2027].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            onClick={exportPDF}
            className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer / PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-[#D31616] border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Totaux globaux */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total brut {annee}</p>
              <p className="text-xl font-bold text-gray-900">{fmtCHF(totalGlobalBrut)}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total retenues</p>
              <p className="text-xl font-bold text-gray-900">{fmtCHF(totalGlobalRetenues)}</p>
            </div>
            <div className="bg-[#D31616]/5 border border-[#D31616]/20 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total net {annee}</p>
              <p className="text-xl font-bold text-[#D31616]">{fmtCHF(totalGlobalNet)}</p>
            </div>
          </div>

          {/* Section A : par personne */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-900">A. Par personne</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Personne</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Catégorie</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mode</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Paiements</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Brut total</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Retenues</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Net total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Object.values(parPersonne).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400">
                        Aucun paiement pour {annee}
                      </td>
                    </tr>
                  ) : (
                    Object.values(parPersonne)
                      .sort((a, b) => b.totalNet - a.totalNet)
                      .map(({ personne: p, totalBrut, totalRetenues, totalNet, nbPaiements }) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            <a href={`/personnes/${p.id}`} className="hover:text-[#D31616] transition-colors">
                              {p.prenom} {p.nom}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{p.categorie}</td>
                          <td className="px-4 py-3 text-gray-600">{p.mode}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{nbPaiements}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCHF(totalBrut)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {totalRetenues > 0 ? `-${fmtCHF(totalRetenues)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalNet)}</td>
                        </tr>
                      ))
                  )}
                </tbody>
                {Object.values(parPersonne).length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalGlobalBrut)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-500">-{fmtCHF(totalGlobalRetenues)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#D31616]">{fmtCHF(totalGlobalNet)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Section B : par type */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-900">B. Par type de paiement</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total brut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(parType).map(([type, { brut, net, nb }]) => (
                  <tr key={type}>
                    <td className="px-4 py-3 font-medium text-gray-900">{type}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{nb}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCHF(brut)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section C : à valider */}
          {aValider.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-yellow-200">
                <h2 className="font-semibold text-yellow-800">
                  C. Paiements en attente de validation ({aValider.length})
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-yellow-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">Code</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">Personne</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">Période</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">Brut</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">Net</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-50">
                  {aValider.map((p) => (
                    <tr key={p.id} className="hover:bg-yellow-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.pay_code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.nom_complet}</td>
                      <td className="px-4 py-3 text-gray-600">{p.periode}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCHF(p.brut)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(p.net)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatutPaiement(p.statut)}`}>
                          {labelStatutPaiement(p.statut)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
