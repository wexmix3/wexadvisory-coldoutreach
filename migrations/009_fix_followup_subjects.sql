-- Migration 009: Fix followup subject lines — replace {{contact_name}} with {{contact_greeting}}
-- "following up, there" → "following up" (no name) or "following up, Scott" (with name)

UPDATE templates SET
  subject = 'following up{{contact_greeting}}',
  updated_at = now()
WHERE type IN ('followup1', 'followup2');
