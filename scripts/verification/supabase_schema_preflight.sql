-- Babin Rentals OS — read-only Supabase schema/migration preflight
-- 2026-11-02. Run against the INTENDED project and confirm the project ref.
-- All statements are SELECTs. This script never changes schema, roles or data.
-- This is a focused release-preflight probe, NOT a full migration diff.
--
-- Usage: Supabase SQL Editor (paste and run) or
-- psql -v ON_ERROR_STOP=1 -f scripts/verification/supabase_schema_preflight.sql
-- DO NOT insert production passwords/connection URLs into tracked files.

-- 1. Connection identity: confirm it points to expected staging, not live.
select current_database() as database_name,
       current_user as connected_as,
       current_setting('server_version') as postgres_version;

-- 2. Actual migration-history coverage. Version strings are not always numeric
-- (the live history includes V1/V2/V3), so compare migration NAMES.
select count(*) as migration_history_rows,
       count(*) filter (where name ~ '^01(7[0-9]|8[0-9]|9[0-9])_') as entries_0170_to_0199,
       count(*) filter (where name ~ '^02[0-9]{2}_') as entries_0200_plus,
       coalesce(bool_or(name = '0164_booking_discount_vat_payment_integrity'), false) as has_0164,
       coalesce(bool_or(name = '0189_delivery_zones'), false) as has_0189,
       coalesce(bool_or(name = '0204_rider_link_v2_contract_fix'), false) as has_0204,
       coalesce(bool_or(name = '0205_delivery_zone_money_boundary'), false) as has_0205
from supabase_migrations.schema_migrations;

-- 3. Object inventory for the delivery / operations release cohort.
with expected(schema_name, object_name, expected_kind) as (
  values
    ('public','delivery_jobs','table'),
    ('public','delivery_zones','table'),
    ('public','delivery_job_links','table'),
    ('public','shift_handovers','table'),
    ('public','temporary_holds','table'),
    ('public','staff_directory_v','view')
)
select schema_name || '.' || object_name as object_name,
       expected_kind,
       to_regclass(format('%I.%I', schema_name, object_name)) is not null as exists_on_target
from expected order by object_name;

-- 4. Delivery RPC presence. Missing functions are not fixed here.
with expected(proname) as (
  values ('list_delivery_zones'), ('get_delivery_zone_fee'),
         ('create_delivery_zone'), ('update_delivery_zone'),
         ('deactivate_delivery_zone')
)
select proname as function_name,
       exists(select 1 from pg_proc p
              where p.pronamespace='public'::regnamespace
                and p.proname=expected.proname) as present
from expected order by proname;

-- 5. Critical privileges only when table exists. TRUNCATE bypasses RLS:
-- a secure 0205 staging result requires both roles to have FALSE.
select case when to_regclass('public.delivery_zones') is null then null
            else has_table_privilege('authenticated',to_regclass('public.delivery_zones'),'TRUNCATE')
       end as auth_can_truncate_delivery_zones,
       case when to_regclass('public.delivery_zones') is null then null
            else has_table_privilege('anon',to_regclass('public.delivery_zones'),'TRUNCATE')
       end as anon_can_truncate_delivery_zones,
       case when to_regclass('public.delivery_zones') is null then null
            else has_table_privilege('authenticated',to_regclass('public.delivery_zones'),'DELETE')
       end as auth_can_delete_delivery_zones;

-- 6. Staff directory warning context; these are metadata only.
select c.relname as view_name,
       coalesce('security_invoker=true'=any(c.reloptions), false) as security_invoker,
       has_table_privilege('anon',c.oid,'SELECT') as anon_can_select,
       has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_can_select
from pg_class c
where c.oid=to_regclass('public.staff_directory_v');

-- Do not use these results as authority to deploy. Full ordered migrations,
-- role-matrix RLS tests, backup/restore and release approval are separate gates.
