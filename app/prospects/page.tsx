'use client'
import { useEffect, useState } from 'react'
import { Prospect, ProspectStatus } from '@/lib/types'

type ProspectWithIntro = Prospect & { custom_intro?: string }

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'initial_sent', label: 'Initial Sent' },
  { value: 'followup1_sent', label: 'Follow-up 1 Sent' },
  { value: 'followup2_sent', label: 'Follow-up 2 Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'exhausted', label: 'Exhausted' },
]

const STATUS_COLOR: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600',
  queued: 'bg-blue-100 text-blue-700',
  initial_sent: 'bg-sky-100 text-sky-700',
  followup1_sent: 'bg-amber-100 text-amber-700',
  followup2_sent: 'bg-purple-100 text-purple-700',
  replied: 'bg-green-100 text-green-700',
  unsubscribed: 'bg-red-100 text-red-600',
  bounced: 'bg-red-50 text-red-400',
  exhausted: 'bg-gray-100 text-gray-500',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<ProspectWithIntro[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [generatingIntro, setGeneratingIntro] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const url = filter ? `/api/prospects?status=${filter}` : '/api/prospects'
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    setProspects(data.prospects ?? [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: ProspectStatus) {
    await fetch(`/api/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setProspects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  async function saveNotes(id: string) {
    await fetch(`/api/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setProspects(prev => prev.map(p => p.id === id ? { ...p, notes } : p))
    setEditing(null)
  }

  async function generateIntro(id: string) {
    setGeneratingIntro(id)
    try {
      const res = await fetch(`/api/prospects/${id}/personalize`, { method: 'POST' })
      const data = await res.json()
      if (data.intro) {
        setProspects(prev => prev.map(p => p.id === id ? { ...p, custom_intro: data.intro } : p))
      }
    } finally {
      setGeneratingIntro(null)
    }
  }

  const filtered = search
    ? prospects.filter(p =>
        p.business_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase()) ||
        (p.city ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : prospects

  const queuedCount = filtered.filter(p => p.status === 'queued' && !p.custom_intro).length

  async function generateAllIntros() {
    const targets = filtered.filter(p => p.status === 'queued' && !p.custom_intro)
    for (const p of targets) {
      await generateIntro(p.id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Prospects</h1>
          <p className="text-gray-500 text-sm mt-1">{prospects.length} total</p>
        </div>
        {queuedCount > 0 && (
          <button
            onClick={generateAllIntros}
            disabled={generatingIntro !== null}
            className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium"
          >
            {generatingIntro ? 'Generating...' : `✦ Generate Intros for ${queuedCount} queued`}
          </button>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by name, email, city..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                filter === s.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No prospects found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Business</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Location</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Sent</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Intro Line</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Notes</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Mark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.business_name}</div>
                      {p.contact_name && <div className="text-gray-400 text-xs">{p.contact_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.email}</td>
                    <td className="px-4 py-3 text-gray-500">{p.city}{p.state ? `, ${p.state}` : ''}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLOR[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {fmt(p.initial_sent_at)}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {p.custom_intro ? (
                        <span className="text-xs text-gray-600 leading-snug block" title={p.custom_intro}>
                          {p.custom_intro.length > 80 ? p.custom_intro.slice(0, 80) + '…' : p.custom_intro}
                        </span>
                      ) : (
                        <button
                          onClick={() => generateIntro(p.id)}
                          disabled={generatingIntro === p.id}
                          className="text-xs text-violet-500 hover:text-violet-700 disabled:opacity-40 transition-colors"
                        >
                          {generatingIntro === p.id ? 'Writing...' : '✦ Generate'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      {editing === p.id ? (
                        <div className="flex gap-1">
                          <input
                            autoFocus
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveNotes(p.id)}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                          />
                          <button onClick={() => saveNotes(p.id)} className="text-blue-600 text-xs">✓</button>
                          <button onClick={() => setEditing(null)} className="text-gray-400 text-xs">✕</button>
                        </div>
                      ) : (
                        <span
                          onClick={() => { setEditing(p.id); setNotes(p.notes ?? '') }}
                          className="text-gray-500 text-xs cursor-pointer hover:text-gray-800 truncate block"
                          title={p.notes ?? 'Click to add notes'}
                        >
                          {p.notes || <span className="text-gray-300">+ note</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={p.status}
                        onChange={e => updateStatus(p.id, e.target.value as ProspectStatus)}
                        className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-600"
                      >
                        {STATUS_OPTIONS.filter(s => s.value).map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
