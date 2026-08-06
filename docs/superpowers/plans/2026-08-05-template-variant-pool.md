# Template Variant Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break structural sameness across cold-email sends by rotating between 4 hand-written variants per stage (initial/followup1/followup2), so Gmail's spam classifier can no longer pattern-match one fixed template across the whole batch.

**Architecture:** Extend the existing single-row-per-stage `templates` table into a variant pool (add `variant` column, `UNIQUE(type, variant)`), pick randomly at send time, and thread the chosen variant through `email_log` and the analytics dashboard so performance is trackable per variant.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres via `@supabase/supabase-js`), Resend.

## Global Constraints

- Repo has no automated test suite — verification is `npx tsc --noEmit` plus manual/scripted checks against real data, matching this repo's established pattern (confirmed in `state/worksheets/outreach-tool-deliverability-2026-07-15.md`).
- All variants must keep the AI Audit CTA (`audit.wexadvisory.com`) and Calendly CTA (`{{calendly_url}}`) — only structure/phrasing varies, per the approved spec.
- Migrations in this repo are hand-pasted into the Supabase SQL editor (project `idxuiibqevvbdiluxoth`) — never applied programmatically. Flag this clearly at the task that needs it.
- Test sends during verification go only to `maxwexley@wexadvisory.com`, per the standing external-system safety rule — never to real prospects.
- Follow existing code style: inline styles in template HTML (no Tailwind in emails), same signature block/unsubscribe footer as existing templates.

---

### Task 1: Migration — variant pool schema + seed data

**Files:**
- Create: `migrations/014_template_variants.sql`

**Interfaces:**
- Produces: `templates.variant` (INTEGER, part of `UNIQUE(type, variant)`), `email_log.variant` (INTEGER, nullable). Later tasks read/write both.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: MANUAL — apply the migration**

This cannot be applied programmatically (no MCP access to project `idxuiibqevvbdiluxoth`, established convention per `state/worksheets/dmarc-monitor-2026-07-21.md`). Max needs to paste the full contents of `migrations/014_template_variants.sql` into the Supabase SQL editor for project `idxuiibqevvbdiluxoth` and run it. **Do not proceed to Step 3 until this is confirmed done.**

- [ ] **Step 3: Verify the migration applied correctly**

Run this from the `outreach-tool` directory (reads `.env.local`, queries via REST, no secrets printed):

```bash
node -e "
const fs = require('fs');
const env = {};
fs.readFileSync('.env.local','utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)\$/);
  if (m) env[m[1]] = m[2];
});
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
fetch(url + '/rest/v1/templates?select=type,variant&order=type,variant', {
  headers: { apikey: key, Authorization: 'Bearer ' + key }
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)));
"
```

Expected: 12 rows — `variant` 1,2,3,4 for each of `initial`, `followup1`, `followup2`.

- [ ] **Step 4: Commit**

```bash
git add migrations/014_template_variants.sql
git commit -m "feat: add template variant pool migration (12 variants across 3 stages)"
```

---

### Task 2: Type definitions

**Files:**
- Modify: `lib/types.ts:38-58`

**Interfaces:**
- Consumes: none.
- Produces: `EmailLog.variant: number | null`, `Template.variant: number`. Task 3, 4, 5 all import these.

- [ ] **Step 1: Add `variant` to both interfaces**

In `lib/types.ts`, update `EmailLog` and `Template`:

```typescript
export interface EmailLog {
  id: string
  prospect_id: string
  template_type: 'initial' | 'followup1' | 'followup2'
  variant: number | null
  subject: string
  body_html: string
  resend_id: string | null
  sent_at: string
  status: 'sent' | 'failed' | 'bounced'
  reply_category: 'interested' | 'wrong_person' | 'not_now' | 'not_interested' | 'unsubscribe' | null
  opened_at: string | null
  clicked_at: string | null
}

export interface Template {
  id: string
  type: 'initial' | 'followup1' | 'followup2'
  variant: number
  subject: string
  body_html: string
  updated_at: string
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (existing code doesn't reference `.variant` yet, so this is purely additive).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add variant field to Template and EmailLog types"
```

