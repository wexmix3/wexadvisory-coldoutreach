import { task } from "@trigger.dev/sdk"
import Anthropic from "@anthropic-ai/sdk"
import { fetchHtml, stripHtml } from "@/lib/scraper"
import { createClient } from "@supabase/supabase-js"

// Supabase realtime-js checks for WebSocket at construction time.
// Trigger.dev cloud runs Node 21 (no native WS). We only use REST, so a stub is enough.
if (!globalThis.WebSocket) {
  (globalThis as unknown as Record<string, unknown>).WebSocket = class {}
}

const BATCH_SIZE = 20
// 1200ms between Claude calls = max 50 req/min, under Tier 1 Haiku limit
const RATE_LIMIT_DELAY_MS = 1200
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface EnrichmentResult {
  fit_score: number
  custom_intro: string
  pain_signal: string
}

function extractJson(raw: string): EnrichmentResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON object found")
  return JSON.parse(match[0]) as EnrichmentResult
}

async function callClaude(client: Anthropic, systemPrompt: string, userPrompt: string): Promise<EnrichmentResult | null> {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        // Instructions are identical across every prospect in a batch — cached
        // as a system block so only the first call in a run (within the 5-min
        // TTL) pays full input price for it; the rest read it back at 0.1x.
        // Per-prospect specifics stay in the user message, which is what
        // actually varies call to call.
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      })
      const raw = (message.content[0] as { type: string; text: string }).text.trim()
      const parsed = extractJson(raw)
      return {
        fit_score: Math.max(0, Math.min(100, Math.round(parsed.fit_score))),
        custom_intro: parsed.custom_intro?.trim() ?? "",
        pain_signal: parsed.pain_signal?.trim() ?? "",
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if ((status === 429 || status === 529) && attempt < MAX_RETRIES - 1) {
        await sleep(RATE_LIMIT_DELAY_MS * Math.pow(2, attempt))
        continue
      }
      return null
    }
  }
  return null
}

async function scrapeCompanyContext(website: string): Promise<string> {
  const base = (() => {
    try { return new URL(website).origin } catch { return null }
  })()
  if (!base) return ""

  const sections: { label: string; path: string }[] = [
    { label: "Homepage", path: "" },
    { label: "About", path: "/about" },
    { label: "Blog", path: "/blog" },
    { label: "News", path: "/news" },
    { label: "Careers", path: "/careers" },
    { label: "Jobs", path: "/jobs" },
  ]

  const results: string[] = []
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

  return results.join("\n\n").slice(0, 3500)
}

async function enrichProspect(
  client: Anthropic,
  prospect: {
    id: string
    business_name: string
    industry: string | null
    city: string | null
    state: string | null
    website: string | null
  }
): Promise<EnrichmentResult | null> {
  const location = [prospect.city, prospect.state].filter(Boolean).join(", ")

  const siteContext = prospect.website ? await scrapeCompanyContext(prospect.website) : ""

  const websiteSection = siteContext
    ? `Website context:\n${siteContext}`
    : `Website: ${prospect.website ?? "not available"} (could not be scraped — base your response on industry knowledge)`

  // Static across every prospect in a batch — this is the cached system block.
  const systemPrompt = `You are analyzing a small business to personalize a cold email about AI automation services.

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

custom_intro must feel human and specific. Bad: "Most businesses waste hours on manual tasks." Good: "I noticed Peak Pilates still handles class waitlists and member check-ins via email — that's typically 4-6 hours a week most studios reclaim with simple automation."`

  // Only the per-prospect specifics — everything that actually varies call to call.
  const userPrompt = `Business: ${prospect.business_name} | Industry: ${prospect.industry ?? "unknown"} | Location: ${location || "unknown"}
${websiteSection}`

  return callClaude(client, systemPrompt, userPrompt)
}

export const enrichProspectsTask = task({
  id: "enrich-prospects",
  // No task-level retry — we handle retries inside callClaude per API call
  run: async (payload: { batchSize?: number }) => {
    const client = new Anthropic()
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }
    )
    const limit = payload.batchSize ?? BATCH_SIZE

    const { data: prospects, error } = await sb
      .from("prospects")
      .select("id, business_name, industry, city, state, website")
      .in("enrichment_status", ["pending", "failed"])
      .not("website", "is", null)
      .in("status", ["queued", "new"])
      .order("created_at", { ascending: true })
      .limit(limit)

    if (error) throw new Error(`DB query failed: ${error.message}`)
    if (!prospects || prospects.length === 0) {
      return { enriched: 0, failed: 0, message: "Nothing to enrich" }
    }

    let enriched = 0
    let failed = 0

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i]
      const result = await enrichProspect(client, prospect)

      if (result) {
        const { fit_score, custom_intro, pain_signal } = result
        await sb.from("prospects").update({
          fit_score,
          custom_intro,
          pain_signal,
          enrichment_status: "done",
          enriched_at: new Date().toISOString(),
        }).eq("id", prospect.id)
        enriched++
      } else {
        await sb.from("prospects").update({ enrichment_status: "failed" }).eq("id", prospect.id)
        failed++
      }

      if (i < prospects.length - 1) {
        await sleep(RATE_LIMIT_DELAY_MS)
      }
    }

    return { enriched, failed, total: prospects.length }
  },
})
