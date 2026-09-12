# Worksheet: Outreach prospect-enrichment quality gate (2026-09-12)

## Goal
Close a real gap found while surveying eval/quality gates across the OS: `trigger/enrich-prospects.ts` writes Claude's `fit_score`/`custom_intro`/`pain_signal` output straight onto a live prospect record with zero automated verification. The only "quality control" that had ever happened was Max manually noticing a formulaic pattern and hand-fixing it after the fact (2026-08-18, commit `4518d3d`).

## Steps taken
1. Read the full enrichment flow (`enrichProspect()` → `callClaude()` → Supabase write) to confirm there was genuinely no check between the LLM call and the DB write beyond JSON-parse validity.
2. Designed a code-only gate (`checkEnrichmentQuality()`), matching the pattern already proven in `ai-audit/lib/ai/synthesize.ts`'s `checkAuditQuality` (no extra API call, pure JS, runs in <1ms):
   - `custom_intro` too short (<20 chars) → reject
   - `custom_intro` starts with "I noticed" → reject (the prompt already bans this opener; it was never enforced in code, only prompted — same "enforce constraints in code, not prose" principle already documented in `content-engine/lib/generate/confidentiality-check.ts`)
   - `pain_signal` too short (<8 chars) → reject
   - `custom_intro` doesn't reference the actual business (no word ≥4 chars from `business_name` appears in the intro) → reject — catches the "perfect email, wrong customer, still a fail" failure mode surfaced during the X-link review this same session
3. Wired the gate into `enrichProspect()`: a failing check logs a `console.warn` with the specific reason and returns `null`, routing into the existing `enrichment_status: "failed"` bucket (same path as an API failure) rather than a new status.
4. Ran `npx tsc --noEmit` — clean, no errors introduced.
5. Committed via the repo's existing pre-commit hook (lint-staged + eslint --fix ran automatically, no issues).

## Verification evidence
- `tsc --noEmit`: clean.
- No dedicated test file exists for `enrich-prospects.ts` (checked via `find`) — this is a Trigger.dev cloud task, not directly unit-testable without mocking the Anthropic client and Supabase; verification here is code-review-level (logic reviewed against the 4 concrete failure modes it targets), not a live production run of a real prospect through the gate.

## Remaining scope
- Not yet observed in production — no real prospect has been enriched through this gate since it shipped. Next enrichment cron run (Mon-Fri 11am UTC dispatch → Trigger.dev) will be the first live exercise. Worth checking `enrichment_status='failed'` counts and the new console.warn logs after that run to confirm the gate fires correctly (and not too aggressively) on real data.
- No quality-retry loop was added (unlike `synthesize.ts`'s one-retry pattern) — a failing prospect is marked `failed` outright rather than retried with feedback. This matches the existing failure-handling shape for this task (API failures already go to the same bucket with no retry) rather than introducing a new pattern; revisit if the fail rate turns out to be high enough that a retry would meaningfully recover otherwise-good leads.

## Open risks
- The "mentions the business" check only looks at words ≥4 chars in `business_name` — very short business names (e.g. all words <4 chars) skip this specific check entirely (falls through as passing), which is a deliberate choice to avoid false rejections on short names, not an oversight, but worth knowing if a short-named prospect's intro turns out wrong anyway.
