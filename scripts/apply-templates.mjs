import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://idxuiibqevvbdiluxoth.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkeHVpaWJxZXZ2YmRpbHV4b3RoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NTg2MiwiZXhwIjoyMDkzOTUxODYyfQ.RSyXduOhdz6VccLSLN8tnWT75YsbrLvPiGQFhUNOmLw'
)

const INITIAL = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 20px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 20px 0;">I run <strong>Wex Advisory</strong>, a boutique consulting firm that helps small businesses use AI to cut costs and grow faster — without needing a tech team.</p>

<p style="margin:0 0 20px 0;">I recently worked with <strong>25N Coworking</strong> to implement AI-driven tools for their operations and marketing. The result: faster workflows, better member communication, and a stronger competitive edge.</p>

<p style="margin:0 0 20px 0;">I think there's a real opportunity to do something similar for <strong>{{business_name}}</strong> in {{city}}.</p>

<p style="margin:0 0 20px 0;">Would you be open to explore what's possible? For instance, I could generate a full 15-page competitive analysis report for you in seconds for very little cost, or we could investigate some redundant tasks that you would like automated.</p>

<p style="margin:0 0 32px 0;">Please let me know when you get a chance. I look forward to the opportunity.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.7;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Consultant | Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>`

const FOLLOWUP1 = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 20px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 20px 0;">Just circling back on my note from last week — I know inboxes get busy.</p>

<p style="margin:0 0 20px 0;">To give you a concrete example of what I mean: for businesses in {{industry}}, I often start with a quick AI-powered competitive analysis that maps out exactly where competitors are outpacing you and where you have room to pull ahead. It takes me minutes to produce and gives you a clear, actionable picture.</p>

<p style="margin:0 0 20px 0;">From there, we can identify which repetitive tasks inside <strong>{{business_name}}</strong> are the best candidates for automation — freeing up your team to focus on higher-value work.</p>

<p style="margin:0 0 32px 0;">Would a 20-minute call this week make sense? Happy to work around your schedule.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.7;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Consultant | Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>`

const FOLLOWUP2 = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">

<p style="margin:0 0 20px 0;">Hi {{contact_name}},</p>

<p style="margin:0 0 20px 0;">I'll keep this one short — I know your time is valuable.</p>

<p style="margin:0 0 20px 0;">If the timing isn't right for <strong>{{business_name}}</strong> right now, I completely understand. I won't follow up after this.</p>

<p style="margin:0 0 20px 0;">But if things shift and you'd like to explore how AI could reduce costs or sharpen your edge in {{city}}, my door is always open.</p>

<p style="margin:0 0 32px 0;">Wishing you and the team all the best.</p>

<table style="border-collapse:collapse;font-size:14px;color:#444;line-height:1.7;">
  <tr><td style="padding:0;font-weight:bold;color:#111;">Max Wexley</td></tr>
  <tr><td style="padding:0;">Consultant | Wex Advisory</td></tr>
  <tr><td style="padding:0;"><a href="mailto:maxwexley@wexadvisory.com" style="color:#1a56db;text-decoration:none;">maxwexley@wexadvisory.com</a></td></tr>
  <tr><td style="padding:0;">(224) 247-1940</td></tr>
  <tr><td style="padding:4px 0 0 0;"><a href="https://wexadvisory.com" style="color:#1a56db;text-decoration:none;">wexadvisory.com</a></td></tr>
</table>

<p style="font-size:11px;color:#999;margin:32px 0 0 0;"><a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a></p>

</div>`

const updates = [
  { type: 'initial',   subject: 'AI tools that could help {{business_name}}', body_html: INITIAL },
  { type: 'followup1', subject: 'Following up — {{business_name}}',           body_html: FOLLOWUP1 },
  { type: 'followup2', subject: 'Last note — {{business_name}}',              body_html: FOLLOWUP2 },
]

for (const u of updates) {
  const { error } = await supabase
    .from('templates')
    .update({ subject: u.subject, body_html: u.body_html, updated_at: new Date().toISOString() })
    .eq('type', u.type)

  if (error) {
    console.error(`❌ Failed to update ${u.type}:`, error.message)
  } else {
    console.log(`✓ Updated ${u.type}`)
  }
}
