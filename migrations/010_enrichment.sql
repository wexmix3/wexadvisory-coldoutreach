-- Migration 010: Add enrichment fields to prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS fit_score INTEGER,
  ADD COLUMN IF NOT EXISTS pain_signal TEXT,
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Prospects that already have a custom_intro are already enriched (via manual generate)
UPDATE prospects
  SET enrichment_status = 'done', enriched_at = NOW()
  WHERE custom_intro IS NOT NULL AND custom_intro != '';
