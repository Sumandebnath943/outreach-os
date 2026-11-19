# Readiness review — 19 November 2026

The release fixes the dropdown spacing and the concrete validation, redirect and sending risks found in this review. The source changes require deployment before they protect the live application. No database migration is required for this release.

## Corrections

- Every dropdown uses the shared Select component. Its 16px chevron box now sits 12px inside the right edge, with 40px of text padding. The arrow remains visible for tinted filters and on light surfaces; Windows forced-colors mode retains the native control. The native select and keyboard behavior remain.
- Next.js's vulnerable nested PostCSS 8.4.31 is replaced through an npm override with 8.5.33. A fresh full dependency audit reports zero known advisories. See the [PostCSS security advisory](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) and [maintainer releases](https://github.com/postcss/postcss/releases).
- Overlong email addresses are rejected instead of being truncated into a potentially different recipient address.
- Malformed JSON, null/primitive bodies and invalid nested template/ID arrays return client errors instead of throwing server errors. This includes sign-in and portfolio telemetry.
- Post-login destinations are checked after URL resolution. Embedded tabs/newlines can no longer disguise a redirect to another website.
- Lost provider responses and server-side send errors pause the lead with an explicit delivery-unconfirmed diagnosis. They do not automatically resend. Explicit rejections such as HTTP 429 retain the retry behavior. Gmail's transport-level retry is disabled for sends. Operators must inspect provider Sent mail before resolving an uncertain delivery; blindly resuming can resend the same touch.

## Verification

| Check | Result |
|---|---|
| ESLint and TypeScript | Passed |
| Unit and server workflow suite | 167 tests in 15 files, including 41 sequence simulations |
| Production build | Passed |
| Full dependency audit | Zero known vulnerabilities |
| Isolated browser smoke suite | Nine check groups passed |
| Isolated browser theme/workflow suite | 24 check groups passed; zero uncaught page errors |
| Live read-only readiness audit | 25 checks passed; zero emails sent and zero lead/settings records changed |

Browser coverage includes all eight dashboard pages at desktop, 768px, 390px and 320px; sign-in/error handling; approval paging across 1,300 synthetic contacts; review drawers; approve-all without dispatch; dedicated lead details; Trash and paused restore; template inheritance, unsaved edits, fork/save and variables; prechecks drained in bounded batches; analytics interaction; empty/error states; and 18 semantic chip contrast pairs. The arrow inset was also visually inspected in the app browser.

The server simulations execute the real worker and route logic against an in-memory database and Gmail fixture. They cover import/deduplication, prechecks and suppression, approvals, four-touch warm/cold paths and threading, windows/holidays/warm-up/quota/pacing, concurrent workers, reply and bounce detection, unsubscribe, out-of-office handling, tracking/bot filtering, analytics, alerts/digests, deletion accounting and uncertain provider acceptance. A new scenario accepts an email, drops the provider response, and verifies that three later daily worker runs never duplicate it.

The live audit verifies protected endpoints reject unauthenticated requests; authenticated management reads succeed; refresh tokens are omitted from responses; unauthorized cron and cross-site queue requests are blocked; security headers are present; required database columns/tables are available; the worker ran recently; Gmail token/scopes and sender identity match; all 20 track/touch combinations render; and Telegram and the configured AI model respond. At the recorded check the live database had zero leads and zero Trash records, with Auto-Pilot enabled.

## Readiness limits and release gate

- These results support a tested release, not a promise of zero bugs or zero vulnerabilities. This is not an independent penetration test, exhaustive accessibility/browser certification, load test, or infrastructure security audit. Shared-host/distributed login-rate limits were not verified.
- Browser mutations use synthetic intercepted APIs; server workflow mutations use fixtures. The live audit is read-only and does not perform a fresh real import/send/reply/bounce cycle. Earlier production reports are historical evidence, not a substitute for testing this release.
- DNS prechecks establish mail routing, not mailbox existence or inbox delivery. Provider outages, token expiry, ambiguous delivery and complete database outages still require operational handling. A paused unconfirmed delivery is not counted as a confirmed send in analytics or the send quota.
- Production is currently in Auto-Pilot. On a deployed, validated release, importing contacts makes them eligible for automatic outreach after the precheck and sending gates pass. Approval Gate provides a manual review before each touch.
- Before uploading real leads, deploy this release and verify sign-in, dropdown spacing, management reads and queue status on that deployed version. A small owner-controlled live round can additionally verify delivery and reply handling; no fresh live messages were sent during this review.

Repeatable checks: `npm run check`, `npm run build`, `npm audit`, and `npm run audit:live`. The latter only reads the configured production services and writes a sanitized local report. Detailed simulation/browser/live reports and screenshots are under ignored `test-results/`; they contain no new production lead mutations.
