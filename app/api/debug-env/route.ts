import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50) ?? 'NOT SET',
  })
}
