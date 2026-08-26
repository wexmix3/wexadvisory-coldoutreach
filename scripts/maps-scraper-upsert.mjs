// Reads out/results.json from gosom/google-maps-scraper and upserts prospects into
// Supabase. Mirrors the shape lib/discovery.ts writes for the Hunter/Places path,
// but google_place_id/email dedup is left to Postgres (on_conflict) instead of the
// pre-check-then-insert loop the Next app does, since this runs as a one-shot script.
import { readFile } from 'node:fs/promises'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const FALLBACK_CITY = process.env.FALLBACK_CITY
const FALLBACK_CATEGORY = process.env.FALLBACK_CATEGORY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

// Same tradeoff as lib/discovery.ts's scrapeEmail() fallback: no named contact,
// so pin confidence below both Hunter's >=50 floor and the scrapeEmail 40, marking
// this as the lowest-trust tier of the three sources.
const MAPS_SCRAPER_CONFIDENCE = 30

function parseState(address) {
  return address.match(/,\s*([A-Z]{2})\s+\d{5}/)?.[1] ?? ''
}

function parseCity(address) {
  const parts = address.split(',')
  return parts.length >= 3 ? parts[parts.length - 3]?.trim() ?? '' : ''
}

// Output format (single JSON array vs newline-delimited JSON) isn't documented --
// handle both rather than assume and silently produce zero rows.
const raw = (await readFile('out/results.json', 'utf-8').catch(() => '[]')).trim()
let places = []
if (raw.length) {
  try {
    const parsed = JSON.parse(raw)
    places = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    places = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
  }
}

// gosom's JSON field is `web_site`, not `website` -- confirmed 2026-08-26 via a
// real run's raw output (undocumented; the original build guessed `website` and
// it silently zeroed out every row since the driver/hang bugs meant this line
// had never run against real data until now).
const rows = places
  .filter(p => p.web_site && Array.isArray(p.emails) && p.emails.length > 0)
  .map(p => {
    const address = p.address ?? ''
    return {
      business_name: p.title ?? 'Unknown',
      contact_name: null,
      email: p.emails[0].toLowerCase(),
      website: p.web_site,
      industry: FALLBACK_CATEGORY,
      city: parseCity(address) || FALLBACK_CITY,
      state: parseState(address),
      google_place_id: p.place_id || null,
      hunter_confidence: MAPS_SCRAPER_CONFIDENCE,
      status: 'queued',
    }
  })

if (rows.length === 0) {
  console.log('No candidates with an email found -- nothing to upsert.')
  process.exit(0)
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/prospects?on_conflict=email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: 'resolution=ignore-duplicates',
  },
  body: JSON.stringify(rows),
})

if (!res.ok) {
  console.error('Supabase upsert failed:', res.status, await res.text())
  process.exit(1)
}

console.log(`Upserted up to ${rows.length} prospect(s) from maps-scraper fallback (${FALLBACK_CATEGORY} in ${FALLBACK_CITY}).`)
