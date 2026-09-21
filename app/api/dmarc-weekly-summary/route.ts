import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { createDmarcSummaryDraft } from '@/lib/dmarc/gmail-draft'
import { groupSourceIps } from '@/lib/dmarc/source-group'

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
  org_name: string | null
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

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

function sumMessages(rows: DmarcRow[], filter: (r: DmarcRow) => boolean = () => true): number {
  return rows.filter(filter).reduce((sum, r) => sum + r.message_count, 0)
}

// A sending service counts as "new" only if it sent nothing in the 4 weeks
// before this one. One prior week was too short a baseline once senders are
// grouped: low-volume services (Resend alerts, forwarders) skip weeks.
const BASELINE_DAYS = 28

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const weekStart = daysAgo(7)
  const priorWeekStart = daysAgo(14)

  const { data, error } = await sb
    .from('dmarc_records')
    .select('source_ip, message_count, disposition, dkim_result, spf_result, header_from, org_name, end_date')
    .gte('end_date', daysAgo(7 + BASELINE_DAYS))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as DmarcRow[]
  const thisWeek = rows.filter((r) => r.end_date >= weekStart)
  const baseline = rows.filter((r) => r.end_date < weekStart)
  const priorWeek = baseline.filter((r) => r.end_date >= priorWeekStart)

  if (thisWeek.length === 0) {
    return NextResponse.json({ status: 'no_data', message: 'No DMARC records in the trailing 7 days' })
  }

  const groups = await groupSourceIps(rows.map((r) => r.source_ip))
  const serviceOf = (r: DmarcRow) => groups.get(r.source_ip)!.key
  const baselineServices = new Set(baseline.map(serviceOf))

  const totalMessages = sumMessages(thisWeek)
  const priorTotal = sumMessages(priorWeek)

  const reporters = [...new Set(thisWeek.map((r) => r.org_name ?? 'unknown'))]
  const passRateByReporter = Object.fromEntries(
    reporters.map((org) => {
      const mine = thisWeek.filter((r) => (r.org_name ?? 'unknown') === org)
      return [org, { messages: sumMessages(mine), pass_rate: pct(sumMessages(mine, aligned), sumMessages(mine)) }]
    })
  )

  const services = [...new Set(thisWeek.map(serviceOf))].map((service) => {
    const mine = thisWeek.filter((r) => serviceOf(r) === service)
    const failing = sumMessages(mine, (r) => !aligned(r))
    // Passes DMARC but only via SPF: DKIM is broken for this sender, and SPF
    // breaks on any forward. This is how a missing Workspace DKIM record hid
    // behind a healthy pass rate (found 2026-09-21).
    const spfOnly = sumMessages(mine, (r) => r.spf_result === 'pass' && r.dkim_result !== 'pass')
    return {
      service,
      sample_hostname: groups.get(mine[0].source_ip)!.sample_hostname,
      header_from: [...new Set(mine.map((r) => r.header_from ?? 'unknown'))],
      distinct_ips: new Set(mine.map((r) => r.source_ip)).size,
      messages: sumMessages(mine),
      failing_messages: failing,
      spf_only_pass_messages: spfOnly,
      new_this_week: !baselineServices.has(service),
    }
  })
  services.sort((a, b) => b.messages - a.messages)

  const dispositionCounts: Record<string, number> = {}
  for (const r of thisWeek) {
    dispositionCounts[r.disposition] = (dispositionCounts[r.disposition] ?? 0) + r.message_count
  }

  const stats = {
    total_messages: totalMessages,
    pass_rate: pct(sumMessages(thisWeek, aligned), totalMessages),
    prior_pass_rate: pct(sumMessages(priorWeek, aligned), priorTotal),
    pass_rate_by_reporter: passRateByReporter,
    sending_services: services,
    new_services: services.filter((s) => s.new_this_week).map((s) => s.service),
    failing_services: services.filter((s) => s.failing_messages > 0).map((s) => s.service),
    spf_only_services: services.filter((s) => s.spf_only_pass_messages > 0).map((s) => s.service),
    disposition_counts: dispositionCounts,
  }

  const prompt = `You are writing a short weekly DMARC summary email for Max Wexley about his domain wexadvisory.com.

Data for the trailing 7 days. Source IPs are grouped into sending services by reverse DNS; "new_this_week" means the service sent nothing in the prior ${BASELINE_DAYS} days:
${JSON.stringify(stats, null, 2)}

Write a concise plain-English summary (150-250 words) covering:
1. Overall pass rate and how it compares to last week
2. Any new sending services this week (could be legitimate new tools, or could be spoofing — flag for his judgment, don't assume either way)
3. Any services with failing messages, identified by their hostname
4. Any services passing only via SPF with DKIM failing: they pass today but will fail DMARC whenever the mail is forwarded
5. One clear recommendation if action is warranted, or "no action needed" if things look clean

Output raw HTML only: <p>, <ul>/<li>, <strong> tags. No markdown (no #, no **, no \`\`\` code fences), no heading or date (the subject line has them), no preamble, just the summary body.`

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
