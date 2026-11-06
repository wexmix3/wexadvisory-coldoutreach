-- Migration 024 (2026-11-06): replace the initial v8 proof line (X bookmark B-164).
-- Context: aios state/worksheets/outreach-proof-line-2026-11-06.md
--
-- v8 said "One recent build replaced a multi-location operator's month-end spreadsheet
-- work with a dashboard that updates itself." That is the 25N engagement, which ended
-- 2026-10-19, and it went to every category, most of which have no month-end close.
-- v9 uses the RECO proof point already public on wexadvisory.com (context/pr-profile.md),
-- with the client unnamed, as in every template since 003.
-- Same pattern as 022: retire, never delete, so email_log history still joins.

UPDATE templates SET active = false
WHERE type = 'initial' AND variant = 8;

INSERT INTO templates (type, variant, subject, body_html, is_plain_text, active) VALUES
('initial', 9, 'idea for {{business_name}}',
'Hi {{contact_name}},

I build small AI automations for small businesses. For one client, a wholesale brand, I put their 119 accounts and 2,500+ leads into one dashboard run by five AI agents. The founders estimate it gives them back 5+ hours a week.

At {{business_name}}, my guess is the equivalent is {{pain_signal}}. Is that a pain point right now?

If it is, reply "yes" and I''ll send a short note on what I''d automate first and roughly how much time it would save.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

If this isn''t relevant, reply "no" and you won''t hear from me again.',
true, true)
ON CONFLICT (type, variant) DO NOTHING;

-- Check: v8 inactive, v9 active, and no active initial still says "month-end".
SELECT type, variant, active, left(body_html, 120) AS opening
FROM templates
WHERE type = 'initial' AND (active OR variant = 8)
ORDER BY variant;
