import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !url.startsWith('https://')) throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  _admin = createClient(url, key)
  return _admin
}

// Convenience alias — call this inside route handlers, not at module scope
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop as keyof SupabaseClient]
  },
})
