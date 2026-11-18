-- Run in the Supabase SQL Editor BEFORE deploying this version. Safe to re-run.
alter table public.leads
  add column if not exists deleted_at timestamptz,
  add column if not exists last_reply_checked_at timestamptz,
  add column if not exists is_test boolean not null default false,
  add column if not exists import_batch_id uuid;
alter table public.email_logs add column if not exists is_test boolean not null default false;

create table if not exists public.import_batches (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  summary jsonb not null default '{}',
  exceptions jsonb not null default '[]',
  status text not null default 'IMPORTING' check (status in ('IMPORTING', 'COMPLETE', 'FAILED')),
  created_at timestamptz not null default now()
);
create table if not exists public.suppressed_addresses (
  email text primary key,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.import_batches enable row level security;
alter table public.suppressed_addresses enable row level security;
revoke all on public.import_batches, public.suppressed_addresses from anon, authenticated;
grant select, insert, update, delete on public.import_batches, public.suppressed_addresses to service_role;

-- Identify existing test sends by the exact marker used by the live runner, never by a real address.
update public.leads set is_test = true where notes = 'OutreachOS live test lead — safe to delete';
update public.email_logs e set is_test = true from public.leads l where e.lead_id = l.id and l.is_test;
insert into public.suppressed_addresses(email, reason)
select lower(email), 'Hard bounce' from public.leads where sub_stage = 'BOUNCED'
on conflict do nothing;

create or replace function public.oos_lead_safety() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'DELETE' then return OLD; end if;
  if NEW.deleted_at is not null then
    NEW.sequence_active := false;
    NEW.approval_status := 'PAUSED';
    NEW.next_touch_due_at := null;
    NEW.reengage_at := null;
  end if;
  if NEW.sub_stage = 'BOUNCED' then
    insert into public.suppressed_addresses(email, reason) values(lower(NEW.email), 'Hard bounce') on conflict do nothing;
  end if;
  if NEW.sequence_active and exists(select 1 from public.suppressed_addresses where email = lower(NEW.email)) then
    NEW.sequence_active := false;
    NEW.approval_status := 'PAUSED';
    NEW.next_touch_due_at := null;
  end if;
  return NEW;
end $$;
revoke all on function public.oos_lead_safety() from public, anon, authenticated;
drop trigger if exists trg_lead_safety on public.leads;
create trigger trg_lead_safety before insert or update on public.leads for each row execute function public.oos_lead_safety();

create index if not exists idx_leads_live_stage on public.leads(funnel_stage, updated_at desc, id) where deleted_at is null;
create index if not exists idx_leads_reply_rotation on public.leads(last_reply_checked_at nulls first, id) where deleted_at is null and sequence_active;
create index if not exists idx_leads_batch on public.leads(import_batch_id);
create index if not exists idx_leads_trash on public.leads(deleted_at) where deleted_at is not null;
-- Inbox polling is bookkeeping, not a new lead activity. Avoid shuffling the board on every poll.
create or replace function public.oos_touch_updated_at() returns trigger language plpgsql as $$
begin
  if TG_TABLE_NAME = 'leads' and
     (to_jsonb(NEW) - 'last_reply_checked_at') = (to_jsonb(OLD) - 'last_reply_checked_at') then
    return NEW;
  end if;
  NEW.updated_at = now();
  return NEW;
end $$;
-- Trash expires after 30 days. Suppressions survive permanent deletion.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('outreachos-trash-cleanup', '45 3 * * *',
      $job$delete from public.leads where deleted_at < now() - interval '30 days'$job$);
  end if;
end $$;
