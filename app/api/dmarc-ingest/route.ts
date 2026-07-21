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
  const messageIds = await listDmarcMessageIds(2)

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

      await sb.from('dmarc_processed_emails').insert({ gmail_message_id: messageId })
      await labelAsProcessed(messageId)
      ingested++
    } catch (err) {
      errors.push({ messageId, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({ checked: messageIds.length, ingested, skipped, errors })
}
