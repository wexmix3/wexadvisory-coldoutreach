import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Resend signs webhooks via Svix. We verify using a URL secret for simplicity.
// Set RESEND_WEBHOOK_SECRET in env, then configure your Resend webhook URL as:
//   https://yourdomain.com/api/webhooks/resend?secret=YOUR_SECRET
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return true // skip check if not configured (dev mode)
  return req.nextUrl.searchParams.get('secret') === secret
}

type ResendEvent = {
  type: string
  data: {
    email_id: string
    to?: string[]
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let event: ResendEvent
  try {
    event = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, data } = event
  const resendId = data?.email_id

  if (!resendId) return NextResponse.json({ ok: true })

  // Look up the email_log record by resend_id to get prospect_id
  const { data: logRow } = await supabaseAdmin
    .from('email_log')
    .select('id, prospect_id')
    .eq('resend_id', resendId)
    .maybeSingle()

  if (!logRow) return NextResponse.json({ ok: true }) // not our email, ignore

  const now = new Date().toISOString()

  switch (type) {
    case 'email.bounced': {
      // Mark email_log as bounced, mark prospect as bounced (stop sending to them)
      await Promise.all([
        supabaseAdmin
          .from('email_log')
          .update({ status: 'bounced' })
          .eq('id', logRow.id),
        supabaseAdmin
          .from('prospects')
          .update({ status: 'bounced', bounced_at: now })
          .eq('id', logRow.prospect_id),
      ])
      break
    }

    case 'email.complained': {
      // Spam complaint — treat as unsubscribe immediately
      await supabaseAdmin
        .from('prospects')
        .update({ status: 'unsubscribed' })
        .eq('id', logRow.prospect_id)
      break
    }

    case 'email.opened': {
      // Record first open time — don't overwrite if already set
      await supabaseAdmin
        .from('email_log')
        .update({ opened_at: now })
        .eq('id', logRow.id)
        .is('opened_at', null)
      break
    }

    case 'email.clicked': {
      // Record first click time — don't overwrite if already set
      await supabaseAdmin
        .from('email_log')
        .update({ clicked_at: now })
        .eq('id', logRow.id)
        .is('clicked_at', null)
      break
    }

    // email.sent, email.delivered — no action needed
    default:
      break
  }

  return NextResponse.json({ ok: true })
}
