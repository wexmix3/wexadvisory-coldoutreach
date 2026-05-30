import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { discoverProspects } from '@/lib/discovery'
import { US_CITIES, PROSPECT_CATEGORIES } from '@/lib/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const city = pick(US_CITIES)
  const category = pick(PROSPECT_CATEGORIES)

  let prospects: Awaited<ReturnType<typeof discoverProspects>>['prospects'] = []
  let placesFound = 0

  try {
    const result = await discoverProspects(city, category)
    prospects = result.prospects
    placesFound = result.placesFound
  } catch (err) {
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
  })
}
