import { SupabaseClient } from '@supabase/supabase-js'

// Finds a named decision maker for queued prospects that have no contact_name, using Apollo through Firecrawl's
// Alexandria API. Apollo people/search is free; people/match reveals the name + email at 30 Firecrawl credits per
// matched person (unmatched free). Proven 2026-10-23 on 25 hard leftovers: 5/5 reveals verified, all owner-level.
// The free plan errors instead of charging when credits run out, and the run stops at OWNER_CREDIT_RESERVE first.

const FIRECRAWL = 'https://api.firecrawl.dev'
const SEARCHES_PER_RUN = Number(process.env.OWNER_SEARCHES_PER_RUN ?? 10)
const REVEALS_PER_RUN = Number(process.env.OWNER_REVEALS_PER_RUN ?? 2)
const CREDIT_RESERVE = Number(process.env.OWNER_CREDIT_RESERVE ?? 60)
const MIN_FIT_SCORE = Number(process.env.MIN_FIT_SCORE ?? 50)

// Every note this step writes starts with this tag, so a prospect is searched once and the daily status email
// and the weekly reply check can find the step's work.
export const OWNER_TAG = '[owner-finder'

// Tier 0 and 1 only: someone who can say yes to a paid engagement. "Director of Events" and "Associate Vice
// President" came back in the trial and were judged not worth 30 credits.
const SENIOR = [
  /\b(owner|founder|co-founder|founding|proprietor|president|ceo|chief executive|principal|managing partner|managing member)\b/i,
  /\b(partner|coo|chief operating|managing director|general manager|broker)\b/i,
]
const JUNIOR = /\b(associate|assistant|intern|junior|events?)\b/i

export function seniority(title: string | null | undefined): number | null {
  if (!title || JUNIOR.test(title)) return null
  const i = SENIOR.findIndex(r => r.test(title))
  return i === -1 ? null : i
}

// Words too common to prove two names are the same business.
const STOPWORDS = new Set([
  'group', 'health', 'center', 'centre', 'clinic', 'hospital', 'animal', 'medical', 'dental', 'firm', 'office',
  'offices', 'realty', 'real', 'estate', 'coworking', 'workspace', 'fitness', 'studio', 'services', 'consulting',
  'partners', 'associates', 'company', 'management', 'property', 'properties', 'insurance', 'financial', 'wealth',
  'advisors', 'engineering', 'engineers', 'construction', 'wellness', 'team', 'agency', 'solutions', 'llc', 'inc',
  'corp', 'with', 'from', 'that', 'this', 'your',
])
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !STOPWORDS.has(t))

