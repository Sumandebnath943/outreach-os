create extension if not exists "uuid-ossp";

-- 1. System Settings (Singleton config table)
create table if not exists public.system_settings (
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
create table if not exists public.sequence_templates (
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
create table if not exists public.leads (
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
create table if not exists public.email_logs (
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
create table if not exists public.tracking_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  email_log_id uuid references public.email_logs(id) on delete set null,
  event_type text not null check (event_type in ('EMAIL_OPEN', 'LINK_CLICK', 'PORTFOLIO_VIEW', 'REPLY_RECEIVED', 'STAGE_CHANGE')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_leads_stage on public.leads(funnel_stage);
create index if not exists idx_leads_next_due on public.leads(sequence_active, next_touch_due_at);
create index if not exists idx_events_lead on public.tracking_events(lead_id, created_at desc);

-- ============================================================================
-- 6. PRE-SEEDED MASTER SEQUENCE TEMPLATES (ALL 4 TRACKS x 5 VARIANT STEPS)
-- ============================================================================

-- TRACK 1: HYBRID_DEFAULT (Master Hybrid Cold Email & Follow-Up Sequence)
insert into public.sequence_templates (role_track, touch_number, branch_variant, subject_template, body_template, wait_business_days, same_thread)
values
(
  'HYBRID_DEFAULT',
  1,
  'STANDARD',
  '9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at {{company_name}}?',
  'Hi {{first_name}},

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
Portfolio: sumandebnath.houseofnamus.com',
  0,
  false
),
(
  'HYBRID_DEFAULT',
  2,
  'WARM',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Following up quickly on my note below—I know hiring inboxes move fast.

If you''re currently evaluating candidates for Brand, Growth, or AI Product Marketing at {{company_name}}, I’d love to show you a quick 2-minute live walkthrough of how I architected MIGI (my 46-agent operator OS running on under $5) and ROASmind (unified Meta/Google/LinkedIn ad orchestration).

You can also explore the live interactive systems directly here: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'HYBRID_DEFAULT',
  2,
  'COLD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I bring 9+ years of full-funnel Brand & Digital Marketing leadership (managing cross-functional teams, 400-page web ecosystems, and 20+ GTM launches) paired with 21+ AI products shipped solo—including a 46-agent autonomous fleet and custom-trained language models.

Everything is verifiable and live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} has current or upcoming openings across Senior Brand Marketing, AI PMM, or AI Product roles.

Best regards,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'HYBRID_DEFAULT',
  3,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Instead of just sending another "checking in" note, wanted to share two practical breakdowns I recently published from my own engineering & marketing notebook that might be useful to your team at {{company_name}}:

- Agentic Readiness & AEO: How I wired Next.js content negotiation and structured answer blocks so AI engines (ChatGPT, Claude, Perplexity) extract clean Markdown and cite the domain within 48 hours.
- Lean Agentic Architecture: How I keep a 46-agent autonomous marketing & ops fleet running 40–50 tasks a day for under $5 total using model routing and 500+ automated eval checks.

Both write-ups (and all 21 live systems) are on my portfolio: {{tracked_portfolio_url}}

If you ever need someone who can own both the GTM narrative and the AI systems underneath it, I’d love to chat.

Best,
Suman Debnath',
  5,
  true
),
(
  'HYBRID_DEFAULT',
  4,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

I’ll assume the timing isn’t quite right for a Senior Brand Marketing, AI PMM, or AI PM addition at {{company_name}}, so I’ll close the loop here and won''t clutter your inbox further.

Leaving my live portfolio here in case roadmaps shift next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  6,
  true
),

-- TRACK 2: BRAND (Senior Brand Marketing Manager Track)
(
  'BRAND',
  1,
  'STANDARD',
  'Senior Brand Marketing Leader (9+ yrs, 20+ GTM launches + AI-native creative ops) — {{company_name}}',
  'Hi {{first_name}},

{{custom_icebreaker}}Reaching out directly regarding {{target_role_opening}} opportunities at {{company_name}}.

Modern brand and growth teams need leadership that can command full-funnel brand positioning while using AI systems to compress creative and campaign velocity from weeks to hours.

Over the last 9+ years leading Brand, Digital, and Performance Marketing—currently as Senior Brand Marketing Manager at PIBM—I have:
- Led a cross-functional organization across brand design, digital marketing, and web development with full annual budget ownership.
- Scaled organic visibility across a 400-page web ecosystem while driving competitive ROAS and a 30% CPA reduction across paid acquisition channels.
- Directed 20+ end-to-end GTM launches (99%+ on-time and on-budget) and engineered custom GenAI creative & web pipelines that cut manual production turnaround from weeks to hours.
- Built ROASmind (an AI-native marketing OS unifying Meta, Google, and LinkedIn ads) and MIGI (a 46-agent autonomous marketing & ops system running 40–50 workflows/day for under $5).

You can inspect my Brand & GTM case studies, AEO/GEO playbooks, and 21 live systems here:
{{tracked_portfolio_url}}

If {{company_name}} is looking for a Senior Brand Marketing leader who combines 9+ years of brand stewardship with true AI-native execution, I’d welcome a conversation. My résumé: {{tracked_resume_url}}

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  0,
  false
),
(
  'BRAND',
  2,
  'WARM',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Following up quickly on my note below.

If you''re evaluating Brand or Growth leadership at {{company_name}}, I’d love to walk you through how we cut CPA by 30%, scaled a 400-page organic web ecosystem, and built ROASmind to unify cross-channel ad operations across Meta, Google, and LinkedIn.

Live case studies & interactive systems: {{tracked_portfolio_url}}

Open to a brief 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'BRAND',
  2,
  'COLD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Bumping this to the top of your inbox in case it got buried.

Quick summary: I bring 9+ years of Senior Brand & Performance Marketing leadership (cross-functional team management, 20+ GTM launches at 99%+ on-time delivery, 30% CPA reduction) paired with 21 solo-built AI marketing & automation systems.

Full portfolio & résumé: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} is hiring across Senior Brand or Growth Marketing.

Best regards,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'BRAND',
  3,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Wanted to share two practical playbooks I recently published on modern brand discovery and lean marketing ops that may be relevant to {{company_name}}:

- Agentic Readiness (AEO/GEO): How brand websites can serve structured Markdown via content negotiation so ChatGPT, Claude, and Perplexity cite your brand directly.
- AI-Native Ad & Creative Ops: How I unified Meta, Google, and LinkedIn campaign intelligence inside ROASmind and automated 40–50 daily workflows for under $5/mo.

Read both here: {{tracked_portfolio_url}}

Always happy to chat if you need a Brand leader who builds the underlying growth engine too.

Best,
Suman Debnath',
  5,
  true
),
(
  'BRAND',
  4,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

I’ll assume the timing isn’t right for a Senior Brand Marketing addition at {{company_name}} right now, so I’ll close the loop here.

Leaving my live portfolio for future reference when hiring opens up: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  6,
  true
),

-- TRACK 3: AI_PMM (AI Product Marketing Manager Track)
(
  'AI_PMM',
  1,
  'STANDARD',
  'AI Product Marketing (9+ yrs GTM/Brand + 21 AI products built solo) — {{company_name}}',
  'Hi {{first_name}},

{{custom_icebreaker}}I’m reaching out regarding {{target_role_opening}} at {{company_name}}.

In AI Product Marketing, the hardest gap to bridge is translating deep technical architecture (agents, evals, RAG, SLMs) into sharp market positioning, developer/enterprise adoption, and measurable pipeline. Because I’ve spent 9+ years leading GTM & Brand AND shipped 21+ production AI systems solo, I operate natively on both sides.

What I bring to {{company_name}}:
- 9+ Years of GTM & Positioning Execution: Led 20+ end-to-end GTM launches (99%+ on-time/on-budget) as Senior Brand Marketing Manager at PIBM, managing cross-functional design/digital/web teams, scaling a 400-page web ecosystem, and cutting paid CPA by 30%.
- Deep Technical AI Fluency (21+ Shipped Products): Architected MIGI (a 46-agent operator OS with 500+ automated eval checks running 40–50 jobs/day for <$5), ROASmind (multi-channel AI ad OS), trained a 47M-parameter SLM from scratch (PentaCMD-47M), and fine-tuned Qdex-1.5B (1.2% to 42.1% HumanEval).
- Category & Narrative Authority: Published 34 technical & GTM deep-dives, including pioneering Agentic Engine Optimization (AEO/GEO) so AI assistants cite product pages natively.

Explore the live systems and GTM write-ups here:
{{tracked_portfolio_url}} (Press ⌘K or type "hire" anywhere on the site).

I’d love to discuss how I can own product positioning, technical storytelling, and GTM launches at {{company_name}}. My résumé: {{tracked_resume_url}}

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  0,
  false
),
(
  'AI_PMM',
  2,
  'WARM',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Following up quickly on my note below.

If you''re evaluating AI Product Marketing candidates at {{company_name}}, I’d love to show you a 2-minute walkthrough of how I turn complex agentic & model architectures (like my 46-agent OS MIGI and ROASmind) into interactive product demos, technical narratives, and full-funnel GTM launches.

Live systems & 34 write-ups: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'AI_PMM',
  2,
  'COLD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I combine 9+ years of GTM & Brand Marketing leadership (20+ launches, 30% CPA reduction, 400-page web ecosystem) with hands-on AI systems engineering (21+ shipped AI products, 46-agent fleet, custom SLMs)—allowing me to own AI Product Marketing from technical architecture all the way to revenue.

Everything is live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} is hiring for AI PMM or GTM leadership.

Best regards,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'AI_PMM',
  3,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Instead of a standard check-in, wanted to share two technical GTM breakdowns from my engineering & marketing notebook that might be useful for {{company_name}}''s positioning:

- Agentic Readiness & AEO: How I engineered Next.js content negotiation so ChatGPT, Claude, and Perplexity ingest clean Markdown product specs and cite the domain within 48 hours.
- Marketing Multi-Agent Systems with Proof: How I use 500+ deterministic eval checks and unit-cost telemetry (<$5/mo for 46 agents) to build buyer trust in enterprise AI products.

Both write-ups are live at: {{tracked_portfolio_url}}

Let me know if you’d be open to a quick chat about AI PMM at {{company_name}}.

Best,
Suman Debnath',
  5,
  true
),
(
  'AI_PMM',
  4,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

I’ll assume the timing isn’t quite right for an AI Product Marketing addition at {{company_name}}, so I’ll close the loop here.

Leaving my live portfolio and 34 GTM/technical write-ups here in case roadmaps shift next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  6,
  true
),

-- TRACK 4: AI_PM (AI Product Manager Track)
(
  'AI_PM',
  1,
  'STANDARD',
  'AI Product Builder (21 shipped AI systems, 46-agent OS, 9+ yrs GTM) — {{company_name}}',
  'Hi {{first_name}},

{{custom_icebreaker}}Reaching out regarding {{target_role_opening}} at {{company_name}}.

Most AI Product Managers write PRDs and wait on engineering queues—or build prototypes without commercial GTM discipline. I bridge both: over the last 2 years I independently architected, coded, evaluated, and shipped 21+ production AI systems, backed by 9+ years of leading commercial GTM and cross-functional teams.

Highlights of systems I’ve taken from 0-to-1 (Next.js, FastAPI, Supabase, PyTorch, LLM APIs):
- MIGI (46-Agent Operator OS): Multi-agent orchestration with private RAG memory, model routing, and 500+ automated eval checks—running 40–50 autonomous jobs/day for under $5 total.
- Custom SLMs & Fine-Tuning: Trained a 47M-parameter SLM from scratch (PentaCMD-47M, ~87% exact match on 299K pairs) and fine-tuned a 1.5B coding model (Qdex-1.5B, lifting HumanEval from 1.2% to 42.1%).
- Enterprise & Domain AI Apps: Built ROASmind (unified Meta/Google/LinkedIn AI ad OS) and an audited Retail Banking RM Copilot passing 38 security & compliance tests.
- Commercial GTM Ownership: 9+ years as Senior Brand Marketing Manager (PIBM), leading cross-functional teams, 20+ GTM launches (99%+ on-time), and driving 30% CPA reductions.

Inspect all 21 live systems, eval harnesses, and 34 technical write-ups here:
{{tracked_portfolio_url}}

If {{company_name}} needs an AI PM who can own product discovery, evals, unit economics, and GTM adoption end-to-end, I’d love to connect. Résumé: {{tracked_resume_url}}

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  0,
  false
),
(
  'AI_PM',
  2,
  'WARM',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Following up quickly on my note below.

If you''re evaluating AI Product Manager candidates at {{company_name}}, I’d love to give you a 2-minute live walkthrough of MIGI’s 46-agent eval harness (500+ automated checks, <$5/mo unit economics) and how I ship and validate full-stack AI products from 0-to-1.

Explore the live systems directly here: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'AI_PM',
  2,
  'COLD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I’ve independently designed, built, and shipped 21+ working AI systems (including a 46-agent OS with 500+ evals, a 47M SLM trained from scratch, and an audited Banking RM Copilot), backed by 9+ years of cross-functional team leadership and 20+ commercial GTM launches.

All 21 systems and architecture specs are live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} has current or upcoming AI PM openings.

Best regards,
Suman Debnath
+91 7980296957',
  3,
  true
),
(
  'AI_PM',
  3,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

Wanted to share two systems architecture breakdowns I recently published that might be relevant to what your product & engineering teams are building at {{company_name}}:

- Lean Agentic Unit Economics: How I keep a 46-agent autonomous fleet running 40–50 jobs/day for under $5 total using tiered model routing and 500+ deterministic eval gates.
- Agentic Readiness & Structured Protocols: Wiring Next.js content negotiation and MCP-style structured endpoints so external AI agents interact deterministically with web applications.

Both technical write-ups are live at: {{tracked_portfolio_url}}

Always glad to chat if you need an AI PM who ships production code and owns commercial outcomes.

Best,
Suman Debnath',
  5,
  true
),
(
  'AI_PM',
  4,
  'STANDARD',
  'Re: {{original_subject}}',
  'Hi {{first_name}},

I’ll assume the timing isn’t quite right for an AI Product Manager addition at {{company_name}}, so I’ll close the loop here.

Leaving my live portfolio of 21 AI systems here in case product roadmaps expand next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com',
  6,
  true
)
on conflict (role_track, touch_number, branch_variant) do update set
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  wait_business_days = excluded.wait_business_days,
  same_thread = excluded.same_thread;
