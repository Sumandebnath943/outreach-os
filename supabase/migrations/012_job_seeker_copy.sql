-- OutreachOS · 012 · job-seeker copy (rewritten from Suman's own outreach) + updated signature
--
-- What changed vs 006/011 and why (research: recruiters respond to a clear purpose, concrete
-- proof, a subject that names the role and the person, and one small ask; generic sales-style
-- lines read as templated):
--   * Subject = role + name + one credential, e.g. "AI Product Manager — Suman Debnath, 21+ AI products shipped".
--   * Touch 1 says who you are and what you're asking for in the first two lines, then specific
--     proof in your own facts, location/relocation, the agentic-ready portfolio, and one ask
--     (15-minute call, or a pointer to the right person).
--   * Separate Touch 1 per role track (BRAND / AI_PMM / AI_PM) leading with the most relevant proof;
--     HYBRID_DEFAULT covers leads with no clear track. Follow-ups are shared by all tracks.
--   * {{target_role_opening}} now defaults per track ("AI Product Manager", …) when the lead
--     has no specific opening.
-- Safe to re-run: overwrites these templates' subject/body (wait days and threading untouched).

update public.system_settings set email_signature = $sig$Suman Debnath
Senior Brand Marketing Manager & AI-Native Product Marketing Leader
Marketer who builds with AI · 9+ yrs brand & growth · 21+ AI products shipped solo
Pune, India (IST) · {{tracked_portfolio_url|Portfolio}} · {{tracked_resume_url|Résumé}} · {{tracked_linkedin_url|LinkedIn}}$sig$
where id = 1;
alter table public.system_settings alter column email_signature set default $sig$Suman Debnath
Senior Brand Marketing Manager & AI-Native Product Marketing Leader
Marketer who builds with AI · 9+ yrs brand & growth · 21+ AI products shipped solo
Pune, India (IST) · {{tracked_portfolio_url|Portfolio}} · {{tracked_resume_url|Résumé}} · {{tracked_linkedin_url|LinkedIn}}$sig$;

insert into public.sequence_templates (role_track, touch_number, branch_variant, subject_template, body_template, wait_business_days, same_thread) values
('HYBRID_DEFAULT', 1, 'STANDARD',
$t$Brand Marketing & AI Product roles — Suman Debnath$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}I'm Suman Debnath, a Senior Brand Marketing Manager with 9+ years in brand, digital and performance marketing, and for the last two years I've also been building AI products myself. I'm writing to ask whether {{company_name}} has, or expects to have, {{target_role_opening}} roles.

What I'd bring:

- Brand and growth leadership: at PIBM I lead a cross-functional team across digital marketing, brand design and web development, grew organic traffic across a 400-page web ecosystem, and ran multiple GTM launches 99%+ on time and on budget.
- Hands-on AI building: 21+ products shipped solo, including MIGI, a 46-agent operator OS guarded by 500+ automated eval checks and running 40–50 jobs a day for under $5 total, and ROASmind, an AI-native marketing OS unifying Meta, Google and LinkedIn ads.
- The bridge between the two: GenAI creative pipelines I built cut design and web turnaround from weeks to hours.

I'm based in Pune and open to roles across India, including relocation, as well as international remote roles.

The live systems and 34 technical/GTM write-ups are on {{tracked_portfolio_url|my portfolio}}. It's agentic-ready, so you can also point an AI assistant at it.

If there's a fit, could we set up a 15-minute call? And if someone else handles this hiring, I'd be grateful for a pointer to them.

Best regards,
{{signature}}$t$,
0, false),

('BRAND', 1, 'STANDARD',
$t${{target_role_opening}} — Suman Debnath, 9+ yrs brand & growth$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}I'm Suman Debnath, Senior Brand Marketing Manager at PIBM, and I'm writing to ask whether {{company_name}} is hiring, now or soon, for {{target_role_opening}} roles.

Over 9+ years I've led brand, digital and performance marketing:

