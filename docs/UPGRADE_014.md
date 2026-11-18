# Email prechecks and workspace redesign

Migration 014 was applied by the owner and its schema was verified on 18 November 2026. Reoon and all external mailbox-verification services remain excluded.

## Email flow

Import/manual entry starts PENDING → built-in precheck → PASSED enters approval/outreach. BLOCKED and RETRY never send, including Auto-Pilot. Checks cover ASCII address syntax, DNS MX, explicit null MX, A/AAAA fallback when MX is absent, known bounce/unsubscribe suppression, role-mailbox warnings and a small explicit typo map (never automatic correction). A pass confirms domain routing only; mailbox existence and catch-all behavior remain unknown. SMTP probing is not used.

Temporary DNS errors retry after one hour; blocked active leads recheck daily; passed results expire after seven days and are rechecked before dispatch. The scheduler processes up to 50 due active contacts per run even at the send cap/outside windows. The paginated Prechecks page can check all pending matches through successive 25-record requests, with progress and cancellation after the current batch. Single-row recheck bypasses the domain cache. Editing an unsent address resets approval and precheck via a database trigger. Addresses cannot change after sending starts, preserving thread history.

Final bounces stop/archive the sequence and save the SMTP diagnosis to the email log and a durable address suppression. Temporary delivery-delay notices remain delays. Suppression survives lead deletion and blocks imports, creation, resumption and sending. A free precheck cannot prevent a nonexistent mailbox at a valid domain from bouncing.

## Design rationale

The owner selected the researched light workspace direction. Sources reviewed:

- [Linear's 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh): consistent view controls and reduced navigation prominence.
- [Attio record previews](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): move between tables/boards, preview drawers and complete records.
- [Carbon tables](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) and [pagination](https://www.carbondesignsystem.com/building-blocks/core/components/pagination/guidelines): grouped filters/actions, bounded rows, attached paging controls.
- [Carbon color roles](https://www.carbondesignsystem.com/building-blocks/foundations/color/overview): neutral surfaces, readable text and small semantic accents.

Implementation uses light slate surfaces, white content, blue primary actions, a quiet desktop navigation rail and scrollable mobile navigation. Global metrics appear on Pipeline rather than above every screen. The brief homepage replaces green gradients and pills with a workflow preview and sign-in card. Status colors are retained for relevant states.

DNS behavior follows [RFC 7505](https://www.rfc-editor.org/info/rfc7505/) and [Node's DNS API](https://nodejs.org/api/dns.html).

## Validation and production reset

The owner explicitly authorized removing all leads and production testing using LIVE_LEAD_EMAIL. All 299 original lead rows were removed through the production management API after saving an ignored local backup; the existing bounce suppression was retained. Approval Gate isolates testing. Production API, sending, tracking, reply and cleanup results will be recorded after deployment. No private lead data or credentials belong in Git.

Local lint, types, 150 tests (37 sequence simulations) and production build passed before browser review. Isolated desktop/mobile browser checks passed; screenshots were inspected and remaining surface/header spacing corrections were applied. Final validation follows those corrections.

The production cleanup review exposed that cascading deletion erased sent quota. Migration 015, applied by the owner, preserves sent accounting with no lead association while removing deleted message content and unsent drafts. The final suite has 153 tests, including deletion quota, final dispatch mode/approval recheck and unsubscribe precheck state. Production verification also covers the updated delete behavior and restores minimal accounting rows from the pre-reset private snapshot; original leads are not restored.

## Completed production validation

App commits `8957fcd` and `4fb44da` passed CI and Vercel deployment. Production testing used 56 imported test aliases plus short-lived manual fixtures, with 12 actual sends exclusively to aliases of LIVE_LEAD_EMAIL. Send scheduling was accelerated only for isolated tests; original settings were restored afterward.

Verified through deployed endpoints and actual Gmail:

- Import preview/deduplication/exclusions/history and exception CSV; Leads CSV export.
- Real DNS checks; pending/blocked approval and send gates; 50-item scheduler batch; 25-item manual batch; exact totals and disjoint pages in Leads, Prechecks and Approvals.
- Approve-all without dispatch, revoke, draft editing and approval reset; address corrections reset precheck through the database trigger.
- Four real touches in one Gmail thread and automatic ghost archive. Real inbox opens correctly chose the warm branch; a separate controlled zero-engagement fixture verified the cold branch.
- Signed click tracking, warm promotion and warm Touch 2; analytics and full details/history.
- Owner's real positive reply stopped follow-ups and entered triage. Their real out-of-office reply scheduled automatic resume; its next touch was successfully sent after accelerating its due date.
- Manual creation, duplicates, pause/unpause, nurture resurfacing, Trash, paused restore, delete guard and permanent delete.
- Durable bounce suppression, resume/recreation/import blocks using a controlled non-sending fixture. No live provider hard bounce was deliberately induced; full DSN/delay classification and automatic Gmail bounce handling are exercised by the automated simulations.
- Real Telegram test notification; unauthorized API, CSRF and input guards.
- Thirteen live browser checks: public home, all seven management pages, four mobile layouts and genuine sign-in/out protection; zero page errors. Earlier isolated browser checks used 1,300 synthetic records.

Final state verified at 2026-11-18 17:56 UTC: **zero leads, zero Trash, zero pending approvals/prechecks and zero test import reports**. Original Auto-Pilot, 45/day configured limit, 10/day warm-up cap, holidays, windows and pacing are restored. One original hard-bounce suppression remains; test suppressions were removed. Quota remains **22 actual sends: 21 test + 1 outreach, including 1 bounce**, after permanent deletion. The ten pre-reset send records were restored as minimal accounting only, with no lead association or message content. Private backups, scripts and screenshots remain under ignored `test-results/`; no credentials or private lead data were committed.
