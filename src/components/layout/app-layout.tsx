'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { initiales, labelRole } from '@/lib/utils'
import type { Profile } from '@/types'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Scale,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  adminOnly?: boolean
  adminOrManager?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/personnes', label: 'Personnes', icon: Users },
  { href: '/paiements', label: 'Paiements', icon: CreditCard },
  { href: '/arbitrage', label: 'Arbitrage', icon: Scale, adminOnly: true },
  { href: '/parametres', label: 'Paramètres', icon: Settings, adminOnly: true },
]

interface AppLayoutProps {
  profile: Profile
  children: React.ReactNode
}

export function AppLayout({ profile, children }: AppLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const isAdmin = profile.role === 'admin'
  const isAdminOrManager = profile.role === 'admin' || profile.role === 'manager'

  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.adminOrManager && !isAdminOrManager) return false
    return true
  })

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-40 flex flex-col
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200">
          <div className="flex-shrink-0 w-9 h-9 bg-[#D31616] rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm leading-none">FC</span>
          </div>
          <div>
            <span className="font-black text-[#D31616] text-base leading-tight block">FC Savièse</span>
            <span className="text-xs text-gray-400">Gestion salaires</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group
                  ${isActive
                    ? 'bg-[#D31616]/10 text-[#D31616]'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#D31616]' : 'text-gray-400 group-hover:text-gray-600'}`} />
                <span>{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[#D31616]" />}
              </Link>
            )
          })}
        </nav>

        {/* Profil + déconnexion */}
        <div className="px-3 py-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 mb-2">
            <div className="w-8 h-8 rounded-full bg-[#D31616] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {initiales(profile.prenom, profile.nom)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {profile.prenom} {profile.nom}
              </p>
              <p className="text-xs text-gray-500">{labelRole(profile.role)}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="
              flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-600
              hover:bg-red-50 hover:text-[#D31616] transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <LogOut className="w-4 h-4" />
            {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header mobile */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#D31616] rounded-md flex items-center justify-center">
              <span className="text-white font-black text-xs">FC</span>
            </div>
            <span className="font-black text-[#D31616] text-base">FC Savièse</span>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
