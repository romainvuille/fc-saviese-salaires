'use client'

import { useState, useEffect, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getPersonne, updatePersonne } from '@/actions/personnes'
import { getPaiements } from '@/actions/paiements'
import { getHeures, createHeure, deleteHeure } from '@/actions/heures'
import {
  fmtCHF, fmtDate, fmtNombre, colorStatutPaiement,
  labelStatutPaiement, colorStatutPersonne, toNumber,
} from '@/lib/utils'
import { calculerHeuresDecimal } from '@/lib/metier/charges'
import type { Personne, Paiement, Heure, PersonneFormData } from '@/types'

type TabId = 'infos' | 'paiements' | 'heures'

// Mock du profil courant — en production, passer via Context ou cookie
const CURRENT_ROLE: 'admin' | 'manager' | 'employee' = 'admin'
const CURRENT_PERSONNE_ID: string | null = null

export default function PersonnePage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] ?? ''

  const [tab, setTab] = useState<TabId>('infos')
  const [personne, setPersonne] = useState<Personne | null>(null)
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [heures, setHeures] = useState<Heure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = CURRENT_ROLE === 'admin'
  const isOwnProfile = CURRENT_PERSONNE_ID === id

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [pResult, payResult, hResult] = await Promise.all([
        getPersonne(id),
        getPaiements({ personne_id: id }),
        getHeures({ personne_id: id }),
      ])
      if (!pResult.success || !pResult.data) {
        setError('Personne introuvable.')
      } else {
        setPersonne(pResult.data)
        setPaiements(payResult.data ?? [])
        setHeures(hResult.data ?? [])
      }
      setLoading(false)
    }
    loadData()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-[#D31616] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !personne) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 font-medium">{error ?? 'Erreur inconnue'}</p>
        <a href="/personnes" className="text-sm text-gray-500 hover:underline mt-2 block">
          ← Retour aux personnes
        </a>
      </div>
    )
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'infos', label: 'Informations' },
    { id: 'paiements', label: `Paiements (${paiements.length})` },
    ...(personne.mode === 'Horaire' ? [{ id: 'heures' as TabId, label: `Heures (${heures.length})` }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-4">
        <a href="/personnes" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← Retour
        </a>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {personne.prenom} {personne.nom}
          </h1>
          <p className="text-sm text-gray-500">{personne.code} · {personne.categorie}</p>
        </div>
        <span className={`ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorStatutPersonne(personne.statut)}`}>
          {personne.statut}
        </span>
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

      {/* Contenu onglet */}
      {tab === 'infos' && (
        <InfosTab
          personne={personne}
          isAdmin={isAdmin}
          onUpdate={(updated) => setPersonne(updated)}
        />
      )}
      {tab === 'paiements' && (
        <PaiementsTab paiements={paiements} />
      )}
      {tab === 'heures' && (
        <HeuresTab
          heures={heures}
          personneId={id}
          isAdmin={isAdmin}
          isOwnProfile={isOwnProfile}
          onUpdate={(h) => setHeures(h)}
        />
      )}
    </div>
  )
}

// ============================================================
// Constantes locales
// ============================================================

const CATEGORIES_PERSONNE = [
  'Entraîneur principal',
  'Entraîneur assistant',
  'Entraîneur gardien',
  'Intendant',
  'Soigneur',
  'Cantinier',
  'Entretien',
  'Entraîneur attaquants',
]

const SOUS_CATEGORIES = [
  'Savièse 1 (2e Int.)',
  'Savièse 2 (3e LF)',
  'Savièse 3 (4e)',
  'Savièse 4 (5e)',
  'Seniors',
  'Juniors 11 (J-B)',
  'Juniors 9 (J-C)',
  'Juniors 7 (J-D)',
  'Juniors F/G',
  'Entretien',
  'Cantine',
]

