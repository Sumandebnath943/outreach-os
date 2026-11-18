# OutreachOS: Portfolio Showcase Handoff

> Source material for a product showcase / case-study page on the owner's portfolio site.
> Everything here is safe to publish: no secrets, no lead data, no private email addresses.
> Full technical reference: `docs/PROJECT_BIBLE.md`.

---

## 0. How to use this doc

- **Section 1:** ready-to-paste hero copy.
- **Sections 2–9:** the case-study narrative (problem → insight → solution → how it works → features → build → results → learnings), with suggested visuals.
- **Section 10:** facts and numbers you can quote.
- **Section 11:** a suggested page layout and visual direction.
- Screenshots to capture are marked **📸**. Diagrams to draw are marked **🧩**.

---

## 1. Hero

**Product name:** OutreachOS
**One-liner:** Run your job search like a revenue pipeline.
**Sub-head:** A private outreach CRM that sends personal, perfectly-timed emails from my own Gmail, reads every reply with AI, and pings my phone the moment someone answers.

**Role tags:**
- Product, design & engineering: solo.
- AI-native build.
- Next.js · Supabase · Gmail API · Groq · Telegram.

**Primary CTA:** "See how it works" (scroll). **Secondary:** "Read the product bible" (optional link).

📸 Hero visual: the Pipeline Kanban board in dark mode, with a Telegram "🔥 HOT — positive reply" alert overlaid on a phone frame.

---

## 2. The problem

> Applying through job portals felt like sending CVs into a void.

- **No signal.** You never know whether anyone opened the application or looked at your portfolio.
- **Direct outreach works, but manual outreach breaks.** Writing to the right recruiter or hiring manager gets replies. Doing it for 50+ companies means tracking:
  - who you wrote to;
  - when to follow up, in their timezone and in the same thread;
  - who already replied;
  - who's quietly interested.
- **Sales tools are built for sales.** Cold-email platforms push volume and salesy copy. Recruiters ignore that, and personal Gmail accounts get flagged for it.

**The question:** what would a careful, tireless assistant do if it ran my job search like a B2B pipeline, without ever sounding like one?

---

## 3. The insight

1. **A job search *is* a pipeline.** It has leads, touches, engagement, replies, meetings and offers.
2. **What converts is personal and specific.** A clear purpose, real proof, and one small ask. Never "templated" sales language.
3. **Timing and restraint matter.** Send in the recipient's business hours, never on holidays, at a human pace, and stop instantly when someone replies.
4. **Intent beats vanity metrics.** A portfolio visit or a click says far more than an "open" (which Apple Mail fakes anyway).

---

## 4. The solution

OutreachOS is a **single-owner outreach operating system** with five jobs:

| Job | What it does |
|---|---|
| **Import** | CSV or manual leads. Cleaned, de-duplicated, auto-assigned a role track (Brand / AI PMM / AI PM / Hybrid) and a region (India / US / Global) |
| **Send** | A 4-touch email sequence from my own Gmail. Every follow-up is threaded, sent in local business hours, with holidays skipped and human pacing |
| **Track** | Opens, clicks and portfolio visits, with bots and link scanners filtered out. Engaged leads get a warmer follow-up automatically |
| **Listen** | Every reply and bounce is caught. A reply stops the sequence immediately. AI labels the reply, summarises it and drafts an answer |
| **Tell me** | A Telegram alert in minutes with one-tap links to the Gmail thread and the lead's dossier; a morning digest; a full analytics view |

**Design principle:** *AI reads, the human writes.* The system never replies on my behalf.

---

## 5. How it works

🧩 **Diagram 1: the loop**
```
Import → Touch 1 → (wait 3 business days) → Touch 2 warm/cold → (+5) → Touch 3 → (+6) → Touch 4 → (+4) → Archive
              ↘ any reply at any point → STOP → AI triage → Telegram alert → I reply from Gmail
              ↘ click / portfolio visit → Warm → warmer Touch 2
```

