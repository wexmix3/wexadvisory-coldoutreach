// One-time backfill: finds an owner first name for queued prospects that have none, so
// they can pass the REQUIRE_CONTACT_NAME hold in app/api/send-scheduled/route.ts.
// Uses the same enrichProspect() as the weekday cron (lib/enrichment.ts), but writes ONLY
// contact_name: fit_score, custom_intro and pain_signal are left as they are.
//
// Run:  npx tsx --env-file=.env.local scripts/backfill-contact-names.ts [--dry-run] [--limit N]
// Cost: one Haiku call per prospect, roughly $0.002 each. Runtime about 4-8s per prospect
//       (up to 4 page fetches with a 5s timeout each, plus a 1.2s rate-limit pause).
// Safe to re-run: it re-reads live state and skips anyone who now has a name.
import Anthropic from '@anthropic-ai/sdk'
import { enrichProspect, nameFitsEmail, RATE_LIMIT_DELAY_MS, EnrichableProspect } from '../lib/enrichment'

const DRY_RUN = process.argv.includes('--dry-run')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : 500
// Same floor send-scheduled applies: no point naming a prospect it will never send to.
const MIN_FIT_SCORE = Number(process.env.MIN_FIT_SCORE ?? 50)

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY')
  process.exit(1)
}
if (!Number.isInteger(LIMIT) || LIMIT < 1) {
  console.error('--limit must be a positive integer')
  process.exit(1)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Node 24's undici can throw `assert(!this.paused)` after a fetch() has already resolved
// (see scripts/backfill-personalization.mjs). Log it and keep going; the run is resumable.
process.on('uncaughtException', (err) => {
  if (String(err?.message).includes('this.paused')) {
    console.warn('[warn] ignored undici socket assertion')
    return
  }
  console.error(err)
  process.exit(1)
})

type Row = EnrichableProspect & { email: string; contact_name: string | null }

async function main() {
  const res = await fetch(
    `${URL_}/rest/v1/prospects?status=eq.queued&website=not.is.null&fit_score=gte.${MIN_FIT_SCORE}&or=(contact_name.is.null,contact_name.eq.)` +
      `&select=id,business_name,industry,city,state,website,email,contact_name&order=fit_score.desc.nullslast&limit=${LIMIT}`,
    { headers }
  )
  if (!res.ok) throw new Error(`prospects query -> ${res.status} ${await res.text()}`)
  const rows = (await res.json()) as Row[]

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}${rows.length} queued prospect(s) at fit >= ${MIN_FIT_SCORE} with no contact name`)
  const client = new Anthropic()
  let named = 0
  let noName = 0
  let failed = 0

  for (let i = 0; i < rows.length; i++) {
    const p = rows[i]
    const result = await enrichProspect(client, p)
    if (!result) {
      failed++
      console.log(`  [failed]  ${p.business_name} <${p.email}>`)
    } else if (!result.contact_first_name) {
      noName++
      console.log(`  [no name] ${p.business_name} <${p.email}>`)
    } else if (!nameFitsEmail(result.contact_first_name, p.email)) {
      noName++
      console.log(`  [skipped] ${p.business_name} <${p.email}>: found ${result.contact_first_name}, but the address is someone else's`)
    } else {
      named++
      console.log(`  [named]   ${p.business_name} <${p.email}> -> ${result.contact_first_name}`)
      if (!DRY_RUN) {
        // The contact_name filter makes this a no-op if a name arrived since the read.
        const up = await fetch(`${URL_}/rest/v1/prospects?id=eq.${p.id}&or=(contact_name.is.null,contact_name.eq.)`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ contact_name: result.contact_first_name }),
        })
        if (!up.ok) throw new Error(`update ${p.id} -> ${up.status} ${await up.text()}`)
      }
    }
    if (i < rows.length - 1) await sleep(RATE_LIMIT_DELAY_MS)
  }

  const rate = rows.length ? Math.round((named / rows.length) * 100) : 0
  console.log(`\nDone. named=${named} (${rate}%) no_name=${noName} failed=${failed} total=${rows.length}${DRY_RUN ? ' (nothing written)' : ''}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
