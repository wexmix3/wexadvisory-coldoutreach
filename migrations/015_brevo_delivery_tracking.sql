-- Migration 015: full delivery-event tracking for the Brevo send path
-- delivered_at confirms actual inbox delivery (distinct from "sent" = API accepted the send request)
-- complained_at tracks spam complaints separately from voluntary unsubscribes

ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ;

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
