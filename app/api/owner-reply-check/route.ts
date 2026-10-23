import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildOwnerReplyReport } from '@/lib/owner-reply-check'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Thursday cron after the day's send and reply-scan. Emails the owner-finder reply readout to Max.
// ?preview=1 returns the report without sending.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const report = await buildOwnerReplyReport(getSupabaseAdmin())
    if (req.nextUrl.searchParams.get('preview') === '1') return NextResponse.json(report)

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY not configured')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Max Wexley <maxwexley@wexadvisory.com>',
        to: 'maxwexley@wexadvisory.com',
        subject: report.subject,
        html: report.html,
      }),
    })
    if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return NextResponse.json({ sent: true, owner: report.owner, other: report.other })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
