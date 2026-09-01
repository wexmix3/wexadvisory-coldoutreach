-- Migration 017: UTM/prospect attribution on the AI Audit link
-- Every template's audit.wexadvisory.com link was a bare URL with no way to tie
-- a completed audit back to the outreach send that produced the click. Appends
-- utm_source + a per-send prospect_id token, rendered by lib/tokens.ts.
-- See ai-audit migrations for the matching capture/store change.

UPDATE templates
SET body_html = replace(
      body_html,
      'href="https://audit.wexadvisory.com"',
      'href="https://audit.wexadvisory.com?utm_source=coldoutreach&pid={{prospect_id}}"'
    ),
    updated_at = now()
WHERE body_html LIKE '%href="https://audit.wexadvisory.com"%';

-- followup2 v1 mentioned the domain as plain text with no <a href> at all — a real
-- dead link, not caught by the LIKE filter above since it never had an href to begin
-- with. Wraps it in a matching tracked anchor. Found + fixed 2026-09-01 during a
-- full link/token audit of all 12 live template rows (the other 11 were clean).
UPDATE templates
SET body_html = replace(
      body_html,
      'audit.wexadvisory.com will be there',
      '<a href="https://audit.wexadvisory.com?utm_source=coldoutreach&pid={{prospect_id}}">audit.wexadvisory.com</a> will be there'
    ),
    updated_at = now()
WHERE type = 'followup2' AND variant = 1
  AND body_html LIKE '%audit.wexadvisory.com will be there%';
