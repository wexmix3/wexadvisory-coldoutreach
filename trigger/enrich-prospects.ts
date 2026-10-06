import { task } from "@trigger.dev/sdk"
import Anthropic from "@anthropic-ai/sdk"
import { enrichProspect, nameFitsEmail, RATE_LIMIT_DELAY_MS } from "@/lib/enrichment"
import { createClient } from "@supabase/supabase-js"

// Supabase realtime-js checks for WebSocket at construction time.
// Trigger.dev cloud runs Node 21 (no native WS). We only use REST, so a stub is enough.
if (!globalThis.WebSocket) {
  (globalThis as unknown as Record<string, unknown>).WebSocket = class {}
}

const BATCH_SIZE = 20
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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
      .select("id, business_name, industry, city, state, website, contact_name, email")
      .in("enrichment_status", ["pending", "failed"])
      .not("website", "is", null)
      .in("status", ["queued", "new"])
      .order("created_at", { ascending: true })
      .limit(limit)

    if (error) throw new Error(`DB query failed: ${error.message}`)
    if (!prospects || prospects.length === 0) {
      return { enriched: 0, failed: 0, named: 0, message: "Nothing to enrich" }
    }

    let enriched = 0
    let failed = 0
    let named = 0

    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i]
      const result = await enrichProspect(client, prospect)

      if (result) {
        const { fit_score, custom_intro, pain_signal, contact_first_name } = result
        // A name Hunter already found is never overwritten by one read off the site.
        const fillName = !prospect.contact_name?.trim() && contact_first_name && nameFitsEmail(contact_first_name, prospect.email)
        await sb.from("prospects").update({
          fit_score,
          custom_intro,
          pain_signal,
          ...(fillName ? { contact_name: contact_first_name } : {}),
          enrichment_status: "done",
          enriched_at: new Date().toISOString(),
        }).eq("id", prospect.id)
        enriched++
        if (fillName) named++
      } else {
        await sb.from("prospects").update({ enrichment_status: "failed" }).eq("id", prospect.id)
        failed++
      }

      if (i < prospects.length - 1) {
        await sleep(RATE_LIMIT_DELAY_MS)
      }
    }

    return { enriched, failed, named, total: prospects.length }
  },
})
