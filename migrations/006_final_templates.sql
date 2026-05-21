-- Migration 006: Final email template copy
-- Short + direct tone, comp analysis lead, automation mentioned briefly
-- {{custom_intro}} placed as opening hook in initial email

UPDATE templates SET
  subject = 'Quick question about {{business_name}}',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

{{custom_intro}}<p style="margin:0 0 16px 0;">I put together competitive intelligence reports for small businesses — who''s outranking you, where competitors are winning on traffic and reviews, and 3–5 specific things you can do about it. Delivered as a PDF within 24 hours, starting at $149.</p>

<p style="margin:0 0 16px 0;">I also do workflow automation work for businesses looking to cut down on repetitive tasks, but that''s a longer conversation.</p>

<p style="margin:0 0 32px 0;">Worth a reply if either sounds relevant to {{business_name}}.</p>

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
  subject = 'Following up — {{business_name}}',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Just following up — I know inboxes get busy.</p>

<p style="margin:0 0 16px 0;">For {{industry}} businesses in {{city}}, I typically find 3–5 SEO and review gaps that competitors are quietly exploiting. The report makes those visible and gives you a ranked list of what to address first. $149, delivered in 24 hours.</p>

<p style="margin:0 0 16px 0;">I also do workflow automation work if that''s the more pressing problem — happy to talk through either.</p>

<p style="margin:0 0 32px 0;">Just hit reply if you want to explore it.</p>

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
  subject = 'Last note — {{business_name}}',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 16px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 16px 0;">Last one from me — I know you''re busy.</p>

<p style="margin:0 0 16px 0;">If the timing isn''t right for {{business_name}} right now, no problem at all. If things change and you ever want a competitive snapshot or want to talk through automation, feel free to reach out.</p>

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
