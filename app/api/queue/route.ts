import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Prospect } from '@/lib/types'

export const dynamic = 'force-dynamic'

const FOLLOWUP1_DAYS = 5
const FOLLOWUP2_DAYS = 7

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export interface QueueItem {
  prospect: Prospect
  send_type: 'initial' | 'followup1' | 'followup2'
}

export async function GET() {
  const queue: QueueItem[] = []

  // Initial: status = queued
  const { data: initial } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(50)

  for (const p of initial ?? []) {
    queue.push({ prospect: p, send_type: 'initial' })
  }

  // Followup1: initial_sent >= 5 days ago, status = initial_sent
  const { data: f1 } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('status', 'initial_sent')
    .lte('initial_sent_at', daysAgo(FOLLOWUP1_DAYS))

  for (const p of f1 ?? []) {
    queue.push({ prospect: p, send_type: 'followup1' })
  }

  // Followup2: followup1_sent >= 7 days ago, status = followup1_sent
  const { data: f2 } = await supabaseAdmin
    .from('prospects')
    .select('*')
    .eq('status', 'followup1_sent')
    .lte('followup1_sent_at', daysAgo(FOLLOWUP2_DAYS))

  for (const p of f2 ?? []) {
    queue.push({ prospect: p, send_type: 'followup2' })
  }

  // Cap total at 50 per day
  return NextResponse.json({ queue: queue.slice(0, 50) })
}
