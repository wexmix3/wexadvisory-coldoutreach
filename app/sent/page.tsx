'use client'
import { useEffect, useState, useCallback } from 'react'

interface SentRow {
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
  business_name: string
  to_email: string
}

const TYPE_LABEL: Record<string, string> = {
  initial: 'Initial',
  followup1: 'Follow-up 1',
  followup2: 'Follow-up 2',
}

const TYPE_COLOR: Record<string, string> = {
  initial: 'bg-blue-100 text-blue-700',
  followup1: 'bg-amber-100 text-amber-700',
  followup2: 'bg-purple-100 text-purple-700',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function SentPage() {
  const [rows, setRows] = useState<SentRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [templateFilter, setTemplateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [preview, setPreview] = useState<SentRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (templateFilter) params.set('template_type', templateFilter)
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/sent?${params}`, { cache: 'no-store' })
    const data = await res.json()
    setRows(data.rows ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [page, templateFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sent Emails</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total.toLocaleString()} total emails sent — click any row to see the full email content.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={templateFilter}
          onChange={e => { setTemplateFilter(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All templates</option>
          <option value="initial">Initial</option>
          <option value="followup1">Follow-up 1</option>
          <option value="followup2">Follow-up 2</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="bounced">Bounced</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_2fr_1fr_3fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
          {['Business', 'Email', 'Template', 'Subject', 'Sent', 'Opened', 'Clicked'].map(h => (
            <div key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</div>
          ))}
        </div>

        {loading && (
          <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
        )}

        {!loading && rows.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No emails found.</div>
        )}

        {!loading && rows.map(row => (
          <button
            key={row.id}
            onClick={() => setPreview(row)}
            className="w-full grid grid-cols-[2fr_2fr_1fr_3fr_1fr_1fr_1fr] gap-3 px-5 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors text-left items-center"
          >
            <div className="font-medium text-sm text-gray-900 truncate">{row.business_name}</div>
            <div className="text-xs text-gray-500 truncate">{row.to_email}</div>
            <div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[row.template_type] ?? 'bg-gray-100 text-gray-600'}`}>
                {TYPE_LABEL[row.template_type] ?? row.template_type}
              </span>
            </div>
            <div className="text-sm text-gray-700 truncate">{row.subject}</div>
            <div className="text-xs text-gray-500">{fmt(row.sent_at)}</div>
            <div>
              {row.opened_at
                ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">Yes</span>
                : <span className="text-xs text-gray-400">No</span>}
            </div>
            <div>
              {row.clicked_at
                ? <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Yes</span>
                : <span className="text-xs text-gray-400">No</span>}
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages} ({total.toLocaleString()} emails)</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Email preview modal */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Sent Email</p>
                <p className="font-semibold text-gray-900 mt-0.5">{preview.business_name}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Email meta */}
            <div className="px-6 py-4 border-b border-gray-50 bg-gray-50 space-y-1 text-sm">
              <div><span className="text-gray-400 w-16 inline-block">From:</span> <span className="text-gray-700">Max Wexley &lt;maxwexley@wexadvisory.com&gt;</span></div>
              <div><span className="text-gray-400 w-16 inline-block">To:</span> <span className="text-gray-700">{preview.to_email}</span></div>
              <div><span className="text-gray-400 w-16 inline-block">Subject:</span> <span className="font-medium text-gray-900">{preview.subject}</span></div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-gray-400 w-16 inline-block">Type:</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ml-1 ${TYPE_COLOR[preview.template_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {TYPE_LABEL[preview.template_type] ?? preview.template_type}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Sent:</span>
                  <span className="text-gray-700 ml-1">{fmtTime(preview.sent_at)}</span>
                </div>
              </div>
              <div className="flex gap-4 pt-1">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${preview.opened_at ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-gray-500 text-xs">
                    {preview.opened_at ? `Opened ${fmtTime(preview.opened_at)}` : 'Not opened'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${preview.clicked_at ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <span className="text-gray-500 text-xs">
                    {preview.clicked_at ? `Clicked ${fmtTime(preview.clicked_at)}` : 'Not clicked'}
                  </span>
                </div>
              </div>
            </div>

            {/* Email body */}
            <div className="px-6 py-5 overflow-y-auto flex-1">
              {preview.body_html
                ? <div dangerouslySetInnerHTML={{ __html: preview.body_html }} />
                : <p className="text-gray-400 text-sm italic">Body not stored for this email.</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
