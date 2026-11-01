-- 0191_rider_token_privilege_lockdown.sql
-- T4-08 R1: rider bearer token hash is a credential, NOT staff-readable metadata.
-- The public /rider/:token entry point is exclusively the Edge Function using
-- service_role. Authenticated staff must not execute token-based rider functions.
-- Migration 0190 must precede this file. No live application is implied.
begin;

-- Explicitly close all default/public/authenticated execution paths. Previous
-- migration 0190 mistakenly granted these SECURITY DEFINER RPCs to authenticated.
revoke execute on function public.get_rider_job_by_token(text) from public, anon, authenticated;
revoke execute on function public.rider_mark_picked_up(text) from public, anon, authenticated;
revoke execute on function public.rider_complete_delivery(text, text, text, text)
  from public, anon, authenticated;

-- The Edge Function is the only intended caller of rider token RPCs. Retain
-- authenticated access to create_rider_link / revoke_rider_link: each validates
-- the staff role, actor identity and job branch internally.
grant execute on function public.get_rider_job_by_token(text) to service_role;
grant execute on function public.rider_mark_picked_up(text) to service_role;
grant execute on function public.rider_complete_delivery(text, text, text, text)
  to service_role;

-- A SHA-256 token hash is a bearer credential. 0190 granted table-level SELECT
-- to all authenticated users. RLS limits rows but does NOT protect the hash
-- column on rows a staff member can see. Remove that table-wide grant.
revoke select on public.delivery_job_links from public, anon, authenticated;

-- Preserve the staff's RLS-scoped link management list WITHOUT token_hash,
-- and without full-table access. The app's getJobRiderLinks() selects precisely
-- these eight metadata columns. The original row-level RLS policy still applies.
grant select (
  id, job_id, rider_name, rider_phone,
  created_at, expires_at, revoked_at, completed_at
) on public.delivery_job_links to authenticated;

-- Fail the migration if either direct RPC execution or credential read-through
-- remains available. Also ensure the service-role Edge Function retains access.
do $rider_lockdown_verify$
begin
  if has_function_privilege('authenticated', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_complete_delivery(text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_complete_delivery(text,text,text,text)', 'EXECUTE')
  then
    raise exception '0191: rider token RPC must be restricted to service_role';
  end if;

  if has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT')
     or has_column_privilege('anon', 'public.delivery_job_links', 'token_hash', 'SELECT')
  then
    raise exception '0191: rider token hashes remain visible to clients';
  end if;

  if not has_column_privilege('authenticated', 'public.delivery_job_links', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.delivery_job_links', 'job_id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.delivery_job_links', 'rider_name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.delivery_job_links', 'completed_at', 'SELECT')
  then
    raise exception '0191: staff link metadata reads are unexpectedly unavailable';
  end if;

  if not has_function_privilege('service_role', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rider_complete_delivery(text,text,text,text)', 'EXECUTE')
  then
    raise exception '0191: Edge Function service_role lost rider token RPC access';
  end if;
end;
$rider_lockdown_verify$;

commit;
