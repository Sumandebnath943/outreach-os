-- OutreachOS · 005 · explicit table grants for the server role
-- Supabase projects created from mid-2026 no longer grant table access automatically
-- for new tables in `public`, which shows up as "permission denied for table …".
-- OutreachOS only talks to the database from its server, using the secret
-- (service_role) key, so that is the only role granted here. anon/authenticated
-- (the publishable key) get nothing; RLS stays enabled as a second lock.
-- Safe to run on any project, old or new, and safe to re-run.

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.system_settings,
  public.sequence_templates,
  public.leads,
  public.email_logs,
  public.tracking_events
to service_role;

grant execute on function public.oos_bump_engagement(uuid, int, int, int, text) to service_role;
grant execute on function public.oos_claim_dispatch_slot(int, int) to service_role;

-- Make sure the public roles really have no access, whatever the project's defaults were.
revoke all on table
  public.system_settings,
  public.sequence_templates,
  public.leads,
  public.email_logs,
  public.tracking_events
from anon, authenticated;
