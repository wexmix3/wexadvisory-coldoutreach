-- Migration 021 (2026-09-18): CAN-SPAM physical postal address on every active cold template.
-- Address = Wex Advisory LLC's registered address (Northwest Registered Agent, DOS ID 8008528).

-- Plain-text initials: add under the phone line in the signature. The regexp keeps whichever
-- line ending the row already uses (019 was applied from a CRLF working copy).
UPDATE templates
SET body_html = regexp_replace(body_html, '\(224\) 247-1940(\r?\n)', '(224) 247-1940\1Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207\1')
WHERE is_plain_text AND active AND body_html NOT LIKE '%418 Broadway%';

-- HTML templates: prepend to the small grey unsubscribe footer line.
UPDATE templates
SET body_html = replace(body_html, '><a href="{{unsubscribe_url}}"', '>Wex Advisory LLC, 418 Broadway, Ste N, Albany, NY 12207 &middot; <a href="{{unsubscribe_url}}"')
WHERE NOT is_plain_text AND body_html NOT LIKE '%418 Broadway%';

-- Verify: every active template should carry the address (expect 0 rows).
SELECT type, variant FROM templates WHERE active AND body_html NOT LIKE '%418 Broadway%';
