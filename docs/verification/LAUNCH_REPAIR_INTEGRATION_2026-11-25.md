# Launch repair integration — 25 Nov 2026

Draft integration only; no hosted migration, deployment, or merge authorized.

- Main baseline: ccfc7bd8926c10fd9db589b35d1564cb71e6d474
- Payment containment #412: 0198b419efcd830fa7e10e3ce8d453466e384189 — full Mac CI and isolated site builds passed individually.
- Sign-in/backend/browser guard #409/#411/#410: f6d58d9e70620ea3d9bb696e102695d45939996e — upstream Mac CI and both cloud smoke/auth workflows passed individually. #409 hosted preview failed at Wrangler preview configuration, not Vite build.
- Keep payment branch's inventory expectation: 272 files, 12 named drifts, original pinned 260-file snapshot still immutable and BLOCKED_SOURCE_DRIFT.
- Integrated exact-head tests are not yet verified. CI on this draft plus disposable cloud auth and staging read-only smoke are required. No staged hosted migrations implied.
- #413, #414, #415 and #416 remain independent until exact-head verification; #415 uses duplicate migration prefix 0271 and must be reconciled before integration (candidate 0272 for its unapplied partner-stock migration; verify ledger first). Avoid conflicting concurrent edits.
- Payment checkout remains deliberately disabled in hosted mode; actual verified gateway integration is separate. Do not distribute payment links while on hold. Do not merge until hosted migration ledger and production-safe release decision have been independently reviewed.
- All physical device and real business workflow/persistence acceptance remain required.

## Integration update

- Booking recovery #413 (`32f7b35c53f9efe7d7174925a949e3cd4483a214`) passed full Mac CI run 45528432901. Integrated its two non-overlapping hook/test changes. Combined exact-head verification is required again; prior integration receipts do not certify this revision.
