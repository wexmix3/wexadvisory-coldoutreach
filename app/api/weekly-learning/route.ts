import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MIN_SAMPLE_SIZE = 5

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function pct(n: number, d: number): string {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()
  const since = new Date()
  since.setDate(since.getDate() - 30)

  // A bounce webhook re-marks its row 'bounced', so 'sent' alone dropped every bounce from the count.
  type Log = { id: string; template_type: string; status: string; opened_at: string | null; clicked_at: string | null; prospect_id: string; sent_at: string }
  const logs: Log[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('email_log')
      .select('id, template_type, status, opened_at, clicked_at, prospect_id, sent_at')
      .gte('sent_at', since.toISOString())
      .in('status', ['sent', 'bounced'])
      .order('sent_at', { ascending: true })
      .range(from, from + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    logs.push(...((data ?? []) as Log[]))
    if (!data || data.length < 1000) break
  }
  if (logs.length === 0) {
    return NextResponse.json({ message: 'No data in last 30 days' })
  }

  type ProspectRow = { id: string; industry: string | null; replied_at: string | null; unsubscribed_at: string | null }
  const prospectIds = [...new Set(logs.map(l => l.prospect_id))]
  const prospectMap = new Map<string, ProspectRow>()
  // Chunked so the id list never outgrows the request URL.
  for (let i = 0; i < prospectIds.length; i += 100) {
    const { data, error: pErr } = await sb
      .from('prospects')
      .select('id, industry, replied_at, unsubscribed_at')
      .in('id', prospectIds.slice(i, i + 100))
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    for (const p of (data ?? []) as ProspectRow[]) prospectMap.set(p.id, p)
  }

  // Replies live on the prospect, not on an email: reply-scan sets replied_at (plus unsubscribed_at for a "no"),
  // and the unsubscribe link / Brevo spam events set only unsubscribed_at. Credit each to the last email the
  // prospect got before it happened. email_log.reply_category is never set.
  const repliedTo = new Map<string, 'reply' | 'optout'>()
  for (const p of prospectMap.values()) {
    const at = p.replied_at ?? p.unsubscribed_at
    if (!at) continue
    const last = logs
      .filter(l => l.prospect_id === p.id && new Date(l.sent_at) <= new Date(at))
      .sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0]
    if (last) repliedTo.set(last.id, p.unsubscribed_at ? 'optout' : 'reply')
  }

  type GroupKey = string
  type GroupStats = { sends: number; opens: number; clicks: number; replies: number; optouts: number; bounces: number; template_type: string; industry: string }
  const groups = new Map<GroupKey, GroupStats>()

  for (const log of logs as Log[]) {
    const industry = prospectMap.get(log.prospect_id)?.industry ?? 'Unknown'
    const key = `${industry}__${log.template_type}`
    if (!groups.has(key)) {
      groups.set(key, { sends: 0, opens: 0, clicks: 0, replies: 0, optouts: 0, bounces: 0, template_type: log.template_type, industry })
    }
    const g = groups.get(key)!
    g.sends++
    if (log.opened_at) g.opens++
    if (log.clicked_at) g.clicks++
    if (repliedTo.get(log.id) === 'reply') g.replies++
    if (repliedTo.get(log.id) === 'optout') g.optouts++
    if (log.status === 'bounced') g.bounces++
  }

  const ranked = [...groups.values()]
    .filter(g => g.sends >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b.opens / b.sends - a.opens / a.sends)

  const skipped = [...groups.values()].filter(g => g.sends < MIN_SAMPLE_SIZE).length

  if (ranked.length === 0) {
    return NextResponse.json({ message: `No groups with >= ${MIN_SAMPLE_SIZE} sends yet`, skipped })
  }

  const rows = ranked.map(g =>
    `<tr>
      <td style="padding:4px 8px">${g.industry}</td>
      <td style="padding:4px 8px">${g.template_type}</td>
      <td style="padding:4px 8px">${g.sends}</td>
      <td style="padding:4px 8px">${pct(g.opens, g.sends)}</td>
      <td style="padding:4px 8px">${pct(g.clicks, g.sends)}</td>
      <td style="padding:4px 8px">${pct(g.replies, g.sends)}</td>
      <td style="padding:4px 8px">${pct(g.optouts, g.sends)}</td>
      <td style="padding:4px 8px">${pct(g.bounces, g.sends)}</td>
    </tr>`
  ).join('\n')

  const top3 = ranked.slice(0, 3).map(g => `${g.industry} / ${g.template_type} (${pct(g.opens, g.sends)} open rate)`).join('<br>')
  const bottom3 = ranked.slice(-3).map(g => `${g.industry} / ${g.template_type} (${pct(g.opens, g.sends)} open rate)`).join('<br>')

  const html = `
    <h2 style="font-family:sans-serif">Outreach Weekly Learning — ${new Date().toLocaleDateString()}</h2>
    <p style="font-family:sans-serif">Last 30 days · ${logs.length} sends · ${ranked.length} groups with ≥${MIN_SAMPLE_SIZE} sends · ${skipped} skipped (insufficient data)</p>

    <h3 style="font-family:sans-serif">Top performers (open rate)</h3>
    <p style="font-family:sans-serif">${top3}</p>

    <h3 style="font-family:sans-serif">Lowest performers</h3>
    <p style="font-family:sans-serif">${bottom3}</p>

    <h3 style="font-family:sans-serif">Full breakdown</h3>
    <table style="font-family:sans-serif;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:4px 8px;text-align:left">Industry</th>
          <th style="padding:4px 8px;text-align:left">Template</th>
          <th style="padding:4px 8px;text-align:left">Sends</th>
          <th style="padding:4px 8px;text-align:left">Open %</th>
          <th style="padding:4px 8px;text-align:left">Click %</th>
          <th style="padding:4px 8px;text-align:left">Reply %</th>
          <th style="padding:4px 8px;text-align:left">Opt-out %</th>
          <th style="padding:4px 8px;text-align:left">Bounce %</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `

  const subject = `Outreach Learning · ${new Date().toLocaleDateString()} · ${ranked.length} groups`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey.startsWith('re_your')) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Max Wexley <maxwexley@wexadvisory.com>',
      to: 'maxwexley@wexadvisory.com',
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ error: err.message ?? 'Resend error' }, { status: 500 })
  }

  return NextResponse.json({ sent: true, groups: ranked.length, skipped, total_sends: logs.length })
}
