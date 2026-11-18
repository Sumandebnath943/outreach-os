# OutreachOS — Project Bible

> **Upgrade note (18 Nov 2026):** the local lead-management upgrade supersedes the older route, approval UI and test-count descriptions below. Read `docs/UPGRADE_013.md` and `docs/HANDOFF.md` first. It requires migration 013 before deployment; email prechecks are deferred.

> The product book: what OutreachOS is, why it exists, how every part works, and why it was built that way.
> Last revised: 18 Nov 2026 (state at commit `dfc5aaa` and later; see `docs/HANDOFF.md` for the running log).

---

## 1. What OutreachOS is

OutreachOS is a **private, self-hosted outreach CRM that runs a job search like a revenue pipeline**. It was built for one senior candidate targeting **Senior Brand Marketing Manager, AI Product Marketing Manager (AI PMM) and AI Product Manager (AI PM)** roles in India and the US. It is designed so it can be white-labelled later.

It does five things end to end:

1. **Imports leads.** Recruiters, hiring managers and founders come in by CSV or one at a time. Each lead is cleaned, de-duplicated, and assigned a *role track* (Brand / AI PMM / AI PM / Hybrid) and a *region* (India / US / Global).
2. **Sends a personal 4-touch email sequence** from the owner's own Gmail.
   - Every follow-up is a reply in the same thread.
   - Emails go out only during the recipient's local business hours, never on weekends or public holidays.
   - Sending is paced like a human: a random gap between sends, a daily cap and a warm-up for a new sender.
3. **Tracks real intent**: opens, link clicks and portfolio visits. Bots and link scanners are filtered out. Engaged leads automatically get a warmer follow-up.
4. **Detects every reply and bounce.** A reply stops the sequence immediately.
   - AI reads each reply and labels it, summarises it, extracts out-of-office return dates and drafts an answer.
   - The owner gets a Telegram alert with one-tap links to the exact Gmail conversation and the lead's dossier.
5. **Shows the funnel**: an 8-stage pipeline, a morning approval queue, a template studio, analytics (open, click, reply, positive-reply and bounce rates by touch, track and region), and a daily digest.

What it deliberately does **not** do: it never writes to a recruiter on the owner's behalf beyond the four sequence emails. Once someone replies, a human answers.

---

## 2. Why it exists: the problem

**Job portals are a black box.** A senior candidate applies and hears nothing. They don't know whether anyone opened the application, looked at the portfolio, or simply never saw it.

**Direct outreach works but doesn't scale by hand.** Writing to the right recruiter or hiring manager gets replies. But a serious search means dozens of companies, each needing:
- a personal first email;
- polite follow-ups on the right days, in the right timezone, in the same thread;
- an instant stop when someone replies;
- a note of who opened, who clicked, and who is "warm".

Tracking that in a spreadsheet fails within a week.

**Sales tools are the wrong fit.** Cold-email platforms are built for SDR teams, with bulk volumes, sales copy and pricing to match. They encourage exactly the generic, templated tone that recruiters ignore. They also don't know about job-seeker etiquette, Indian and US holidays, or portfolio-level intent.

**Deliverability is fragile for a personal Gmail.** Blasting from a personal address, or using heavy HTML, gets throttled or lands in Promotions or spam.

**The solution:** a small, owner-operated system that behaves like a careful human assistant. It sends personal, specific emails at a human pace, watches for signals, stops the moment someone answers, and tells the owner exactly where to spend time.

---

## 3. Design principles (the thought process)

| Principle | What it means in the product |
|---|---|
| **Personal over promotional** | Plain, personal-looking emails from the owner's own Gmail. No logos, no layout tables, text signature only. The copy is written from the owner's real facts in a job-seeker voice ("I'm looking for my next role…"), never sales language. |
| **A reply means stop** | Any human reply ends the automation at once. Replies are checked again immediately before every follow-up. |
| **Signals over vanity metrics** | Opens are indicative only (Apple Mail preloads images). Clicks, portfolio visits and replies drive decisions. Automated hits are filtered out. |
| **Safe by default** | Business hours only, weekends and holidays skipped, warm-up, daily cap, random gaps, no duplicate sends, and it refuses to run open in production. |
| **AI reads, the human writes** | AI classifies, summarises and drafts. It never sends anything. If AI fails, simple keyword rules take over. |
| **The owner stays in control** | Approval Gate mode, pause and resume per lead, every template editable, and every decision visible in each lead's timeline. |
| **Free-tier friendly** | Runs on free tiers: Vercel (Hobby), Supabase (Free), Gmail API, Groq, Telegram. |
| **Proven, not assumed** | Unit tests, a 23-scenario end-to-end simulation on a fast-forwarded clock, and live test rounds against the real stack. |

