'use client'
import { useEffect, useState } from 'react'
import { QueueItem } from '@/app/api/queue/route'
import { Template } from '@/lib/types'
import { getIndustryHook } from '@/lib/industry-hooks'

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

const CALENDLY_URL = 'https://calendly.com/maxwexley-wexadvisory/free-strategy-call'

function renderTokens(template: string, item: QueueItem, unsubUrl: string) {
  const p = item.prospect
  return template
    .replace(/\{\{business_name\}\}/g, p.business_name)
    .replace(/\{\{contact_name\}\}/g, p.contact_name?.split(' ')[0] ?? 'there')
    .replace(/\{\{industry\}\}/g, p.industry ?? 'your industry')
    .replace(/\{\{city\}\}/g, p.city ?? 'your city')
    .replace(/\{\{industry_hook\}\}/g, getIndustryHook(p.industry))
    .replace(/\{\{calendly_url\}\}/g, CALENDLY_URL)
    .replace(/\{\{unsubscribe_url\}\}/g, unsubUrl)
}

interface PreviewItem {
  item: QueueItem
  subject: string
  body: string
}

export default function SendPage() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  // The one variant picked per queue item -- picked once when the queue loads
  // so the preview shown to Max matches exactly what /api/send will send.
  const [pickedTemplates, setPickedTemplates] = useState<Record<number, Template>>({})
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PreviewItem | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [qRes, tRes] = await Promise.all([
        fetch('/api/queue', { cache: 'no-store' }),
        fetch(`/api/templates?t=${Date.now()}`, { cache: 'no-store' }),
      ])
      const qData = await qRes.json()
      const tData = await tRes.json()
      const items: QueueItem[] = qData.queue ?? []
      setQueue(items)
      setSelected(new Set(items.map((_, i) => i)))

      const pool: Record<string, Template[]> = {}
      for (const t of (tData.templates ?? []) as Template[]) {
        (pool[t.type] ??= []).push(t)
      }

      // Pick one variant per item now, so it stays stable through preview + send.
      const picks: Record<number, Template> = {}
      items.forEach((item, i) => {
        const variants = pool[item.send_type] ?? []
        if (variants.length > 0) {
          picks[i] = variants[Math.floor(Math.random() * variants.length)]
        }
      })
      setPickedTemplates(picks)
    } catch {
      setError('Failed to load queue')
    } finally {
      setLoading(false)
    }
  }

  function openPreview(item: QueueItem, index: number) {
    const template = pickedTemplates[index]
    if (!template) return
    const unsubUrl = `${window.location.origin}/api/unsubscribe?id=${item.prospect.id}`
    setPreview({
      item,
      subject: renderTokens(template.subject, item, unsubUrl),
      body: renderTokens(template.body_html, item, unsubUrl),
    })
    // Mark this item as reviewed
    setSelected(prev => new Set([...prev, index]))
  }

  function toggleItem(index: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) { next.delete(index) } else { next.add(index) }
      return next
    })
  }

  function toggleAll() {
    if (selected.size === queue.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(queue.map((_, i) => i)))
    }
  }

  async function confirmSend() {
    setConfirming(false)
    setSending(true)
    setResult(null)
    setError('')
    const toSend = queue
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => selected.has(i))
      .map(({ item, i }) => ({ ...item, template_id: pickedTemplates[i]?.id }))
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toSend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setQueue([])
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const selectedItems = queue.filter((_, i) => selected.has(i))
  const initialCount = selectedItems.filter(q => q.send_type === 'initial').length
  const f1Count = selectedItems.filter(q => q.send_type === 'followup1').length
  const f2Count = selectedItems.filter(q => q.send_type === 'followup2').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Send Today&apos;s Batch</h1>
          <p className="text-gray-500 text-sm mt-1">
            Preview each email, uncheck any you want to skip, then confirm send.
          </p>
        </div>
        {queue.length > 0 && (
          <button
            onClick={() => setConfirming(true)}
            disabled={sending || selected.size === 0}
            className="bg-blue-600 text-white rounded-xl px-6 py-3 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {sending ? 'Sending...' : `Send ${selected.size} Email${selected.size !== 1 ? 's' : ''} →`}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
          <p className="font-semibold text-green-800">
            ✓ Batch complete — {result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ''}
          </p>
          {result.errors.length > 0 && (
            <ul className="text-sm text-red-700 space-y-0.5">
              {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {!loading && queue.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Initial emails', count: initialCount, color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'Follow-up 1', count: f1Count, color: 'bg-amber-50 text-amber-700 border-amber-200' },
              { label: 'Follow-up 2', count: f2Count, color: 'bg-purple-50 text-purple-700 border-purple-200' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
                <div className="text-2xl font-bold">{s.count}</div>
                <div className="text-sm mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Queue table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
              <input
                type="checkbox"
                checked={selected.size === queue.length && queue.length > 0}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                {selected.size} of {queue.length} selected
              </span>
              <span className="text-xs text-gray-400 ml-auto">Click the eye icon to preview any email before sending</span>
            </div>
            <div className="divide-y divide-gray-50">
              {queue.map((item, i) => {
                const template = pickedTemplates[i]
                const unsubUrl = `http://localhost:3002/api/unsubscribe?id=${item.prospect.id}`
                const renderedSubject = template ? renderTokens(template.subject, item, unsubUrl) : ''

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-4 px-5 py-3 transition-colors ${selected.has(i) ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggleItem(i)}
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                    />
                    <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${TYPE_COLOR[item.send_type]}`}>
                      {TYPE_LABEL[item.send_type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{item.prospect.business_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        To: {item.prospect.email}
                        {renderedSubject && <span> · Subject: <em>{renderedSubject}</em></span>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{item.prospect.city}, {item.prospect.state}</span>
                    <button
                      onClick={() => openPreview(item, i)}
                      title="Preview email"
                      className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors p-1 rounded hover:bg-blue-50"
                    >
                      {/* Eye icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {!loading && queue.length === 0 && !result && (
        <div className="text-center py-20 space-y-2">
          <div className="text-4xl">✓</div>
          <p className="text-gray-600 font-medium">Queue is empty</p>
          <p className="text-gray-400 text-sm">
            No emails due today. Add prospects on the{' '}
            <a href="/discover" className="text-blue-600 hover:underline">Discover</a> page.
          </p>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-gray-400 text-sm">Loading queue...</div>
      )}

      {/* Email preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Email Preview</p>
                <p className="font-semibold text-gray-900 mt-0.5">{preview.item.prospect.business_name}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 border-b border-gray-50 bg-gray-50 space-y-1 text-sm">
              <div><span className="text-gray-400 w-16 inline-block">From:</span> <span className="text-gray-700">Max Wexley &lt;max@wexadvisory.com&gt;</span></div>
              <div><span className="text-gray-400 w-16 inline-block">To:</span> <span className="text-gray-700">{preview.item.prospect.email}</span></div>
              <div><span className="text-gray-400 w-16 inline-block">Subject:</span> <span className="font-medium text-gray-900">{preview.subject}</span></div>
              <div><span className="text-gray-400 w-16 inline-block">Type:</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ml-1 ${TYPE_COLOR[preview.item.send_type]}`}>
                  {TYPE_LABEL[preview.item.send_type]}
                </span>
              </div>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1">
              <div dangerouslySetInnerHTML={{ __html: preview.body }} />
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <a
                href={`/templates`}
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit this template (applies to all future sends)
              </a>
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirming && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Confirm send</h2>
              <p className="text-gray-500 text-sm mt-1">
                You&apos;re about to send <strong>{selected.size} email{selected.size !== 1 ? 's' : ''}</strong> from{' '}
                <strong>max@wexadvisory.com</strong>. This cannot be undone.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-sm text-gray-600">
              {initialCount > 0 && <div>• {initialCount} initial email{initialCount !== 1 ? 's' : ''}</div>}
              {f1Count > 0 && <div>• {f1Count} follow-up 1{f1Count !== 1 ? 's' : ''}</div>}
              {f2Count > 0 && <div>• {f2Count} follow-up 2{f2Count !== 1 ? 's' : ''}</div>}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirming(false)}
                className="px-5 py-2.5 text-sm text-gray-700 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSend}
                className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                Yes, send {selected.size} email{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