---

### Task 3: Random variant selection in send-scheduled

**Files:**
- Modify: `app/api/send-scheduled/route.ts:92-127`

**Interfaces:**
- Consumes: `Template.variant` (Task 2), `templates` table now has multiple rows per `type` (Task 1).
- Produces: `email_log.variant` populated on every insert; Resend send picks a randomized template per send.

- [ ] **Step 1: Replace the single-template lookup with a per-stage pool**

In `app/api/send-scheduled/route.ts`, replace lines 95-97 (`templateMap` construction):

```typescript
  const templatesByType: Record<string, typeof templates> = {}
  for (const t of templates) {
    (templatesByType[t.type] ??= []).push(t)
  }
```

- [ ] **Step 2: Replace the per-send template lookup with a random pick**

Replace line 103-104 (`const template = templateMap[send_type]; if (!template) { results.failed++; continue }`):

```typescript
    const variants = templatesByType[send_type] ?? []
    if (variants.length === 0) { results.failed++; continue }
    const template = variants[Math.floor(Math.random() * variants.length)]
```

- [ ] **Step 3: Thread `variant` into the email_log insert**

Replace line 120 (`sb.from('email_log').insert({ prospect_id: prospect.id, template_type: send_type, subject, body_html: html, resend_id: resendId, status: 'sent' })`):

```typescript
        sb.from('email_log').insert({ prospect_id: prospect.id, template_type: send_type, variant: template.variant, subject, body_html: html, resend_id: resendId, status: 'sent' }),
```

Also update the failure-path insert on line 127 to include `variant: template.variant`:

