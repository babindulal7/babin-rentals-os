# Remaining UI issues

21 October 2026 NPT. Local design recovery acceptance has the following limits; it is not a hosted/device release approval.

- Current-source verification evidence is under `docs/verification/premium-design/current-20261023-0225`. The verified 22 October snapshot is documented at `docs/verification/premium-design/reverify-20261021-2327/REVERIFICATION.md`; it does not certify the newer checkout.
- Physical iPad, scanner, hosted/JWT verification are outside a local mock browser run.
- The external concept image and full uploaded Add Equipment v3.0 document are not attached here; supplied rules and current seven-section editor are the available authority.
- Equipment draft persistence, attachment storage and relationship backend wiring are separate tasks. No working Save Draft action is introduced.
- Actual browser-chrome 125% zoom is not driven by the headless runner. Its 125% captures use effective viewport width/device-scale emulation. Physical iPad portrait/landscape, scanner and screen-reader acceptance remain separate.
- The initial high-contrast before captures used `data-theme="hc"`, which is not an app theme. They must not be presented as a valid high-contrast before baseline. Final after captures and selector contrast checks use `high-contrast`.
- Warehouse's direct shared equipment-editor route is currently restricted by `rolesFor`; the browser money test verifies that denial and no figures, rather than pretending the full editor opened. Do not widen it during a visual pass. Technician/Driver have no built-in mock sign-in; automated role/RLS tests cover them, not browser impersonation.
- This pass consolidates shared presentation and the identified defects. It does not certify every historical one-off style or every workflow state in the entire repository. Long tables retain internal scrolling where all columns cannot fit; the acceptance check is no horizontal page overflow.
- Local files continue to receive other-session edits and automatic sync commits. Command receipts include source hashes; no earlier green run silently certifies a later file change.

- Typography authority is now Babin’s explicit 23 October all-Outfit choice (RULINGS-2026-10-23.md). Unsupported-glyph fallback and actual offline Nepali rendering still require device verification.

- **Competing five-stage equipment navigation:** newer local editor renders a mode toggle in addition to seven anchors. This conflicts with the supplied recovery brief; a specific governing-preference question is pending. No compliance pass is claimed.
- **Current full suite:** original current run passed 5271/5272 with one 90-second timeout; 14/14 in that file passed on retry. Source changed during both, so a whole matching-source green result remains unproven.

- Final local command batch exited zero (including typecheck, lint, local DB gates, contrast and build); 156 capture geometries and 63 browser checks pass. This is still **partial acceptance**, because the complete matching-source suite and equipment navigation reconciliation remain open. The source-change flags and initial timeout are retained.
- New equipment catalogue/barcode dialogs retain their existing presentation implementation; a complete assistive-technology/focus-trap assessment of those newer dialogs has not been performed.

- **Thumbnail upload controls:** the newer editor uses a local object-URL preview; attachment storage remains a separate backend task. Persistence and the current upload/success wording have not been accepted as a stored-photo feature. Do not certify attachments from a preview.
