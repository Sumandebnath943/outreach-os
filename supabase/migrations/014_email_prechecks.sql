-- Run before deploying the email precheck stage. Idempotent; no existing approvals are revoked.
alter table public.leads
  add column if not exists email_check_status text not null default 'PENDING'
    check (email_check_status in ('PENDING', 'PASSED', 'BLOCKED', 'RETRY')),
  add column if not exists email_check_reason text,
  add column if not exists email_check_warnings text[] not null default '{}',
  add column if not exists email_checked_at timestamptz,
  add column if not exists email_check_next_at timestamptz not null default now();

create index if not exists idx_leads_email_checks on public.leads(email_check_next_at, id)
  where deleted_at is null and sequence_active;

-- Editing the address invalidates its old result, including direct database edits.
create or replace function public.oos_reset_email_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.email is distinct from OLD.email then
    NEW.email_check_status := 'PENDING';
    NEW.email_check_reason := null;
    NEW.email_check_warnings := '{}';
    NEW.email_checked_at := null;
    NEW.email_check_next_at := now();
    NEW.approval_status := 'PENDING';
  end if;
  return NEW;
end $$;
revoke all on function public.oos_reset_email_check() from public, anon, authenticated;
drop trigger if exists trg_reset_email_check on public.leads;
create trigger trg_reset_email_check before update of email on public.leads
  for each row execute function public.oos_reset_email_check();

notify pgrst, 'reload schema';