---

## 4. Who uses it

- **Owner (single user today):** imports leads, approves or lets Auto-Pilot run, reads Telegram alerts, replies from Gmail, moves leads through interviews and offers.
- **Recipients (recruiters, hiring managers, founders):** receive at most four personal emails, see links to the owner's portfolio, résumé and LinkedIn, and can reply or ignore. Every recipient can ask to be removed. The privacy policy and terms are public.
- **Future:** white-label for other job seekers (brand settings in `src/lib/brand.ts`).

---

## 5. Architecture

```
                   ┌──────────────────────────── Owner ─────────────────────────────┐
                   │ Browser: home/sign-in → dashboard          Phone: Telegram alerts│
                   └──────────────┬───────────────────────────────────▲──────────────┘
                                  │ HTTPS (session cookie)            │ Bot API
┌─────────────────────────────────▼───────────────────────────────────┴────────────────┐
│  Next.js 15 app on Vercel (custom domain)                                             │
│  ┌─────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ UI (React)  │  │ API routes                    │  │ Worker: processQueue()       │  │
│  │ pipeline,   │  │ leads, import, approvals,     │  │ digest → nurture → replies → │  │
│  │ approvals,  │  │ templates, settings, stats,   │  │ archive → quota → windows →  │  │
│  │ analytics,  │  │ analytics, auth, notify,      │  │ jitter slot → claim → verify │  │
│  │ import,     │  │ track (open/click/portfolio), │  │ → send → record              │  │
│  │ studio,     │  │ cron/process-queue            │  └──────────────────────────────┘  │
│  │ settings    │  └──────────────────────────────┘                                     │
│  └─────────────┘  Middleware: session/Basic auth, CSRF, prod lock, public routes        │
└───────┬──────────────────────┬─────────────────────┬──────────────────────┬────────────┘
        │ service-role REST    │ Gmail API (OAuth)   │ Groq (JSON mode)     │ Telegram Bot API
┌───────▼────────────────┐ ┌───▼───────────────┐ ┌───▼─────────────────┐ ┌─▼────────────────┐
│ Supabase Postgres      │ │ Gmail             │ │ Groq LLM            │ │ Telegram          │
│ leads, templates, logs,│ │ send in-thread,   │ │ reply triage only   │ │ alerts + digest   │
│ events, settings; RLS; │ │ read threads,     │ └─────────────────────┘ └──────────────────┘
│ RPCs; pg_cron + pg_net │ │ search replies/   │
│ → calls the worker     │ │ bounces           │
└────────────────────────┘ └───────────────────┘
        ▲
        │ beacon (optional snippet) / UTM + ref label (any tracker)
┌───────┴────────────────┐
│ Owner's portfolio site │  ← recruiters land here from tracked links
└────────────────────────┘
```

**Layers**

| Layer | Responsibility | Key files |
|---|---|---|
| Presentation | Public home and sign-in, legal pages, dashboard views | `src/app/(public)`, `src/app/(legal)`, `src/app/(dashboard)`, `src/components` |
| Edge guard | Authentication, CSRF, production lock, public allow-list | `src/middleware.ts`, `src/lib/session.ts` |
| API | JSON routes for every dashboard action and the trackers | `src/app/api/**` |
| Domain rules (pure) | Funnel rules, branching, scheduling, holidays, rendering, analytics, AI parsing, signals, notifications | `src/lib/funnel.ts`, `schedule.ts`, `holidays.ts`, `render.ts`, `analytics.ts`, `ai.ts`, `signals.ts`, `notify.ts`, `ingest.ts` |
| Server services | Database, Gmail, MIME, Resend, Groq, Telegram, tracking, engagement, digest, the worker | `src/lib/server/*` |
| Data | Postgres schema, RPCs, grants, cron jobs | `supabase/migrations/001…012` |
| Scheduling | Supabase Cron calls the worker | migration `009` (+ cleanup in `010`) |
| Tests | Unit tests, simulation harness, live-test runner | `test/**`, `scripts/live-test.ts` |

---

## 6. Technology stack

