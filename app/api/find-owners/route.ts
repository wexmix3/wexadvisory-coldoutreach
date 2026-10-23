import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runOwnerFinder } from '@/lib/owner-finder'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Weekday cron between enrich-prospects (11:00 UTC) and verify-contacts (12:30 UTC). Gives unnamed queued
// prospects a named decision maker so send-scheduled's named-contact rule has people to send to.
// ?dry=1 searches (free) and reports what it would reveal, with no paid calls and no writes.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runOwnerFinder(getSupabaseAdmin(), { dry: req.nextUrl.searchParams.get('dry') === '1' })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
