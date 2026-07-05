'use client'
import { useState } from 'react'
import { DiscoveredProspect } from '@/app/api/discover/route'

const CATEGORIES = [
  'Coworking spaces',
  'Restaurants',
  'Coffee shops',
  'Retail stores',
  'Law firms',
  'Accounting firms',
  'HVAC companies',
  'Plumbing companies',
  'Real estate agencies',
  'Marketing agencies',
  'Gyms and fitness studios',
  'Dental offices',
  'Veterinary clinics',
  'Auto repair shops',
]

export default function DiscoverPage() {
  const [city, setCity] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prospects, setProspects] = useState<DiscoveredProspect[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [debugStats, setDebugStats] = useState<{ placesFound: number; withWebsite: number; withEmail: number } | null>(null)

  async function discover() {
    if (!city.trim()) return
    setLoading(true)
    setError('')
    setProspects([])
    setSelected(new Set())
    setSavedCount(null)
    setDebugStats(null)

    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city.trim(), category: customCategory.trim() || category }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProspects(data.prospects)
      setDebugStats(data.debug ?? null)
      // Pre-select only prospects not already in the system
      setSelected(new Set(
        data.prospects
          .filter((p: DiscoveredProspect) => !p.existing_status)
          .map((p: DiscoveredProspect) => p.email)
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed')
    } finally {
      setLoading(false)
    }
  }

  async function saveSelected() {
    const toSave = prospects.filter(p => selected.has(p.email))
    if (!toSave.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/prospects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospects: toSave }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedCount(data.saved)
      if (data.errors?.length) {
        setError(`${data.saved} saved. Some failed: ${data.errors.slice(0, 3).join('; ')}`)
      }
      setProspects([])
      setSelected(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const newProspects = prospects.filter(p => !p.existing_status)

  function toggleAll() {
    if (selected.size === newProspects.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(newProspects.map(p => p.email)))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Find Prospects</h1>
        <p className="text-gray-500 text-sm mt-1">
          Search businesses by city and category. We&apos;ll find verified emails via Hunter.io.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={city}
              onChange={e => setCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && discover()}
              placeholder="e.g. Austin, TX"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setCustomCategory('') }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={discover}
              disabled={loading || !city.trim()}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom category{' '}
            <span className="text-gray-400 font-normal">(overrides dropdown — type anything)</span>
          </label>
          <input
            type="text"
            value={customCategory}
            onChange={e => setCustomCategory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && discover()}
            placeholder="e.g. Physical therapy clinics, Financial advisors, Event venues..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
        {savedCount !== null && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
            {savedCount} new prospect{savedCount !== 1 ? 's' : ''} added to your queue.
          </div>
        )}
        {debugStats && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
            Found <strong>{debugStats.placesFound}</strong> businesses on Google →{' '}
            <strong>{debugStats.withWebsite}</strong> had websites →{' '}
            <strong className={debugStats.withEmail === 0 ? 'text-red-600' : 'text-green-700'}>{debugStats.withEmail}</strong> had emails found
            {debugStats.withEmail === 0 && debugStats.withWebsite > 0 && (
              <span className="text-red-600"> — No emails found via website scraping or Hunter. Try a different industry.</span>
            )}
          </div>
        )}
      </div>

      {prospects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={newProspects.length > 0 && selected.size === newProspects.length}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">
                {prospects.length} found
                {prospects.length - newProspects.length > 0 && (
                  <span className="text-amber-600 ml-1">· {prospects.length - newProspects.length} already in system</span>
                )}
                {selected.size > 0 && <span className="text-blue-600"> · {selected.size} selected</span>}
              </span>
            </div>
            <button
              onClick={saveSelected}
              disabled={saving || selected.size === 0}
              className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : `Add ${selected.size} to Queue`}
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {prospects.map(p => {
              const isExisting = !!p.existing_status
              return (
                <div
                  key={p.email}
                  className={`flex items-center gap-4 px-6 py-3 ${isExisting ? 'bg-gray-50 opacity-70' : 'hover:bg-gray-50'}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.email)}
                    disabled={isExisting}
                    onChange={() => {
                      if (isExisting) return
                      const next = new Set(selected)
                      if (next.has(p.email)) { next.delete(p.email) } else { next.add(p.email) }
                      setSelected(next)
                    }}
                    className="h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${isExisting ? 'text-gray-400' : 'text-gray-900'}`}>
                        {p.business_name}
                      </span>
                      {isExisting && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                          {p.existing_status!.replace(/_/g, ' ')}
                        </span>
                      )}
                      {!isExisting && p.hunter_confidence >= 80 && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          {p.hunter_confidence}% confidence
                        </span>
                      )}
                      {!isExisting && p.hunter_confidence < 80 && p.hunter_confidence >= 50 && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                          {p.hunter_confidence}% confidence
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {p.email} {p.contact_name ? `· ${p.contact_name}` : ''} · {p.city}, {p.state}
                    </div>
                  </div>
                  {p.website && (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline shrink-0"
                    >
                      Website ↗
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && prospects.length === 0 && savedCount === null && (
        <div className="text-center py-16 text-gray-400 text-sm">
          Enter a city and category above to find prospects.
        </div>
      )}
    </div>
  )
}
