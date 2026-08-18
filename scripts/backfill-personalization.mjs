// One-time backfill: regenerates custom_intro for prospects still eligible for
// future sends (queued / initial_sent / followup1_sent) that either (a) were never
// enriched because they were sent before entering the enrichment gate, or (b) have
// a Haiku-written intro that opens with the banned "I noticed" pattern the old
// few-shot example in trigger/enrich-prospects.ts was accidentally training toward.
// Mirrors enrichProspect() in trigger/enrich-prospects.ts with the fixed prompt.
//
// Run: node --env-file=.env.local scripts/backfill-personalization.mjs [--dry-run]
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')
const RATE_LIMIT_DELAY_MS = 1200

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const client = new Anthropic()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Node 24's undici throws `assert(!this.paused)` from an internal socket-finish
// handler *after* a fetch() has already resolved -- a known Node 24 flakiness with
// rapid sequential fetches, not a bug in this script's logic. It surfaces as an
// uncaught process-level exception no local try/catch can intercept, so without this
// handler the whole run dies mid-batch (confirmed 2026-08-18: crashed at 52/438).
// Log and continue -- each iteration's Supabase write already happened or didn't
// before this fires, so swallowing it here doesn't risk silent data loss.
process.on('uncaughtException', (err) => {
  console.error('  [non-fatal] uncaught exception (likely Node 24/undici socket bug), continuing:', err.message)
})

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function scrapeCompanyContext(website) {
  const base = (() => {
    try { return new URL(website).origin } catch { return null }
  })()
  if (!base) return ''

  const sections = [
    { label: 'Homepage', path: '' },
    { label: 'About', path: '/about' },
    { label: 'Blog', path: '/blog' },
    { label: 'News', path: '/news' },
    { label: 'Careers', path: '/careers' },
    { label: 'Jobs', path: '/jobs' },
  ]

  const results = []
  let fetched = 0
  for (const { label, path } of sections) {
    if (fetched >= 3) break
    const url = path ? `${base}${path}` : website
    const html = await fetchHtml(url)
    if (!html) continue
    const text = stripHtml(html).slice(0, 1200)
    if (text.length < 50) continue
    results.push(`[${label}]: ${text}`)
    fetched++
  }
  return results.join('\n\n').slice(0, 3500)
}

function extractJson(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found')
  return JSON.parse(match[0])
}

// Same fixed prompt as trigger/enrich-prospects.ts (2026-08-18 fix: the old "Good"
// example opened with "I noticed", which Haiku was copying verbatim on 89% of calls).
const SYSTEM_PROMPT = `You are analyzing a small business to personalize a cold email about AI automation services.

Reply with valid JSON only — no prose, no markdown:
{
  "fit_score": <integer 0-100>,
  "custom_intro": "<1-2 sentences referencing something specific about this business — a service they likely offer, a manual process typical for their industry, or a pain point implied by their site>",
  "pain_signal": "<5-10 word phrase naming the specific manual process>"
}

fit_score guidelines:
- 80-100: Clear manual ops — many services listed, no tech/automation mentions, contact-form-only, owner-operated feel
- 60-79: Likely manual, maybe one tool mentioned
- 40-59: Mixed signals
- 20-39: Some automation already in place
- 0-19: Tech-forward, wrong fit, or site had no useful content
- If a careers/jobs page was found with open roles, raise score by 10-15 points (active hiring = budget available)
- If the about page mentions a small team or founder-run business, raise score — these are the ideal buyers

custom_intro must feel human and specific, and must NOT start with "I noticed" — vary the opening every time. Bad (generic): "Most businesses waste hours on manual tasks." Bad (formulaic, do not imitate this opener): "I noticed Peak Pilates still handles class waitlists manually." Good examples — study the variety of openings, don't default to any single pattern:
- "Peak Pilates likely handles class waitlists and member check-ins over email — most studios that size reclaim 4-6 hours a week automating that."
- "Running a multi-location dental practice usually means someone's manually chasing insurance verifications between offices."
- "Law firms this size typically still route intake calls to a human before anything hits the calendar."
- "Between managing listings and client follow-up, real estate teams like this rarely have time left to automate the repetitive parts."`

async function callClaude(systemPrompt, userPrompt) {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
      })
      const raw = message.content[0].text.trim()
      const parsed = extractJson(raw)
      return {
        fit_score: Math.max(0, Math.min(100, Math.round(parsed.fit_score))),
        custom_intro: parsed.custom_intro?.trim() ?? '',
        pain_signal: parsed.pain_signal?.trim() ?? '',
      }
    } catch (err) {
      const status = err?.status
      if ((status === 429 || status === 529) && attempt < MAX_RETRIES - 1) {
        await sleep(RATE_LIMIT_DELAY_MS * Math.pow(2, attempt))
        continue
      }
      return null
    }
  }
  return null
}

async function enrichProspect(prospect) {
  const location = [prospect.city, prospect.state].filter(Boolean).join(', ')
  const siteContext = prospect.website ? await scrapeCompanyContext(prospect.website) : ''
  const websiteSection = siteContext
    ? `Website context:\n${siteContext}`
    : `Website: ${prospect.website ?? 'not available'} (could not be scraped — base your response on industry knowledge)`
  const userPrompt = `Business: ${prospect.business_name} | Industry: ${prospect.industry ?? 'unknown'} | Location: ${location || 'unknown'}
${websiteSection}`
  return callClaude(SYSTEM_PROMPT, userPrompt)
}

async function main() {
  const ACTIVE_STATUSES = ['queued', 'initial_sent', 'followup1_sent']

  const { data: prospects, error } = await sb
    .from('prospects')
    .select('id, business_name, industry, city, state, website, status, custom_intro')
    .in('status', ACTIVE_STATUSES)

  if (error) { console.error('Query failed:', error.message); process.exit(1) }

  const target = prospects.filter((p) => {
    const noIntro = !p.custom_intro || !p.custom_intro.trim()
    const badOpener = p.custom_intro && /^i noticed/i.test(p.custom_intro.trim())
    return noIntro || badOpener
  })

  console.log(`Found ${target.length} prospects to backfill (of ${prospects.length} still-active total).`)
  if (DRY_RUN) {
    console.log('--dry-run: not calling Claude or writing to Supabase. Sample:')
    console.log(target.slice(0, 5).map((p) => ({ name: p.business_name, prior_intro: p.custom_intro?.slice(0, 60) })))
    return
  }

  let updated = 0
  let failed = 0
  for (let i = 0; i < target.length; i++) {
    const p = target[i]
    const result = await enrichProspect(p)
    if (result) {
      const { error: updErr } = await sb
        .from('prospects')
        .update({
          fit_score: result.fit_score,
          custom_intro: result.custom_intro,
          pain_signal: result.pain_signal,
          enrichment_status: 'done',
          enriched_at: new Date().toISOString(),
        })
        .eq('id', p.id)
      if (updErr) { console.error(`  write failed for ${p.business_name}: ${updErr.message}`); failed++ }
      else { updated++; console.log(`  [${i + 1}/${target.length}] ${p.business_name} -> "${result.custom_intro.slice(0, 70)}..."`) }
    } else {
      failed++
      console.error(`  [${i + 1}/${target.length}] ${p.business_name} -> Claude call failed`)
    }
    if (i < target.length - 1) await sleep(RATE_LIMIT_DELAY_MS)
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`)
}

main()
