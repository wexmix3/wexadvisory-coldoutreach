import { SupabaseClient } from '@supabase/supabase-js'
import { isPlatformDomain } from '@/lib/discovery'
import { domainOf } from '@/lib/owner-finder'

// Send-time guard, checked on every queued first email and follow-up whatever path inserted the prospect:
// a business in suppressed_domains (migration 023) was already emailed by another channel, and an address on a
// social or link-in-bio domain (steve@linktr.ee, richardcheesman@instagram.com) belongs to the platform, not the business.
const FREE_MAIL = /^(gmail|yahoo|hotmail|outlook|aol|icloud|me|live|msn|comcast|att|verizon)\./i
const emailDomain = (e: string) => e.split('@')[1]?.trim().toLowerCase() ?? ''

export async function loadSuppressedDomains(sb: SupabaseClient): Promise<Set<string>> {
  // Paged: hosted PostgREST caps a response at 1,000 rows, which would silently drop the rest.
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('suppressed_domains').select('domain').order('domain').range(from, from + 999)
    if (error) throw new Error(`suppressed_domains read failed: ${error.message}`)
    for (const r of data ?? []) out.add((r.domain as string).toLowerCase())
    if ((data ?? []).length < 1000) return out
  }
}

export function blockReason(p: { email: string; website: string | null }, suppressed: Set<string>): string | null {
  const ed = emailDomain(p.email)
  if (isPlatformDomain(ed)) return `platform email domain ${ed}`
  const hit = [ed, domainOf(p.website)].find(d => !!d && !FREE_MAIL.test(d) && suppressed.has(d))
  return hit ? `suppressed domain ${hit}` : null
}
