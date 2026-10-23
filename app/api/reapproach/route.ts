import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runReapproach } from '@/lib/reapproach'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Weekday cron after find-owners. Checks old no-reply businesses and, in the last week of the Firecrawl billing
// period, queues their owners as new prospects (lib/reapproach.ts). ?dry=1 = no writes, no paid calls.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await runReapproach(getSupabaseAdmin(), { dry: req.nextUrl.searchParams.get('dry') === '1' }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
