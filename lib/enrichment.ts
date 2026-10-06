import Anthropic from "@anthropic-ai/sdk"
import { fetchHtml, stripHtml } from "./scraper"

// Shared by trigger/enrich-prospects.ts (the weekday cron) and
// scripts/backfill-contact-names.ts, so the prompt cannot drift between them.

// 1200ms between Claude calls = max 50 req/min, under Tier 1 Haiku limit
export const RATE_LIMIT_DELAY_MS = 1200
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const PAGE_CHARS = 1500
const MAX_PAGES = 4
const CONTEXT_CHARS = 5500

export interface EnrichmentResult {
  fit_score: number
  custom_intro: string
  pain_signal: string
  // Validated against the scraped text by validateOwnerFirstName(); null when the
  // site names nobody, the scrape failed, or the model's answer is not in the text.
  contact_first_name: string | null
}

export interface EnrichableProspect {
  id: string
  business_name: string
  industry: string | null
  city: string | null
  state: string | null
  website: string | null
}

interface RawEnrichment {
  fit_score: number
  custom_intro?: string
  pain_signal?: string
  owner_first_name?: string | null
}

function extractJson(raw: string): RawEnrichment {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON object found")
  return JSON.parse(match[0]) as RawEnrichment
}

// Words the model sometimes returns in place of a person's name.
const NOT_A_NAME = new Set([
  "team", "our", "the", "owner", "founder", "admin", "info", "contact", "staff", "office",
  "manager", "welcome", "about", "home", "null", "none", "unknown", "doctor", "attorney",
])

// A greeting with the wrong name is worse than "Hi there", so the name is only kept
// when it appears in the text we scraped as a capitalised whole word ("Mark" or "MARK",
// never "mark"). This is enforced here, not in the prompt, so an invented name is
// rejected unless the site happens to contain that same capitalised word.
export function validateOwnerFirstName(candidate: unknown, siteContext: string): string | null {
  if (typeof candidate !== "string") return null
  const words = candidate.trim().split(/\s+/)
  const hadTitle = /^(dr|mr|mrs|ms)\.?$/i.test(words[0] ?? "")
  if (hadTitle) words.shift()
  // "Dr. Smith" is a surname; only "Dr. Jane Smith" tells us the first name.
  if (hadTitle && words.length < 2) return null
  const first = words[0] ?? ""
  // RegExp constructor, not a literal: \p{L} needs es2018 and tsconfig targets es2017.
  if (!new RegExp("^\\p{L}[\\p{L}'-]{1,19}$", "u").test(first)) return null
  if (NOT_A_NAME.has(first.toLowerCase())) return null
  const name = first[0].toUpperCase() + first.slice(1).toLowerCase()
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const inContext = new RegExp(`(?<![\\p{L}])(?:${escape(name)}|${escape(name.toUpperCase())})(?![\\p{L}])`, "u").test(siteContext)
  if (!inContext) return null
  return name
}

const ROLE_INBOX = /^(info|office|contact|contactus|hello|hey|hi|admin|support|service|sales|team|appointments|frontdesk|reception|inquiries|enquiries|mail|help|booking|bookings|billing|careers|marketing|general|welcome|mgmt|management|staff)$/

// The site's owner is only the right greeting when the address is a shared inbox, or is
// plainly that person's own. "Hi Gene" sent to lauren@ greets the wrong person.
export function nameFitsEmail(firstName: string, email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? ""
  if (ROLE_INBOX.test(local.replace(/[^a-z]/g, ""))) return true
  // Whole token (gene.kansas@), or a prefix for names long enough that "ed" in fred@
  // or "al" in mallory@ cannot match by accident.
  const name = firstName.toLowerCase()
  const tokens = local.split(/[._\-+0-9]+/).filter(Boolean)
  return tokens.some(t => t === name || (name.length >= 4 && t.startsWith(name)))
}

// Code-based quality gate on Claude's enrichment output -- no extra API call,
// runs in <1ms, same pattern as ai-audit's checkAuditQuality. Nothing here
// checked custom_intro/pain_signal for correctness before this; the prompt's
// own "don't start with 'I noticed'" rule was never enforced, only prompted.
// Also catches the "perfect email, wrong customer" failure mode -- a
// plausible-sounding intro that doesn't actually reference this business.
export function checkEnrichmentQuality(
  result: Pick<EnrichmentResult, "custom_intro" | "pain_signal">,
  businessName: string
): string | null {
  if (result.custom_intro.length < 20) return "custom_intro too short/empty"
  if (/^i noticed\b/i.test(result.custom_intro.trim())) return "custom_intro uses banned 'I noticed' opener"
  if (result.pain_signal.length < 8) return "pain_signal too short/empty"

  const nameWords = businessName.toLowerCase().split(/\s+/).filter((w) => w.length >= 4)
  const intro = result.custom_intro.toLowerCase()
  const mentionsBusiness = nameWords.length === 0 || nameWords.some((w) => intro.includes(w))
  if (!mentionsBusiness) return `custom_intro doesn't reference "${businessName}"`

  return null
}

