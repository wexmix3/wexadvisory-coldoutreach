-- Migration 015: Fix subject lines that break when contact_name is null
--
-- 014_template_variants.sql introduced two subject lines that interpolate
-- {{contact_name}}, which lib/tokens.ts resolves to the literal string
-- 'there' when prospect.contact_name is null/empty. Result: subjects that
-- literally read "Still there, there?" and "Bad timing, there?" for any
-- prospect with no contact name on file.
--
-- 014 is already applied to production, so it is not edited here -- this
-- migration updates the two affected rows in place instead. Same
-- question-opener angle, but keyed off business_name (a required field,
-- never null) instead of contact_name.

UPDATE templates
SET subject = 'Still there, {{business_name}}?', updated_at = now()
WHERE type = 'followup1' AND variant = 2;

UPDATE templates
SET subject = 'Bad timing for {{business_name}}?', updated_at = now()
WHERE type = 'followup2' AND variant = 2;
