-- OutreachOS · 003 · hardening
-- Run after 001 and 002. Safe to re-run.

-- When a lead last entered CLOSED_ARCHIVE. Ghosted leads keep being polled for a
-- late reply for 30 days after this moment.
alter table public.leads
  add column if not exists archived_at timestamptz;

update public.leads
  set archived_at = updated_at
  where funnel_stage = 'CLOSED_ARCHIVE' and archived_at is null;

create index if not exists idx_leads_archived on public.leads(funnel_stage, sub_stage, archived_at);
create index if not exists idx_leads_updated on public.leads(updated_at desc);

-- Engagement bump, now with a cap on distinct portfolio pages stored per lead so a
-- forged beacon flood cannot grow the row without bound.
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
      when p_page is null
        or p_page = any(coalesce(portfolio_pages_viewed, '{}'))
        or coalesce(cardinality(portfolio_pages_viewed), 0) >= 100
      then portfolio_pages_viewed
      else array_append(coalesce(portfolio_pages_viewed, '{}'), left(p_page, 300))
    end,
    last_engaged_at = now()
  where id = p_lead
  returning *;
$$;

-- Functions in `public` are callable through the Supabase REST API by default.
-- Only the server (service role) may run these.
revoke all on function public.oos_bump_engagement(uuid, int, int, int, text) from public, anon, authenticated;
revoke all on function public.oos_claim_dispatch_slot(int, int) from public, anon, authenticated;
revoke all on function public.oos_touch_updated_at() from public, anon, authenticated;
grant execute on function public.oos_bump_engagement(uuid, int, int, int, text) to service_role;
grant execute on function public.oos_claim_dispatch_slot(int, int) to service_role;

-- Settings sanity: at least one minute between sends (two runs could otherwise share a slot).
update public.system_settings set min_delay_minutes = 1 where min_delay_minutes < 1;
update public.system_settings set max_delay_minutes = min_delay_minutes where max_delay_minutes < min_delay_minutes;
