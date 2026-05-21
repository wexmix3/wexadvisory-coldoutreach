import { NextRequest, NextResponse } from 'next/server'

// Protect all routes with a shared password.
// Set ADMIN_PASSWORD in your .env.local (and Vercel env vars for production).
// Leave it unset in dev to skip auth entirely.
export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return NextResponse.next() // no password set → open in dev

  // Always allow the webhook endpoint (Resend calls it server-to-server)
  if (req.nextUrl.pathname.startsWith('/api/webhooks')) return NextResponse.next()
  // Allow unsubscribe links (recipients click these from emails)
  if (req.nextUrl.pathname.startsWith('/api/unsubscribe')) return NextResponse.next()

  const auth = req.headers.get('authorization')
  if (auth) {
    const [scheme, encoded] = auth.split(' ')
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      const [, pass] = decoded.split(':')
      if (pass === password) return NextResponse.next()
    }
  }

  return new NextResponse('Access denied', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Wex Outreach"' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
