-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT NOT NULL UNIQUE,
  website TEXT,
  industry TEXT,
  city TEXT,
  state TEXT,
  google_place_id TEXT UNIQUE,
  hunter_confidence INT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  initial_sent_at TIMESTAMPTZ,
  followup1_sent_at TIMESTAMPTZ,
  followup2_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  resend_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent'
);

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default templates
INSERT INTO templates (type, subject, body_html) VALUES
(
  'initial',
  'AI tools that could help {{business_name}}',
  '<p>Hi {{contact_name}},</p>

<p>I run <strong>Wex Advisory</strong>, a boutique consulting firm that helps small businesses use AI to cut costs and grow faster — without needing a tech team.</p>

<p>I recently worked with <strong>25N Coworking</strong> to implement AI-driven tools for their operations and marketing. The result: faster workflows, better member communication, and a stronger competitive edge.</p>

<p>I think there''s a real opportunity to do something similar for <strong>{{business_name}}</strong> in {{city}}.</p>

<p>Would you be open to a quick 20-minute call to explore what''s possible? No pitch — just a conversation about where AI could move the needle for your business.</p>

<p>— Max Wexley<br>
<a href="https://wexadvisory.com">wexadvisory.com</a><br>
maxwexley@wexadvisory.com</p>

<p style="font-size:11px;color:#999;">
<a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>'
),
(
  'followup1',
  'Quick follow-up — {{business_name}}',
  '<p>Hi {{contact_name}},</p>

<p>Just circling back on my note from last week. I know things get busy, so wanted to make sure this didn''t get buried.</p>

<p>My firm helps small businesses in {{industry}} use AI to automate repetitive work, sharpen their marketing, and free up time for what actually matters. Happy to share a few specific ideas for <strong>{{business_name}}</strong> on a short call.</p>

<p>If there''s a better time or person to connect with, just let me know.</p>

<p>— Max Wexley<br>
<a href="https://wexadvisory.com">wexadvisory.com</a></p>

<p style="font-size:11px;color:#999;">
<a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>'
),
(
  'followup2',
  'Last note — {{business_name}}',
  '<p>Hi {{contact_name}},</p>

<p>I''ll keep this short — I know your inbox is full.</p>

<p>If the timing isn''t right for AI consulting at <strong>{{business_name}}</strong>, no worries at all. I''ll leave it here.</p>

<p>But if things shift and you''d like to explore what''s possible, my door is open. You can always reach me at maxwexley@wexadvisory.com or book time at <a href="https://wexadvisory.com">wexadvisory.com</a>.</p>

<p>Best of luck with everything.</p>

<p>— Max Wexley</p>

<p style="font-size:11px;color:#999;">
<a href="{{unsubscribe_url}}">Unsubscribe</a>
</p>'
)
ON CONFLICT (type) DO NOTHING;
