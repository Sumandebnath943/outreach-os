# OutreachOS — HANDOFF

> **Read this first.** This is the living state file for any new session or agent (Claude, Codex, a human).
> **Update it at the end of every task**: change "Current state", move items between Done and Pending, and add a line to the Change log and to Decisions where relevant.
> The full product reference is `docs/PROJECT_BIBLE.md`. Setup and operations are in `README.md`.

Last updated: **18 Nov 2026**, during the email-precheck upgrade and production end-to-end testing. The owner applied migration 014; schema verified. The owner authorized deleting all leads and testing with LIVE_LEAD_EMAIL. See docs/UPGRADE_014.md.

---

## 1. Current state (one glance)

| Item | State |
|---|---|
| Repo | `github.com/Sumandebnath943/outreach-os`, branch `main` (the only branch; push to main) |
| Production | `https://outreachos.houseofnamus.com` (Vercel, auto-deploys from `main`) |
| Database | Supabase (free tier). Migrations **001–014 applied**, with 014 confirmed by the owner and verified by schema query on 18 Nov 2026 |
| Scheduler | Supabase Cron (`009`): `outreachos-worker-weekdays` every 10 min Mon–Fri UTC, `outreachos-worker-weekends` hourly at weekends, `outreachos-cleanup` daily (`010`) |
| Mode | **AUTO_PILOT**, daily cap 45, **warm-up on** (started 2026-11-18 → week 1 = 10/day, week 2 = 20, week 3 = 30, then 45) |
| Holidays | `skip_holidays` on (US federal + India), out-of-office auto-resume on |
| Gmail | Connected (OAuth, `gmail.send` + `gmail.readonly`) |
| Telegram | Working: reply alerts and 09:30 IST digest |
| Groq AI | Working: reply triage (`openai/gpt-oss-20b`) |
| CI | GitHub Actions `CI` green on `f0c922f` (lint + types + 121 tests + build) |
| Deploy | Vercel deployed `f0c922f`. Twelve read-only page/API checks passed, including Leads/details, Approvals, Pipeline, Imports, Stats and signed-out protection. Migration 013 schema verified (18 Nov) |
| Tests | Local lint, typecheck, all **121 tests in 13 files** (89 unit + 32 simulation scenarios), and production build passed during this upgrade (final results below). `npm run simulate` runs only the 32 scenarios |
| Leads in prod | **299 total: 295 real imports + 4 live-test leads.** The 308-row enriched CSV produced 295 unique valid leads: 9 duplicate rows and 4 Gmail contacts missing company names were skipped. All 295 stored records match the normalized CSV fields. Of the real leads, 294 are queued/approved and one is closed/bounced. |
| First real send | Mistral's `jobs@` address returned a verified permanent SMTP **550 5.1.1 / account does not exist**. Auto-archive was correct. Today's 10-send warm-up cap includes 9 earlier live-test sends and this one bounced send. |
| Connection audit | Gmail token has both required scopes; sender matches the connected account. Telegram token/chat and Groq credentials/model verified. Public home 200, signed-out pipeline redirects, protected API 401. Last worker run at audit: 19:40 IST. No worker or notification was triggered by the audit. |

### Open watch item
- The previous `oo` test and all other leads were removed at the owner's explicit request during upgrade 014. The old 24 Nov watch is cancelled; new production test results will replace it.

---

## 2. Done (high level, oldest → newest)

1. Full review against the PRD; kept the local implementation over GitHub v1 (security issues in v1), replaced via PR #1.
2. Bug and security fixes:
   - cron auth;
   - open redirect → signed clicks;
   - header-injection-safe MIME;
   - Basic auth + CSRF;
   - production lock;
   - RLS + grants.
