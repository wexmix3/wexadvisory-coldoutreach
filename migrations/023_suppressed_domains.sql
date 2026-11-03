-- Businesses that must never get a cold email from this tool, by domain. Discovery dedupes only on exact email
-- and Google place id, so a different inbox at a business another channel already emailed (Origami, 2026-10-28 to
-- 2026-11-04) would be emailed again. send-scheduled skips any prospect whose email or website domain is listed.
create table if not exists suppressed_domains (
  domain text primary key,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table suppressed_domains enable row level security;
