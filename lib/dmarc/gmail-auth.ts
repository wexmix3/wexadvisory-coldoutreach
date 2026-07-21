// Shared Gmail OAuth2 access token refresh — used by both the DMARC
// inbox reader and the weekly-summary draft creator.
// Same credential as ai-audit's Auto-Proposal Pipeline (gmail.modify scope,
// covers read + label; this code never sends).

export async function getGmailAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth2 env vars not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail token refresh failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
