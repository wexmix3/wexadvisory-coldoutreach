// Fires a repository_dispatch event so a GitHub Actions job (not this serverless
// function -- it can't run a headless-browser scraper) picks up discovery for one
// city/category using google-maps-scraper as a stand-in for Google Places, then
// writes results straight to Supabase. Best-effort: failures here should never
// fail the cron run, since Places already failed and this is the fallback path.
export async function triggerMapsScraperFallback(city: string, category: string): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  if (!token) return false

  try {
    const res = await fetch('https://api.github.com/repos/wexmix3/wexadvisory-coldoutreach/dispatches', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'maps-scraper-fallback',
        client_payload: { city, category },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