| Area | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15.5** (App Router, TypeScript, React 19) | Route groups: `(public)`, `(legal)`, `(dashboard)` |
| Styling | **Tailwind CSS v4** | Dark "oppressive luxury" theme: `#09090B` background, `#121215` cards, `#27272A` borders |
| Icons / UI | lucide-react, clsx, tailwind-merge | Hand-built components in `src/components/ui.tsx` |
| Database | **Supabase Postgres** via `@supabase/supabase-js` (service-role key, server only) | RLS on, no policies; explicit grants to `service_role` |
| Email | **Gmail API** via `@googleapis/gmail` (OAuth2) | Hand-built RFC 2822 MIME; optional **Resend** engine |
| AI | **Groq** chat completions, JSON mode (default `openai/gpt-oss-20b`) | Reply triage only; keyword fallback |
| Alerts | **Telegram Bot API** | Reply alerts and daily digest |
| Dates | date-fns, date-fns-tz | Recipient-timezone business-day maths |
| CSV | papaparse | Client-side parsing with header auto-mapping |
| Hosting | **Vercel** (Hobby) | Custom domain; `maxDuration` 60 s for the worker |
| Scheduler | **Supabase Cron** (pg_cron + pg_net), secrets in Vault | Every 10 min Mon–Fri, hourly at weekends |
| Quality | ESLint 9 (next config), **Vitest**, GitHub Actions CI | `npm run check` = lint + types + tests |

---

## 7. Data model

### Tables

| Table | Purpose | Notable columns |
|---|---|---|
| `system_settings` (one row) | Global configuration | provider, `execution_mode` (AUTO_PILOT / APPROVAL_GATE), daily cap, jitter min/max, sender identity, portfolio/résumé/LinkedIn URLs, `email_signature`, per-region send windows, archive and re-engage days, `skip_holidays`, `extra_blackout_dates`, warm-up switch and start date, `auto_resume_ooo`, Gmail refresh token, `next_dispatch_at` (jitter gate), `last_queue_run_at`, `last_digest_on` |
| `sequence_templates` | Email copy | `role_track × touch_number × branch_variant` (unique), subject, body, `wait_business_days`, `same_thread` |
| `leads` | One row per contact: the funnel state machine | identity and targeting fields, `funnel_stage`, `sub_stage`, `sequence_active`, `current_touch`, `next_touch_due_at`, `approval_status`, threading headers (`gmail_thread_id`, `last_message_id_header`, `references_header`, `original_subject`), counters (opens, clicks, portfolio visits, pages viewed), reply fields (time, snippet, sentiment), `reengage_at`, `archived_at`, notes |
| `email_logs` | Every email: drafts, sent, bounced, failed | touch, variant, subject, final HTML, provider IDs, RFC Message-ID, thread ID, status, `error` |
| `tracking_events` | Timeline for each lead | `EMAIL_OPEN`, `LINK_CLICK`, `PORTFOLIO_VIEW`, `REPLY_RECEIVED`, `STAGE_CHANGE`, with JSON metadata (bot flags, UTM, AI insight, Gmail IDs…) |

### Database functions

- `oos_bump_engagement` updates engagement counters atomically and caps the stored page list at 100.
- `oos_claim_dispatch_slot` is the atomic "human gap" between sends.
- `oos_call_worker` is the HTTP call made by cron.

All are executable by `service_role` only.

### Migrations

| # | Adds |
|---|---|
| 001 | Core schema + master sequence seed |
| 002 | Send windows, jitter gate, error column, engagement RPC, `updated_at` triggers, RLS lockdown |
| 003 | `archived_at`, capped page list, RPC grants locked to service role, minimum 1-minute jitter |
| 004 | Outreach email address; removed phone number from copy |
| 005 | Explicit table grants for `service_role` (needed on newer Supabase projects) |
| 006 | First best-practice copy (superseded by 012) |
| 007 | `last_digest_on` for the once-a-day digest |
| 008 | Auto-Pilot as the default mode |
| 009 | Supabase Cron scheduler (Vault secrets, `oos_call_worker`, weekday + weekend jobs) |
| 010 | Holidays, extra no-send dates, warm-up, out-of-office auto-resume, cron-log cleanup |
| 011 | Shared signature, LinkedIn URL, labelled (clickable-word) links |
| 012 | Job-seeker copy rewrite: a Touch 1 per role track, new follow-ups, updated signature |

---

## 8. The 8-stage funnel (state machine)

