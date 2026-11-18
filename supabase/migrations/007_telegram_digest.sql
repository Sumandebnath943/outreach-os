-- OutreachOS · 007 · Telegram morning digest
-- Remembers the last day the digest went out, so the 10-minute worker sends it exactly once a day.
-- Safe to re-run.

alter table public.system_settings
  add column if not exists last_digest_on date not null default '1970-01-01';
