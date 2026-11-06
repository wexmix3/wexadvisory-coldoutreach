import { NextRequest, NextResponse } from 'next/server'

// Every page and API route needs the shared ADMIN_PASSWORD (HTTP Basic auth),
// except the three kinds of caller that can't log in:
//   - Vercel cron, which sends "Authorization: Bearer <CRON_SECRET>"
//   - email recipients clicking /api/unsubscribe
//   - Resend/Brevo webhooks (they check their own secret)
// Restored 2026-11-06: the 06-01 removal (e4f25f8) left /api/send, /api/templates
// (PUT) and /api/prospects open to anyone, so anyone could send mail as Max.
// Production fails closed if ADMIN_PASSWORD is missing; local dev stays open.

const PUBLIC_PREFIXES = ['/api/unsubscribe', '/api/webhooks/']

function basicPassword(header: string): string | null {
  const [scheme, encoded] = header.split(' ')
  if (scheme !== 'Basic' || !encoded) return null
  try {
    const decoded = atob(encoded)
    const colon = decoded.indexOf(':')
    return colon === -1 ? null : decoded.slice(colon + 1)
  } catch {
    return null
  }
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return NextResponse.next()

  const auth = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth === `Bearer ${cronSecret}`) return NextResponse.next()

  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    if (process.env.VERCEL_ENV === 'production') {
      return new NextResponse('ADMIN_PASSWORD is not set', { status: 503 })
    }
    return NextResponse.next()
  }

  if (basicPassword(auth) === password) return NextResponse.next()

  return new NextResponse('Access denied', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Wex Outreach"' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
