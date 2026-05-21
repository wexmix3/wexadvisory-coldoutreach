-- Migration 004: Add open/click tracking columns to email_log
-- Required for Resend webhook event processing

ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

-- Add bounced_at to prospects for cleaner reporting
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
