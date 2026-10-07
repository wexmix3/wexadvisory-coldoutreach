import { promises as dns } from 'dns'

export type VerificationStatus = 'deliverable' | 'risky' | 'undeliverable' | 'unknown'

// Free, unlimited, no API quota -- catches parked/dead domains and typos before
// spending any Hunter credit. Doesn't confirm the specific mailbox exists, only
// that the domain can receive mail at all.
export async function hasMxRecord(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain)
    return records.length > 0
  } catch {
    return false
  }
}

interface HunterVerifyResponse {
  data?: { status?: string; result?: string; score?: number }
  errors?: Array<{ code: number }>
}

// Secondary layer -- gracefully degrades to 'unknown' (never blocks a send) when
// the Hunter verification quota is exhausted, so this automatically starts doing
// real work again once the plan resets without any code change.
export async function hunterVerifyEmail(email: string): Promise<VerificationStatus> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey || apiKey.startsWith('your_')) return 'unknown'

  try {
    const url = new URL('https://api.hunter.io/v2/email-verifier')
    url.searchParams.set('email', email)
    url.searchParams.set('api_key', apiKey)

    const res = await fetch(url.toString())
    const data: HunterVerifyResponse = await res.json()

    if (data.errors?.some(e => e.code === 429)) return 'unknown'

    const result = data.data?.result ?? data.data?.status
    if (result === 'deliverable') return 'deliverable'
    if (result === 'undeliverable') return 'undeliverable'
    if (result === 'risky') return 'risky'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// Cleans a single contact address: MX check first (free), then Hunter verifier
// (quota-limited, degrades gracefully). Only 'undeliverable' is a hard prune --
// 'risky'/'unknown' stay sendable since small-business catch-all domains are common
// and we don't want to throw away real prospects over an inconclusive signal.
//
// useHunter: false stops after the MX check and reports 'unknown'. A Hunter
// verification costs half a credit from the same 50-a-month pool as the contact
// lookups, so the caller only asks for it where the answer can change a send.
export async function verifyContact(email: string, opts: { useHunter?: boolean } = {}): Promise<VerificationStatus> {
  const domain = email.split('@')[1]
  if (!domain) return 'undeliverable'

  const hasMx = await hasMxRecord(domain)
  if (!hasMx) return 'undeliverable'

  if (opts.useHunter === false) return 'unknown'
  return hunterVerifyEmail(email)
}

// Whether a Hunter verification is worth its half credit for this prospect.
// Not when Hunter itself supplied the address (hunter_confidence >= 50: its search
// result already carries a verdict, and discovery drops the invalid ones), and not
// when the prospect cannot be emailed anyway (below the fit threshold, or no named
// contact while the named-contacts hold is on).
export function worthHunterVerification(
  p: { fit_score: number | null; contact_name: string | null; hunter_confidence: number | null },
  rules: { minFit: number; requireName: boolean }
): boolean {
  if ((p.hunter_confidence ?? 0) >= 50) return false
  if (p.fit_score === null || p.fit_score < rules.minFit) return false
  if (rules.requireName && !p.contact_name?.trim()) return false
  return true
}