async function callClaude(client: Anthropic, systemPrompt: string, userPrompt: string): Promise<RawEnrichment | null> {
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 260,
        // Instructions are identical across every prospect in a batch — cached
        // as a system block so only the first call in a run (within the 5-min
        // TTL) pays full input price for it; the rest read it back at 0.1x.
        // Per-prospect specifics stay in the user message, which is what
        // actually varies call to call.
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      })
      const raw = (message.content[0] as { type: string; text: string }).text.trim()
      return extractJson(raw)
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

export async function scrapeCompanyContext(website: string): Promise<string> {
  const base = (() => {
    try { return new URL(website).origin } catch { return null }
  })()
  if (!base) return ""

  // About and team pages come before blog/news: they are where the owner is named.
  const sections: { label: string; path: string }[] = [
    { label: "Homepage", path: "" },
    { label: "About", path: "/about" },
    { label: "About", path: "/about-us" },
    { label: "Team", path: "/team" },
    { label: "Team", path: "/our-team" },
    { label: "Careers", path: "/careers" },
    { label: "Jobs", path: "/jobs" },
    { label: "Blog", path: "/blog" },
    { label: "News", path: "/news" },
  ]

  // Fetched together so one prospect costs one 5s timeout at worst, not one per path.
  const pages = await Promise.all(sections.map(({ path }) => fetchHtml(path ? `${base}${path}` : website)))

  const results: string[] = []
  const seenLabels = new Set<string>()

  for (let i = 0; i < sections.length; i++) {
    const { label } = sections[i]
    if (results.length >= MAX_PAGES) break
    if (seenLabels.has(label)) continue
    const html = pages[i]
    if (!html) continue
    const text = stripHtml(html).slice(0, PAGE_CHARS)
    if (text.length < 50) continue
    results.push(`[${label}]: ${text}`)
    seenLabels.add(label)
  }

  return results.join("\n\n").slice(0, CONTEXT_CHARS)
}

// Static across every prospect in a batch — this is the cached system block.
const SYSTEM_PROMPT = `You are analyzing a small business to personalize a cold email about AI automation services.

Reply with valid JSON only — no prose, no markdown:
{
  "fit_score": <integer 0-100>,
  "custom_intro": "<1-2 sentences referencing something specific about this business — a service they likely offer, a manual process typical for their industry, or a pain point implied by their site>",
  "pain_signal": "<5-10 word phrase naming the specific manual process>",
  "owner_first_name": <first name of the owner, founder, principal or managing partner, copied exactly from the website context, or null if the context does not name one>
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

export async function enrichProspect(client: Anthropic, prospect: EnrichableProspect): Promise<EnrichmentResult | null> {
  const location = [prospect.city, prospect.state].filter(Boolean).join(", ")

  const siteContext = prospect.website ? await scrapeCompanyContext(prospect.website) : ""

  const websiteSection = siteContext
    ? `Website context:\n${siteContext}`
    : `Website: ${prospect.website ?? "not available"} (could not be scraped — base your response on industry knowledge)`

  // Only the per-prospect specifics — everything that actually varies call to call.
  const userPrompt = `Business: ${prospect.business_name} | Industry: ${prospect.industry ?? "unknown"} | Location: ${location || "unknown"}
${websiteSection}`

  const parsed = await callClaude(client, SYSTEM_PROMPT, userPrompt)
  if (!parsed) return null

  const result: EnrichmentResult = {
    fit_score: Math.max(0, Math.min(100, Math.round(parsed.fit_score))),
    custom_intro: parsed.custom_intro?.trim() ?? "",
    pain_signal: parsed.pain_signal?.trim() ?? "",
    contact_first_name: validateOwnerFirstName(parsed.owner_first_name, siteContext),
  }

  const qualityIssue = checkEnrichmentQuality(result, prospect.business_name)
  if (qualityIssue) {
    console.warn(`[enrich-prospects] quality gate failed for ${prospect.id} (${prospect.business_name}): ${qualityIssue}`)
    return null
  }

  return result
}
