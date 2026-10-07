import Anthropic from '@anthropic-ai/sdk'
import { fetchHtml } from './scraper'
import { enrichProspect, nameFitsEmail, type EnrichmentResult } from './enrichment'

export interface DiscoveredProspect {
  business_name: string
  contact_name: string | null
  email: string
  website: string | null
  industry: string
  city: string
  state: string
  google_place_id: string
  hunter_confidence: number
  existing_status?: string
  // Scored during discovery, before the email lookup, so the enrich cron does
  // not pay to score the same business a second time.
  fit_score: number
  custom_intro: string
  pain_signal: string
}

// Candidates where Hunter found no named contact (not a quota outage — a genuine
// "nothing here"). Previously dropped silently with zero record they existed.
// Not inserted into `prospects` (email is required there) — surfaced for visibility
// so they can be routed to a non-email channel (e.g. LinkedIn) instead of vanishing.
export interface UnresolvedCandidate {
  business_name: string
  website: string
  industry: string
  city: string
  state: string
}

interface NewPlace {
  id: string
  displayName?: { text: string }
  websiteUri?: string
  formattedAddress?: string
}

interface FoundEmail {
  value: string
  first_name?: string
  last_name?: string
  confidence: number
}

const SKIP_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'example.com', 'wordpress',
  'sentry', 'wixpress', 'squarespace', 'godaddy', 'hosting', 'support@', 'hello@wix',
  'privacy@', 'legal@', 'abuse@', 'postmaster@',
]

// Domains that are never real prospect contacts
const BLOCKED_DOMAINS = new Set([
  'domain.com', 'email.com', 'mysite.com', 'mywebsite.com', 'yoursite.com',
  'test.com', 'placeholder.com', 'sample.com',
  'yelp.com', 'instagram.com', 'facebook.com', 'twitter.com', 'tiktok.com',
  'linkedin.com', 'google.com', 'yahoo.com', 'hotmail.com',
  'ir.com',  // investor relations redirects
])

const IMAGE_EXTS = /\.(webp|png|jpe?g|gif|svg|ico|bmp|tiff?)$/i
const VALID_EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}$/

