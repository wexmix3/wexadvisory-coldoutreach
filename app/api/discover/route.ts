import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { discoverProspects, extractDomain, DiscoveredProspect } from '@/lib/discovery'

export type { DiscoveredProspect }
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

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — try again in 10 minutes' }, { status: 429 })
  }

  try {
    const { city, category } = await req.json()
    if (!city || !category) return NextResponse.json({ error: 'city and category required' }, { status: 400 })

    const { prospects, placesFound, withWebsite } = await discoverProspects(city, category)

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
        placesFound,
        withWebsite,
        withEmail: prospects.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// keep extractDomain re-exported in case anything imports it from here
export { extractDomain }
