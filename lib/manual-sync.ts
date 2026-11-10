import { SupabaseClient } from '@supabase/supabase-js'

// Hand-sent pitches: Max writes these from his own Gmail, outside the template sequence. Each prospect's notes
// start with MANUAL_TAG and name the Gmail thread ("thread <16 hex>"); its domain sits in suppressed_domains so
// send-scheduled never emails it. This reads every such thread and records what happened in it:
//   - each later message from Max      -> followup1 / followup2 (prospect fields + an email_log row)
//   - a message from anyone else       -> status 'replied'
//   - a mailer-daemon bounce for them  -> status 'bounced'
// Throws on any Gmail or Supabase error: a silent miss here means a reply nobody sees.
export const MANUAL_TAG = '[manual-gmail'
export const FOLLOWUP_DAYS = [3, 5] // follow-up 1 and 2, counted from the first email

const MAX_FROM = /wexadvisory\.com/i
const BOUNCE_FROM = /mailer-daemon|postmaster/i
const DAY = 86_400_000

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
  changed: string[]
}

type GmailMsg = { id: string; internalDate: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }

async function gmail<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Gmail API error (${path}): ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

const header = (m: GmailMsg, name: string) =>
  (m.payload?.headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

export async function syncManualPitches(sb: SupabaseClient, token: string, apply: boolean, now = new Date()): Promise<ManualRow[]> {
  const { data: prospects, error } = await sb
    .from('prospects')
    .select('id,business_name,contact_name,email,status,notes,initial_sent_at,followup1_sent_at,followup2_sent_at,replied_at,bounced_at')
    .like('notes', `${MANUAL_TAG}%`)
    .order('initial_sent_at')
  if (error) throw new Error(`prospects read failed: ${error.message}`)

  const today = now.toISOString().slice(0, 10)
  const rows: ManualRow[] = []
  for (const p of prospects ?? []) {
    const thread = (p.notes as string).match(/thread ([0-9a-f]{16})/)?.[1]
    if (!thread) throw new Error(`${p.business_name}: no "thread <id>" in notes`)

    const t = await gmail<{ messages?: GmailMsg[] }>(`/threads/${thread}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, token)
    const msgs = (t.messages ?? [])
      .filter((m) => !(m.labelIds ?? []).includes('DRAFT'))
      .map((m) => ({ id: m.id, at: new Date(Number(m.internalDate)).toISOString(), from: header(m, 'From'), subject: header(m, 'Subject') }))
      .sort((a, b) => a.at.localeCompare(b.at))
    const mine = msgs.filter((m) => MAX_FROM.test(m.from))
    const theirs = msgs.filter((m) => !MAX_FROM.test(m.from) && !BOUNCE_FROM.test(m.from))
    const followups = mine.slice(1, 3) // the first message is the initial email

    const bounces = await gmail<{ messages?: unknown[] }>(`/messages?q=${encodeURIComponent(`from:mailer-daemon "${p.email}"`)}&maxResults=1`, token)
    const bounced = (bounces.messages ?? []).length > 0

    const update: Record<string, string> = {}
    const logs: Record<string, unknown>[] = []
    followups.forEach((m, i) => {
      const field = i === 0 ? 'followup1_sent_at' : 'followup2_sent_at'
      if (!(p as Record<string, unknown>)[field]) {
        update[field] = m.at
        logs.push({ prospect_id: p.id, template_type: i === 0 ? 'followup1' : 'followup2', variant: null, subject: m.subject, body_html: `(sent from Gmail; see message ${m.id})`, resend_id: `gmail:${m.id}`, sent_at: m.at, status: 'sent' })
      }
    })

    let status: string = p.status
    const closed = ['replied', 'bounced', 'unsubscribed']
    if (bounced && !theirs.length && p.status !== 'bounced') {
      status = 'bounced'
      update.bounced_at = p.bounced_at ?? now.toISOString()
    } else if (theirs.length && !['replied', 'unsubscribed'].includes(p.status)) {
      status = 'replied'
      update.replied_at = theirs[0].at
    } else if (!closed.includes(p.status)) {
      status = followups.length === 2 ? 'followup2_sent' : followups.length === 1 ? 'followup1_sent' : 'initial_sent'
    }
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
        const { error: uErr } = await sb.from('prospects').update(update).eq('id', p.id)
        if (uErr) throw new Error(`prospect update failed for ${p.business_name}: ${uErr.message}`)
      }
    }

    const start = new Date(p.initial_sent_at).getTime()
    const due = FOLLOWUP_DAYS.map((d) => new Date(start + d * DAY).toISOString().slice(0, 10))
    const nextDue = status === 'initial_sent' ? due[0] : status === 'followup1_sent' ? due[1] : null
    rows.push({
      business: p.business_name,
      contact: p.contact_name ?? '',
      status,
      sent: (p.initial_sent_at ?? '').slice(0, 10),
      fu1: (update.followup1_sent_at ?? p.followup1_sent_at ?? '').slice(0, 10),
      fu2: (update.followup2_sent_at ?? p.followup2_sent_at ?? '').slice(0, 10),
      reply: (update.replied_at ?? p.replied_at ?? '').slice(0, 10),
      next: nextDue ? `${status === 'initial_sent' ? 'FU1' : 'FU2'} ${nextDue}` : '-',
      due_today: !!nextDue && nextDue <= today,
      changed: Object.keys(update),
    })
  }
  return rows
}

export function manualSummaryLines(rows: ManualRow[]): string {
  if (!rows.length) return 'Hand-sent pitches: none tracked.'
  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {})
  const lines = [`Hand-sent pitches (${rows.length}): ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`]
  const replies = rows.filter((r) => r.changed.includes('replied_at'))
  if (replies.length) lines.push(`NEW REPLIES: ${replies.map((r) => `${r.business} (${r.contact})`).join('; ')}`)
  const due = rows.filter((r) => r.due_today)
  if (due.length) lines.push(`Follow-ups due (Gmail drafts in each thread): ${due.map((r) => `${r.business} ${r.next.split(' ')[0]}`).join('; ')}`)
  return lines.join('\n')
}
