import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sb = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const templateType = searchParams.get('template_type')
  const status = searchParams.get('status')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 50
  const offset = (page - 1) * limit

  let query = sb
    .from('email_log')
    .select('id, prospect_id, template_type, subject, body_html, resend_id, sent_at, status, opened_at, clicked_at', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (templateType) query = query.eq('template_type', templateType)
  if (status) query = query.eq('status', status)

  const { data: logs, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const prospectIds = [...new Set((logs ?? []).map((l: { prospect_id: string }) => l.prospect_id))]
  const { data: prospects } = prospectIds.length
    ? await sb.from('prospects').select('id, business_name, email').in('id', prospectIds)
    : { data: [] }

  const prospectMap = Object.fromEntries(
    (prospects ?? []).map((p: { id: string; business_name: string; email: string }) => [p.id, p])
  )

  const rows = (logs ?? []).map((log: {
    id: string
    prospect_id: string
    template_type: string
    subject: string
    body_html: string
    resend_id: string | null
    sent_at: string
    status: string
    opened_at: string | null
    clicked_at: string | null
  }) => ({
    ...log,
    business_name: prospectMap[log.prospect_id]?.business_name ?? 'Unknown',
    to_email: prospectMap[log.prospect_id]?.email ?? '',
  }))

  return NextResponse.json({ rows, total: count ?? 0, page, limit })
}
