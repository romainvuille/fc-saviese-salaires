'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(6, 'Mot de passe trop court (minimum 6 caractères)'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
    setServerError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)

    // Validation Zod côté client
    const result = loginSchema.safeParse(form)
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginForm, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginForm
        fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setServerError('E-mail ou mot de passe incorrect.')
        } else if (error.message.includes('Email not confirmed')) {
          setServerError("Votre compte n'est pas encore confirmé. Vérifiez vos e-mails.")
        } else {
          setServerError(error.message)
        }
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setServerError('Une erreur inattendue est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Header rouge */}
          <div className="bg-[#D31616] px-8 py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4">
              <span className="text-[#D31616] font-black text-xl">FC</span>
            </div>
            <h1 className="text-white font-black text-2xl tracking-tight">FC Savièse</h1>
            <p className="text-red-100 text-sm mt-1">Gestion des salaires</p>
          </div>

          {/* Formulaire */}
          <div className="px-8 py-8">
            <h2 className="text-gray-900 font-semibold text-lg mb-6 text-center">
              Connexion à votre espace
            </h2>

            {serverError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {serverError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              {/* E-mail */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Adresse e-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange}
                  className={`
                    w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors
                    ${errors.email
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-gray-300 focus:ring-[#D31616]/20 focus:border-[#D31616]'
                    }
                  `}
                  placeholder="prenom.nom@exemple.ch"
                  disabled={loading}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email}</p>
                )}
              </div>

              {/* Mot de passe */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  className={`
                    w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors
                    ${errors.password
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-gray-300 focus:ring-[#D31616]/20 focus:border-[#D31616]'
                    }
                  `}
                  placeholder="••••••••"
                  disabled={loading}
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password}</p>
                )}
              </div>

              {/* Bouton */}
              <button
                type="submit"
                disabled={loading}
                className="
                  w-full py-2.5 px-4 bg-[#D31616] hover:bg-[#b91c1c] text-white font-semibold
                  rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#D31616]/50
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Connexion en cours…
                  </span>
                ) : (
                  'Se connecter'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          FC Savièse &copy; {new Date().getFullYear()} — Accès réservé aux membres autorisés
        </p>
      </div>
    </div>
  )
}
