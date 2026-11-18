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
