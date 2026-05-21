import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { DiscoveredProspect } from '@/app/api/discover/route'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { prospects }: { prospects: DiscoveredProspect[] } = await req.json()
    if (!prospects?.length) {
      return NextResponse.json({ error: 'No prospects provided' }, { status: 400 })
    }

    const emails = prospects.map(p => p.email)

    // Find which emails already exist
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('prospects')
      .select('email')
      .in('email', emails)
    if (existErr) throw existErr

    const existingEmails = new Set((existing ?? []).map((r: { email: string }) => r.email))
    const newProspects = prospects.filter(p => !existingEmails.has(p.email))

    if (newProspects.length === 0) {
      return NextResponse.json({ saved: 0 })
    }

    const rows = newProspects.map(p => ({
      business_name: p.business_name,
      contact_name: p.contact_name,
      email: p.email,
      website: p.website,
      industry: p.industry,
      city: p.city,
      state: p.state,
      google_place_id: p.google_place_id,
      hunter_confidence: p.hunter_confidence,
      status: 'queued',
    }))

    const { error } = await supabaseAdmin.from('prospects').insert(rows)
    if (error) throw error

    return NextResponse.json({ saved: newProspects.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
