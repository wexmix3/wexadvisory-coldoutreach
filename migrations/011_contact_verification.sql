-- Migration 011: Contact address verification / cleaning
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS email_verification_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- email_verification_status values: 'unverified' | 'deliverable' | 'risky' | 'undeliverable' | 'unknown'
-- 'undeliverable' prospects also get status = 'bounced' so they're excluded from send-scheduled's
-- queue filter (which only selects status = 'queued') without needing a second exclusion clause.
