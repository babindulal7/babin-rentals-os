# T1-03 · Production Migration Ledger Reconciliation

**Date:** 21 November 2026 (Nepal Time)  
**Author:** Windows Antigravity (Implementation Lead)  
**Target Card:** `T1-03 · Settle the ledger before anything is applied` (`docs/plans/T1_RELEASE.md`)  
**Status:** **RECONCILED — NO BLOCKERS** (`node scripts/plan-migrations.mjs --accept-rename`)  
**Production Project:** `sxguwvgoserhdolewibb` (read-only snapshot reference)  
**Live Snapshot:** `docs/live/schema_migrations_2026-10-17.txt`  

---

## 1. Executive Summary

Card `T1-03` requires settling the schema migration ledger between production (`supabase_migrations.schema_migrations`) and the repository migration source files before any production batch application can occur. Because Supabase keys migrations strictly on **filename** (name without `.sql`), any file that was renamed or renumbered appears unapplied to the CLI, posing a severe risk of re-applying already-executed DDL or staff seeding against production.

With the execution and verification of `node scripts/plan-migrations.mjs --accept-rename`, all 7 historical renames, 2 unexplained production rows, and 2 seed hazards are formally classified, reconciled, and quarantined.

The plan outputs an authoritative, numbered sequence of **96 pending migrations** from `0157_audit_triggers_for_trigger_less_tables.sql` through `0253_temporary_stock_from_partners.sql` with **0 blockers**.

---

## 2. The 7 Renamed Migrations (Confirmed Applied on Live)

Each of the following 7 repository files was compared against live database definitions and historical exports:

| Repository File | Live Migration Name | Live Version | Decision & Verification |
|---|---|---|---|
| `0056_0_auth_role_falls_back_to_auth_uid.sql` | `0056_auth_role_falls_back_to_auth_uid` | `20260812160730` | **Same migration, renamed.** Renamed locally to `0056_0_` to disambiguate from `0056_auth_role_resolves_without_pre_request_hook`. Body is identical in function definition. |
| `0059_users_self_read_accepts_auth_uid.sql` | `0057_users_self_read_accepts_auth_uid` | `20260812170827` | **Same migration, renumbered.** Renumbered locally from 0057 to 0059 during migration ordering cleanup. Applied on live. |
| `0060_staff_row_for_the_current_owner_identity.sql` | `0058_staff_row_for_babindulal7` | `20260812170856` | **Same migration, renamed.** Generalized from hardcoded identity to owner fallback. Live already carries the initial owner record. |
| `0069_purchase_approval_owner_manager_only.sql` | `purchase_approval_owner_manager_only` | `20260824194129` | **Same migration, numbered.** Applied unnumbered on live during rapid fix; prefixed with `0069_` in repo for canonical sorting. |
| `0073_auth_role_resolves_without_pre_request_hook.sql` | `0056_auth_role_resolves_without_pre_request_hook` | `20260812160830` | **Same migration, renumbered.** Renumbered from 0056 to 0073 to resolve duplicate 0056 prefix collision. Applied on live. |
| `0081_ruled_sequences_completion.sql` | `ruled_sequences_completion` | `20260815185424` | **Same migration, numbered.** Applied unnumbered on live; prefixed with `0081_` in repo for canonical sorting. |
| `0082_seed_operational_stage_corpus.sql` | `0076_seed_operational_stage_corpus` | `20260831141204` | **Same migration, renumbered / quarantined.** Renumbered from 0076 to 0082. Live already executed the operational staging corpus under 0076. |

---

## 3. The 2 Unexplained Production Rows

Production carries two recorded rows in `supabase_migrations.schema_migrations` that do not exist as exact matching local filenames:

1. **`archive_bakery_pos_schema` (version `20260809220713`):**
   - **Origin:** Belongs to the co-hosted Miraz Bakery POS project which historically shared this Supabase project.
   - **Resolution:** Out of scope for Babin Rentals OS. Safely preserved in database metadata; no tables or types collide with Babin Rentals OS schema.
2. **`0047_seed_tail_b917_equipment_line` (version `20260812155050`):**
   - **Origin:** Early manual seed on production populating tail equipment lines for unit B917.
   - **Resolution:** Acknowledged. Repository file `0047_seed_reference_corpus.sql` reused prefix `0047` locally, creating a prefix collision.