🧩 **Diagram 2: the 8-stage funnel**
`Lead Queued → Outreach Active → Warm Engaged → Replied · Triage → Interviewing → Offer & Closing`, with side exits to `Nurture / Future` (resurfaces after 60 days) and `Closed / Archive`.

🧩 **Diagram 3: architecture**
- Vercel (Next.js app + worker);
- Supabase (Postgres + cron);
- Gmail API (send/read);
- Groq (AI triage);
- Telegram (alerts);
- the portfolio site (beacon + tagged links).

**The worker, every 10 minutes:**
1. send the morning digest (once a day);
2. resurface nurture leads;
3. sync replies and bounces;
4. archive finished sequences;
5. check today's cap and the send windows;
6. claim a randomly spaced send slot;
7. re-check the thread for replies;
8. send exactly one email;
9. record it.

---

## 6. Features (grouped for the page)

### Sending, like a careful human
- A Touch 1 per role track, written in my own voice; follow-ups add something new each time.
- True Gmail threading (`Re:` + In-Reply-To/References + the same thread).
- Recipient-local send windows (defaults: India 10:00–18:00 IST; US 09:00–17:00 local; Global 09:00–18:00; all editable).
- Weekends, **US federal and Indian public holidays**, and custom no-send dates skipped.
- Random 3–6 minute gaps; daily cap; a **new-sender warm-up** (10 → 20 → 30 → full).
- Auto-Pilot or Approval Gate. Approval Gate lets me edit, approve or dispatch a batch each morning.
- A text signature with clickable, tracked links: *Portfolio · Résumé · LinkedIn*.

### Signals that matter
- Open pixel, signed click redirect, and a portfolio-visit beacon with time-on-page.
- **Bot filter:** ignores corporate link scanners and instant "opens".
- Every link is tagged with UTM (company, person, stage) and a readable ref label, so my portfolio's own visitor alerts show *who* is looking (e.g. `ref=acme.priya-rao.warm-engaged-t2a`).
- Auto-promotion to **Warm** on genuine engagement → the warm follow-up.

### Replies, handled
- Thread scan + mailbox search + bounce search, re-checked right before every follow-up.
- **AI triage (Groq):** sentiment, intent (interview request, wants a call, asks for CV…), a one-line summary, urgency, out-of-office return date, and a draft reply I can copy.
- **Out-of-office auto-resume** on the first business morning after the person is back.
- Delay notices ignored; real bounces archived and the address locked.
- **Late-reply catch:** a reply up to 30 days after archiving brings the lead back.

### Command centre
- 8-column drag-and-drop pipeline with a dossier for every lead: timeline, rendered thread, notes, AI insight, "Open in Gmail".
- Analytics: open, click, reply, positive-reply, portfolio-visit and bounce rates by touch, track and region; daily send chart.
- Template studio with inheritance, merge variables and live preview.
- CSV import with header auto-mapping and a dry-run preview.
- Telegram: instant reply alerts + 09:30 daily digest.
- A public home page with sign-in; privacy policy and terms.

### Built safe
- Signed session cookies, CSRF checks, locked-down database (row-level security, service-role only).
- Signed click links (no open redirects), header-injection-safe email building.
- Minimal Gmail scopes; Google API Limited Use statement.

📸 Screenshots to capture:
1. Pipeline board.
2. Lead dossier with the AI summary and draft.
3. Approvals queue.
4. Analytics.
5. Template studio.
6. Settings (warm-up + holidays).
7. Telegram alert.
8. Telegram digest.
9. Home / sign-in.

---

## 7. How I built it

- **Solo, AI-native:** product thinking, copywriting, UX and engineering, built with AI pair-programming.
- **Stack:**
  - Next.js 15 (App Router, TypeScript), Tailwind v4;
  - Supabase Postgres + pg_cron;
  - Gmail API;
  - Groq LLM (JSON mode);
  - Telegram Bot API;
  - Vercel.