```typescript
      await sb.from('email_log').insert({ prospect_id: prospect.id, template_type: send_type, variant: template.variant, subject: renderTemplate(template.subject, prospect, ''), body_html: '', status: 'failed' })
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify variant selection logic with a standalone script**

This repo has no test framework, so verify with a throwaway script (matches the pattern used for the DMARC monitor build — delete after use):

```bash
node -e "
function pickVariant(variants) {
  return variants[Math.floor(Math.random() * variants.length)]
}
const pool = [{variant:1},{variant:2},{variant:3},{variant:4}]
const counts = {1:0,2:0,3:0,4:0}
for (let i = 0; i < 4000; i++) counts[pickVariant(pool).variant]++
console.log(counts)
"
```

Expected: all 4 counts roughly even (~1000 each, no zeros) — confirms the random pick isn't skewed or broken.

- [ ] **Step 6: Commit**

```bash
git add app/api/send-scheduled/route.ts
git commit -m "feat: rotate randomly between template variants per stage on send"
```

---

### Task 4: Template editor UI — variant tabs

**Files:**
- Modify: `app/templates/page.tsx`

**Interfaces:**
- Consumes: `Template.variant` (Task 2), `GET /api/templates` already returns all 12 rows (no API change needed — `templates` table just has more rows now).
- Produces: none consumed elsewhere.

- [ ] **Step 1: Group templates by type, add variant sub-tabs**

Replace the component body in `app/templates/page.tsx` (state and render) to group by `type` then show variant tabs for the selected type:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { Template } from '@/lib/types'

const TYPE_LABEL: Record<string, string> = {
  initial: 'Initial Email',
  followup1: 'Follow-up 1 (Day 5)',
  followup2: 'Follow-up 2 (Day 12)',
}

const TOKENS = ['{{business_name}}', '{{contact_name}}', '{{industry}}', '{{city}}', '{{calendly_url}}', '{{unsubscribe_url}}']

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [activeType, setActiveType] = useState<string | null>(null)
  const [active, setActive] = useState<Template | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/templates')
    const data = await res.json()
    const list: Template[] = data.templates ?? []
    setTemplates(list)
    if (list.length > 0) {
      setActiveType(list[0].type)
      setActive(list[0])
    }
    setLoading(false)
  }

  async function save() {
    if (!active) return
    setSaving(true)
    setSaved(false)
    await fetch('/api/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: active.id, subject: active.subject, body_html: active.body_html }),
    })
    setTemplates(prev => prev.map(t => t.id === active.id ? active : t))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>

  const types = Array.from(new Set(templates.map(t => t.type)))
  const variantsForType = templates.filter(t => t.type === activeType).sort((a, b) => a.variant - b.variant)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Email Templates</h1>
        <p className="text-gray-500 text-sm mt-1">
          Edit the subject and body for each variant. Tokens are replaced automatically on send. Sends rotate randomly between variants within a stage.
        </p>
      </div>

      <div className="flex gap-3">
        {types.map(type => (
          <button
            key={type}
            onClick={() => {
              setActiveType(type)
              const first = templates.filter(t => t.type === type).sort((a, b) => a.variant - b.variant)[0]
              if (first) setActive(first)
            }}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              activeType === type
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {TYPE_LABEL[type] ?? type}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {variantsForType.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              active?.id === t.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            Variant {t.variant}
          </button>
        ))}
      </div>

      {active && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={active.subject}
                  onChange={e => setActive({ ...active, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body (HTML)</label>
                <textarea
                  value={active.body_html}
                  onChange={e => setActive({ ...active, body_html: e.target.value })}
                  rows={18}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5 flex-wrap">
                  {TOKENS.map(tok => (
                    <button
                      key={tok}
                      onClick={() => {
                        const ta = document.querySelector('textarea')
                        if (!ta) return
                        const start = ta.selectionStart
                        const end = ta.selectionEnd
                        const body = active.body_html
                        setActive({ ...active, body_html: body.slice(0, start) + tok + body.slice(end) })
                      }}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono transition-colors"
                    >
                      {tok}
                    </button>
                  ))}
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Preview</p>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-100 px-5 py-4 space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-14 shrink-0">From:</span>
                  <span className="text-gray-700">Max Wexley &lt;maxwexley@wexadvisory.com&gt;</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-14 shrink-0">Subject:</span>
                  <span className="font-medium text-gray-900">{active.subject}</span>
                </div>
              </div>
              <div
                className="px-6 py-5"
                dangerouslySetInnerHTML={{ __html: active.body_html }}
              />
            </div>
            <p className="text-xs text-gray-400">
              Tokens like <span className="font-mono bg-gray-100 px-1 rounded">{'{{business_name}}'}</span> are replaced with real prospect data at send time.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual visual check**

Run `npm run dev`, navigate to `/templates`, click through all 3 stage tabs and all 4 variant sub-tabs per stage — confirm the editor and preview both update correctly and no variant shows blank/wrong content. Stop the dev server after.

- [ ] **Step 4: Commit**

```bash
git add app/templates/page.tsx
git commit -m "feat: add variant sub-tabs to template editor UI"
```

---

### Task 5: Analytics dashboard — break out By Template by variant

**Files:**
- Modify: `app/page.tsx:29-124` (types + `getAnalyticsData`), `app/page.tsx:466-499` (By Template panel)

**Interfaces:**
- Consumes: `email_log.variant` (Task 1/3).
- Produces: none consumed elsewhere (leaf change).

- [ ] **Step 1: Add `variant` to the `LogRow` type and the two `email_log` selects**

In `app/page.tsx`, update `LogRow` (line 29-36):

```typescript
type LogRow = {
  template_type: string
  variant: number | null
  status: string
  opened_at: string | null
  clicked_at: string | null
  prospect_id: string
  sent_at: string
}
```

Update the two `.select()` calls (lines 70 and 79) to include `variant`:

```typescript
      .select('template_type, variant, status, opened_at, clicked_at, prospect_id, sent_at')
```
```typescript
      .select('template_type, variant, status, sent_at')
