# Hand-off prompt for Codex / ChatGPT

> **Upgrade note (18 Nov 2026):** the local lead-management upgrade supersedes the older route, approval UI and test-count descriptions below. Read `docs/UPGRADE_013.md` and `docs/HANDOFF.md` first. It requires migration 013 before deployment; email prechecks are deferred.

Copy everything inside the fence into a new Codex session opened on this repository.

```text
You are taking over OutreachOS, a private outreach CRM for one owner (a job seeker). It is a
Next.js 15 app on Vercel + Supabase Postgres (pg_cron) + Gmail API + Groq + Telegram.
Repo: github.com/Sumandebnath943/outreach-os (branch main). Production: https://outreachos.houseofnamus.com

READ FIRST, in this order, before changing anything:
1. docs/HANDOFF.md        — current state, pending items, decisions you must not re-litigate
2. docs/PROJECT_BIBLE.md  — how every part works
3. README.md              — setup, env vars, migrations, live tests

WORKING RULES
- Ask the owner before any big change. Small fixes: do them, then explain.
- Push to main only after `npm run check` and `npm run build` pass. CI must stay green.
- Never commit .env / .env.local. Never paste secrets in chat. Never put the owner's email
  address in code, tests or fixtures (use env vars: LIVE_LEAD_EMAIL, SIM_LEAD_EMAIL).
- Never send email to real leads from scripts. Live tests only use `npm run live`, which sends
  only to plus-addresses of LIVE_LEAD_EMAIL and refuses if a real lead could be sent.
- Any new database change = a new file supabase/migrations/013_*.sql. The owner runs it by hand
  in the Supabase SQL editor; tell them explicitly.
- Windows lockfile caveat: `npm install` on Windows drops @emnapi/* entries from
  package-lock.json and CI `npm ci` then fails. If you change dependencies, regenerate the
  lockfile with `npm install --package-lock-only` (on Linux/macOS, or a clean copy) and check CI.
- After every task, update docs/HANDOFF.md (state, done, pending, decisions, change log).

TASK 1 — HEALTH CHECK (do this first, report results)
a) npm ci
b) npm run check      → expect lint + typecheck clean and all 110 tests passing (87 unit + 23 simulation)
c) npm run simulate   → expect 23 scenarios passing; read test-results/simulation-report.md
d) npm run build      → expect success
e) gh run list --limit 5   → latest CI run on main should be "success"
f) Production: open https://outreachos.houseofnamus.com/ — expect the public home page with a
   sign-in card (NOT a browser Basic-auth popup). If you get HTTP 401 with
   "WWW-Authenticate: Basic" on "/", the latest commit was not deployed by Vercel: check
   `gh api repos/Sumandebnath943/outreach-os/commits/<sha>/status` for a "Vercel" status and
   ask the owner to redeploy from the Vercel dashboard.
g) Production state (needs .env with Supabase keys): `npm run live -- status`
   → lists the live-test leads with stage, touch and next due time.
   Worker health: the dashboard top bar shows "run Xm ago" (≤ 10 min on weekdays), or read
   system_settings.last_queue_run_at. If it is stale, ask the owner to run in Supabase SQL:
   select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;

TASK 2 — OUT-OF-OFFICE AUTO-RESUME CHECK (on/after Tue 24 Nov 2026, 10:00 IST = 04:30 UTC)
- Run `npm run live -- status`. The lead tagged "oo" should have auto-resumed and sent its
  next touch (Touch 2) without manual action, shortly after 10:00 IST on 24 Nov.
- Expected: email_logs has a new SENT row for the "oo" lead after 2026-11-24T04:30Z;
  its funnel stage is Outreach Active (or Warm) with sequence_active = true.
- If it did NOT send: check the lead's next_touch_due_at, paused flags, today's cap
  (warm-up week 1 = 10/day), and the send window (India 10:00–18:00 IST). Report to the owner
  before changing code.

TASK 3 — CLEAN UP TEST LEADS (ONLY with the owner's explicit OK)
- After Task 2 is verified, ask the owner: "OK to delete the live-test leads (tags nr, rp, oo, wm)?"
- On a yes: `npm run live -- cleanup`. Then `npm run live -- status` should show none.
- Real leads the owner imported must never be touched.

TASK 4 — WATCH THE FIRST REAL SENDS (owner imported leads via docs/leads-template.csv)
- Warm-up: week 1 cap is 10/day, week 2 is 20, week 3 is 30, then 45. Sends only in the
  recipient's window, weekdays, non-holidays, 3–6 min apart.
- Check daily: Analytics page (bounce rate should stay < 3%), Telegram alerts arrive, no
  duplicate sends (email_logs: one SENT row per lead per touch).
- If the bounce rate climbs or Gmail shows an auth error in Settings, tell the owner immediately.

OPTIONAL (ask first)
- 5-minute worker schedule for faster alerts (owner runs in Supabase SQL):
  select cron.schedule('outreachos-worker-weekdays', '*/5 * * * 1-5', 'select public.oos_call_worker()');
- Extend India festival dates beyond 2027 in src/lib/holidays.ts (INDIA_FESTIVALS), with a test.

Report back with: each task's result, any failing output verbatim, and what you changed.
```

## How to check on the tests yourself (owner)

| What | Command / place | Good result |
|---|---|---|
| Unit tests + lint + types | `npm run check` | "Tests 110 passed", no lint/type errors |
| End-to-end simulation | `npm run simulate` | All S1–S23 pass; report in `test-results/simulation-report.md` |
| Build | `npm run build` | "Compiled successfully" |
| CI | GitHub → Actions → CI | Green tick on the latest commit |
| Live test leads | `npm run live -- status` | Shows the nr / rp / oo / wm leads and their stages |
| Worker running | Top bar in the app | "run Xm ago" ≤ 10 min on weekdays |
| Alerts | Settings → Send test alert | A Telegram message arrives |
