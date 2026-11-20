# Staging: refreshed source ↔ production migration reconciliation (READ ONLY)

**Checked:** 2026-11-17. **Main commit:** `4ba3cde372b5a690468aff370572a9e8500c9685`.
**Source:** 237 SQL files. **Production migration history:** 157 records.
**Exact name matches:** 148. **Source-only names:** 89. **Production-only names:** 9.

**Critical:** This comparison uses names only; it is not a full SQL hash/object equivalence, dependency-order proof, or approval to run migrations.
Production database was read via migration metadata only. No writes were made to production or staging.

## Unmatched production migration names: preserve and investigate

- `archive_bakery_pos_schema` (history version `20260809220713`)
- `0047_seed_tail_b917_equipment_line` (history version `20260812155050`)
- `0056_auth_role_falls_back_to_auth_uid` (history version `20260812160730`)
- `0056_auth_role_resolves_without_pre_request_hook` (history version `20260812160830`)
- `0057_users_self_read_accepts_auth_uid` (history version `20260812170827`)
- `0058_staff_row_for_babindulal7` (history version `20260812170856`)
- `ruled_sequences_completion` (history version `20260815185424`)
- `purchase_approval_owner_manager_only` (history version `20260824194129`)
- `0076_seed_operational_stage_corpus` (history version `20260831141204`)

## Source filenames without exact production history name

