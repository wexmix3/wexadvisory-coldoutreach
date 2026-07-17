import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TEMPLATE_LABELS: Record<string, string> = {
  initial: 'Initial',
  followup1: 'Follow-up 1',
  followup2: 'Follow-up 2',
}

type LogRow = {
  template_type: string
  status: string
  sent_at: string
}

async function sendNotificationEmail(
  total_sent: number,
  total_failed: number,
  by_template: { template_type: string; sent: number; failed: number }[],
  last_sent_at: string | null,
  date: string
): Promise<void> {
  const apiKey = process.env.RESEND_CONFIRMATION_API_KEY
  if (!apiKey) throw new Error('RESEND_CONFIRMATION_API_KEY not configured')

  const noActivity = total_sent === 0 && total_failed === 0
  const subject = noActivity
    ? `Outreach: ⚠️ No sends today · ${date}`
    : `Outreach: ${total_sent} sent today · ${date}`

  const lastSentLine = last_sent_at
    ? `Last send: ${new Date(last_sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })}`
    : 'No successful sends recorded'

  const breakdownRows = by_template
    .map((t) => `${TEMPLATE_LABELS[t.template_type] ?? t.template_type}: ${t.sent} sent${t.failed > 0 ? `, ${t.failed} failed` : ''}`)
    .join('\n')

  const body = noActivity
    ? `No outreach emails were sent today (${date}).\n\nThe 2pm UTC cron may not have run, or there were no prospects queued.\n\nCheck the dashboard: https://outreach-tool-inky.vercel.app`
    : `Date: ${date}\nSent: ${total_sent}\nFailed: ${total_failed}\n${lastSentLine}\n\nBreakdown:\n${breakdownRows}\n\nDashboard: https://outreach-tool-inky.vercel.app`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Max Wexley <maxwexley@wexadvisory.com>',
      to: 'maxwexley@wexadvisory.com',
      subject,
      text: body,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? 'Resend error')
  }
}

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const notify = req.nextUrl.searchParams.get('notify') === 'true'

  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)
  const todayStr = todayUtc.toISOString()

  const { data, error } = await sb
    .from('email_log')
    .select('template_type, status, sent_at')
    .gte('sent_at', todayStr)
    .order('sent_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const logs = (data ?? []) as LogRow[]

  const total_sent = logs.filter((l) => l.status === 'sent').length
  const total_failed = logs.filter((l) => l.status === 'failed').length
  const last_sent_at = logs.find((l) => l.status === 'sent')?.sent_at ?? null
  const date = todayStr.slice(0, 10)

  const templateTypes = ['initial', 'followup1', 'followup2']
  const by_template = templateTypes.map((type) => ({
    template_type: type,
    sent: logs.filter((l) => l.template_type === type && l.status === 'sent').length,
    failed: logs.filter((l) => l.template_type === type && l.status === 'failed').length,
  }))

  const payload = { date, total_sent, total_failed, by_template, last_sent_at }

  if (notify) {
    try {
      await sendNotificationEmail(total_sent, total_failed, by_template, last_sent_at, date)
      return NextResponse.json({ ...payload, notified: true })
    } catch (err) {
      return NextResponse.json(
        { ...payload, notified: false, notify_error: err instanceof Error ? err.message : 'Unknown' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json(payload)
}
