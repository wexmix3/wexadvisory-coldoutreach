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

const IMAGE_EXTS = /\.(webp|png|jpe?g|gif|svg|ico|bmp|tiff?)$/i
const VALID_EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}$/

function sanitizeEmail(raw: string): string {
  try { raw = decodeURIComponent(raw) } catch { /* ignore malformed encoding */ }
  return raw.replace(/[\\'"<>\s;,]+$/g, '').toLowerCase().trim()
}

function isValidEmail(email: string): boolean {
  if (!VALID_EMAIL_RE.test(email)) return false
  const domain = email.split('@')[1] ?? ''
  if (IMAGE_EXTS.test(domain)) return false
  const tld = domain.split('.').pop() ?? ''
  if (IMAGE_EXTS.test('.' + tld)) return false
  if (SKIP_PATTERNS.some(p => email.includes(p))) return false
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

    return { value: email, confidence: 50 }
  } catch { return null }
}

async function hunterEmail(domain: string): Promise<FoundEmail | null> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) return null

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString())
    const data = await res.json()

    if (data.errors?.some((e: { code: number }) => e.code === 429)) return null

    const emails: Array<{ value: string; first_name?: string; last_name?: string; confidence: number; position?: string }> = data.data?.emails ?? []
    if (emails.length === 0) return null

    const priority = ['ceo', 'founder', 'owner', 'president', 'director', 'manager']
    const byRole = emails.find(e => priority.some(r => (e.position ?? '').toLowerCase().includes(r)))
    const best = byRole ?? emails.sort((a, b) => b.confidence - a.confidence)[0]

    return { value: best.value, first_name: best.first_name, last_name: best.last_name, confidence: best.confidence }
  } catch { return null }
}

async function findEmail(website: string, domain: string): Promise<FoundEmail | null> {
  const scraped = await scrapeEmail(website)
  if (scraped) return scraped
  return hunterEmail(domain)
}

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
  if (!res.ok) throw new Error(`Google Places error: ${data.error?.message ?? 'Unknown'}`)
  return data.places ?? []
}

export async function discoverProspects(city: string, category: string): Promise<{
  prospects: DiscoveredProspect[]
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

  for (let i = 0; i < candidates.length; i++) {
    const result = emailResults[i]
    if (result.status !== 'fulfilled' || !result.value) continue
    const email = result.value
    const { place } = candidates[i]
    const address = place.formattedAddress ?? ''

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

  return { prospects, placesFound: places.length, withWebsite: candidates.length }
}