- **Cost:** runs entirely on free tiers; AI costs fractions of a cent per reply.
- **Quality:**
  - 110 automated tests: 87 unit tests plus a **23-scenario simulation** that fast-forwards weeks of outreach in seconds (no-reply, warm path, bots, positive reply, out-of-office, bounces, holidays, warm-up, AI outage, Gmail auth loss…);
  - live test rounds against the real stack;
  - CI on every push.

### Product decisions worth telling

| Decision | Why |
|---|---|
| Plain personal emails instead of designed HTML | Designed emails look like marketing and land in Promotions. Personal email gets read. |
| Rewrote the copy in my own voice after the first draft read as "fake" | Recruiters reward a clear purpose, real proof and one small ask. |
| Moved scheduling from GitHub Actions to Postgres cron | GitHub dropped most scheduled runs; database cron is on time and free. |
| AI reads but never writes | Keeps the human relationship human; AI just removes triage work. |
| Readable link labels | Turned anonymous portfolio visits into "Acme · Priya · warm follow-up" without touching the portfolio's code. |

---

## 8. Results (verified in live tests)

- A reply is detected and the sequence stopped automatically, with a phone alert in **about 5–7 minutes**.
- The AI correctly labelled an interview request and an out-of-office reply (and extracted the return date).
- A full 4-touch threaded sequence ran and auto-archived on schedule.
- A click → Warm → warm follow-up path was verified, with UTM and the readable label visible in the portfolio's own visitor alert.
- **Zero** duplicate sends: proven for overlapping worker runs in simulation, and none seen in the live rounds.

*(Add real campaign numbers here once the first real batch runs: reply rate, positive replies, interviews booked.)*

---

## 9. What I learned

- **Restraint is a feature.** The most important logic in the system is about *not* sending: replies, holidays, out-of-office, caps.
- **Copy beats code.** The biggest jump in quality came from rewriting the emails in a real voice, not from any feature.
- **Measure intent, not vanity.** Opens are noisy; clicks, visits and replies drive every decision.
- **Test the weeks, not the minutes.** A simulated clock made it possible to prove multi-week behaviour quickly.

---

## 10. Quotable facts

| Fact | Value |
|---|---|
| Email touches | 4 (+ warm/cold branch at Touch 2) |
| Sequence length | ~18 business days to archive |
| Funnel stages | 8 |
| Role tracks | 4 (Brand, AI PMM, AI PM, Hybrid) |
| Regions | India, US, Global |
| Holiday calendars | US federal + India |
| Worker frequency | Every 10 minutes on weekdays |
| Reply alert latency | ~5–10 minutes |
| Tests | 110 automated (87 unit + 23 end-to-end simulation scenarios) |
| Hosting cost | Free tiers |
| Built by | One person, AI-native |

---

## 11. Suggested page layout and visual direction

1. **Hero:** name, one-liner, product screenshot + phone alert mock.
2. **Problem:** three short cards (No signal / Manual breaks / Sales tools don't fit).
3. **Insight:** the "job search is a pipeline" idea with a funnel graphic.
4. **How it works:** the loop diagram (animated on scroll if possible).
5. **Features:** 4 groups as tabbed cards or a bento grid.
6. **Under the hood:** architecture diagram + stack logos.
7. **Decisions:** 4–5 "why" cards.
8. **Results:** the verified-in-live-tests list; real metrics later.
9. **Learnings:** short reflections.
10. **CTA:** "Want something like this for your team?" (white-label hint) / contact.

**Visual direction (matches the product UI):**
- Background `#09090B`, cards `#121215`, borders `#27272A`, text `#FAFAFA` / muted `#A1A1AA`.
- Accent: emerald for "live/active", amber for "warm", sky for "replies".
- Typography: a clean sans (Inter / Geist) with tight tracking for headings; uppercase micro-labels for section tags.
- Motion: subtle. Pipeline cards slide between columns; a Telegram alert pops in.
