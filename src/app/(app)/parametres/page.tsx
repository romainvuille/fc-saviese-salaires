'use client'

import { useState, useEffect } from 'react'
import { getParametres, updateParametres, getUsers, inviterUtilisateur, testerBexioApiKey } from '@/actions/parametres'
import { fmtPct } from '@/lib/utils'
import type { Parametre, Profile } from '@/types'

export default function ParametresPage() {
  const [parametres, setParametres] = useState<Parametre[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  // Valeurs locales
  const [tauxAVS, setTauxAVS] = useState('0.053')
  const [tauxAC, setTauxAC] = useState('0.011')
  const [tauxLAA, setTauxLAA] = useState('0.01061')
  const [tauxALFA, setTauxALFA] = useState('0.00131')
  const [anneeCivile, setAnneeCivile] = useState('2026')
  const [tourCourant, setTourCourant] = useState('T2 25-26')
  const [bexioKey, setBexioKey] = useState('')
  const [montantBonusJs, setMontantBonusJs] = useState('500')
  const [showBexioKey, setShowBexioKey] = useState(false)
  const [testingBexio, setTestingBexio] = useState(false)
  const [bexioTestResult, setBexioTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Invitation utilisateur
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager' | 'employee'>('employee')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pResult, uResult] = await Promise.all([getParametres(), getUsers()])
      const params = pResult.data ?? []
      setParametres(params)
      setUsers(uResult.data ?? [])

      const get = (cle: string) => params.find((p) => p.cle === cle)?.valeur ?? ''
      setTauxAVS(get('taux_avs'))
      setTauxAC(get('taux_ac'))
      setTauxLAA(get('taux_laa'))
      setTauxALFA(get('taux_alfa'))
      setAnneeCivile(get('annee_civile'))
      setTourCourant(get('tour_courant'))
      setBexioKey(get('bexio_api_key'))
      setMontantBonusJs(get('montant_bonus_js') || '500')
      setLoading(false)
    }
    load()
  }, [])

  

  async function handleTestBexio() {
    setTestingBexio(true)
    setBexioTestResult(null)
    const result = await testerBexioApiKey(bexioKey)
    if (result.success && result.data) {
      setBexioTestResult({
        ok: result.data.valide,
        msg: result.data.valide ? 'Connexion Bexio OK' : 'Clé invalide ou connexion refusée',
      })
    } else {
      setBexioTestResult({ ok: false, msg: result.error ?? 'Erreur' })
    }
    setTestingBexio(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const updates = [
      { cle: 'taux_avs', valeur: tauxAVS },
      { cle: 'taux_ac', valeur: tauxAC },
      { cle: 'taux_laa', valeur: tauxLAA },
      { cle: 'taux_alfa', valeur: tauxALFA },
      { cle: 'annee_civile', valeur: anneeCivile },
      { cle: 'tour_courant', valeur: tourCourant },
      { cle: 'bexio_api_key', valeur: bexioKey },
      { cle: 'montant_bonus_js', valeur: montantBonusJs },
    ]
    const result = await updateParametres(updates)
    setSaveMsg(result.success
      ? { ok: true, msg: 'Paramètres enregistrés.' }
      : { ok: false, msg: result.error ?? 'Erreur' }
    )
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 4000)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteMsg(null)
    const result = await inviterUtilisateur(inviteEmail, inviteRole)
    setInviteMsg(result.success
      ? { ok: true, msg: `Invitation envoyée à ${inviteEmail}.` }
      : { ok: false, msg: result.error ?? 'Erreur' }
    )
    if (result.success) {
      setInviteEmail('')
      setShowInvite(false)
    }
    setInviting(false)
    setTimeout(() => setInviteMsg(null), 5000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#D31616] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500 mt-1">Configuration globale de l'application.</p>
      </div>

      {saveMsg && (
        <div className={`p-3 rounded-lg text-sm ${saveMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {saveMsg.msg}
        </div>
      )}

      {/* Taux sociaux */}
      <SectionCard title="Taux sociaux">
        <p className="text-sm text-gray-500 mb-4">
          Taux prélevés sur les salaires soumis aux charges sociales.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TauxField
            label="AVS (assurance vieillesse et survivants)"
            value={tauxAVS}
            onChange={setTauxAVS}
          />
          <TauxField
            label="AC (assurance chômage)"
            value={tauxAC}
            onChange={setTauxAC}
          />
          <TauxField
            label="LAA (assurance accidents)"
            value={tauxLAA}
            onChange={setTauxLAA}
          />
          <TauxField
            label="ALFA (formation professionnelle)"
            value={tauxALFA}
            onChange={setTauxALFA}
          />
        </div>
        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
          <strong>Total charges :</strong>{' '}
          {fmtPct(
            (parseFloat(tauxAVS) || 0) +
            (parseFloat(tauxAC) || 0) +
            (parseFloat(tauxLAA) || 0) +
            (parseFloat(tauxALFA) || 0)
          )}
        </div>
      </SectionCard>

      {/* Paramètres généraux */}
      <SectionCard title="Paramètres généraux">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Année civile</label>
              <input
                type="number"
                value={anneeCivile}
                onChange={(e) => setAnneeCivile(e.target.value)}
                min={2020}
                max={2030}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tour courant</label>
              <input
                type="text"
                value={tourCourant}
                onChange={(e) => setTourCourant(e.target.value)}
                placeholder="ex: T2 25-26"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bonus diplôme J+S (CHF)</label>
              <input
                type="number"
                value={montantBonusJs}
                onChange={(e) => setMontantBonusJs(e.target.value)}
                min={0}
                step={50}
                placeholder="ex: 500"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
              />
              <p className="text-xs text-gray-400 mt-1">Montant additionnel par tour pour les coachs avec diplôme J+S coché.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Intégrations */}
      <SectionCard title="Intégrations">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Clé API Bexio
            </label>
            <div className="flex gap-2">
              <input
                type={showBexioKey ? 'text' : 'password'}
                value={bexioKey}
                onChange={(e) => setBexioKey(e.target.value)}
                placeholder="Bearer token Bexio"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
              />
              <button
                type="button"
                onClick={() => setShowBexioKey(!showBexioKey)}
                className="border border-gray-300 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                {showBexioKey ? 'Masquer' : 'Afficher'}
              </button>
              <button
                type="button"
                onClick={handleTestBexio}
                disabled={testingBexio || !bexioKey}
                className="border border-gray-300 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {testingBexio ? 'Test…' : 'Tester'}
              </button>
            </div>
            {bexioTestResult && (
              <p className={`text-xs mt-1 ${bexioTestResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                {bexioTestResult.msg}
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Bouton enregistrer */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
      </div>

      {/* Utilisateurs */}
      <SectionCard title="Gestion des utilisateurs">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">{users.length} compte{users.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              + Inviter un utilisateur
            </button>
          </div>

          {inviteMsg && (
            <div className={`p-3 rounded-lg text-sm ${inviteMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {inviteMsg.msg}
            </div>
          )}

          {showInvite && (
            <form onSubmit={handleInvite} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-800">Inviter un utilisateur</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="prenom.nom@exemple.ch"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rôle *</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'manager' | 'employee')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                  >
                    <option value="employee">Employé</option>
                    <option value="manager">Responsable</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-3 py-1.5 text-sm bg-[#D31616] text-white rounded-lg hover:bg-[#b91c1c] font-semibold disabled:opacity-60"
                >
                  {inviting ? 'Envoi…' : "Envoyer l'invitation"}
                </button>
              </div>
            </form>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nom</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">E-mail</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rôle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Personne liée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.prenom} {u.nom}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-red-100 text-red-800'
                          : u.role === 'manager'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Responsable' : 'Employé'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.personne_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ============================================================
// Composants UI
// ============================================================

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function TauxField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const num = parseFloat(value) || 0
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step="0.0001"
          min="0"
          max="1"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
        />
        <span className="text-sm font-medium text-gray-600 w-16 text-right">
          {fmtPct(num)}
        </span>
      </div>
    </div>
  )
}
