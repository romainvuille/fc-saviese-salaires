import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db'
import { AppLayout } from '@/components/layout/app-layout'
import type { Profile } from '@/types'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  // Récupérer le profil depuis la DB
  const profileRow = await prisma.profile.findUnique({
    where: { id: session.user.id },
  })

  if (!profileRow) {
    // Profil non créé (premier login) — redirection login avec message
    redirect('/login?error=profil_manquant')
  }

  const profile: Profile = {
    id: profileRow.id,
    email: profileRow.email,
    nom: profileRow.nom,
    prenom: profileRow.prenom,
    role: profileRow.role as Profile['role'],
    personne_id: profileRow.personne_id,
    created_at: profileRow.created_at.toISOString(),
  }

  return <AppLayout profile={profile}>{children}</AppLayout>
}
