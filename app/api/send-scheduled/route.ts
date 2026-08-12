import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { renderTemplate } from '@/lib/tokens'
import { Prospect } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

const MAX_INITIAL_PER_BATCH = Number(process.env.MAX_INITIAL_PER_BATCH ?? 10)
const MIN_FIT_SCORE = Number(process.env.MIN_FIT_SCORE ?? 50)
const MAX_FOLLOWUP_PER_BATCH = Number(process.env.MAX_FOLLOWUP_PER_BATCH ?? 10)
const FROM_NAME = 'Max Wexley'
const FROM_EMAIL = 'max@send.wexadvisory.com'
const REPLY_TO = 'maxwexley@wexadvisory.com'
const FOLLOWUP1_DAYS = 5
const FOLLOWUP2_DAYS = 7

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

type QueueItem = { prospect: Prospect; send_type: 'initial' | 'followup1' | 'followup2' }

async function buildQueue(): Promise<QueueItem[]> {
  const sb = getSupabaseAdmin()
  const [{ data: initial }, { data: f1 }, { data: f2 }] = await Promise.all([
    sb.from('prospects').select('*').eq('status', 'queued').not('fit_score', 'is', null).gte('fit_score', MIN_FIT_SCORE).order('fit_score', { ascending: false, nullsFirst: false }).limit(500),
    // Order by sent_at ASC so prospects waiting the longest go first
    sb.from('prospects').select('*').eq('status', 'initial_sent').lte('initial_sent_at', daysAgo(FOLLOWUP1_DAYS)).order('initial_sent_at', { ascending: true }).limit(500),
    sb.from('prospects').select('*').eq('status', 'followup1_sent').lte('followup1_sent_at', daysAgo(FOLLOWUP2_DAYS)).order('followup1_sent_at', { ascending: true }).limit(500),
  ])

  // f2 before f1, both sorted oldest-first within their group
  const followups: QueueItem[] = [
    ...(f2 ?? []).map(p => ({ prospect: p, send_type: 'followup2' as const })),
    ...(f1 ?? []).map(p => ({ prospect: p, send_type: 'followup1' as const })),
  ]

  const followupBatch = followups.slice(0, MAX_FOLLOWUP_PER_BATCH)
  const initialBatch: QueueItem[] = (initial ?? []).slice(0, MAX_INITIAL_PER_BATCH).map(p => ({ prospect: p, send_type: 'initial' as const }))

  return [...followupBatch, ...initialBatch]
}

async function sendEmail(to: string, subject: string, html: string, unsubUrl: string): Promise<string | null> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('BREVO_API_KEY not configured')
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      replyTo: { email: REPLY_TO },
      subject,
      htmlContent: html,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Brevo error')
  return data.messageId ?? null
}

const RESUME_DATE = new Date('2026-07-22T00:00:00Z')

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (new Date() < RESUME_DATE) {
    return NextResponse.json({ sent: 0, skipped: true, message: 'Paused until 2026-07-22 for Gmail spam-reputation reset -- see state/worksheets/outreach-tool-deliverability-2026-07-15.md' })
  }

  const sb = getSupabaseAdmin()
  const queue = await buildQueue()
  if (queue.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: 'Nothing to send' })
  }

  const { data: templates, error: tErr } = await sb.from('templates').select('*')
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  const templatesByType: Record<string, typeof templates> = {}
  for (const t of templates) {
    (templatesByType[t.type] ??= []).push(t)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const results = { sent: 0, failed: 0, errors: [] as string[] }

  for (const { prospect, send_type } of queue) {
    const variants = templatesByType[send_type] ?? []
    if (variants.length === 0) { results.failed++; continue }
    const template = variants[Math.floor(Math.random() * variants.length)]

    const unsubUrl = `${appUrl}/api/unsubscribe?id=${prospect.id}`
    const subject = renderTemplate(template.subject, prospect, unsubUrl)
    const html = renderTemplate(template.body_html, prospect, unsubUrl)

    try {
      const messageId = await sendEmail(prospect.email, subject, html, unsubUrl)
      const now = new Date().toISOString()
      const statusMap: Record<string, { status: string; field: string }> = {
        initial: { status: 'initial_sent', field: 'initial_sent_at' },
        followup1: { status: 'followup1_sent', field: 'followup1_sent_at' },
        followup2: { status: 'followup2_sent', field: 'followup2_sent_at' },
      }
      const { status, field } = statusMap[send_type]
      await Promise.all([
        sb.from('email_log').insert({ prospect_id: prospect.id, template_type: send_type, variant: template.variant, subject, body_html: html, resend_id: messageId, status: 'sent' }),
        sb.from('prospects').update({ status, [field]: now }).eq('id', prospect.id),
      ])
      results.sent++
    } catch (err) {
      results.failed++
      results.errors.push(`${prospect.email}: ${err instanceof Error ? err.message : 'Unknown'}`)
      await sb.from('email_log').insert({ prospect_id: prospect.id, template_type: send_type, variant: template.variant, subject: renderTemplate(template.subject, prospect, ''), body_html: '', status: 'failed' })
    }

    await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json(results)
}
