-- Migration 022 (2026-10-06): reply-led templates for named contacts.
-- Context: aios state/worksheets/outreach-named-contacts-2026-10-06.md
--
-- 382 Brevo-era sends produced 3 replies (all declines) and 0 audit leads. Two template
-- problems, both fixed here:
--   * initial v5 framed a prospect-specific pain_signal as an industry-wide pattern
--     ("One thing I keep seeing at business consulting firms: manual donor tracking...").
--   * every follow-up was HTML with links pitching the audit, while the first email was
--     plain text asking for a one-word reply. The follow-ups now continue that same ask.
-- No client is named anywhere. All bodies carry the CAN-SPAM postal address (migration 021)
-- and a reply-based opt-out line.

-- 1. Retire the old variants. Nothing is deleted, so email_log history still joins.
UPDATE templates SET active = false
WHERE (type = 'initial' AND variant IN (5, 6))
   OR (type IN ('followup1', 'followup2') AND variant IN (1, 2, 3, 4));

-- 2. New plain-text variants: two per stage so each gets enough sends to judge.
INSERT INTO templates (type, variant, subject, body_html, is_plain_text, active) VALUES
('initial', 7, 'question about {{business_name}}',
'Hi {{contact_name}},

My guess is that a few hours every week at {{business_name}} still go to {{pain_signal}}.

Is that right, or do you already have it handled?

If it''s a real headache, reply and I''ll send two or three specific ways I''d automate it. No call needed.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

Not the right person, or not interested? Reply "no" and I won''t follow up.',
true, true),
('initial', 8, 'idea for {{business_name}}',
'Hi {{contact_name}},

I build small AI automations for small businesses. One recent build replaced a multi-location operator''s month-end spreadsheet work with a dashboard that updates itself.

At {{business_name}}, my guess is the equivalent is {{pain_signal}}. Is that a pain point right now?

If it is, reply "yes" and I''ll send a short note on what I''d automate first and roughly how much time it would save.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

If this isn''t relevant, reply "no" and you won''t hear from me again.',
true, true),
('followup1', 5, 'following up{{contact_greeting}}',
'Hi {{contact_name}},

Following up on my note about {{pain_signal}} at {{business_name}}.

If that is not the real time sink, what is? Reply with one line and I''ll send back how I''d automate it. No call and no pitch deck.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

Not interested? Reply "no" and I won''t follow up.',
true, true),
('followup1', 6, 'one more on {{business_name}}',
'Hi {{contact_name}},

Quick follow-up. I offered to send two or three specific ways to automate {{pain_signal}} at {{business_name}}.

Still happy to. Reply "yes" and I''ll write them up this week. It''s free and there is no call involved.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

Not interested? Reply "no" and I won''t follow up.',
true, true),
('followup2', 5, 'last note{{contact_greeting}}',
'Hi {{contact_name}},

Last note from me. If fixing {{pain_signal}} ever becomes a priority at {{business_name}}, reply to this email and I''ll send over how I''d approach it.

Wishing you and the team well.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

Reply "no" and you won''t hear from me again.',
true, true),
('followup2', 6, 'closing the loop on {{business_name}}',
'Hi {{contact_name}},

I''ll stop here so I''m not cluttering your inbox.

If the timing changes, a one-word reply to this email is enough and I''ll pick it back up.

Max Wexley
Wex Advisory, New York
(224) 247-1940
Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207

Reply "no" and you won''t hear from me again.',
true, true)
ON CONFLICT (type, variant) DO NOTHING;
