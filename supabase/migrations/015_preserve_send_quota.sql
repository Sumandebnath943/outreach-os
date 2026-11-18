-- Sent mail must continue consuming quota after a lead is permanently deleted.
-- Sent history loses its lead association; drafts/failed attempts are removed with the lead.
alter table public.email_logs alter column lead_id drop not null;
alter table public.email_logs drop constraint if exists email_logs_lead_id_fkey;
alter table public.email_logs add constraint email_logs_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

create or replace function public.oos_clean_deleted_lead_mail() returns trigger
language plpgsql set search_path = public as $$
begin
  delete from public.email_logs where lead_id = OLD.id and status not in ('SENT', 'BOUNCED');
  -- Preserve only delivery/accounting data, not the deleted contact's message content.
  update public.email_logs set subject = '(Deleted lead)', body_html = '', error = null
    where lead_id = OLD.id;
  return OLD;
end $$;
revoke all on function public.oos_clean_deleted_lead_mail() from public, anon, authenticated;
drop trigger if exists trg_clean_deleted_lead_mail on public.leads;
create trigger trg_clean_deleted_lead_mail before delete on public.leads
  for each row execute function public.oos_clean_deleted_lead_mail();
notify pgrst, 'reload schema';
