# Feature expansion — screenshot-driven implementation plan (2026-10-21)

## Authority and rollout
This describes requested *future* features based on user-provided concept images: Add Equipment, Cleaning & Reset, Calendar/Fullscreen Calendar, Membership, Client Portal (desktop/mobile/settings), and Foundation. These are references, **not implemented system behavior**. All features must use real persisted data, existing status/finance/RBAC contracts and live-Supabase isolation. Use separate reviewed PRs for each phase. No fake records, fake success flows or production writes.

**Design-spec conflict:** uploaded Design Tokens v2.0 (dark default, Inter, 768/1180, On Rent green) conflicts with current repo v4.2+ (light default, Outfit/Source Sans, 768/1280, On Rent orange). Do not overwrite later repo design rulings without explicit user decision. Gold stays reserved for externally rented gear, not membership styling.

## Phase 1 — Existing booking payment quick actions
- Booking Detail right rail `Quick Actions > Record Payment` automatically uses only that booking's real invoice(s) and the existing `RecordPaymentModal`. No new money write path.
- Preserve `canRecordPayment` RBAC, invoice UUID selection, outstanding prefill, server re-fetch and receipts. No settlement of security deposits as rental payment.
- Missing invoice/read error/cancelled/fully-paid have distinct gates. Mobile retains an actionable entry in the Money segment.
- Tests: payment gate states + CI, manual money-blind checks, no cross-booking invoice attachment and no duplicate posts.

## Phase 2 — Smart Compact + global shell
- Reduce excessive dashboard card and movement-panel spacing selectively, compact dense tables 44–48px and button hitboxes >=44px.
- Preserve the single 64px global header, existing filter drawer, shared route navigation, keyboard focus, iPad desktop-like shell with collapsible rail; mobile uses task cards/bottom sheets.
- Verify 1280/1440px desktop, 1194px iPad and 390px phone against overflow/clipping.

## Phase 3 — Inventory / Add Equipment
- Enhance existing `/inventory?tab=new`: Basic Information -> Inventory Structure -> Pricing -> Relationships -> Review/Save.
- Serial/pooled model, unique IDs, generated QR/barcodes, parent-child kit graph, cost/price RBAC, Save Draft/Preview, image validation, duplicate checks and CSV dry-run.
- Do not assign `On Rent` or `Reserved` manually at creation; derive those from booking and unit movement.

## Phase 4 — Cleaning & Reset
- Extend existing ResetWorkspace/Operations module, not a duplicate standalone operations app.
- Real Waiting/Cleaning/QC/Ready queues, staff assignments, per-unit checklist, notes, exceptions and priority, atomic guarded bulk actions, audit timeline.
- Missing/Damaged -> case/inspection/maintenance, **never** automatically Ready.

## Phase 5 — Calendar
- Enhance `/calendar` with Resource Timeline, Month/Week/Day, full focus view, filters, saved views and selected-event inspector.
- Use existing bookings, equipment/crew, returns, maintenance and holds; BS + AD dates, Sunday week start, 06:00 rental boundaries.
- Move/resize proposals require server validation, real availability/conflict and permission checks.

## Phase 6 — Membership
- Membership admin within Clients; Academy/Creator/Cinematographer/Production Alliance/Elite are plan concepts, **mock prices and benefits are not approved rates**.
- Enrollment, renewal, grace/lapse, approved discount precedence, booking limit, audit trail; credit approval separate from member benefits.
- Never use membership colors to compromise status or external-gear marking.

## Phase 7 — Client Portal (new scope beyond internal v1)
- Separate secure client app: home, active/past rentals, gear and extension requests, real invoice balance, payment proof, signed documents, notifications, Nepal localization and responsive phone layouts.
- Requests await staff approval; uploaded payment proof is **not** a confirmed payment; external gateway methods need verified integration, idempotent callbacks, reconciliation.
- Portal settings: scoped auth/OTP + rate limits, delegated company access, workflow permissions, document signing identity/evidence, controlled notifications and audit.
- Block any rollout pending tenant-isolation/RLS, Supabase user-data exposure scanner review, file isolation and payment security review.

## Required quality gates
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run check:contrast`, `npm run lint:shell`, plus relevant security tests. Run local database migration tests if schema changes are proposed; do not touch live Supabase, deploy or merge without review.

**Done =** real data + permissions + errors/loading/empty states + supported desktop/iPad/phone + tests + reviewed PR.
