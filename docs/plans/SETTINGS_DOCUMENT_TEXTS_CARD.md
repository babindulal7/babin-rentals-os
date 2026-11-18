# Build card — Document texts in Settings (agreement terms, contracts, other texts)

**Status:** not started. Source ruling: `RULINGS-2026-11-18.md` R-18.7 (Babin, 18 Nov 2026).
**Migration:** none claimed yet. Claim the next free number in `docs/plans/MIGRATION_LEDGER.md` before any SQL is written (N-5: write and test locally, do not apply).

## Goal

Babin pastes or uploads the rental agreement terms, contracts and other document texts in **Settings**, instead of sending them in a message. The printed and PDF documents use the stored text. Today the agreement wording is built into the PDF code (`src/lib/pdf/generatePdf.ts`).

## Open questions (do not decide; ask Babin, record in `docs/OPEN_DECISIONS.md`)

1. ~~Who may edit?~~ **Ruled 19 Nov (R-18.9): Owner and Admin.** This is a new capability. Edit `PERMISSIONS.md` §3/§4 and the T-1 fixture in the same commit as the code (B-3); the database policy and `rbac.ts` must match (N-3).
2. **Which documents take text?** ⭐ Rental agreement terms (O-11) first. Others are added one at a time.
3. **Upload file types.** ⭐ Plain text and pasted text only for the first slice. PDF or Word upload is a later slice.
4. ~~Does an edit change documents already issued?~~ **Ruled 19 Nov (R-18.10): no.** An issued document keeps the text it was issued with; a change applies to documents made after it.

## Rules that constrain the build

- **Nothing is deleted.** Every edit is a new version row (append-only); older versions stay readable.
- **Every write carries a `client_uuid`.**
- **Pages never implement business logic.** Which text applies to a document is decided by an engine or function, not the page.
- **Errors inline, toasts for success only.**
- **Fewest taps (R-39).** Paste, save: no extra confirm step except for a destructive-looking change.
- **Revert:** stop reading the stored text and fall back to the built-in wording; no existing document changes.

## Proposed slices

| Slice | What | Gate |
|---|---|---|
| D1 | Append-only `document_texts` table, one save RPC, read function; Owner and Admin (R-18.9) | `check:pglite` and `check:lifecycle` green |
| D2 | Settings screen: paste text, save, see version history | driven in the app by the Owner and by an Admin; refused for other roles |
| D3 | PDF generation reads the current text for the rental agreement, falling back to the built-in wording | unit test, plus a printed document checked in the browser |

## Done means

Both R-29 gates green in the same run; the Owner or an Admin pastes the agreement terms in Settings and the next printed agreement carries them; an older issued agreement still shows its old text; any other role is refused by the database.
