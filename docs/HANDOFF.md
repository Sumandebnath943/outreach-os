# OutreachOS — HANDOFF

> **Read this first.** This is the living state file for any new session or agent (Claude, Codex, a human).
> **Update it at the end of every task**: change "Current state", move items between Done and Pending, and add a line to the Change log and to Decisions where relevant.
> The full product reference is `docs/PROJECT_BIBLE.md`. Setup and operations are in `README.md`.

Last updated: **18 Nov 2026**, after commit `dfc5aaa` (+ docs commit).

---

## 1. Current state (one glance)

| Item | State |
|---|---|
| Repo | `github.com/Sumandebnath943/outreach-os`, branch `main` (the only branch; push to main) |
| Production | `https://outreachos.houseofnamus.com` (Vercel, auto-deploys from `main`) |
| Database | Supabase (free tier). Migrations **001–012 all applied** by the owner |
| Scheduler | Supabase Cron (`009`): `outreachos-worker-weekdays` every 10 min Mon–Fri UTC, `outreachos-worker-weekends` hourly at weekends, `outreachos-cleanup` daily (`010`) |
| Mode | **AUTO_PILOT**, daily cap 45, **warm-up on** (started 2026-11-18 → week 1 = 10/day, week 2 = 20, week 3 = 30, then 45) |
| Holidays | `skip_holidays` on (US federal + India), out-of-office auto-resume on |
| Gmail | Connected (OAuth, `gmail.send` + `gmail.readonly`) |
| Telegram | Working: reply alerts and 09:30 IST digest |
| Groq AI | Working: reply triage (`openai/gpt-oss-20b`) |
| CI | GitHub Actions `CI` green on `dfc5aaa` (lint + types + 110 tests + build) |
| Tests | `npm run check` (lint, tsc, vitest: 110 tests / 13 files), `npm run simulate` (23 scenarios) |
| Leads in prod | **Only live-test leads** (plus-addresses of the owner's test inbox; tags `nr`, `rp`, `oo`, `wm`). The owner is about to import real leads via CSV. |

### Open watch item
- **Live test `oo` (out-of-office):** auto-resume is due **Tue 24 Nov 2026 10:00 IST** (`2026-11-24T04:30Z`). Expect Touch 2 to be sent automatically to the `+oo` address, without a manual step. Verify with `npm run live -- status`. After that, run `npm run live -- cleanup`, **with the owner's OK**, to delete all test leads.

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

---

## 3. Pending / follow-ups

| # | Item | Owner | Notes |
|---|---|---|---|
| P1 | Verify `oo` auto-resume on **24 Nov 10:00 IST**, then clean up test leads | agent + owner OK | `npm run live -- status`, then `npm run live -- cleanup` |
| P2 | Owner imports real leads from `docs/leads-template.csv` | owner | Import page → dry run → confirm. Week 1 cap = 10/day. Blank `geo_region` defaults to INDIA; blank `role_track` is inferred from `target_role_opening` |
| P2b | Confirm Vercel deployed the home-page commit | agent | `dfc5aaa` got no Vercel status; the docs commit should redeploy. `/` must show the home page, not a Basic-auth popup |
| P3 | Optional: 5-minute cron for faster alerts | owner (SQL) | `select cron.schedule('outreachos-worker-weekdays', '*/5 * * * 1-5', 'select public.oos_call_worker()');` |
| P4 | Extend India festival dates beyond 2027 | agent | `src/lib/holidays.ts` (`INDIA_FESTIVALS`) before Dec 2027 |
| P5 | Watch the first real sends: deliverability, bounces, replies | agent/owner | Analytics page; Telegram |
| P6 | Optional roadmap | — | AI icebreakers on import, A/B subjects, bounce/warm Telegram alerts, multi-user white-label |

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
npm run check             # lint + typecheck + unit tests — must pass before every push
npm run simulate          # 23-scenario end-to-end simulation → test-results/simulation-report.md
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
| 2026-11-18 | (docs) | HANDOFF, PROJECT_BIBLE, PORTFOLIO_HANDOFF, deck, CSV template, Codex prompt |
| earlier | — | See `git log` |
