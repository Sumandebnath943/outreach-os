# OutreachOS — HANDOFF

> **Read this first.** This is the living state file for any new session or agent (Claude, Codex, a human).
> **Update it at the end of every task**: change "Current state", move items between Done and Pending, and add a line to the Change log and to Decisions where relevant.
> The full product reference is `docs/PROJECT_BIBLE.md`. Setup and operations are in `README.md`.

Last updated: **19 Nov 2026**, after applying the owner-selected Night Ledger palette to the existing dashboard layout and replacing the public homepage with a minimal sign-in screen. Lint, types, 153 tests, production build and isolated desktop/mobile browser checks passed. App commit `1d63c08` passed CI and Vercel deployment; all 13 live browser checks passed with zero page errors.

---

## 1. Current state (one glance)

| Item | State |
|---|---|
| Repo | `github.com/Sumandebnath943/outreach-os`, branch `main` (the only branch; push to main) |
| Production | `https://outreachos.houseofnamus.com` (Vercel, auto-deploys from `main`) |
| Visual direction | **Existing dashboard layout retained.** Night Ledger warm charcoal content, ivory sidebar, brass primary actions and distinct labeled stage colors. Public home is a minimal sign-in screen, selected by the owner; no mockup layouts were adopted. |
| Database | Supabase (free tier). Migrations **001–015 applied**. 014 schema and 015 deletion/quota behavior verified in production on 18 Nov 2026 |
| Scheduler | Supabase Cron (`009`): `outreachos-worker-weekdays` every 10 min Mon–Fri UTC, `outreachos-worker-weekends` hourly at weekends, `outreachos-cleanup` daily (`010`) |
| Mode | **AUTO_PILOT**, daily cap 45, **warm-up on** (started 2026-11-18 → week 1 = 10/day, week 2 = 20, week 3 = 30, then 45) |
| Holidays | `skip_holidays` on (US federal + India), out-of-office auto-resume on |
| Gmail | Connected (OAuth, `gmail.send` + `gmail.readonly`) |
| Telegram | Working: reply alerts and 09:30 IST digest |
| Groq AI | Working: reply triage (`openai/gpt-oss-20b`) |
| CI | GitHub Actions `CI` green on `1d63c08` (lint + types + 153 tests + build) |
| Deploy | Vercel deployed `1d63c08` with Night Ledger colors and minimal sign-in. All 13 live browser checks passed on 19 Nov, including management pages, four mobile layouts and sign-in/out. Prior functional sending/cleanup validation remains recorded in the upgrade report |
| Tests | Local lint, typecheck, all **153 tests in 14 files** (113 unit + 40 simulation scenarios), and production build passed during this upgrade (final results below). `npm run simulate` runs only the 40 scenarios |
| Leads in prod | **0 active/archived leads, 0 Trash rows, 0 test import reports.** All 299 originals and all test fixtures were removed at the owner's request. The original bounce suppression remains. A private ignored local backup is available. |
| Quota after 18 Nov testing | **22 actual sends on 18 Nov: 21 test + 1 original outreach (bounced).** This includes 12 new production test emails. Original 10/day warm-up cap is restored; deletion does not reset quota. Sent records retain minimal accounting with lead association/content removed. |
| Production verification | Real Gmail sending/threading, signed click tracking, warm/cold branches, positive reply kill switch, OOO deferred resume/accelerated next touch, nurture, Telegram, import/approvals/paging/CRUD/auth, deletion and quota checks passed. Bounce/delay parsing is covered by automated simulations; production suppression was exercised with a controlled non-sending fixture. |

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

| P2 | Re-upload/enrich source data when ready | owner | Original CSV audit: four contacts missing companies; 254 lack role opening/icebreaker and 213 use Team greeting. Built-in checks cannot confirm mailbox existence. Known bounced/unsubscribed addresses remain suppressed. |
| P3 | Optional: 5-minute cron for faster alerts | owner (SQL) | `select cron.schedule('outreachos-worker-weekdays', '*/5 * * * 1-5', 'select public.oos_call_worker()');` |
| P4 | Extend India festival dates beyond 2027 | agent | `src/lib/holidays.ts` (`INDIA_FESTIVALS`) before Dec 2027 |
| P5 | Watch the first real sends: deliverability, bounces, replies | agent/owner | Analytics page; Telegram |
| P6 | Optional roadmap | — | AI icebreakers on import, A/B subjects, bounce/warm Telegram alerts, multi-user white-label |
| P8 | Reoon and external mailbox verification deferred | owner | Built-in syntax/DNS/suppression checks are implemented in upgrade 014. No external verifier is connected. |

---

## 4. Decisions (do not re-litigate without the owner)

| Decision | Reason |
|---|---|
| Preserve the current dashboard layout; Night Ledger colors only | Owner rejected all three mockup layouts and explicitly chose colors only (19 Nov). Homepage preference: minimal sign-in. |
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
npm run check             # lint + typecheck + all 153 tests (incl. simulation) — must pass before every push
npm run simulate          # 40-scenario end-to-end simulation → test-results/simulation-report.md
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
| 2026-11-18 | `8957fcd`, `4fb44da` | Deployed free prechecks/light workspace, then final dispatch guards and deletion quota fix. 153 tests + CI/build green; 12 real emails only to test-inbox aliases. Real positive/OOO replies, resumed touch, both T2 branches, four-touch threading, tracking, management, auth and Telegram verified. All original/test leads removed, original settings restored; quota 22/10 remains accurate after deletion. |
| 2026-11-19 | `1d63c08` | Kept all dashboard structure/controls intact and applied warm charcoal/ivory/brass tokens with eight distinct stage identities and readable status colors. Replaced the homepage with owner-selected minimal sign-in. Lint/types, all 153 tests, production build, local sign-in/error handling, paging/drafts/Trash and desktop/mobile checks passed. No data, queue, sending logic or settings changed. CI/Vercel green; all 13 live browser checks passed with zero page errors. |
| earlier | — | See `git log` |
