# ASTRA Fix Roadmap

Audit date: 18–19 October 2026 (Asia/Katmandu). Repository: https://github.com/babindulal7/babin-rentals-os. Baseline: latest accessible main, ad8ce1e4afc54cc88df841425d0e281bd15665bc, fetched 18 October and rechecked 19 October. All file references are relative to that immutable revision.

Audit only: no application fixes, merge, deployment, production database access or production mutations. Local SQL probes used disposable PGlite fixtures. Browser used a separate mock preview at 127.0.0.1:3026.

This is a proposed implementation order, not authorization to make fixes. Estimates are relative engineering complexity, not delivery promises: S=localized change; M=several cooperating layers; L=domain/data migration or wide regression surface.

| Phase | Priority and dependencies | Complexity / risk | Required evidence before exit |
|---|---|---|---|
|0 — security/integrity|SEC-01–05: storage ownership, helper RPC access, authenticated audit forgery, staff role ceiling, driver scope. REL-01/02: identity-bound queue and confirmed replay.|L / high; preserve trusted definer calls and pending work, no destructive queue purge|All nine roles, own/foreign/branch/inactive identities; real staging JWT+Storage; negative direct SQL/API tests; immutable receipt assertions; offline two-identity replay|
|1 — rental/finance|WF-01–05 and WF-08: remove financial/report fabrication, correct source columns and money units, use actual stages. UI-02/03: shift/cash and warranty claims must be durable or explicitly unavailable.|L / high; clarify metric attribution, do not invent ROI or staffing rules|Empty/error/mixed real datasets, void/credit/reversal/VAT/discount/deposit checks, row-cap tests; reconcile exported totals with SQL; 31-step lifecycle remains green|
|2 — functional correctness|WF-06 availability pagination, WF-07 operational day anchor, UI-01 production persistence, notes synchronization; UI-06 single duration meaning; investigate audit drawer classification.|M–L / medium-high; schema and business-scope decisions precede new production model|06:00 boundaries, cap+1 holds, all status combinations, cross-device persistence and approved lifecycle semantics|
|3 — UI/responsive|UI-04 modal lock, UI-05 single finance action region, Today date-control wrapping; repeat comparable action layout across existing modules.|M / medium; target shared components before per-page patches|375/430/768/820/1024/1440/1920, both themes, keyboard/focus, nested pickers, populated tables, no clipped primary action; screenshot comparison|
|4 — performance/architecture|PERF-01 measure entry/scanner cost, paginate scoped data reads, audit25-second sync polling/error receipt; consolidate duplicate report transformation contracts.|M / medium; optimize only measured bottlenecks|Production-build cold-start/route profiles on low-end phone and iPad; concurrent reads/writes; no regression in offline fonts/shell|
|5 — regression/release|QA-01 fix failing contracts/fixtures without weakening invariants. QA-02 provenance-aware completion ledger. Expand role/RPC, mock-vs-live and report-zero/error tests.|M / high release significance|All CI commands green at same SHA; coverage generated; real multi-connection race; restore drill; staging nine-role acceptance; owner-approved backup/cutover; independent production verification|

## Immediate implementation packages after approval

1. Security patch series with one isolated regression per bypass, local migration rebuild and lifecycle gate.
2. Report-data contract cleanup with real-schema integration fixtures and exact paisa expectations.
3. Shared modal and Finance action layout; no redesign should hide failed persistence.
4. Durable operational side modules plus explicit product rulings for undefined data models.
5. Full browser/device acceptance and deployment readiness.

Do not patch live directly or run a remote reset. Keep pending local work intact. A green build is necessary but not sufficient. A production release remains on hold until exposed data paths, invented financial reports, failed gates and unverified staging behavior are resolved.
