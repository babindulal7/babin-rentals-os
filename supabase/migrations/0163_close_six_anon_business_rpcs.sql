-- =============================================================================
-- 0163_close_six_anon_business_rpcs.sql
--
-- 2026-10-14 production privilege drift remediation (source-control proposal).
--
-- Live read-only audit found six SECURITY DEFINER business functions with
-- EXECUTE granted to anon, despite authenticated-only app workflows. This is
-- NOT proof of successful unauthorized mutation: each function has its own
-- guards, but the unwanted PostgREST RPC entry point should be closed.
--
-- The explicitly enumerated functions were observed in the active live project:
--   adjust_stock(uuid, integer, text, uuid, uuid)
--   portal_claim_by_verified_email()
--   read_quote_editor(text)
--   set_staff_active(uuid, boolean)
--   set_staff_role(uuid, system_role)
--   update_rental_quote(uuid, text, uuid, jsonb)
--
-- This migration changes NO data, row policies, table grants, trigger bodies,
-- authenticated-function grants, view definitions, or business logic.
-- Do not apply this or any other migration to production automatically.
-- N-5 requires current backup + checked live ledger + owner-reviewed cutover.
--
-- NOTE: Other Supabase advisor findings involve auth helper functions used by
-- RLS and trigger-returning functions. Blindly revoking those is NOT safe:
-- they require separate classification and behavioural tests.
-- =============================================================================

begin;

revoke execute on function public.adjust_stock(uuid, integer, text, uuid, uuid)
  from public, anon;
revoke execute on function public.portal_claim_by_verified_email()
  from public, anon;
revoke execute on function public.read_quote_editor(text)
  from public, anon;
revoke execute on function public.set_staff_active(uuid, boolean)
  from public, anon;
revoke execute on function public.set_staff_role(uuid, public.system_role)
  from public, anon;
revoke execute on function public.update_rental_quote(uuid, text, uuid, jsonb)
  from public, anon;

-- Gate every overload, not just the known signatures: new anonymous overloads
-- of these six business RPCs must not silently evade the closure.
do $verify$
declare
  v_unexpected text;
  v_auth_missing text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_unexpected
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'adjust_stock',
       'portal_claim_by_verified_email',
       'read_quote_editor',
       'set_staff_active',
       'set_staff_role',
       'update_rental_quote'
     )
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_unexpected is not null then
    raise exception '0163: business RPCs still callable by anon: %', v_unexpected;
  end if;

  -- Preserve signed-in workflows; do not solve anon access by breaking staff.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_auth_missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'adjust_stock',
       'portal_claim_by_verified_email',
       'read_quote_editor',
       'set_staff_active',
       'set_staff_role',
       'update_rental_quote'
     )
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_auth_missing is not null then
    raise exception '0163: authenticated RPC permissions missing: %', v_auth_missing;
  end if;
end
$verify$;

commit;