function sanitizeEmail(raw: string): string {
  try { raw = decodeURIComponent(raw) } catch { /* ignore malformed encoding */ }
  return raw.replace(/[\\'"<>\s;,]+$/g, '').toLowerCase().trim()
}

// HTML entity artifacts from bad scrapes: u003e, u003c, u0026, etc.
const HTML_ENTITY_RE = /u00[0-9a-f]{2}/i

export function isValidEmail(email: string): boolean {
  if (!VALID_EMAIL_RE.test(email)) return false
  const [local, domain] = [email.split('@')[0] ?? '', email.split('@')[1] ?? '']
  if (IMAGE_EXTS.test(domain)) return false
  const tld = domain.split('.').pop() ?? ''
  if (IMAGE_EXTS.test('.' + tld)) return false
  if (SKIP_PATTERNS.some(p => email.includes(p))) return false
  if (BLOCKED_DOMAINS.has(domain.toLowerCase())) return false
  if (HTML_ENTITY_RE.test(local)) return false
  return true
}

// National chains and franchisors that Places returns for local categories
// (mostly coworking). Their inbox is a corporate one, not a local owner.
const CHAIN_DOMAINS = new Set([
  'wework.com', 'regus.com', 'industriousoffice.com', 'spacesworks.com',
  'expansive.com', 'servcorp.com', 'davincivirtual.com',
])

// A listing whose "website" is a link shortener, link-in-bio page or review profile is not
// the business's own domain. Hunter then returns people who work at that platform
// (kevin.gilbertson@tinyurl.com was queued as the contact for a gym, 2026-10-06).
const NOT_OWN_SITE_DOMAINS = new Set([
  'tinyurl.com', 'bit.ly', 'linktr.ee', 'goo.gl', 't.co', 'rebrand.ly', 'lnk.bio', 'beacons.ai',
  'yelp.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'google.com', 'sites.google.com',
])

export function extractDomain(website: string): string | null {
  try { return new URL(website).hostname.replace(/^www\./, '') } catch { return null }
}

export function parseState(address: string): string {
  return address.match(/,\s*([A-Z]{2})\s+\d{5}/)?.[1] ?? ''
}

// City is whatever segment sits right before the one matching "STATE ZIP" --
// anchored on that pattern instead of a fixed index because address shape
// varies by source: Google Places' formattedAddress trails with ", USA" (4
// segments), gosom's does not (3 segments). A fixed parts.length-N offset
// (previously length-3, confirmed correct only for Places' 4-segment shape)
// silently breaks the moment either source's segment count changes -- this
// doesn't care how many segments come before or after.
export function parseCity(address: string): string {
  const parts = address.split(',').map(p => p.trim())
  const stateZipIndex = parts.findIndex(p => /^[A-Z]{2}\s+\d{5}/.test(p))
  return stateZipIndex > 0 ? parts[stateZipIndex - 1] : ''
}

function extractEmailsFromHtml(html: string): string[] {
  const mailtoMatches = [...html.matchAll(/mailto:([^"'?\s>&#]+)/gi)].map(m =>
    sanitizeEmail(m[1].replace(/(%40)/gi, '@'))
  )
  const regexMatches = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m =>
    sanitizeEmail(m[0])
  )
  return [...new Set([...mailtoMatches, ...regexMatches])].filter(isValidEmail)
}

function pickBestEmail(emails: string[], domain: string): string | null {
  const valid = emails.filter(isValidEmail)
  const domainRoot = domain.split('.')[0]
  return valid.find(e => e.split('@')[1]?.includes(domainRoot)) ?? valid[0] ?? null
}

// Quota-outage fallback only (see findEmail) -- confidence pinned below Hunter's
// own 50 threshold so these are visibly distinguishable in hunter_confidence later.
async function scrapeEmail(website: string): Promise<FoundEmail | null> {
  try {
    const baseUrl = new URL(website).origin
    const domain = new URL(website).hostname.replace(/^www\./, '')

    const [homeHtml, contactHtml] = await Promise.all([
      fetchHtml(website),
      fetchHtml(`${baseUrl}/contact`),
    ])

    const allEmails: string[] = []
    if (homeHtml) allEmails.push(...extractEmailsFromHtml(homeHtml))
    if (contactHtml) allEmails.push(...extractEmailsFromHtml(contactHtml))

    const email = pickBestEmail(allEmails, domain)
    if (!email) return null

    return { value: email, confidence: 40 }
  } catch { return null }
}

// Decision-maker titles to prioritize — these are the people who buy AI consulting
const DECISION_MAKER_TITLES = ['ceo', 'founder', 'owner', 'president', 'partner', 'managing director', 'chief operating', 'vp of operations', 'director of operations', 'head of operations', 'general manager', 'principal', 'director']

type HunterResult =
  | { status: 'found'; email: FoundEmail }
  | { status: 'quota_exceeded' }
  | { status: 'not_found' }

async function hunterEmail(domain: string): Promise<HunterResult> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) return { status: 'not_found' }

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit', '10')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    const data = await res.json()

    if (data.errors?.some((e: { code: number }) => e.code === 429)) return { status: 'quota_exceeded' }

    // Hunter's own verdict on each address comes free with the search. verify-contacts
    // no longer spends a verification credit on Hunter-sourced addresses, so an
    // address Hunter marks invalid is dropped here.
    const emails: Array<{ value: string; first_name?: string; last_name?: string; confidence: number; position?: string; verification?: { status?: string | null } | null }> =
      (data.data?.emails ?? []).filter((e: { verification?: { status?: string | null } | null }) => e.verification?.status !== 'invalid')
    if (emails.length === 0) return { status: 'not_found' }

    // Require a named contact — skip if no first name (generic contact@/info@ type)
    const namedEmails = emails.filter(e => e.first_name && e.first_name.length > 0)
    if (namedEmails.length === 0) return { status: 'not_found' }

    // Prefer decision-maker titles first, then highest confidence among named contacts
    const byRole = namedEmails.find(e => DECISION_MAKER_TITLES.some(r => (e.position ?? '').toLowerCase().includes(r)))
    const best = byRole ?? namedEmails.sort((a, b) => b.confidence - a.confidence)[0]

    // Require minimum confidence threshold
    if (best.confidence < 50) return { status: 'not_found' }

    return { status: 'found', email: { value: best.value, first_name: best.first_name, last_name: best.last_name, confidence: best.confidence } }
  } catch { return { status: 'not_found' } }
}

// Hunter's free plan is 50 domain searches a month. Discovery used to run one for
// every business Places returned (up to ~20 a run), before anything was known about
// fit, so the month's quota was gone by day 2 and about a third of it went to
// businesses that score under the send threshold. Now each candidate is scored first
// and only the best few get a lookup: 2 a run x ~22 weekday runs = 44, inside the 50.
// An empty or malformed env value must not turn into 0 or NaN lookups without anyone noticing.
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const HUNTER_LOOKUPS_PER_RUN = envNumber('HUNTER_LOOKUPS_PER_RUN', 2)
// Same default as send-scheduled's MIN_FIT_SCORE: a prospect below it is never emailed.
const MIN_FIT_SCORE = envNumber('MIN_FIT_SCORE', 50)
const SCORING_CONCURRENCY = 5
// auto-discover has a 60s function limit. No new candidate is started after
// SCORING_BUDGET_MS, and scoring is abandoned outright at SCORING_HARD_STOP_MS,
// which leaves ~20s for Places, Hunter (8s cap) and the inserts.
const SCORING_BUDGET_MS = 30_000
const SCORING_HARD_STOP_MS = 38_000

export function pickForLookup<T extends { fit_score: number }>(scored: T[], minFit: number, limit: number): T[] {
  return scored
    .filter(c => c.fit_score >= minFit)
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, Math.max(0, limit))
}

