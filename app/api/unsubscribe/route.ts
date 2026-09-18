import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function markUnsubscribed(id: string) {
  const sb = getSupabaseAdmin()
  return sb
    .from('prospects')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'unsubscribed')
}

function page(title: string, body: string) {
  return new NextResponse(
    `<!DOCTYPE html><html><head><title>${title}</title><meta name="robots" content="noindex">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;padding:0 16px;}
    .card{text-align:center;padding:2rem;border-radius:12px;background:white;box-shadow:0 1px 4px rgba(0,0,0,.1);max-width:420px;}
    h2{margin:0 0 .5rem;color:#111;}p{color:#555;margin:0 0 1rem;}
    button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer;}</style></head>
    <body><div class="card">${body}</div></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

// Handles both the RFC 8058 one-click POST (Gmail/Yahoo "Unsubscribe" button, driven by
// the List-Unsubscribe-Post header) and the confirm button on the GET page below.
export async function POST(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await markUnsubscribed(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return page('Unsubscribed', `<h2>You've been unsubscribed</h2><p>You won't receive any more emails from Wex Advisory.</p>`)
}

// GET never unsubscribes. Link scanners (Microsoft Defender Safe Links, AWS-hosted
// security gateways) fetch every URL in an email seconds after delivery, and a GET that
// unsubscribed was silently pulling real prospects out of the sequence (7 confirmed
// 2026-09-14..17). A human has to press the button, which POSTs back here.
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const action = `/api/unsubscribe?id=${encodeURIComponent(id)}`
  return page(
    'Unsubscribe',
    `<h2>Unsubscribe from Wex Advisory?</h2><p>You won't get any more emails from me.</p>
    <form method="POST" action="${action}"><button type="submit">Unsubscribe</button></form>`
  )
}