- I lead a cross-functional team across digital marketing, brand design and web development, and manage the annual budgets.
- I grew organic traffic across a 400-page web ecosystem.
- I've run multiple end-to-end GTM launches, 99%+ on time and on budget.

What sets me apart is that I also build with AI. GenAI creative pipelines I built cut design and web turnaround from weeks to hours, and I've shipped 21+ AI products of my own, including ROASmind, a marketing OS that unifies Meta, Google and LinkedIn ads.

I'm based in Pune and open to roles across India, including relocation, as well as international remote roles.

Campaign work, live systems and 34 write-ups are on {{tracked_portfolio_url|my portfolio}}. It's agentic-ready, so you can also point an AI assistant at it.

Would a 15-minute call make sense? If brand hiring sits with someone else, I'd appreciate a pointer.

Best regards,
{{signature}}$t$,
0, false),

('AI_PMM', 1, 'STANDARD',
$t${{target_role_opening}} — Suman Debnath, marketer who builds with AI$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}I'm Suman Debnath, and I'm writing to ask about {{target_role_opening}} roles at {{company_name}}. Product marketing for AI is where my two tracks meet: 9+ years leading brand and growth marketing, and two years designing, building and shipping AI products myself.

- Go-to-market: as Senior Brand Marketing Manager at PIBM I've run multiple end-to-end launches (99%+ on time and on budget), lead a cross-functional team across digital, brand design and web, and grew organic traffic across a 400-page web ecosystem.
- AI products I built and positioned: MIGI, a 46-agent operator OS with a private RAG brain and 500+ automated eval checks, and ROASmind, an AI-native marketing OS for Meta, Google and LinkedIn ads.
- I understand what I'd be marketing (Next.js, FastAPI, Supabase, LLM APIs, evals), so I can turn product capability into positioning that both engineers and buyers trust.

I'm based in Pune and open to roles across India, including relocation, as well as international remote roles.

The live systems and 34 technical/GTM write-ups are on {{tracked_portfolio_url|my portfolio}}. It's agentic-ready, so you can also point an AI assistant at it.

Open to a 15-minute call? If someone else owns product marketing hiring, I'd be grateful for a pointer.

Best regards,
{{signature}}$t$,
0, false),

('AI_PM', 1, 'STANDARD',
$t${{target_role_opening}} — Suman Debnath, 21+ AI products shipped$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}I'm Suman Debnath, and I'm writing to ask about {{target_role_opening}} roles at {{company_name}}. Over the last two years I've designed, built and shipped 21+ AI products on my own, on top of 9+ years of brand and growth leadership, so I come to product from both the user side and the market side.

- MIGI: a 46-agent autonomous operator OS with a multi-agent squad and private RAG brain, guarded by 500+ automated eval checks, running 40–50 jobs a day for under $5 total.
- Models: I trained a 47M-parameter SLM from scratch (PentaCMD-47M, ~87% exact match on 299K pairs) and fine-tuned a coding model (Qdex-1.5B, HumanEval 1.2% → 42.1%).
- Shipping responsibly: an audited Retail Banking RM Copilot that passes 38 security tests.

As Senior Brand Marketing Manager at PIBM I also lead a cross-functional team and run GTM launches, so I know how a product has to land, not just how it's built.

I'm based in Pune and open to roles across India, including relocation, as well as international remote roles.

Everything is live on {{tracked_portfolio_url|my portfolio}}, including evals and write-ups. It's agentic-ready, so you can also point an AI assistant at it.

Would a 15-minute call be useful? If someone else leads AI product hiring, I'd appreciate a pointer.

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

Bringing this back to the top of your inbox in case it got buried. In one line: 9+ years leading brand and growth marketing, plus 21+ AI products I've built and shipped myself.

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
on conflict (role_track, touch_number, branch_variant) do update
  set subject_template = excluded.subject_template,
      body_template = excluded.body_template;

-- Drafts rendered from the old copy re-render from the new templates.
delete from public.email_logs where status = 'QUEUED_FOR_APPROVAL';
