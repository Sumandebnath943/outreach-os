-- OutreachOS · 001 · core schema + seeded master sequence
-- Run in the Supabase SQL Editor (then run 002_runtime_extensions.sql).

create extension if not exists "uuid-ossp";

-- 1. System Settings (Singleton config table)
create table public.system_settings (
  id int primary key default 1 check (id = 1),
  send_provider text not null default 'GMAIL' check (send_provider in ('GMAIL', 'RESEND')),
  execution_mode text not null default 'APPROVAL_GATE' check (execution_mode in ('AUTO_PILOT', 'APPROVAL_GATE')),
  daily_send_limit int not null default 45,
  min_delay_minutes int not null default 3,
  max_delay_minutes int not null default 6,
  sender_name text not null default 'Suman Debnath',
  sender_email text not null default 'sumandebnath944@gmail.com',
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
$t$9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at {{company_name}}?$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}This is a cold outreach, so I’ll keep it brief and let the work speak for itself.

Most teams hiring right now have to choose between a marketer who doesn’t know how to build, or an AI builder who doesn’t understand brand, positioning, and business growth. I bring both.

Over the last 9+ years, I’ve led brand, digital, and performance marketing—currently as Senior Brand Marketing Manager at PIBM, where I:

- Handle a cross-functional team across digital marketing, brand design, and web development, managing annual budgets.
- Drove organic traffic growth across a 400-page web ecosystem, while delivering competitive ROAS and a 30% reduction in CPA on paid acquisition.
- Executed 20+ end-to-end GTM launches (99%+ on-time and on-budget) and built custom GenAI creative pipelines that cut manual design and web turnaround from weeks to hours.

In parallel over the last 2 years, I taught myself AI-native systems engineering and independently designed, built, and shipped 21+ working products (across Next.js, FastAPI, Supabase, and LLM APIs):

- MIGI: A 46-agent autonomous operator OS (with a Multi-Agent squad and private RAG brain) guarded by 500+ automated eval checks, running 40–50 jobs/day for under $5 total.
- ROASmind: An AI-native marketing OS unifying Meta, Google, and LinkedIn ads to streamline campaign operations and reduce overhead.
- Custom Models & Audited Apps: Trained a 47M-parameter SLM from scratch (PentaCMD-47M, ~87% exact match on 299K pairs), fine-tuned a coding model (Qdex-1.5B, 1.2% to 42.1% HumanEval), and built an audited Retail Banking RM Copilot passing 38 security tests.

I’m looking to move into a senior role—such as Senior Brand Marketing Manager, AI Product Marketing Manager (AI PMM), or AI Product Manager—where I can take ownership of strategy and bridge product capability with go-to-market growth.

Full portfolio, live systems & 34 technical/GTM write-ups:
{{tracked_portfolio_url}} (It’s fully agentic-ready—feel free to point your AI assistant at it, or press ⌘K / type "hire" anywhere on the site).

If this aligns with your current or upcoming needs at {{company_name}}, I’d be glad to connect. My résumé is available here: {{tracked_resume_url}}

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com
Portfolio: sumandebnath.houseofnamus.com$t$,
0, false),

('HYBRID_DEFAULT', 2, 'WARM',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Following up quickly on my note below—I know hiring inboxes move fast.

If you're currently evaluating candidates for Brand, Growth, or AI Product Marketing at {{company_name}}, I’d love to show you a quick 2-minute live walkthrough of how I architected MIGI (my 46-agent operator OS running on under $5) and ROASmind (unified Meta/Google/LinkedIn ad orchestration).

You can also explore the live interactive systems directly here: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957$t$,
3, true),

('HYBRID_DEFAULT', 2, 'COLD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I bring 9+ years of full-funnel Brand & Digital Marketing leadership (managing cross-functional teams, 400-page web ecosystems, and 20+ GTM launches) paired with 21+ AI products shipped solo—including a 46-agent autonomous fleet and custom-trained language models.

Everything is verifiable and live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} has current or upcoming openings across Senior Brand Marketing, AI PMM, or AI Product roles.

Best regards,
Suman Debnath
+91 7980296957$t$,
3, true),

('HYBRID_DEFAULT', 3, 'STANDARD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Instead of just sending another "checking in" note, wanted to share two practical breakdowns I recently published from my own engineering & marketing notebook that might be useful to your team at {{company_name}}:

- Agentic Readiness & AEO: How I wired Next.js content negotiation and structured answer blocks so AI engines (ChatGPT, Claude, Perplexity) extract clean Markdown and cite the domain within 48 hours.
- Lean Agentic Architecture: How I keep a 46-agent autonomous marketing & ops fleet running 40–50 tasks a day for under $5 total using model routing and 500+ automated eval checks.

Both write-ups (and all 21 live systems) are on my portfolio: {{tracked_portfolio_url}}

If you ever need someone who can own both the GTM narrative and the AI systems underneath it, I’d love to chat.

Best,
Suman Debnath$t$,
5, true),

('HYBRID_DEFAULT', 4, 'STANDARD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

I’ll assume the timing isn’t quite right for a Senior Brand Marketing, AI PMM, or AI PM addition at {{company_name}}, so I’ll close the loop here and won't clutter your inbox further.

Leaving my live portfolio here in case roadmaps shift next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com$t$,
6, true)
on conflict (role_track, touch_number, branch_variant) do nothing;
