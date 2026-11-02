-- SEC-05 / T8-09 W68 — Restore the Driver client-directory exclusion lost in
-- 0188_staff_renting_gear.sql (applied after 0170_astra_phase0_authorization.sql).
--
-- 0170 intentionally wraps all public masking views, except staff_directory_v,
-- with the Driver exclusion. 0188 recreates clients_v and client_directory_v
-- when adding Staff client fields, accidentally replacing that exclusion with
-- auth_is_staff() only (Drivers are staff). A Driver, even without an assigned
-- trip, can then read private client directory rows via these owner-rights views.
--
-- Preserve original view columns, masks, ACLs, dependent views, and staff-client
-- metadata; add only the lost row predicate. Do not switch the masking views to
-- security_invoker or grant base-column read privileges: those weaken money/PII
-- protection. Do not edit either previously applied migration.
--
-- Verification: check-astra-phase0.mjs SEC-05 must pass for assigned and
-- completed Driver, while Owner sees client directory and staff-client fields.
-- Hosted JWT/PostgREST verification still required before live migration apply.
begin;

do $restore_driver_scope$
declare
  view_name text;
  definition text;
begin
  foreach view_name in array array['clients_v', 'client_directory_v']
  loop
    -- Match the reviewed 0170 wrapping method: get the current (post-0188)
    -- SELECT list from pg_get_viewdef, then append an outer row gate.
    -- CREATE OR REPLACE VIEW keeps existing column definitions and grants.
    select regexp_replace(
      pg_get_viewdef(format('public.%I', view_name)::regclass, true),
      ';[[:space:]]*$',
      ''
    ) into definition;

    if definition is null or btrim(definition) = '' then
      raise exception 'Cannot verify effective % view definition', view_name;
    end if;

    execute format(
      'create or replace view public.%I as select scoped.* from (%s) scoped where public.auth_user_role() <> ''Driver''',
      view_name,
      definition
    );
  end loop;
end
$restore_driver_scope$;

-- No schema or ACL widening. Repeat after a subsequent view recreation
-- (new fields, renamed columns) and add SEC-05 regression tests to CI.
commit;
