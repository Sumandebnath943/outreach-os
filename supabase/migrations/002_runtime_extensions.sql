-- OutreachOS · 002 · runtime extensions
-- Additive only: send windows, dispatch jitter gate, error capture,
-- atomic counter RPCs, updated_at triggers and RLS lockdown.

-- Configurable recipient send windows (local hour, [start, end) Mon–Fri)
alter table public.system_settings
  add column if not exists india_window_start int not null default 10,
  add column if not exists india_window_end int not null default 18,
  add column if not exists us_window_start int not null default 9,
  add column if not exists us_window_end int not null default 17,
  add column if not exists global_window_start int not null default 9,
  add column if not exists global_window_end int not null default 18,
  add column if not exists archive_after_business_days int not null default 4,
  add column if not exists reengage_after_days int not null default 60,
  -- Earliest moment the next email may go out (randomised jitter gate)
  add column if not exists next_dispatch_at timestamptz,
  add column if not exists last_queue_run_at timestamptz;

alter table public.email_logs
  add column if not exists error text;

create index if not exists idx_email_logs_lead on public.email_logs(lead_id, sent_at desc);
create index if not exists idx_email_logs_status_sent on public.email_logs(status, sent_at);

-- updated_at maintenance
create or replace function public.oos_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_leads_updated on public.leads;
create trigger trg_leads_updated before update on public.leads
  for each row execute function public.oos_touch_updated_at();

drop trigger if exists trg_settings_updated on public.system_settings;
create trigger trg_settings_updated before update on public.system_settings
  for each row execute function public.oos_touch_updated_at();

-- Atomic engagement counter bump (avoids read-modify-write races
-- when Gmail's image proxy and the portfolio beacon fire together).
create or replace function public.oos_bump_engagement(
  p_lead uuid,
  p_opens int default 0,
  p_clicks int default 0,
  p_visits int default 0,
  p_page text default null
) returns setof public.leads
language sql as $$
  update public.leads set
    open_count = open_count + p_opens,
    click_count = click_count + p_clicks,
    portfolio_visit_count = portfolio_visit_count + p_visits,
    portfolio_pages_viewed = case
      when p_page is null or p_page = any(coalesce(portfolio_pages_viewed, '{}')) then portfolio_pages_viewed
      else array_append(coalesce(portfolio_pages_viewed, '{}'), p_page)
    end,
    last_engaged_at = now()
  where id = p_lead
  returning *;
$$;

-- Jitter gate: atomically claims the next dispatch slot. Returns the new
-- next_dispatch_at when the caller may send now, or no row when it must wait.
-- Prevents overlapping cron invocations from double-sending.
create or replace function public.oos_claim_dispatch_slot(p_min int, p_max int)
returns table (next_dispatch_at timestamptz)
language sql as $$
  update public.system_settings s set
    next_dispatch_at = now() + ((p_min + random() * greatest(p_max - p_min, 0)) * interval '1 minute')
  where s.id = 1 and (s.next_dispatch_at is null or s.next_dispatch_at <= now())
  returning s.next_dispatch_at;
$$;

-- Lock everything down: only the service-role key (server-side) can read/write.
alter table public.system_settings enable row level security;
alter table public.sequence_templates enable row level security;
alter table public.leads enable row level security;
alter table public.email_logs enable row level security;
alter table public.tracking_events enable row level security;
