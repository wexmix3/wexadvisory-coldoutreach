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
