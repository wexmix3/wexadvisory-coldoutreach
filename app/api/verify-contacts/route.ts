import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyContact } from '@/lib/verify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

const BATCH_SIZE = Number(process.env.VERIFY_BATCH_SIZE ?? 30)

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  const { data: prospects, error } = await sb
    .from('prospects')
    .select('id, email')
    .eq('status', 'queued')
    .eq('email_verification_status', 'unverified')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!prospects || prospects.length === 0) {
    return NextResponse.json({ verified: 0, pruned: 0, message: 'Nothing to verify' })
  }

  let deliverable = 0
  let risky = 0
  let unknown = 0
  let pruned = 0

  for (const p of prospects) {
    const result = await verifyContact(p.email)
    const now = new Date().toISOString()

    if (result === 'undeliverable') {
      await sb.from('prospects').update({
        status: 'bounced',
        email_verification_status: 'undeliverable',
        email_verified_at: now,
      }).eq('id', p.id)
      pruned++
    } else {
      await sb.from('prospects').update({
        email_verification_status: result,
        email_verified_at: now,
      }).eq('id', p.id)
      if (result === 'deliverable') deliverable++
      else if (result === 'risky') risky++
      else unknown++
    }
  }

  return NextResponse.json({
    total: prospects.length,
    deliverable,
    risky,
    unknown,
    pruned,
  })
}
