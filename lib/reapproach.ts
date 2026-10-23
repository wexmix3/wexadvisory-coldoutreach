import { SupabaseClient } from '@supabase/supabase-js'
import { getGmailAccessToken } from '@/lib/dmarc/gmail-auth'
import { shortBusinessName } from '@/lib/business-name'
import { ApolloPerson, alexandria, domainOf, firecrawlUsage, pickSenior, seniority } from '@/lib/owner-finder'

// Re-approach: good-fit businesses that got the old anonymous sequence at a generic inbox 30+ days ago and never
// answered. Find the owner and queue them as a new prospect row, once. Approved by Max 2026-10-23 on one condition:
// never email a business that has already responded. So a business is excluded when ANY prospect at its domain has
// replied, opted out, bounced or become a lead, or when Gmail holds ANY message ever received from that domain
// (reply-scan only began 2026-09-18, so older replies exist only in Gmail).
//
// Weekdays: check up to REAPPROACH_CHECKS_PER_RUN old rows (exclusions, then free Apollo search) and tag each.
// Reveal window: the last REAPPROACH_WINDOW_DAYS days of the Firecrawl billing period, spending credits that would
// otherwise expire, minus a holdback that keeps the daily owner finder going for that final week.

const CHECKS_PER_RUN = Number(process.env.REAPPROACH_CHECKS_PER_RUN ?? 20)
const REVEALS_PER_RUN = Number(process.env.REAPPROACH_REVEALS_PER_RUN ?? 10)
const WINDOW_DAYS = Number(process.env.REAPPROACH_WINDOW_DAYS ?? 7)
const CREDIT_RESERVE = Number(process.env.OWNER_CREDIT_RESERVE ?? 60)
const HOLDBACK = Number(process.env.REAPPROACH_HOLDBACK ?? 150)
const MIN_FIT_SCORE = Number(process.env.MIN_FIT_SCORE ?? 50)
const QUIET_DAYS = 30

export const REAPPROACH_TAG = '[reapproach'
const IN_SEQUENCE = ['initial_sent', 'followup1_sent', 'followup2_sent']
const NEGATIVE_STATUS = ['replied', 'unsubscribed', 'bounced', 'audit_lead']
const GENERIC = /^(info|contact|hello|hey|hi|office|admin|support|sales|team|front|frontdesk|reception|appointments|mail|inquiries|enquiries|service|clinic|homes|booking|bookings|help)@/i
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|comcast|att|verizon)\./i

type Row = {
  id: string; business_name: string; contact_name: string | null; email: string; website: string | null
  industry: string | null; city: string | null; state: string | null; fit_score: number | null
  custom_intro: string | null; pain_signal: string | null; enriched_at: string | null; notes: string | null
  status: string; initial_sent_at: string | null; followup1_sent_at: string | null; followup2_sent_at: string | null
  replied_at: string | null; unsubscribed_at: string | null; bounced_at: string | null
}
const COLS = 'id, business_name, contact_name, email, website, industry, city, state, fit_score, custom_intro, pain_signal, enriched_at, notes, status, initial_sent_at, followup1_sent_at, followup2_sent_at, replied_at, unsubscribed_at, bounced_at'

const emailDomain = (e: string) => e.split('@')[1]?.toLowerCase() ?? ''
const domainsOf = (r: Pick<Row, 'email' | 'website'>) =>
  [...new Set([domainOf(r.website), emailDomain(r.email)])].filter((d): d is string => !!d && !FREE_MAIL.test(d))
const lastEmailAt = (r: Row) => [r.followup2_sent_at, r.followup1_sent_at, r.initial_sent_at].filter(Boolean).sort().pop() ?? null

export type ReapproachResult = {
  credits: number; period_end: string; window_open: boolean
  checked: number; excluded: number; candidates: number; no_senior: number
  revealed: number; queued: { business: string; name: string; title: string | null; email: string }[]
  notes: string[]
}

async function allRows(sb: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('prospects').select(COLS).range(from, from + 999)
    if (error) throw new Error(`Supabase read failed: ${error.message}`)
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) return rows
  }
}

// Domains Max must never re-email, and domains already in play (queued with a name, or emailed recently).
function domainSets(rows: Row[]) {
  const blocked = new Set<string>()
  const busy = new Set<string>()
  const recent = new Date(Date.now() - QUIET_DAYS * 864e5).toISOString()
  for (const r of rows) {
    const negative = r.replied_at || r.unsubscribed_at || r.bounced_at || NEGATIVE_STATUS.includes(r.status)
    if (negative) domainsOf(r).forEach(d => blocked.add(d))
    if (negative && FREE_MAIL.test(emailDomain(r.email))) blocked.add(r.email.toLowerCase())
    if ((r.status === 'queued' && r.contact_name) || (lastEmailAt(r) ?? '') > recent) domainsOf(r).forEach(d => busy.add(d))
  }
  return { blocked, busy }
}

