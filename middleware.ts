// ============================================================
// FC Savièse — Middleware Next.js
// Authentification Supabase + contrôle d'accès par rôle
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes accessibles sans authentification
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/error']

// Routes réservées aux admins uniquement
const ADMIN_ONLY_ROUTES = ['/parametres', '/bexio', '/generer', '/utilisateurs']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Laisser passer les routes publiques
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Laisser passer les routes Next.js internes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Rafraîchir la session (important pour les Server Components)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Pas de session → rediriger vers /login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Récupérer le rôle depuis la table profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, personne_id')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'employee'
  const personneId = profile?.personne_id ?? ''

  // Injecter le rôle dans les headers pour les Server Components
  response.headers.set('x-user-role', role)
  response.headers.set('x-user-id', user.id)
  response.headers.set('x-user-email', user.email ?? '')
  response.headers.set('x-personne-id', personneId)

  // Vérifier les routes admin-only
  if (ADMIN_ONLY_ROUTES.some((route) => pathname.startsWith(route))) {
    if (role !== 'admin') {
      // Rediriger vers le dashboard avec message d'erreur
      const forbiddenUrl = request.nextUrl.clone()
      forbiddenUrl.pathname = '/dashboard'
      forbiddenUrl.searchParams.set('error', 'acces_interdit')
      return NextResponse.redirect(forbiddenUrl)
    }
  }

  // Employees ne peuvent accéder qu'à leurs propres pages
  if (role === 'employee') {
    const employeeAllowed = [
      '/dashboard',
      '/paiements',
      '/heures',
      '/profil',
    ]
    const isAllowed = employeeAllowed.some((r) => pathname.startsWith(r))
    if (!isAllowed) {
      const forbiddenUrl = request.nextUrl.clone()
      forbiddenUrl.pathname = '/dashboard'
      forbiddenUrl.searchParams.set('error', 'acces_interdit')
      return NextResponse.redirect(forbiddenUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Matcher sur toutes les routes sauf :
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation images)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
