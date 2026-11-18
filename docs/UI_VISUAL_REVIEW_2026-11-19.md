# OutreachOS visual review — 19 November 2026

## Outcome and design direction

This pass keeps the Night Ledger foundation: warm charcoal work surfaces, an ivory navigation panel and brass primary actions. The pipeline structure and Settings grid remain familiar. Color now carries a defined meaning through backgrounds, outlines, labels and selected states rather than appearing only in small stage dots.

Templates and Prechecks were reorganized to expose the main task first. Secondary explanations, sample-person fields and timing controls use progressive disclosure. Production data, sequence templates, sending rules, approvals and settings were not edited as part of this visual work.

## Logo and sign-in

Five original SVG emblem-and-wordmark directions were prepared on both dark and ivory surfaces:

| Direction | Idea |
|---|---|
| Open Loop | An open continuous turn with an outgoing connection |
| Reply Fold | A geometric folded correspondence mark |
| OS Monogram | A compact O/S construction |
| Relay | Linked introductions and follow-ups |
| **Signal Arc — selected by the owner** | An open O, inner arc and separate reply point |

The selected emblem and wordmark share one `BrandLogo` component across desktop navigation, mobile navigation and the public sign-in page. The favicon uses the same emblem. The large sign-in logo sits **above and outside the ivory form card**. The page remains a minimal username/password entrance; no marketing headline, feature grid or simulated campaign metrics were added.

The five comparison directions, dark/light SVG lockups and comparison sheet are stored in `docs/design/logo-options/`. The selected source lockups are `signal-arc.svg` and `signal-arc-light.svg`.

## Shared visual meanings

The source of truth is `src/lib/theme.ts`, with surface colors and tint rules in `src/app/globals.css`. Buttons, badges, dropdowns and tinted cards use shared styling. Legacy hue names resolve to the same semantic tones.

| Meaning | Color | Where it appears |
|---|---|---|
| Primary action / overall selection | Brass | Add lead, Save, approve-all, main check action, date range |
| Information / operational action | Blue | Run Queue, recheck, general information, outgoing volume |
| Success | Green | Passed, approved, connected, positive reply |
| Waiting / attention | Amber | Pending, paused/held, retry, out-of-office |
| Failure / destructive action | Coral | Blocked, bounced, failed, negative reply, deletion |
| Reply activity | Violet | Reply rate, daily reply series, replied stage |
| Portfolio activity | Teal | Portfolio-visit metric, lead-card counter, dossier counts/pages and timeline |
| Context / inactive | Neutral | Secondary metadata, optional connection, inactive structure |