```

- [ ] **Step 2: Change the `byTemplate` grouping key from `type` to `type:variant`**

Replace the `TemplateStats` type and `byTemplate` construction (lines 54, 111-124):

```typescript
type TemplateStats = { type: string; variant: number | null; sent: number; opens: number; clicks: number; bounced: number }
```

```typescript
  // By template + variant
  const byTemplateMap: Record<string, TemplateStats> = {}
  for (const log of logs) {
    const key = `${log.template_type}:${log.variant ?? '—'}`
    if (!byTemplateMap[key]) {
      byTemplateMap[key] = { type: log.template_type, variant: log.variant, sent: 0, opens: 0, clicks: 0, bounced: 0 }
    }
    const t = byTemplateMap[key]
    if (log.status === 'sent') t.sent++
    if (log.status === 'bounced') t.bounced++
    if (log.opened_at) t.opens++
    if (log.clicked_at) t.clicks++
  }
  const byTemplate = Object.values(byTemplateMap).sort((a, b) =>
    a.type === b.type ? (a.variant ?? 0) - (b.variant ?? 0) : a.type.localeCompare(b.type)
  )
```

Remove the old `byTemplate: Record<string, TemplateStats>` initializer block (the one that pre-seeds `initial`/`followup1`/`followup2` with zeros) — the new map only shows rows for variants that actually have data, which is correct since there's no data yet for the new variants until sends resume.

- [ ] **Step 3: Update the return type and destructuring to match**

The `getAnalyticsData` return already includes `byTemplate` (line 188) — no change needed there since it's just a different shape of the same key. In the page component, the destructuring at line 275 (`byTemplate`) also needs no change.

- [ ] **Step 4: Update the By Template panel to render the array and show variant**

Replace the table body in the "By Template" panel (lines 467-499):

```tsx
        <Panel title="By Template">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: 'left' }}>Template</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Sent</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Opens%</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Clicks%</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Bounced</th>
              </tr>
            </thead>
            <tbody>
              {byTemplate.length === 0 ? (
                <tr><td colSpan={5} style={{ fontSize: '13px', color: '#475569', padding: '8px 0' }}>No data yet.</td></tr>
              ) : byTemplate.map((data) => (
                <tr key={`${data.type}:${data.variant}`} style={{ borderTop: '1px solid #334155' }}>
                  <td style={{ fontSize: '13px', color: '#e2e8f0', padding: '8px 0' }}>
                    {(TEMPLATE_LABELS[data.type] ?? data.type)}{data.variant ? ` · v${data.variant}` : ''}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {data.sent}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {pct(data.opens, data.sent)}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {pct(data.clicks, data.sent)}
                  </td>
                  <td style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>
                    {data.bounced}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
```

Leave the rest of the panel (Avg Response Time / Unsubscribed footer block) unchanged.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual visual check with empty and sparse data**

Run `npm run dev`, navigate to `/`. Since no real sends have used variants yet, confirm the "No data yet." row renders in the By Template panel without crashing, and the rest of the dashboard (funnel, KPIs, by-industry, recent activity) still renders normally. Stop the dev server after.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: break out By Template analytics panel by variant"
```

---

### Task 6: End-to-end verification against real templates

**Files:**
- None created/modified (verification only, using a throwaway script deleted at the end).

**Interfaces:**
- Consumes: everything from Tasks 1-5.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no errors, from a fresh terminal (not relying on incremental state from earlier tasks).

- [ ] **Step 2: Render every variant with fake prospect data and send to Max's own inbox only**

Write `_test-variants.mjs` in the repo root (scratch file, matches the pattern used for the DMARC monitor build):

```javascript
import { readFileSync } from 'fs'

const env = {}
readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2]
})

const fakeProspect = {
  business_name: 'Test Fitness Studio',
  contact_name: 'Alex',
  industry: 'fitness',
  city: 'Chicago',
  custom_intro: null,
}

function renderTemplate(template, prospect, unsubscribeUrl) {
  const firstName = prospect.contact_name?.split(' ')[0]
  const contactName = firstName || 'there'
  const contactGreeting = firstName ? `, ${firstName}` : ''
  const HOOKS = { fitness: 'Most fitness studios are still handling member follow-ups, class reminders, and lead nurture manually — AI can automate all of it and free up hours every week.' }
  const industryHook = HOOKS[prospect.industry] ?? 'Most small businesses are spending 5–10 hours a week on tasks AI can handle — and aren\'t sure where to start.'
  return template
    .replace(/\{\{business_name\}\}/g, prospect.business_name)
    .replace(/\{\{contact_name\}\}/g, contactName)
    .replace(/\{\{contact_greeting\}\}/g, contactGreeting)
    .replace(/\{\{industry\}\}/g, prospect.industry ?? 'your industry')
    .replace(/\{\{city\}\}/g, prospect.city ?? 'your city')
    .replace(/\{\{custom_intro\}\}/g, industryHook)
    .replace(/\{\{industry_hook\}\}/g, industryHook)
    .replace(/\{\{calendly_url\}\}/g, 'https://calendly.com/maxwexley-wexadvisory/free-strategy-call')
    .replace(/\{\{unsubscribe_url\}\}/g, 'https://outreach-tool-inky.vercel.app/api/unsubscribe?id=test')
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const res = await fetch(url + '/rest/v1/templates?select=*&order=type,variant', {
  headers: { apikey: key, Authorization: 'Bearer ' + key }
})
const templates = await res.json()
console.log(`Found ${templates.length} templates. Sending test renders to maxwexley@wexadvisory.com...`)

for (const t of templates) {
  const subject = `[TEST v${t.variant}] ` + renderTemplate(t.subject, fakeProspect, '')
  const html = renderTemplate(t.body_html, fakeProspect, 'https://outreach-tool-inky.vercel.app/api/unsubscribe?id=test')
  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Max Wexley <maxwexley@wexadvisory.com>',
      to: 'maxwexley@wexadvisory.com',
      subject,
      html,
    }),
  })
  const data = await sendRes.json()
  console.log(`${t.type} v${t.variant}: ${sendRes.ok ? 'sent ' + data.id : 'FAILED ' + JSON.stringify(data)}`)
  await new Promise(r => setTimeout(r, 300))
}
```

Run: `node _test-variants.mjs`

Expected: 12 lines of `sent <id>` output, no `FAILED` lines. All 12 test emails land in `maxwexley@wexadvisory.com` — this is the only address this script targets, per the standing external-system safety rule.

- [ ] **Step 3: Visually confirm in the actual inbox**

Open `maxwexley@wexadvisory.com` and check all 12 test emails: correct subject per variant, `{{business_name}}`/`{{contact_name}}`/`{{industry_hook}}` all substituted (no literal `{{...}}` left in any of them), AI Audit link and Calendly link both present and correct in every variant, signature block renders identically across all 12.

- [ ] **Step 4: Delete the scratch script**

```bash
rm _test-variants.mjs
```

(Not committed — matches the DMARC monitor build's pattern of deleting scratch test files before the final commit.)

- [ ] **Step 5: Write the worksheet and tag the work**

Per the OS's worksheet convention, write `state/worksheets/template-variant-pool-2026-08-05.md` in the **aios** repo (goal, what was built, verification evidence — the 12-variant send confirmation from Step 3, remaining risk: no real send data yet since `send-scheduled` picks randomly starting on its next real cron fire). Commit it there, then in the **outreach-tool** repo tag the final commit:

```bash
git tag work/template-variant-pool
```

- [ ] **Step 6: Update the outreach-tool context file**

Add a line to `context/outreach-tool.md` under "Key Quirks" noting: template variant pool shipped 2026-08-05 (4 variants per stage, random pick at send time, tracked in `email_log.variant`, analytics broken out by variant) — motivated by the Gmail reputation/pattern-matching issue from the 2026-07-15 deliverability investigation.
