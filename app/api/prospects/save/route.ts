import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { DiscoveredProspect } from '@/app/api/discover/route'

export const dynamic = 'force-dynamic'

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
    const newProspects = prospects.filter(p => !existingEmails.has(p.email))

    if (newProspects.length === 0) {
      return NextResponse.json({ saved: 0 })
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

    return NextResponse.json({ saved, errors: errors.length ? errors : undefined })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
