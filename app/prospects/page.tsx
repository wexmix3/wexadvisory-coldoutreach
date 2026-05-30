'use client'
import { useEffect, useState } from 'react'
import { Prospect, ProspectStatus } from '@/lib/types'

const BLANK_FORM = { business_name: '', email: '', contact_name: '', website: '', industry: '', city: '', state: '' }


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
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState<{ enriched: number; failed: number } | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState(BLANK_FORM)
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

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

  async function enrichNow() {
    setEnriching(true)
    setEnrichResult(null)
    try {
      const res = await fetch('/api/enrich-prospects', { cache: 'no-store' })
      const data = await res.json()
      setEnrichResult({ enriched: data.enriched ?? 0, failed: data.failed ?? 0 })
      await load()
    } finally {
      setEnriching(false)
    }
  }

  async function cleanupBadEmails() {
    setCleaning(true)
    setCleanResult(null)
    try {
      const res = await fetch('/api/prospects/cleanup', { method: 'POST' })
      const data = await res.json()
      setCleanResult(data.removed ?? 0)
      if ((data.removed ?? 0) > 0) await load()
    } finally {
      setCleaning(false)
    }
  }

  async function addManually(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.business_name.trim() || !addForm.email.trim()) return
    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch('/api/prospects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospects: [{
            business_name: addForm.business_name.trim(),
            email: addForm.email.trim(),
            contact_name: addForm.contact_name.trim() || null,
            website: addForm.website.trim() || null,
            industry: addForm.industry.trim() || null,
            city: addForm.city.trim() || null,
            state: addForm.state.trim() || null,
            google_place_id: null,
            hunter_confidence: 100,
          }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.saved === 0) throw new Error('Email already in system')
      setShowAddModal(false)
      setAddForm(BLANK_FORM)
      await load()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setAddSaving(false)
    }
  }

  const filtered = search
    ? prospects.filter(p =>
        p.business_name.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase()) ||
        (p.city ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : prospects

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Prospects</h1>
          <p className="text-gray-500 text-sm mt-1">{prospects.length} total</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={cleanupBadEmails}
            disabled={cleaning}
            className="text-sm px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors font-medium"
          >
            {cleaning ? 'Cleaning...' : '🗑 Clean bad emails'}
          </button>
          {cleanResult !== null && (
            <span className="text-sm text-gray-500">
              {cleanResult === 0 ? 'No bad emails found' : `${cleanResult} removed`}
            </span>
          )}
          <button
            onClick={() => { setShowAddModal(true); setAddError('') }}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >
            + Add prospect
          </button>
          <button
            onClick={enrichNow}
            disabled={enriching}
            className="text-sm px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors font-medium"
          >
            {enriching ? 'Enriching...' : '✦ Enrich now'}
          </button>
          {enrichResult && (
            <span className="text-sm text-gray-500">
              {enrichResult.enriched} enriched{enrichResult.failed > 0 ? `, ${enrichResult.failed} failed` : ''}
            </span>
          )}
        </div>
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
                  <th className="px-4 py-3 font-medium text-gray-600">Fit</th>
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
                    <td className="px-4 py-3">
                      {p.fit_score != null ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          p.fit_score >= 70 ? 'bg-green-100 text-green-700' :
                          p.fit_score >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {p.fit_score}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">
                          {p.enrichment_status === 'failed' ? 'failed' : '—'}
                        </span>
                      )}
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
                        <span className="text-xs text-gray-300">
                          {p.enrichment_status === 'failed' ? 'site unreachable' : 'pending'}
                        </span>
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

      {/* Manual add modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Add prospect manually</h2>
              <p className="text-gray-500 text-sm mt-0.5">Added directly to your send queue.</p>
            </div>
            <form onSubmit={addManually} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Business name <span className="text-red-500">*</span></label>
                  <input required value={addForm.business_name} onChange={e => setAddForm(f => ({ ...f, business_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <input required type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Contact name</label>
                  <input value={addForm.contact_name} onChange={e => setAddForm(f => ({ ...f, contact_name: e.target.value }))}
                    placeholder="First Last"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Industry</label>
                  <input value={addForm.industry} onChange={e => setAddForm(f => ({ ...f, industry: e.target.value }))}
                    placeholder="e.g. Law firm"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
                  <input type="url" value={addForm.website} onChange={e => setAddForm(f => ({ ...f, website: e.target.value }))}
                    placeholder="https://..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                  <input value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <input value={addForm.state} onChange={e => setAddForm(f => ({ ...f, state: e.target.value }))}
                    placeholder="e.g. NY"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={addSaving}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">
                  {addSaving ? 'Saving...' : 'Add to queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