| # | Stage | Enters when | Automation |
|---|---|---|---|
| 01 | **Lead Queued** | CSV or manual add | Touch 1 due immediately (still subject to the window, cap and gap) |
| 02 | **Outreach Active** | Touch 1 sent | Follow-ups on schedule; replies watched |
| 03 | **Warm Engaged** | Genuine click, portfolio visit, or 2+ genuine opens | Touch 2 switches to the warm version (T2A) |
| 04 | **Replied · Triage** | Human reply detected (or nurture date reached) | Sequence stopped; AI label + Telegram alert |
| 05 | **Interviewing** | Owner marks "call booked" | Sub-stages: HR screen → hiring manager → case study → final round |
| 06 | **Offer & Closing** | Owner moves it | Notes for compensation and notice period |
| 07 | **Nurture / Future** | "Not now" replies the owner parks | `reengage_at` (+60 days by default) brings the lead back to Triage (`REENGAGE_DUE`) |
| 08 | **Closed / Archive** | Ghosted (no reply after T4 + 4 business days), bounced, rejected, withdrawn, hired | Sequence off. The address is locked against re-import. Ghosted leads are still watched for a late reply for 30 days. |

Manual moves (dragging on the Kanban board, or in the dossier) apply side effects:
- moving to an active stage re-enables the sequence if touches remain;
- Interviewing defaults the sub-stage to HR screen;
- Nurture sets the re-engage date;
- Closed sets `archived_at`;
- any manual stage change removes stale drafts.

---

## 9. The sequence

| Touch | When | Who gets it | Purpose |
|---|---|---|---|
| **T1** | Day 0 (first moment inside the recipient's window) | Everyone; **one version per role track** | Who you are, what you're asking, concrete proof, location/relocation, portfolio, and one small ask (15-minute call or a pointer to the right person) |
| **T2A (warm)** | +3 business days | Leads who clicked, visited, or opened 2+ times | Offer a 15-minute live walkthrough of real systems |
| **T2B (cold)** | +3 business days | Everyone else | One-line summary; "a one-line reply either way, or the right person's name, helps" |
| **T3** | +5 business days after T2 | Everyone still silent | A value note: two write-ups that may be useful |
| **T4** | +6 business days after T3 | Everyone still silent | Short, polite goodbye; portfolio stays live |
| **Archive** | +4 business days after T4 (business day 18) | Silent leads | Closed / Ghosted, with a 30-day late-reply watch |

- **Business days** skip weekends and the recipient region's public holidays.
- **Waits** are editable per template; both Touch 2 branches share one wait.

**Threading:** follow-ups use `Re: <original subject>`, the same Gmail thread ID, and RFC 2822 `In-Reply-To` / `References`. The Message-ID is the one Gmail actually assigned, read back after sending. Verified live: follow-ups sent minutes apart group in the recipient's inbox; ones sent seconds apart may not, which only affects artificial tests.

**Role-track Touch 1 subjects:**
- *Brand:* "Senior Brand Marketing Manager — Suman Debnath, 9+ yrs brand & growth"
- *AI PMM:* "AI Product Marketing Manager — Suman Debnath, marketer who builds with AI"
- *AI PM:* "AI Product Manager — Suman Debnath, 21+ AI products shipped"
- *Hybrid:* "Brand Marketing & AI Product roles — Suman Debnath"

On the Brand, AI PMM and AI PM tracks, the subject starts with the lead's `target_role_opening` (or the track's default role when it is blank). The Hybrid subject is fixed.

**Merge variables:**

| Variable | Fills in |
|---|---|
| `{{first_name}}` | Defaults to "Team" |
| `{{company_name}}` | |
| `{{target_role_opening}}` | Defaults by role track |
| `{{custom_icebreaker}}` | Its own paragraph, or nothing |
| `{{original_subject}}` | |
| `{{signature}}` | The shared signature from Settings |

**Link tokens** can carry their own anchor text, e.g. `{{tracked_portfolio_url|my portfolio}}`, `{{tracked_resume_url|Résumé}}`, `{{tracked_linkedin_url|LinkedIn}}`. Anything left unresolved blocks the send.

**Signature (4 lines, text only):**
```
Suman Debnath
Senior Brand Marketing Manager & AI-Native Product Marketing Leader
Marketer who builds with AI · 9+ yrs brand & growth · 21+ AI products shipped solo
Pune, India (IST) · Portfolio · Résumé · LinkedIn
```

