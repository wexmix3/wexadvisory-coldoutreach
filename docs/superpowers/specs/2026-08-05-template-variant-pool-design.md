# Template Variant Pool — Design Spec

**Date:** 2026-08-05
**Repo:** outreach-tool (wexmix3/wexadvisory-coldoutreach)
**Motivated by:** Gmail spam-reputation issue confirmed 2026-07-15 (all auth layers clean — DKIM/SPF/DMARC pass — but a live test send still landed in spam with "similar to messages identified as spam in the past"). DMARC Monitor data pulled 2026-08-05 confirms auth is still clean, so the remaining problem is reputation/pattern-matching, not technical delivery. Every cold email in a given stage (initial/followup1/followup2) is currently generated from one fixed template — byte-identical structure across the whole batch except merge-field substitution. This is the exact pattern Gmail's spam classifier fingerprints.

## Goal

Break structural sameness across cold sends by rotating between multiple hand-written variants per stage, so Gmail can no longer pattern-match "this exact template = spam" across the batch. Scope is structure/phrasing variation only — the AI Audit CTA and Calendly link stay in every variant (per decision during brainstorming).

## Current State (confirmed in code)

- `templates` table: `type TEXT UNIQUE NOT NULL` — exactly one row per stage (`initial`, `followup1`, `followup2`).
- `send-scheduled/route.ts`: looks up the single template per `send_type`, runs `renderTemplate()` token substitution, sends via Resend.
- `email_log`: records `template_type` per send, no variant concept.
- `app/templates/page.tsx` + `app/api/templates/route.ts`: single-template-per-stage editor UI, one row fetched/edited/saved per type.
- `app/page.tsx` "By Template" analytics panel: groups `email_log` stats by `template_type` only.

## Design

### 1. Schema changes

**`templates` table** (new migration, e.g. `014_template_variants.sql`):
- Add `variant INTEGER NOT NULL DEFAULT 1`.
- Drop the existing `UNIQUE(type)` constraint.
- Add `UNIQUE(type, variant)`.
- Existing 3 rows (initial/followup1/followup2) keep their content as `variant = 1`.
- Insert 3 new rows per stage (`variant = 2, 3, 4`) — 9 new rows, 12 total.

**`email_log` table** (same migration):
- Add `variant INTEGER` (nullable — historical rows won't have one).

### 2. Copy angles per variant

All variants keep: AI Audit link (audit.wexadvisory.com), Calendly CTA, Max's signature block, unsubscribe footer, industry hook token. What varies is opening style, paragraph order, and CTA phrasing/order — not the underlying message or offer.

**Initial:**
- Variant 1 (existing): statement-opener subject ("Noticed something about {{business_name}}"), industry hook → audit link → Calendly.
- Variant 2: question-opener subject, leads with a direct question instead of an observation, shorter paragraphs.
- Variant 3: data/stat-flavored opener, audit link mentioned in paragraph 1 instead of paragraph 2, signature-first CTA framing.
- Variant 4: casual/direct opener ("Quick one for {{business_name}}"), Calendly link mentioned before the audit link (reversed CTA order), shorter/punchier sentences.

**Followup1** and **Followup2**: same 4-angle logic, applied to their existing "circling back" / "last one" framings respectively — each stage gets its own 4 variants, not shared across stages.

### 3. Send logic (`send-scheduled/route.ts`)

Replace the single-template lookup with a per-stage pool + random pick:

```ts
const templatesByType = groupBy(templates, t => t.type)
// ...
const variants = templatesByType[send_type] ?? []
if (variants.length === 0) { results.failed++; continue }
const template = variants[Math.floor(Math.random() * variants.length)]
```

`email_log` insert and the Resend send both carry `template.variant` through. Falls back safely if a stage only has 1 row (no crash — just no variation for that stage, matching today's behavior).

### 4. Template editor UI (`app/templates/page.tsx`, `app/api/templates/route.ts`)

- Stage buttons (Initial / Followup 1 / Followup 2) stay as-is.
- Add a variant sub-tab row (1/2/3/4) under the stage buttons, scoped to the selected stage.
- `GET /api/templates` already returns all rows — no change needed there, just client-side grouping by `type` then `variant`.
- `PUT /api/templates` already updates by `id` — no change needed, since each variant is its own row with its own `id`.

### 5. Analytics (`app/page.tsx` "By Template" panel)

Extend the existing group-by from `template_type` alone to `template_type + variant`. Same query, same data already being fetched (`template_type, status, opened_at, clicked_at, sent_at` from `email_log`) — just add `variant` to the select and the grouping key. Panel label becomes e.g. "Initial · v2" instead of just "Initial".

### 6. Testing

No existing automated test suite in this repo (confirmed — manual verification is the established pattern here, e.g. the 2026-07-15 deliverability fix). Verification plan:
- `npx tsc --noEmit` clean.
- Manual send to a test address for each of the 4 variants per stage (12 sends total) to visually confirm rendering and token substitution.
- Confirm analytics panel renders the new variant breakdown without errors on empty/sparse data (since real variant data won't exist until sends resume).

## Out of scope

- AI-generated per-send copy (deferred — fixed pool chosen over full generation).
- Changing the underlying offer/CTA (AI Audit + Calendly stays in every variant).
- Subdomain isolation (separate, larger decision — not part of this task).
- Pruning underperforming variants (the new analytics makes this possible later, but no auto-pruning logic is being built now).
