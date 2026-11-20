# Live Migration Ledger Reconciliation (T1-03)

**Date:** 20 November 2026 (Nepal Time)  
**Card:** T1-03 · Settle the ledger before anything is applied  
**Branch:** `lane-a/T1-03-settle-the-ledger-before-anything-is`  
**Production Target (Read-Only):** `sxguwvgoserhdolewibb` (Postgres 17.6)  
**Staging Target:** `babin-staging` — `klhmsrunqrdxjudyhnkm` (Postgres 17.11)  
**Authoritative Snapshot:** [`docs/live/schema_migrations_2026-11-20.txt`](schema_migrations_2026-11-20.txt) (157 rows)  
**Status:** **RECONCILED & SETTLED — NO LIVE WRITES (Rule N-5)**

---

## 1. Executive Summary & Ledger Census

A full offline cross-reconciliation between the local migration repository (`supabase/migrations/*.sql`) and the verified read-only production migration history (`supabase_migrations.schema_migrations`) was performed.

| Metric | Count | Details |
|---|---:|---|
| **Local SQL Migration Files** | **251** | `0001_enums.sql` through `0253_temporary_stock_from_partners.sql` (after T2-24) |
| **Live Recorded History Entries** | **157** | 154 timestamped (through `20261107105159`), 3 non-timestamped (`V1`, `V2`, `V3`) |
| **Direct Name Matches** | **148** | Identical filename (sans `.sql`) present in both local source and live ledger |
| **Confirmed & Settled Renames** | **7** | Proved to be identical objects/migrations applied under different names/prefixes |
| **Unexplained Live-Only Rows** | **2** | `archive_bakery_pos_schema` and `0047_seed_tail_b917_equipment_line` (both preserved) |
| **Quarantined Seeds** | **1** | `0047_seed_reference_corpus.sql` (one-shot reference data; excluded from live apply) |
| **Duplicate Numeric Prefixes** | **1** | Legacy pair `0188_smart_reservation_holds` and `0188_staff_renting_gear` |
| **Live Applied Post-0156** | **2** | `0164` (applied 2026-10-15) and `0225` (glossary, applied 2026-11-07) |
| **Authoritative Pending Migrations** | **95** | Ready for batch application in sequential order starting at `0157` through `0253` |

---

## 2. Decision Log: The 7 Candidate Renames

Every candidate rename identified by `scripts/plan-migrations.mjs` was audited against its live database object definition, git commit history, and source migration header. **All 7 are confirmed to be the SAME migration, previously applied to live.**

| # | Local Repository File | Live Ledger Name | Live Version | Object Affected | Decision & Analysis |
|---|---|---|---|---|---|
| 1 | `0056_0_auth_role_falls_back_to_auth_uid.sql` | `0056_auth_role_falls_back_to_auth_uid` | `20260812160730` | `public.auth_user_role()` | **SAME MIGRATION, RENAMED.** Recovered on 16 Aug 2026 from live `schema_migrations.statements`. Renamed locally with `_0_` so directory sorting matches applied order before `0056_auth_role_resolves...`. Superseded 60s later by 0073. |
| 2 | `0059_users_self_read_accepts_auth_uid.sql` | `0057_users_self_read_accepts_auth_uid` | `20260812170827` | Policy `users_select_own` on `public.users` | **SAME MIGRATION, RENUMBERED.** Renumbered `0057` → `0059` on 15 Aug 2026 to resolve collision with `0057_damage_approval_rank.sql`. SQL body is identical; already applied on live. |
| 3 | `0060_staff_row_for_the_current_owner_identity.sql` | `0058_staff_row_for_babindulal7` | `20260812170856` | Staff row in `public.users` for owner | **SAME MIGRATION, RENUMBERED.** Renumbered `0058` → `0060` on 15 Aug 2026 to resolve collision with `0058_late_fee_rank...`. Renamed descriptive tail to generalize identity. SQL already applied live. |
| 4 | `0069_purchase_approval_owner_manager_only.sql` | `purchase_approval_owner_manager_only` | `20260824194129` | `public.auth_can_approve_purchase()` & RLS | **SAME MIGRATION, NUMBERED.** Applied to live 25 Aug 2026 under bare name without prefix. Prefix `0069_` added locally for sequential ordering. Verified present in live catalog. |
| 5 | `0073_auth_role_resolves_without_pre_request_hook.sql` | `0056_auth_role_resolves_without_pre_request_hook` | `20260812160830` | `public.auth_user_role()` (SECURITY DEFINER) | **SAME MIGRATION, RENUMBERED.** Applied 60s after first 0056. Adds `SECURITY DEFINER` to break cyclic RLS dependency. Renumbered locally to 0073 to maintain clean sequential order. |
| 6 | `0081_ruled_sequences_completion.sql` | `ruled_sequences_completion` | `20260815185424` | `public.number_sequences` rows | **SAME MIGRATION, NUMBERED.** Applied to live 13/15 Aug 2026 under bare name. Adds `M-`, `Q-`, `BND-` number sequences. Prefix `0081_` added locally for ordering. Verified in live catalog. |
| 7 | `0082_seed_operational_stage_corpus.sql` | `0076_seed_operational_stage_corpus` | `20260831141204` | Seed bookings B-900..B-945 | **SAME MIGRATION, RENUMBERED.** Applied to live 31 Aug 2026 under name `0076_seed_operational_stage_corpus`. Renumbered locally to 0082 when `0076_booking_line_units_release.sql` occupied prefix 0076. |