**Copy philosophy** (from research and owner feedback):
- **Subject:** the role plus the person, so recruiters can file and search it.
- **Opening:** the purpose stated plainly.
- **Body:** specific facts in the owner's voice.
- **Ask:** one small ask.
- **Avoid:** generic "templated" lines.
- **Follow-ups:** each one adds something new.

---

## 10. How the worker runs

Supabase Cron calls `POST /api/cron/process-queue` with `Bearer CRON_SECRET`: every 10 minutes Monday–Friday (UTC), and hourly at weekends. A manual "Sync Replies & Run Queue" button and a manual GitHub Actions workflow call the same worker. Each run (time budget 50 s):

0. **Digest:** the first run after 09:30 (owner timezone) atomically claims the day and sends the Telegram digest.
1. **Nurture resurfacing:** leads whose re-engage date has arrived move back to Triage.
2. **Reply and bounce sync:** for every active lead, and every lead ghosted in the last 30 days:
   - scans its Gmail thread, searches the mailbox for mail from the lead, and searches for delivery-failure notices;
   - only mail newer than a cutoff counts (first send − 10 min, or after the last handled reply);
   - six leads are checked in parallel;
   - if Gmail authorization fails, sync stops and sending is paused with a "reconnect Gmail" note.
3. **Auto-archive:** leads whose post-T4 wait has elapsed become Closed / Ghosted.
4. **Quota:** emails sent today (owner timezone), against today's cap (warm-up aware).
5. **Due leads:** active, due, not paused (approved, if in Approval Gate mode), and currently inside their send window (weekday, not a holiday, inside local hours).
6. **Human gap:** atomically claim the next dispatch slot; it opens a random 3–6 minutes after the last send.
7. **Send one email:**
   - reserve the lead with a conditional update, so overlapping runs can't double-send;
   - re-verify its thread for replies;
   - compose (track template, any draft edits, signature, tracked links with UTM/ref);
   - send through Gmail;
   - record it (with retries) and schedule the next touch.

**Failure handling:**

| Failure | What happens |
|---|---|
| Transient error | Retried after 1 hour |
| Hard bounce (invalid recipient) | Closed / Bounced |
| Auth error | Run stops with a note |
| Email sent but not recorded | Lead paused to prevent a duplicate |

At most 3 leads are tried per run, and only one email is sent per slot.

---

## 11. Inbound intelligence

### Reply detection

Three checks run on every worker run, and again immediately before each follow-up:
1. **Thread scan:** any non-sent message in the lead's Gmail thread.
2. **Mailbox search:** `from:<lead> after:<cutoff>`, which catches replies started as new emails.
3. **Bounce search:** `from:(mailer-daemon OR postmaster) "<lead>"`.

### Delivery notices

Each notice is classified:
- **Permanent failure** (address not found, undeliverable, rejected, blocked, 5.x.x) → **bounce**: lead archived, log marked BOUNCED, address locked.
- **Temporary delay** ("Delivery Status Notification (Delay)", "will retry", 4.x.x) → **ignored**. A later failure notice decides.

### AI triage (Groq)

For each reply:
- **What is sent:** the full plain-text body, quoted history removed, treated strictly as data.
- **What comes back:**
  - sentiment: POSITIVE / NEUTRAL / NOT_NOW / NEGATIVE / OUT_OF_OFFICE;
  - intent: interview request, wants a call, asks for CV, referral, info request, not hiring now, not interested, unsubscribe, auto-reply, other;
  - a one-line summary;
  - urgency;
  - for out-of-office replies, the return date;
  - for positive or neutral replies, a draft answer (≤ 90 words, placeholders instead of invented facts).
- **Validation:** strict, field by field. Any failure falls back to the keyword classifier.
- **Cost:** one call per reply.

### Out-of-office auto-resume

When on (the default), an auto-reply does not move the lead to Triage. The lead stays in its sequence with the next touch held back until the person returns (in Approval Gate mode the touch needs approval again):
- on the first business morning after the person is back (AI-read date, otherwise +5 business days);
- never earlier than the original schedule;
- at most twice per lead.

An auto-reply after Touch 4, a third auto-reply, or any auto-reply while the feature is off moves the lead to Triage like a normal reply.

### Late replies

A reply within 30 days of being archived as Ghosted moves the lead back to Triage (`LATE_REPLY`).

---

## 12. Tracking and signals

