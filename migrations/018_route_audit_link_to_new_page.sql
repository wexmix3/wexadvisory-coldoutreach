-- Migration 018: Point the AI Audit link at the new ScrollCraft landing page
-- Every template linked straight to audit.wexadvisory.com (the plain intake-app
-- landing page). Max approved a rebuilt marketing page at wexadvisory.com/audit
-- (real audit demo, scroll-driven) on 2026-09-02 and wants cold outreach prospects
-- to land there instead, not skip straight to the form. utm_source/pid are
-- preserved end to end: the new page reads them and forwards them unchanged to
-- the intake app on submit (see wex-advisory AuditSurface.tsx `tracking` state).
--
-- Two replacements per row: the href target, and the visible anchor text (which
-- literally read "audit.wexadvisory.com" in every template, including the
-- followup2/v1 row whose anchor text is followed by " will be there") so what
-- the recipient sees matches where the link actually lands.

UPDATE templates
SET body_html = replace(
      body_html,
      'href="https://audit.wexadvisory.com?utm_source=coldoutreach&pid={{prospect_id}}"',
      'href="https://www.wexadvisory.com/audit?utm_source=coldoutreach&pid={{prospect_id}}"'
    ),
    updated_at = now()
WHERE body_html LIKE '%href="https://audit.wexadvisory.com?utm_source=coldoutreach&pid={{prospect_id}}"%';

UPDATE templates
SET body_html = replace(
      body_html,
      '>audit.wexadvisory.com</a>',
      '>wexadvisory.com/audit</a>'
    ),
    updated_at = now()
WHERE body_html LIKE '%>audit.wexadvisory.com</a>%';
