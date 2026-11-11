# Staging / production migration reconciliation — read-only preflight

**Date:** 12 November 2026 (Nepal time)  
**Source:** GitHub `main` `5170e961a57a8463982d8d129d71fb175b3319ca`; connected Supabase API metadata (read-only)  
**State:** **RELEASE HOLD — NO APPLY AUTHORIZED**  
**Production project:** `sxguwvgoserhdolewibb` (Postgres 17.6; ap-southeast-1)  
**Separate staging project (already exists):** `klhmsrunqrdxjudyhnkm` (Postgres 17.11; ap-southeast-1)

## Verified inventory (not a migration plan)

| Evidence | Production | Separate staging |
| --- | ---: | ---: |
| Supabase migration-history entries | **157** | **0** |
| Public base tables (read-only catalogue query) | **135** | **0** |
| Public views | **30** | **0** |
| Public RLS policies | **273** | **0** |
| Public routines | **105** | **0** |
| Core tables (bookings, clients, products, invoices, payments, users) | Present | Not present |

Source contains **233 SQL files**, with **148 exact-name matches** to production's migration-history names, **85 files lacking an exact-name match**, and **9 production-history names without a corresponding source filename**. This is a *filename-only* comparison, not proof of missing SQL or skipped migrations. A migration may have been renamed, superseded, or installed without a matching ledger name; the reverse is also possible.

### Potential renamed-name pairs — NEED CONTENT/OBJECT VERIFICATION

| Current source file | Production ledger name to investigate |
| --- | --- |
| `0056_0_auth_role_falls_back_to_auth_uid.sql` | `0056_auth_role_falls_back_to_auth_uid` |
| `0059_users_self_read_accepts_auth_uid.sql` | `0057_users_self_read_accepts_auth_uid` |
| `0060_staff_row_for_the_current_owner_identity.sql` | `0058_staff_row_for_babindulal7` |
| `0069_purchase_approval_owner_manager_only.sql` | `purchase_approval_owner_manager_only` |
| `0073_auth_role_resolves_without_pre_request_hook.sql` | `0056_auth_role_resolves_without_pre_request_hook` |
| `0081_ruled_sequences_completion.sql` | `ruled_sequences_completion` |
| `0082_seed_operational_stage_corpus.sql` | `0076_seed_operational_stage_corpus` |

Do not automatically identify the two `0047_*` entries as the same content. Historical `0047_seed_reference_corpus.sql` is a one-shot seed, **never replay on production**. Also investigate `archive_bakery_pos_schema` as a potentially unrelated schema and preserve it.

### Collision needing dependency review

Both source files have migration prefix `0188`:
- `0188_smart_reservation_holds.sql`
- `0188_staff_renting_gear.sql`

Resolve lineage/order by inspecting dependency SQL and the migration ledger before building an apply manifest. Do not resolve by editing live migration history or blind renaming.

### GitHub SQL files lacking an exact recorded production-history name (85)

