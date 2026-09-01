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
  'Dental offices',
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
]

// Weighted pick within TOP_CATEGORIES (see pickCategory() in auto-discover/route.ts).
// Insurance agencies, Property management companies, and Financial advisors are the
// only three segments with a repeatable click signal across 4 weeks of send data
// (2026-08-01 – 08-29 Outreach Learning digests); they get picked ~3x as often.
// Every other TOP_CATEGORIES entry keeps sending — Law firms, Accounting firms,
// Healthcare clinics, and Business consulting firms haven't shown a click yet at
// 60-80+ sends each, but the sample per segment is still thin and none are being
// dropped. Anything not listed here defaults to weight 1.
export const CATEGORY_WEIGHTS: Record<string, number> = {
  'Insurance agencies': 3,
  'Property management companies': 3,
  'Financial advisors': 3,
}

export const US_CITIES = [
  'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX', 'Dallas, TX',
  'San Francisco, CA', 'Atlanta, GA', 'Miami, FL', 'Washington, DC', 'Seattle, WA',
  'Denver, CO', 'Austin, TX', 'Philadelphia, PA', 'Charlotte, NC', 'Minneapolis, MN',
  'Nashville, TN', 'Phoenix, AZ', 'Raleigh, NC', 'Tampa, FL', 'Portland, OR',
  'San Diego, CA', 'Boston, MA', 'Detroit, MI', 'Ann Arbor, MI', 'Grand Rapids, MI',
  'Salt Lake City, UT', 'Indianapolis, IN', 'Columbus, OH', 'Kansas City, MO', 'Pittsburgh, PA',
]
