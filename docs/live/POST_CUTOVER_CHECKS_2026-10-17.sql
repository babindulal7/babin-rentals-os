-- Read-only structural checks, after Babin's reviewed cutover. Not JWT/API acceptance.
begin read only;

select 'pending curated migrations' as check_name, count(*) as remaining
from unnest(array[
  '0157_audit_triggers_for_trigger_less_tables', '0158_settings_table',
  '0159_saved_views', '0160_pricing_structures', '0161_grant_booking_project_type',
  '0162_grant_non_money_columns', '0163_close_six_anon_business_rpcs',
  '0165_delivery_jobs_and_event_rpc', '0166_booking_transport_dispatch',
  '0167_rental_revert_archive', '0168_booking_line_totals_and_breakdown',
  '0169_pin_intel_and_guard_search_paths'
]) as expected(name)
where not exists(select 1 from supabase_migrations.schema_migrations m where m.name = expected.name);
-- Expect remaining = 0; do not replay historical seeds/renames to get there.

select p.oid::regprocedure as unexpected_anon_business_rpc
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('adjust_stock', 'portal_claim_by_verified_email', 'read_quote_editor',
    'set_staff_active', 'set_staff_role', 'update_rental_quote')
  and has_function_privilege('anon', p.oid, 'execute');
-- Expect zero rows; this is the exact 0163 target list.

select c.relname as unexpected_anon_view
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v' and has_table_privilege('anon', c.oid, 'select');
-- Expect zero rows.

select p.oid::regprocedure as unexpected_mutable_application_search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where ((n.nspname = 'public' and p.proname in (
  'booking_intel_note_archive_only','intel_entity_note_archive_only','intel_field_allowed',
  'intel_field_definition_archive_only','reject_delete_nothing_is_deleted',
  'reject_direct_booking_stage_write','reject_money_column_write_by_money_blind_role',
  'reject_update_append_only','reject_update_daily_closing','reject_update_released_unit','reject_users_delete'
)) or (n.nspname = 'record_editor_private' and p.proname in ('fields','pick')))
and not ('search_path=public, pg_temp' = any(coalesce(p.proconfig, array[]::text[])));
-- Expect zero rows.

select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'bookings' and column_name in ('archived_at','archived_by')) or
  (table_name = 'booking_lines' and column_name in ('line_total','price_breakdown')) or
  (table_name = 'invoice_lines' and column_name = 'price_breakdown')
) order by table_name, column_name;
-- Expect all five columns. Still verify real money-blind JWTs cannot read values.

select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects' order by policyname;
-- REVIEW REQUIRED: current bucket-only authenticated policies are a separate release blocker.

rollback;
