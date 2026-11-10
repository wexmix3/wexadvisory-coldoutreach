import { SupabaseClient } from '@supabase/supabase-js'

// Hand-sent pitches: Max writes these from his own Gmail, outside the template sequence. Each prospect's notes
// start with MANUAL_TAG and name the Gmail thread ("thread <16 hex>"); its domain sits in suppressed_domains so
// send-scheduled never emails it. For every one still in sequence this reads the thread and records:
//   - each later message from Max      -> followup1 / followup2 (prospect fields + an email_log row)
//   - a real message from anyone else  -> status 'replied' (auto-replies and out-of-office are ignored)
//   - a hard bounce after the first send -> status 'bounced' (delay warnings are ignored)
// Rows already replied/bounced/unsubscribed/etc. are reported from the database and never touched.
// Throws on any Gmail or Supabase error: a silent miss here means a reply nobody sees.
export const MANUAL_TAG = '[manual-gmail'
export const FOLLOWUP_DAYS = [3, 5] // follow-up 1 and 2, counted from the first email
export const MANUAL_LOG_PREFIX = 'gmail:' // email_log.resend_id for hand-sent mail; daily-status leaves these out of its send counts

const IN_SEQUENCE = ['initial_sent', 'followup1_sent', 'followup2_sent']
const MAX_FROM = /wexadvisory\.com/i
const BOUNCE_FROM = /mailer-daemon|postmaster/i
// Same pattern as reply-scan's AUTO_REPLY, applied to the subject.
const AUTO_REPLY = /automatic reply|auto-?reply|out of (the )?office|undeliverable|delivery status/i
const DAY = 86_400_000
const RECENT_REPLY_MS = 30 * 3_600_000 // a reply reply-scan already recorded still flags the next daily email
const CONCURRENCY = 5

export type ManualRow = {
  business: string
  contact: string
  status: string
  sent: string
  fu1: string
  fu2: string
  reply: string
  next: string
  due_today: boolean
  new_reply: boolean
  changed: string[]
}

type GmailMsg = { id: string; internalDate: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }
type Prospect = {
  id: string; business_name: string; contact_name: string | null; email: string; status: string; notes: string
  initial_sent_at: string | null; followup1_sent_at: string | null; followup2_sent_at: string | null; replied_at: string | null; bounced_at: string | null
}

async function gmail<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Gmail API error (${path}): ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

const header = (m: GmailMsg, name: string) =>
  (m.payload?.headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
const day = (s: string | null | undefined) => (s ?? '').slice(0, 10)
const gmailDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '/')

