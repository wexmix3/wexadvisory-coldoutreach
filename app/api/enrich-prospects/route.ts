import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fetchHtml, stripHtml } from '@/lib/scraper'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_SIZE = 20
const client = new Anthropic()

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface EnrichmentResult {
  fit_score: number
  custom_intro: string
  pain_signal: string
}

function extractJson(raw: string): EnrichmentResult {
  // Strip markdown fences Haiku sometimes adds despite instructions
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Greedy match: find the outermost {...} block
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found')
  return JSON.parse(match[0]) as EnrichmentResult
}

async function callClaude(prompt: string): Promise<EnrichmentResult | null> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    const parsed = extractJson(raw)
    return {
      fit_score: Math.max(0, Math.min(100, Math.round(parsed.fit_score))),
      custom_intro: parsed.custom_intro?.trim() ?? '',
      pain_signal: parsed.pain_signal?.trim() ?? '',
    }
  } catch {
    return null
  }
}

async function enrichProspect(prospect: {
  id: string
  business_name: string
  industry: string | null
  city: string | null
  state: string | null
  website: string | null
}): Promise<EnrichmentResult | null> {
  const location = [prospect.city, prospect.state].filter(Boolean).join(', ')

  // Try to scrape website for richer personalization
  const siteContext = await (async () => {
    if (!prospect.website) return ''
    const html = await fetchHtml(prospect.website)
    if (!html) return ''
    return stripHtml(html).slice(0, 3000)
  })()

  const websiteSection = siteContext
    ? `Website content: ${siteContext}`
    : `Website: ${prospect.website ?? 'not available'} (could not be scraped — base your response on industry knowledge)`

  const prompt = `You are analyzing a small business to personalize a cold email about AI automation services.

Business: ${prospect.business_name} | Industry: ${prospect.industry ?? 'unknown'} | Location: ${location || 'unknown'}
${websiteSection}

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

custom_intro must feel human and specific. Bad: "Most businesses waste hours on manual tasks." Good: "I noticed Peak Pilates still handles class waitlists and member check-ins via email — that's typically 4-6 hours a week most studios reclaim with simple automation."`

  return callClaude(prompt)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getSupabaseAdmin()

  const { data: prospects, error } = await sb
    .from('prospects')
    .select('id, business_name, industry, city, state, website')
    .in('enrichment_status', ['pending', 'failed'])
    .not('website', 'is', null)
    .in('status', ['queued', 'new'])
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!prospects || prospects.length === 0) {
    return NextResponse.json({ enriched: 0, failed: 0, message: 'Nothing to enrich' })
  }

  const results = await Promise.allSettled(
    prospects.map(p => enrichProspect(p))
  )

  let enriched = 0
  let failed = 0

  await Promise.all(
    results.map(async (result, i) => {
      const prospect = prospects[i]
      if (result.status === 'fulfilled' && result.value) {
        const { fit_score, custom_intro, pain_signal } = result.value
        await sb.from('prospects').update({
          fit_score,
          custom_intro,
          pain_signal,
          enrichment_status: 'done',
          enriched_at: new Date().toISOString(),
        }).eq('id', prospect.id)
        enriched++
      } else {
        await sb.from('prospects').update({ enrichment_status: 'failed' }).eq('id', prospect.id)
        failed++
      }
    })
  )

  return NextResponse.json({ enriched, failed })
}
