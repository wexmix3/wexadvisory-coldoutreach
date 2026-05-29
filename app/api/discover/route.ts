import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fetchHtml } from '@/lib/scraper'

export const dynamic = 'force-dynamic'

const rateMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  if (entry.count >= 5) return true
  entry.count++
  return false
}

interface NewPlace {
  id: string
  displayName?: { text: string }
  websiteUri?: string
  formattedAddress?: string
}

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

interface FoundEmail {
  value: string
  first_name?: string
  last_name?: string
  confidence: number
}

async function getPlaces(city: string, category: string): Promise<NewPlace[]> {
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

function extractDomain(website: string): string | null {
  try { return new URL(website).hostname.replace(/^www\./, '') } catch { return null }
}

function parseState(address: string): string {
  return address.match(/,\s*([A-Z]{2})\s+\d{5}/)?.[1] ?? ''
}

function parseCity(address: string): string {
  const parts = address.split(',')
  return parts.length >= 3 ? parts[parts.length - 3]?.trim() ?? '' : ''
}

const SKIP_PATTERNS = ['noreply', 'no-reply', 'donotreply', 'example.com', 'wordpress',
  'sentry', 'wixpress', 'squarespace', 'godaddy', 'hosting', 'support@', 'hello@wix',
  'privacy@', 'legal@', 'abuse@', 'postmaster@']

function extractEmailsFromHtml(html: string): string[] {
  const mailtoMatches = [...html.matchAll(/mailto:([^"'?\s>&#]+)/gi)].map(m =>
    m[1].toLowerCase().replace(/(%40)/gi, '@').trim()
  )
  const regexMatches = [...html.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)].map(m =>
    m[0].toLowerCase()
  )
  return [...new Set([...mailtoMatches, ...regexMatches])]
}

function pickBestEmail(emails: string[], domain: string): string | null {
  const valid = emails.filter(e =>
    e.includes('@') &&
    !SKIP_PATTERNS.some(p => e.includes(p)) &&
    !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')
  )
  const domainRoot = domain.split('.')[0]
  return valid.find(e => e.split('@')[1]?.includes(domainRoot)) ?? valid[0] ?? null
}

async function scrapeEmail(website: string): Promise<FoundEmail | null> {
  try {
    const baseUrl = new URL(website).origin
    const domain = new URL(website).hostname.replace(/^www\./, '')

    // Try homepage and /contact in parallel
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

    // If Hunter returns quota error, bail silently
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
  // Try scraping first (free), fall back to Hunter
  const scraped = await scrapeEmail(website)
  if (scraped) return scraped
  return hunterEmail(domain)
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — try again in 10 minutes' }, { status: 429 })
  }

  try {
    const { city, category } = await req.json()
    if (!city || !category) return NextResponse.json({ error: 'city and category required' }, { status: 400 })

    const places = await getPlaces(city, category)

    const candidates = places
      .filter(p => p.websiteUri)
      .map(place => ({ place, domain: extractDomain(place.websiteUri!) }))
      .filter((c): c is { place: NewPlace; domain: string } => c.domain !== null)

    const emailResults = await Promise.allSettled(
      candidates.map(({ place, domain }) => findEmail(place.websiteUri!, domain))
    )

    const prospects: DiscoveredProspect[] = []
    let scrapedCount = 0
    let hunterCount = 0

    for (let i = 0; i < candidates.length; i++) {
      const result = emailResults[i]
      if (result.status !== 'fulfilled' || !result.value) continue
      const email = result.value
      const { place } = candidates[i]
      const address = place.formattedAddress ?? ''

      if (email.confidence === 50) scrapedCount++
      else hunterCount++

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

    // Cross-reference against existing prospects by google_place_id
    if (prospects.length > 0) {
      const sb = getSupabaseAdmin()
      const placeIds = prospects.map(p => p.google_place_id)
      const { data: existing } = await sb
        .from('prospects')
        .select('google_place_id, status')
        .in('google_place_id', placeIds)

      if (existing && existing.length > 0) {
        const existingMap = new Map(existing.map(r => [r.google_place_id, r.status]))
        for (const p of prospects) {
          const status = existingMap.get(p.google_place_id)
          if (status) p.existing_status = status
        }
      }
    }

    return NextResponse.json({
      prospects,
      debug: {
        placesFound: places.length,
        withWebsite: candidates.length,
        withEmail: prospects.length,
        scrapedCount,
        hunterCount,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
