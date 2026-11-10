import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getGmailAccessToken } from '@/lib/dmarc/gmail-auth'
import { syncManualPitches, manualSummaryLines } from '@/lib/manual-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// On-demand sync of hand-sent Gmail pitches (lib/manual-sync.ts). The weekday daily-status email runs the same
// sync before it sends. ?apply=0 is a dry run. Reached with the cron secret (middleware) or the admin password.
// The response names the mailbox the Gmail credential reads, so a credential pointed at the wrong inbox shows up.
export async function GET(req: NextRequest) {
  const apply = req.nextUrl.searchParams.get('apply') !== '0'
  let mailbox: string | null = null
  try {
    const token = await getGmailAccessToken()
    const prof = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${token}` } })
    mailbox = prof.ok ? ((await prof.json()) as { emailAddress?: string }).emailAddress ?? null : `profile ${prof.status}`
    const rows = await syncManualPitches(getSupabaseAdmin(), token, apply)
    return NextResponse.json({ applied: apply, mailbox, summary: manualSummaryLines(rows), rows })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown', mailbox }, { status: 500 })
  }
}
