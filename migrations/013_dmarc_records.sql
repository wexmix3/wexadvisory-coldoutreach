-- DMARC aggregate report records, parsed from Google's daily rua reports
-- sent to maxwexley@wexadvisory.com. One row per <record> in each report.
create table if not exists dmarc_records (
  id uuid primary key default gen_random_uuid(),
  report_id text not null,
  org_name text,
  header_from text,
  source_ip text not null,
  message_count int not null,
  disposition text not null,        -- none | quarantine | reject
  dkim_result text,                 -- pass | fail
  spf_result text,                  -- pass | fail
  begin_date timestamptz not null,
  end_date timestamptz not null,
  created_at timestamptz not null default now(),
  unique (report_id, source_ip, dkim_result, spf_result, disposition)
);

create index if not exists idx_dmarc_records_end_date on dmarc_records (end_date desc);
create index if not exists idx_dmarc_records_source_ip on dmarc_records (source_ip);

-- Tracks which Gmail message IDs have already been ingested, so the daily
-- cron never double-processes a report if the Gmail label update fails.
create table if not exists dmarc_processed_emails (
  gmail_message_id text primary key,
  processed_at timestamptz not null default now()
);