3. ESLint flat config, Vitest unit tests, GitHub CI.
4. Bot-click/open filtering. Late-reply detection (30 days after ghosting).
5. Owner email updated; phone numbers removed.
6. Deployment: Supabase keys (`sb_secret_`), env vars, Google OAuth privacy/terms pages, custom domain.
7. Simulation harness (fake Supabase, Gmail and clock) and live-test runner (`scripts/live-test.ts`).
8. UTM tags (company, person, stage) on every tracked link; stage re-stamped at click.
9. Analytics page (rates by touch, track, region; daily sends).
10. Telegram reply alerts, daily digest, Gmail thread links.
11. Scheduler moved from GitHub Actions to Supabase pg_cron. GitHub's scheduled runs were dropping; the GitHub workflow is now manual-only.
12. Auto-Pilot default.
13. Delay notices (DSN) ignored; only real failures count as bounces.
14. Groq AI reply triage (keyword fallback).
15. Out-of-office auto-resume (max 2 per lead).
16. US/India holiday calendar + extra blackout dates.
17. Sender warm-up ramp.
18. Shared text signature with labelled, tracked links (Portfolio · Résumé · LinkedIn).
19. Copy rewrite in the owner's job-seeker voice; one Touch 1 per role track (`012`). 9+ yrs incl. products on the AI tracks; employer only as "in my current role".
20. Live test rounds: no-reply full sequence, positive reply, OOO, warm path. All passed; recipient-side threading works with realistic gaps.
21. Readable `ref=<company>.<person>.<stage>-<touch>` label for portfolio visitor alerts; lead ID moved to `oid=` (no portfolio code change).
22. Public home page with sign-in (signed session cookie), `/pipeline` route, Sign out, Privacy/Terms links. CI lockfile fixed.
23. Docs added:
    - `docs/HANDOFF.md`;
    - `docs/PROJECT_BIBLE.md`;
    - `docs/PORTFOLIO_HANDOFF.md`;
    - `docs/OutreachOS_Deck.pptx`;
    - `docs/leads-template.csv` (header only) + `docs/leads-template-example.csv` (example rows, do not upload);
    - `docs/CODEX_PROMPT.md` (hand-off prompt for Codex/ChatGPT + how to check tests).

24. Lead-management upgrade deployed and verified; see `docs/UPGRADE_013.md` for scope and validation. Production retains 299 leads, 294 approved, zero pending; quota shows nine test sends and one outreach send, including one bounce. No outbound messages or live worker runs were triggered by implementation or verification.

---

## 3. Pending / follow-ups

| # | Item | Owner | Notes |
|---|---|---|---|
| P1 | Complete upgrade 014 production tests and cleanup | agent | Owner explicitly authorized test sends and removal of all original/test leads. Restore original settings afterward. |
| P2 | Complete source-data enrichment | owner | Import is complete. Four rejected contacts need company names (enriched CSV data rows 82, 94, 107, 171, excluding header). 254 imported contacts have no target opening or icebreaker; 213 use the Team greeting. Import validation does not verify mailbox existence. |
| P3 | Optional: 5-minute cron for faster alerts | owner (SQL) | `select cron.schedule('outreachos-worker-weekdays', '*/5 * * * 1-5', 'select public.oos_call_worker()');` |
| P4 | Extend India festival dates beyond 2027 | agent | `src/lib/holidays.ts` (`INDIA_FESTIVALS`) before Dec 2027 |
| P5 | Watch the first real sends: deliverability, bounces, replies | agent/owner | Analytics page; Telegram |
| P6 | Optional roadmap | — | AI icebreakers on import, A/B subjects, bounce/warm Telegram alerts, multi-user white-label |
| P8 | Reoon and external mailbox verification deferred | owner | Built-in syntax/DNS/suppression checks are implemented in upgrade 014. No external verifier is connected. |

---

## 4. Decisions (do not re-litigate without the owner)

| Decision | Reason |
|---|---|
| Local codebase is canonical; GitHub v1 replaced | v1 had security holes and fake sends |
| Plain personal emails, no HTML design or logo | Inbox placement and reply rates; branding lives on the portfolio |
| Job-seeker voice from the owner's own emails; no sales patterns; no employer name in the opener | Owner rejected sales-style copy; an employer name in the opener reads like recruiting |
| AI tracks say "9+ years incl. products", without naming product types | Owner's instruction |
| One email per worker run, 3–6 min random gap, atomic claims | Human pacing, no double-sends |
| Supabase Cron, not GitHub schedules | Reliability and no Actions minutes |
| AI never sends; negatives stay manual | Owner keeps control; a misread must not bury a lead |
| `oid` = lead ID; `ref` = readable label | Portfolio alerts readable without changing the portfolio |
| Session cookie sign-in on a home page; Basic still accepted | UX; scripts keep working |
| Auto-Pilot default + warm-up | Hands-off but reputation-safe |
| Never commit `.env`; never put the owner's email in code/fixtures (use env vars `LIVE_LEAD_EMAIL`, `SIM_LEAD_EMAIL`) | Privacy |
| Ask the owner before big changes; push to `main` | Owner's working agreement |

