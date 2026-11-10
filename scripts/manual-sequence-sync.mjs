// Sync hand-sent Gmail pitches into the outreach engine and print where each one stands.
//
// Covers prospects whose notes start with "[manual-gmail" (Max sends these from his own Gmail; the
// domain is in suppressed_domains so send-scheduled never touches them). For each one it reads the
// Gmail thread named in the notes ("thread <16 hex>") and:
//   - every later message from Max in that thread  -> followup1 / followup2 (prospect fields + email_log row)
//   - any message from someone else (not a bounce)  -> status 'replied', replied_at
//   - a mailer-daemon bounce naming the address      -> status 'bounced', bounced_at
// Dry run by default. --apply writes. --html <path> also writes a status page.
//
//   node scripts/manual-sequence-sync.mjs            (dry run, prints the table)
//   node scripts/manual-sequence-sync.mjs --apply --html ../aios/state/outreach/manual-pitches.html
//
// Fails loudly: any Gmail or Supabase error exits non-zero.

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const htmlIdx = args.indexOf('--html')
const HTML_OUT = htmlIdx >= 0 ? args[htmlIdx + 1] : null

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']) {
  if (!env[k]) throw new Error(`${k} missing from .env.local`)
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const FOLLOWUP_DAYS = [3, 5] // follow-up 1 and 2, counted from the first email
const MAX_FROM = /wexadvisory\.com/i
const BOUNCE_FROM = /mailer-daemon|postmaster/i

async function token() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}
const TOKEN = await token()
async function gmail(path) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  if (!res.ok) throw new Error(`Gmail API error (${path}): ${res.status} ${await res.text()}`)
  return res.json()
}
const header = (m, name) => (m.payload?.headers ?? []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

const { data: prospects, error } = await sb.from('prospects')
  .select('id,business_name,contact_name,email,status,notes,initial_sent_at,followup1_sent_at,followup2_sent_at,replied_at,bounced_at')
  .like('notes', '[manual-gmail%').order('initial_sent_at')
if (error) throw new Error(`prospects read failed: ${error.message}`)

const rows = []
for (const p of prospects) {
  const thread = p.notes.match(/thread ([0-9a-f]{16})/)?.[1]
  if (!thread) throw new Error(`${p.business_name}: no "thread <id>" in notes`)
  const t = await gmail(`/threads/${thread}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`)
  const msgs = (t.messages ?? []).map(m => ({ id: m.id, at: new Date(Number(m.internalDate)).toISOString(), from: header(m, 'From'), subject: header(m, 'Subject'), labels: m.labelIds ?? [] }))
    .filter(m => !m.labels.includes('DRAFT')).sort((a, b) => a.at.localeCompare(b.at))
  const mine = msgs.filter(m => MAX_FROM.test(m.from))
  const theirs = msgs.filter(m => !MAX_FROM.test(m.from) && !BOUNCE_FROM.test(m.from))
  const followups = mine.slice(1, 3) // first message is the initial email

  const bounces = await gmail(`/messages?q=${encodeURIComponent(`from:mailer-daemon "${p.email}"`)}&maxResults=1`)
  const bounced = (bounces.messages ?? []).length > 0

  const update = {}
  const logs = []
  followups.forEach((m, i) => {
    const field = i === 0 ? 'followup1_sent_at' : 'followup2_sent_at'
    if (!p[field]) {
      update[field] = m.at
      logs.push({ prospect_id: p.id, template_type: i === 0 ? 'followup1' : 'followup2', variant: null, subject: m.subject, body_html: `(sent from Gmail; see message ${m.id})`, resend_id: `gmail:${m.id}`, sent_at: m.at, status: 'sent' })
    }
  })
  let status = p.status
  if (bounced && p.status !== 'bounced' && !theirs.length) { status = 'bounced'; update.bounced_at = p.bounced_at ?? new Date().toISOString() }
  else if (theirs.length && p.status !== 'replied' && p.status !== 'unsubscribed') { status = 'replied'; update.replied_at = theirs[0].at }
  else if (p.status !== 'replied' && p.status !== 'bounced' && p.status !== 'unsubscribed') {
    status = followups.length === 2 ? 'followup2_sent' : followups.length === 1 ? 'followup1_sent' : 'initial_sent'
  }
  if (status !== p.status) update.status = status

  if (APPLY && (Object.keys(update).length || logs.length)) {
    if (logs.length) {
      const { data: have, error: hErr } = await sb.from('email_log').select('resend_id').eq('prospect_id', p.id)
      if (hErr) throw new Error(`email_log read failed: ${hErr.message}`)
      const seen = new Set((have ?? []).map(r => r.resend_id))
      const fresh = logs.filter(l => !seen.has(l.resend_id))
      if (fresh.length) { const { error: lErr } = await sb.from('email_log').insert(fresh); if (lErr) throw new Error(`email_log insert failed: ${lErr.message}`) }
    }
    if (Object.keys(update).length) { const { error: uErr } = await sb.from('prospects').update(update).eq('id', p.id); if (uErr) throw new Error(`prospect update failed: ${uErr.message}`) }
  }

  const start = new Date(p.initial_sent_at)
  const due = FOLLOWUP_DAYS.map(d => new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10))
  const next = status === 'initial_sent' ? `FU1 ${due[0]}` : status === 'followup1_sent' ? `FU2 ${due[1]}` : '-'
  rows.push({ business: p.business_name, contact: p.contact_name ?? '', email: p.email, status, sent: p.initial_sent_at?.slice(0, 10), fu1: (update.followup1_sent_at ?? p.followup1_sent_at)?.slice(0, 10) ?? '', fu2: (update.followup2_sent_at ?? p.followup2_sent_at)?.slice(0, 10) ?? '', reply: (update.replied_at ?? p.replied_at)?.slice(0, 10) ?? '', next, changed: Object.keys(update).join(',') })
}

