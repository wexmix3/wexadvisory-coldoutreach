import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let query = sb
    .from('prospects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prospects: data }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
