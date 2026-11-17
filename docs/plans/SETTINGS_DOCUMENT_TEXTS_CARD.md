# Build card — Document texts in Settings (agreement terms, contracts, other texts)

**Status:** not started. Source ruling: `RULINGS-2026-11-18.md` R-18.7 (Babin, 18 Nov 2026).
**Migration:** none claimed yet. Claim the next free number in `docs/plans/MIGRATION_LEDGER.md` before any SQL is written (N-5: write and test locally, do not apply).

## Goal

Babin pastes or uploads the rental agreement terms, contracts and other document texts in **Settings**, instead of sending them in a message. The printed and PDF documents use the stored text. Today the agreement wording is built into the PDF code (`src/lib/pdf/generatePdf.ts`).

## Open questions (do not decide; ask Babin, record in `docs/OPEN_DECISIONS.md`)

1. **Who may edit?** ⭐ Owner only, like the glossary (O-22), until Babin says otherwise.
2. **Which documents take text?** ⭐ Rental agreement terms (O-11) first. Others are added one at a time.
3. **Upload file types.** ⭐ Plain text and pasted text only for the first slice. PDF or Word upload is a later slice.
4. **Does an edit change documents already issued?** ⭐ No. An issued document keeps the text it was issued with; a change applies to documents made after it.

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
| D1 | Append-only `document_texts` table, one save RPC, read function; Owner only | `check:pglite` and `check:lifecycle` green |
| D2 | Settings screen: paste text, save, see version history | driven in the app by the Owner; refused for other roles |
| D3 | PDF generation reads the current text for the rental agreement, falling back to the built-in wording | unit test, plus a printed document checked in the browser |

## Done means

Both R-29 gates green in the same run; the Owner pastes the agreement terms in Settings and the next printed agreement carries them; a non-Owner is refused by the database.
