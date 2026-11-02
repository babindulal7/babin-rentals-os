-- Babin Rentals OS — single-statement READ-ONLY database preflight.
-- Safe to run in Supabase SQL Editor or against an intentionally selected database.
-- It reports status; it NEVER repairs schema or migration history.
-- A one-row JSON report is used because some SQL clients only return the last
-- result set of a script with multiple SELECTs.

with
migration_status as (
  select count(*) as recorded,
    count(*) filter (where name ~ '^01(7[0-9]|8[0-9]|9[0-9])_') as names_0170_to_0199,
    count(*) filter (where name ~ '^02[0-9]{2}_') as names_0200_plus,
    coalesce(bool_or(name = '0164_booking_discount_vat_payment_integrity'), false) as has_0164,
    coalesce(bool_or(name = '0189_delivery_zones'), false) as has_0189,
    coalesce(bool_or(name = '0204_rider_link_v2_contract_fix'), false) as has_0204,
    coalesce(bool_or(name = '0205_delivery_zone_money_boundary'), false) as has_0205
  from supabase_migrations.schema_migrations
),
expected_relations(name, kind) as (
  values
  ('public.delivery_jobs','table'), ('public.delivery_zones','table'),
  ('public.delivery_job_links','table'), ('public.shift_handovers','table'),
  ('public.temporary_holds','table'), ('public.staff_directory_v','view'),
  ('public.notifications','table')
),
relation_report as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'object',name, 'expected_kind',kind, 'present',to_regclass(name) is not null
  ) order by name), '[]'::jsonb) as report
  from expected_relations
),
expected_functions(name) as (
  values ('list_delivery_zones'), ('get_delivery_zone_fee'),
    ('create_delivery_zone'), ('update_delivery_zone'), ('deactivate_delivery_zone')
),
function_report as (
  select coalesce(jsonb_agg(jsonb_build_object('function',e.name,
    'present',exists(select 1 from pg_proc p
      where p.pronamespace='public'::regnamespace and p.proname=e.name)
  ) order by e.name), '[]'::jsonb) as report
  from expected_functions e
),
zone_grants as (
  select case when to_regclass('public.delivery_zones') is null then null
     else has_table_privilege('authenticated',to_regclass('public.delivery_zones'),'TRUNCATE')
    end as authenticated_can_truncate,
    case when to_regclass('public.delivery_zones') is null then null
     else has_table_privilege('anon',to_regclass('public.delivery_zones'),'TRUNCATE')
    end as anon_can_truncate,
    case when to_regclass('public.delivery_zones') is null then null
     else has_table_privilege('authenticated',to_regclass('public.delivery_zones'),'DELETE')
    end as authenticated_can_delete
),
staff_view as (
  select case when c.oid is null then null
     else coalesce('security_invoker=true'=any(c.reloptions),false) end as security_invoker,
    case when c.oid is null then null
     else has_table_privilege('anon',c.oid,'SELECT') end as anon_can_select,
    case when c.oid is null then null
     else has_table_privilege('authenticated',c.oid,'SELECT') end as authenticated_can_select
  from (select to_regclass('public.staff_directory_v') as oid) x
  left join pg_class c on c.oid=x.oid
)
select jsonb_build_object(
  'database',current_database(),
  'connected_role',current_user,
  'postgres_version',current_setting('server_version'),
  'migration_history',to_jsonb(m),
  'relations',r.report,
  'delivery_functions',f.report,
  'delivery_zone_grants',to_jsonb(g),
  'staff_directory_view',to_jsonb(s)
) as read_only_preflight
from migration_status m
cross join relation_report r
cross join function_report f
cross join zone_grants g
cross join staff_view s;
