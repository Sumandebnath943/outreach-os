-- OutreachOS · 009 · run the worker from Supabase Cron instead of GitHub Actions
--
-- GitHub's scheduled workflows are best-effort (runs are delayed or dropped under load) and use
-- Actions minutes. Supabase Cron (pg_cron) calls the worker from inside your database on time,
-- for free:
--   * every 10 minutes Monday–Friday (UTC)  → sends, reply detection, alerts, digest
--   * every hour on Saturday and Sunday     → reply detection + Telegram alerts only
--     (no email is sent at weekends: every recipient's send window is Mon–Fri)
--
-- BEFORE RUNNING: replace the two placeholders below in the SQL Editor only.
--   <APP_BASE_URL>  e.g. https://outreachos.houseofnamus.com   (no trailing slash)
--   <CRON_SECRET>   the same value as CRON_SECRET in Vercel
-- Do not save the filled-in version back into the repository.
-- Safe to re-run: secrets are updated in place and jobs are replaced by name.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the URL and the bearer secret in Supabase Vault (encrypted at rest).
do $$
begin
  if exists (select 1 from vault.secrets where name = 'outreachos_url') then
    perform vault.update_secret((select id from vault.secrets where name = 'outreachos_url'), '<APP_BASE_URL>');
  else
    perform vault.create_secret('<APP_BASE_URL>', 'outreachos_url', 'OutreachOS public URL');
  end if;
  if exists (select 1 from vault.secrets where name = 'outreachos_cron_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'outreachos_cron_secret'), '<CRON_SECRET>');
  else
    perform vault.create_secret('<CRON_SECRET>', 'outreachos_cron_secret', 'OutreachOS CRON_SECRET');
  end if;
end $$;

-- One HTTP call to the worker; the worker itself enforces windows, quota, jitter and approvals.
create or replace function public.oos_call_worker() returns bigint
language sql security definer set search_path = public as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'outreachos_url') || '/api/cron/process-queue',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'outreachos_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.oos_call_worker() from public, anon, authenticated;

select cron.schedule('outreachos-worker-weekdays', '*/10 * * * 1-5', 'select public.oos_call_worker()');
select cron.schedule('outreachos-worker-weekends', '7 * * * 0,6', 'select public.oos_call_worker()');

-- Check it is working (after ~10 minutes):
--   select jobname, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--   select status_code, left(content, 200), created from net._http_response order by created desc limit 10;
-- Pause:   select cron.unschedule('outreachos-worker-weekdays'); select cron.unschedule('outreachos-worker-weekends');
