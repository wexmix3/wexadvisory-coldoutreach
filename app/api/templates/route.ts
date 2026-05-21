import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('*')
    .order('type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data })
}

export async function PUT(req: NextRequest) {
  const { id, subject, body_html } = await req.json()
  if (!id || !subject || !body_html) {
    return NextResponse.json({ error: 'id, subject, body_html required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('templates')
    .update({ subject, body_html, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