- `0047_seed_reference_corpus.sql` (1871590 bytes; Git blob `fdfaa0ebee3069b78fc630c2d9542a308b710fe2`)
- `0056_0_auth_role_falls_back_to_auth_uid.sql` (2788 bytes; Git blob `dfb6f045f8e0540afae81dfb5fde3d43ce65af77`)
- `0059_users_self_read_accepts_auth_uid.sql` (2779 bytes; Git blob `d991d1999936ad537e981daed172562640c41833`)
- `0060_staff_row_for_the_current_owner_identity.sql` (3065 bytes; Git blob `071b12f079b1621caaaf99d443ad591774ad7dfc`)
- `0069_purchase_approval_owner_manager_only.sql` (7064 bytes; Git blob `7d0e95956cc88cfcaa5d547436f1bb855ac5ffd7`)
- `0073_auth_role_resolves_without_pre_request_hook.sql` (3200 bytes; Git blob `ac86bf679563d8226bf18fa629f0f13639c443c4`)
- `0081_ruled_sequences_completion.sql` (7777 bytes; Git blob `300169cb9a6cbbf090096de27c8e314e13f1509e`)
- `0082_seed_operational_stage_corpus.sql` (12391 bytes; Git blob `58ca57438dd5d4f1c4400f1c084922c25bb25242`)
- `0157_audit_triggers_for_trigger_less_tables.sql` (4202 bytes; Git blob `166450092400509318fa338243656514fb8f3fce`)
- `0158_settings_table.sql` (10752 bytes; Git blob `c4f3a82afb8ed9848dd7202f6047304a5611e09e`)
- `0159_saved_views.sql` (11972 bytes; Git blob `204eb2b16c9970051932415ba010683f5a1a80ed`)
- `0160_pricing_structures.sql` (11531 bytes; Git blob `c12cc0c75f5f82e8c5bf1415cdc58c4ad43365fa`)
- `0161_grant_booking_project_type.sql` (2001 bytes; Git blob `866ba47d95785eddcd24edc30920c714a06685c0`)
- `0162_grant_non_money_columns.sql` (1763 bytes; Git blob `995bd6fa2f96b728393aea0ffa50db7a6809d8a2`)
- `0163_close_six_anon_business_rpcs.sql` (3546 bytes; Git blob `0bd521b96f6cedbe44f1a72fbffbb65d71049f13`)
- `0165_delivery_jobs_and_event_rpc.sql` (15140 bytes; Git blob `5f46d2a84d9aa590bce91cc50c235c96796d8b99`)
- `0166_booking_transport_dispatch.sql` (8289 bytes; Git blob `cea261e57222bbce2740c08e6885118d14856ea8`)
- `0167_rental_revert_archive.sql` (10883 bytes; Git blob `d3f0f75f51326ba8c63feb2ae769b9aed0f456a8`)
- `0168_booking_line_totals_and_breakdown.sql` (42802 bytes; Git blob `199b096e536b41404b70b32d04d206cedbe361f3`)
- `0169_pin_intel_and_guard_search_paths.sql` (2275 bytes; Git blob `036e6e3b562f5cbf33383fb52565edff4d5c708d`)
- `0170_astra_phase0_authorization.sql` (13799 bytes; Git blob `449cfde4ea72a90f671354b41998bde3997a4f9c`)
- `0171_operations_branch_grants.sql` (30878 bytes; Git blob `24637225d0cccb2f8af6ef7ac00742714e38a520`)
- `0172_reset_branch_write_boundary.sql` (3506 bytes; Git blob `ee3376f56e8875170d44619db95bee135089f8eb`)
- `0173_section_saves_and_unit_lifecycle.sql` (22523 bytes; Git blob `3f8098540980b3db823d64176dcf9fb2e74fd6ae`)
- `0174_change_client_membership.sql` (6868 bytes; Git blob `0ad69c3dee0575beda8ede785790dbae5d23c4b2`)
- `0176_partial_return_reservation_release.sql` (12342 bytes; Git blob `39720c3f72a9e6e62993737d3fdd74cbd236545a`)
- `0177_verified_return_reservations.sql` (19712 bytes; Git blob `269360bfac5478a4c8146c1d5af23298882f9f16`)
- `0178_quantity_only_reset.sql` (2888 bytes; Git blob `52b72a893b54395423a19bebf5c455b72db96b3f`)
- `0179_gate1_override_by_handover_staff.sql` (20782 bytes; Git blob `1db4c3d105a4e49944e3ba73d02942ff11670599`)
- `0180_technician_floor_verbs.sql` (5315 bytes; Git blob `802179bdb5c349d2094fb44ba83cf32d11a52d3e`)
- `0181_collateral_deposit_id_card.sql` (25124 bytes; Git blob `ba948d4e7558d629748727956fd4ffa9793fecca`)
- `0182_client_collectors_and_id_on_file.sql` (10101 bytes; Git blob `2db875c17dd9e370d8c50d5b64ea45262748f993`)
- `0183_reset_self_qc_when_alone.sql` (1041 bytes; Git blob `68d8c187c097bad5050ef9bf7c01fdf45352981b`)
- `0184_repair_job_closes_damage.sql` (21914 bytes; Git blob `93e4103e13d0d49a4c582d8b2f1274f97f264226`)
- `0185_team_notes.sql` (13934 bytes; Git blob `54f64790bb7585294edf840c937283f48373038e`)
- `0186_shift_handovers.sql` (19114 bytes; Git blob `f25c3e8fb011f0c95d88cbe483fbc6ef00a4d663`)
- `0187_delivery_dispatch_rpcs.sql` (12285 bytes; Git blob `f7e04abfc48dbd0fd39ca564d85074b1d94f824c`)
- `0188_smart_reservation_holds.sql` (15989 bytes; Git blob `15efbaf597ee7f9d1402c29ca38321cb80e22953`)
- `0188_staff_renting_gear.sql` (8938 bytes; Git blob `d4dc4b88a480e49b467921ac2c5a43a1ce2b8406`)
- `0189_delivery_zones.sql` (10815 bytes; Git blob `57b6724b1b81ef92de1dedcd99759a85ad5bc504`)
- `0190_one_time_rider_links.sql` (20219 bytes; Git blob `e806bc95358a11f5688199c0fe647228b45e4b26`)
- `0191_delivery_reschedule_job.sql` (3778 bytes; Git blob `0f52c00d0c52b26950ef27367bbceb84852e3d0e`)
- `0192_notification_records.sql` (12686 bytes; Git blob `126a2e4e41491c1b312972a64b452dd873ca6d66`)
- `0193_invoice_write_hardening.sql` (22651 bytes; Git blob `a0c85ec03ad2430b34362a237504df0317f5c72e`)
- `0194_reset_damage_opens_case.sql` (9902 bytes; Git blob `ce9eff6d3b069819702d5cbef461cf1562c71c75`)
- `0195_load_membership_plans.sql` (3791 bytes; Git blob `2fb906a1840573b8767e49719268e8111636a926`)
- `0196_membership_plans_admin.sql` (14640 bytes; Git blob `bd36eedf6b21cef958256fa0e40ac96e033f1017`)
- `0197_membership_plan_change_credit.sql` (13381 bytes; Git blob `a63323ee14dd63e6b4acfe138c23d934a9b563b1`)
- `0198_renew_client_membership.sql` (12205 bytes; Git blob `9a34ff1aa933ef2d0914dd136c76efcdf4e72133`)
- `0199_tds_on_crew_payouts.sql` (8564 bytes; Git blob `bd9d3bb4d83c568725911812fc6fa5d3836c4259`)
- `0200_draft_at_confirm_and_resync.sql` (20445 bytes; Git blob `905665e4bf89db47a22628106eb9896ae01ba0e8`)
- `0201_fix_collateral_masking_chars.sql` (1701 bytes; Git blob `42ca77516dba4f71f972e9c8017d721e5437a724`)
- `0202_staff_discount_is_money_setting.sql` (1745 bytes; Git blob `6ae06bb2972bcbf8c2f8ee421acefd37ef6cd84e`)
- `0203_restore_driver_client_view_scopes.sql` (2179 bytes; Git blob `ec697f8ee1133d2df6e6928103fe1a41ba7225af`)
- `0204_rider_link_v2_contract_fix.sql` (11230 bytes; Git blob `196772678757f1f7c2b6c95fbb751d600ee85fa9`)
- `0205_extend_booking_without_draft.sql` (9303 bytes; Git blob `51451da0b3e0fe992439d4e55a2fc3d64039c310`)
- `0206_delivery_route_map_pins.sql` (10932 bytes; Git blob `68cbcc455e3a935dad8f1f257f859eab5f7ebaf4`)
- `0207_crew_overtime_half_full_day.sql` (3343 bytes; Git blob `b2e24440cf35bd75f62952be1aafffa9ae311130`)
- `0208_staff_pin_four_digits.sql` (10656 bytes; Git blob `3ba00a60e3292fedbeca02b109e35e37d5451446`)
- `0209_calendar_feed_tokens.sql` (13239 bytes; Git blob `e93c3effef7944bdfefd689181963b59b32cab12`)
- `0210_problem_reports.sql` (19878 bytes; Git blob `84450b4e4ee7256a8961d3d289a9ab691fa2b00a`)
- `0211_delivery_proof.sql` (6187 bytes; Git blob `8f64c78943f5e3868d6beffc782a5fd78cf09ccc`)
- `0212_cancellation_fee_tiers.sql` (2706 bytes; Git blob `bd0c9f8a3649c10eab3e9a8232af2f649033fcea`)
- `0213_non_vat_bills.sql` (2415 bytes; Git blob `30dc3ed205e7445d4cc05ab8824ff0c07e80e4b6`)
- `0214_opening_balances.sql` (2929 bytes; Git blob `ce009781243099efad72b8bd326ebb7401934fda`)
- `0215_email_sending_and_log.sql` (12687 bytes; Git blob `d635e50fbfde499f69b87c4af019436f81f40859`)
- `0216_morning_digest_schedule_and_query.sql` (10911 bytes; Git blob `6c7caeede415b5da45d77ff1336fcece16c5022f`)
- `0217_notification_preferences.sql` (12818 bytes; Git blob `31aa2fa2173ebfc327c826407e1095c36a1816f3`)
- `0218_client_message_events.sql` (26297 bytes; Git blob `bf225d603cf8af8f6ce186f19f49665f83f34ceb`)
- `0219_payment_reminders.sql` (27671 bytes; Git blob `0535d02fd4b7112bc3a5289c709be929b01db899`)
- `0220_push_subscriptions.sql` (15428 bytes; Git blob `c709430a1092d7c42200a48cb39deff075a37526`)
- `0221_guard_unit_identity_edits.sql` (2965 bytes; Git blob `766be5918e7695376b025f776e9e26307315e9c6`)
- `0222_repair_confirm_booking_atomic_and_reservation_dedup.sql` (12682 bytes; Git blob `443f45f7a797ff357a48b44f7efd99a99b80fb1c`)
- `0223_product_aliases.sql` (9458 bytes; Git blob `b9d209d6ab5c47d87e3a166e4262082539f3ab73`)
- `0224_offer_campaigns_and_recipients.sql` (20716 bytes; Git blob `57d4eb9221094b1bc38b54ee4bce0b31dd529d5d`)
- `0226_bulk_update_products.sql` (7261 bytes; Git blob `814bf66bd7bf25b0ee3f41c20ee32db1ababb574`)
- `0227_message_templates.sql` (19214 bytes; Git blob `0112670b1e4b7265d6957dfff50058dbd8142d8f`)
- `0228_membership_change_keep_join_date.sql` (13327 bytes; Git blob `74dc9ad5cbabca226192a8b349f7ac2e4280fe4f`)
- `0229_booking_tags.sql` (5364 bytes; Git blob `e9f38e41986f45aadcdf53c5b18f21f19966140a`)
- `0230_project_name_and_shoot_location.sql` (33598 bytes; Git blob `b18c5437d471542009aa18c593189f108330ea26`)
- `0231_pro_forma_document_type.sql` (1641 bytes; Git blob `5a644811ac8c94ecf7e18886dd3a63783b0225f2`)
- `0232_secure_temporary_hold_rpcs.sql` (16206 bytes; Git blob `6f3e10a372ef905f04b87ebbf84dfd457615b895`)
- `0233_extend_booking_and_resync_auth.sql` (6515 bytes; Git blob `e26cb4ffdd09ddd4caa7a657b6109ca24cf8f724`)
- `0234_return_damage_photo_per_unit.sql` (2428 bytes; Git blob `599e43fb1a535c4a193f7e7a9467e4bd703aee37`)
- `0235_delivery_route_branch_hardening.sql` (5690 bytes; Git blob `660d05098ce1efbcf1562c4c2a5ac68657684e34`)
- `0236_opening_balances_append_only.sql` (838 bytes; Git blob `fb11efb39801d124bb533c19e6b6b23e2cb6039c`)
- `0237_planned_equipment_downtime.sql` (10671 bytes; Git blob `2b357d25c4288a2a7d0629112332404e33e29ce2`)
- `0239_consumables_pricing_restock_and_low_stock.sql` (49576 bytes; Git blob `c9c987542adf578f7e5e854da2247493da778e9c`)
- `0240_time_between_rentals.sql` (17079 bytes; Git blob `93e2623c341fd346798403eef9be3825c4ed7fe6`)

