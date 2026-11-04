import { createClient } from '@supabase/supabase-js'
import { blockReason, loadSuppressedDomains } from '../lib/suppression'
// Lists every in-play prospect the send-time guard (lib/suppression.ts) would skip, and proves the Origami imports pass it.
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
;(async () => {
  const suppressed = await loadSuppressedDomains(sb)
  const { data, error } = await sb.from('prospects').select('email, website, business_name, status, notes')
    .in('status', ['queued', 'new', 'initial_sent', 'followup1_sent']).limit(5000)
  if (error) throw new Error(error.message)
  const blocked = (data ?? []).map(p => ({ p, why: blockReason(p, suppressed) })).filter(x => x.why)
  const imports = (data ?? []).filter(p => (p.notes ?? '').includes('[origami 2026-11-03]'))
  console.log(`suppressed domains: ${suppressed.size}; in-play prospects: ${data?.length}; guard would skip: ${blocked.length}`)
  blocked.forEach(({ p, why }) => console.log(`  SKIP ${p.status} ${p.email} (${p.business_name}): ${why}`))
  console.log(`origami imports in play: ${imports.length}; blocked: ${imports.filter(p => blockReason(p, suppressed)).length}`)
})().catch(e => { console.error('FAILED', e.message); process.exit(1) })
