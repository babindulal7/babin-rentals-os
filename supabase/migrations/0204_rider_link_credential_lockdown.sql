-- 0204_rider_link_credential_lockdown.sql
-- Review finding SEC-1 (CLAUDE_PR35_SECURITY_REVIEW.md): the rider token hash was a working credential.
--
-- Before: 0190 granted SELECT on delivery_job_links to `authenticated` (including the token_hash column)
-- and made the three rider RPCs executable by `authenticated`. Those RPCs take the HASH, not the raw token,
-- so any staff role the read policy admits (Owner, Admin, branch Manager/Coordinator/Warehouse) could read a
-- hash and mark pickup or delivery as the rider, audited as the link creator with the role hard-coded
-- 'Coordinator'. docs/PERMISSIONS.md 7.1 says direct table access is denied to anon and authenticated and
-- that the rider path is the Edge Function only.
--
-- After:
--   1. get_rider_job_by_token, rider_mark_picked_up, rider_complete_delivery are executable by
--      service_role only (the rider-link Edge Function). Nobody signed in can call them.
--   2. authenticated may read every column of delivery_job_links EXCEPT token_hash (column-level grant);
--      the existing row policy still decides which rows. Staff screens list links without the hash.
--   3. rider_complete_delivery audits with the link creator's real role, not a hard-coded 'Coordinator',
--      and records that the action came through a rider link.
--
-- RULING 2026-11-01 (Claude, build-time authority, B-1 stricter wins): applies PERMISSIONS 7.1 as written.
-- Nothing is widened. Revert = re-grant execute on the three RPCs to authenticated and SELECT on the table
-- to authenticated, and restore the 0190 body of rider_complete_delivery (hard-coded 'Coordinator').
begin;

-- 1. Rider RPCs: service_role only.
revoke all on function public.get_rider_job_by_token(text) from public, anon, authenticated;
revoke all on function public.rider_mark_picked_up(text) from public, anon, authenticated;
revoke all on function public.rider_complete_delivery(text, text, text, text) from public, anon, authenticated;

grant execute on function public.get_rider_job_by_token(text) to service_role;
grant execute on function public.rider_mark_picked_up(text) to service_role;
grant execute on function public.rider_complete_delivery(text, text, text, text) to service_role;

-- 2. Table: no table-wide read; every column except token_hash.
revoke select on public.delivery_job_links from authenticated;
grant select (
  id, job_id, rider_name, rider_phone, created_at, expires_at,
  revoked_at, revoked_by, completed_at, created_by
) on public.delivery_job_links to authenticated;

-- 3. rider_complete_delivery: same body as 0190, audit role is the creator's real role.
create or replace function public.rider_complete_delivery(
  p_token_hash text,
  p_receiver_name text,
  p_signature_svg text default null,
  p_photo_url text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
  v_clean_receiver text;
  v_creator_role public.system_role;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  v_clean_receiver := btrim(coalesce(p_receiver_name, ''));
  if length(v_clean_receiver) < 2 then
    raise exception 'Receiver name is required (minimum 2 characters)';
  end if;

  select * into v_link from public.delivery_job_links where token_hash = p_token_hash for update;
  if not found then raise exception 'Delivery link does not exist' using errcode = '42501'; end if;
  if v_link.revoked_at is not null then raise exception 'Delivery link has been revoked' using errcode = '42501'; end if;
  if v_link.expires_at <= now() then raise exception 'Delivery link has expired' using errcode = '42501'; end if;
  if v_link.completed_at is not null then raise exception 'Delivery link has already been completed' using errcode = '42501'; end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_job.status = 'Delivered' then
    raise exception 'Delivery job is already marked as Delivered';
  end if;

  if v_job.status = 'Failed' then
    raise exception 'Delivery job is marked as Failed and cannot be completed';
  end if;

  select u.primary_role into v_creator_role from public.users u where u.id = v_link.created_by;

  -- Complete the link atomically
  update public.delivery_job_links
     set completed_at = now()
   where id = v_link.id;

  -- Complete the job
  update public.delivery_jobs
     set status = 'Delivered',
         delivered_at = now(),
         received_by = v_clean_receiver,
         version = version + 1,
         updated_at = now()
   where id = v_job.id;

  -- Record event
  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    gen_random_uuid(),
    v_job.id,
    'Transition',
    v_job.status,
    'Delivered',
    v_link.created_by,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'acted_via', 'rider_link',
      'receiver_name', v_clean_receiver,
      'has_signature', p_signature_svg is not null and length(p_signature_svg) > 10,
      'has_photo', p_photo_url is not null and length(p_photo_url) > 5,
      'signature_svg', p_signature_svg,
      'photo_url', p_photo_url
    )
  );

  -- Record audit event: attributed to the staff member who issued the link (the rider has no account),
  -- with their real role and an explicit marker that a rider link performed the action.
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Update',
    'Informational',
    'Success',
    'delivery_jobs',
    v_job.id,
    v_link.created_by,
    v_creator_role,
    v_job.branch_id,
    jsonb_build_object(
      'acted_via', 'rider_link',
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'receiver_name', v_clean_receiver
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'Delivered',
    'delivered_at', now(),
    'received_by', v_clean_receiver
  );
end;
$$;

-- create or replace keeps grants, but state them again so this file is self-contained.
revoke all on function public.rider_complete_delivery(text, text, text, text) from public, anon, authenticated;
grant execute on function public.rider_complete_delivery(text, text, text, text) to service_role;

-- 4. Verification
do $verify$
begin
  if has_function_privilege('authenticated', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0204: rider RPCs must be executable by service_role only';
  end if;

  if not (has_function_privilege('service_role', 'public.get_rider_job_by_token(text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.rider_mark_picked_up(text)', 'EXECUTE')
          and has_function_privilege('service_role', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE'))
  then
    raise exception '0204: service_role must keep EXECUTE on the rider RPCs (the Edge Function needs it)';
  end if;

  if has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT')
     or has_table_privilege('authenticated', 'public.delivery_job_links', 'SELECT')
     or has_table_privilege('authenticated', 'public.delivery_job_links', 'INSERT')
     or has_table_privilege('authenticated', 'public.delivery_job_links', 'UPDATE')
     or has_table_privilege('authenticated', 'public.delivery_job_links', 'DELETE')
  then
    raise exception '0204: authenticated must not read token_hash or hold table-wide privileges on delivery_job_links';
  end if;

  if not has_column_privilege('authenticated', 'public.delivery_job_links', 'job_id', 'SELECT') then
    raise exception '0204: authenticated must keep SELECT on the non-secret columns of delivery_job_links';
  end if;
end;
$verify$;

commit;
