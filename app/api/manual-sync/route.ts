import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getGmailAccessToken } from '@/lib/dmarc/gmail-auth'
import { syncManualPitches, manualSummaryLines } from '@/lib/manual-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// On-demand sync of hand-sent Gmail pitches (lib/manual-sync.ts). The weekday daily-status email runs the same
// sync before it sends. ?apply=0 is a dry run. Reached with the cron secret (middleware) or the admin password.
export async function GET(req: NextRequest) {
  const apply = req.nextUrl.searchParams.get('apply') !== '0'
  try {
    const rows = await syncManualPitches(getSupabaseAdmin(), await getGmailAccessToken(), apply)
    return NextResponse.json({ applied: apply, summary: manualSummaryLines(rows), rows })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown' }, { status: 500 })
  }
}
