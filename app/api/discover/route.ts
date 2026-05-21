import { NextRequest, NextResponse } from 'next/server'

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

// Places API (New) response shape
interface NewPlace {
  id: string
  displayName?: { text: string }
  websiteUri?: string
  formattedAddress?: string
}

interface HunterEmail {
  value: string
  first_name?: string
  last_name?: string
  confidence: number
  position?: string
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
}

async function getPlaces(city: string, category: string): Promise<NewPlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured')
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      // Request only the fields we need — keeps the response lean
      'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress',
    },
    body: JSON.stringify({
      textQuery: `${category} in ${city}`,
      pageSize: 20,
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    const msg = data.error?.message ?? data.error?.status ?? 'Unknown Google error'
    throw new Error(`Google Places error: ${msg}`)
  }

  return data.places ?? []
}

function extractDomain(website: string): string | null {
  try {
    return new URL(website).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function parseState(address: string): string {
  // "123 Main St, Chicago, IL 60601, USA" → "IL"
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/)
  return match?.[1] ?? ''
}

function parseCity(address: string): string {
  // "123 Main St, Chicago, IL 60601, USA" → "Chicago"
  const parts = address.split(',')
  return parts.length >= 3 ? parts[parts.length - 3]?.trim() ?? '' : ''
}

async function findEmail(domain: string): Promise<HunterEmail | null> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) return null

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString())
    const data = await res.json()

    const emails: HunterEmail[] = data.data?.emails ?? []
    if (emails.length === 0) return null

    // Prefer decision-maker roles, then highest confidence
    const priority = ['ceo', 'founder', 'owner', 'president', 'director', 'manager']
    const byRole = emails.find(e =>
      priority.some(r => (e.position ?? '').toLowerCase().includes(r))
    )
    return byRole ?? emails.sort((a, b) => b.confidence - a.confidence)[0]
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — try again in 10 minutes' }, { status: 429 })
  }

  try {
    const { city, category } = await req.json()
    if (!city || !category) {
      return NextResponse.json({ error: 'city and category required' }, { status: 400 })
    }

    const places = await getPlaces(city, category)

    // Resolve all Hunter lookups in parallel instead of serially
    const candidates = places
      .filter(p => p.websiteUri)
      .map(place => {
        const domain = extractDomain(place.websiteUri!)
        return { place, domain }
      })
      .filter((c): c is { place: NewPlace; domain: string } => c.domain !== null)

    const emailResults = await Promise.allSettled(
      candidates.map(({ domain }) => findEmail(domain))
    )

    const prospects: DiscoveredProspect[] = []
    for (let i = 0; i < candidates.length; i++) {
      const result = emailResults[i]
      if (result.status !== 'fulfilled' || !result.value) continue
      const email = result.value
      const { place } = candidates[i]
      const address = place.formattedAddress ?? ''
      const contactName = [email.first_name, email.last_name].filter(Boolean).join(' ') || null

      prospects.push({
        business_name: place.displayName?.text ?? 'Unknown',
        contact_name: contactName,
        email: email.value,
        website: place.websiteUri!,
        industry: category,
        city: parseCity(address) || city,
        state: parseState(address),
        google_place_id: place.id,
        hunter_confidence: email.confidence,
      })
    }

    return NextResponse.json({
      prospects,
      debug: {
        placesFound: places.length,
        withWebsite: candidates.length,
        withEmail: prospects.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
