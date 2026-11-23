-- =============================================================================
-- BABIN RENTALS OS — COMPREHENSIVE PRODUCTION POST-CUTOVER VERIFICATION
-- Target: Production Project sxguwvgoserhdolewibb
-- Total Expected Pending Migrations: 102
-- Total Expected Schema Migrations: 259 (157 baseline + 102 pending)
-- =============================================================================

begin read only;

-- 1. Check that all 102 migrations are recorded in schema_migrations
with expected(name) as (
  values
    ('0157_audit_triggers_for_trigger_less_tables'),
    ('0158_settings_table'),
    ('0159_saved_views'),
    ('0160_pricing_structures'),
    ('0161_grant_booking_project_type'),
    ('0162_grant_non_money_columns'),
    ('0163_close_six_anon_business_rpcs'),
    ('0165_delivery_jobs_and_event_rpc'),
    ('0166_booking_transport_dispatch'),
    ('0167_rental_revert_archive'),
    ('0168_booking_line_totals_and_breakdown'),
    ('0169_pin_intel_and_guard_search_paths'),
    ('0170_astra_phase0_authorization'),
    ('0171_operations_branch_grants'),
    ('0172_reset_branch_write_boundary'),
    ('0173_section_saves_and_unit_lifecycle'),
    ('0174_change_client_membership'),
    ('0176_partial_return_reservation_release'),
    ('0177_verified_return_reservations'),
    ('0178_quantity_only_reset'),
    ('0179_gate1_override_by_handover_staff'),
    ('0180_technician_floor_verbs'),
    ('0181_collateral_deposit_id_card'),
    ('0182_client_collectors_and_id_on_file'),
    ('0183_reset_self_qc_when_alone'),
    ('0184_repair_job_closes_damage'),
    ('0185_team_notes'),
    ('0186_shift_handovers'),
    ('0187_delivery_dispatch_rpcs'),
    ('0188_smart_reservation_holds'),
    ('0188_staff_renting_gear'),
    ('0189_delivery_zones'),
    ('0190_one_time_rider_links'),
    ('0191_delivery_reschedule_job'),
    ('0192_notification_records'),
    ('0193_invoice_write_hardening'),
    ('0194_reset_damage_opens_case'),
    ('0195_load_membership_plans'),
    ('0196_membership_plans_admin'),
    ('0197_membership_plan_change_credit'),
    ('0198_renew_client_membership'),
    ('0199_tds_on_crew_payouts'),
    ('0200_draft_at_confirm_and_resync'),
    ('0201_fix_collateral_masking_chars'),
    ('0202_staff_discount_is_money_setting'),
    ('0203_restore_driver_client_view_scopes'),
    ('0204_rider_link_v2_contract_fix'),
    ('0205_extend_booking_without_draft'),
    ('0206_delivery_route_map_pins'),
    ('0207_crew_overtime_half_full_day'),
    ('0208_staff_pin_four_digits'),
    ('0209_calendar_feed_tokens'),
    ('0210_problem_reports'),
    ('0211_delivery_proof'),
    ('0212_cancellation_fee_tiers'),
    ('0213_non_vat_bills'),
    ('0214_opening_balances'),
    ('0215_email_sending_and_log'),
    ('0216_morning_digest_schedule_and_query'),
    ('0217_notification_preferences'),
    ('0218_client_message_events'),
    ('0219_payment_reminders'),
    ('0220_push_subscriptions'),
    ('0221_guard_unit_identity_edits'),
    ('0222_repair_confirm_booking_atomic_and_reservation_dedup'),
    ('0223_product_aliases'),
    ('0224_offer_campaigns_and_recipients'),
    ('0226_bulk_update_products'),
    ('0227_message_templates'),
    ('0228_membership_change_keep_join_date'),
    ('0229_booking_tags'),
    ('0230_project_name_and_shoot_location'),
    ('0231_pro_forma_document_type'),
    ('0232_secure_temporary_hold_rpcs'),
    ('0233_extend_booking_and_resync_auth'),
    ('0234_return_damage_photo_per_unit'),
    ('0235_delivery_route_branch_hardening'),
    ('0236_opening_balances_append_only'),
    ('0237_planned_equipment_downtime'),
    ('0238_rental_day_start_setting'),
    ('0239_consumables_pricing_restock_and_low_stock'),
    ('0240_time_between_rentals'),
    ('0241_extension_clash_manager_decision_and_at_risk'),
    ('0242_return_damage_signature_and_refusal'),
    ('0243_change_confirmed_booking'),
    ('0244_counter_sale'),
    ('0245_delivery_zone_vehicle_fee_grid'),
    ('0246_dispatch_zone_fee_from_grid'),
    ('0247_retire_per_zone_fee_on_create'),
    ('0248_delivery_zone_distance_band'),
    ('0249_late_night_delivery_is_money_setting'),
    ('0250_outsourced_vehicle_quote'),
    ('0251_waiting_charge_line'),
    ('0252_allow_overbooking_on_chosen_products'),
    ('0253_temporary_stock_from_partners'),
    ('0254_draft_invoice_resync_integrity_and_settlement_numbering'),
    ('0255_booking_site_and_public_catalogue'),
    ('0256_booking_requests_and_staff_queue'),
    ('0257_client_accounts_and_portal_binding'),
    ('0258_payment_intents_and_fonepay'),
    ('0259_payment_link_from_any_booking'),
    ('0260_online_payment_refunds_and_reconciliation')
)
select 'MISSING MIGRATIONS' as check_name, coalesce(count(expected.name), 0) as missing_count
from expected
left join supabase_migrations.schema_migrations m on m.name = expected.name
where m.name is null;
-- Expected missing_count: 0

-- 2. Verify total migrations count in schema_migrations
select 'TOTAL SCHEMA MIGRATIONS' as check_name, count(*) as total_count
from supabase_migrations.schema_migrations;
-- Expected total_count >= 259

-- 3. Verify Anonymous Business RPCs are strictly denied (0163 enforcement)
select 'UNAUTHORIZED ANON RPCS' as check_name, coalesce(count(*), 0) as unexpected_anon_rpcs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'adjust_stock', 'portal_claim_by_verified_email', 'read_quote_editor',
    'set_staff_active', 'set_staff_role', 'update_rental_quote'
  )
  and has_function_privilege('anon', p.oid, 'execute');
-- Expected unexpected_anon_rpcs: 0

-- 4. Verify public intake RPCs explicitly granted to anon (0256, 0257)
select 'PUBLIC INTAKE RPCS' as check_name, proname, has_function_privilege('anon', p.oid, 'execute') as anon_allowed
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('submit_booking_request', 'set_request_context')
order by proname;
-- Expected: both submit_booking_request and set_request_context return anon_allowed = true

-- 5. Verify Critical Tables created by the cutover
select 'CORE CUTOVER TABLES' as check_name, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'settings', 'settings_history', 'delivery_jobs', 'delivery_zones', 'delivery_zone_rates',
    'team_notes', 'staff_shifts', 'staff_problem_reports', 'push_subscriptions',
    'product_aliases', 'booking_tags', 'booking_requests', 'client_portal_access',
    'payment_intents', 'online_payment_refunds'
  )
order by table_name;
-- Expected: 15 tables listed

-- 6. Verify Critical Column Extensions
select 'CRITICAL COLUMN EXTENSIONS' as check_name, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'bookings' and column_name in ('archived_at', 'project_name', 'shoot_location')) or
  (table_name = 'booking_lines' and column_name in ('line_total', 'price_breakdown')) or
  (table_name = 'inventory_units' and column_name in ('status', 'condition_grade'))
)
order by table_name, column_name;

rollback;
