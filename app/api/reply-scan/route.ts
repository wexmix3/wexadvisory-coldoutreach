import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getGmailAccessToken } from '@/lib/dmarc/gmail-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Marks prospects who replied so send-scheduled stops following up with them.
// Runs 30 min before send-scheduled. Before this existed, status='replied' was only ever
// set by hand, so a prospect who replied "no" would still get both follow-ups.
// Matches on the sender's exact address only; a reply from a colleague at the same
// domain isn't caught and has to be marked by hand.

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const IN_SEQUENCE = ['initial_sent', 'followup1_sent', 'followup2_sent']
const AUTO_REPLY = /automatic reply|auto-?reply|out of (the )?office|undeliverable|delivery status/i

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function gmail<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Gmail API error (${path}): ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  const { data: prospects, error } = await sb
    .from('prospects')
    .select('id, email')
    .in('status', IN_SEQUENCE)
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byEmail = new Map((prospects ?? []).map((p) => [p.email.toLowerCase(), p.id]))

  const token = await getGmailAccessToken()
  const q = encodeURIComponent('in:inbox newer_than:4d -from:me')
  const list = await gmail<{ messages?: { id: string }[] }>(`/messages?maxResults=200&q=${q}`, token)

  const matched: { email: string; subject: string }[] = []
  let skippedAuto = 0
  for (const { id } of list.messages ?? []) {
    const msg = await gmail<{ payload?: { headers?: { name: string; value: string }[] } }>(
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      token
    )
    const headers = msg.payload?.headers ?? []
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? ''
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? ''
    const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()
    const prospectId = byEmail.get(addr)
    if (!prospectId) continue
    if (AUTO_REPLY.test(subject)) { skippedAuto++; continue }

    const { error: upErr } = await sb
      .from('prospects')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', prospectId)
      .in('status', IN_SEQUENCE)
    if (upErr) return NextResponse.json({ error: upErr.message, matched }, { status: 500 })
    matched.push({ email: addr, subject })
    byEmail.delete(addr)
  }

  return NextResponse.json({ scanned: list.messages?.length ?? 0, inSequence: byEmail.size + matched.length, replied: matched, skippedAuto })
}
