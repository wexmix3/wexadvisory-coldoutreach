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
export async function verifyContact(email: string): Promise<VerificationStatus> {
  const domain = email.split('@')[1]
  if (!domain) return 'undeliverable'

  const hasMx = await hasMxRecord(domain)
  if (!hasMx) return 'undeliverable'

  return hunterVerifyEmail(email)
}
