// B2B and professional service categories most likely to buy AI consulting/automation
export const PROSPECT_CATEGORIES = [
  'Law firms',
  'Accounting firms',
  'Real estate agencies',
  'Marketing agencies',
  'Financial advisors',
  'Insurance agencies',
  'Staffing agencies',
  'IT services companies',
  'Property management companies',
  'Mortgage brokers',
  'Business consulting firms',
  'HR consulting firms',
  'Logistics companies',
  'Healthcare clinics',
  'Coworking spaces',
  'Veterinary clinics',
  'Physical therapy clinics',
  'Commercial construction companies',
  'Engineering firms',
  'Architecture firms',
]

export const TOP_CATEGORIES = [
  'Real estate agencies',
  'Law firms',
  'Accounting firms',
  'Property management companies',
  'Healthcare clinics',
  'Financial advisors',
  'Insurance agencies',
  'Business consulting firms',
  'Coworking spaces',
]

// Weighted pick within TOP_CATEGORIES (see pickCategory() in auto-discover/route.ts).
// Reset 2026-09-18. The previous weights (Insurance / Property management / Financial
// advisors at 3x) were based on click data that turned out to be mostly link-scanner
// bots, not humans (see state/worksheets/outreach-readout-fixes-2026-09-18.md in aios).
// Coworking spaces is weighted up because 25N (a live coworking client) is the one
// concrete case study we can point to, and it had the highest open rate of any segment
// (9/25). Law firms (5/18 opens) and Property management get a smaller bump. Opens are
// an upper bound (scanners open too), so treat these as directional until replies exist.
// Dental offices was dropped from PROSPECT_CATEGORIES entirely: 1 open in 49 sends.
// Anything not listed here defaults to weight 1.
export const CATEGORY_WEIGHTS: Record<string, number> = {
  'Coworking spaces': 3,
  'Law firms': 2,
  'Property management companies': 2,
}

export const US_CITIES = [
  'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX', 'Dallas, TX',
  'San Francisco, CA', 'Atlanta, GA', 'Miami, FL', 'Washington, DC', 'Seattle, WA',
  'Denver, CO', 'Austin, TX', 'Philadelphia, PA', 'Charlotte, NC', 'Minneapolis, MN',
  'Nashville, TN', 'Phoenix, AZ', 'Raleigh, NC', 'Tampa, FL', 'Portland, OR',
  'San Diego, CA', 'Boston, MA', 'Detroit, MI', 'Ann Arbor, MI', 'Grand Rapids, MI',
  'Salt Lake City, UT', 'Indianapolis, IN', 'Columbus, OH', 'Kansas City, MO', 'Pittsburgh, PA',
]
