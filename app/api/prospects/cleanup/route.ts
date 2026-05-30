import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isValidEmail } from '@/lib/discovery'

export const dynamic = 'force-dynamic'

export async function POST() {
  const sb = getSupabaseAdmin()

  const { data: prospects, error } = await sb
    .from('prospects')
    .select('id, email')
    .in('status', ['new', 'queued'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!prospects?.length) return NextResponse.json({ removed: 0 })

  const badIds = prospects
    .filter(p => !isValidEmail(p.email))
    .map(p => p.id)

  if (badIds.length === 0) return NextResponse.json({ removed: 0 })

  const { error: delError } = await sb
    .from('prospects')
    .delete()
    .in('id', badIds)

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  return NextResponse.json({ removed: badIds.length })
}