- [ ] `0047_seed_reference_corpus.sql`
- [ ] `0056_0_auth_role_falls_back_to_auth_uid.sql`
- [ ] `0059_users_self_read_accepts_auth_uid.sql`
- [ ] `0060_staff_row_for_the_current_owner_identity.sql`
- [ ] `0069_purchase_approval_owner_manager_only.sql`
- [ ] `0073_auth_role_resolves_without_pre_request_hook.sql`
- [ ] `0081_ruled_sequences_completion.sql`
- [ ] `0082_seed_operational_stage_corpus.sql`
- [ ] `0157_audit_triggers_for_trigger_less_tables.sql`
- [ ] `0158_settings_table.sql`
- [ ] `0159_saved_views.sql`
- [ ] `0160_pricing_structures.sql`
- [ ] `0161_grant_booking_project_type.sql`
- [ ] `0162_grant_non_money_columns.sql`
- [ ] `0163_close_six_anon_business_rpcs.sql`
- [ ] `0165_delivery_jobs_and_event_rpc.sql`
- [ ] `0166_booking_transport_dispatch.sql`
- [ ] `0167_rental_revert_archive.sql`
- [ ] `0168_booking_line_totals_and_breakdown.sql`
- [ ] `0169_pin_intel_and_guard_search_paths.sql`
- [ ] `0170_astra_phase0_authorization.sql`
- [ ] `0171_operations_branch_grants.sql`
- [ ] `0172_reset_branch_write_boundary.sql`
- [ ] `0173_section_saves_and_unit_lifecycle.sql`
- [ ] `0174_change_client_membership.sql`
- [ ] `0176_partial_return_reservation_release.sql`
- [ ] `0177_verified_return_reservations.sql`
- [ ] `0178_quantity_only_reset.sql`
- [ ] `0179_gate1_override_by_handover_staff.sql`
- [ ] `0180_technician_floor_verbs.sql`
- [ ] `0181_collateral_deposit_id_card.sql`
- [ ] `0182_client_collectors_and_id_on_file.sql`
- [ ] `0183_reset_self_qc_when_alone.sql`
- [ ] `0184_repair_job_closes_damage.sql`
- [ ] `0185_team_notes.sql`
- [ ] `0186_shift_handovers.sql`
- [ ] `0187_delivery_dispatch_rpcs.sql`
- [ ] `0188_smart_reservation_holds.sql`
- [ ] `0188_staff_renting_gear.sql`
- [ ] `0189_delivery_zones.sql`
- [ ] `0190_one_time_rider_links.sql`
- [ ] `0191_delivery_reschedule_job.sql`
- [ ] `0192_notification_records.sql`
- [ ] `0193_invoice_write_hardening.sql`
- [ ] `0194_reset_damage_opens_case.sql`
- [ ] `0195_load_membership_plans.sql`
- [ ] `0196_membership_plans_admin.sql`
- [ ] `0197_membership_plan_change_credit.sql`
- [ ] `0198_renew_client_membership.sql`
- [ ] `0199_tds_on_crew_payouts.sql`
- [ ] `0200_draft_at_confirm_and_resync.sql`
- [ ] `0201_fix_collateral_masking_chars.sql`
- [ ] `0202_staff_discount_is_money_setting.sql`
- [ ] `0203_restore_driver_client_view_scopes.sql`
- [ ] `0204_rider_link_v2_contract_fix.sql`
- [ ] `0205_extend_booking_without_draft.sql`
- [ ] `0206_delivery_route_map_pins.sql`
- [ ] `0207_crew_overtime_half_full_day.sql`
- [ ] `0208_staff_pin_four_digits.sql`
- [ ] `0209_calendar_feed_tokens.sql`
- [ ] `0210_problem_reports.sql`
- [ ] `0211_delivery_proof.sql`
- [ ] `0212_cancellation_fee_tiers.sql`
- [ ] `0213_non_vat_bills.sql`
- [ ] `0214_opening_balances.sql`
- [ ] `0215_email_sending_and_log.sql`
- [ ] `0216_morning_digest_schedule_and_query.sql`
- [ ] `0217_notification_preferences.sql`
- [ ] `0218_client_message_events.sql`
- [ ] `0219_payment_reminders.sql`
- [ ] `0220_push_subscriptions.sql`
- [ ] `0221_guard_unit_identity_edits.sql`
- [ ] `0222_repair_confirm_booking_atomic_and_reservation_dedup.sql`
- [ ] `0223_product_aliases.sql`
- [ ] `0224_offer_campaigns_and_recipients.sql`
- [ ] `0226_bulk_update_products.sql`
- [ ] `0227_message_templates.sql`
- [ ] `0228_membership_change_keep_join_date.sql`
- [ ] `0229_booking_tags.sql`
- [ ] `0230_project_name_and_shoot_location.sql`
- [ ] `0231_pro_forma_document_type.sql`
- [ ] `0232_secure_temporary_hold_rpcs.sql`
- [ ] `0233_extend_booking_and_resync_auth.sql`
- [ ] `0234_return_damage_photo_per_unit.sql`
- [ ] `0235_delivery_route_branch_hardening.sql`

