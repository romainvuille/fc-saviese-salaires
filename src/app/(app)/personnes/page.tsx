import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { getPersonnes } from '@/actions/personnes'
import {
  fmtCHF,
  fmtNombre,
  colorStatutPersonne,
  labelModePaiement,
} from '@/lib/utils'
import type { Personne } from '@/types'
import { ImportPersonnesButton } from '@/components/personnes/ImportPersonnesButton'

interface SearchParams {
  statut?: string
  mode?: string
  categorie?: string
}

export default async function PersonnesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const profileRow = await prisma.profile.findUnique({ where: { id: session.user.id } })
  if (!profileRow) redirect('/login')
  const isAdmin = profileRow.role === 'admin'

  const result = await getPersonnes({
    statut: sp.statut,
    mode: sp.mode,
    categorie: sp.categorie,
  })

  const personnes: Personne[] = result.data ?? []

  function getMontantAffiche(p: Personne): string {
    if (p.mode === 'Horaire' && p.taux_horaire) return `${fmtNombre(p.taux_horaire)} CHF/h`
    if (p.mode === 'Mensuel fixe' && p.montant_mois) return `${fmtCHF(p.montant_mois)}/mois`
    if (p.mode === 'Saisonnier fixe' && p.montant_saison) return `${fmtCHF(p.montant_saison)}/tour`
    return '—'
  }

  const modes = ['Horaire', 'Mensuel fixe', 'Saisonnier fixe', 'Bénéfice cantine'] as const
  const statuts = ['Actif', 'Inactif'] as const

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personnes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{personnes.length} personne{personnes.length !== 1 ? 's' : ''}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <ImportPersonnesButton />
            <Link
              href="/personnes/nouveau"
              className="bg-[#D31616] hover:bg-[#b91c1c] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              + Ajouter
            </Link>
          </div>
        )}
      </div>

      {/* Filtres */}
      <form method="GET" className="flex flex-wrap gap-3">
        <select
          name="statut"
          defaultValue={sp.statut ?? ''}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        >
          <option value="">Tous les statuts</option>
          {statuts.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          name="mode"
          defaultValue={sp.mode ?? ''}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        >
          <option value="">Tous les modes</option>
          {modes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          name="categorie"
          defaultValue={sp.categorie ?? ''}
          placeholder="Rechercher par catégorie…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        />
        <button
          type="submit"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Filtrer
        </button>
        {(sp.statut || sp.mode || sp.categorie) && (
          <Link
            href="/personnes"
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 underline"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom complet</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Catégorie</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Taux / Montant</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Charges</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {personnes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    Aucune personne trouvée
                  </td>
                </tr>
              ) : (
                personnes.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 font-medium">
                      {p.code}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/personnes/${p.id}`}
                        className="font-semibold text-gray-900 hover:text-[#D31616] transition-colors"
                      >
                        {p.prenom} {p.nom}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.categorie}</td>
                    <td className="px-4 py-3 text-gray-600">{labelModePaiement(p.mode)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {getMontantAffiche(p)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.soumis_charges ? (
                        <span className="text-green-600 text-base" title="Soumis aux charges sociales">✓</span>
                      ) : (
                        <span className="text-gray-300 text-base" title="Non soumis aux charges">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatutPersonne(p.statut)}`}>
                        {p.statut}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
