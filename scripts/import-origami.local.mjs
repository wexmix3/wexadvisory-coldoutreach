// One-time import of the Origami trial export (2026-11-03) into prospects, plus the suppressed_domains seed.
// Dry run by default; --live writes. Reads the deduped export written by the aios session:
//   ready-to-email-one-per-business.csv  one verified contact per business, never emailed by Origami
//   campaign-people.json                 every Origami campaign enrollee (their businesses get suppressed)
//   list-rows.json                       raw rows, for industry
// Usage: node --env-file=.env.local scripts/import-origami.local.mjs <exportDir> [--live]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DIR = process.argv[2]
const LIVE = process.argv.includes('--live')
if (!DIR) { console.error('usage: import-origami.local.mjs <exportDir> [--live]'); process.exit(1) }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const TAG = '[origami 2026-11-03]'
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|comcast|att|verizon)\./i
const PLATFORM = new Set(['tinyurl.com', 'bit.ly', 'linktr.ee', 'goo.gl', 't.co', 'rebrand.ly', 'lnk.bio', 'beacons.ai',
  'yelp.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'google.com', 'sites.google.com'])
// "Vice President" is stripped first so it never reads as President; bare "partner" is left out (Partner Success Manager).
const OWNER_TITLE = /\b(owner|co-?owner|founder|co-?founder|ceo|chief executive|president|principal|proprietor|managing (partner|member|director)|founding partner)\b/i
const isOwnerTitle = t => OWNER_TITLE.test(t.replace(/\b(senior |executive |assistant )?vice[\s-]+president\b/gi, ''))
const STATES = { 'new york': 'NY', 'new jersey': 'NJ', connecticut: 'CT', pennsylvania: 'PA', massachusetts: 'MA', california: 'CA', texas: 'TX',
  florida: 'FL', illinois: 'IL', ohio: 'OH', georgia: 'GA', colorado: 'CO', washington: 'WA', arizona: 'AZ', michigan: 'MI', 'north carolina': 'NC',
  virginia: 'VA', maryland: 'MD', minnesota: 'MN', tennessee: 'TN', utah: 'UT', oregon: 'OR', missouri: 'MO', wisconsin: 'WI', indiana: 'IN' }

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [head, ...body] = rows
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
const dom = u => { if (!u) return null; try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }
const emailDomain = e => (e.split('@')[1] ?? '').trim().toLowerCase()
const firstName = n => (n.split(',')[0].trim().split(/\s+/).find(w => !/^(dr|mr|mrs|ms)\.?$/i.test(w)) ?? '').replace(/[^\p{L}'-]/gu, '')
function cityState(loc) {
  const parts = loc.split(',').map(s => s.trim()).filter(p => !/^(united states|north america)$/i.test(p))
  if (/new york city/i.test(loc)) return { city: 'New York', state: 'NY' }
  const city = (parts[0] ?? '').replace(/\s+(metropolitan area|metroplex|area|bay area)$/i, '').replace(/^greater\s+/i, '') || null
  const st = parts.slice(1).map(p => STATES[p.replace(/\s+metropolitan area$/i, '').toLowerCase()] ?? (/^[A-Z]{2}$/.test(p) ? p : null)).find(Boolean)
  return { city, state: st ?? null }
}

// Every business Origami enrolled (emailed, queued until the trial lapses, bounced) plus the one opt-out.
const C = JSON.parse(fs.readFileSync(`${DIR}/campaign-people.json`, 'utf8'))
const L = JSON.parse(fs.readFileSync(`${DIR}/list-rows.json`, 'utf8'))
const rowById = {}; for (const l of Object.values(L)) for (const r of l.rows) rowById[r.id] = r
const suppress = new Map([['armsofeve.com', 'replied "No thanks" to Origami 2026-11-03']])
for (const c of Object.values(C)) for (const p of c.people) {
  const r = rowById[p.row_id]
  for (const d of [p.recipient ? emailDomain(p.recipient) : null, dom(p.identity?.website_url), dom(r?.cells?.['company-domain']?.value)]) {
    if (d && !FREE_MAIL.test(d) && !PLATFORM.has(d) && !suppress.has(d)) suppress.set(d, `Origami campaign "${c.name}" (${p.status}), 2026-10-28 to 2026-11-04`)
  }
}
const industryByEmail = {}, verified = new Set()
for (const l of Object.values(L)) for (const r of l.rows) {
  const v = r.cells?.['verified-work-email']?.value ?? r.cells?.email?.value
  const e = typeof v === 'string' ? v : v?.email
  const ind = r.cells?.industry?.value
  if (e && typeof ind === 'string') industryByEmail[e.toLowerCase()] = ind
  // Older lists carry reachable: true; the search list says so only in the reasoning text.
  if (e && (v?.reachable === true || /deliverability-verified/i.test(v?.reasoning ?? ''))) verified.add(e.toLowerCase())
}

// Current prospects: never import an email or a business (domain) the tool already has.
const existing = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('prospects').select('email, website').range(from, from + 999)
  if (error) throw new Error(`prospects read failed: ${error.message}`)
  existing.push(...data); if (data.length < 1000) break
}
const haveEmail = new Set(existing.map(p => p.email.toLowerCase()))
const haveDomain = new Set(existing.flatMap(p => [emailDomain(p.email), dom(p.website)]).filter(d => d && !FREE_MAIL.test(d)))

const ready = parseCsv(fs.readFileSync(`${DIR}/ready-to-email-one-per-business.csv`, 'utf8'))
const skipped = {}; const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1 }
const out = []; const seen = new Set()
for (const r of ready) {
  if (r.us !== 'US') { skip('outside the US (templates, CAN-SPAM address and ICP are US-only)'); continue }
  const email = r.email.trim().toLowerCase(), ed = emailDomain(email), site = r.domain ? dom(r.domain) : null
  const biz = !FREE_MAIL.test(ed) ? ed : site
  if (!email.includes('@')) { skip('no email'); continue }
  if (PLATFORM.has(ed)) { skip('platform email domain'); continue }
  if (haveEmail.has(email)) { skip('email already in prospects'); continue }
  if (biz && haveDomain.has(biz)) { skip('business already in prospects'); continue }
  if (biz && suppress.has(biz)) { skip('business contacted by Origami'); continue }
  if (biz && seen.has(biz)) { skip('second contact at the same business'); continue }
  const contact_name = firstName(r.name)
  if (!contact_name) { skip('no first name'); continue }
  if (biz) seen.add(biz)
  const owner = isOwnerTitle(r.title)
  const { city, state } = cityState(r.location)
  out.push({
    business_name: r.company.trim(),
    contact_name,
    email,
    website: site ? `https://${site}` : null,
    industry: industryByEmail[email] ?? null,
    city, state,
    status: 'queued',
    enrichment_status: 'pending',
    // Origami verified deliverability ("reachable": true); unknown ones go through verify-contacts like any other.
    email_verification_status: verified.has(email) ? 'deliverable' : 'unverified',
    ...(verified.has(email) ? { email_verified_at: new Date().toISOString() } : {}),
    notes: `${TAG} ${owner ? 'owner' : 'decision-maker'}: ${r.title}${r.company_size ? `; ${r.company_size} staff` : ''}; list: ${r.lists}`,
  })
}

const owners = out.filter(p => p.notes.includes('] owner:')).length
console.log(JSON.stringify({ mode: LIVE ? 'LIVE' : 'dry run', ready_rows: ready.length, to_import: out.length, owners, decision_makers: out.length - owners,
  verified_by_origami: out.filter(p => p.email_verification_status === 'deliverable').length, no_website: out.filter(p => !p.website).length,
  nyc: out.filter(p => p.state === 'NY' && /new york/i.test(p.city ?? '')).length, skipped, suppressed_domains: suppress.size }, null, 1))
if (!LIVE) { out.slice(0, 5).forEach(p => console.log(p.contact_name, '|', p.business_name, '|', p.email, '|', p.city, p.state, '|', p.notes.slice(0, 90))); process.exit(0) }

const sup = [...suppress].map(([domain, reason]) => ({ domain, reason, source: 'origami' }))
const { error: sErr } = await sb.from('suppressed_domains').upsert(sup, { onConflict: 'domain', ignoreDuplicates: true })
if (sErr) throw new Error(`suppressed_domains seed failed: ${sErr.message}`)
const { data: ins, error: iErr } = await sb.from('prospects').insert(out).select('id')
if (iErr) throw new Error(`prospects insert failed: ${iErr.message}`)
console.log(`seeded ${sup.length} suppressed domains; inserted ${ins.length} prospects`)
