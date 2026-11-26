# Partner stock migration numbering

25 Nov 2026 — read-only catalog and migration ledger checks on the existing staging and production projects returned no 0270, 0271 or 0272 ledger entry, no named partner-stock or payment-allocation migration, and no partner_stock_read_v view. Staging already has the three timestamped backend stabilization migrations; production did not list them. This does not establish the full ledger is reconciled.

Rename the existing unapplied partner-stock source file to 0272 to avoid the payment security migration's 0271 prefix. SQL blob is unchanged. Retain pinned-source drift guard. Re-run exact-head CI and positive/negative authenticated disposable PostgREST tests; inspect role scope and Law 6 mask. No hosted SQL writes or migration replay. Recheck hosted migration ledger and schema before any future application.

Integration note: exact #415 head 79ac2d23 also hardens the legacy temporary_stock_v projection. Its CI run 45554405294 passed. Combined source inventory is 273 migrations with thirteen explicit additions relative to the unchanged 260-file pinned snapshot. Hosted application remains blocked. Independent disposable authenticated permission probes remain required.
