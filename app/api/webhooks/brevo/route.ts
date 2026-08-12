import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type BrevoEvent = { event: string; ['message-id']?: string }

export async function POST(req: NextRequest) {
  let event: BrevoEvent
  try { event = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sb = getSupabaseAdmin()

  try {
    const messageId = event['message-id']
    if (!messageId) return NextResponse.json({ ok: true })

    const { data: logRow } = await sb.from('email_log').select('id, prospect_id').eq('resend_id', messageId).maybeSingle()
    if (!logRow) return NextResponse.json({ ok: true })

    const now = new Date().toISOString()

    switch (event.event) {
      case 'delivered':
        await sb.from('email_log').update({ delivered_at: now }).eq('id', logRow.id).is('delivered_at', null)
        break
      case 'hardBounce':
      case 'blocked':
      case 'invalid':
        await Promise.all([
          sb.from('email_log').update({ status: 'bounced' }).eq('id', logRow.id),
          sb.from('prospects').update({ status: 'bounced', bounced_at: now }).eq('id', logRow.prospect_id),
        ])
        break
      case 'spam':
        await Promise.all([
          sb.from('email_log').update({ complained_at: now }).eq('id', logRow.id).is('complained_at', null),
          sb.from('prospects').update({ status: 'unsubscribed', unsubscribed_at: now }).eq('id', logRow.prospect_id),
        ])
        break
      case 'unsubscribed':
        await sb.from('prospects').update({ status: 'unsubscribed', unsubscribed_at: now }).eq('id', logRow.prospect_id)
        break
      case 'opened':
        await sb.from('email_log').update({ opened_at: now }).eq('id', logRow.id).is('opened_at', null)
        break
      case 'click':
        await sb.from('email_log').update({ clicked_at: now }).eq('id', logRow.id).is('clicked_at', null)
        break
    }
  } catch (err) {
    // Always return 200 so Brevo doesn't disable the webhook on transient errors —
    // but record it so a run of these isn't silently invisible.
    await sb.from('webhook_failures').insert({
      source: 'brevo',
      event_type: event?.event,
      payload: event,
      error_message: err instanceof Error ? err.message : String(err),
    }).then(undefined, () => {})
  }

  return NextResponse.json({ ok: true })
}