---

## 4. Hazard Classification & Quarantine

1. **`0047_seed_reference_corpus.sql`:**
   - **Hazard Kind:** `ONE-SHOT SEED` and `NUMBER COLLISION`.
   - **Detail:** Inserts reference / demo corpus that fails closed if replayed. Live already holds genuine operational data and already executed `0047_seed_tail_b917_equipment_line`.
   - **Resolution:** **Quarantined** per Owner Ruling B56. Excluded from batch apply plan.

---

## 5. Duplicate Prefix Handling

- **Prefix `0188`:**
  - `0188_smart_reservation_holds`
  - `0188_staff_renting_gear`
  - **Resolution:** Supabase CLI orders execution by timestamp `version`, but file ordering in this repository (`supabase/migrations/`) defines the canonical apply sequence. `0188_smart_reservation_holds` executes before `0188_staff_renting_gear` (later re-audited under Track T8).

---

## 6. Authoritative Apply Plan (96 Pending Files)

Executed via:
```bash
node scripts/plan-migrations.mjs --accept-rename
```

Output: **96 migrations in exact sequential order** from `0157_audit_triggers_for_trigger_less_tables.sql` to `0253_temporary_stock_from_partners.sql`:

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
   20. 0178_closeout_residual_views.sql
   21. 0179_fix_portal_claim_anon_execute.sql
   22. 0180_fix_staff_directory_view_security.sql
   23. 0181_repair_booking_draft_invoice_resync.sql
   24. 0182_vehicle_expense_security.sql
   25. 0183_allow_driver_handover.sql
   26. 0184_cancellation_fee_tier_selector.sql
   27. 0185_payment_correction_reversal.sql
   28. 0186_audit_log_triggers_expansion.sql
   29. 0187_booking_collateral_tracking.sql
   30. 0188_smart_reservation_holds.sql
   31. 0188_staff_renting_gear.sql
   32. 0189_client_document_acknowledgment.sql
   33. 0190_payment_allocation_engine.sql
   34. 0191_extend_booking_with_draft_resync.sql
   35. 0192_delivery_proof_capture.sql
   36. 0193_warehouse_damage_report_rpc.sql
   37. 0194_return_damage_opens_case.sql
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
   68. 0225_owner_approved_glossary_revisions.sql
   69. 0226_bulk_update_products.sql
   70. 0227_message_templates.sql
   71. 0228_membership_change_keep_join_date.sql
   72. 0229_booking_tags.sql
   73. 0230_project_name_and_shoot_location.sql
   74. 0231_pro_forma_document_type.sql
   75. 0232_secure_temporary_hold_rpcs.sql
   76. 0233_extend_booking_and_resync_auth.sql
   77. 0234_return_damage_photo_per_unit.sql
   78. 0235_delivery_route_branch_hardening.sql
   79. 0236_opening_balances_append_only.sql
   80. 0237_planned_equipment_downtime.sql
   81. 0238_rental_day_start_setting.sql
   82. 0239_consumables_pricing_restock_and_low_stock.sql
   83. 0240_time_between_rentals.sql
   84. 0241_extension_clash_manager_decision_and_at_risk.sql
   85. 0242_return_damage_signature_and_refusal.sql
   86. 0243_change_confirmed_booking.sql
   87. 0244_counter_sale.sql
   88. 0245_delivery_zone_vehicle_fee_grid.sql
   89. 0246_dispatch_zone_fee_from_grid.sql
   90. 0247_retire_per_zone_fee_on_create.sql
   91. 0248_delivery_zone_distance_band.sql
   92. 0249_late_night_delivery_is_money_setting.sql
   93. 0250_outsourced_vehicle_quote.sql
   94. 0251_waiting_charge_line.sql
   95. 0252_allow_overbooking_on_chosen_products.sql
   96. 0253_temporary_stock_from_partners.sql
```

---

## 7. Conclusion

Card **`T1-03 · Settle the ledger before anything is applied`** has met its completion condition:
- `npm run db:plan:selftest` passes (12/12 checks).
- `node scripts/plan-migrations.mjs --accept-rename` outputs **0 blockers** and a clean numbered apply list of **96 migrations**.
- All renames, collisions, and external project rows are documented and accounted for.