---

## 3. The 2 Unexplained Live Rows

Production `supabase_migrations.schema_migrations` contains two rows that have no direct filename match in `supabase/migrations/`:

1. **`archive_bakery_pos_schema` (Version `20260809220713`):**
   - **Origin:** Belongs to the pre-existing Miraz POS / Bakery POS project that predated the Babin Rentals OS migration baseline and shares the Supabase project `sxguwvgoserhdolewibb`.
   - **Resolution:** **PRESERVED INTACT.** Its tables reside in an isolated schema and do not collide with `public` rental tables. Per Law 3, it is never dropped, altered, or replayed.

2. **`0047_seed_tail_b917_equipment_line` (Version `20260812155050`):**
   - **Origin:** A one-off live seed applied directly to production on 12 August 2026 to populate equipment lines for booking B-917.
   - **Resolution:** **PRESERVED INTACT.** Its data is retained in production. It was never committed as a reusable repository migration and spent prefix `0047` on live.

---

## 4. Resolution of the 0047 Seed Hazard

- **File:** `0047_seed_reference_corpus.sql` (1.87 MB reference seed).
- **Hazard:** Flagged by planner as `[ONE-SHOT SEED]` and `[NUMBER COLLISION]`. Its header states: *"Apply it ONCE, into a database that has never held it... Re-applying is NOT a no-op — it is a one-shot seed that FAILS CLOSED"*.
- **Live State:** Production `sxguwvgoserhdolewibb` already contains real business data (clients, inventory, bookings, invoices). Furthermore, prefix `0047` was spent live on `0047_seed_tail_b917_equipment_line`.
- **Settlement Decision:** **PERMANENTLY QUARANTINED FROM PRODUCTION.** This file is excluded from the live apply plan. It must NEVER be applied to production. In staging, synthetic fixtures from `scripts/create-synthetic-staging-0012.mjs` and clean test seeds are used instead.

---

## 5. Duplicate Prefix 0188 Exception

- **Files:** `0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql`.
- **Analysis:** Both migrations are valid, independent, and verified in PGlite and the lifecycle test harness.
- **Ordering:** In the pending list, filename sort order ensures `0188_smart_reservation_holds.sql` (line 31) runs before `0188_staff_renting_gear.sql` (line 32). Supabase CLI orders by applied version, not prefix; this duplicate is preserved as an accepted historical exception.

---

## 6. Authoritative 94-Migration Live Apply Plan

Running `npm run db:plan` (configured with `--accept-rename` in `package.json`) produces **zero blockers** and the following exact sequential apply list (94 files):