async function syncOne(sb: SupabaseClient, token: string, p: Prospect, apply: boolean, now: Date): Promise<ManualRow> {
  const update: Record<string, string> = {}
  let status = p.status

  if (IN_SEQUENCE.includes(p.status)) {
    const thread = p.notes.match(/thread ([0-9a-f]{16})/)?.[1]
    if (!thread) throw new Error(`${p.business_name}: no "thread <id>" in notes`)
    if (!p.initial_sent_at) throw new Error(`${p.business_name}: initial_sent_at is empty`)

    const t = await gmail<{ messages?: GmailMsg[] }>(`/threads/${thread}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, token)
    const msgs = (t.messages ?? [])
      .filter((m) => !(m.labelIds ?? []).includes('DRAFT'))
      .map((m) => ({ id: m.id, at: new Date(Number(m.internalDate)).toISOString(), from: header(m, 'From'), subject: header(m, 'Subject'), sent: (m.labelIds ?? []).includes('SENT') }))
      .sort((a, b) => a.at.localeCompare(b.at))
    const mine = msgs.filter((m) => m.sent || MAX_FROM.test(m.from))
    const theirs = msgs.filter((m) => !m.sent && !MAX_FROM.test(m.from) && !BOUNCE_FROM.test(m.from) && !AUTO_REPLY.test(m.subject))
    const followups = mine.slice(1, 3) // the first message is the initial email

    // Bounces come back as their own thread. Only hard failures after the first send count.
    const q = `from:(mailer-daemon OR postmaster) "${p.email}" after:${gmailDate(new Date(new Date(p.initial_sent_at).getTime() - DAY).toISOString())} -subject:delay -subject:delayed`
    const bounces = await gmail<{ messages?: unknown[] }>(`/messages?q=${encodeURIComponent(q)}&maxResults=1`, token)
    const bounced = (bounces.messages ?? []).length > 0

    const logs: Record<string, unknown>[] = []
    if (theirs.length) {
      status = 'replied'
      update.replied_at = theirs[0].at
    } else if (bounced) {
      status = 'bounced'
      update.bounced_at = now.toISOString()
    } else {
      status = followups.length === 2 ? 'followup2_sent' : followups.length === 1 ? 'followup1_sent' : 'initial_sent'
    }
    followups.forEach((m, i) => {
      const field = i === 0 ? 'followup1_sent_at' : 'followup2_sent_at'
      if (!p[field]) {
        update[field] = m.at
        logs.push({ prospect_id: p.id, template_type: i === 0 ? 'followup1' : 'followup2', variant: null, subject: m.subject, body_html: `(sent from Gmail; see message ${m.id})`, resend_id: `${MANUAL_LOG_PREFIX}${m.id}`, sent_at: m.at, status: 'sent' })
      }
    })
    if (status !== p.status) update.status = status

    if (apply && (Object.keys(update).length || logs.length)) {
      if (logs.length) {
        const { data: have, error: hErr } = await sb.from('email_log').select('resend_id').eq('prospect_id', p.id)
        if (hErr) throw new Error(`email_log read failed: ${hErr.message}`)
        const seen = new Set((have ?? []).map((r: { resend_id: string | null }) => r.resend_id))
        const fresh = logs.filter((l) => !seen.has(l.resend_id as string))
        if (fresh.length) {
          const { error: lErr } = await sb.from('email_log').insert(fresh)
          if (lErr) throw new Error(`email_log insert failed: ${lErr.message}`)
        }
      }
      if (Object.keys(update).length) {
        const { error: uErr } = await sb.from('prospects').update(update).eq('id', p.id).in('status', IN_SEQUENCE)
        if (uErr) throw new Error(`prospect update failed for ${p.business_name}: ${uErr.message}`)
      }
    }
  }

  const replied = update.replied_at ?? p.replied_at
  const start = p.initial_sent_at ? new Date(p.initial_sent_at).getTime() : null
  const due = start ? FOLLOWUP_DAYS.map((d) => new Date(start + d * DAY).toISOString().slice(0, 10)) : []
  const nextDue = !start ? null : status === 'initial_sent' ? due[0] : status === 'followup1_sent' ? due[1] : null
  return {
    business: p.business_name,
    contact: p.contact_name ?? '',
    status,
    sent: day(p.initial_sent_at),
    fu1: day(update.followup1_sent_at ?? p.followup1_sent_at),
    fu2: day(update.followup2_sent_at ?? p.followup2_sent_at),
    reply: day(replied),
    next: nextDue ? `${status === 'initial_sent' ? 'FU1' : 'FU2'} ${nextDue}` : '-',
    due_today: !!nextDue && nextDue <= now.toISOString().slice(0, 10),
    new_reply: status === 'replied' && (!!update.replied_at || (!!replied && now.getTime() - new Date(replied).getTime() < RECENT_REPLY_MS)),
    changed: Object.keys(update),
  }
}

export async function syncManualPitches(sb: SupabaseClient, token: string, apply: boolean, now = new Date()): Promise<ManualRow[]> {
  const { data, error } = await sb
    .from('prospects')
    .select('id,business_name,contact_name,email,status,notes,initial_sent_at,followup1_sent_at,followup2_sent_at,replied_at,bounced_at')
    .like('notes', `${MANUAL_TAG}%`)
    .order('initial_sent_at')
  if (error) throw new Error(`prospects read failed: ${error.message}`)
  const prospects = (data ?? []) as Prospect[]
  const rows: ManualRow[] = []
  for (let i = 0; i < prospects.length; i += CONCURRENCY) {
    rows.push(...(await Promise.all(prospects.slice(i, i + CONCURRENCY).map((p) => syncOne(sb, token, p, apply, now)))))
  }
  return rows
}

export function manualSummaryLines(rows: ManualRow[]): string {
  if (!rows.length) return 'Hand-sent pitches: none tracked.'
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {})
  const lines = [`Hand-sent pitches (${rows.length}): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`]
  const replies = rows.filter((r) => r.new_reply)
  if (replies.length) lines.push(`NEW REPLIES: ${replies.map((r) => `${r.business} (${r.contact})`).join('; ')}`)
  const due = rows.filter((r) => r.due_today)
  if (due.length) lines.push(`Follow-ups due (Gmail drafts in each thread): ${due.map((r) => `${r.business} ${r.next.split(' ')[0]}`).join('; ')}`)
  return lines.join('\n')
}
