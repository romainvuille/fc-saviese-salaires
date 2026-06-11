import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { getPaiements } from '@/actions/paiements'
import { getPersonnes } from '@/actions/personnes'
import { fmtCHF, fmtDate, colorStatutPaiement, labelStatutPaiement } from '@/lib/utils'
import type { Profile } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const profileRow = await prisma.profile.findUnique({ where: { id: session.user.id } })
  if (!profileRow) redirect('/login')

  const profile: Profile = {
    id: profileRow.id,
    email: profileRow.email,
    nom: profileRow.nom,
    prenom: profileRow.prenom,
    role: profileRow.role as Profile['role'],
    personne_id: profileRow.personne_id,
    created_at: profileRow.created_at.toISOString(),
  }

  const isAdmin = profile.role === 'admin'
  const isAdminOrManager = isAdmin || profile.role === 'manager'
  const isEmployee = profile.role === 'employee'

  // Données
  const [paiementsResult, personnesResult] = await Promise.all([
    getPaiements(),
    getPersonnes(),
  ])

  const paiements = paiementsResult.data ?? []
  const personnes = personnesResult.data ?? []

  const personnesActives = personnes.filter((p) => p.statut === 'Actif').length
  const aValider = paiements.filter((p) => p.statut === 'À valider')
  const moisCourant = new Date().toISOString().slice(0, 7)
  const paiementsMois = paiements.filter((p) => p.date_paiement.startsWith(moisCourant))
  const totalBrutMois = paiementsMois.reduce((s, p) => s + p.brut, 0)
  const cumulYTD = personnes.reduce((s, p) => s + p.cumul_ytd, 0)

  const derniersPaiements = [...paiements]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)

  // Pour employee : ses paiements + cumul
  const mesPaiements = isEmployee && profile.personne_id
    ? paiements.filter((p) => p.personne_id === profile.personne_id).slice(0, 5)
    : []
  const monCumulYTD = isEmployee && profile.personne_id
    ? personnes.find((p) => p.id === profile.personne_id)?.cumul_ytd ?? 0
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bonjour {profile.prenom} — {new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Métriques */}
      {isAdminOrManager && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Personnes actives"
            value={String(personnesActives)}
            color="blue"
          />
          <MetricCard
            label="À valider"
            value={String(aValider.length)}
            color={aValider.length > 0 ? 'red' : 'green'}
            badge={aValider.length > 0}
          />
          <MetricCard
            label="Total brut (mois courant)"
            value={fmtCHF(totalBrutMois)}
            color="purple"
          />
          <MetricCard
            label="Cumul YTD total"
            value={fmtCHF(cumulYTD)}
            color="gray"
          />
        </div>
      )}

      {/* Employee : son résumé */}
      {isEmployee && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="Mon cumul annuel (YTD)"
            value={fmtCHF(monCumulYTD)}
            color="blue"
          />
          <MetricCard
            label="Mes paiements en attente"
            value={String(mesPaiements.filter((p) => p.statut === 'À valider').length)}
            color="orange"
          />
        </div>
      )}

      {/* Section À valider — admin/manager */}
      {isAdminOrManager && aValider.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <h2 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 bg-yellow-500 text-white text-xs rounded-full font-bold">
              {aValider.length}
            </span>
            Paiements en attente de validation
          </h2>
          <div className="space-y-2">
            {aValider.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-white border border-yellow-100 rounded-lg px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-400">{p.pay_code}</span>
                  <span className="font-medium text-gray-900">{p.nom_complet}</span>
                  <span className="text-gray-500">{p.periode}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{fmtCHF(p.net)}</span>
                  <a
                    href={`/paiements`}
                    className="text-xs bg-[#D31616] text-white px-3 py-1 rounded-lg hover:bg-[#b91c1c] transition-colors"
                  >
                    Valider
                  </a>
                </div>
              </div>
            ))}
            {aValider.length > 5 && (
              <a href="/paiements" className="text-sm text-[#D31616] hover:underline block text-center mt-2">
                Voir les {aValider.length - 5} autres…
              </a>
            )}
          </div>
        </div>
      )}

      {/* Derniers paiements — admin/manager */}
      {isAdminOrManager && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">10 derniers paiements</h2>
            <a href="/paiements" className="text-sm text-[#D31616] hover:underline">
              Voir tous →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Personne</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Période</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Brut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Net</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {derniersPaiements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      Aucun paiement trouvé
                    </td>
                  </tr>
                ) : (
                  derniersPaiements.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.pay_code}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.nom_complet}</td>
                      <td className="px-4 py-3 text-gray-600">{p.periode}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCHF(p.brut)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCHF(p.net)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorStatutPaiement(p.statut)}`}>
                          {labelStatutPaiement(p.statut)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employee : ses fiches */}
      {isEmployee && mesPaiements.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Mes dernières fiches de salaire</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Période</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Brut</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Net</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mesPaiements.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.pay_code}</td>
                    <td className="px-4 py-3 text-gray-700">{p.periode}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCHF(p.brut)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCHF(p.net)}</td>
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
        </div>
      )}
    </div>
  )
}

// ============================================================
// Composant MetricCard
// ============================================================

function MetricCard({
  label,
  value,
  color,
  badge = false,
}: {
  label: string
  value: string
  color: 'blue' | 'red' | 'green' | 'purple' | 'gray' | 'orange'
  badge?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    red: 'bg-red-50 border-red-100',
    green: 'bg-green-50 border-green-100',
    purple: 'bg-purple-50 border-purple-100',
    gray: 'bg-gray-50 border-gray-200',
    orange: 'bg-orange-50 border-orange-100',
  }
  const textMap: Record<string, string> = {
    blue: 'text-blue-700',
    red: 'text-[#D31616]',
    green: 'text-green-700',
    purple: 'text-purple-700',
    gray: 'text-gray-700',
    orange: 'text-orange-700',
  }

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textMap[color]} flex items-center gap-2`}>
        {value}
        {badge && (
          <span className="inline-flex items-center justify-center w-5 h-5 bg-[#D31616] text-white text-xs rounded-full font-bold">
            !
          </span>
        )}
      </p>
    </div>
  )
}
