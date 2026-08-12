// app/page.tsx
import { getSupabaseAdmin } from '@/lib/supabase'
import React from 'react'

export const dynamic = 'force-dynamic'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LogRow = {
  template_type: string
  variant: number | null
  status: string
  opened_at: string | null
  clicked_at: string | null
  delivered_at: string | null
  complained_at: string | null
  prospect_id: string
  sent_at: string
}

type TodayBatch = {
  sent: number
  failed: number
  lastSentAt: string | null
  byTemplate: { type: string; sent: number; failed: number }[]
}

type ProspectRow = {
  id: string
  industry: string | null
  status: string
  initial_sent_at: string | null
  replied_at: string | null
  business_name: string
}

type TemplateStats = { type: string; variant: number | null; sent: number; opens: number; clicks: number; bounced: number }
type IndustryStats = { industry: string; sent: number; replied: number; replyRate: number }
type ActivityItem = { businessName: string; templateType: string; sentAt: string }

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getAnalyticsData() {
  const sb = getSupabaseAdmin()

  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)
  const todayStr = todayUtc.toISOString()

  const [logsRes, prospectsRes, todayLogsRes, templatesRes] = await Promise.all([
    sb
      .from('email_log')
      .select('template_type, variant, status, opened_at, clicked_at, delivered_at, complained_at, prospect_id, sent_at')
      .order('sent_at', { ascending: false })
      .limit(5000),
    sb
      .from('prospects')
      .select('id, industry, status, initial_sent_at, replied_at, business_name')
      .limit(5000),
    sb
      .from('email_log')
      .select('template_type, variant, status, sent_at')
      .gte('sent_at', todayStr)
      .order('sent_at', { ascending: false }),
    sb
      .from('templates')
      .select('type, variant'),
  ])

  const logs = (logsRes.data ?? []) as LogRow[]
  const prospects = (prospectsRes.data ?? []) as ProspectRow[]
  const todayLogs = (todayLogsRes.data ?? []) as Pick<LogRow, 'template_type' | 'status' | 'sent_at'>[]
  const templatePool = (templatesRes.data ?? []) as { type: string; variant: number }[]

  const todayBatch: TodayBatch = {
    sent: todayLogs.filter((l) => l.status === 'sent').length,
    failed: todayLogs.filter((l) => l.status === 'failed').length,
    lastSentAt: todayLogs.find((l) => l.status === 'sent')?.sent_at ?? null,
    byTemplate: ['initial', 'followup1', 'followup2'].map((type) => ({
      type,
      sent: todayLogs.filter((l) => l.template_type === type && l.status === 'sent').length,
      failed: todayLogs.filter((l) => l.template_type === type && l.status === 'failed').length,
    })),
  }

  // Prospect lookup map (id → prospect)
  const prospectMap = new Map(prospects.map((p) => [p.id, p]))

  // Funnel totals
  const totalSent = logs.filter((l) => l.status === 'sent').length
  const totalDelivered = logs.filter((l) => l.delivered_at).length
  const totalOpened = logs.filter((l) => l.opened_at).length
  const totalClicked = logs.filter((l) => l.clicked_at).length
  const totalBounced = logs.filter((l) => l.status === 'bounced').length
  const totalComplained = logs.filter((l) => l.complained_at).length
  const totalReplied = prospects.filter((p) => p.status === 'replied').length
  const totalUnsubscribed = prospects.filter((p) => p.status === 'unsubscribed').length
  const queued = prospects.filter((p) => p.status === 'queued').length

  // By template + variant -- seed every known (type, variant) pair from the
  // templates table first so unsent/undrawn variants still show up at zero,
  // instead of only appearing once a send happens to pick them.
  const byTemplateMap: Record<string, TemplateStats> = {}
  for (const t of templatePool) {
    const key = `${t.type}:${t.variant}`
    byTemplateMap[key] = { type: t.type, variant: t.variant, sent: 0, opens: 0, clicks: 0, bounced: 0 }
  }
  for (const log of logs) {
    const key = `${log.template_type}:${log.variant ?? '—'}`
    if (!byTemplateMap[key]) {
      byTemplateMap[key] = { type: log.template_type, variant: log.variant, sent: 0, opens: 0, clicks: 0, bounced: 0 }
    }
    const t = byTemplateMap[key]
    if (log.status === 'sent') t.sent++
    if (log.status === 'bounced') t.bounced++
    if (log.opened_at) t.opens++
    if (log.clicked_at) t.clicks++
  }
  const byTemplate = Object.values(byTemplateMap).sort((a, b) =>
    a.type === b.type ? (a.variant ?? 0) - (b.variant ?? 0) : a.type.localeCompare(b.type)
  )

  // By industry (sorted by reply rate DESC)
  const industryMap: Record<string, { sent: number; replied: number }> = {}
  for (const log of logs) {
    if (log.status !== 'sent') continue
    const industry = prospectMap.get(log.prospect_id)?.industry ?? 'Unknown'
    if (!industryMap[industry]) industryMap[industry] = { sent: 0, replied: 0 }
    industryMap[industry].sent++
  }
  for (const p of prospects) {
    if (p.status !== 'replied') continue
    const industry = p.industry ?? 'Unknown'
    if (!industryMap[industry]) industryMap[industry] = { sent: 0, replied: 0 }
    industryMap[industry].replied++
  }
  const byIndustry: IndustryStats[] = Object.entries(industryMap)
    .map(([industry, data]) => ({
      industry,
      sent: data.sent,
      replied: data.replied,
      replyRate: data.sent ? data.replied / data.sent : 0,
    }))
    .sort((a, b) => b.replyRate - a.replyRate)

  // Avg days to reply
  const responseTimes = prospects
    .filter((p) => p.status === 'replied' && p.initial_sent_at && p.replied_at)
    .map((p) => {
      const sent = new Date(p.initial_sent_at!).getTime()
      const replied = new Date(p.replied_at!).getTime()
      return Math.round((replied - sent) / (1000 * 60 * 60 * 24))
    })
  const avgDaysToReply =
    responseTimes.length
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null

  // Recent replies (5 most recent)
  const recentReplies = prospects
    .filter((p) => p.status === 'replied')
    .sort((a, b) => (b.replied_at ?? '').localeCompare(a.replied_at ?? ''))
    .slice(0, 5)

  // Recent activity — 8 most recent sends enriched with business name
  const recentActivity: ActivityItem[] = logs
    .filter((log) => log.status === 'sent')
    .slice(0, 8)
    .map((log) => ({
      businessName: prospectMap.get(log.prospect_id)?.business_name ?? 'Unknown',
      templateType: log.template_type,
      sentAt: log.sent_at,
    }))

  return {
    totalSent,
    totalDelivered,
    totalOpened,
    totalClicked,
    totalBounced,
    totalComplained,
    totalReplied,
    totalUnsubscribed,
    queued,
    deliveryRate: pct(totalDelivered, totalSent),
    openRate: pct(totalOpened, totalSent),
    replyRate: pct(totalReplied, totalSent),
    bounceRate: pct(totalBounced, totalSent),
    unsubscribeRate: pct(totalUnsubscribed, totalSent),
    complaintRate: pct(totalComplained, totalSent),
    byTemplate,
    byIndustry,
    avgDaysToReply,
    recentReplies,
    recentActivity,
    todayBatch,
  }
}

