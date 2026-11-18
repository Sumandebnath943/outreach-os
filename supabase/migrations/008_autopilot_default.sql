-- OutreachOS · 008 · Auto-Pilot by default
-- Due touches send automatically inside each recipient's business hours; switch back to
-- Approval Gate from the top bar at any time. Safe to re-run.

alter table public.system_settings alter column execution_mode set default 'AUTO_PILOT';
update public.system_settings set execution_mode = 'AUTO_PILOT' where id = 1;
