-- OutreachOS · 011 · shared email signature + labelled (clickable-word) links
-- Links can now carry their own text: {{tracked_portfolio_url|Portfolio}} shows "Portfolio" as a
-- clickable word while the link still carries ?ref= + UTM tags. The signature lives in Settings
-- and is inserted by {{signature}}. Safe to re-run (overwrites the HYBRID_DEFAULT bodies only).

alter table public.system_settings
  add column if not exists linkedin_url text default 'https://www.linkedin.com/in/suman-debnath-a528653a1',
  add column if not exists email_signature text default $sig$Suman Debnath
Senior Brand Marketing & AI Product Marketing Leader
Marketer who builds AI · 9+ yrs brand & growth · 21+ AI products shipped solo
Pune, India (IST) · {{tracked_portfolio_url|Portfolio}} · {{tracked_resume_url|Résumé}} · {{tracked_linkedin_url|LinkedIn}}$sig$;

update public.system_settings
  set linkedin_url = coalesce(linkedin_url, 'https://www.linkedin.com/in/suman-debnath-a528653a1'),
      email_signature = coalesce(email_signature, $sig$Suman Debnath
Senior Brand Marketing & AI Product Marketing Leader
Marketer who builds AI · 9+ yrs brand & growth · 21+ AI products shipped solo
Pune, India (IST) · {{tracked_portfolio_url|Portfolio}} · {{tracked_resume_url|Résumé}} · {{tracked_linkedin_url|LinkedIn}}$sig$)
  where id = 1;

insert into public.sequence_templates (role_track, touch_number, branch_variant, subject_template, body_template, wait_business_days, same_thread) values
('HYBRID_DEFAULT', 1, 'STANDARD',
$t$Marketer who builds AI — {{company_name}}?$t$,
$t$Hi {{first_name}},

{{custom_icebreaker}}Most teams hiring for {{target_role_opening}} end up choosing between a marketer who can't build and an AI builder who doesn't get brand. I do both:

- 9+ years leading brand, digital and performance marketing, now as Senior Brand Marketing Manager at PIBM (20+ GTM launches, 30% lower CPA).
- 21+ AI products shipped solo in the last 2 years, including MIGI, a 46-agent operator OS running 40–50 jobs a day for under $5 total.

The live systems and 34 write-ups are on {{tracked_portfolio_url|my portfolio}}.

Open to a 15-minute call about {{target_role_opening}} roles at {{company_name}}?

Best,
{{signature}}$t$,
0, false),

('HYBRID_DEFAULT', 2, 'WARM',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Quick follow-up on my note below. If you're hiring for {{target_role_opening}} at {{company_name}}, I can walk you through MIGI or ROASmind live in 2 minutes — quicker than reading about them. Or explore them yourself {{tracked_portfolio_url|here}}.

Would a 15-minute call this week or next work?

Best,
{{signature}}$t$,
3, true),

('HYBRID_DEFAULT', 2, 'COLD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Bumping this in case it got buried. The short version: 9+ years of brand and growth leadership, plus 21+ AI products I built and shipped myself.

Is {{company_name}} hiring for {{target_role_opening}} this quarter? A one-line reply either way helps.

Best,
{{signature}}$t$,
3, true),

('HYBRID_DEFAULT', 3, 'STANDARD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

Rather than another check-in, two short write-ups that may be useful to the {{company_name}} team:

- Agentic readiness: how structured answer blocks got ChatGPT, Claude and Perplexity citing a site within 48 hours.
- Running a 46-agent fleet at 40–50 tasks a day for under $5 total, with model routing and 500+ automated eval checks.

Both are on {{tracked_portfolio_url|my portfolio}}.

If owning both the GTM story and the AI systems behind it is ever on your roadmap, I'd love to talk.

Best,
{{signature}}$t$,
5, true),

('HYBRID_DEFAULT', 4, 'STANDARD',
$t$Re: {{original_subject}}$t$,
$t$Hi {{first_name}},

I'll assume the timing isn't right and close the loop here — no more follow-ups from me.

If {{target_role_opening}} hiring opens up at {{company_name}} later, my work stays live {{tracked_portfolio_url|on my portfolio}}.

All the best to you and the team,
{{signature}}$t$,
6, true)
on conflict (role_track, touch_number, branch_variant) do update
  set subject_template = excluded.subject_template,
      body_template = excluded.body_template;

-- Drafts rendered from the old copy re-render from the new templates.
delete from public.email_logs where status = 'QUEUED_FOR_APPROVAL';
