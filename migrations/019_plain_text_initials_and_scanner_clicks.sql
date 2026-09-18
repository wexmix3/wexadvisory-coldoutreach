-- Migration 019 (2026-09-18): plain-text first emails + link-scanner click separation.
-- Context: aios state/worksheets/outreach-readout-fixes-2026-09-18.md

-- 1. Scanner clicks get their own column so clicked_at means "a human clicked".
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS scanner_click_at TIMESTAMPTZ;

-- 2. Templates can be plain text (sent as textContent) and can be retired without deleting.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_plain_text BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- 3. Retire the 4 HTML first-email variants (3.3% open, 0 replies, 4 links each).
UPDATE templates SET active = false WHERE type = 'initial' AND variant IN (1, 2, 3, 4);

-- 4. Two plain-text first emails: no links, ask for a reply, use the enrichment pain_signal.
INSERT INTO templates (type, variant, subject, body_html, is_plain_text, active) VALUES
('initial', 5, 'question about {{business_name}}',
'Hi {{contact_name}},

One thing I keep seeing at {{industry_lower}}: {{pain_signal}}. It tends to eat a few hours a week that nobody on the team enjoys.

Is that true at {{business_name}}, or do you already have it handled?

If it''s a real headache, reply and I''ll send two or three specific ways I''d automate it. No call needed.

Max Wexley
Wex Advisory, New York
(224) 247-1940

Not the right person, or not interested? Reply "no" and I won''t follow up.',
true, true),
('initial', 6, 'idea for {{business_name}}',
'Hi {{contact_name}},

I build small AI automations for {{industry_lower}}, mostly around {{pain_signal}}.

Is that a pain point at {{business_name}} right now? If it is, reply "yes" and I''ll send a short note on what I''d automate first and roughly how much time it would save.

Max Wexley
Wex Advisory, New York
(224) 247-1940

If this isn''t relevant, reply "no" and you won''t hear from me again.',
true, true)
ON CONFLICT (type, variant) DO NOTHING;

-- 5. Merge the stray "dentist" label into "Dental offices".
UPDATE prospects SET industry = 'Dental offices' WHERE industry = 'dentist';
