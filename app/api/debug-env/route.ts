import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
export const dynamic = 'force-dynamic'
export async function GET() {
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('templates').select('type,subject,body_html').eq('type', 'initial')
  const body = data?.[0]?.body_html ?? ''
  const idx = body.indexOf('I built')
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50),
    subject: data?.[0]?.subject,
    body_snippet: body.slice(idx, idx + 100),
  })
}
