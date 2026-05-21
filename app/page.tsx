import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function getStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const [total, sentToday, queued, replied, recentLogs] = await Promise.all([
    supabaseAdmin.from('prospects').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('email_log').select('id', { count: 'exact', head: true }).gte('sent_at', todayIso).eq('status', 'sent'),
    supabaseAdmin.from('prospects').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    supabaseAdmin.from('prospects').select('id', { count: 'exact', head: true }).eq('status', 'replied'),
    supabaseAdmin
      .from('email_log')
      .select('*, prospects(business_name, email, city, state)')
      .order('sent_at', { ascending: false })
      .limit(10),
  ])

  return {
    total: total.count ?? 0,
    sentToday: sentToday.count ?? 0,
    queued: queued.count ?? 0,
    replied: replied.count ?? 0,
    recentLogs: recentLogs.data ?? [],
  }
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

type RecentLog = {
  id: string
  template_type: string
  sent_at: string
  status: string
  prospects: { business_name: string; email: string; city: string | null; state: string | null } | null
}

export default async function DashboardPage() {
  const stats = await getStats()

  const statCards = [
    { label: 'Total Prospects', value: stats.total, href: '/prospects', color: 'text-gray-900' },
    { label: 'Sent Today', value: stats.sentToday, href: '/prospects', color: 'text-blue-700' },
    { label: 'In Queue', value: stats.queued, href: '/send', color: 'text-amber-700' },
    { label: 'Replied', value: stats.replied, href: '/prospects', color: 'text-green-700' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/discover"
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors"
          >
            Find Prospects
          </Link>
          <Link
            href="/send"
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            Send Today&apos;s Batch →
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
          >
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {/* Call to action when queue is ready */}
      {stats.queued > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="font-medium text-blue-900">
              {stats.queued} email{stats.queued !== 1 ? 's' : ''} ready to send today
            </p>
            <p className="text-sm text-blue-700 mt-0.5">
              Review and fire them off in one click.
            </p>
          </div>
          <Link
            href="/send"
            className="bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
          >
            Send Now →
          </Link>
        </div>
      )}

      {/* Recent activity */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Recent Activity</h2>
        {stats.recentLogs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-gray-400 text-sm">
            No emails sent yet.{' '}
            <Link href="/discover" className="text-blue-600 hover:underline">
              Find your first prospects →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {(stats.recentLogs as RecentLog[]).map(log => (
                <div key={log.id} className="flex items-center gap-4 px-5 py-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${log.status === 'sent' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-gray-900">
                      {log.prospects?.business_name ?? 'Unknown'}
                    </span>
                    <span className="text-gray-400 text-sm"> · {log.prospects?.email}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 capitalize">
                    {log.template_type.replace('followup', 'Follow-up ')}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{fmt(log.sent_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
