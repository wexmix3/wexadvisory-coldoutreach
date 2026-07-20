-- Dead-letter table for silently-swallowed webhook processing failures
-- (Resend delivery-event webhook, Calendly booking webhook). Both apps
-- share this Supabase project (idxuiibqevvbdiluxoth) — this table is
-- also created via ai-audit/supabase/migrations/20260719_create_webhook_failures.sql.
-- Only needs to be run once against the shared project; kept here too
-- for this repo's own migration history.
create table if not exists webhook_failures (
  id uuid primary key default gen_random_uuid(),
  source text not null,           -- 'calendly' | 'resend'
  event_type text,
  payload jsonb,
  error_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_failures_created_at on webhook_failures (created_at desc);
