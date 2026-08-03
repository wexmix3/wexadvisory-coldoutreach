import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { createDmarcSummaryDraft } from '@/lib/dmarc/gmail-draft'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

const client = new Anthropic()

type DmarcRow = {
  source_ip: string
  message_count: number
  disposition: string
  dkim_result: string | null
  spf_result: string | null
  header_from: string | null
  end_date: string
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function aligned(row: DmarcRow): boolean {
  return row.dkim_result === 'pass' || row.spf_result === 'pass'
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const weekStart = daysAgo(7)
  const priorWeekStart = daysAgo(14)

  const { data: thisWeekData, error: thisWeekErr } = await sb
    .from('dmarc_records')
    .select('source_ip, message_count, disposition, dkim_result, spf_result, header_from, end_date')
    .gte('end_date', weekStart)

  if (thisWeekErr) return NextResponse.json({ error: thisWeekErr.message }, { status: 500 })

  const { data: priorWeekData, error: priorWeekErr } = await sb
    .from('dmarc_records')
    .select('source_ip, message_count, dkim_result, spf_result')
    .gte('end_date', priorWeekStart)
    .lt('end_date', weekStart)

  if (priorWeekErr) return NextResponse.json({ error: priorWeekErr.message }, { status: 500 })

  const thisWeek = (thisWeekData ?? []) as DmarcRow[]
  const priorWeek = (priorWeekData ?? []) as Pick<DmarcRow, 'source_ip' | 'message_count' | 'dkim_result' | 'spf_result'>[]

  if (thisWeek.length === 0) {
    return NextResponse.json({ status: 'no_data', message: 'No DMARC records in the trailing 7 days' })
  }

  const totalMessages = thisWeek.reduce((sum, r) => sum + r.message_count, 0)
  const alignedMessages = thisWeek.filter(aligned).reduce((sum, r) => sum + r.message_count, 0)
  const passRate = totalMessages > 0 ? alignedMessages / totalMessages : 0

  const priorTotal = priorWeek.reduce((sum, r) => sum + r.message_count, 0)
  const priorAligned = priorWeek.filter((r) => r.dkim_result === 'pass' || r.spf_result === 'pass').reduce((sum, r) => sum + r.message_count, 0)
  const priorPassRate = priorTotal > 0 ? priorAligned / priorTotal : null

  const priorIps = new Set(priorWeek.map((r) => r.source_ip))
  const newIps = [...new Set(thisWeek.filter((r) => !priorIps.has(r.source_ip)).map((r) => r.source_ip))]

  const dispositionCounts: Record<string, number> = {}
  for (const r of thisWeek) {
    dispositionCounts[r.disposition] = (dispositionCounts[r.disposition] ?? 0) + r.message_count
  }

  const failingIps = [...new Set(thisWeek.filter((r) => !aligned(r)).map((r) => r.source_ip))]

  const stats = {
    total_messages: totalMessages,
    pass_rate: Math.round(passRate * 1000) / 10,
    prior_pass_rate: priorPassRate !== null ? Math.round(priorPassRate * 1000) / 10 : null,
    new_source_ips: newIps,
    failing_source_ips: failingIps,
    disposition_counts: dispositionCounts,
  }

  const prompt = `You are writing a short weekly DMARC summary email for Max Wexley about his domain wexadvisory.com.

Data for the trailing 7 days:
${JSON.stringify(stats, null, 2)}

Write a concise plain-English summary (150-250 words) covering:
1. Overall pass rate and how it compares to last week
2. Any new sending IPs that showed up this week (could be legitimate new tools, or could be spoofing — flag for his judgment, don't assume either way)
3. Any IPs consistently failing DKIM/SPF alignment
4. One clear recommendation if action is warranted, or "no action needed" if things look clean

Output raw HTML only: <p>, <ul>/<li>, <strong> tags. No markdown (no #, no **, no \`\`\` code fences), no preamble, just the summary body.`

  const message = await client.messages.create({
    model: process.env.DMARC_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawBody = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n')

  // Defensive strip: models occasionally wrap HTML output in a markdown code fence
  // despite being told not to. Never trust prose-only instructions for format (see
  // harness-engineering-standards.md item 5).
  const bodyHtml = rawBody
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const dateLabel = new Date().toISOString().slice(0, 10)
  const draftId = await createDmarcSummaryDraft({
    to: 'maxwexley@wexadvisory.com',
    subject: `DMARC Weekly Summary — ${dateLabel}`,
    bodyHtml,
  })

  return NextResponse.json({ status: 'draft_created', draftId, stats })
}