---

## 5. How to work on this repo

```bash
npm ci                    # install (CI uses this; see lockfile caveat)
npm run dev               # local app at :3000 (needs .env.local)
npm run check             # lint + typecheck + all 121 tests (incl. simulation) — must pass before every push
npm run simulate          # 32-scenario end-to-end simulation → test-results/simulation-report.md
npm run build             # production build
npm run live -- status    # live test leads (reads .env; sends only to plus-addresses of LIVE_LEAD_EMAIL)
```

**Lockfile caveat (Windows):** `npm install` on Windows drops `@emnapi/*` entries, and then CI `npm ci` fails. If you change dependencies, regenerate the lockfile in a clean copy:
```bash
npm install --package-lock-only
```

**Commits:** push to `main`; CI must be green. Vercel deploys automatically.

**Migrations:** add `supabase/migrations/0NN_*.sql`; the owner runs them in the Supabase SQL Editor. Say so explicitly in your summary.

**Key files:**
- `src/lib/server/sequencer.ts`: worker.
- `src/lib/funnel.ts`: rules.
- `src/lib/render.ts`: copy, links, UTM.
- `src/lib/server/gmail.ts`: Gmail.
- `src/lib/ai.ts` + `server/groq.ts`: AI.
- `src/lib/notify.ts`: Telegram text.
- `src/middleware.ts` + `src/lib/session.ts`: auth.

---

## 6. Change log

| Date | Commit | Change |
|---|---|---|
| 2026-11-18 | `dfc5aaa` | Home page + sign-in, `/pipeline`, session cookies, lockfile fix |
| 2026-11-18 | `3a17579` | Readable `ref` label; `oid` param |
| 2026-11-18 | `84fb5a0` | Copy fixes (9+ yrs, candidate-clear openers) |
| 2026-11-18 | `7bc9b4d` | Job-seeker copy rewrite, per-track Touch 1, new signature (`012`) |
| 2026-11-18 | `0729918` | Shared signature with labelled tracked links (`011`) |
| 2026-11-18 | `87b35a0` | HANDOFF, PROJECT_BIBLE, PORTFOLIO_HANDOFF, deck, CSV template, Codex prompt (also triggered the Vercel deploy that `dfc5aaa` missed) |
| 2026-11-18 | (docs fix) | Docs checked against the code: test counts, S7, Hybrid subject, OOO behaviour, HEAD probes, alert latency |
| 2026-11-18 | (read-only audit) | Reconciled first real import (308 → 295), verified genuine SMTP 5.1.1 bounce, 9 test sends + 1 real bounce consuming today's cap, all 294 remaining real leads approved, live connections/auth and 1,180 template renders. Recorded approval API/UI limits and source-data gaps; production unchanged. |
| 2026-11-18 | (local upgrade) | Implemented all approved fixes except deferred email prechecks. Added migration 013 and nine simulation regressions plus a full delivery-notice unit regression covering scale, Trash, suppression, import reports, regional fairness and quota. Deploy only after owner applies migration. |
| 2026-11-18 | `f0c922f` | Owner confirmed migration 013 and authorized push. CI and Vercel succeeded; twelve read-only production page/API checks and schema checks passed. Counts: 299 leads, 294 approved, zero pending, quota 9 test + 1 outreach = 10/10. No sends, approvals or live worker runs triggered. |
| 2026-11-18 | (upgrade 014) | Built free prechecks and a light workspace based on reviewed Linear/Attio/Carbon guidance; owner selected light direction. 150 tests and production build pass. All 299 original leads removed after private backup; suppression retained. Production E2E validation in progress. |
| earlier | — | See `git log` |
