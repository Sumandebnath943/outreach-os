import { SequenceTemplate, SystemSettings, Lead, EmailLog, TrackingEvent } from '@/types/outreach';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  id: 1,
  send_provider: 'GMAIL',
  execution_mode: 'APPROVAL_GATE',
  daily_send_limit: 45,
  min_delay_minutes: 3,
  max_delay_minutes: 6,
  sender_name: 'Suman Debnath',
  sender_email: 'sumandebnath944@gmail.com',
  portfolio_base_url: 'https://sumandebnath.houseofnamus.com',
  resume_url: 'https://sumandebnath.houseofnamus.com/resume',
  gmail_refresh_token: null,
  updated_at: new Date().toISOString(),
};

export const SEED_SEQUENCE_TEMPLATES: Omit<SequenceTemplate, 'id' | 'created_at'>[] = [
  // =========================================================================
  // 1. HYBRID_DEFAULT (Exact Verified PRD Copy)
  // =========================================================================
  {
    role_track: 'HYBRID_DEFAULT',
    touch_number: 1,
    branch_variant: 'STANDARD',
    subject_template: '9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at {{company_name}}?',
    body_template: `Hi {{first_name}},

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
Portfolio: sumandebnath.houseofnamus.com`,
    wait_business_days: 0,
    same_thread: false,
  },
  {
    role_track: 'HYBRID_DEFAULT',
    touch_number: 2,
    branch_variant: 'WARM',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Following up quickly on my note below—I know hiring inboxes move fast.

If you're currently evaluating candidates for Brand, Growth, or AI Product Marketing at {{company_name}}, I’d love to show you a quick 2-minute live walkthrough of how I architected MIGI (my 46-agent operator OS running on under $5) and ROASmind (unified Meta/Google/LinkedIn ad orchestration).

You can also explore the live interactive systems directly here: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'HYBRID_DEFAULT',
    touch_number: 2,
    branch_variant: 'COLD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I bring 9+ years of full-funnel Brand & Digital Marketing leadership (managing cross-functional teams, 400-page web ecosystems, and 20+ GTM launches) paired with 21+ AI products shipped solo—including a 46-agent autonomous fleet and custom-trained language models.

Everything is verifiable and live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} has current or upcoming openings across Senior Brand Marketing, AI PMM, or AI Product roles.

Best regards,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'HYBRID_DEFAULT',
    touch_number: 3,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Instead of just sending another "checking in" note, wanted to share two practical breakdowns I recently published from my own engineering & marketing notebook that might be useful to your team at {{company_name}}:

- Agentic Readiness & AEO: How I wired Next.js content negotiation and structured answer blocks so AI engines (ChatGPT, Claude, Perplexity) extract clean Markdown and cite the domain within 48 hours.
- Lean Agentic Architecture: How I keep a 46-agent autonomous marketing & ops fleet running 40–50 tasks a day for under $5 total using model routing and 500+ automated eval checks.

Both write-ups (and all 21 live systems) are on my portfolio: {{tracked_portfolio_url}}

If you ever need someone who can own both the GTM narrative and the AI systems underneath it, I’d love to chat.

Best,
Suman Debnath`,
    wait_business_days: 5,
    same_thread: true,
  },
  {
    role_track: 'HYBRID_DEFAULT',
    touch_number: 4,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

I’ll assume the timing isn’t quite right for a Senior Brand Marketing, AI PMM, or AI PM addition at {{company_name}}, so I’ll close the loop here and won't clutter your inbox further.

Leaving my live portfolio here in case roadmaps shift next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 6,
    same_thread: true,
  },

  // =========================================================================
  // 2. BRAND (Senior Brand Marketing Manager Track)
  // =========================================================================
  {
    role_track: 'BRAND',
    touch_number: 1,
    branch_variant: 'STANDARD',
    subject_template: 'Senior Brand Marketing Leader (9+ yrs, 20+ GTM launches + AI-native creative ops) — {{company_name}}',
    body_template: `Hi {{first_name}},

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
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 0,
    same_thread: false,
  },
  {
    role_track: 'BRAND',
    touch_number: 2,
    branch_variant: 'WARM',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Following up quickly on my note below.

If you're evaluating Brand or Growth leadership at {{company_name}}, I’d love to walk you through how we cut CPA by 30%, scaled a 400-page organic web ecosystem, and built ROASmind to unify cross-channel ad operations across Meta, Google, and LinkedIn.

Live case studies & interactive systems: {{tracked_portfolio_url}}

Open to a brief 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'BRAND',
    touch_number: 2,
    branch_variant: 'COLD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Bumping this to the top of your inbox in case it got buried.

Quick summary: I bring 9+ years of Senior Brand & Performance Marketing leadership (cross-functional team management, 20+ GTM launches at 99%+ on-time delivery, 30% CPA reduction) paired with 21 solo-built AI marketing & automation systems.

Full portfolio & résumé: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} is hiring across Senior Brand or Growth Marketing.