Metric identity and state have separate roles: a blue sent-volume bar describes outgoing activity; a green SENT badge confirms a completed send. Labels retain that distinction. Color is accompanied by text, icons, counts or stage numbers, following the [W3C guidance on use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

### Stage identity

| Stage | Shared identity |
|---|---|
| Lead Queued | Slate |
| Outreach Active | Blue |
| Warm Engaged | Amber |
| Replied / Triage | Violet |
| Interviewing | Teal |
| Offer / Closing | Green |
| Nurture / Future | Pink |
| Closed / Archive | Coral |

Each stage now has a colored header surface, top rule, outline and subtle body tint. The identity also applies to stage badges, selected stage filters and Analytics funnel bars. The original independent column paging, scrolling and drag targets remain.

### Category identity

- Tracks: Hybrid blue, Brand pink, AI PMM violet, AI PM teal.
- Regions: India blue, US violet, Global teal.
- Touches: T1 blue, T2A amber, T2B violet, T3 teal, T4 pink.

These mappings are reused in Templates, Leads, Approvals and Analytics. Shared dropdowns infer the matching category tone from their controlled value, while native controls remain readable on both charcoal and ivory surfaces.

## Page-by-page review

| Area | Changes and assessment |
|---|---|
| Global header | Gmail connection is a status pill. Approval Gate uses amber; Auto-Pilot uses green. Run Queue has a blue surface and outline. Selected mode remains visibly distinct from inactive controls. |
| Pipeline | The existing board layout is retained. Stage panels have substantially stronger identity, not just colored text. Add lead is a consistent brass primary action. Filters have visible outlines and selected-category accents. |
| Leads | Stage, track, region and approval states use the same mappings as other pages. Status labels remain compact and readable. Wide tables scroll within their container rather than widening the page. |
| Lead details / review drawer | Reply sentiment no longer always appears green: positive, negative, not-now and OOO use their actual shared state colors. Held states use amber. Rendered email content uses the same ivory reading surface and blue links as template previews. |
| Approvals | Pending, Approved and Held have meaningful colored tabs and selected outlines. Mode guidance matches the header's mode colors. Touch badges use the same sequence identities as Templates. Paging and the single-message editor remain. |
| Prechecks | Five compact summary/filter cards replace the old unstructured status row. Passed is green, Blocked coral, Pending/Retry amber. One main bulk action is prominent; bounded rechecks are secondary blue actions. The mailbox-existence limitation remains immediately visible, while detailed DNS/retry explanations are expandable. Per-row warnings expand only when needed. |
| Templates | Four role-track selectors and five touch selectors create a clear sequence context. A wider editor and preview replace three cramped columns. Variables, timing/threading and sample personalization are expandable. Inheritance, overrides and unsaved edits are explicit. Switching role/touch asks before discarding edits; accepting discard resets the editor even when both tracks inherit the same master. Fork/save/remove actions retain the existing API behavior. |
| Analytics | Open, click, reply, positive, portfolio and bounce metrics have consistent colored surfaces and top rules. Funnel bars match pipeline stages. Daily sends and replies use a shared numeric scale, labeled series, selectable day counts and a data table. Segment tables have full-width space on desktop. Empty periods show honest zero/unknown values in the same visual structure. |
| Settings | The existing grid is retained. Colored section headers and icons distinguish execution, windows, warm-up, identity, connections and telemetry. Statuses say Connected, Ready, Optional or Needs attention. Enabled execution mode has the same green/amber treatment as the global header. |
| Import | Shared fields, category dropdowns, validation badges and action buttons inherit the same theme. Valid/imported, duplicate and invalid results retain clear text labels. |
| Public / legal pages | The minimal sign-in is consistent with the selected palette. Legal pages retain the charcoal reading theme. Ivory surfaces are deliberate: navigation, sign-in card and rendered email content. |

## Anomalies corrected

1. Passed prechecks previously looked neutral; they now use success green.
2. Paused/held leads sometimes used failure red; they now use attention amber.
3. Reply sentiments were indiscriminately green in the dossier; sentiment mapping is now shared.
4. T4 progress could look like a failure; the sequence endpoint has a pink identity instead.
5. Role-track badges and selectors used unrelated colors on different pages; one mapping now drives them.
6. Region and touch identities now match across tables, cards, filters and editors.
7. Selected controls and outlines no longer rely on neutral gray alone.
8. Stray zinc checkbox/focus styles and hardcoded status hues were consolidated.
9. Light surfaces have darker versions of the semantic palette, keeping the same hue meaning with readable contrast.
10. Long telemetry badges wrap without forcing the Settings page wider than a phone.
11. Pagination controls fit or wrap at 320px.
12. Shared cards and native controls can shrink within narrow grids; long option labels do not widen the page.
13. Compact status badges stay on one line; only explicitly long labels wrap.
14. Toasts stay inside narrow viewports, and modal content can scroll vertically.
15. Small legacy 9–10px labels were raised to 11px in shared UI and page controls, including the dossier counters.
16. Recipient-window rows stack their region label above the time fields on small screens, preventing the fixed desktop columns from overflowing at 320px.
17. Approvals selection, Import drag-over, inactive sequence dots and the disconnected Gmail action now use shared accent/information/neutral tokens instead of hardcoded zinc/white states.
18. Portfolio views previously appeared amber in cards/dossiers but teal in Analytics. They now share teal. Opens use blue; reply activity uses violet with a separately colored sentiment badge.
19. Production exposes an extra Disconnect action for database-stored Gmail credentials. The connection action row now wraps at small widths; the local fixture includes this third action too.

## Verification

- ESLint, TypeScript, all **153 tests in 14 files** and the production build passed on the final application code.
- Isolated browser tests use a production build, synthetic records and intercepted management APIs; external requests are blocked.
- The expanded review passed **24 check groups**: populated desktop screens and a dossier with telemetry/email history, empty/error states, template inheritance/fork/save/variable insertion, and both accepted/dismissed unsaved-switch paths.
- Bulk prechecks are exercised with 55 pending contacts, verifying three bounded requests and no queue dispatch.
- Viewport review covers 320px, 390px, 768px and 1440px. The original sign-in, approval paging/editor and Trash/restore browser regressions also run.
- All **18 semantic chip contrast pairs** passed on charcoal and ivory surfaces; the lowest measured ratio was **5.25:1**, above the [4.5:1 normal-text criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). This is a scoped chip-text check, not a whole-app accessibility certification.

The original browser regression suite also passed its nine check groups, including 1,300-contact approval paging, approve-all without dispatch, a single-message editor, dedicated details and paused Trash/restore. Browser runs produced zero uncaught page errors. Live deployment verification is recorded after publication. Screenshots and test reports are generated under ignored `test-results/`; populated screenshots are synthetic examples, not production campaign statistics.

## Overall assessment

The app now has a consistent warm foundation with more visible functional color. Pipeline categories can be recognized by whole panels; status can be read in cards, filters and tables; important actions have a stable hierarchy. Templates and Prechecks expose fewer controls at once, and Settings retains its familiar layout with clearer grouping. Analytics communicates different measures without turning every mark into a different arbitrary color.

The remaining density is deliberate in lead tables and analytical detail. Those areas retain paging and contained horizontal scrolling at small widths. This review covers the documented screens and states in Chromium; it is not a claim that every browser, content length and interaction combination has been exhaustively certified.
