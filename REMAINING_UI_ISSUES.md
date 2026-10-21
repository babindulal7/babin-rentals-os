# Remaining UI issues

21 October 2026 NPT. Local design recovery acceptance has the following limits; it is not a hosted/device release approval.

- Follow-up current-source verification is in progress under `docs/verification/premium-design/reverify-20261021-2327`; the earlier `docs/verification/premium-design/verification.json` is historical for the newer checkout. New failures, interrupted attempts and final results are recorded separately.
- Physical iPad, scanner, hosted/JWT verification are outside a local mock browser run.
- The external concept image and full uploaded Add Equipment v3.0 document are not attached here; supplied rules and current seven-section editor are the available authority.
- Equipment draft persistence, attachment storage and relationship backend wiring are separate tasks. No working Save Draft action is introduced.
- Actual browser-chrome 125% zoom is not driven by the headless runner. Its 125% captures use effective viewport width/device-scale emulation. Physical iPad portrait/landscape, scanner and screen-reader acceptance remain separate.
- The initial high-contrast before captures used `data-theme="hc"`, which is not an app theme. They must not be presented as a valid high-contrast before baseline. Final after captures and selector contrast checks use `high-contrast`.
- Warehouse's direct shared equipment-editor route is currently restricted by `rolesFor`; the browser money test verifies that denial and no figures, rather than pretending the full editor opened. Do not widen it during a visual pass. Technician/Driver have no built-in mock sign-in; automated role/RLS tests cover them, not browser impersonation.
- This pass consolidates shared presentation and the identified defects. It does not certify every historical one-off style or every workflow state in the entire repository. Long tables retain internal scrolling where all columns cannot fit; the acceptance check is no horizontal page overflow.
- Local files continue to receive other-session edits and automatic sync commits. Command receipts include source hashes; no earlier green run silently certifies a later file change.