const MOIS_LABELS = [
  { value: 1, short: 'Jan', label: 'Janvier' },
  { value: 2, short: 'Fév', label: 'Février' },
  { value: 3, short: 'Mar', label: 'Mars' },
  { value: 4, short: 'Avr', label: 'Avril' },
  { value: 5, short: 'Mai', label: 'Mai' },
  { value: 6, short: 'Jun', label: 'Juin' },
  { value: 7, short: 'Jul', label: 'Juillet' },
  { value: 8, short: 'Aoû', label: 'Août' },
  { value: 9, short: 'Sep', label: 'Septembre' },
  { value: 10, short: 'Oct', label: 'Octobre' },
  { value: 11, short: 'Nov', label: 'Novembre' },
  { value: 12, short: 'Déc', label: 'Décembre' },
]

// ============================================================
// Onglet Informations
// ============================================================

function InfosTab({
  personne,
  isAdmin,
  onUpdate,
}: {
  personne: Personne
  isAdmin: boolean
  onUpdate: (p: Personne) => void
}) {
  const isSousCatLibre = !SOUS_CATEGORIES.includes(personne.sous_categorie ?? '') && !!personne.sous_categorie

  const [form, setForm] = useState<PersonneFormData>({
    nom: personne.nom,
    prenom: personne.prenom,
    categorie: personne.categorie,
    sous_categorie: personne.sous_categorie ?? '',
    mode: personne.mode,
    taux_horaire: personne.taux_horaire,
    montant_mois: personne.montant_mois,
    montant_saison: personne.montant_saison,
    mois_payes: personne.mois_payes,
    iban: personne.iban,
    numero_avs: personne.numero_avs,
    email: personne.email,
    statut: personne.statut,
    soumis_charges: personne.soumis_charges,
    diplome_js: personne.diplome_js,
    bonus_js: personne.bonus_js ?? false,
  })
  // Sous-catégorie libre : si la valeur actuelle n'est pas dans la liste prédéfinie
  const [sousCatLibre, setSousCatLibre] = useState(isSousCatLibre)
  const [sousCatCustom, setSousCatCustom] = useState(isSousCatLibre ? (personne.sous_categorie ?? '') : '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  // Mois payés parsés
  const moisPayesArr = (form.mois_payes ?? '').split(',').map(Number).filter(Boolean)

  function toggleMois(m: number) {
    const arr = moisPayesArr.includes(m) ? moisPayesArr.filter(x => x !== m) : [...moisPayesArr, m].sort((a, b) => a - b)
    setForm(prev => ({ ...prev, mois_payes: arr.join(',') }))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : type === 'number'
          ? (value === '' ? null : Number(value))
          : value,
    }))
  }

  function handleSousCatSelect(val: string) {
    if (val === '__libre__') {
      setSousCatLibre(true)
      setForm(prev => ({ ...prev, sous_categorie: sousCatCustom }))
    } else {
      setSousCatLibre(false)
      setForm(prev => ({ ...prev, sous_categorie: val }))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    const finalForm = { ...form, sous_categorie: sousCatLibre ? sousCatCustom : form.sous_categorie }
    const result = await updatePersonne(personne.id, finalForm)
    if (result.success && result.data) {
      onUpdate(result.data)
      setSaveMsg({ ok: true, msg: 'Enregistré avec succès.' })
    } else {
      setSaveMsg({ ok: false, msg: result.error ?? 'Erreur lors de la sauvegarde.' })
    }
    setSaving(false)
    setTimeout(() => setSaveMsg(null), 4000)
  }

  const readOnly = !isAdmin
  const inputClass = `w-full px-3 py-2 border rounded-lg text-sm transition-colors ${
    readOnly
      ? 'bg-gray-50 text-gray-700 border-gray-200 cursor-not-allowed'
      : 'bg-white border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#D31616]/20 focus:border-[#D31616]'
  }`

  // Label du champ montant selon mode
  const montantLabel: Record<string, string> = {
    'Horaire': 'Taux horaire (CHF/h)',
    'Mensuel fixe': 'Montant mensuel (CHF)',
    'Saisonnier fixe': 'Montant saisonnier (CHF)',
    'Bénéfice cantine': 'Part cantine (%)',
  }
  const montantField: Record<string, keyof PersonneFormData> = {
    'Horaire': 'taux_horaire',
    'Mensuel fixe': 'montant_mois',
    'Saisonnier fixe': 'montant_saison',
    'Bénéfice cantine': 'montant_saison',
  }
  const activeMontantKey = montantField[form.mode] as 'taux_horaire' | 'montant_mois' | 'montant_saison'

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {saveMsg && (
        <div className={`p-3 rounded-lg text-sm ${saveMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {saveMsg.msg}
        </div>
      )}

      {/* Identité */}
      <SectionCard title="Identité">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Code — toujours en lecture seule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              type="text"
              value={personne.code}
              readOnly
              className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed font-mono"
            />
          </div>
          <Field label="Prénom" name="prenom" value={form.prenom} onChange={handleChange} readOnly={readOnly} className={inputClass} />
          <Field label="Nom" name="nom" value={form.nom} onChange={handleChange} readOnly={readOnly} className={inputClass} />
        </div>

        {/* Catégorie + Sous-catégorie */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
            <select
              name="categorie"
              value={form.categorie}
              onChange={handleChange}
              disabled={readOnly}
              className={inputClass}
            >
              <option value="">— Sélectionner —</option>
              {CATEGORIES_PERSONNE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sous-catégorie / Équipe</label>
            {!sousCatLibre ? (
              <select
                value={form.sous_categorie}
                onChange={e => handleSousCatSelect(e.target.value)}
                disabled={readOnly}
                className={inputClass}
              >
                <option value="">— Aucune —</option>
                {SOUS_CATEGORIES.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                <option value="__libre__">Libre (saisie manuelle)…</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sousCatCustom}
                  onChange={e => { setSousCatCustom(e.target.value); setForm(prev => ({ ...prev, sous_categorie: e.target.value })) }}
                  readOnly={readOnly}
                  placeholder="Équipe ou groupe libre…"
                  className={inputClass}
                />
                {!readOnly && (
                  <button type="button" onClick={() => { setSousCatLibre(false); setForm(prev => ({ ...prev, sous_categorie: '' })) }}
                    className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg">
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="E-mail" name="email" type="email" value={form.email ?? ''} onChange={handleChange} readOnly={readOnly} className={inputClass} />
          <Field label="N° AVS" name="numero_avs" value={form.numero_avs ?? ''} onChange={handleChange} readOnly={readOnly} className={inputClass} placeholder="756.XXXX.XXXX.XX" />
        </div>

        <div className="mt-4">
          <Field label="IBAN" name="iban" value={form.iban ?? ''} onChange={handleChange} readOnly={readOnly} className={inputClass} placeholder="CH56 XXXX XXXX XXXX XXXX X" />
        </div>

        {/* Diplôme J+S + Bonus */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field
            label="Diplôme J+S"
            name="diplome_js"
            value={form.diplome_js ?? ''}
            onChange={handleChange}
            readOnly={readOnly}
            className={inputClass}
            placeholder="ex: J+S Coach Football"
          />
          <div className="flex items-end pb-1">
            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              form.bonus_js ? 'border-[#D31616] bg-red-50' : 'border-gray-200 bg-gray-50'
            } ${readOnly ? 'cursor-not-allowed' : 'hover:border-[#D31616]/40'} w-full`}>
              <input
                type="checkbox"
                name="bonus_js"
                checked={form.bonus_js ?? false}
                onChange={handleChange}
                disabled={readOnly}
                className="w-4 h-4 rounded border-gray-300 text-[#D31616] focus:ring-[#D31616]"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">Bonus diplôme J+S</p>
                <p className="text-xs text-gray-400">Montant additionnel configuré dans Paramètres</p>
              </div>
            </label>
          </div>
        </div>
      </SectionCard>

      {/* Rémunération */}
      <SectionCard title="Rémunération">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement</label>
            <select name="mode" value={form.mode} onChange={handleChange} disabled={readOnly} className={inputClass}>
              <option value="Horaire">Horaire</option>
              <option value="Mensuel fixe">Mensuel fixe</option>
              <option value="Saisonnier fixe">Saisonnier fixe</option>
              <option value="Bénéfice cantine">Bénéfice cantine</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{montantLabel[form.mode]}</label>
            <input
              type="number"
              name={activeMontantKey}
              value={(form[activeMontantKey] as number | null) ?? ''}
              onChange={handleChange}
              readOnly={readOnly}
              step={form.mode === 'Bénéfice cantine' ? '1' : '0.01'}
              min={0}
              max={form.mode === 'Bénéfice cantine' ? 100 : undefined}
              className={inputClass}
              placeholder={form.mode === 'Bénéfice cantine' ? 'ex: 40' : '0.00'}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select name="statut" value={form.statut} onChange={handleChange} disabled={readOnly} className={inputClass}>
              <option value="Actif">Actif</option>
              <option value="Inactif">Inactif</option>
            </select>
          </div>
        </div>

        {/* Mois payés — checkboxes */}
        <div className="mt-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mois payés
            <span className="ml-2 text-xs text-gray-400 font-normal">(vide = mois par défaut des paramètres)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MOIS_LABELS.map(m => (
              <button
                key={m.value}
                type="button"
                disabled={readOnly}
                onClick={() => !readOnly && toggleMois(m.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  moisPayesArr.includes(m.value)
                    ? 'bg-[#D31616] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                {m.short}
              </button>
            ))}
          </div>
          {moisPayesArr.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Sélectionnés : {moisPayesArr.map(m => MOIS_LABELS.find(x => x.value === m)?.label).join(', ')}
            </p>
          )}
        </div>
      </SectionCard>

      {/* Charges sociales */}
      <SectionCard title="Charges sociales">
        <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
          form.soumis_charges ? 'border-[#D31616] bg-red-50' : 'border-gray-200 bg-gray-50'
        } ${readOnly ? 'cursor-not-allowed' : 'hover:border-[#D31616]/50'}`}>
          <input
            type="checkbox"
            name="soumis_charges"
            checked={form.soumis_charges}
            onChange={handleChange}
            disabled={readOnly}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#D31616] focus:ring-[#D31616]"
          />
          <div>
            <p className="font-semibold text-gray-900">Soumis aux charges sociales (AVS / AC / LAA / ALFA)</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Si coché, les charges sont prélevées dès le premier franc. Type = Salaire.
              Si décoché, aucune charge. Type = Défraiement.
            </p>
          </div>
        </label>
      </SectionCard>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </form>
  )
}

// ============================================================
// Onglet Paiements
// ============================================================

function PaiementsTab({ paiements }: { paiements: Paiement[] }) {
  const [anneeFiltre, setAnneeFiltre] = useState<string>('')

  const annees = [...new Set(paiements.map((p) => p.date_paiement.slice(0, 4)))].sort().reverse()
  const filtered = anneeFiltre
    ? paiements.filter((p) => p.date_paiement.startsWith(anneeFiltre))
    : paiements

  const totalBrut = filtered.reduce((s, p) => s + p.brut, 0)
  const totalNet = filtered.reduce((s, p) => s + p.net, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={anneeFiltre}
          onChange={(e) => setAnneeFiltre(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Toutes les années</option>
          {annees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-sm text-gray-500">{filtered.length} paiement{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Période</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Brut</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Net</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">Aucun paiement</td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.pay_code}</td>
                  <td className="px-4 py-3 text-gray-700">{p.periode}</td>
                  <td className="px-4 py-3 text-gray-600">{p.type_paiement}</td>
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
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalBrut)}</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtCHF(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Onglet Heures
// ============================================================

function HeuresTab({
  heures,
  personneId,
  isAdmin,
  isOwnProfile,
  onUpdate,
}: {
  heures: Heure[]
  personneId: string
  isAdmin: boolean
  isOwnProfile: boolean
  onUpdate: (h: Heure[]) => void
}) {
  const canAdd = isAdmin || isOwnProfile
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    date_travail: new Date().toISOString().split('T')[0],
    heure_debut: '09:00',
    heure_fin: '17:00',
    activite: '',
    remarques: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dureeCalculee = formData.heure_debut && formData.heure_fin && formData.heure_fin > formData.heure_debut
    ? calculerHeuresDecimal(formData.heure_debut, formData.heure_fin)
    : null

  const totalHeures = heures.reduce((s, h) => s + h.heures_decimal, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const result = await createHeure({ ...formData, personne_id: personneId })
    if (result.success && result.data) {
      onUpdate([result.data, ...heures])
      setShowForm(false)
      setFormData({
        date_travail: new Date().toISOString().split('T')[0],
        heure_debut: '09:00',
        heure_fin: '17:00',
        activite: '',
        remarques: '',
      })
    } else {
      setError(result.error ?? 'Erreur')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette heure ?')) return
    const result = await deleteHeure(id)
    if (result.success) {
      onUpdate(heures.filter((h) => h.id !== id))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-600">
            {heures.length} entrée{heures.length !== 1 ? 's' : ''} — Total :{' '}
            <strong>{fmtNombre(totalHeures)} h</strong>
          </span>
        </div>
        {canAdd && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#D31616] hover:bg-[#b91c1c] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {showForm ? 'Annuler' : '+ Ajouter des heures'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Nouvelle saisie d'heures</h3>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={formData.date_travail}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => setFormData((p) => ({ ...p, date_travail: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Début</label>
              <input
                type="time"
                value={formData.heure_debut}
                onChange={(e) => setFormData((p) => ({ ...p, heure_debut: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
              <input
                type="time"
                value={formData.heure_fin}
                onChange={(e) => setFormData((p) => ({ ...p, heure_fin: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Durée calculée</label>
              <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-semibold text-gray-700">
                {dureeCalculee !== null ? `${fmtNombre(dureeCalculee)} h` : '—'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Activité *</label>
              <input
                type="text"
                value={formData.activite}
                onChange={(e) => setFormData((p) => ({ ...p, activite: e.target.value }))}
                placeholder="ex: Match à domicile, Entraînement…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Remarques (optionnel)</label>
              <input
                type="text"
                value={formData.remarques}
                onChange={(e) => setFormData((p) => ({ ...p, remarques: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D31616]/20"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Début</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fin</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Heures</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Activité</th>
              {isAdmin && <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {heures.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="text-center py-8 text-gray-400">
                  Aucune heure enregistrée
                </td>
              </tr>
            ) : (
              heures.map((h) => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{fmtDate(h.date_travail)}</td>
                  <td className="px-4 py-3 text-gray-600">{h.heure_debut}</td>
                  <td className="px-4 py-3 text-gray-600">{h.heure_fin}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtNombre(h.heures_decimal)} h</td>
                  <td className="px-4 py-3 text-gray-700">{h.activite}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(h.id)}
                        className="text-xs text-red-600 hover:text-red-800 hover:underline"
                      >
                        Supprimer
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {heures.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtNombre(totalHeures)} h</td>
                <td colSpan={isAdmin ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Helpers UI
// ============================================================

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({
  label,
  name,
  value,
  onChange,
  readOnly,
  className,
  type = 'text',
  placeholder,
  step,
}: {
  label: string
  name: string
  value: string | number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  readOnly: boolean
  className: string
  type?: string
  placeholder?: string
  step?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder={placeholder}
        step={step}
        className={className}
      />
    </div>
  )
}
