# OutreachOS

A self-hosted job search and cold outreach funnel CRM for **Suman Debnath**. It is aimed at Senior Brand Marketing Manager, AI PMM and AI PM roles in India and the US.

It treats the job hunt like an outbound sales pipeline:

- **CSV import:** bulk lead import with deduplication and automatic role-track assignment.
- **Sending:** a 4-touch conditional sequence sent through Gmail (in the same thread) or Resend.
- **Tracking:** email opens, link clicks, and portfolio browsing (`?ref=<lead_uuid>`).
- **Funnel:** an 8-stage state machine. Any reply detected in Gmail stops the sequence immediately.

```
Next.js 15 (App Router) · Supabase Postgres · Gmail API (OAuth2) / Resend · Tailwind v4
```

## What's inside

| Area | Path |
|---|---|
| SQL schema + seeded master sequence | `supabase/migrations/001_init_outreach_os.sql` |
| Runtime extensions (send windows, jitter gate, RPCs, RLS) | `supabase/migrations/002_runtime_extensions.sql` |
| Hardening (`archived_at`, capped page list, RPCs locked to the service role) | `supabase/migrations/003_hardening.sql` |
| Contact details (outreach address, no phone number) for an existing database | `supabase/migrations/004_contact_details.sql` |
| Explicit table grants for the server role (needed on newer Supabase projects) | `supabase/migrations/005_service_role_grants.sql` |
| Master worker (reply kill-switch → ghost archive → quota → window → jitter → claim → send) | `src/lib/server/sequencer.ts` |
| Pure funnel rules (branching, templates, stage side effects, reply cutoff) | `src/lib/funnel.ts` |
| Reply triage, bot filtering, provider error classes | `src/lib/signals.ts` |
| RFC 2822 MIME builder (`In-Reply-To` / `References`, RFC 2047 headers) | `src/lib/server/mime.ts` |
| Gmail send, Message-ID read-back, thread and inbox reply/bounce detection | `src/lib/server/gmail.ts` |
| Template merge, text/HTML rendering, tracked links | `src/lib/render.ts`, `src/lib/server/tracking.ts` |
| Business-day and timezone windows | `src/lib/schedule.ts` |
| Portfolio tracker component | `docs/PORTFOLIO_SNIPPET.md` |

### Dashboard views
- **`/` Pipeline:** an 8-column drag-and-drop Kanban. Each card shows Geo, Track, Touch, and Opens/Clicks/Pages counts. Click a card to open the Lead Dossier drawer. It shows the sent thread, the telemetry timeline, the stage and sub-stage, reply triage actions, notes, and pause/resume controls.
- **`/approvals` Morning Approval Queue:** shows touches due in the next 24h. You can edit the subject, body or icebreaker inline, then click **Approve & Dispatch Batch**.
- **`/import`:** drag-and-drop CSV import with automatic header mapping, a duplicate preview, Geo/Track overrides, and a sample CSV.
- **`/templates` Sequence Studio:** edit T1, T2A (warm), T2B (cold), T3 and T4 for each role track, with a live preview. Role tracks inherit `HYBRID_DEFAULT` until you fork a touch.
- **`/settings`:** caps, jitter, send windows, provider, sender identity, Gmail connect, and the portfolio snippet with your URL pre-filled.

The persistent top bar shows Total, Active, Warm, Triage, Interviews and Today's Quota. It also holds the Approval Gate / Auto-Pilot toggle and the **Sync Replies & Run Queue** button.

## API

| Route | Method | Purpose |
|---|---|---|
| `/api/leads` | GET · POST · PATCH · DELETE | Kanban list, manual create, stage/sub-stage/notes/pause/`action: resume_sequence`, delete |
| `/api/leads/:id` | GET | Dossier: lead, email thread (pixels stripped), events |
| `/api/leads/import` | POST | `{ rows, overrides, dryRun }`: normalise, dedupe, queue Touch 1 |
| `/api/cron/process-queue` | GET · POST | Master worker. Requires `Authorization: Bearer $CRON_SECRET` |
| `/api/queue/run` | POST | Same worker, triggered from the dashboard |
| `/api/approvals` | GET · POST | Due drafts; `save_draft`, `reset_draft`, `approve`, `unapprove`, `pause` |
| `/api/track/open` | GET | 1×1 GIF, `no-store`. Promotes to WARM at 2+ opens |
| `/api/track/click` | GET | HMAC-signed redirect. Promotes to WARM, then 302 |
| `/api/track/portfolio` | POST · OPTIONS | CORS beacon `{ ref, path, type, durationSec }` |
| `/api/templates` | GET · PUT · DELETE | Read and upsert templates; delete role-track overrides |
| `/api/settings` | GET · PUT | Mode, caps, windows, provider, identity |
| `/api/stats` | GET | KPI bar |
| `/api/auth/google/start`, `/callback` | GET | Gmail OAuth. Stores the refresh token in `system_settings` |

