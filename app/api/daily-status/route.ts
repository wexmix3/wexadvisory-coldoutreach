import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OWNER_TAG } from '@/lib/owner-finder'
import { REAPPROACH_TAG } from '@/lib/reapproach'

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

// Same rules and defaults as send-scheduled.
const MIN_FIT_SCORE = Number(process.env.MIN_FIT_SCORE ?? 50)

// Discovery adds few prospects a day by design (Hunter allows 50 lookups a month),
// so "added 0" for a day is normal and several days of it is not. The cron's own
// response only reaches Vercel's logs; this puts the numbers in the daily email.
type Supply = {
  added_today: number
  added_today_named: number
  added_today_from_hunter: number
  ready_to_send: number
  owner_searched: number
  owner_found: number
  reapproach_checked: number
  reapproach_candidates: number
  reapproach_queued: number
}

function supplyLines(s: Supply): string {
  const ownerLine = s.owner_searched
    ? `Owner finder today: searched ${s.owner_searched}, found ${s.owner_found} decision makers`
    : 'Owner finder today: no search ran (out of free Firecrawl credits, nothing left to search, or the 11:30 UTC job failed)'
  const reapproachLine = s.reapproach_checked || s.reapproach_queued
    ? `Re-approach today: checked ${s.reapproach_checked} old businesses, ${s.reapproach_candidates} owner candidates, ${s.reapproach_queued} owners queued`
    : 'Re-approach today: nothing checked (all old businesses already checked, or the 12:00 UTC job failed)'
  return [
    `New prospects found today: ${s.added_today} (${s.added_today_named} with a named contact, ${s.added_today_from_hunter} from Hunter)`,
    ownerLine,
    reapproachLine,
    `Named prospects waiting for a first email: ${s.ready_to_send}`,
  ].join('\n')
}

async function sendNotificationEmail(
  total_sent: number,
  total_failed: number,
  by_template: { template_type: string; sent: number; failed: number }[],
  last_sent_at: string | null,
  date: string,
  supply: Supply
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
    ? `No outreach emails were sent today (${date}).\n\nThe 2pm UTC cron may not have run, or there were no prospects queued.\n\n${supplyLines(supply)}\n\nCheck the dashboard: https://outreach-tool-inky.vercel.app`
    : `Date: ${date}\nSent: ${total_sent}\nFailed: ${total_failed}\n${lastSentLine}\n\nBreakdown:\n${breakdownRows}\n\n${supplyLines(supply)}\n\nDashboard: https://outreach-tool-inky.vercel.app`

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

  const { data: addedRows, error: addedErr } = await sb
    .from('prospects')
    .select('contact_name, hunter_confidence')
    .gte('created_at', todayStr)
  if (addedErr) return NextResponse.json({ error: addedErr.message }, { status: 500 })

  const { count: readyCount, error: readyErr } = await sb
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .gte('fit_score', MIN_FIT_SCORE)
    .neq('contact_name', '')
  if (readyErr) return NextResponse.json({ error: readyErr.message }, { status: 500 })

  // The owner finder tags every prospect it searches with "[owner-finder YYYY-MM-DD] ..." (lib/owner-finder.ts).
  const { data: ownerRows, error: ownerErr } = await sb
    .from('prospects')
    .select('notes')
    .ilike('notes', `%${OWNER_TAG} ${date}]%`)
  if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 })
  const ownerNotes = (ownerRows ?? []).map((r: { notes: string | null }) => r.notes ?? '')

  // lib/reapproach.ts tags each old business it checks, and each owner row it queues, with "[reapproach YYYY-MM-DD]".
  const { data: reRows, error: reErr } = await sb
    .from('prospects')
    .select('notes, status')
    .ilike('notes', `%${REAPPROACH_TAG} ${date}]%`)
  if (reErr) return NextResponse.json({ error: reErr.message }, { status: 500 })
  const reNotes = (reRows ?? []).map((r: { notes: string | null }) => r.notes ?? '')
  const reTag = `${REAPPROACH_TAG} ${date}]`

  const added = (addedRows ?? []) as { contact_name: string | null; hunter_confidence: number | null }[]
  const supply: Supply = {
    added_today: added.length,
    added_today_named: added.filter((r) => r.contact_name?.trim()).length,
    added_today_from_hunter: added.filter((r) => (r.hunter_confidence ?? 0) >= 50).length,
    ready_to_send: readyCount ?? 0,
    owner_searched: ownerNotes.length,
    owner_found: ownerNotes.filter((n) => n.includes(`${OWNER_TAG} ${date}] found`)).length,
    reapproach_checked: reNotes.filter((n) => n.includes(`${reTag} excluded`) || n.includes(`${reTag} candidate`) || n.includes(`${reTag} no senior`)).length,
    reapproach_candidates: reNotes.filter((n) => n.includes(`${reTag} candidate`)).length,
    reapproach_queued: reNotes.filter((n) => n.includes(`${reTag} found`)).length,
  }

  const payload = { date, total_sent, total_failed, by_template, last_sent_at, supply }

  if (notify) {
    try {
      await sendNotificationEmail(total_sent, total_failed, by_template, last_sent_at, date, supply)
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
