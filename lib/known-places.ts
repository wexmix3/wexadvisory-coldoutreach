import type { SupabaseClient } from '@supabase/supabase-js'

// Which of these Google Places ids are already in the prospects table. Discovery
// asks before it spends a scoring call or a Hunter lookup on a business.
// Throws on a query error: guessing "none are known" would spend Hunter's
// 50 searches a month on businesses that are already there.
export function knownPlaceIdsFrom(sb: SupabaseClient) {
  return async (placeIds: string[]): Promise<Set<string>> => {
    const { data, error } = await sb.from('prospects').select('google_place_id').in('google_place_id', placeIds)
    if (error) throw new Error(`Known-places check failed: ${error.message}`)
    return new Set((data ?? []).map((r: { google_place_id: string }) => r.google_place_id))
  }
}
