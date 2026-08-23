-- Migration 016: Update outbound template signature/footer to use the
-- max@wexadvisory.com alias instead of maxwexley@wexadvisory.com.
-- Applied directly to production via a one-off script on 2026-08-23;
-- this file exists so a fresh DB bootstrap from migrations matches prod.

UPDATE templates
SET body_html = REPLACE(body_html, 'maxwexley@wexadvisory.com', 'max@wexadvisory.com'),
    subject = REPLACE(subject, 'maxwexley@wexadvisory.com', 'max@wexadvisory.com')
WHERE body_html LIKE '%maxwexley@wexadvisory.com%'
   OR subject LIKE '%maxwexley@wexadvisory.com%';