## Sequencer rules (as implemented)

| Touch | When | Condition | Thread |
|---|---|---|---|
| T1 | Right away, inside the recipient's send window | Lead is `LEAD_QUEUED` | New thread |
| T2A (warm) | +3 business days | clicks ≥ 1, **or** portfolio visits ≥ 1, **or** opens ≥ 2 | `Re:` same thread |
| T2B (cold) | +3 business days | otherwise | `Re:` same thread |
| T3 | +5 business days after T2 | no reply | `Re:` same thread |
| T4 | +6 business days after T3 | no reply | `Re:` same thread |
| Archive | +4 business days after T4 | no reply | Moves to `CLOSED_ARCHIVE / GHOSTED` |

**Business days:** Saturdays and Sundays are skipped, using the recipient's timezone. Wait days come from the templates and can be edited in the Studio.

**Send windows (Mon–Fri):**
- INDIA: 10:00–18:00 IST
- US: 09:00–17:00 America/New_York
- GLOBAL: 09:00–18:00 UTC

All three are configurable.

**Wait days:** both Touch 2 branches share one wait (the branch is only decided at send time), so saving the wait on T2A or T2B updates the other.

**Jitter:** the `oos_claim_dispatch_slot()` RPC sends one email per slot. Each slot opens 3–6 random minutes after the last send (minimum 1 minute).

**No duplicate sends:**
- Before sending, the worker atomically reserves the lead with a conditional update. Two overlapping runs (cron plus the dashboard button) can never send the same touch.
- If the provider accepts the email but recording it fails, the write is retried. If it still fails, the lead is **paused** instead of being retried, and the run reports it.

**Daily cap:** defaults to 45 emails, counted per calendar day in `OWNER_TIMEZONE`.

**Reply kill-switch:** every run checks two things in Gmail for each active lead:
1. The lead's own thread, for any message not labelled SENT.
2. The whole mailbox, for mail `from:<lead>` sent after the first touch.

The same check runs again just before every T2–T4 is sent. Only mail newer than the last reply already handled counts, so **Resume** after an out-of-office reply sticks.

**When a reply is found:**
- The lead moves to `REPLIED_TRIAGE`, the sequence stops, and the reply snippet is saved.
- The snippet gets a keyword label: `POSITIVE`, `NOT_NOW`, `NEGATIVE`, `OUT_OF_OFFICE` or `NEUTRAL`.
- If it was an auto-reply, the dossier has a one-click **Resume** button.

**Late replies:** leads auto-archived as `GHOSTED` are still checked for 30 days. A reply in that time moves the lead back to `REPLIED_TRIAGE` with sub-stage `LATE_REPLY`.

**Bounces:** a mailer-daemon message in the thread or mailbox, or a send failure with an invalid recipient, moves the lead to `CLOSED_ARCHIVE / BOUNCED`. Other send failures retry after one hour.

**Revoked Gmail token:** the run stops, shows "reconnect Gmail", and sends nothing until you reconnect. It does not log a failure for every lead.

**Bot filtering:** an open or click is logged but **not counted** in these cases:
- It fires within 60 seconds of delivery.
- It fires before the send was recorded.
- It has no user agent, or a known scanner user agent (Safe Links, Mimecast, Proofpoint …).
- It is a `HEAD` probe.

The dossier shows these as "ignored, likely automated". They never make a lead WARM.

**Nurture:** moving a lead to `NURTURE_LATER` sets `reengage_at` to +60 days. When that date arrives, the worker moves the lead back to Triage with sub-stage `REENGAGE_DUE`.