Best regards,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'BRAND',
    touch_number: 3,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Wanted to share two practical playbooks I recently published on modern brand discovery and lean marketing ops that may be relevant to {{company_name}}:

- Agentic Readiness (AEO/GEO): How brand websites can serve structured Markdown via content negotiation so ChatGPT, Claude, and Perplexity cite your brand directly.
- AI-Native Ad & Creative Ops: How I unified Meta, Google, and LinkedIn campaign intelligence inside ROASmind and automated 40–50 daily workflows for under $5/mo.

Read both here: {{tracked_portfolio_url}}

Always happy to chat if you need a Brand leader who builds the underlying growth engine too.

Best,
Suman Debnath`,
    wait_business_days: 5,
    same_thread: true,
  },
  {
    role_track: 'BRAND',
    touch_number: 4,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

I’ll assume the timing isn’t right for a Senior Brand Marketing addition at {{company_name}} right now, so I’ll close the loop here.

Leaving my live portfolio for future reference when hiring opens up: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 6,
    same_thread: true,
  },

  // =========================================================================
  // 3. AI_PMM (AI Product Marketing Manager Track)
  // =========================================================================
  {
    role_track: 'AI_PMM',
    touch_number: 1,
    branch_variant: 'STANDARD',
    subject_template: 'AI Product Marketing (9+ yrs GTM/Brand + 21 AI products built solo) — {{company_name}}',
    body_template: `Hi {{first_name}},

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
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 0,
    same_thread: false,
  },
  {
    role_track: 'AI_PMM',
    touch_number: 2,
    branch_variant: 'WARM',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Following up quickly on my note below.

If you're evaluating AI Product Marketing candidates at {{company_name}}, I’d love to show you a 2-minute walkthrough of how I turn complex agentic & model architectures (like my 46-agent OS MIGI and ROASmind) into interactive product demos, technical narratives, and full-funnel GTM launches.

Live systems & 34 write-ups: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'AI_PMM',
    touch_number: 2,
    branch_variant: 'COLD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I combine 9+ years of GTM & Brand Marketing leadership (20+ launches, 30% CPA reduction, 400-page web ecosystem) with hands-on AI systems engineering (21+ shipped AI products, 46-agent fleet, custom SLMs)—allowing me to own AI Product Marketing from technical architecture all the way to revenue.

Everything is live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} is hiring for AI PMM or GTM leadership.

Best regards,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'AI_PMM',
    touch_number: 3,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Instead of a standard check-in, wanted to share two technical GTM breakdowns from my engineering & marketing notebook that might be useful for {{company_name}}'s positioning:

- Agentic Readiness & AEO: How I engineered Next.js content negotiation so ChatGPT, Claude, and Perplexity ingest clean Markdown product specs and cite the domain within 48 hours.
- Marketing Multi-Agent Systems with Proof: How I use 500+ deterministic eval checks and unit-cost telemetry (<$5/mo for 46 agents) to build buyer trust in enterprise AI products.

Both write-ups are live at: {{tracked_portfolio_url}}

Let me know if you’d be open to a quick chat about AI PMM at {{company_name}}.

