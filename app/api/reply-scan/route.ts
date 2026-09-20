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
// Max's own addresses sit in prospects as test rows; his X-link forwards were being
// counted as "replies" (first live run 2026-09-18).
const OWN_ADDRESS = /@wexadvisory\.com$|^maxmwexley@gmail\.com$/i
const AUTO_REPLY =/automatic reply|auto-?reply|out of (the )?office|undeliverable|delivery status/i
// The plain-text initials (variants 5/6, migration 019) carry no unsubscribe link - they ask the
// recipient to reply "no". That reply is a real opt-out, so it has to set unsubscribed_at, not just
// status='replied'. Deliberately conservative: an opt-out word has to OPEN the reply, or the reply
// has to explicitly ask for removal, so "no idea what you mean, call me Tuesday" stays a reply.
// A missed opt-out still stops every follow-up via status='replied'; a false positive would
// wrongly suppress an interested prospect, which is the worse error of the two.
const OPT_OUT_OPENER = /^\W*(?:(?:no|stop|pass|remove)\b\s*(?:[.,!;:-]|$)|no\s+thanks?\b|no\s+thank\s+you\b|not\s+interested\b|no\s+longer\s+interested\b|unsubscribe\b|remove\s+me\b|take\s+me\s+off\b)/i
const OPT_OUT_PHRASE = /\b(unsubscribe|take me off|remove me from|stop emailing|do not (contact|email)|don't (contact|email))\b/i

function isOptOut(subject: string, snippet: string): boolean {
  // Gmail's snippet is the head of the body, which for a reply is the new text, not the quote.
  return OPT_OUT_OPENER.test(snippet) || OPT_OUT_PHRASE.test(snippet) || OPT_OUT_PHRASE.test(subject)
}

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

  const matched: { email: string; subject: string; optOut?: true }[] = []
  let skippedAuto = 0
  for (const { id } of list.messages ?? []) {
    const msg = await gmail<{ snippet?: string; payload?: { headers?: { name: string; value: string }[] } }>(
      `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      token
    )
    const headers = msg.payload?.headers ?? []
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? ''
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? ''
    const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()
    const prospectId = byEmail.get(addr)
    if (!prospectId || OWN_ADDRESS.test(addr)) continue
    if (AUTO_REPLY.test(subject)) { skippedAuto++; continue }

    const now = new Date().toISOString()
    const optOut = isOptOut(subject, msg.snippet ?? '')
    const { error: upErr } = await sb
      .from('prospects')
      .update(
        optOut
          ? { status: 'unsubscribed', replied_at: now, unsubscribed_at: now }
          : { status: 'replied', replied_at: now }
      )
      .eq('id', prospectId)
      .in('status', IN_SEQUENCE)
    if (upErr) return NextResponse.json({ error: upErr.message, matched }, { status: 500 })
    matched.push(optOut ? { email: addr, subject, optOut: true } : { email: addr, subject })
    byEmail.delete(addr)
  }

  return NextResponse.json({
    scanned: list.messages?.length ?? 0,
    inSequence: byEmail.size + matched.length,
    replied: matched,
    optedOut: matched.filter((m) => m.optOut).map((m) => m.email),
    skippedAuto,
  })
}
