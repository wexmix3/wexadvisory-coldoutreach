import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { createDmarcSummaryDraft } from '@/lib/dmarc/gmail-draft'
import { groupSourceIps, senderOrigin, type SenderOrigin } from '@/lib/dmarc/source-group'

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
  const originOf = (r: DmarcRow) => senderOrigin(r.header_from, serviceOf(r))
  // google.com is our own sender on the root domain and a forwarder on the
  // outreach subdomain, so a service is only meaningful together with its origin.
  const senderOf = (r: DmarcRow) => `${originOf(r)}|${serviceOf(r)}`
  const baselineSenders = new Set(baseline.map(senderOf))

  const totalMessages = sumMessages(thisWeek)
  const priorTotal = sumMessages(priorWeek)

  const byOrigin = (origin: SenderOrigin) => {
    const mine = thisWeek.filter((r) => originOf(r) === origin)
    const prior = priorWeek.filter((r) => originOf(r) === origin)
    const messages = sumMessages(mine)
    const passing = sumMessages(mine, aligned)
    return {
      messages,
      passing_messages: passing,
      failing_messages: messages - passing,
      pass_rate: pct(passing, messages),
      prior_pass_rate: pct(sumMessages(prior, aligned), sumMessages(prior)),
    }
  }
  const own = byOrigin('own')
  const thirdParty = byOrigin('third_party')

  const reporters = [...new Set(thisWeek.map((r) => r.org_name ?? 'unknown'))]
  const passRateByReporter = Object.fromEntries(
    reporters.map((org) => {
      const mine = thisWeek.filter((r) => (r.org_name ?? 'unknown') === org)
      return [org, { messages: sumMessages(mine), pass_rate: pct(sumMessages(mine, aligned), sumMessages(mine)) }]
    })
  )

  const services = [...new Set(thisWeek.map(senderOf))].map((sender) => {
    const mine = thisWeek.filter((r) => senderOf(r) === sender)
    const failing = sumMessages(mine, (r) => !aligned(r))
    // Passes DMARC but only via SPF: DKIM is broken for this sender, and SPF
    // breaks on any forward. This is how a missing Workspace DKIM record hid
    // behind a healthy pass rate (found 2026-09-21).
    const spfOnly = sumMessages(mine, (r) => r.spf_result === 'pass' && r.dkim_result !== 'pass')
    return {
      service: serviceOf(mine[0]),
      origin: originOf(mine[0]),
      sample_hostname: groups.get(mine[0].source_ip)!.sample_hostname,
      header_from: [...new Set(mine.map((r) => r.header_from ?? 'unknown'))],
      distinct_ips: new Set(mine.map((r) => r.source_ip)).size,
      messages: sumMessages(mine),
      failing_messages: failing,
      spf_only_pass_messages: spfOnly,
      new_this_week: !baselineSenders.has(sender),
    }
  })
  services.sort((a, b) => b.messages - a.messages)

  const dispositionCounts: Record<string, number> = {}
  for (const r of thisWeek) {
    dispositionCounts[r.disposition] = (dispositionCounts[r.disposition] ?? 0) + r.message_count
  }

  const isOwn = (s: { origin: SenderOrigin }) => s.origin === 'own'
  const stats = {
    total_messages: totalMessages,
    pass_rate: pct(sumMessages(thisWeek, aligned), totalMessages),
    prior_pass_rate: pct(sumMessages(priorWeek, aligned), priorTotal),
    sent_by_own_services: own,
    resent_by_third_parties: thirdParty,
    pass_rate_by_reporter: passRateByReporter,
    sending_services: services,
    new_services: services.filter((s) => s.new_this_week).map((s) => s.service),
    failing_services: services.filter((s) => s.failing_messages > 0).map((s) => s.service),
    failing_own_services: services.filter((s) => isOwn(s) && s.failing_messages > 0).map((s) => s.service),
    spf_only_services: services.filter((s) => isOwn(s) && s.spf_only_pass_messages > 0).map((s) => s.service),
    disposition_counts: dispositionCounts,
  }

  // The two figures Max reads first are built here, not by the model, so they
  // cannot be misquoted or blended back into one number.
  const rateLine = (label: string, g: typeof own) =>
    g.messages === 0
      ? `${label}: none this week`
      : `${label}: ${g.pass_rate}% passed (${g.passing_messages} of ${g.messages})` +
        (g.prior_pass_rate === null ? '' : `, ${g.prior_pass_rate}% the week before`)
  const headlineHtml =
    `<p><strong>${rateLine('Sent by your own services', own)}</strong><br>` +
    `${rateLine('Re-sent by third parties (forwarders, security scanners)', thirdParty)}</p>`

  const prompt = `You are writing a short weekly DMARC summary email for Max Wexley about his domain wexadvisory.com.

Data for the trailing 7 days. Source IPs are grouped into sending services by reverse DNS. Each service has an origin: "own" is a service Max sends through; "third_party" is someone else re-sending his mail (a recipient's auto-forward or security scanner, whose DMARC failures he cannot fix) or spoofing it. "new_this_week" means that service sent nothing in the prior ${BASELINE_DAYS} days:
${JSON.stringify(stats, null, 2)}

The email already opens with the two pass-rate figures (own services, third parties), so do not restate them. Write a concise plain-English summary (120-200 words) covering:
1. Any own service with failing messages, by hostname. This is the only kind of failure that means his setup is broken.
2. Third-party services: which ones re-sent his mail and how many of those failed. Flag any that are new this week for his judgment, since a new one could be a forwarder, a tool he just added, or spoofing.
3. Any own service passing only via SPF with DKIM failing: it passes today but will fail DMARC whenever the mail is forwarded.
4. One clear recommendation if action is warranted, or "no action needed" if things look clean.

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
  const summaryHtml = rawBody
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  if (!summaryHtml) throw new Error('DMARC weekly summary: model returned an empty body')
  const bodyHtml = headlineHtml + summaryHtml

  const dateLabel = new Date().toISOString().slice(0, 10)
  const draftId = await createDmarcSummaryDraft({
    to: 'maxwexley@wexadvisory.com',
    subject: `DMARC Weekly Summary — ${dateLabel}`,
    bodyHtml,
  })

  return NextResponse.json({ status: 'draft_created', draftId, stats })
}