Best,
Suman Debnath`,
    wait_business_days: 5,
    same_thread: true,
  },
  {
    role_track: 'AI_PMM',
    touch_number: 4,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

I’ll assume the timing isn’t quite right for an AI Product Marketing addition at {{company_name}}, so I’ll close the loop here.

Leaving my live portfolio and 34 GTM/technical write-ups here in case roadmaps shift next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 6,
    same_thread: true,
  },

  // =========================================================================
  // 4. AI_PM (AI Product Manager Track)
  // =========================================================================
  {
    role_track: 'AI_PM',
    touch_number: 1,
    branch_variant: 'STANDARD',
    subject_template: 'AI Product Builder (21 shipped AI systems, 46-agent OS, 9+ yrs GTM) — {{company_name}}',
    body_template: `Hi {{first_name}},

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
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 0,
    same_thread: false,
  },
  {
    role_track: 'AI_PM',
    touch_number: 2,
    branch_variant: 'WARM',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Following up quickly on my note below.

If you're evaluating AI Product Manager candidates at {{company_name}}, I’d love to give you a 2-minute live walkthrough of MIGI’s 46-agent eval harness (500+ automated checks, <$5/mo unit economics) and how I ship and validate full-stack AI products from 0-to-1.

Explore the live systems directly here: {{tracked_portfolio_url}}

Open to a quick 15-minute intro call this week?

Best,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'AI_PM',
    touch_number: 2,
    branch_variant: 'COLD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Floating this back to the top of your inbox in case it got buried.

In short: I’ve independently designed, built, and shipped 21+ working AI systems (including a 46-agent OS with 500+ evals, a 47M SLM trained from scratch, and an audited Banking RM Copilot), backed by 9+ years of cross-functional team leadership and 20+ commercial GTM launches.

All 21 systems and architecture specs are live here: {{tracked_portfolio_url}}

Would love to connect if {{company_name}} has current or upcoming AI PM openings.

Best regards,
Suman Debnath
+91 7980296957`,
    wait_business_days: 3,
    same_thread: true,
  },
  {
    role_track: 'AI_PM',
    touch_number: 3,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

Wanted to share two systems architecture breakdowns I recently published that might be relevant to what your product & engineering teams are building at {{company_name}}:

- Lean Agentic Unit Economics: How I keep a 46-agent autonomous fleet running 40–50 jobs/day for under $5 total using tiered model routing and 500+ deterministic eval gates.
- Agentic Readiness & Structured Protocols: Wiring Next.js content negotiation and MCP-style structured endpoints so external AI agents interact deterministically with web applications.

Both technical write-ups are live at: {{tracked_portfolio_url}}

Always glad to chat if you need an AI PM who ships production code and owns commercial outcomes.

Best,
Suman Debnath`,
    wait_business_days: 5,
    same_thread: true,
  },
  {
    role_track: 'AI_PM',
    touch_number: 4,
    branch_variant: 'STANDARD',
    subject_template: 'Re: {{original_subject}}',
    body_template: `Hi {{first_name}},

I’ll assume the timing isn’t quite right for an AI Product Manager addition at {{company_name}}, so I’ll close the loop here.

Leaving my live portfolio of 21 AI systems here in case product roadmaps expand next quarter: {{tracked_portfolio_url}}

Wishing you and the {{company_name}} team a great quarter ahead.

Best regards,
Suman Debnath
+91 7980296957 | sumandebnath944@gmail.com`,
    wait_business_days: 6,
    same_thread: true,
  },
];

