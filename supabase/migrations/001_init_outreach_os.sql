-- OutreachOS · 001 · core schema + seeded master sequence
-- Run in the Supabase SQL Editor (then run 002_runtime_extensions.sql).

create extension if not exists "uuid-ossp";

-- 1. System Settings (Singleton config table)
create table public.system_settings (
  id int primary key default 1 check (id = 1),
  send_provider text not null default 'GMAIL' check (send_provider in ('GMAIL', 'RESEND')),
  execution_mode text not null default 'AUTO_PILOT' check (execution_mode in ('AUTO_PILOT', 'APPROVAL_GATE')),
  daily_send_limit int not null default 45,
  min_delay_minutes int not null default 3,
  max_delay_minutes int not null default 6,
  sender_name text not null default 'Suman Debnath',
  sender_email text not null default 'hire.sumandebnath@gmail.com',
  portfolio_base_url text not null default 'https://sumandebnath.houseofnamus.com',
  resume_url text not null default 'https://sumandebnath.houseofnamus.com/resume',
  gmail_refresh_token text,
  updated_at timestamptz default now()
);

insert into public.system_settings (id) values (1) on conflict do nothing;

-- 2. Sequence Templates
create table public.sequence_templates (
  id uuid primary key default uuid_generate_v4(),
  role_track text not null check (role_track in ('HYBRID_DEFAULT', 'BRAND', 'AI_PMM', 'AI_PM')),
  touch_number int not null check (touch_number in (1, 2, 3, 4)),
  branch_variant text not null default 'STANDARD' check (branch_variant in ('STANDARD', 'WARM', 'COLD')),
  subject_template text not null,
  body_template text not null,
  wait_business_days int not null default 0,
  same_thread boolean not null default true,
  created_at timestamptz default now(),
  unique(role_track, touch_number, branch_variant)
);

-- 3. Leads Table (The Core Funnel State Machine)
create table public.leads (
  id uuid primary key default uuid_generate_v4(),
  first_name text not null default 'Team',
  last_name text,
  email text not null unique,
  company_name text not null,
  job_title text,
  linkedin_url text,
  company_website text,
  target_role_opening text,
  geo_region text not null default 'INDIA' check (geo_region in ('INDIA', 'US', 'GLOBAL')),
  role_track text not null default 'HYBRID_DEFAULT' check (role_track in ('HYBRID_DEFAULT', 'BRAND', 'AI_PMM', 'AI_PM')),
  custom_icebreaker text,

  -- 8-Stage Funnel State
  funnel_stage text not null default 'LEAD_QUEUED' check (
    funnel_stage in (
      'LEAD_QUEUED',
      'OUTREACH_ACTIVE',
      'WARM_ENGAGED',
      'REPLIED_TRIAGE',
      'INTERVIEWING',
      'OFFER_STAGE',
      'NURTURE_LATER',
      'CLOSED_ARCHIVE'
    )
  ),
  sub_stage text, -- e.g. 'HR_SCREEN', 'HIRING_MANAGER', 'CASE_STUDY', 'FINAL_ROUND', 'BOUNCED', 'GHOSTED', 'REJECTED'

  -- Sequencer State
  sequence_active boolean not null default true,
  current_touch int not null default 0, -- 0 = not started, 1..4 = last touch sent
  next_touch_due_at timestamptz,
  approval_status text not null default 'PENDING' check (approval_status in ('PENDING', 'APPROVED', 'PAUSED')),

  -- Threading & Telemetry Counters
  gmail_thread_id text,
  last_message_id_header text, -- RFC 2822 Message-ID for In-Reply-To chaining
  references_header text,      -- Accumulated RFC 2822 References chain
  original_subject text,
  open_count int not null default 0,
  click_count int not null default 0,
  portfolio_visit_count int not null default 0,
  portfolio_pages_viewed text[] default '{}',
  last_engaged_at timestamptz,
  replied_at timestamptz,
  reply_snippet text,
  reply_sentiment text,
  reengage_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. Email Dispatch Logs
create table public.email_logs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  touch_number int not null,
  branch_variant text not null default 'STANDARD',
  subject text not null,
  body_html text not null,
  provider text not null,
  provider_message_id text,
  rfc_message_id text,
  gmail_thread_id text,
  status text not null default 'SENT' check (status in ('QUEUED_FOR_APPROVAL', 'SENT', 'BOUNCED', 'FAILED')),
  sent_at timestamptz default now()
);