// ── Sub-components (server, no 'use client' needed) ───────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#1e293b',
        borderRadius: '10px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #334155' }}>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            color: '#94a3b8',
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

function ReplyPill({ value, rate }: { value: string; rate: number }) {
  const color = rate >= 0.07 ? '#22c55e' : rate >= 0.04 ? '#60a5fa' : '#f59e0b'
  const bg = rate >= 0.07 ? '#14532d44' : rate >= 0.04 ? '#1e3a5f44' : '#92400e44'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 600,
        background: bg,
        color,
      }}
    >
      {value}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

const TEMPLATE_LABELS: Record<string, string> = {
  initial: 'Initial',
  followup1: 'Follow-up 1',
  followup2: 'Follow-up 2',
}

const TH_STYLE: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.7px',
  textTransform: 'uppercase',
  color: '#64748b',
  paddingBottom: '10px',
}

export default async function AnalyticsPage() {
  const {
    totalSent,
    totalDelivered,
    totalOpened,
    totalClicked,
    totalBounced,
    totalComplained,
    totalReplied,
    totalUnsubscribed,
    queued,
    deliveryRate,
    openRate,
    replyRate,
    bounceRate,
    unsubscribeRate,
    complaintRate,
    byTemplate,
    byIndustry,
    avgDaysToReply,
    recentReplies,
    recentActivity,
    todayBatch,
  } = await getAnalyticsData()

  const funnelRows = [
    { label: 'Sent', count: totalSent, color: '#3b82f6' },
    { label: 'Delivered', count: totalDelivered, color: '#0ea5e9' },
    { label: 'Opened', count: totalOpened, color: '#8b5cf6' },
    { label: 'Clicked', count: totalClicked, color: '#f59e0b' },
    { label: 'Replied', count: totalReplied, color: '#22c55e' },
    { label: 'Bounced', count: totalBounced, color: '#ef4444' },
    { label: 'Unsubscribed', count: totalUnsubscribed, color: '#94a3b8' },
    { label: 'Spam Complaints', count: totalComplained, color: '#dc2626' },
  ]

  return (
    <div
      style={{
        background: '#0f172a',
        minHeight: '100vh',
        margin: '-32px -24px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.3px', margin: 0 }}>
          Analytics
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px', marginBottom: 0 }}>
          All-time campaign performance
        </p>
      </div>

      {/* Today's Batch */}
      <div
        style={{
          background: '#1e293b',
          borderRadius: '10px',
          border: todayBatch.sent > 0 ? '1px solid #1d4ed8' : '1px solid #334155',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: todayBatch.sent > 0 ? '#3b82f6' : '#334155',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#64748b' }}>
              Today&apos;s Batch
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
              {todayBatch.lastSentAt
                ? `Last send ${relativeTime(todayBatch.lastSentAt)}`
                : 'Cron not yet run today'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6', lineHeight: 1 }}>{todayBatch.sent}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Sent</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: todayBatch.failed > 0 ? '#ef4444' : '#334155', lineHeight: 1 }}>{todayBatch.failed}</div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>Failed</div>
          </div>
          <div style={{ display: 'flex', gap: '16px', paddingLeft: '16px', borderLeft: '1px solid #334155' }}>
            {todayBatch.byTemplate.map((t) => (
              <div key={t.type} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: t.sent > 0 ? '#94a3b8' : '#475569', lineHeight: 1 }}>{t.sent}</div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '3px', letterSpacing: '0.5px' }}>
                  {t.type === 'initial' ? 'Initial' : t.type === 'followup1' ? 'F/U 1' : 'F/U 2'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {[
          { label: 'Total Sent', value: totalSent, sub: 'across 3 templates', color: '#3b82f6' },
          { label: 'Delivery Rate', value: deliveryRate, sub: `${totalDelivered} of ${totalSent} delivered`, color: '#0ea5e9' },
          { label: 'Open Rate', value: openRate, sub: `${totalOpened} of ${totalSent} opened`, color: '#8b5cf6' },
          { label: 'Reply Rate', value: replyRate, sub: `${totalReplied} replies total`, color: '#22c55e' },
          { label: 'Bounce Rate', value: bounceRate, sub: `${totalBounced} bounced`, color: '#ef4444' },
          { label: 'Unsubscribe Rate', value: unsubscribeRate, sub: `${totalUnsubscribed} unsubscribed`, color: '#94a3b8' },
          { label: 'Spam Rate', value: complaintRate, sub: `${totalComplained} complaints`, color: '#dc2626' },
          { label: 'Queued', value: queued, sub: 'ready to send', color: '#f59e0b' },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: '#1e293b',
              borderRadius: '10px',
              padding: '18px 20px',
              border: '1px solid #334155',
              borderLeft: `4px solid ${card.color}`,
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                color: '#64748b',
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                lineHeight: 1,
                color: card.color,
                margin: '6px 0',
              }}
            >
              {card.value}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Funnel + By Template */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

        {/* Funnel */}
        <Panel title="Conversion Funnel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {funnelRows.map((row) => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '52px',
                    fontSize: '12px',
                    color: '#64748b',
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    flex: 1,
                    height: '16px',
                    background: '#0f172a',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: totalSent ? `${Math.round((row.count / totalSent) * 100)}%` : '0%',
                      height: '100%',
                      background: row.color,
                      borderRadius: '4px',
                    }}
                  />
                </div>
                <div
                  style={{ width: '36px', fontSize: '12px', color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}
                >
                  {row.count}
                </div>
                <div style={{ width: '40px', fontSize: '11px', color: '#64748b', flexShrink: 0 }}>
                  {pct(row.count, totalSent)}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* By Template */}
        <Panel title="By Template">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: 'left' }}>Template</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Sent</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Opens%</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Clicks%</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Bounced</th>
              </tr>
            </thead>
            <tbody>
              {byTemplate.length === 0 ? (
                <tr><td colSpan={5} style={{ fontSize: '13px', color: '#475569', padding: '8px 0' }}>No data yet.</td></tr>
              ) : byTemplate.map((data) => (
                <tr key={`${data.type}:${data.variant}`} style={{ borderTop: '1px solid #334155' }}>
                  <td style={{ fontSize: '13px', color: '#e2e8f0', padding: '8px 0' }}>
                    {(TEMPLATE_LABELS[data.type] ?? data.type)}{data.variant ? ` · v${data.variant}` : ''}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {data.sent}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {pct(data.opens, data.sent)}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {pct(data.clicks, data.sent)}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {data.bounced}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.7px',
                }}
              >
                Avg Response Time
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#94a3b8', marginTop: '4px' }}>
                {avgDaysToReply !== null ? (
                  <>
                    {avgDaysToReply}{' '}
                    <span style={{ fontSize: '13px', fontWeight: 400 }}>days</span>
                  </>
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.7px',
                }}
              >
                Unsubscribed
              </div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#ef444488', marginTop: '4px' }}>
                {totalUnsubscribed}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Row 3: By Industry + Recent Replies + Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>

        {/* By Industry */}
        <Panel title="By Industry">
          {byIndustry.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>No data yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH_STYLE, textAlign: 'left' }}>Industry</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Sent</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Reply%</th>
                </tr>
              </thead>
              <tbody>
                {byIndustry.slice(0, 8).map((row) => (
                  <tr key={row.industry} style={{ borderTop: '1px solid #334155' }}>
                    <td style={{ fontSize: '13px', color: '#e2e8f0', padding: '8px 0' }}>
                      {row.industry}
                    </td>
                    <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                      {row.sent}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 0' }}>
                      <ReplyPill value={pct(row.replied, row.sent)} rate={row.replyRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Recent Replies */}
        <Panel title="Recent Replies">
          {recentReplies.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>No replies yet.</p>
          ) : (
            <div>
              {recentReplies.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderTop: i === 0 ? 'none' : '1px solid #334155',
                    gap: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: '#22c55e',
                        flexShrink: 0,
                      }}
                    />
                    <div
                      style={{
                        fontSize: '13px',
                        color: '#e2e8f0',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.business_name}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>
                    {relativeTime(p.replied_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Recent Activity */}
        <Panel title="Recent Activity">
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>No emails sent yet.</p>
          ) : (
            <div>
              {recentActivity.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '8px 0',
                    borderTop: i === 0 ? 'none' : '1px solid #334155',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ fontSize: '13px', marginTop: '1px', flexShrink: 0 }}>📤</span>
                  <div style={{ color: '#94a3b8', lineHeight: '1.4', flex: 1 }}>
                    <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{item.businessName}</span>
                    {' · '}
                    {TEMPLATE_LABELS[item.templateType] ?? item.templateType}
                  </div>
                  <div style={{ color: '#475569', fontSize: '11px', flexShrink: 0 }}>
                    {relativeTime(item.sentAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Empty state */}
      {totalSent === 0 && (
        <div
          style={{
            background: '#1e293b',
            borderRadius: '10px',
            border: '1px solid #334155',
            textAlign: 'center',
            padding: '80px 32px',
            color: '#475569',
            fontSize: '14px',
          }}
        >
          No data yet — send your first batch to start seeing analytics.
        </div>
      )}
    </div>
  )
}