Each row needs one of: `ALREADY_APPLIED_IDENTICAL` (with object-definition proof), `RENAMED_VERIFIED`, `PENDING` (dependency chain and staging result), `SUPERSEDED` (proof), or `EXCLUDED_SEED`; otherwise keep it `UNRESOLVED`.

### Production ledger names without exact GitHub filename (9)

- `archive_bakery_pos_schema` — ledger version `20260809220713`
- `0047_seed_tail_b917_equipment_line` — ledger version `20260812155050`
- `0056_auth_role_falls_back_to_auth_uid` — ledger version `20260812160730`
- `0056_auth_role_resolves_without_pre_request_hook` — ledger version `20260812160830`
- `0057_users_self_read_accepts_auth_uid` — ledger version `20260812170827`
- `0058_staff_row_for_babindulal7` — ledger version `20260812170856`
- `ruled_sequences_completion` — ledger version `20260815185424`
- `purchase_approval_owner_manager_only` — ledger version `20260824194129`
- `0076_seed_operational_stage_corpus` — ledger version `20260831141204`

Preserve nonproject schemas and all production data. These rows cannot be automatically deleted or treated as defects.

## Staging is not populated — required safe order

1. **Backup/recovery evidence.** Locate a fresh, restorable, owner-authorized production backup, record file size + SHA-256 privately, and rehearse recovery. Do not copy production client data into staging until access restrictions and retention are agreed.
2. **Complete read-only ledger reconciliation.** Compare *SQL content and actual objects* (policies, grants, views, functions, constraints, trigger definitions) with each candidate, including renames, duplicate `0188`, one-shot seeds, and mixed-version entries. Produce a dependency-ordered manifest with exact filenames, SQL checksums, rollback strategy and per-file decision evidence. Do not assume `unmatched = pending`.
3. **Protect the existing staging project.** Confirm test-account access, network exposure, backups, and whether it should use a sanitized dataset. Record owner approval before any staging write or additional spending.
4. **Rehearse approved migrations on staging only, in dependency order.** Use the repo's local `npm run check:pglite` and `npm run check:lifecycle` first, then apply only the reviewed manifest to staging; compare expected schemas and counts before/after. No `supabase db push` to production, no copy/paste bulk deployment.
5. **Run real hosted test identities on staging.** Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver and Client, including two isolated Clients. Verify Driver trip-state removal, money-blind RLS, auth and view filtering, evidence-storage isolation, and sign-out/session rules. Test UI on desktop, iPad and phone.
6. **Security-advisor triage.** Current production advisors still flag `auth_users_exposed` for `public.staff_directory_v` and 30 `security_definer_view` findings. These are **potential exposures to investigate**, not confirmed exploitation; some masking views may intentionally be security-definer. Verify effective grants and real JWT/role access before changing any policy.
7. **Go/no-go gate.** Require same-head full Mac CI success on final `main`, approved migration/backup manifest, staging restore evidence, nine-role and storage acceptance, accounting/rental loop acceptance, and explicit owner approval. Until then **production HOLD**.

## Explicitly NOT DONE by this preflight

- No migrations, seed data, grants, or schema were applied to staging or production.
- No customer, staff or credential rows were extracted.
- No new Supabase project or paid branch was created.
- No deployment, Booqable cancellation, or release decision was made.

**Tracking:** [Release-HOLD issue #56](https://github.com/babindulal7/babin-rentals-os/issues/56); [T1 release cards](https://github.com/babindulal7/babin-rentals-os/blob/main/docs/plans/T1_RELEASE.md). This dated snapshot must be refreshed before any write as source and hosted state can change.
