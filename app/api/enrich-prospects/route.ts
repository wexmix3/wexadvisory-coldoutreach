import { NextRequest, NextResponse } from 'next/server'
import { tasks } from '@trigger.dev/sdk'
import type { enrichProspectsTask } from '@/trigger/enrich-prospects'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const run = await tasks.trigger<typeof enrichProspectsTask>('enrich-prospects', {})
  return NextResponse.json({ triggered: true, runId: run.id })
}
