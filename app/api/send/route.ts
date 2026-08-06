import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { renderTemplate } from '@/lib/tokens'
import { QueueItem } from '@/app/api/queue/route'
import { Template } from '@/lib/types'

export const dynamic = 'force-dynamic'

const MAX_PER_BATCH = Number(process.env.MAX_DAILY_SENDS ?? 10)
const FROM = 'Max Wexley <maxwexley@wexadvisory.com>'
const REPLY_TO = 'maxwexley@wexadvisory.com'

// Client may pick a specific variant (so the preview it showed matches what
// actually sends). If omitted, fall back to a random pick from the pool.
type SendItem = QueueItem & { template_id?: string }

async function sendEmail(to: string, subject: string, html: string, unsubUrl: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey.startsWith('re_your')) throw new Error('RESEND_API_KEY not configured')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to,
      reply_to: REPLY_TO,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.message ?? 'Resend error')
  return data.id ?? null
}

export async function POST(req: NextRequest) {
  const sb = getSupabaseAdmin()
  try {
    const { items }: { items: SendItem[] } = await req.json()
    if (!items?.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 })

    const batch = items.slice(0, MAX_PER_BATCH)
    const appUrl = new URL(req.url).origin

    // Load templates
    const { data: templates, error: tErr } = await sb
      .from('templates')
      .select('*')
    if (tErr) throw tErr

    const templatesById: Record<string, Template> = {}
    const templatesByType: Record<string, Template[]> = {}
    for (const t of templates as Template[]) {
      templatesById[t.id] = t
      ;(templatesByType[t.type] ??= []).push(t)
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] }

    for (const item of batch) {
      const { prospect, send_type, template_id } = item
      const variants = templatesByType[send_type] ?? []
      // Prefer the variant the client already previewed; fall back to a
      // random pick from the pool if none was passed (or it's stale).
      const template =
        (template_id && templatesById[template_id]) ||
        variants[Math.floor(Math.random() * variants.length)]
      if (!template) {
        results.failed++
        results.errors.push(`No template for ${send_type}`)
        continue
      }

      const unsubUrl = `${appUrl}/api/unsubscribe?id=${prospect.id}`
      const subject = renderTemplate(template.subject, prospect, unsubUrl)
      const html = renderTemplate(template.body_html, prospect, unsubUrl)

      try {
        const resendId = await sendEmail(prospect.email, subject, html, unsubUrl)

        // Log the send
        await sb.from('email_log').insert({
          prospect_id: prospect.id,
          template_type: send_type,
          variant: template.variant,
          subject,
          body_html: html,
          resend_id: resendId,
          status: 'sent',
        })

        // Update prospect status
        const now = new Date().toISOString()
        const statusMap: Record<string, { status: string; field: string }> = {
          initial: { status: 'initial_sent', field: 'initial_sent_at' },
          followup1: { status: 'followup1_sent', field: 'followup1_sent_at' },
          followup2: { status: 'followup2_sent', field: 'followup2_sent_at' },
        }
        const { status, field } = statusMap[send_type]
        await sb
          .from('prospects')
          .update({ status, [field]: now })
          .eq('id', prospect.id)

        results.sent++
      } catch (err) {
        results.failed++
        const msg = err instanceof Error ? err.message : 'Unknown'
        results.errors.push(`${prospect.email}: ${msg}`)

        await sb.from('email_log').insert({
          prospect_id: prospect.id,
          template_type: send_type,
          variant: template.variant,
          subject: renderTemplate(template.subject, prospect, ''),
          body_html: '',
          status: 'failed',
        })
      }

      // Small delay between sends to avoid rate limits
      await new Promise(r => setTimeout(r, 200))
    }

    return NextResponse.json(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
