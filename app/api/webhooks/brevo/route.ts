import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type BrevoEvent = { event: string; ['message-id']?: string }

async function logFailure(sb: ReturnType<typeof getSupabaseAdmin>, event: BrevoEvent | undefined, reason: string) {
  await sb.from('webhook_failures').insert({
    source: 'brevo',
    event_type: event?.event,
    payload: event,
    error_message: reason,
  }).then(undefined, () => {})
}

export async function POST(req: NextRequest) {
  let event: BrevoEvent
  try { event = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sb = getSupabaseAdmin()

  try {
    const messageId = event['message-id']
    if (!messageId) {
      await logFailure(sb, event, 'No message-id in payload')
      return NextResponse.json({ ok: true })
    }

    const { data: logRow, error: lookupError } = await sb.from('email_log').select('id, prospect_id').eq('resend_id', messageId).maybeSingle()
    if (lookupError) {
      await logFailure(sb, event, `Lookup error: ${lookupError.message}`)
      return NextResponse.json({ ok: true })
    }
    if (!logRow) {
      await logFailure(sb, event, `No email_log row matches message-id ${messageId}`)
      return NextResponse.json({ ok: true })
    }

    const now = new Date().toISOString()
    let result: { error: { message: string } | null } | { error: { message: string } | null }[]

    switch (event.event) {
      case 'delivered':
        result = await sb.from('email_log').update({ delivered_at: now }).eq('id', logRow.id).is('delivered_at', null)
        break
      case 'hardBounce':
      case 'blocked':
      case 'invalid':
        result = await Promise.all([
          sb.from('email_log').update({ status: 'bounced' }).eq('id', logRow.id),
          sb.from('prospects').update({ status: 'bounced', bounced_at: now }).eq('id', logRow.prospect_id),
        ])
        break
      case 'spam':
        result = await Promise.all([
          sb.from('email_log').update({ complained_at: now }).eq('id', logRow.id).is('complained_at', null),
          sb.from('prospects').update({ status: 'unsubscribed', unsubscribed_at: now }).eq('id', logRow.prospect_id),
        ])
        break
      case 'unsubscribed':
        result = await sb.from('prospects').update({ status: 'unsubscribed', unsubscribed_at: now }).eq('id', logRow.prospect_id)
        break
      case 'opened':
        result = await sb.from('email_log').update({ opened_at: now }).eq('id', logRow.id).is('opened_at', null)
        break
      case 'click':
        result = await sb.from('email_log').update({ clicked_at: now }).eq('id', logRow.id).is('clicked_at', null)
        break
      default:
        result = { error: null }
    }

    const errors = (Array.isArray(result) ? result : [result]).map((r) => r.error).filter(Boolean)
    if (errors.length) {
      await logFailure(sb, event, `Write error: ${errors.map((e) => e!.message).join('; ')}`)
    }
  } catch (err) {
    // Always return 200 so Brevo doesn't disable the webhook on transient errors --
    // but record it so a run of these isn't silently invisible.
    await logFailure(sb, event, err instanceof Error ? err.message : String(err))
  }

  return NextResponse.json({ ok: true })
}
