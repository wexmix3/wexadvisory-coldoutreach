-- Migration 003: Remove 25N Coworking reference, update copy to reflect both services
-- (Competitive Analysis + Workflow Automation)

UPDATE templates SET
  subject = 'Quick question about {{business_name}}',
  body_html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 20px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 20px 0;">I run <strong>Wex Advisory</strong> — I help small businesses use AI to understand their competition and cut time wasted on repetitive work, without needing a tech team or a big budget.</p>

<p style="margin:0 0 20px 0;">I think there could be a real opportunity to do something useful for <strong>{{business_name}}</strong> in {{city}}. Two things I commonly help with:</p>

<ul style="margin:0 0 20px 0;padding-left:20px;">
  <li style="margin-bottom:8px;"><strong>Competitive analysis</strong> — a full report on your top competitors: traffic, SEO positioning, review velocity, and a ranked action plan. Delivered as a professional PDF within 24 hours, starting at $149.</li>
  <li style="margin-bottom:8px;"><strong>Workflow automation</strong> — identifying which tasks your team does repeatedly and setting up AI tools to handle them automatically. Fixed-fee, no ongoing developer needed.</li>
</ul>

<p style="margin:0 0 32px 0;">Would it make sense to spend 20 minutes exploring what might be useful for you? Happy to work around your schedule.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.7;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Consultant | Wex Advisory</td></tr>
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

<p style="margin:0 0 20px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 20px 0;">Just following up on my note from last week — I know inboxes fill up fast.</p>

<p style="margin:0 0 20px 0;">To give you a concrete example: for businesses in {{industry}}, I often start with a competitive analysis that maps out exactly where competitors are outpacing you — traffic, SEO, reviews, positioning — and where you have room to pull ahead. It comes as a structured PDF and takes me less than 24 hours to turn around.</p>

<p style="margin:0 0 20px 0;">From there, if there are repetitive tasks inside <strong>{{business_name}}</strong> worth automating — follow-ups, reporting, scheduling, customer communication — that''s the second thing I help with.</p>

<p style="margin:0 0 32px 0;">Would a 20-minute call this week make sense? No pitch, just a conversation about what might actually be useful.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.7;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Consultant | Wex Advisory</td></tr>
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

<p style="margin:0 0 20px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 20px 0;">I''ll keep this short — I know your time is valuable.</p>

<p style="margin:0 0 20px 0;">If the timing isn''t right for <strong>{{business_name}}</strong> right now, I completely understand. I won''t follow up after this.</p>

<p style="margin:0 0 20px 0;">But if things shift and you''d ever like to look at your competitive position or find some time savings through automation, my door''s open.</p>

<p style="margin:0 0 32px 0;">Wishing you and the team well.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.7;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Consultant | Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>',
  updated_at = now()
WHERE type = 'followup2';
