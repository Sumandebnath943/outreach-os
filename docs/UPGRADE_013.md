# Lead management and queue upgrade

Implemented and tested on 18 November 2026. The owner confirmed migration 013 ran successfully and authorized pushing to main. Email prechecks and external verification services are deferred. Existing execution mode, send caps, pacing, holidays and outreach copy are preserved.

## Deployment order

1. The owner runs `supabase/migrations/013_lead_management.sql` in the Supabase SQL Editor. It adds Trash, suppression, import reports, reply rotation indexes and test-send labels. It schedules removal of records that have spent 30 days in Trash.
2. Deploy this app version only after that SQL succeeds. The old app can continue operating while the new nullable/defaulted columns are added. This app version requires those additions; APIs report a database upgrade error if they are missing.
3. After deployment, read Settings/Stats, open Leads and Approvals, and verify totals against the existing contacts. Review one draft without sending. Do not run the live-test worker against real contacts.

No migration, email, Telegram notification, real lead mutation or live worker run was performed as part of the local implementation and tests. The database migration has been reviewed but has not been executed against Postgres in this environment. The owner's existing CSV edit is preserved.

## Behavior

- Approvals: Pending, Approved and Held tabs; exact matching counts; 25/50/100 rows per page; filters; one message editor at a time; approve selected or all matching across pages. Approval does not invoke the worker. Editing/resetting a saved draft revokes its approval. Auto-Pilot is explicitly explained in the UI.
- Pipeline: independently paginated 25-card columns. Counts/search use the complete database. Each column keeps a bounded list rather than accumulating every card in the DOM.
- Leads: `/leads` directory with filters, sorting, bulk pause/unpause/archive, CSV export, Trash and permanent deletion. Bulk selection distinguishes the visible page from every matching result.
- Details: `/leads/[id]` is bookmarkable and uses the dossier UI. Thread/activity are paginated independently; latest reply insight and failure diagnosis remain available regardless of the selected activity page. Move to Trash is visible at the top.
- Trash: sending and nurture resurfacing stop immediately. Restore leaves sending paused and requires explicit Resume. A suppression record for bounced/unsubscribed addresses survives permanent deletion and blocks import/manual re-creation and sending.
- Imports: batches and exclusion reports are persisted, interrupted imports are marked failed, excluded rows can be downloaded, missing companies can be corrected in a mapped Company column, source-data gaps are summarized. Import size remains 5,000 rows per request, with server writes in 500-row chunks. Larger datasets can use multiple batches. History is paginated.
- Delivery: full notice text supplies SMTP failure details for future bounces. Existing bounced leads have a read-only “Read full delivery notice” action, which does not restart the sequence or alter the lead.
- Quota: test and outreach sends are separated, with bounces shown as a subset. All sent mail continues consuming the same daily cap.
- Worker: oldest-checked-first rotation covers large active and late-reply lists over successive runs. Regions are filtered before the due-candidate limit so a closed-region backlog cannot starve an open region. Pre-send thread verification remains in force.
- Design: navy surfaces with emerald/cyan accents, a brief public homepage and responsive navigation. The public page exposes no private campaign metrics.

## Validation

The offline suite covers the original 23 scenarios plus nine added simulation regressions:

| Scenario | Assertion |
|---|---|
| S24 | 1,250 pending leads paginate without overlap; approve-all reaches all 1,250 and sends nothing |
| S25 | Trash excludes a lead from lists/sends; restore stays paused until explicit resume |
| S26 | Full SMTP 550 5.1.1 is diagnosed; suppression survives permanent deletion and blocks re-import |
| S27 | Reply checks rotate through 1,100 contacts, beyond the database response cap |
| S28 | 320 closed-region contacts do not block an eligible US contact |
| S29 | Dry runs do not create batches; final import records its exclusions and batch association |
| S30 | Bulk approval respects region filters, held leads and Trash |
| S31 | Trash is excluded from lead counts while already-sent test mail still consumes quota |
| S32 | Bulk approval skips unresolved drafts and leaves those contacts pending |

Browser checks use a local production preview with synthetic records, all management API calls intercepted and external requests blocked. The first pass caught mobile navigation overflow, which was corrected. The repeated desktop/mobile run passed all nine browser checks with zero page errors. Tables also have bounded scrolling and sticky headings. Lint, TypeScript, all 121 tests and the production build passed. Screenshots and smoke-test output are generated under ignored `test-results/`.

A unit regression also checks that full temporary delivery notices remain delays even when their preamble says the message was not delivered.

Run `npm run check` and `npm run build` before deployment. Production has not yet been validated against migration 013.