| Signal | How it's captured |
|---|---|
| **Opens** | 1×1 pixel (`/api/track/open`, `no-store`). HEAD probes on the pixel and click links are answered but never logged or counted. |
| **Clicks** | Signed redirect (`/api/track/click`: HMAC over lead + email + target; unsigned links fall back to the portfolio home, so it's not an open redirect) |
| **Link tags** | Every portfolio/résumé link carries `oid=<lead id>`, a readable `ref=<company>.<person>.<stage>-<touch>` label (shown by the portfolio's own visitor alerts with no code change), and `utm_source=outreachos`, `utm_medium=email`, `utm_campaign=<company>`, `utm_term=<person>`, `utm_content=<stage>-<touch>`. Stage parts are re-stamped at click time. |
| **Portfolio views** | Optional React snippet (`docs/PORTFOLIO_SNIPPET.md`): CORS beacon to `/api/track/portfolio` with path and cumulative visible time |
| **Bot filtering** | Opens/clicks are logged but **not counted** within 60 s of delivery, before the send is recorded, with no user agent, or with a scanner user agent (Safe Links, Mimecast, Proofpoint, Barracuda…) |
| **Warm promotion** | A genuine click or visit, or 2+ opens, moves Outreach Active → Warm Engaged. A conditional update means it's logged once. |

---

## 13. Notifications

**Reply alert (Telegram, HTML).** Example:
```
🔥 HOT — positive reply
Acme AI · Priya Rao (Head of Talent)
🧠 Interview request — wants to schedule a call Thursday
"…reply snippet…"
after T2A · AI_PMM · INDIA
Follow-ups stopped automatically. 👉 Reply from Gmail soon.
✍️ Draft reply (not sent): …
Open in Gmail · Open dossier
```
- **Icons by type:** 🌴 out-of-office (with the auto-resume time), ⏳ not now, ✋ not interested, 💬 neutral.
- **One alert per reply.**

**Daily digest:** the first worker run after `DIGEST_TIME` (09:30 owner timezone) sends one message. It lists:
- replies waiting, with links;
- touches waiting for approval, or scheduled today in Auto-Pilot;
- warm leads;
- interviews;
- yesterday's sends and today's cap.

---

## 14. The dashboard, view by view

| View | What it does |
|---|---|
| **Home `/`** | Public: product intro, six feature highlights, sign-in card, Privacy and Terms links. Signed-in visitors go straight to the pipeline. |
| **Top bar** (every app page) | KPIs: total, active, warm, triage, interviews, today's quota (with warm-up week), last run and next slot. Approval Gate / Auto-Pilot toggle, Sync Replies & Run Queue, Gmail status, Sign out. |
| **Pipeline `/pipeline`** | 8-column drag-and-drop Kanban; search and filter by geo and track. Cards show company, person, geo, track, touch, sub-stage, sentiment, paused/approved, opens/clicks/pages, and next due. A 🔥 marks warm leads. |
| **Dossier drawer** | Header with Gmail thread link and local time; telemetry strip. Stage and sub-stage controls; pause, unpause, resume. Reply box with AI intent, summary, draft (copy button), auto-resume note, and quick triage buttons (Call booked → Interviewing, Not now → Nurture, Rejected, Auto-reply? Resume). Tabs: Telemetry timeline (bot hits marked "ignored, likely automated"), Thread (rendered emails, pixels stripped), Details & Notes (edit fields, unsaved edits protected). Delete lead. |
| **Approvals `/approvals`** | Touches due in 24 h: edit subject and body, update the icebreaker, preview, approve, revoke, pause, **Approve & Dispatch Batch**. |
| **Analytics `/analytics`** | 7/30/90/all-time: open, click, reply, positive-reply, portfolio-visit and bounce rates; funnel by furthest stage; by touch (T1, T2A, T2B, T3, T4); by track and region; daily sends chart with a table view. |
| **Import `/import`** | Drag-and-drop CSV, header auto-mapping, bulk geo/track overrides, dry-run preview (new, already in CRM, duplicate in file, invalid, locked), sample CSV download. |
| **Templates `/templates`** | Studio per role track and touch slot, with inheritance from the master. Fork and remove overrides, insert variables, edit waits and threading, live preview with sample lead data. |
| **Settings `/settings`** | Execution and provider, caps and gaps, send windows, warm-up and holidays (upcoming list), extra no-send dates, out-of-office auto-resume, sender identity, URLs, LinkedIn, **email signature**. Connections status (Gmail, Resend, AI, Telegram + **Send test alert**, secrets, dashboard password, APP_BASE_URL), Connect/Disconnect Gmail, portfolio snippet with copy button. |
| **Legal** | `/privacy-policy`, `/terms`: public, written for Google OAuth verification, including the Limited Use statement and AI processing. |

---

## 15. Security and privacy

- **Sign-in:** signed HttpOnly session cookie (HMAC, 30 days, rotated by changing the password or `SESSION_SECRET`).
- **Old credentials:** Basic credentials still accepted, for scripts.
- **Failed sign-ins:** slowed down by 700 ms each.
- **Redirects:** `next` redirects are restricted to the same site.
- **Production lock:** without a dashboard password, app routes return 503.
- **CSRF:** state-changing requests must be same-origin (`Sec-Fetch-Site` / `Origin`).
- **Database access:** server-only service-role key; RLS on with no policies; table and RPC grants for `service_role` only; publishable or anon keys rejected with a clear error.
- **Input hygiene:** http(s)-only URLs, field length caps, header-injection-safe MIME (CR/LF stripped, RFC 2047 encoding), HTML escaping everywhere, unresolved-token guard.
- **Tracking integrity:** signed click links, capped page arrays, CORS allow-list for beacons.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, a strict `Referrer-Policy` and `Permissions-Policy`; no `X-Powered-By` header.
- **Secrets:** environment variables only; cron secrets in Supabase Vault; never committed (`.env*` ignored).
- **Google data:** only `gmail.send` + `gmail.readonly`. Stores a reply snippet (up to 1,000 characters) and the AI read-out, never full message bodies (the body is only passed to the AI for triage). Limited Use statement published. AI provider disclosed. Zero Data Retention recommended in Groq.

---

## 16. Operations

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✔ | Database (the secret `sb_secret_…` key) |
| `APP_BASE_URL` | ✔ | Public `https://` URL, used for tracking links and the OAuth callback |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | ✔ (prod) | Sign-in |
| `CRON_SECRET` | ✔ | Bearer token for the worker (also in Supabase Vault) |
| `TRACKING_SECRET` | ✔ | Signs click links (never change after sending) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✔ | Gmail OAuth (token stored via Settings → Connect Gmail) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DIGEST_TIME` | recommended | Alerts and digest |
| `GROQ_API_KEY`, `GROQ_MODEL` | recommended | AI triage |
| `PORTFOLIO_ALLOWED_ORIGINS` | optional | CORS for the portfolio beacon |
| `OWNER_TIMEZONE` | optional | Defaults to Asia/Kolkata |
| `SESSION_SECRET` | optional | Extra session key |
| `RESEND_*` | optional | Alternative sender |
| `LIVE_LEAD_EMAIL` | local only | Inbox for live test rounds |

### Deploy

- **App:** push to `main`, and Vercel builds and deploys.
- **Database:** run new migrations in order in the Supabase SQL Editor.
- **CI:** GitHub Actions runs lint, types, tests and build on each push.

### Scheduler

Migration 009 sets up the scheduler. To check it:
```sql
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;
```

### Costs

All free tiers at current volume. Groq costs fractions of a cent per reply.

### Health checklist

- The top bar shows "run Xm ago" (≤ 10 min on weekdays).
- Gmail shows a green dot.
- Settings shows Telegram and AI green.
- CI is green on the latest commit.

---

## 17. Quality and testing

| Layer | What | Command |
|---|---|---|
| Unit | 87 tests in 12 files: funnel rules, schedule and holidays, warm-up, rendering and links, ingest, signals/DSN/bot, MIME, click signing, notify formats, AI parsing, middleware/session, env key checks | `npm test` (runs all 110 tests, including the simulation) |
| Simulation | 23 end-to-end scenarios on a fast-forwarded clock with an in-memory Supabase and Gmail and captured Telegram/Groq (see below) | `npm run simulate` → `test-results/simulation-report.md` |
| Live | Real sends to plus-addresses of a test inbox, fast-forwarded by moving due dates; refuses to run if a real lead could be sent | `npm run live -- status/next/sync/resume/archive/cleanup` |
| CI | lint + types + tests + build on every push | `.github/workflows/ci.yml` |

**Simulation scenarios:**

| # | Scenario |
|---|---|
| S1 | Full no-reply sequence and archive on business day 18 |
| S2 | Warm path with UTM and ref re-stamping |
| S3 | Bot filtering, then opens promoting to warm |
| S4 | Positive reply → interview → offer |
| S5 | Out-of-office → manual resume → negative reply |
| S6 | Nurture resurfacing |
| S7 | Bounce archives the lead and locks the address against re-import (delay-vs-failure notices are covered by unit tests) |
| S8 | Reply sent as a new email |
| S9 | Late reply, inside and outside 30 days |
| S10 | Approval Gate with an edited draft |
| S11 | US window and weekend |
| S12 | Daily cap and jitter |
| S13 | Overlapping runs |
| S14 | Gmail token revoked |
| S15 | Transient failure and hard bounce |
| S16 | Sent but not recorded |
| S17 | Analytics numbers |
| S18 | Telegram reply alerts |
| S19 | Daily digest |
| S20 | Holidays (Thanksgiving, Republic Day, extra dates) |
| S21 | Warm-up |
| S22 | AI triage, including an outage |
| S23 | Touch 1 per role track |

**Live verification (18 Nov 2026):**
- sending in the window;
- the full T1–T4 thread plus archive;
- in-thread headers;
- reply detection with AI labels (interview request, auto-reply with return date);
- Telegram alerts (about 5–7 min with the 10-min schedule);
- warm promotion → T2A;
- UTM and readable `ref` on the real portfolio alert;
- recipient-side threading with realistic gaps.

---

## 18. Known limits and roadmap

**Known limits**
- Open rates are approximate (Apple MPP, image blocking).
- Replies outside Gmail (LinkedIn, phone) aren't seen; move those leads by hand.
- The AI labels a reply from its text alone; the sequence still stops on *any* reply.
- India festival dates are loaded through 2027 (extend `src/lib/holidays.ts`).
- Alert latency equals the cron interval (10 min; 5 min possible).
- A personal Gmail is limited to about 500 emails a day and needs warm-up.
- Single user.

**Roadmap ideas**
- Faster cron (5 min).
- AI-generated icebreakers on import.
- A/B subject tests.
- LinkedIn touch reminders.
- Multi-user and white-label tenants.
- Bounce and warm-lead Telegram alerts (optional).
- An analytics chart for replies by day.

---

## 19. Decision log (why it is the way it is)

| Decision | Why |
|---|---|
| Keep the second implementation over the first GitHub v1 | v1 had a cron auth bypass, an open redirect, no real pacing and fake "simulated" sends |
| Plain-text-style emails, no designed HTML or logo | Primary-inbox placement and reply rates for cold outreach; the brand lives on the portfolio landing page |
| Job-seeker copy, a Touch 1 per role track | Generic sales copy read as fake; recruiters reward clear purpose, specific proof and one small ask |
| No employer name in the opening line | It could read as recruiting on PIBM's behalf |
| One email per worker run with a random gap | Human pacing; the atomic slot plus per-lead claim make double-sends impossible |
| Supabase Cron instead of GitHub Actions | GitHub scheduled runs were mostly dropped (~5 of ~700 in a week); Supabase is free, on time and uses no Actions minutes |
| Not 4 runs a day | It would cap sends at about 2 a day per region and delay reply alerts by hours |
| AI reads but never writes | The owner keeps the human relationship; AI adds triage and drafts only |
| Groq with keyword fallback | Cheap and fast; the pipeline never depends on AI availability |
| Readable `ref` label + `oid` | The portfolio's own alerts show who visited, without changing the portfolio code |
| Session sign-in on a home page | A browser Basic-auth popup on a blank page felt broken; Basic still works for scripts |
| Auto-Pilot default + warm-up | Hands-off operation with sender-reputation protection |
| Manual negatives | A misread reply must never silently bury a lead |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Touch** | One email in the sequence (T1–T4; T2 has warm A and cold B versions) |
| **Role track** | Which Touch 1 a lead gets: Brand / AI PMM / AI PM / Hybrid |
| **Send window** | Recipient-local weekday hours when sending is allowed (defaults: India 10:00–18:00, US 09:00–17:00, Global 09:00–18:00; editable in Settings) |
| **Jitter / slot** | The random 3–6 minute gap between sends |
| **Warm-up** | A reduced daily cap during a new sender's first three weeks |
| **Kill-switch** | Any reply stops the sequence |
| **Triage** | Replied leads awaiting the owner's decision |
| **Ghosted** | Archived after the full sequence with no reply |
| **DSN** | Delivery status notification (bounce or delay notice) |
| **oid / ref** | Lead-ID and readable-label link parameters |
