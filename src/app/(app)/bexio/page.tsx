'use client'

import { useState, useEffect } from 'react'
import { getExports, genererExports, envoyerVersBexio } from '@/actions/bexio'
import { fmtCHF, fmtDate } from '@/lib/utils'
import type { BexioExport } from '@/types'

export default function BexioPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export Bexio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Génération et envoi des écritures comptables vers Bexio.
        </p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.msg}
        </div>
      )}

      {/* Métriques */}
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

      {/* Actions */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Actions</h2>

        <div className="space-y-3">
          {/* Étape 1 : Générer les écritures */}
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

          {/* Étape 2 : Envoyer vers Bexio */}
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

      {/* Table des écritures */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Écritures ({exports.length})</h2>
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

      {/* Modal confirmation envoi */}
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
