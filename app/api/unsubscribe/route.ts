import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await sb
    .from('prospects')
    .update({ status: 'unsubscribed' })
    .eq('id', id)
    .neq('status', 'unsubscribed')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(
    `<!DOCTYPE html><html><head><title>Unsubscribed</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;}
    .card{text-align:center;padding:2rem;border-radius:12px;background:white;box-shadow:0 1px 4px rgba(0,0,0,.1);}
    h2{margin:0 0 .5rem;color:#111;}p{color:#555;margin:0;}</style></head>
    <body><div class="card"><h2>You've been unsubscribed</h2>
    <p>You won't receive any more emails from Wex Advisory.</p></div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