## Review gates

1. `0012_seed_data.sql` creates named staff/branches, bank/wallet and PAN-like identifiers. Review and replace with synthetic-only fixtures; never allow real emails or account details to be used for test sends.
2. `0047_seed_reference_corpus.sql` (~1.87MB) is a one-shot dataset. Explicitly decide whether to exclude during hosted staging schema installation; do not blindly replay.
3. `0082_seed_operational_stage_corpus.sql` notes it was originally applied as `0076_seed_operational_stage_corpus`; it inserts time-relative operational records. Do not rerun without verifying dependencies and test-data semantics.
4. Both `0188_smart_reservation_holds.sql` and `0188_staff_renting_gear.sql` share prefix `0188`; preserve filenames and verify actual dependency order.
5. `0239_consumables_pricing_restock_and_low_stock.sql` and `0240_time_between_rentals.sql` are **new since the prior 235-file audit** and include database routines and money/availability authorization logic; verify Postgres/RLS and role restrictions before staging installation.
6. Investigate production-only `archive_bakery_pos_schema`: do not infer it belongs in the rental app or delete unrelated objects.
7. The staging project is the existing free `babin-staging` only; the production project must never be used as an apply target.

## Execution status

**HOLD.** The source files have not all been classified for dependency order, and production/source text equivalence is unresolved. First validate local `npm run gates`, an exact-file review, a recovery plan, and a synthetic test dataset. Begin permanent staging-only DDL after those checks. Never use `supabase db push` or `db reset --remote` with this legacy numbered migration tree.

See `STAGING_SQL_INVENTORY_2026-11-16.json` for pinned source blob identities, `STAGING_FREE_BOOTSTRAP_2026-11-16.md` for the guarded handoff.
