import { fetchHtml } from './scraper'

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

export function extractDomain(website: string): string | null {
  try { return new URL(website).hostname.replace(/^www\./, '') } catch { return null }
}

export function parseState(address: string): string {
  return address.match(/,\s*([A-Z]{2})\s+\d{5}/)?.[1] ?? ''
}

export function parseCity(address: string): string {
  const parts = address.split(',')
  return parts.length >= 3 ? parts[parts.length - 3]?.trim() ?? '' : ''
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

    const res = await fetch(url.toString())
    const data = await res.json()

    if (data.errors?.some((e: { code: number }) => e.code === 429)) return { status: 'quota_exceeded' }

    const emails: Array<{ value: string; first_name?: string; last_name?: string; confidence: number; position?: string }> = data.data?.emails ?? []
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

// Hunter.io is the primary source (named contacts only -- generic contact@/info@
// addresses hurt sender reputation). Fall back to scraping the site itself only
// when Hunter's quota is exhausted, not when Hunter simply found no named contact --
// scraping tends to surface generic aliases, which is a deliberate quality tradeoff
// made only to keep discovery running during a quota outage.
async function findEmail(website: string, domain: string): Promise<FoundEmail | null> {
  const result = await hunterEmail(domain)
  if (result.status === 'found') return result.email
  if (result.status === 'quota_exceeded') return scrapeEmail(website)
  return null
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

export async function discoverProspects(city: string, category: string): Promise<{
  prospects: DiscoveredProspect[]
  unresolved: UnresolvedCandidate[]
  placesFound: number
  withWebsite: number
}> {
  const places = await getPlaces(city, category)

  const candidates = places
    .filter(p => p.websiteUri)
    .map(place => ({ place, domain: extractDomain(place.websiteUri!) }))
    .filter((c): c is { place: NewPlace; domain: string } => c.domain !== null)

  const emailResults = await Promise.allSettled(
    candidates.map(({ place, domain }) => findEmail(place.websiteUri!, domain))
  )

  const prospects: DiscoveredProspect[] = []
  const unresolved: UnresolvedCandidate[] = []

  for (let i = 0; i < candidates.length; i++) {
    const result = emailResults[i]
    const { place } = candidates[i]
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

    prospects.push({
      business_name: place.displayName?.text ?? 'Unknown',
      contact_name: [email.first_name, email.last_name].filter(Boolean).join(' ') || null,
      email: email.value,
      website: place.websiteUri!,
      industry: category,
      city: parseCity(address) || city,
      state: parseState(address),
      google_place_id: place.id,
      hunter_confidence: email.confidence,
    })
  }

  return { prospects, unresolved, placesFound: places.length, withWebsite: candidates.length }
}