// Every cold-email subject carries the business name ("question about Royal Vet"), so a reply sent from a personal
// address ("Re: question about Royal Vet") is caught by subject even though its sender domain is unknown.
async function gmailHasMailFrom(token: string, r: Row): Promise<string | null> {
  const queries = domainsOf(r).map(d => `from:${d}`)
  if (FREE_MAIL.test(emailDomain(r.email))) queries.push(`from:${r.email.toLowerCase()}`)
  for (const name of new Set([r.business_name, shortBusinessName(r.business_name)])) {
    const phrase = name.replace(/["\\]/g, ' ').trim()
    if (phrase.length >= 4) queries.push(`subject:"${phrase}"`)
  }
  for (const t of queries) {
    const q = encodeURIComponent(`${t} -in:sent -from:me`)
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Gmail search failed for ${t}: ${res.status}`)
    if (((await res.json()) as { messages?: unknown[] }).messages?.length) return t
  }
  return null
}

// Exposed for scripts/reapproach-exclusion-check.local.ts: proves known responders are excluded.
export async function exclusionFor(sb: SupabaseClient, emails: string[]): Promise<Record<string, string | null>> {
  const rows = await allRows(sb)
  const { blocked, busy } = domainSets(rows)
  const token = await getGmailAccessToken()
  const out: Record<string, string | null> = {}
  for (const e of emails) {
    const r = rows.find(x => x.email.toLowerCase() === e.toLowerCase())
    if (!r) { out[e] = 'not in prospects'; continue }
    const d = domainsOf(r).find(x => blocked.has(x)) ?? (blocked.has(r.email.toLowerCase()) ? r.email : null)
    out[e] = d ? `blocked: ${d}` : domainsOf(r).find(x => busy.has(x)) ? 'busy' : (await gmailHasMailFrom(token, r)) ? 'gmail' : null
  }
  return out
}

export async function runReapproach(sb: SupabaseClient, opts: { dry?: boolean } = {}): Promise<ReapproachResult> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured')
  const today = new Date().toISOString().slice(0, 10)
  const { remaining, periodEnd } = await firecrawlUsage(key)
  const windowOpen = Date.now() >= periodEnd.getTime() - WINDOW_DAYS * 864e5
  const result: ReapproachResult = {
    credits: remaining, period_end: periodEnd.toISOString().slice(0, 10), window_open: windowOpen,
    checked: 0, excluded: 0, candidates: 0, no_senior: 0, revealed: 0, queued: [], notes: [],
  }

  const rows = await allRows(sb)
  const { blocked, busy } = domainSets(rows)
  const quietSince = new Date(Date.now() - QUIET_DAYS * 864e5).toISOString()
  const token = await getGmailAccessToken()

  const tag = async (r: Row, text: string) => {
    if (opts.dry) return
    const line = `${REAPPROACH_TAG} ${today}] ${text}`
    r.notes = r.notes ? `${r.notes}\n${line}` : line
    const { error } = await sb.from('prospects').update({ notes: r.notes }).eq('id', r.id)
    if (error) throw new Error(`Supabase update failed for ${r.business_name}: ${error.message}`)
  }
  const exclusion = async (r: Row): Promise<string | null> => {
    const d = domainsOf(r).find(x => blocked.has(x)) ?? (blocked.has(r.email.toLowerCase()) ? r.email : null)
    if (d) return `someone at ${d} already replied, opted out or bounced`
    const b = domainsOf(r).find(x => busy.has(x))
    if (b) return `${b} is already queued or was emailed in the last ${QUIET_DAYS} days`
    const g = await gmailHasMailFrom(token, r)
    if (g) return `Gmail has mail from ${g}`
    return null
  }

  // 1. Check: untagged old rows, best fit first.
  const pool = rows
    .filter(r => IN_SEQUENCE.includes(r.status) && !r.replied_at && !r.unsubscribed_at && !r.bounced_at)
    .filter(r => (r.fit_score ?? 0) >= MIN_FIT_SCORE && domainOf(r.website))
    .filter(r => !r.contact_name || GENERIC.test(r.email))
    .filter(r => (lastEmailAt(r) ?? '') < quietSince && !(r.notes ?? '').includes(REAPPROACH_TAG))
    .sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    .slice(0, CHECKS_PER_RUN)

  const toSearch: Row[] = []
  for (const r of pool) {
    result.checked++
    const why = await exclusion(r)
    if (why) { result.excluded++; await tag(r, `excluded: ${why}`); continue }
    toSearch.push(r)
  }
  for (let i = 0; i < toSearch.length; i += 10) {
    const chunk = toSearch.slice(i, i + 10)
    const found = await alexandria(key, chunk.map(r => ({
      provider: 'apollo', capability: 'people/search',
      options: { q_organization_domains_list: [domainOf(r.website)], per_page: 25 },
    })))
    for (const [j, r] of chunk.entries()) {
      const s = found[j]
      if (s.error) { await tag(r, `Apollo search error ${s.error.code}`); continue }
      const best = pickSenior((s.data?.people as ApolloPerson[]) ?? [], r.business_name, domainOf(r.website)!)
      if (!best) { result.no_senior++; await tag(r, 'no senior contact with an email in Apollo'); continue }
      result.candidates++
      await tag(r, `candidate apollo:${best.id} ${best.first_name ?? ''} (${(best.title ?? '').replace(/[()]/g, '')})`)
    }
  }

  // 2. Reveal: only inside the window, with credits that would otherwise expire.
  if (!windowOpen) return result
  let budget = Math.min(REVEALS_PER_RUN, Math.floor((remaining - CREDIT_RESERVE - HOLDBACK) / 30))
  if (budget <= 0) { result.notes.push(`window open but credits ${remaining} leave nothing above reserve + holdback`); return result }

  const CANDIDATE = /\[reapproach [\d-]+\] candidate apollo:(\S+) (.*) \((.*)\)$/m
  const ready = rows
    .filter(r => IN_SEQUENCE.includes(r.status) && CANDIDATE.test(r.notes ?? '') && !/\[reapproach [\d-]+\] (revealed|no verified|skipped)/.test(r.notes ?? ''))
    .map(r => { const m = (r.notes ?? '').match(CANDIDATE)!; return { r, id: m[1], first: m[2], title: m[3] } })
    .sort((a, b) => (seniority(a.title) ?? 9) - (seniority(b.title) ?? 9) || (b.r.fit_score ?? 0) - (a.r.fit_score ?? 0))

  for (const c of ready) {
    if (budget <= 0) break
    // Re-check right before spending: a reply or opt-out may have arrived since the candidate was tagged.
    const why = await exclusion(c.r)
    if (why) { await tag(c.r, `skipped at reveal: ${why}`); continue }
    if (opts.dry) { result.queued.push({ business: c.r.business_name, name: `${c.first} (masked)`, title: c.title, email: '(dry run)' }); budget--; continue }

    const [m] = await alexandria(key, [{ provider: 'apollo', capability: 'people/match', options: { id: c.id } }])
    budget--
    result.revealed++
    if (m.error) throw new Error(`Apollo match failed for ${c.r.business_name}: ${m.error.code} ${m.error.message}`)
    const person = (m.data?.person ?? m.data) as { name?: string; title?: string; email?: string; email_status?: string } | undefined
    const email = person?.email?.toLowerCase()
    if (!person?.name || !email || person.email_status !== 'verified') {
      await tag(c.r, `no verified email from Apollo match (${person?.email_status ?? 'none'})`)
      continue
    }
    if (blocked.has(emailDomain(email)) || rows.some(x => x.email.toLowerCase() === email)) {
      await tag(c.r, `skipped at reveal: ${email} is blocked or already a prospect`)
      continue
    }
    const site = domainOf(c.r.website)!
    const { data: inserted, error: insErr } = await sb.from('prospects').insert({
      business_name: c.r.business_name,
      contact_name: person.name,
      email,
      website: c.r.website,
      industry: c.r.industry,
      city: c.r.city,
      state: c.r.state,
      google_place_id: null, // unique per business; the original row keeps it
      status: 'queued',
      fit_score: c.r.fit_score,
      custom_intro: c.r.custom_intro,
      pain_signal: c.r.pain_signal,
      enrichment_status: 'done',
      enriched_at: c.r.enriched_at,
      email_verification_status: emailDomain(email) === site || emailDomain(email) === emailDomain(c.r.email) ? 'deliverable' : 'risky',
      email_verified_at: new Date().toISOString(),
      notes: `${REAPPROACH_TAG} ${today}] found ${person.name} (${person.title ?? c.title}) via Apollo, verified; ` +
        `re-approach of ${c.r.id} (old sequence to ${c.r.email} ended ${lastEmailAt(c.r)?.slice(0, 10)}, no reply)`,
    }).select('id').single()
    if (insErr) throw new Error(`Insert failed for ${c.r.business_name}: ${insErr.message}`)
    await tag(c.r, `revealed -> new prospect ${inserted.id} (${person.name})`)
    blocked.add(site) // one re-approach per business per run
    result.queued.push({ business: c.r.business_name, name: person.name, title: person.title ?? c.title, email })
  }
  return result
}
