-- Migration 009: New subject lines, AI Audit as primary CTA, industry_hook token
-- AI Audit (audit.wexadvisory.com) is the lead. Automations/AI insights are brief support examples.

UPDATE templates SET
  subject = 'Noticed something about {{business_name}}',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">{{industry_hook}}</p>

<p style="margin:0 0 16px 0;">I built a free 60-second AI Opportunity Audit that shows exactly where {{business_name}} could be using AI to save time and grow — and where you''re leaving the most on the table: <a href="https://audit.wexadvisory.com" style="color:#1a56db;font-weight:600;">audit.wexadvisory.com</a></p>

<p style="margin:0 0 32px 0;">Once you see the results, I''m happy to walk through them — <a href="{{calendly_url}}" style="color:#1a56db;">grab 15 minutes here</a> or just reply to this email.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>',
  updated_at = now()
WHERE type = 'initial';


UPDATE templates SET
  subject = 'Re: {{business_name}}',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Just circling back — wanted to make sure my last note didn''t get buried.</p>

<p style="margin:0 0 16px 0;">The free AI Opportunity Audit at <a href="https://audit.wexadvisory.com" style="color:#1a56db;font-weight:600;">audit.wexadvisory.com</a> takes 60 seconds and shows where {{business_name}} has the most room to save time and operate smarter — things like automating follow-ups, streamlining workflows, or using AI to handle tasks that currently eat up your week.</p>

<p style="margin:0 0 32px 0;">If the results look useful, <a href="{{calendly_url}}" style="color:#1a56db;font-weight:600;">grab 15 minutes here</a> — happy to walk through what''s worth acting on first.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>',
  updated_at = now()
WHERE type = 'followup1';


UPDATE templates SET
  subject = 'Closing the loop',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Last one from me — I know inboxes are full.</p>

<p style="margin:0 0 16px 0;">If the timing isn''t right for {{business_name}} right now, no problem at all. The free AI audit at <a href="https://audit.wexadvisory.com" style="color:#1a56db;">audit.wexadvisory.com</a> will be there whenever you''re curious. Feel free to reply directly any time too.</p>

<p style="margin:0 0 32px 0;">Wishing you and the team well.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.6;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>',
  updated_at = now()
WHERE type = 'followup2';
