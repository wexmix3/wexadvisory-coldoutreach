import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = getSupabaseAdmin()

  // Test read
  const { data: readData, error: readErr } = await sb
    .from('prospects')
    .select('id', { count: 'exact', head: true })

  // Test write - insert a canary row then delete it
  const testEmail = `test-canary-${Date.now()}@wextest.internal`
  const { error: writeErr } = await sb.from('prospects').insert({
    business_name: 'TEST DELETE ME',
    email: testEmail,
    status: 'new',
  })

  let deleteErr = null
  if (!writeErr) {
    const { error: de } = await sb.from('prospects').delete().eq('email', testEmail)
    deleteErr = de?.message ?? null
  }

  return NextResponse.json({
    read: { count: readData, error: readErr?.message ?? null },
    write: { error: writeErr?.message ?? null },
    delete: { error: deleteErr },
    env: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...',
      keyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20) + '...',
    },
  })
}
