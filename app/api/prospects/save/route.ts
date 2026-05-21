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

    const rows = prospects.map(p => ({
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

    const { data, error } = await supabaseAdmin
      .from('prospects')
      .upsert(rows, { onConflict: 'email', ignoreDuplicates: true })
      .select('id')

    if (error) throw error

    return NextResponse.json({ saved: data?.length ?? 0 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