// Apollo's organization name has to share a distinctive word with the business name or website domain. Catches
// a chain parent ("Innovetive Petcare" for Doral Centre Animal Hospital) being revealed as the local owner.
export function sameBusiness(orgName: string | null | undefined, businessName: string, domain: string): boolean {
  if (!orgName) return false
  const haystack = `${businessName} ${domain}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const squashed = haystack.replace(/\s+/g, '')
  return tokens(orgName).some(t => haystack.split(' ').includes(t) || squashed.includes(t))
}

export const domainOf = (url: string | null | undefined): string | null => {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}

type ApolloPerson = {
  id: string
  first_name?: string
  title?: string | null
  has_email?: boolean
  organization?: { name?: string }
}

export function pickSenior(people: ApolloPerson[], businessName: string, domain: string): ApolloPerson | null {
  return people
    .filter(p => p.has_email && seniority(p.title) !== null && sameBusiness(p.organization?.name, businessName, domain))
    .sort((a, b) => (seniority(a.title) ?? 9) - (seniority(b.title) ?? 9))[0] ?? null
}

type AlexandriaResult = { error?: { code: string; message: string }; data?: Record<string, unknown> }

async function alexandria(key: string, calls: object[]): Promise<AlexandriaResult[]> {
  const res = await fetch(`${FIRECRAWL}/v2/scrape`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alexandria: calls }),
  })
  const text = await res.text()
  let json: { success?: boolean; data?: { alexandria?: AlexandriaResult[] } }
  try { json = JSON.parse(text) } catch { throw new Error(`Firecrawl HTTP ${res.status}: ${text.slice(0, 300)}`) }
  if (!res.ok || !json.success || !json.data?.alexandria) throw new Error(`Firecrawl HTTP ${res.status}: ${text.slice(0, 300)}`)
  return json.data.alexandria
}

export async function firecrawlCredits(key: string): Promise<number> {
  const res = await fetch(`${FIRECRAWL}/v2/team/credit-usage`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Firecrawl credit check HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json() as { data?: { remainingCredits?: number } }
  if (typeof json.data?.remainingCredits !== 'number') throw new Error('Firecrawl credit check returned no remainingCredits')
  return json.data.remainingCredits
}

type Candidate = { id: string; business_name: string; email: string; website: string; notes: string | null }

export type OwnerFinderResult = {
  credits_start: number
  searched: number
  revealed: number
  found: { business: string; name: string; title: string | null; email: string; status: string }[]
  misses: { business: string; reason: string }[]
  skipped?: string
}

export async function runOwnerFinder(sb: SupabaseClient, opts: { dry?: boolean } = {}): Promise<OwnerFinderResult> {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) throw new Error('FIRECRAWL_API_KEY not configured')
  const today = new Date().toISOString().slice(0, 10)

  const credits = await firecrawlCredits(key)
  const result: OwnerFinderResult = { credits_start: credits, searched: 0, revealed: 0, found: [], misses: [] }
  if (credits < CREDIT_RESERVE) return { ...result, skipped: `Firecrawl credits ${credits} below reserve ${CREDIT_RESERVE}` }
  let revealBudget = Math.min(REVEALS_PER_RUN, Math.floor((credits - CREDIT_RESERVE) / 30))

  const { data, error } = await sb
    .from('prospects')
    .select('id, business_name, email, website, notes')
    .eq('status', 'queued')
    .is('contact_name', null)
    .gte('fit_score', MIN_FIT_SCORE)
    .not('website', 'is', null)
    .order('fit_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`Supabase read failed: ${error.message}`)
  const candidates = ((data ?? []) as Candidate[])
    .filter(c => !(c.notes ?? '').includes(OWNER_TAG) && domainOf(c.website))
    .slice(0, SEARCHES_PER_RUN)
  if (!candidates.length) return { ...result, skipped: 'No unsearched queued prospects without a name' }

  const note = async (c: Candidate, text: string, extra: Record<string, unknown> = {}) => {
    if (opts.dry) return
    const line = `${OWNER_TAG} ${today}] ${text}`
    const { error: upErr } = await sb.from('prospects')
      .update({ ...extra, notes: c.notes ? `${c.notes}\n${line}` : line })
      .eq('id', c.id).eq('status', 'queued').is('contact_name', null)
    if (upErr) throw new Error(`Supabase update failed for ${c.business_name}: ${upErr.message}`)
  }

  const searches = await alexandria(key, candidates.map(c => ({
    provider: 'apollo', capability: 'people/search',
    options: { q_organization_domains_list: [domainOf(c.website)], per_page: 25 },
  })))
  result.searched = candidates.length

  // A search error for one prospect is noted on that row (so it is not retried daily and cannot block every run)
  // and the rest continue; only an error on every search fails the run.
  const failedSearches = searches.filter(s => s.error)
  if (failedSearches.length === candidates.length) {
    throw new Error(`Every Apollo search failed: ${failedSearches[0].error!.code} ${failedSearches[0].error!.message}`)
  }

  for (const [i, c] of candidates.entries()) {
    const domain = domainOf(c.website)!
    const s = searches[i]
    if (s.error) {
      result.misses.push({ business: c.business_name, reason: `Apollo search error: ${s.error.code}` })
      await note(c, `Apollo search error ${s.error.code}: ${s.error.message.slice(0, 120)}`)
      continue
    }
    const best = pickSenior((s.data?.people as ApolloPerson[]) ?? [], c.business_name, domain)
    if (!best) {
      result.misses.push({ business: c.business_name, reason: 'no senior contact with an email' })
      await note(c, 'no senior contact with an email in Apollo')
      continue
    }

    // One company, one conversation: skip if anyone at this domain has already had a first email.
    const inboxDomain = c.email.split('@')[1]?.toLowerCase() ?? domain
    const { data: contacted, error: cErr } = await sb.from('prospects')
      .select('id').neq('id', c.id).not('initial_sent_at', 'is', null)
      .or(`email.ilike.%@${domain},email.ilike.%@${inboxDomain}`).limit(1)
    if (cErr) throw new Error(`Supabase read failed: ${cErr.message}`)
    if (contacted?.length) {
      result.misses.push({ business: c.business_name, reason: 'company already contacted' })
      await note(c, `skipped ${best.first_name} (${best.title}): someone at ${domain} already had a first email`)
      continue
    }

    if (revealBudget <= 0) {
      result.misses.push({ business: c.business_name, reason: 'reveal budget used, retried next run' })
      continue // no note: searched again on a later run
    }
    if (opts.dry) {
      result.found.push({ business: c.business_name, name: `${best.first_name} (masked)`, title: best.title ?? null, email: '(not revealed: dry run)', status: 'dry' })
      revealBudget--
      continue
    }

    const [m] = await alexandria(key, [{ provider: 'apollo', capability: 'people/match', options: { id: best.id } }])
    revealBudget--
    result.revealed++
    if (m.error) throw new Error(`Apollo match failed for ${c.business_name}: ${m.error.code} ${m.error.message}`)
    const person = (m.data?.person ?? m.data) as { name?: string; title?: string; email?: string; email_status?: string } | undefined
    const email = person?.email?.toLowerCase()
    if (!person?.name || !email || person.email_status !== 'verified') {
      result.misses.push({ business: c.business_name, reason: `match returned no verified email (${person?.email_status ?? 'none'})` })
      await note(c, `Apollo match for ${best.first_name} gave no verified email (${person?.email_status ?? 'none'})`)
      continue
    }
    const { data: dup, error: dErr } = await sb.from('prospects').select('id').eq('email', email).limit(1)
    if (dErr) throw new Error(`Supabase read failed: ${dErr.message}`)
    if (dup?.length) {
      result.misses.push({ business: c.business_name, reason: `${email} already belongs to another prospect` })
      await note(c, `${person.name}'s ${email} already belongs to another prospect`)
      continue
    }
    const emailDomain = email.split('@')[1]
    const status = emailDomain === domain || emailDomain === inboxDomain ? 'deliverable' : 'risky'
    await note(c, `found ${person.name} (${person.title ?? best.title}) via Apollo, ${person.email_status}; was ${c.email}`, {
      contact_name: person.name,
      email,
      email_verification_status: status,
      email_verified_at: new Date().toISOString(),
    })
    result.found.push({ business: c.business_name, name: person.name, title: person.title ?? best.title ?? null, email, status })
  }
  return result
}
