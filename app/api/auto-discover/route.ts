import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { discoverProspects, PlacesQuotaExceededError } from '@/lib/discovery'
import { US_CITIES, PROSPECT_CATEGORIES, TOP_CATEGORIES } from '@/lib/constants'
import { triggerMapsScraperFallback } from '@/lib/maps-scraper-fallback'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Hard ceiling on paid-lookup spend (Google Places + Hunter.io) per calendar
// month. Each cron run costs ~1 Places search + up to ~20 Hunter domain-search
// lookups. 300 prospects/month keeps discovery well under the $25/mo overall
// automation ceiling even before Hunter's own account quota kicks in — this
// guards against a future scheduling change (e.g. hourly instead of daily)
// silently multiplying spend with no one noticing until the Hunter bill lands.
const MAX_MONTHLY_DISCOVERY_ADDS = 300

async function monthlyDiscoveryAddsExceeded(sb: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const { count, error } = await sb
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', monthStart.toISOString())
  if (error) {
    // Fail open on a query error — an unenforceable cap must not take down
    // discovery entirely, same posture as the quota-exceeded fallback below.
    console.error('auto-discover: monthly cap check failed:', error.message)
    return false
  }
  return (count ?? 0) >= MAX_MONTHLY_DISCOVERY_ADDS
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function pickCategory(): string {
  const useTop = Math.random() < 0.7
  const pool = useTop ? TOP_CATEGORIES : PROSPECT_CATEGORIES
  return pool[Math.floor(Math.random() * pool.length)]!
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sbCap = getSupabaseAdmin()
  if (await monthlyDiscoveryAddsExceeded(sbCap)) {
    return NextResponse.json({
      skipped: true,
      reason: `Monthly discovery cap reached (${MAX_MONTHLY_DISCOVERY_ADDS} prospects added this calendar month) — pausing paid lookups until next month.`,
    })
  }

  const city = pick(US_CITIES)
  const category = pickCategory()

  let prospects: Awaited<ReturnType<typeof discoverProspects>>['prospects'] = []
  let unresolved: Awaited<ReturnType<typeof discoverProspects>>['unresolved'] = []
  let placesFound = 0

  try {
    const result = await discoverProspects(city, category)
    prospects = result.prospects
    unresolved = result.unresolved
    placesFound = result.placesFound
  } catch (err) {
    if (err instanceof PlacesQuotaExceededError) {
      const dispatched = await triggerMapsScraperFallback(city, category)
      return NextResponse.json({
        error: err.message,
        city,
        category,
        fallbackDispatched: dispatched,
      }, { status: dispatched ? 202 : 500 })
    }
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Discovery failed',
      city,
      category,
    }, { status: 500 })
  }

  if (prospects.length === 0) {
    return NextResponse.json({ city, category, added: 0, skipped: 0, placesFound })
  }

  const sb = getSupabaseAdmin()

  // Check which emails already exist
  const emails = prospects.map(p => p.email)
  const { data: existing } = await sb.from('prospects').select('email').in('email', emails)
  const existingEmails = new Set((existing ?? []).map((r: { email: string }) => r.email))

  const newProspects = prospects.filter(p => !existingEmails.has(p.email))

  let added = 0
  for (const p of newProspects) {
    const { error } = await sb.from('prospects').insert({
      business_name: p.business_name,
      contact_name: p.contact_name,
      email: p.email,
      website: p.website,
      industry: p.industry,
      city: p.city,
      state: p.state,
      google_place_id: p.google_place_id || null,
      hunter_confidence: p.hunter_confidence,
      status: 'queued',
    })
    if (!error) added++
  }

  return NextResponse.json({
    city,
    category,
    placesFound,
    added,
    skipped: prospects.length - newProspects.length,
    // Businesses Hunter found no named contact for (not a quota issue — genuinely
    // nothing there). Previously dropped with zero trace. Not written to `prospects`
    // (email is required there) — surfaced here so they're visible in cron run logs
    // instead of vanishing. Durable storage (own table/column, or a different sink
    // like a LinkedIn-outreach queue) is a deliberate follow-up, not done here —
    // it's a schema/external-DB decision, not a code fix.
    unresolvedNoEmail: unresolved.length,
    unresolved: unresolved.slice(0, 20),
  })
}
