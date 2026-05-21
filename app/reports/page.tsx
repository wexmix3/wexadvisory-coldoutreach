import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function pct(num: number, denom: number): string {
  if (!denom) return '—'
  return `${Math.round((num / denom) * 100)}%`
}

async function getReportData() {
  const [logsRes, prospectsRes] = await Promise.all([
    supabaseAdmin
      .from('email_log')
      .select('template_type, status, opened_at, clicked_at, prospect_id'),
    supabaseAdmin
      .from('prospects')
      .select('id, industry, status'),
  ])

  const logs = logsRes.data ?? []
  const prospects = prospectsRes.data ?? []

  // ── By template type ──────────────────────────────────────────────
  const byTemplate: Record<string, { sent: number; opens: number; clicks: number; bounced: number }> = {
    initial: { sent: 0, opens: 0, clicks: 0, bounced: 0 },
    followup1: { sent: 0, opens: 0, clicks: 0, bounced: 0 },
    followup2: { sent: 0, opens: 0, clicks: 0, bounced: 0 },
  }
  for (const log of logs) {
    const t = byTemplate[log.template_type]
    if (!t) continue
    if (log.status === 'sent') t.sent++
    if (log.status === 'bounced') t.bounced++
    if (log.opened_at) t.opens++
    if (log.clicked_at) t.clicks++
  }

  // ── By industry ───────────────────────────────────────────────────
  const prospectMap = new Map(prospects.map(p => [p.id, p]))
  const industryMap: Record<string, { sent: number; replied: number }> = {}

  for (const log of logs) {
    if (log.status !== 'sent') continue
    const p = prospectMap.get(log.prospect_id)
    const industry = p?.industry ?? 'Unknown'
    if (!industryMap[industry]) industryMap[industry] = { sent: 0, replied: 0 }
    industryMap[industry].sent++
  }
  for (const p of prospects) {
    if (p.status !== 'replied') continue
    const industry = p.industry ?? 'Unknown'
    if (!industryMap[industry]) industryMap[industry] = { sent: 0, replied: 0 }
    industryMap[industry].replied++
  }

  const byIndustry = Object.entries(industryMap)
    .map(([industry, data]) => ({ industry, ...data }))
    .sort((a, b) => b.sent - a.sent)

  // ── Funnel totals ─────────────────────────────────────────────────
  const totalSent = logs.filter(l => l.status === 'sent').length
  const totalOpened = logs.filter(l => l.opened_at).length
  const totalClicked = logs.filter(l => l.clicked_at).length
  const totalBounced = logs.filter(l => l.status === 'bounced').length
  const totalReplied = prospects.filter(p => p.status === 'replied').length

  return { byTemplate, byIndustry, totalSent, totalOpened, totalClicked, totalBounced, totalReplied }
}

export default async function ReportsPage() {
  const { byTemplate, byIndustry, totalSent, totalOpened, totalClicked, totalBounced, totalReplied } = await getReportData()

  const templateLabels: Record<string, string> = {
    initial: 'Initial',
    followup1: 'Follow-up 1',
    followup2: 'Follow-up 2',
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Campaign performance across all prospects</p>
      </div>

      {/* Funnel overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Sent', value: totalSent, color: 'text-gray-900' },
          { label: 'Opened', value: `${totalOpened} (${pct(totalOpened, totalSent)})`, color: 'text-blue-700' },
          { label: 'Clicked', value: `${totalClicked} (${pct(totalClicked, totalSent)})`, color: 'text-violet-700' },
          { label: 'Replied', value: `${totalReplied} (${pct(totalReplied, totalSent)})`, color: 'text-green-700' },
          { label: 'Bounced', value: `${totalBounced} (${pct(totalBounced, totalSent)})`, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* By template */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Performance by Email Step</h2>
          <p className="text-xs text-gray-400 mt-0.5">Open and click rates require the Resend webhook to be configured.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-6 py-3 font-medium text-gray-600">Step</th>
              <th className="px-6 py-3 font-medium text-gray-600">Sent</th>
              <th className="px-6 py-3 font-medium text-gray-600">Opened</th>
              <th className="px-6 py-3 font-medium text-gray-600">Clicked</th>
              <th className="px-6 py-3 font-medium text-gray-600">Bounced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Object.entries(byTemplate).map(([type, data]) => (
              <tr key={type} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{templateLabels[type]}</td>
                <td className="px-6 py-3 text-gray-600">{data.sent}</td>
                <td className="px-6 py-3 text-blue-700">{data.opens} <span className="text-gray-400">({pct(data.opens, data.sent)})</span></td>
                <td className="px-6 py-3 text-violet-700">{data.clicks} <span className="text-gray-400">({pct(data.clicks, data.sent)})</span></td>
                <td className="px-6 py-3 text-red-500">{data.bounced} <span className="text-gray-400">({pct(data.bounced, data.sent)})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By industry */}
      {byIndustry.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Reply Rate by Industry</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-6 py-3 font-medium text-gray-600">Industry</th>
                <th className="px-6 py-3 font-medium text-gray-600">Emails Sent</th>
                <th className="px-6 py-3 font-medium text-gray-600">Replies</th>
                <th className="px-6 py-3 font-medium text-gray-600">Reply Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {byIndustry.map(row => (
                <tr key={row.industry} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{row.industry}</td>
                  <td className="px-6 py-3 text-gray-600">{row.sent}</td>
                  <td className="px-6 py-3 text-green-700">{row.replied}</td>
                  <td className="px-6 py-3">
                    <span className={`font-semibold ${row.replied > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                      {pct(row.replied, row.sent)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalSent === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 text-center py-20 text-gray-400 text-sm">
          No data yet — send your first batch to start seeing reports.
        </div>
      )}
    </div>
  )
}
