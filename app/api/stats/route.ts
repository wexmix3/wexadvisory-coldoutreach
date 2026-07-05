import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = getSupabaseAdmin()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const [total, sentToday, followupsDue, replied] = await Promise.all([
    sb.from('prospects').select('id', { count: 'exact', head: true }),
    sb.from('email_log').select('id', { count: 'exact', head: true }).gte('sent_at', todayIso).eq('status', 'sent'),
    sb.from('prospects').select('id', { count: 'exact', head: true }).in('status', ['initial_sent', 'followup1_sent']),
    sb.from('prospects').select('id', { count: 'exact', head: true }).eq('status', 'replied'),
  ])

  return NextResponse.json({
    total_prospects: total.count ?? 0,
    sent_today: sentToday.count ?? 0,
    followups_due: followupsDue.count ?? 0,
    replied: replied.count ?? 0,
  })
}
