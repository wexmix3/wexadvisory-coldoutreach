# Cost Optimization Audit — outreach-tool (2026-08-18)

## Context
Follow-up to Anthropic's Cost Optimization cookbook deep-dive (ingested via X Insights 2026-08-17). Original remote-agent dispatch for this audit stalled, then hit the known worktree-corruption bug on resume (2 failures) — switched to in-session execution per the standing "two strikes, go local" rule.

## Scope
Grepped all `.ts` files for `Anthropic(`, `messages.create`, `cache_control`. One call site found: `trigger/enrich-prospects.ts`'s `callClaude()`, used in a per-prospect loop (`BATCH_SIZE = 20` prospects/run, 1200ms apart — well inside the 5-minute cache TTL).

## Finding
The entire instructional block passed to Claude (~230 words: role framing, JSON reply format, fit_score guidelines, custom_intro guidance) was byte-identical across every prospect in a batch. Only the business name/industry/location/website-context varied, and it sat in the *middle* of the prompt — meaning even Anthropic's automatic single-breakpoint caching would never have hit, since dynamic content appeared above where a breakpoint would need to land.

## Fix
Restructured `callClaude()` to accept a separate `system` and user prompt. Moved the static instructional block into a `system` array entry with `cache_control: { type: "ephemeral" }`; the per-prospect specifics (business name, industry, location, website context) are now the sole content of the user message. This is purely additive — same information reaches the model, same output contract, just split across the system/user boundary and marked cacheable. No prompt content, model, or effort level changed.

## Verification
- `npx tsc --noEmit -p .` — clean, no type errors.
- No test runner exists in this repo (no vitest/jest dependency, no test script in package.json) — verified correctness via careful manual review of the before/after prompt content rather than an automated test. The reordering (business specifics now follow the instructions instead of sitting mid-block) is intentional, not a defect — it's the canonical system/user split the cookbook itself recommends.
- NOT verified against a live Anthropic call (would cost real tokens and this environment has no reason to burn budget confirming a mechanical, low-risk restructuring). Recommend Max spot-check one real `enrich-prospects` run's `usage.cache_read_input_tokens` in logs/Console after this deploys, to confirm the cache is actually hitting on prospect 2+ within a batch.

## Expected impact
The cached block is roughly 230 words (~300-400 tokens). At Haiku pricing, cached reads cost 0.1x normal input price. Across a 20-prospect batch, prospects 2-20 each save ~90% of that block's input cost — small in absolute dollars at this volume (Haiku is already cheap), but it's free money with zero downside, and the fix scales automatically if batch size or run frequency ever increases.

## Not touched
- Model (`claude-haiku-4-5-20251001`) and lack of `effort` param — Haiku doesn't support `effort` at all, out of scope per the cookbook's own ordering (model/effort changes go last, and this pass didn't attempt any anyway).
- No other Anthropic call sites exist in this repo.

## Commit
Not yet committed — see final session report for the commit/tag once all repos in this audit are done, or find it in the next `git log` if this worksheet is read after that point.
