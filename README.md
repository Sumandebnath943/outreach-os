# OutreachOS — Executive Job Search & Cold Outreach Funnel CRM

Built for **Suman Debnath** (Senior Brand Marketing Manager & AI-Native Product Builder · [sumandebnath.houseofnamus.com](https://sumandebnath.houseofnamus.com/)).

OutreachOS converts executive job hunting across **Senior Brand Marketing Manager (`BRAND`)**, **AI Product Marketing Manager (`AI_PMM`)**, and **AI Product Manager (`AI_PM`)** roles in India (IST) and the US (EST) into a deterministic, 8-stage B2B outbound sales pipeline.

---

## Core Capabilities

1. **8-Stage Hiring Funnel Kanban (`/`)**:
   - `01 LEAD_QUEUED` → `02 OUTREACH_ACTIVE` → `03 WARM_ENGAGED` → `04 REPLIED_TRIAGE` → `05 INTERVIEWING` (`HR_SCREEN`, `HIRING_MANAGER`, `CASE_STUDY`, `FINAL_ROUND`) → `06 OFFER_STAGE` → `07 NURTURE_LATER` → `08 CLOSED_ARCHIVE` (`BOUNCED`, `GHOSTED`, `REJECTED`).
2. **Dual-Engine Email Dispatch (`Gmail API OAuth2` + `Resend`)**:
   - RFC 2822 raw MIME builder with `In-Reply-To` and `References` header chaining so Touch 2, Touch 3, and Touch 4 land in the exact same Gmail thread (`Re: [Original Subject]`).
3. **3-Layer Intent Telemetry**:
   - **Email Open Pixel**: `/api/track/open` serves a non-cached 1×1 GIF and promotes leads to `WARM_ENGAGED` on 2+ opens.
   - **Link Click Tracker**: `/api/track/click` logs clicks, promotes leads to `WARM_ENGAGED`, and issues an HTTP 302 redirect to `https://sumandebnath.houseofnamus.com/?ref={{lead_uuid}}`.
   - **Cross-Origin Portfolio Telemetry**: `/api/track/portfolio` receives real-time pageviews and dwell duration (`durationSec`) from `sumandebnath.houseofnamus.com`.
4. **4-Touch Conditional Sequencer & Instant Reply Kill-Switch**:
   - Automatically branches Touch 2 between **Touch 2A (Warm Walkthrough Offer)** and **Touch 2B (Cold Executive Summary Bump)** based on live open/click/portfolio telemetry.
   - Polls Gmail `threadId` prior to every send; if an inbound message is detected from the recipient, the sequence halts immediately and moves the lead to `REPLIED_TRIAGE`.
   - Enforces recipient business windows (**India**: Mon–Fri 10am–6pm IST; **US**: Mon–Fri 9am–5pm EST) and randomized 3–6 minute human jitter.

---

## Quick Start & Deployment Runbook

1. **Database Setup**:
   - Run [`supabase/migrations/001_init_outreach_os.sql`](supabase/migrations/001_init_outreach_os.sql) in the Supabase SQL Editor to create all 5 tables, indexes, and 20 pre-seeded role-track templates.
   - Copy `.env.example` to `.env.local` and add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. *(If left blank during local testing, OutreachOS automatically uses its built-in `.data/local-db.json` persistence engine).*
2. **Gmail OAuth2 Setup**:
   - Enable the Gmail API in Google Cloud Console and exchange your Client ID + Secret in Google OAuth2 Playground (`https://mail.google.com/` scope) for a `GMAIL_REFRESH_TOKEN`.
3. **Portfolio Telemetry Snippet**:
   - Copy `<PortfolioTracker />` from [`docs/PORTFOLIO_SNIPPET.md`](docs/PORTFOLIO_SNIPPET.md) (or directly from the `/settings` view) into your portfolio's `app/layout.tsx`.
4. **Run Locally**:
   ```bash
   npm install
   npm run dev
   ```
