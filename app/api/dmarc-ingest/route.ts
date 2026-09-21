import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { listDmarcMessageIds, fetchDmarcAttachment, labelAsProcessed } from '@/lib/dmarc/gmail-client'
import { parseDmarcReport } from '@/lib/dmarc/parse-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getSupabaseAdmin()
  // ?days=N backfills a longer window (capped at 60); the daily cron uses 2.
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 2, 1), 60)
  const messageIds = await listDmarcMessageIds(days)

  let ingested = 0
  let skipped = 0
  const errors: { messageId: string; error: string }[] = []

  for (const messageId of messageIds) {
    const { data: already } = await sb
      .from('dmarc_processed_emails')
      .select('gmail_message_id')
      .eq('gmail_message_id', messageId)
      .maybeSingle()

    if (already) {
      skipped++
      continue
    }

    try {
      const attachment = await fetchDmarcAttachment(messageId)
      if (!attachment) {
        errors.push({ messageId, error: 'No parseable attachment found' })
        continue
      }

      const rows = await parseDmarcReport(attachment.filename, attachment.content)
      if (rows.length > 0) {
        const { error } = await sb.from('dmarc_records').upsert(rows, {
          onConflict: 'report_id,source_ip,dkim_result,spf_result,disposition',
          ignoreDuplicates: true,
        })
        if (error) throw new Error(error.message)
      }

      const { error: markErr } = await sb.from('dmarc_processed_emails').insert({ gmail_message_id: messageId })
      if (markErr) throw new Error(markErr.message)
      await labelAsProcessed(messageId)
      ingested++
    } catch (err) {
      errors.push({ messageId, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  // Non-200 on any per-message failure so the cron run shows as failed in Vercel logs.
  return NextResponse.json({ checked: messageIds.length, ingested, skipped, errors }, { status: errors.length > 0 ? 500 : 200 })
}