// Initial seed leads for local JSON fallback so the 8-Stage Kanban, Morning Approval Queue, and Lead Dossier Drawer can be inspected immediately
export const INITIAL_DEMO_LEADS: Lead[] = [
  {
    id: '11111111-2222-4333-8444-555555550001',
    first_name: 'Ananya',
    last_name: 'Sharma',
    email: 'ananya.sharma@sarvam-talent-demo.in',
    company_name: 'Sarvam AI',
    job_title: 'VP of Marketing & GTM',
    linkedin_url: 'https://linkedin.com/in/ananya-sharma',
    company_website: 'https://sarvam.ai',
    target_role_opening: 'AI Product Marketing Manager (AI PMM)',
    geo_region: 'INDIA',
    role_track: 'AI_PMM',
    custom_icebreaker: 'Loved your recent enterprise rollout of sovereign voice agents across Indian banking.',
    funnel_stage: 'WARM_ENGAGED',
    sub_stage: null,
    sequence_active: true,
    current_touch: 1,
    next_touch_due_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // Due now for Touch 2A Warm
    approval_status: 'PENDING',
    gmail_thread_id: '192d4a98f1b00101',
    last_message_id_header: '<CA+OutreachOS_001@mail.gmail.com>',
    references_header: '<CA+OutreachOS_001@mail.gmail.com>',
    original_subject: 'AI Product Marketing (9+ yrs GTM/Brand + 21 AI products built solo) — Sarvam AI',
    open_count: 4,
    click_count: 2,
    portfolio_visit_count: 3,
    portfolio_pages_viewed: ['/', '/agents/migi', '/projects/roasmind', '/resume'],
    last_engaged_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    replied_at: null,
    reply_snippet: null,
    reply_sentiment: null,
    reengage_at: null,
    notes: 'High intent — viewed /agents/migi for 94s and downloaded resume. Touch 2A Warm walkthrough queued.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: '11111111-2222-4333-8444-555555550002',
    first_name: 'Marcus',
    last_name: 'Vance',
    email: 'mvance@perplexity-talent-demo.ai',
    company_name: 'Perplexity',
    job_title: 'Head of Product & Growth',
    linkedin_url: 'https://linkedin.com/in/marcus-vance',
    company_website: 'https://perplexity.ai',
    target_role_opening: 'AI Product Marketing Manager',
    geo_region: 'US',
    role_track: 'HYBRID_DEFAULT',
    custom_icebreaker: 'Built an AEO/GEO Markdown content-negotiation layer specifically optimized for Perplexity citations.',
    funnel_stage: 'REPLIED_TRIAGE',
    sub_stage: null,
    sequence_active: false,
    current_touch: 2,
    next_touch_due_at: null,
    approval_status: 'PAUSED',
    gmail_thread_id: '192d4a98f1b00102',
    last_message_id_header: '<CA+OutreachOS_002@mail.gmail.com>',
    references_header: '<CA+OutreachOS_002@mail.gmail.com>',
    original_subject: '9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at Perplexity?',
    open_count: 5,
    click_count: 3,
    portfolio_visit_count: 4,
    portfolio_pages_viewed: ['/', '/writing/agentic-readiness-aeo', '/agents/migi'],
    last_engaged_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    replied_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    reply_snippet: 'Hey Suman — impressive work on MIGI and the AEO Markdown routing write-up. Are you free Thursday at 10am EST for a 20-min chat?',
    reply_sentiment: 'POSITIVE',
    reengage_at: null,
    notes: 'Inbound reply detected by Gmail Thread Poller! Sequence auto-halted.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: '11111111-2222-4333-8444-555555550003',
    first_name: 'Rohan',
    last_name: 'Mehta',
    email: 'rohan.mehta@razorpay-talent-demo.com',
    company_name: 'Razorpay',
    job_title: 'Director of Brand & Integrated Marketing',
    linkedin_url: 'https://linkedin.com/in/rohan-mehta',
    company_website: 'https://razorpay.com',
    target_role_opening: 'Senior Brand Marketing Manager',
    geo_region: 'INDIA',
    role_track: 'BRAND',
    custom_icebreaker: 'Admired Razorpay’s FTX campaign execution and full-funnel B2B brand storytelling.',
    funnel_stage: 'LEAD_QUEUED',
    sub_stage: null,
    sequence_active: true,
    current_touch: 0,
    next_touch_due_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    approval_status: 'PENDING',
    gmail_thread_id: null,
    last_message_id_header: null,
    references_header: null,
    original_subject: null,
    open_count: 0,
    click_count: 0,
    portfolio_visit_count: 0,
    portfolio_pages_viewed: [],
    last_engaged_at: null,
    replied_at: null,
    reply_snippet: null,
    reply_sentiment: null,
    reengage_at: null,
    notes: 'Ready for Touch 1 in Morning Approval Queue.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: '11111111-2222-4333-8444-555555550004',
    first_name: 'Elena',
    last_name: 'Rostova',
    email: 'elena@elevenlabs-talent-demo.io',
    company_name: 'ElevenLabs',
    job_title: 'VP of Product',
    linkedin_url: 'https://linkedin.com/in/elena-rostova',
    company_website: 'https://elevenlabs.io',
    target_role_opening: 'AI Product Manager — Agent Workflows',
    geo_region: 'US',
    role_track: 'AI_PM',
    custom_icebreaker: 'Using ElevenLabs low-latency voice pipelines inside my multi-agent workflow experiments.',
    funnel_stage: 'OUTREACH_ACTIVE',
    sub_stage: null,
    sequence_active: true,
    current_touch: 1,
    next_touch_due_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // Due for Touch 2B Cold
    approval_status: 'PENDING',
    gmail_thread_id: '192d4a98f1b00104',
    last_message_id_header: '<CA+OutreachOS_004@mail.gmail.com>',
    references_header: '<CA+OutreachOS_004@mail.gmail.com>',
    original_subject: 'AI Product Builder (21 shipped AI systems, 46-agent OS, 9+ yrs GTM) — ElevenLabs',
    open_count: 1,
    click_count: 0,
    portfolio_visit_count: 0,
    portfolio_pages_viewed: [],
    last_engaged_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    replied_at: null,
    reply_snippet: null,
    reply_sentiment: null,
    reengage_at: null,
    notes: '1 open, 0 clicks -> Sequencer automatically selected Touch 2B (Cold Proof Bump).',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 75).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: '11111111-2222-4333-8444-555555550005',
    first_name: 'Vikram',
    last_name: 'Nair',
    email: 'vikram.nair@composio-talent-demo.dev',
    company_name: 'Composio',
    job_title: 'Co-Founder & CEO',
    linkedin_url: 'https://linkedin.com/in/vikram-nair',
    company_website: 'https://composio.dev',
    target_role_opening: 'Head of AI Product Marketing & Growth',
    geo_region: 'INDIA',
    role_track: 'AI_PMM',
    custom_icebreaker: 'Big fan of how Composio handles deterministic tool-calling auth for multi-agent fleets.',
    funnel_stage: 'INTERVIEWING',
    sub_stage: 'HIRING_MANAGER',
    sequence_active: false,
    current_touch: 1,
    next_touch_due_at: null,
    approval_status: 'PAUSED',
    gmail_thread_id: '192d4a98f1b00105',
    last_message_id_header: '<CA+OutreachOS_005@mail.gmail.com>',
    references_header: '<CA+OutreachOS_005@mail.gmail.com>',
    original_subject: 'AI Product Marketing (9+ yrs GTM/Brand + 21 AI products built solo) — Composio',
    open_count: 6,
    click_count: 4,
    portfolio_visit_count: 5,
    portfolio_pages_viewed: ['/', '/agents/migi', '/projects/roasmind', '/writing/lean-agentic-architecture', '/resume'],
    last_engaged_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    replied_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    reply_snippet: 'Suman, loved the live MIGI demo. Let us set up the Founder deep-dive round for Friday.',
    reply_sentiment: 'POSITIVE',
    reengage_at: null,
    notes: 'Cleared initial screen. Preparing live walkthrough of MIGI 500-eval suite & GTM launch plan.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 140).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

export const INITIAL_DEMO_LOGS: EmailLog[] = [
  {
    id: '22222222-3333-4444-8555-666666660001',
    lead_id: '11111111-2222-4333-8444-555555550001',
    touch_number: 1,
    branch_variant: 'STANDARD',
    subject: 'AI Product Marketing (9+ yrs GTM/Brand + 21 AI products built solo) — Sarvam AI',
    body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #111827;"><p>Hi Ananya,</p><p>Loved your recent enterprise rollout of sovereign voice agents across Indian banking. I’m reaching out regarding AI Product Marketing Manager (AI PMM) at Sarvam AI.</p><p>Full portfolio & 21 live systems: <a href="https://sumandebnath.houseofnamus.com/?ref=11111111-2222-4333-8444-555555550001">https://sumandebnath.houseofnamus.com/?ref=11111111-2222-4333-8444-555555550001</a></p><p>Best regards,<br/>Suman Debnath</p></div>`,
    provider: 'GMAIL',
    provider_message_id: '192d4a98f1b00101',
    rfc_message_id: '<CA+OutreachOS_001@mail.gmail.com>',
    gmail_thread_id: '192d4a98f1b00101',
    status: 'SENT',
    sent_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    id: '22222222-3333-4444-8555-666666660002',
    lead_id: '11111111-2222-4333-8444-555555550002',
    touch_number: 1,
    branch_variant: 'STANDARD',
    subject: '9+ yrs Brand Marketing + 21 AI products shipped solo — Open roles at Perplexity?',
    body_html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #111827;"><p>Hi Marcus,</p><p>Built an AEO/GEO Markdown content-negotiation layer specifically optimized for Perplexity citations. This is a cold outreach, so I’ll keep it brief and let the work speak for itself.</p><p>Full portfolio: <a href="https://sumandebnath.houseofnamus.com/?ref=11111111-2222-4333-8444-555555550002">https://sumandebnath.houseofnamus.com/?ref=11111111-2222-4333-8444-555555550002</a></p><p>Best regards,<br/>Suman Debnath</p></div>`,
    provider: 'GMAIL',
    provider_message_id: '192d4a98f1b00102',
    rfc_message_id: '<CA+OutreachOS_002@mail.gmail.com>',
    gmail_thread_id: '192d4a98f1b00102',
    status: 'SENT',
    sent_at: new Date(Date.now() - 1000 * 60 * 60 * 115).toISOString(),
  },
];

export const INITIAL_DEMO_EVENTS: TrackingEvent[] = [
  {
    id: '33333333-4444-4555-8666-777777770001',
    lead_id: '11111111-2222-4333-8444-555555550001',
    email_log_id: '22222222-3333-4444-8555-666666660001',
    event_type: 'EMAIL_OPEN',
    metadata: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', openNumber: 1 },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
  },
  {
    id: '33333333-4444-4555-8666-777777770002',
    lead_id: '11111111-2222-4333-8444-555555550001',
    email_log_id: '22222222-3333-4444-8555-666666660001',
    event_type: 'LINK_CLICK',
    metadata: { targetUrl: 'https://sumandebnath.houseofnamus.com/?ref=11111111-2222-4333-8444-555555550001', linkType: 'portfolio' },
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: '33333333-4444-4555-8666-777777770003',
    lead_id: '11111111-2222-4333-8444-555555550001',
    email_log_id: null,
    event_type: 'PORTFOLIO_VIEW',
    metadata: { path: '/agents/migi', durationSec: 94, source: 'sumandebnath.houseofnamus.com' },
    created_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
  },
  {
    id: '33333333-4444-4555-8666-777777770004',
    lead_id: '11111111-2222-4333-8444-555555550001',
    email_log_id: null,
    event_type: 'PORTFOLIO_VIEW',
    metadata: { path: '/projects/roasmind', durationSec: 62, source: 'sumandebnath.houseofnamus.com' },
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: '33333333-4444-4555-8666-777777770005',
    lead_id: '11111111-2222-4333-8444-555555550002',
    email_log_id: '22222222-3333-4444-8555-666666660002',
    event_type: 'REPLY_RECEIVED',
    metadata: {
      snippet: 'Hey Suman — impressive work on MIGI and the AEO Markdown routing write-up. Are you free Thursday at 10am EST for a 20-min chat?',
      threadId: '192d4a98f1b00102',
    },
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
];
