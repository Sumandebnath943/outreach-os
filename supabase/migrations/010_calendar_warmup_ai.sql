-- OutreachOS · 010 · holiday calendar, sender warm-up, out-of-office auto-resume, log cleanup
-- Safe to re-run.

alter table public.system_settings
  -- skip India / US public holidays when sending and counting business days
  add column if not exists skip_holidays boolean not null default true,
  -- your own extra no-send dates for every region (YYYY-MM-DD, comma separated)
  add column if not exists extra_blackout_dates text,
  -- new-sender warm-up: 10/day in week 1, 20 in week 2, 30 in week 3, then the normal cap
  add column if not exists warmup_enabled boolean not null default true,
  add column if not exists warmup_started_on date default current_date,
  -- out-of-office replies resume the sequence after the person is back (max 2× per lead)
  add column if not exists auto_resume_ooo boolean not null default true;

update public.system_settings set warmup_started_on = current_date where warmup_started_on is null;

-- Supabase free tier housekeeping: pg_cron keeps a row per run (≈ 1,000 a week). Keep 7 days.
-- (pg_net already deletes its responses after 6 hours.)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'outreachos-cleanup',
      '30 3 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$
    );
  end if;
end $$;
