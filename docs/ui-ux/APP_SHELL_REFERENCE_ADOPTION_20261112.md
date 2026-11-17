# Babin Rentals OS — uploaded app-shell reference adoption

**Reference:** owner-provided React/Tailwind prototype, `Babinrentalsappshell.txt` (12 November 2026, ~1,786 lines).  
**Scope:** visual implementation into the existing React/Vite application, without copying the demonstration's domain state.  
**Implementation PR:** #150 (subject to assigned PR number).  
**Release:** UI feature PR only. **No merge or deployment until exact-head CI, visual and security review.**

## Visual contract

| Reference element | Production implementation | Follow-up |
| --- | --- | --- |
| Cinematic navy `#050B12` canvas, `#0B1622` cards and `#081522` recesses | Scoped `referenceShell.css` token overrides under authenticated app shell (dark) | Verify contrast and screenshots on real devices |
| Blue BR monogram, subtitle and ~240px rail | Sidebar brand tile, Kathmandu subtitle; existing shared rail width and collapse control retained | Check collapsed iPad icon rail |
| Compact header, global search, add, role context | Reuses actual `Header`, `GlobalAddMenu`, `CommandPalette`; does not make a second header | Verify narrow desktop, 200% zoom |
| 4-card KPI bento | Real selected-period Pickup/Return totals plus **loaded** packing/overdue counts (not fabricated revenue) | Investigate real booking conflict counts in future task |
| Central queue + contextual inspector | Existing two query-backed movement panels plus genuine first-action inspector | Add selected-booking linkage and serial checklist from trusted operations service |
| iPad landscape split / portrait compact rail | 5:7 workbench grid for tablet; existing responsive sidebar/hit targets | Inspect physical iPad modes |
| Phone vertical thumb action & queue | Collapsible action summary before existing segmented queue, native five-slot bottom nav unchanged | Consider real accessible bottom sheet after usability testing |
| Phone horizontal scanner + evidence | Existing operational scanner surfaces retained | Future dedicated landscape field-workbench redesign |
| Light/dark toggle | Existing persisted `ThemeProvider` and current first-use theme retained; dark is closest to reference | Owner to approve changing first-use default to dark |
| 13-stage prototype timeline | **NOT copied**: real backend workflow, gates and booking-vs-asset state remain authoritative | Dedicated lifecycle UX PR after schema and stage-gate review |
| Prototype sample revenue / PR counts | **NOT copied**; production views never claim sample values | Connect exact-head CI status only through trusted GitHub service |
| Example staff PINs / automatic PIN fill / role selector | **NOT copied**; real `useAuth` + server RLS continue to govern roles | Security draft PR #147 is a separate dependency |
| Simulated conflict resolution via clicking a button | **NOT copied**; booking availability and server validation remain authoritative | Prioritize actual conflict modal integration in operations |

## Implementation evidence

- `src/components/shell/referenceShell.css`: scoped palette, sidebar navigation, typography and inspector/card layout; desktop, tablet, phone breakpoints.
- `src/components/shell/Sidebar.tsx`: functional existing navigation with visual logo tile and read-only staff context.
- `src/App.tsx`: opts the authenticated shell into the scoped style without altering routing or permissions.
- `src/modules/today/Today.tsx`: no demo data; real RLS-filtered movement query rows and existing `dashboardAction` and `openOperations` actions.
- `src/components/shell/__tests__/referenceShell.test.ts`: protects scope and real routing/data source contracts.

## Gates before accepting

- [ ] CI: TypeScript, lint, mock tests, migrations and app build on this PR's exact head.
- [ ] Manual at 1440 desktop, 1024×768 and 768×1024 tablet, 390×844 and 844×390 phone; no overflow/hidden controls.
- [ ] Verify Warehouse/Technician/Driver/Client never receive money surfaces or cached Owner financial rows.
- [ ] Keyboard, focus, screen-reader and reduced-motion checks; all critical actions have 44px touch targets.
- [ ] Light, dark and existing user-theme persistence.
- [ ] Validate that right inspector actions go through the unchanged operations stage gates.
- [ ] Confirm no prototype PIN, fictitious inventory, hardcoded business KPIs, client sample, 13-step state transitions or automatic mutation logic entered the app.

This is **phase one** of visual adoption, not a claim that every module perfectly matches the prototype. Follow-up modules include Rentals, Operations, the selected-booking inspector, evidence capture and production-validated conflict workflows.