interface Candidate { place: NewPlace; domain: string }
interface ScoredCandidate extends Candidate { fit_score: number; enrichment: EnrichmentResult }

// A candidate left unscored (deadline hit, scrape or model failure, quality gate)
// is simply not looked up. Returns how many were attempted so the caller can tell
// "nothing fit" from "scoring is down".
async function scoreCandidates(candidates: Candidate[], category: string, city: string): Promise<{ scored: ScoredCandidate[]; attempted: number }> {
  if (candidates.length === 0) return { scored: [], attempted: 0 }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('ANTHROPIC_API_KEY not configured (needed to score fit before the Hunter lookup)')
  // The SDK defaults (10 minute timeout, 2 retries) have no place in a 60s function;
  // callClaude already retries rate limits itself.
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 0 })

  const deadline = Date.now() + SCORING_BUDGET_MS
  const scored: ScoredCandidate[] = []
  let next = 0
  let attempted = 0

  const worker = async () => {
    while (next < candidates.length && Date.now() < deadline) {
      const candidate = candidates[next++]
      attempted++
      const address = candidate.place.formattedAddress ?? ''
      const enrichment = await enrichProspect(client, {
        id: candidate.place.id,
        business_name: candidate.place.displayName?.text ?? 'Unknown',
        industry: category,
        city: parseCity(address) || city,
        state: parseState(address),
        website: candidate.place.websiteUri!,
      })
      if (enrichment) scored.push({ ...candidate, fit_score: enrichment.fit_score, enrichment })
    }
  }
  const pool = Promise.all(Array.from({ length: Math.min(SCORING_CONCURRENCY, candidates.length) }, worker))
  // A call already in flight at the deadline is not waited for: whatever is scored
  // by the hard stop is what the run works with.
  await Promise.race([pool, new Promise(resolve => setTimeout(resolve, SCORING_HARD_STOP_MS))])
  return { scored: [...scored], attempted }
}

// Thrown specifically on Places quota/billing exhaustion (429/403) so callers can
// distinguish "nothing left to spend" from a genuine config/request bug -- same
// pattern as HunterResult's quota_exceeded status below.
export class PlacesQuotaExceededError extends Error {}

export async function getPlaces(city: string, category: string): Promise<NewPlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('GOOGLE_PLACES_API_KEY not configured')

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: `${category} in ${city}`, pageSize: 20 }),
  })

  const data = await res.json()
  if (res.status === 429 || res.status === 403) {
    throw new PlacesQuotaExceededError(`Google Places quota/billing error: ${data.error?.message ?? 'Unknown'}`)
  }
  if (!res.ok) throw new Error(`Google Places error: ${data.error?.message ?? 'Unknown'}`)
  return data.places ?? []
}

export interface DiscoveryOptions {
  // Returns the subset of these Places ids already in the prospects table, so no
  // scoring or Hunter lookup is spent on a business that is already there.
  knownPlaceIds?: (placeIds: string[]) => Promise<Set<string>>
}

