'use client'

import { useState } from 'react'
import { importerPersonnesDepuisSheets, type ResultatImportPersonnes } from '@/actions/import-sheets'

export function ImportPersonnesButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ResultatImportPersonnes | null>(null)

  async function handleImport() {
    if (!confirm('Importer / mettre à jour toutes les personnes depuis Google Sheets ?')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await importerPersonnesDepuisSheets()
      setResult(res)
    } catch (err) {
      setResult({ imported: 0, updated: 0, skipped: 0, errors: [String(err)] })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleImport}
        disabled={loading}
        className="flex items-center gap-2 border border-[#D31616] text-[#D31616] hover:bg-[#D31616]/5 font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Import en cours…
          </>
        ) : '📥 Importer depuis Google Sheets'}
      </button>

      {result && (
        <div className={`p-4 rounded-lg border text-sm space-y-1 ${
          result.errors.length > 0 && result.imported === 0 && result.updated === 0
            ? 'bg-red-50 border-red-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <div className="font-semibold text-gray-800">Résultat de l'import</div>
          <div>✅ Créées : <span className="font-medium">{result.imported}</span></div>
          <div>🔄 Mises à jour : <span className="font-medium">{result.updated}</span></div>
          {result.skipped > 0 && <div>⏭ Ignorées : <span className="font-medium">{result.skipped}</span></div>}
          {result.errors.length > 0 && (
            <div className="mt-2">
              <div className="font-medium text-red-700">⚠️ {result.errors.length} avertissement(s) :</div>
              <ul className="mt-1 space-y-0.5 text-red-600 text-xs">
                {result.errors.slice(0, 8).map((e, i) => <li key={i}>• {e}</li>)}
                {result.errors.length > 8 && <li>… et {result.errors.length - 8} autre(s)</li>}
              </ul>
            </div>
          )}
          <button
            onClick={() => { setResult(null); window.location.reload() }}
            className="mt-2 text-xs underline text-gray-500 hover:text-gray-700"
          >
            Fermer et rafraîchir
          </button>
        </div>
      )}
    </div>
  )
}
