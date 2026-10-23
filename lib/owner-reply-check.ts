import { SupabaseClient } from '@supabase/supabase-js'
import { getGmailAccessToken } from '@/lib/dmarc/gmail-auth'

// Weekly readout of whether emailing named decision makers (owner-finder contacts) gets replies, against the other
// named contacts sent since the named-contact rule went live (2026-10-07). reply-scan records replies on the
// prospect row (replied_at, plus unsubscribed_at for opt-outs), so that is what is counted here. Whether a reply
// is genuinely interested is a human call: every non-opt-out reply is listed with its text so Max can judge.

const NAMED_RULE_START = '2026-10-07'
// Owner-finder contacts: the 2026-10-22/23 trials (notes cite B-180 / B-183) and the daily step's finds.
const OWNER_NOTE = /B-18[03]\b|\[owner-finder [\d-]+\] found/
const REAPPROACH_NOTE = /\[reapproach [\d-]+\] found/
export const DECISION_SAMPLE = 60

type Row = {
  id: string
  business_name: string
  contact_name: string | null
  email: string
  notes: string | null
  status: string
  initial_sent_at: string | null
  replied_at: string | null
  unsubscribed_at: string | null
  bounced_at: string | null
}

type Cohort = { label: string; sent: number; replied: number; optedOut: number; bounced: number; replies: Row[] }

function cohort(label: string, rows: Row[]): Cohort {
  const sent = rows.filter(r => r.initial_sent_at)
  const replied = sent.filter(r => r.replied_at)
  return {
    label,
    sent: sent.length,
    replied: replied.length,
    optedOut: replied.filter(r => r.unsubscribed_at).length,
    bounced: sent.filter(r => r.bounced_at || r.status === 'bounced').length,
    replies: replied.filter(r => !r.unsubscribed_at),
  }
}

const per100 = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : '-')
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function latestReplyText(token: string, email: string): Promise<string> {
  const q = encodeURIComponent(`from:${email} -in:sent newer_than:90d`)
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&q=${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!list.ok) throw new Error(`Gmail search failed for ${email}: ${list.status}`)
  const id = ((await list.json()) as { messages?: { id: string }[] }).messages?.[0]?.id
  if (!id) return '(reply recorded but not found in Gmail)'
  const msg = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!msg.ok) throw new Error(`Gmail read failed for ${email}: ${msg.status}`)
  // Gmail snippets arrive HTML-escaped; decode so esc() below escapes exactly once.
  const snippet = ((await msg.json()) as { snippet?: string }).snippet ?? ''
  return snippet.replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]!))
}

export type OwnerReplyReport = { subject: string; html: string; owner: Omit<Cohort, "replies">; reapproach: Omit<Cohort, "replies">; other: Omit<Cohort, "replies"> }

export async function buildOwnerReplyReport(sb: SupabaseClient): Promise<OwnerReplyReport> {
  const { data, error } = await sb
    .from('prospects')
    .select('id, business_name, contact_name, email, notes, status, initial_sent_at, replied_at, unsubscribed_at, bounced_at')
    .not('contact_name', 'is', null)
    .neq('contact_name', '')
    .or(`initial_sent_at.gte.${NAMED_RULE_START},status.eq.queued`)
    .limit(5000)
  if (error) throw new Error(`Supabase read failed: ${error.message}`)
  const rows = (data ?? []) as Row[]
  const isOwner = (r: Row) => OWNER_NOTE.test(r.notes ?? '')
  // Owners found for businesses that got the old anonymous sequence (lib/reapproach.ts): a second contact, so
  // tracked apart from first-contact owners.
  const isReapproach = (r: Row) => REAPPROACH_NOTE.test(r.notes ?? '')
  const owner = cohort('Owner-finder contacts', rows.filter(isOwner))
  const reapproach = cohort('Re-approach owners (2nd contact)', rows.filter(isReapproach))
  const other = cohort('Other named contacts (since 10-07)', rows.filter(r => !isOwner(r) && !isReapproach(r) && r.initial_sent_at && r.initial_sent_at >= NAMED_RULE_START))
  const queuedOwners = rows.filter(r => isOwner(r) && r.status === 'queued').length

  const token = owner.replies.length || reapproach.replies.length || other.replies.length ? await getGmailAccessToken() : ''
  const replyItems = async (c: Cohort) => {
    const items: string[] = []
    for (const r of c.replies) {
      const text = await latestReplyText(token, r.email)
      items.push(`<li><b>${esc(r.contact_name ?? '')}</b>, ${esc(r.business_name)} &lt;${esc(r.email)}&gt;<br><i>${esc(text)}</i></li>`)
    }
    return items.length ? `<ul>${items.join('')}</ul>` : '<p>None yet.</p>'
  }

  const remaining = Math.max(0, DECISION_SAMPLE - owner.sent)
  const decision = remaining
    ? `<p><b>Not ready to decide.</b> ${owner.sent} owner-finder first emails are out; the call needs ${DECISION_SAMPLE}. ` +
      `${queuedOwners} more owner-finder contacts are queued, so about ${remaining} to go.</p>`
    : `<p><b>Ready to decide.</b> ${owner.sent} owner-finder first emails are out. Count the replies below that are genuinely interested. ` +
      `2 or more per 100 sent: buy Firecrawl Hobby ($19/mo, about 165 owner lookups a month). 0 or 1: stay on the free tier ` +
      `and look at the offer and the email copy, because finding the right person is no longer the problem.</p>`

  const row = (c: Cohort) =>
    `<tr><td>${c.label}</td><td>${c.sent}</td><td>${c.replied}</td><td>${c.optedOut}</td><td>${c.replied - c.optedOut}</td>` +
    `<td>${per100(c.replied - c.optedOut, c.sent)}</td><td>${c.bounced}</td></tr>`

  const html = `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.5">
    <h2>Owner reply check</h2>
    ${decision}
    <table style="border-collapse:collapse" cellpadding="6" border="1">
      <tr style="background:#f3f3f3"><th>Group</th><th>First emails</th><th>Replies</th><th>Opt-outs</th><th>Other replies</th><th>Other replies per 100</th><th>Bounced</th></tr>
      ${row(owner)}${row(reapproach)}${row(other)}
    </table>
    <p style="color:#666">"Other replies" are every reply that was not an opt-out. Interested or not is your call; the text is below.</p>
    <h3>Owner-finder replies</h3>${await replyItems(owner)}
    <h3>Re-approach replies</h3>${await replyItems(reapproach)}
    <h3>Other named replies</h3>${await replyItems(other)}
    <p style="color:#666">Sent every Thursday at 14:30 UTC by /api/owner-reply-check. No email on a Thursday means it did not run.</p>
    </div>`

  const subject = `Owner reply check: ${owner.sent} owner emails out, ${owner.replied - owner.optedOut} non-opt-out replies` +
    (remaining ? '' : ' - ready to decide')
  const strip = (c: Cohort) => ({ label: c.label, sent: c.sent, replied: c.replied, optedOut: c.optedOut, bounced: c.bounced })
  return { subject, html, owner: strip(owner), reapproach: strip(reapproach), other: strip(other) }
}