console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'} - ${rows.length} hand-sent pitches`)
console.table(rows.map(({ email, ...r }) => r))
const counts = rows.reduce((a, r) => (a[r.status] = (a[r.status] ?? 0) + 1, a), {})
console.log('by status:', JSON.stringify(counts))

if (HTML_OUT) {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const tone = s => s === 'replied' ? 'ok' : s === 'bounced' ? 'bad' : ''
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manual Pitch Tracker</title>
<style>:root{--bg:#f7f6f2;--card:#fff;--ink:#1d1d1b;--mute:#66645e;--line:#e3e0d8;--ok:#1f5c4a;--okbg:#e4efe9;--bad:#8f2424;--badbg:#f6e1e1}
@media (prefers-color-scheme:dark){:root{--bg:#151513;--card:#1f1f1c;--ink:#ecebe6;--mute:#a19f97;--line:#34332f;--ok:#7cc4a8;--okbg:#1d3029;--bad:#e78b8b;--badbg:#3a2020}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:980px;margin:0 auto;padding:28px 16px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 16px}.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute)}
.tag{padding:1px 8px;border-radius:10px;font-weight:600;font-size:12px}.ok{background:var(--okbg);color:var(--ok)}.bad{background:var(--badbg);color:var(--bad)}</style></head><body><main>
<h1>Hand-sent pitches</h1><p class="sub">Synced ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from Gmail threads into the outreach engine. ${esc(Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '))}.</p>
<div class="wrap"><table><tr><th>Business</th><th>Contact</th><th>Status</th><th>Sent</th><th>FU1</th><th>FU2</th><th>Reply</th><th>Next</th></tr>
${rows.map(r => `<tr><td>${esc(r.business)}</td><td>${esc(r.contact)}</td><td><span class="tag ${tone(r.status)}">${esc(r.status)}</span></td><td>${esc(r.sent)}</td><td>${esc(r.fu1)}</td><td>${esc(r.fu2)}</td><td>${esc(r.reply)}</td><td>${esc(r.next)}</td></tr>`).join('\n')}
</table></div></main></body></html>`
  fs.mkdirSync(path.dirname(path.resolve(HTML_OUT)), { recursive: true })
  fs.writeFileSync(HTML_OUT, html)
  console.log('wrote', HTML_OUT)
}
