import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DiscoveredProspect } from '@/app/api/discover/route'

export const dynamic = 'force-dynamic'

// Statuses that mean a prospect is currently mid-sequence — a second contact
// at the same email domain must not get an independent send while one of
// these is still live, or the same company gets double-touched.
const OPEN_SEQUENCE_STATUSES = ['queued', 'initial_sent', 'followup1_sent', 'followup2_sent']

function emailDomain(email: string): string | null {
  return email.split('@')[1]?.toLowerCase() ?? null
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin()
  try {
    const { prospects }: { prospects: DiscoveredProspect[] } = await req.json()
    if (!prospects?.length) {
      return NextResponse.json({ error: 'No prospects provided' }, { status: 400 })
    }

    const emails = prospects.map(p => p.email)

    // Find which emails already exist
    const { data: existing, error: existErr } = await sb
      .from('prospects')
      .select('email')
      .in('email', emails)
    if (existErr) throw new Error(existErr.message)

    const existingEmails = new Set((existing ?? []).map((r: { email: string }) => r.email))
    const emailNewProspects = prospects.filter(p => !existingEmails.has(p.email))

    // Domain-level guard: a different contact at a company already mid-sequence
    // must not start an independent send. Exact-email dedup above doesn't catch
    // this — two people at the same company have two different emails.
    const domains = [...new Set(emailNewProspects.map(p => emailDomain(p.email)).filter((d): d is string => d !== null))]
    const { data: openDomainRows, error: domainErr } = domains.length
      ? await sb.from('prospects').select('email, status').in('status', OPEN_SEQUENCE_STATUSES)
      : { data: [], error: null }
    if (domainErr) throw new Error(domainErr.message)

    const openDomains = new Set(
      (openDomainRows ?? [])
        .map((r: { email: string }) => emailDomain(r.email))
        .filter((d): d is string => d !== null && domains.includes(d))
    )

    const newProspects = emailNewProspects.filter(p => {
      const d = emailDomain(p.email)
      return !d || !openDomains.has(d)
    })
    const skippedDomainConflicts = emailNewProspects.length - newProspects.length

    if (newProspects.length === 0) {
      return NextResponse.json({ saved: 0, skippedDomainConflicts })
    }

    // Insert one at a time to avoid batch failure from google_place_id conflicts
    let saved = 0
    const errors: string[] = []
    for (const p of newProspects) {
      const { error } = await sb.from('prospects').insert({
        business_name: p.business_name,
        contact_name: p.contact_name,
        email: p.email,
        website: p.website,
        industry: p.industry,
        city: p.city,
        state: p.state,
        google_place_id: p.google_place_id || null,
        hunter_confidence: p.hunter_confidence,
        status: 'queued',
      })
      if (error) {
        errors.push(`${p.email}: ${error.message}`)
      } else {
        saved++
      }
    }

    return NextResponse.json({ saved, skippedDomainConflicts, errors: errors.length ? errors : undefined })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
