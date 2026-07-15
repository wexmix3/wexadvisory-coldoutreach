import { NextRequest, NextResponse } from 'next/server'

// Temporary diagnostic endpoint - verifies env vars are actually loaded at runtime
// without exposing secret values. Delete after use.
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (token !== 'diag-2026-07-15-verify') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const mask = (v: string | undefined) => {
    if (!v) return null
    if (v.length <= 8) return '****'
    return `${v.slice(0, 6)}...${v.slice(-4)} (len:${v.length})`
  }

  return NextResponse.json({
    RESEND_API_KEY: mask(process.env.RESEND_API_KEY),
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
    RESEND_CONFIRMATION_API_KEY: mask(process.env.RESEND_CONFIRMATION_API_KEY),
  })
}
