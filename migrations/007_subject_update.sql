-- Migration 007: Update initial email subject
UPDATE templates
SET subject = 'AI Opportunity For {{business_name}}',
    updated_at = now()
WHERE type = 'initial';
