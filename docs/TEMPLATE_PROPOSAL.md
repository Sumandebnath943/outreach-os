# Template rewrite (approved 18 Nov 2026)

Approved as drafted. It's applied by migration `006_best_practice_templates.sql`, which replaces the `HYBRID_DEFAULT` subjects and bodies, and new installs get it from the seed in `001`. Role-track overrides forked in the Studio and wait days are not touched.

**Facts:** every claim comes from the current copy: PIBM, 9+ years, 20+ GTM launches, 30% lower CPA, 21+ AI products, MIGI (46 agents, 40–50 jobs a day, under $5 total), ROASmind, the AEO write-up and the eval checks. Nothing is new.

## What changes and why

| Best practice | Current | Proposed |
|---|---|---|
| Subject under ~45 characters, so it isn't cut off on phones | T1 subject is about 80 characters | 26 characters plus the company name |
| Cold first email of 50–125 words | T1 is about 300 words with two bullet lists | T1 is about 95 words |
| One clear question as the call to action | “I’d be glad to connect” | “Open to a 15-minute call about … at {{company_name}}?” |
| Few links in the first email (better Primary-inbox placement on a personal Gmail) | Portfolio + résumé + pixel | Portfolio + pixel; the résumé is offered in replies |
| Lead with the reader, not the sender | “This is a cold outreach, so I’ll keep it brief…” | Starts with the icebreaker, then their hiring problem |
| Each follow-up adds a new angle and gets shorter | Already strong | Kept, but tightened (45–85 words) |
| An easy “reply either way” ask in a bump | No | T2B asks for a one-line reply |
| Breakup email states plainly that there are no more follow-ups | Yes | Kept, shorter |

Warm/cold branching, same-thread replies, the 10:00 local send time, business-day waits and the personal icebreaker are already best practice and stay as they are.

---

## Touch 1 · Cold pitch (Day 0)

**Subject:** `Marketer who builds AI — {{company_name}}?`

```
Hi {{first_name}},

{{custom_icebreaker}}Most teams hiring for {{target_role_opening}} end up choosing between a marketer who can't build and an AI builder who doesn't get brand. I do both:

- 9+ years leading brand, digital and performance marketing, now as Senior Brand Marketing Manager at PIBM (20+ GTM launches, 30% lower CPA).
- 21+ AI products shipped solo in the last 2 years, including MIGI, a 46-agent operator OS running 40–50 jobs a day for under $5 total.

Work and live systems: {{tracked_portfolio_url}}

Open to a 15-minute call about {{target_role_opening}} roles at {{company_name}}?

Best,
Suman Debnath
hire.sumandebnath@gmail.com
```

Alternative subjects for later A/B testing: `Brand + AI builder for {{company_name}}` · `{{first_name}}, a marketer who ships AI`

## Touch 2A · Warm walkthrough (+3 business days, clicked / visited / opened 2+)

```
Hi {{first_name}},

Quick follow-up on my note below. If you're hiring for {{target_role_opening}} at {{company_name}}, I can walk you through MIGI or ROASmind live in 2 minutes. It's quicker than reading about them.

{{tracked_portfolio_url}}

Would a 15-minute call this week or next work?

Best,
Suman
```

## Touch 2B · Cold bump (+3 business days, no engagement)

```
Hi {{first_name}},

Bumping this in case it got buried. The short version: 9+ years of brand and growth leadership, plus 21+ AI products I built and shipped myself.

Is {{company_name}} hiring for {{target_role_opening}} this quarter? A one-line reply either way helps.

Best,
Suman
```

There's no link here on purpose: the portfolio link is already in the thread directly below, and a link-free bump lands better.

## Touch 3 · Value shift (+5 business days)

```
Hi {{first_name}},

Rather than another check-in, here are two short write-ups that may be useful to the {{company_name}} team:

- Agentic readiness: how structured answer blocks got ChatGPT, Claude and Perplexity citing a site within 48 hours.
- Running a 46-agent fleet at 40–50 tasks a day for under $5 total, with model routing and 500+ automated eval checks.

Both are here: {{tracked_portfolio_url}}

If owning both the GTM story and the AI systems behind it is ever on your roadmap, I'd love to talk.

Best,
Suman
```

## Touch 4 · Polite breakup (+6 business days)

```
Hi {{first_name}},

I'll assume the timing isn't right and close the loop here, so no more follow-ups from me.

If {{target_role_opening}} hiring opens up at {{company_name}} later, my work stays live at {{tracked_portfolio_url}}.

All the best to you and the team,
Suman Debnath
```

---

## Deliverability notes (not template changes)

- **Ramp up the daily cap.** A personal Gmail that suddenly sends 45 cold emails a day can get throttled. Start at 15–20 a day for the first 2 weeks, then raise it in Settings.
- **Keep the icebreaker filled in.** One specific line about the company or person is the biggest single lever on reply rate.
- **Judge copy on replies and clicks, not opens.** Apple Mail inflates opens, and the Analytics page shows reply and click rates per touch.
