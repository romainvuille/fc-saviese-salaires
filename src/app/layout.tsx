import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'FC Savièse — Gestion des salaires',
  description: 'Système de gestion des salaires et défraiements du FC Savièse',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <ToasterWrapper />
      </body>
    </html>
  )
}

// Le Toaster est importé dynamiquement pour éviter les problèmes SSR
function ToasterWrapper() {
  return (
    <div id="toaster-portal">
      {/* Le Toaster shadcn/ui est monté dans app-layout pour les pages protégées */}
    </div>
  )
}