export async function discoverProspects(city: string, category: string, options: DiscoveryOptions = {}): Promise<{
  prospects: DiscoveredProspect[]
  unresolved: UnresolvedCandidate[]
  placesFound: number
  withWebsite: number
  alreadyKnown: number
  scored: number
  scoringFailed: number
  belowFit: number
  lookedUp: number
  hunterQuotaExhausted: boolean
}> {
  const places = await getPlaces(city, category)

  const withSite = places
    .filter(p => p.websiteUri)
    .map(place => ({ place, domain: extractDomain(place.websiteUri!) }))
    .filter((c): c is Candidate => c.domain !== null)
    .filter(c => !CHAIN_DOMAINS.has(c.domain.toLowerCase()))
    .filter(c => !NOT_OWN_SITE_DOMAINS.has(c.domain.toLowerCase()))

  const known = options.knownPlaceIds && withSite.length > 0
    ? await options.knownPlaceIds(withSite.map(c => c.place.id))
    : new Set<string>()
  const candidates = withSite.filter(c => !known.has(c.place.id))

  const { scored, attempted } = await scoreCandidates(candidates, category, city)
  // Every attempt failing is an outage (model, key, rate limit), not a run where
  // nothing fit. Fail the run so it shows up, instead of quietly adding nobody.
  if (attempted > 0 && scored.length === 0) {
    throw new Error(`Fit scoring failed for all ${attempted} candidates; no Hunter lookups were made`)
  }

  const eligible = pickForLookup(scored, MIN_FIT_SCORE, scored.length)
  const chosen = eligible.slice(0, HUNTER_LOOKUPS_PER_RUN)

  // Hunter is the primary source (named contacts only; generic contact@/info@
  // addresses hurt sender reputation). hunterEmail never throws.
  const hunterResults = await Promise.all(chosen.map(c => hunterEmail(c.domain)))

  // Once the month's Hunter quota is gone, the lookup cap protects nothing, and
  // scraping the site is free. Scrape every fit-eligible candidate, as discovery
  // did during an outage before, so the site-derived owner name can still produce
  // a named contact. Scraping is used only for a quota outage, never when Hunter
  // answered "no named contact here": it mostly surfaces generic inboxes.
  const hunterQuotaExhausted = hunterResults.some(r => r.status === 'quota_exceeded')
  const targets = hunterQuotaExhausted ? eligible : chosen

  const emailResults = await Promise.allSettled(targets.map(async (c, i): Promise<FoundEmail | null> => {
    const hunter = hunterResults[i]
    if (hunter?.status === 'found') return hunter.email
    if (hunterQuotaExhausted && hunter?.status !== 'not_found') return scrapeEmail(c.place.websiteUri!)
    return null
  }))

  const prospects: DiscoveredProspect[] = []
  const unresolved: UnresolvedCandidate[] = []

  for (let i = 0; i < targets.length; i++) {
    const result = emailResults[i]
    const { place, enrichment } = targets[i]
    const address = place.formattedAddress ?? ''

    if (result.status !== 'fulfilled' || !result.value) {
      unresolved.push({
        business_name: place.displayName?.text ?? 'Unknown',
        website: place.websiteUri!,
        industry: category,
        city: parseCity(address) || city,
        state: parseState(address),
      })
      continue
    }
    const email = result.value

    // A name Hunter found always wins. The owner name read off the site is used
    // only when Hunter gave none and it fits the address (same rule as the enrich cron).
    const hunterName = [email.first_name, email.last_name].filter(Boolean).join(' ')
    const siteName = enrichment.contact_first_name && nameFitsEmail(enrichment.contact_first_name, email.value)
      ? enrichment.contact_first_name
      : null

    prospects.push({
      business_name: place.displayName?.text ?? 'Unknown',
      contact_name: hunterName || siteName,
      email: email.value,
      website: place.websiteUri!,
      industry: category,
      city: parseCity(address) || city,
      state: parseState(address),
      google_place_id: place.id,
      hunter_confidence: email.confidence,
      fit_score: enrichment.fit_score,
      custom_intro: enrichment.custom_intro,
      pain_signal: enrichment.pain_signal,
    })
  }

  return {
    prospects,
    unresolved,
    placesFound: places.length,
    withWebsite: withSite.length,
    alreadyKnown: known.size,
    scored: scored.length,
    // Model failure, timeout or the enrichment quality gate. Not looked up this run.
    scoringFailed: attempted - scored.length,
    belowFit: scored.filter(c => c.fit_score < MIN_FIT_SCORE).length,
    lookedUp: chosen.length,
    hunterQuotaExhausted,
  }
}
