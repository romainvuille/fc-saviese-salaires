import { NextRequest, NextResponse } from 'next/server'
import { genererFichePDF } from '@/actions/pdf'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params

  try {
    const buffer = await genererFichePDF(id)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="fiche-${id}.pdf"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur génération PDF' },
      { status: 500 }
    )
  }
}