```text
 1. 0157_audit_triggers_for_trigger_less_tables.sql
 2. 0158_settings_table.sql
 3. 0159_saved_views.sql
 4. 0160_pricing_structures.sql
 5. 0161_grant_booking_project_type.sql
 6. 0162_grant_non_money_columns.sql
 7. 0163_close_six_anon_business_rpcs.sql
 8. 0165_delivery_jobs_and_event_rpc.sql
 9. 0166_booking_transport_dispatch.sql
10. 0167_rental_revert_archive.sql
11. 0168_booking_line_totals_and_breakdown.sql
12. 0169_pin_intel_and_guard_search_paths.sql
13. 0170_astra_phase0_authorization.sql
14. 0171_operations_branch_grants.sql
15. 0172_reset_branch_write_boundary.sql
16. 0173_section_saves_and_unit_lifecycle.sql
17. 0174_change_client_membership.sql
18. 0176_partial_return_reservation_release.sql
19. 0177_verified_return_reservations.sql
20. 0178_quantity_only_reset.sql
21. 0179_gate1_override_by_handover_staff.sql
22. 0180_technician_floor_verbs.sql
23. 0181_collateral_deposit_id_card.sql
24. 0182_client_collectors_and_id_on_file.sql
25. 0183_reset_self_qc_when_alone.sql
26. 0184_repair_job_closes_damage.sql
27. 0185_team_notes.sql
28. 0186_shift_handovers.sql
29. 0187_delivery_dispatch_rpcs.sql
30. 0188_smart_reservation_holds.sql
31. 0188_staff_renting_gear.sql
32. 0189_delivery_zones.sql
33. 0190_one_time_rider_links.sql
34. 0191_delivery_reschedule_job.sql
35. 0192_notification_records.sql
36. 0193_invoice_write_hardening.sql
37. 0194_reset_damage_opens_case.sql
38. 0195_load_membership_plans.sql
39. 0196_membership_plans_admin.sql
40. 0197_membership_plan_change_credit.sql
41. 0198_renew_client_membership.sql
42. 0199_tds_on_crew_payouts.sql
43. 0200_draft_at_confirm_and_resync.sql
44. 0201_fix_collateral_masking_chars.sql
45. 0202_staff_discount_is_money_setting.sql
46. 0203_restore_driver_client_view_scopes.sql
47. 0204_rider_link_v2_contract_fix.sql
48. 0205_extend_booking_without_draft.sql
49. 0206_delivery_route_map_pins.sql
50. 0207_crew_overtime_half_full_day.sql
51. 0208_staff_pin_four_digits.sql
52. 0209_calendar_feed_tokens.sql
53. 0210_problem_reports.sql
54. 0211_delivery_proof.sql
55. 0212_cancellation_fee_tiers.sql
56. 0213_non_vat_bills.sql
57. 0214_opening_balances.sql
58. 0215_email_sending_and_log.sql
59. 0216_morning_digest_schedule_and_query.sql
60. 0217_notification_preferences.sql
61. 0218_client_message_events.sql
62. 0219_payment_reminders.sql
63. 0220_push_subscriptions.sql
64. 0221_guard_unit_identity_edits.sql
65. 0222_repair_confirm_booking_atomic_and_reservation_dedup.sql
66. 0223_product_aliases.sql
67. 0224_offer_campaigns_and_recipients.sql
68. 0226_bulk_update_products.sql
69. 0227_message_templates.sql
70. 0228_membership_change_keep_join_date.sql
71. 0229_booking_tags.sql
72. 0230_project_name_and_shoot_location.sql
73. 0231_pro_forma_document_type.sql
74. 0232_secure_temporary_hold_rpcs.sql
75. 0233_extend_booking_and_resync_auth.sql
76. 0234_return_damage_photo_per_unit.sql
77. 0235_delivery_route_branch_hardening.sql
78. 0236_opening_balances_append_only.sql
79. 0237_planned_equipment_downtime.sql
80. 0238_rental_day_start_setting.sql
81. 0239_consumables_pricing_restock_and_low_stock.sql
82. 0240_time_between_rentals.sql
83. 0241_extension_clash_manager_decision_and_at_risk.sql
84. 0242_return_damage_signature_and_refusal.sql
85. 0243_change_confirmed_booking.sql
86. 0244_counter_sale.sql
87. 0245_delivery_zone_vehicle_fee_grid.sql
88. 0246_dispatch_zone_fee_from_grid.sql
89. 0247_retire_per_zone_fee_on_create.sql
90. 0248_delivery_zone_distance_band.sql
91. 0249_late_night_delivery_is_money_setting.sql
92. 0250_outsourced_vehicle_quote.sql
93. 0251_waiting_charge_line.sql
94. 0252_allow_overbooking_on_chosen_products.sql
95. 0253_temporary_stock_from_partners.sql
```

*(Note: `0164` and `0225` are already applied on live and properly omitted from the pending plan).*

---

## 7. Verification Proof

- **`npm run db:plan`:** Exit code 0, 0 blockers, 95 files in apply order.
- **`npm run db:plan:selftest`:** Exit code 0, 12/12 checks passed.
- **`npm run typecheck`:** Exit code 0.
- **`npm run lint`:** Exit code 0.
- **Rule N-5 compliance:** Zero remote writes to `sxguwvgoserhdolewibb` or `klhmsrunqrdxjudyhnkm`.
