import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('templates').select('*').order('type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
  })
}

export async function PUT(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const { id, subject, body_html } = await req.json()
  if (!id || !subject || !body_html) {
    return NextResponse.json({ error: 'id, subject, body_html required' }, { status: 400 })
  }
  const { error } = await sb
    .from('templates')
    .update({ subject, body_html, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
