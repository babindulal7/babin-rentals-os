# Copy-paste design/implementation task card

## UX-XXX — [one task verb and problem]

- **Planning source:** docs/ui-ux/[section].
- **Active track/card:** docs/plans/T[?]_[?].md, or owner-approved task if no track exists.
- **User task & why:** [one real daily operation, observed pain and business risk].
- **Owner / agent lane / isolated branch:** [existing PLAN lane; worktree; no collision].
- **Priority:** [proposed P0/P1/P2, distinguish UX importance from verified defect severity].
- **Design layers:** Strategy / Scope / Structure / Skeleton / Surface (record each).
- **UI element IDs:** [from 04 list; reuse existing shared components].
- **Journey IDs:** [from 05 list; one primary flow plus exception paths].
- **Role/capability/branch:** [PERMISSIONS source, executable rbac, action, DB RLS].
- **Authoritative state/gates:** [booking, job, item, availability, payments, condition].
- **Source paths inspected:** [actual main SHA, components/actions/queries/tests].
- **PR/issue overlap:** [checked date, affected files, existing PR numbers].
- **Behavior design:** [input, outputs, one primary action, back/retry, dirty guard].
- **State design:** [loading, empty, filtered-empty, stale, error, offline, saving, success, restricted].
- **Wireframes:** [375/820/1440 plus actual iPad orientation, desktop and phone].
- **Visual tokens:** [existing theme variables; no invented status color].
- **Accessibility:** [44/56px, focus, screen reader, IME, motion, contrast].
- **Dependencies & pending owner decisions:** [do not invent default].
- **Explicitly out of scope:** [business rule, migration, merge, live Supabase, deployment, if unchanged].
- **Persistence proof:** [server success, re-read, idempotent retry, concurrency].
- **Acceptance tests:** [Given/When/Then by stage, role, conflict and device].
- **Test evidence:** [commands, exit codes, exact SHA, screenshots and DB receipts].
- **Status:** Not audited / Existing-needs-proof / In PR / Verified local / Verified staging/device / Merged.
- **Revert:** [minimal and safe undo].

### Acceptance skeleton

- Given [permitted role + branch + valid fixture], when [specific action], then [server-confirmed result with correct stage/unit and no fake success].
- Given [restricted or money-blind role], when [visiting same URL or forcing request], then [control/financials absent + backend denies].
- Given [stale/duplicate/offline read], when [action attempted], then [in-place refusal, draft retained, no false success].
- Given [phone/tablet/desktop + keyboard], when [same task], then [one obvious primary, focus preserved, no clipped content].
- Given [concurrent return/booking/availability], when [records change], then [transactional conflict or correct partial accounting].

### Safe handoff

1. Recheck **main and in-flight PRs** immediately before modifying shared code.
2. Read governance first and pick the appropriate existing T-track.
3. Keep UI code/pure presentation separate from DB rule changes.
4. Run local required gates; never claim they ran when not executed.
5. Submit focused PR and attach source-level, browser, device and backend evidence.
6. Babin reviews and merges under existing process; production remains governed by release HOLD.
