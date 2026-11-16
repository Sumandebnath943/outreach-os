-- OutreachOS · 004 · contact details
-- New outreach address (hire.sumandebnath@gmail.com) and no phone number in signatures.
-- Only needed for a database seeded before this change. Safe to re-run.

alter table public.system_settings
  alter column sender_email set default 'hire.sumandebnath@gmail.com';

update public.system_settings
  set sender_email = 'hire.sumandebnath@gmail.com'
  where sender_email = 'sumandebnath944@gmail.com';

-- Signatures in every template, including role-track overrides.
-- Order matters: replace the combined "phone | email" line first, then any lone phone line.
update public.sequence_templates set body_template =
  replace(
    replace(
      replace(body_template, E'\n+91 7980296957 | sumandebnath944@gmail.com', E'\nhire.sumandebnath@gmail.com'),
      E'\n+91 7980296957', ''
    ),
    'sumandebnath944@gmail.com', 'hire.sumandebnath@gmail.com'
  )
where body_template like '%7980296957%' or body_template like '%sumandebnath944@gmail.com%';

-- Drafts waiting in the approval queue carry their own copy of the text.
update public.email_logs set body_html =
  replace(
    replace(
      replace(body_html, E'\n+91 7980296957 | sumandebnath944@gmail.com', E'\nhire.sumandebnath@gmail.com'),
      E'\n+91 7980296957', ''
    ),
    'sumandebnath944@gmail.com', 'hire.sumandebnath@gmail.com'
  )
where status = 'QUEUED_FOR_APPROVAL'
  and (body_html like '%7980296957%' or body_html like '%sumandebnath944@gmail.com%');
