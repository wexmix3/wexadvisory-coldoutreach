// "PITCH SYNC": run the hand-sent pitch sync on the deployed app and write a status page.
//
// The logic lives in lib/manual-sync.ts and runs on Vercel at /api/manual-sync (and inside the weekday
// daily-status email). This script only calls that route with the cron secret from .env.local, prints the
// table and, with --html, writes a status page.
//
//   node scripts/manual-sequence-sync.mjs                    (sync and print)
//   node scripts/manual-sequence-sync.mjs --dry              (no writes)
//   node scripts/manual-sequence-sync.mjs --html ../aios/state/outreach/manual-pitches.html
//   node scripts/manual-sequence-sync.mjs --base http://localhost:3002   (local dev server)
//
// Exits non-zero on any error.

import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const DRY = args.includes('--dry')
const HTML_OUT = opt('--html')
const BASE = opt('--base') ?? 'https://outreach-tool-inky.vercel.app'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] }),
)
if (!env.CRON_SECRET) throw new Error('CRON_SECRET missing from .env.local')

const res = await fetch(`${BASE}/api/manual-sync${DRY ? '?apply=0' : ''}`, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })
const body = await res.json().catch(() => ({}))
if (!res.ok) { console.error(`manual-sync failed: ${res.status} ${body.error ?? JSON.stringify(body)}`); process.exit(1) }

const rows = body.rows
console.log(`${body.applied ? 'APPLIED' : 'DRY RUN'} - ${rows.length} hand-sent pitches`)
console.table(rows.map(({ due_today, changed, ...r }) => ({ ...r, changed: changed.join(',') })))
console.log(body.summary)

if (HTML_OUT) {
  const counts = rows.reduce((a, r) => (a[r.status] = (a[r.status] ?? 0) + 1, a), {})
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const tone = s => s === 'replied' ? 'ok' : s === 'bounced' ? 'bad' : ''
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manual Pitch Tracker</title>
<style>:root{--bg:#f7f6f2;--card:#fff;--ink:#1d1d1b;--mute:#66645e;--line:#e3e0d8;--ok:#1f5c4a;--okbg:#e4efe9;--bad:#8f2424;--badbg:#f6e1e1;--due:#8a4b0f}
@media (prefers-color-scheme:dark){:root{--bg:#151513;--card:#1f1f1c;--ink:#ecebe6;--mute:#a19f97;--line:#34332f;--ok:#7cc4a8;--okbg:#1d3029;--bad:#e78b8b;--badbg:#3a2020;--due:#e0a565}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:980px;margin:0 auto;padding:28px 16px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 16px}.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--mute)}
.tag{padding:1px 8px;border-radius:10px;font-weight:600;font-size:12px}.ok{background:var(--okbg);color:var(--ok)}.bad{background:var(--badbg);color:var(--bad)}.due{color:var(--due);font-weight:600}</style></head><body><main>
<h1>Hand-sent pitches</h1><p class="sub">Synced ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from the Gmail threads into the outreach engine. ${esc(Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '))}. Also synced every weekday by the daily-status email.</p>
<div class="wrap"><table><tr><th>Business</th><th>Contact</th><th>Status</th><th>Sent</th><th>FU1</th><th>FU2</th><th>Reply</th><th>Next</th></tr>
${rows.map(r => `<tr><td>${esc(r.business)}</td><td>${esc(r.contact)}</td><td><span class="tag ${tone(r.status)}">${esc(r.status)}</span></td><td>${esc(r.sent)}</td><td>${esc(r.fu1)}</td><td>${esc(r.fu2)}</td><td>${esc(r.reply)}</td><td class="${r.due_today ? 'due' : ''}">${esc(r.next)}${r.due_today ? ' (due)' : ''}</td></tr>`).join('\n')}
</table></div></main></body></html>`
  fs.mkdirSync(path.dirname(path.resolve(HTML_OUT)), { recursive: true })
  fs.writeFileSync(HTML_OUT, html)
  console.log('wrote', HTML_OUT)
}
