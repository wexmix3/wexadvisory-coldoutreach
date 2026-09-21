import { promises as dns } from 'dns'

// Groups DMARC source IPs by the sending service behind them, via reverse DNS.
// ESPs rotate through IP pools (Amazon SES alone used ~20 addresses in a
// month), so per-IP "new sender" detection flags the same known services as
// new every week. The PTR domain (amazonses.com, sender-sib.com, google.com)
// is stable across the pool.

export type SourceGroup = {
  key: string // e.g. "amazonses.com", or "203.0.113.0/24" when no PTR exists
  sample_hostname: string | null
}

const PTR_TIMEOUT_MS = 2000

function prefixKey(ip: string): string {
  if (ip.includes(':')) {
    // IPv6: approximate /48 from the first three hextets as written.
    return ip.split(':').slice(0, 3).join(':') + '::/48'
  }
  return ip.split('.').slice(0, 3).join('.') + '.0/24'
}

// Last two labels of the PTR hostname. Good enough for the ESP/mailbox
// provider domains that show up here; not a public-suffix-aware parser.
function registrableDomain(hostname: string): string {
  return hostname.replace(/\.$/, '').split('.').slice(-2).join('.').toLowerCase()
}

async function reverseWithTimeout(ip: string): Promise<string | null> {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), PTR_TIMEOUT_MS)),
    ])
    return names[0] ?? null
  } catch {
    // No PTR record (or a slow resolver) is a normal outcome for spoofed or
    // self-hosted senders; fall back to the network prefix.
    return null
  }
}

export async function groupSourceIps(ips: string[]): Promise<Map<string, SourceGroup>> {
  const unique = [...new Set(ips)]
  const hostnames = await Promise.all(unique.map(reverseWithTimeout))
  const out = new Map<string, SourceGroup>()
  unique.forEach((ip, i) => {
    const host = hostnames[i]
    out.set(ip, host ? { key: registrableDomain(host), sample_hostname: host } : { key: prefixKey(ip), sample_hostname: null })
  })
  return out
}
