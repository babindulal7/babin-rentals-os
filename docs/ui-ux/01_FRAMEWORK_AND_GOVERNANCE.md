# UI/UX framework and decision protocol

## The two disciplines and four practical specialisms

- **UX — user research:** real staff roles, timing, mistakes, constraints and observed tap costs.
- **UX — information architecture:** routes, navigation, grouping, cross-links, discoverability and terminology.
- **UX — interaction design:** steps, affordances, dispatch confirmations, prevented errors and recoveries.
- **UI — visual and system design:** tokens, legibility, density, status semantics, interaction feedback and reusable components.

## The five UX layers (strategy → surface)

| Layer | Required answer | Babin OS deliverable |
| --- | --- | --- |
| Strategy | Why does this work matter? | A real staff problem, business risk, measurable result |
| Scope | Who is allowed to do what? | Capability and role matrix, non-goals, data and edge cases |
| Structure | How do tasks and information connect? | Route map, transitions, success/failure/retry and history paths |
| Skeleton | Where do actions and information live? | Low-fidelity desktop, tablet and mobile layouts, tap budget |
| Surface | What does it look and feel like? | Theme tokens, typography, status icons/labels, high-fidelity prototype |

Do not start with surface styling while scope/structure remain disputed.

## Six-step iterative workflow

1. **Define scope and role requirements:** select one job; verify rules in AGENTS, PERMISSIONS, rulings and source; state exclusions.
2. **Map flows and IA:** intent to server-confirmed success, failure, empty state, offline, cancellation, damaged/missing, overlap, role denial.
3. **Low-fidelity wireframe:** title, context, one primary verb, secondary actions, search/filter, work area, return route and summary.
4. **Design system:** reuse approved CSS variables, fonts, components, status meanings, responsive modes and keyboard controls.
5. **High-fidelity & prototype:** wire to **existing** React engines/actions rather than a parallel mock state machine; expose all states.
6. **Usability & developer handoff:** screen check, staff observation, safe tests, idempotency/persistence, real devices and PR review.

Testing starts during wireframes and continues through each step. A good-looking standalone HTML file is a concept, not evidence that React, data or RLS works.

## Non-negotiable design/engineering laws

- **Fewest avoidable taps** beats flourish; explicit tap budgets; prefill only safe, grounded defaults.
- **One filled primary action per visible action surface**; no duplicate header/footer/rail action ownership.
- **Pages do not implement business logic.** Existing engines, actions and Postgres gates decide transitions.
- **No fake success:** server-acknowledged writes only; inline errors and persistent blockers; success-only toast.
- **Permission boundaries:** server-side RLS and actions, and money-sensitive elements absent from the DOM for Warehouse, Technician, Driver and Client.
- **Serialized stock / counts / commitments:** keep booking stage, operation job state, item/custody state, reservations and condition independent.
- **Do not add BookingStatus values** for packing-in-progress, testing bay, overdue, partial return, inspection or cleaning without an explicit higher ruling and migration review.
- **Use local Kathmandu business time** and the approved 06:00 operational day; AD persisted / BS displayed; never reimplement money or pricing.
- **Words:** Client, Rental, Equipment, Unit. Don't silently reintroduce retired vocabulary.
- **Physical safeguards:** 44px targets, floor main verbs 56px, status text+icon+color, accessible dialogs, dirty-form guard.
- **No changes to live Supabase**, no merges or deploys from a design exercise.

## Planning truth versus implementation truth

This is a **design backlog**, not proof of missing features or exact completion. Use PR status, current main and tests for each ticket. Do not infer "Done" from a source file existing or a previous screenshot. The release remains subject to CURRENT_STATE and release HOLD until the governed gates are completed.

## Decision capture

A new business choice (e.g. whether pending routine cleaning should prohibit **future reservations**, which accessories require separate inventory, or whether a testing bay needs an audited custody event) is a **TODO(decision)**, not a permission to change enums/RLS. Register via active owner-decision process in docs/OPEN_DECISIONS.md and PLAN §4.2 in a separate coordinated PR. Avoid editing those shared files from this documentation-only branch.
