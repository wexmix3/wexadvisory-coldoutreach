-- Migration 014: Template variant pool for cold-email deliverability
-- Adds a variant pool per stage (initial/followup1/followup2) so sends
-- rotate between structurally different templates instead of one fixed
-- template per stage. See docs/superpowers/specs/2026-08-05-template-variant-pool-design.md

-- The inline `type TEXT UNIQUE NOT NULL` in 001_init.sql auto-named this
-- constraint templates_type_key. Drop it before adding variant + the new
-- composite unique constraint.
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_type_key;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS variant INTEGER NOT NULL DEFAULT 1;
ALTER TABLE templates ADD CONSTRAINT templates_type_variant_key UNIQUE (type, variant);

ALTER TABLE email_log ADD COLUMN IF NOT EXISTS variant INTEGER;

-- ── New variants: initial ──────────────────────────────────────────────

INSERT INTO templates (type, variant, subject, body_html) VALUES
(
  'initial', 2,
  'Quick question about {{business_name}}',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Are you and the team at {{business_name}} using AI anywhere yet, or is it still on the "get to it eventually" list?</p>

<p style="margin:0 0 16px 0;">I put together a free 60-second AI Opportunity Audit that shows exactly where {{business_name}} could save time and grow with AI — no signup, just answers: <a href="https://audit.wexadvisory.com" style="color:#1a56db;font-weight:600;">audit.wexadvisory.com</a></p>

<p style="margin:0 0 32px 0;">If it looks useful, <a href="{{calendly_url}}" style="color:#1a56db;">grab 15 minutes here</a> or just hit reply.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
),
(
  'initial', 3,
  '{{business_name}} + AI: a quick audit',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Most businesses in {{industry}} are sitting on 5-10 hours a week of manual work AI already handles well. I built a free 60-second audit that shows where {{business_name}} specifically could reclaim that time: <a href="https://audit.wexadvisory.com" style="color:#1a56db;font-weight:600;">audit.wexadvisory.com</a></p>

<p style="margin:0 0 16px 0;">{{industry_hook}}</p>

<p style="margin:0 0 32px 0;">I''m Max, I run Wex Advisory — happy to walk through the results together, <a href="{{calendly_url}}" style="color:#1a56db;">15 minutes here</a>, or just reply directly.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
),
(
  'initial', 4,
  'Quick one for {{business_name}}',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Short note. If you''d rather skip straight to a conversation: <a href="{{calendly_url}}" style="color:#1a56db;font-weight:600;">grab 15 minutes here</a>.</p>

<p style="margin:0 0 16px 0;">If you''d rather see specifics first, I built a free 60-second AI Opportunity Audit for businesses like {{business_name}} — <a href="https://audit.wexadvisory.com" style="color:#1a56db;">audit.wexadvisory.com</a>, no signup needed.</p>

<p style="margin:0 0 32px 0;">{{industry_hook}} Either way works for me.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
);

-- ── New variants: followup1 ────────────────────────────────────────────

INSERT INTO templates (type, variant, subject, body_html) VALUES
(
  'followup1', 2,
  'Still there, {{contact_name}}?',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Did my last note about {{business_name}} get buried, or was the timing just off?</p>

<p style="margin:0 0 16px 0;">The free AI Opportunity Audit at <a href="https://audit.wexadvisory.com" style="color:#1a56db;font-weight:600;">audit.wexadvisory.com</a> still takes about 60 seconds and shows where {{business_name}} has the most room to save time.</p>

<p style="margin:0 0 32px 0;">If it''s worth 15 minutes, <a href="{{calendly_url}}" style="color:#1a56db;font-weight:600;">grab time here</a> — or just reply and let me know either way.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
),
(
  'followup1', 3,
  'One more on the AI audit for {{business_name}}',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">The free AI Opportunity Audit at <a href="https://audit.wexadvisory.com" style="color:#1a56db;font-weight:600;">audit.wexadvisory.com</a> takes 60 seconds and shows exactly where {{business_name}} could save time — wanted to make sure it actually reached you this time.</p>

<p style="margin:0 0 16px 0;">{{industry_hook}}</p>

<p style="margin:0 0 32px 0;">Happy to walk through the results if useful — <a href="{{calendly_url}}" style="color:#1a56db;">15 minutes here</a>, or reply directly.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
),
(
  'followup1', 4,
  'Re: quick follow-up',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Following up in case this slipped past — <a href="{{calendly_url}}" style="color:#1a56db;font-weight:600;">grab 15 minutes here</a> if you''d rather just talk it through.</p>

<p style="margin:0 0 32px 0;">Or take the free 60-second AI Opportunity Audit first at <a href="https://audit.wexadvisory.com" style="color:#1a56db;">audit.wexadvisory.com</a> to see exactly where {{business_name}} has room to save time.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
);

-- ── New variants: followup2 ────────────────────────────────────────────

INSERT INTO templates (type, variant, subject, body_html) VALUES
(
  'followup2', 2,
  'Bad timing, {{contact_name}}?',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">No worries if now isn''t the right time for {{business_name}} — just wanted to check before I stop reaching out.</p>

<p style="margin:0 0 16px 0;">The free audit is still there whenever you''re curious: <a href="https://audit.wexadvisory.com" style="color:#1a56db;">audit.wexadvisory.com</a>.</p>

<p style="margin:0 0 32px 0;">Feel free to reply any time, even months from now.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
),
(
  'followup2', 3,
  'Last note on the AI audit',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">The free 60-second AI Opportunity Audit at <a href="https://audit.wexadvisory.com" style="color:#1a56db;">audit.wexadvisory.com</a> will stay up whenever {{business_name}} wants to look — this is my last note for now.</p>

<p style="margin:0 0 16px 0;">{{industry_hook}}</p>

<p style="margin:0 0 32px 0;">Wishing you and the team well.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
),
(
  'followup2', 4,
  'Last one, promise',
  '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Last note from me — if timing changes, <a href="{{calendly_url}}" style="color:#1a56db;">grab 15 minutes here</a> anytime, or check the free audit whenever you''re curious: <a href="https://audit.wexadvisory.com" style="color:#1a56db;">audit.wexadvisory.com</a>.</p>

<p style="margin:0 0 32px 0;">Either way, wishing {{business_name}} well.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>'
);
