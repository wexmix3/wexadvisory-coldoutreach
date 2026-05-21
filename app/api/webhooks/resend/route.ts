import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return true
  return req.nextUrl.searchParams.get('secret') === secret
}

type ResendEvent = { type: string; data: { email_id: string } }

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let event: ResendEvent
  try { event = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sb = getSupabaseAdmin()
  const { type, data } = event
  const resendId = data?.email_id
  if (!resendId) return NextResponse.json({ ok: true })

  const { data: logRow } = await sb.from('email_log').select('id, prospect_id').eq('resend_id', resendId).maybeSingle()
  if (!logRow) return NextResponse.json({ ok: true })

  const now = new Date().toISOString()

  switch (type) {
    case 'email.bounced':
      await Promise.all([
        sb.from('email_log').update({ status: 'bounced' }).eq('id', logRow.id),
        sb.from('prospects').update({ status: 'bounced', bounced_at: now }).eq('id', logRow.prospect_id),
      ])
      break
    case 'email.complained':
      await sb.from('prospects').update({ status: 'unsubscribed' }).eq('id', logRow.prospect_id)
      break
    case 'email.opened':
      await sb.from('email_log').update({ opened_at: now }).eq('id', logRow.id).is('opened_at', null)
      break
    case 'email.clicked':
      await sb.from('email_log').update({ clicked_at: now }).eq('id', logRow.id).is('clicked_at', null)
      break
  }

  return NextResponse.json({ ok: true })
}