**Duplicates:** emails are unique. A lead in `CLOSED_ARCHIVE` is reported as **LOCKED** on re-import.

## Setup runbook

### 1. Supabase
1. Create a project, then run the migration files in order in the SQL Editor: `001` through `009`.
   A database set up earlier only needs the ones it hasn't run yet. They are all safe to re-run.
   - `006` installs the best-practice master sequence (see `docs/TEMPLATE_PROPOSAL.md`).
   - `007` adds the Telegram digest bookkeeping.
   - `008` makes Auto-Pilot the default.
   - `009` schedules the worker with Supabase Cron (see step 6). Fill in its two placeholders in the SQL Editor first.
   - `005` grants table access to the server role. Supabase projects created since mid-2026 no longer do this automatically. Without it, the app fails with *"permission denied for table system_settings"*.
2. Copy two values into your environment:
   - The **Project URL**, from *Project Settings → Data API* or the **Connect** button.
   - The **secret key** (`sb_secret_…`), from *Project Settings → API Keys*, into `SUPABASE_SERVICE_ROLE_KEY`. A legacy `service_role` key also works. The publishable key is rejected with a clear error.

RLS is enabled with no policies, and only the server role has table and function access. The publishable/anon key can't read or write anything.

### 2. Environment
```bash
cp .env.example .env.local
```
Fill in `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL` (your public URL), `CRON_SECRET`, `TRACKING_SECRET` and `DASHBOARD_PASSWORD`. Generate secrets with `openssl rand -hex 32`.

In production the dashboard **refuses to start open**: without `DASHBOARD_PASSWORD`, every page and management API returns 503. Pages that change data only accept requests from the dashboard's own origin, which blocks CSRF.

### 3. Gmail API (OAuth2)
1. In Google Cloud Console, create a project and enable the **Gmail API**.
2. Set up the OAuth consent screen:
   - Choose External / Testing.
   - Add `hire.sumandebnath@gmail.com` (the account that sends) as a test user.
   - Add the scopes `gmail.send` and `gmail.readonly`.
3. Create an OAuth Client ID of type *Web application*. Add these authorised redirect URIs:
   - `https://<your-app>/api/auth/google/callback`, for the built-in connect button.
   - `https://developers.google.com/oauthplayground`, if you prefer the Playground method.
4. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your env.
5. Get a refresh token with **either** method:
   - **Settings → Connect Gmail.** The token is stored in `system_settings`.
   - **OAuth Playground.** Use your own credentials, authorise the two scopes, choose *Exchange authorization code for tokens*, and paste the token into `GMAIL_REFRESH_TOKEN`.

> While the consent screen is in **Testing**, Google expires refresh tokens after 7 days. Publish the app to production, which needs no verification for personal use with these scopes, to keep the token.

### 4. Resend (optional)
1. Verify your domain in Resend.
2. Set `RESEND_API_KEY` and `RESEND_FROM`.
3. Keep `RESEND_REPLY_TO` set to your Gmail address so the Gmail inbox search still catches replies.
4. Switch the provider in Settings.

Resend sends carry `In-Reply-To` / `References` headers. Gmail-side threading only applies to Gmail sends.

### 5. Run locally
```bash
npm install
```
```bash
npm run dev
```
Before pushing, run lint, type check and unit tests in one go:
```bash
npm run check
```

### 6. Deploy + schedule the worker
Deploy to Vercel and set the same env vars. Then schedule the worker with **Supabase Cron**, using migration `009`. It's free, runs on time inside your database, and uses no GitHub Actions minutes. It calls `/api/cron/process-queue`:
- every **10 minutes Monday–Friday**, for sends, reply detection, alerts and the digest;
- **hourly on weekends**, for reply detection and Telegram alerts only. Nothing is sent at weekends.

Why not GitHub Actions or Vercel Cron:
- **GitHub's `schedule` trigger is best-effort.** Runs are delayed or dropped under load: in testing, about 5 of ~700 scheduled runs actually happened in a week. `.github/workflows/outreach-cron.yml` now only provides a manual **Run workflow** button.
- **Vercel Cron on the Hobby plan** can run at most once a day.