-- 5. Granular Tracking Events (Opens, Clicks, Portfolio Pageviews, Replies)
create table public.tracking_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  email_log_id uuid references public.email_logs(id) on delete set null,
  event_type text not null check (event_type in ('EMAIL_OPEN', 'LINK_CLICK', 'PORTFOLIO_VIEW', 'REPLY_RECEIVED', 'STAGE_CHANGE')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index idx_leads_stage on public.leads(funnel_stage);
create index idx_leads_next_due on public.leads(sequence_active, next_touch_due_at);
create index idx_events_lead on public.tracking_events(lead_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- Seed: Master Hybrid sequence (HYBRID_DEFAULT). Role tracks
-- (BRAND / AI_PMM / AI_PM) inherit these until you fork an
-- override in the Template Studio.
-- Body format: blank line = new paragraph, "- " = bullet,
-- single line breaks inside a paragraph are preserved.
-- ────────────────────────────────────────────────────────────

insert into public.sequence_templates (role_track, touch_number, branch_variant, subject_template, body_template, wait_business_days, same_thread) values
('HYBRID_DEFAULT', 1, 'STANDARD',
$t$Brand Marketing & AI Product roles — Suman Debnath$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}I'm Suman Debnath. I'm looking for my next role and wanted to ask whether {{company_name}} has, or expects to have, {{target_role_opening}} roles. I bring 9+ years in brand, digital and performance marketing, including taking products from positioning through launch and growth, and for the last two years I've also been building AI products myself.

What I'd bring:

- Brand, product and growth leadership: in my current role as Senior Brand Marketing Manager at PIBM I lead a cross-functional team across digital marketing, brand design and web development, grew organic traffic across a 400-page web ecosystem, and ran multiple GTM launches 99%+ on time and on budget.
- Hands-on AI building: 21+ products shipped solo, including MIGI, a 46-agent operator OS guarded by 500+ automated eval checks and running 40–50 jobs a day for under $5 total, and ROASmind, an AI-native marketing OS unifying Meta, Google and LinkedIn ads.
- The bridge between the two: GenAI creative pipelines I built cut design and web turnaround from weeks to hours.

I'm based in Pune and open to roles across India, including relocation, as well as international remote roles.

The live systems and 34 technical/GTM write-ups are on {{tracked_portfolio_url|my portfolio}}. It's agentic-ready, so you can also point an AI assistant at it.

If there's a fit, could we set up a 15-minute call? And if someone else handles this hiring, I'd be grateful for a pointer to them.

Best regards,
{{signature}}$t$,
0, false),

('HYBRID_DEFAULT', 2, 'WARM',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Following up on my note about {{target_role_opening}} roles at {{company_name}}. If it's useful, I'd be glad to walk you or the hiring manager through MIGI or ROASmind live: 15 minutes on a screen-share, working systems rather than slides.

Would some time this week or next work?

Best regards,
{{signature}}$t$,
3, true),

('HYBRID_DEFAULT', 2, 'COLD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Bringing this back to the top of your inbox in case it got buried. In one line: 9+ years leading brand, product and growth marketing, plus 21+ AI products I've built and shipped myself.

If {{company_name}} isn't hiring for {{target_role_opening}} roles right now, a one-line reply saying so, or the name of the right person, would really help.

Best regards,
{{signature}}$t$,
3, true),

('HYBRID_DEFAULT', 3, 'STANDARD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

One more note, with something that may be useful to the {{company_name}} team even if the timing isn't right. Two short write-ups from my own work:

- Agentic readiness: how structured answer blocks got ChatGPT, Claude and Perplexity citing a site within 48 hours.
- Running a 46-agent fleet at 40–50 tasks a day for under $5 total, using model routing and 500+ automated eval checks.

Both are on {{tracked_portfolio_url|my portfolio}}. If a {{target_role_opening}} role opens up, I'd love to be considered.

Best regards,
{{signature}}$t$,
5, true),

('HYBRID_DEFAULT', 4, 'STANDARD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

I won't keep filling your inbox, so this is my last note. If {{target_role_opening}} hiring opens up at {{company_name}} later, I'd be glad to hear from you. My work stays live {{tracked_portfolio_url|on my portfolio}}.

Thanks for reading, and all the best to you and the team.

{{signature}}$t$,
6, true)
on conflict (role_track, touch_number, branch_variant) do nothing;
