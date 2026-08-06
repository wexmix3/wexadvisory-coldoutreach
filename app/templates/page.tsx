'use client'
import { useEffect, useState } from 'react'
import { Template } from '@/lib/types'

const TYPE_LABEL: Record<string, string> = {
  initial: 'Initial Email',
  followup1: 'Follow-up 1 (Day 5)',
  followup2: 'Follow-up 2 (Day 12)',
}

const TOKENS = ['{{business_name}}', '{{contact_name}}', '{{industry}}', '{{city}}', '{{calendly_url}}', '{{unsubscribe_url}}']

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeType, setActiveType] = useState<string | null>(null)
  const [active, setActive] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/templates')
    const data = await res.json()
    const list: Template[] = data.templates ?? []
    setTemplates(list)
    if (list.length > 0) {
      setActiveType(list[0].type)
      setActive(list[0])
    }
    setLoading(false)
  }

  async function save() {
    if (!active) return
    setSaving(true)
    setSaved(false)
    await fetch('/api/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: active.id, subject: active.subject, body_html: active.body_html }),
    })
    setTemplates(prev => prev.map(t => t.id === active.id ? active : t))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>

  const types = Array.from(new Set(templates.map(t => t.type)))
  const variantsForType = templates.filter(t => t.type === activeType).sort((a, b) => a.variant - b.variant)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Email Templates</h1>
        <p className="text-gray-500 text-sm mt-1">
          Edit the subject and body for each variant. Tokens are replaced automatically on send. Sends rotate randomly between variants within a stage.
        </p>
      </div>

      <div className="flex gap-3">
        {types.map(type => (
          <button
            key={type}
            onClick={() => {
              setActiveType(type)
              const first = templates.filter(t => t.type === type).sort((a, b) => a.variant - b.variant)[0]
              if (first) setActive(first)
            }}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              activeType === type
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {TYPE_LABEL[type] ?? type}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {variantsForType.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              active?.id === t.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            Variant {t.variant}
          </button>
        ))}
      </div>

      {active && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={active.subject}
                  onChange={e => setActive({ ...active, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                <textarea
                  value={active.body_html}
                  onChange={e => setActive({ ...active, body_html: e.target.value })}
                  rows={18}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {TOKENS.map(tok => (
                    <button
                      key={tok}
                      onClick={() => {
                        const ta = document.querySelector('textarea')
                        if (!ta) return
                        const start = ta.selectionStart
                        const end = ta.selectionEnd
                        const body = active.body_html
                        setActive({ ...active, body_html: body.slice(0, start) + tok + body.slice(end) })
                      }}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono transition-colors"
                    >
                      {tok}
                    </button>
                  ))}
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Preview</p>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-5 py-4 space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-14 shrink-0">From:</span>
                  <span className="text-gray-700">Max Wexley &lt;maxwexley@wexadvisory.com&gt;</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-14 shrink-0">Subject:</span>
                  <span className="font-medium text-gray-900">{active.subject}</span>
                </div>
              </div>
              <div
                className="px-6 py-5"
                dangerouslySetInnerHTML={{ __html: active.body_html }}
              />
            </div>
            <p className="text-xs text-gray-400">
              Tokens like <span className="font-mono bg-gray-100 px-1 rounded">{'{{business_name}}'}</span> are replaced with real prospect data at send time.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