Why every 10 minutes matters:
- **Pacing:** the worker sends **one email per run**, to keep the human 3–6 minute spacing between sends. 10-minute runs give about 45 sends across an 8-hour window.
- **Reply speed:** replies are detected within 10 minutes. Running only a few times a day would cap sending at a couple of emails per day per region and delay reply alerts by hours.

### 7. Portfolio telemetry
Copy `docs/PORTFOLIO_SNIPPET.md` into the portfolio repo (Settings shows a copy with your URL filled in). Mount `<PortfolioTracker />` in `app/layout.tsx`. Then add the portfolio origin to `PORTFOLIO_ALLOWED_ORIGINS`.

Every portfolio and résumé link carries `ref=<lead id>` and UTMs your site's own analytics can read:

| Parameter | Value |
|---|---|
| `utm_source` | `outreachos` |
| `utm_medium` | `email` |
| `utm_campaign` | company, e.g. `acme-ai` |
| `utm_term` | person, e.g. `priya-sharma` |
| `utm_content` | funnel stage at the moment of the click, plus the touch, e.g. `warm_engaged-t2a` |

### 8. Telegram alerts
OutreachOS messages you on Telegram:
- **On every reply** (🔥 for positive ones). The message includes the snippet, an **Open in Gmail** link to the exact conversation, and an **Open dossier** link.
- **A digest each weekday morning** (`DIGEST_TIME`, default 09:30 in `OWNER_TIMEZONE`). It lists replies waiting, approvals due today, warm leads, and yesterday's sends.

To set it up:
1. In Telegram, message **@BotFather** and send `/newbot`. Copy the **bot token** it gives you.
2. Open your new bot and send it `/start`. Bots can only message chats that wrote to them first.
3. Find your **chat ID**: open `https://api.telegram.org/bot<token>/getUpdates` in a browser and copy `message.chat.id`.
4. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Vercel (and `.env`), then redeploy.
5. In **Settings**, click **Send test alert**.

### 9. Live test rounds (optional)
`npm run live -- <command>` runs the real worker against your database and Gmail, fast-forwarding time by moving due dates.
- It only sends to plus-addresses of `LIVE_LEAD_EMAIL` (e.g. `you+nr@gmail.com`), which arrive in your own inbox.
- It refuses to run while a real lead could be sent, and never changes settings.
- Commands: `status`, `next <tag>`, `sync`, `resume <tag>`, `archive <tag>`, `cleanup`.

The fully offline equivalent is `npm run simulate`. It runs 19 scenarios on a fake clock and writes `test-results/simulation-report.md`.

## Daily operation
1. Import a CSV in **Import**. New leads land in `LEAD_QUEUED` with Touch 1 due right away.
2. **Auto-Pilot**, the default, sends due touches automatically inside each recipient's window. Replies are synced and the queue is run automatically on every worker run; the **Sync Replies & Run Queue** button just triggers a run immediately.
   Switch to **Approval Gate** in the top bar if you want to approve each email first: open **Approvals**, tweak any drafts, and click **Approve & Dispatch Batch**.
3. Watch for amber flame cards. These are warm leads, and they automatically get T2A.
4. When Telegram pings a reply, tap **Open in Gmail** and answer it yourself. OutreachOS never writes back on your behalf.
5. Triage the lead in its dossier with **Call booked → Interviewing**, **Not now → Nurture**, or **Rejected**.
6. Check **Analytics** weekly. Judge the copy by reply and click rates per touch, not by opens.

## Known limits / honest caveats
- **False opens:** Gmail and Apple fetch images through proxies, so open counts are approximate. Apple Mail Privacy Protection preloads images, sometimes long after delivery, which the bot filter cannot catch. Opening the email from *your own* Sent folder also fires the pixel. Clicks and portfolio views are the reliable intent signals, which is why any one of them makes a lead warm.
- **Testing your own links:** clicking a tracked link stores that lead's `ref` in your browser. Use a private window when testing.
- **Anchor text:** tracked links show the clean portfolio URL as their text, but point to your OutreachOS domain. Putting OutreachOS on a custom subdomain, such as `go.houseofnamus.com`, keeps link domains aligned for deliverability.
- **Reply detection needs Gmail:** it requires a Gmail connection, even when you send through Resend.
- **Reply labels are keyword matching only.** The sentiment classifier is a simple keyword heuristic, not an LLM.
