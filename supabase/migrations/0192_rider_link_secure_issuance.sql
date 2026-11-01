-- 0192_rider_link_secure_issuance.sql
-- R2/R3: Prevent duplicate active links and stop browser-selected rider token hashes.
-- Requires 0190 rider links + 0191 token credential privilege lockdown.
-- GitHub draft only: inspect existing duplicate active links before applying on staging.
begin;

alter table public.delivery_job_links
  add column issue_request_key uuid;

-- A single active bearer credential per delivery job. Expired-but-unrevoked
-- records are closed by the issuance RPC *before* a replacement is inserted.
-- Do not silently remove pre-existing duplicate rows during migration.
create unique index delivery_job_links_one_active_job_idx
  on public.delivery_job_links(job_id)
  where revoked_at is null and completed_at is null;

create unique index delivery_job_links_issue_request_idx
  on public.delivery_job_links(issue_request_key)
  where issue_request_key is not null;

-- No authenticated caller may choose a token_hash. The Edge function is the
-- trusted issuer and must first validate the user's JWT with auth.getUser().
revoke execute on function public.create_rider_link(uuid, text, text, text)
  from public, anon, authenticated, service_role;

-- The Edge function calls this function using service_role AFTER checking the
-- signed-in user's JWT. p_actor_id MUST be taken from auth.getUser(jwt), never
-- from request JSON. We still independently validate staff role and job branch.
create or replace function public.issue_rider_link_server(
  p_job_id uuid,
  p_token_hash text,
  p_rider_name text,
  p_rider_phone text,
  p_actor_id uuid,
  p_request_key uuid
) returns table(link_id uuid, link_expires_at timestamptz, was_created boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor public.users%rowtype;
  v_job public.delivery_jobs%rowtype;
  v_existing public.delivery_job_links%rowtype;
  v_link_id uuid;
  v_expires_at timestamptz;
begin
  if p_actor_id is null or p_request_key is null or p_job_id is null then
    raise exception 'Invalid rider issuance request' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rider token hash' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_rider_name, ''))) < 2 or length(btrim(coalesce(p_rider_phone, ''))) < 7 then
    raise exception 'Invalid rider contact details' using errcode = '22023';
  end if;

  select * into v_actor
    from public.users
   where id = p_actor_id and is_active;
  if not found or v_actor.primary_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Not authorized to issue rider links' using errcode = '42501';
  end if;

  -- Row lock serializes issuance for the same job, including parallel requests
  -- with different idempotency keys. The unique index is a second guard.
  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Delivery job not found' using errcode = '22023';
  end if;
  if v_actor.primary_role not in ('Owner', 'Admin') and v_actor.branch_id is distinct from v_job.branch_id then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Cannot issue a rider link for a finished delivery job' using errcode = '22023';
  end if;

  -- Same request key cannot be reused for another actor, job or payload. A
  -- replay never gets a second raw token: only its existing metadata is sent.
  select * into v_existing from public.delivery_job_links
   where issue_request_key = p_request_key;
  if found then
    if v_existing.job_id is distinct from p_job_id
       or v_existing.created_by is distinct from p_actor_id
       or v_existing.rider_name is distinct from btrim(p_rider_name)
       or v_existing.rider_phone is distinct from btrim(p_rider_phone) then
      raise exception 'Rider issuance key belongs to another request' using errcode = '42501';
    end if;
    return query select v_existing.id, v_existing.expires_at, false;
    return;
  end if;

  -- Previously expired links cannot be used, and they should not block a
  -- new link forever. Close them without touching already completed links.
  update public.delivery_job_links
     set revoked_at = now(), revoked_by = p_actor_id
   where job_id = p_job_id
     and revoked_at is null and completed_at is null
     and expires_at <= now();

  if exists (
    select 1 from public.delivery_job_links
     where job_id = p_job_id and revoked_at is null and completed_at is null
  ) then
    raise exception 'An active rider link already exists. Revoke it before creating a replacement.'
      using errcode = '23505';
  end if;

  insert into public.delivery_job_links (
    job_id, token_hash, rider_name, rider_phone, created_by,
    issue_request_key
  ) values (
    p_job_id, p_token_hash, btrim(p_rider_name), btrim(p_rider_phone),
    p_actor_id, p_request_key
  ) returning id, expires_at into v_link_id, v_expires_at;

  -- Credential and idempotency key are intentionally absent from audit data.
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(), 'status change', 'Rentals', 'Operations', 'Create',
    'Informational', 'Success', 'delivery_job_links', v_link_id,
    p_actor_id, v_actor.primary_role, v_job.branch_id,
    jsonb_build_object(
      'job_id', p_job_id,
      'rider_name', btrim(p_rider_name),
      'rider_phone', btrim(p_rider_phone)
    )
  );

  return query select v_link_id, v_expires_at, true;
end;
$$;

revoke all on function public.issue_rider_link_server(uuid, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.issue_rider_link_server(uuid, text, text, text, uuid, uuid)
  to service_role;

do $verify$
begin
  if has_function_privilege('authenticated', 'public.create_rider_link(uuid,text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.issue_rider_link_server(uuid,text,text,text,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.issue_rider_link_server(uuid,text,text,text,uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.issue_rider_link_server(uuid,text,text,text,uuid,uuid)', 'EXECUTE')
  then
    raise exception '0192: rider issuance privilege gate is not closed';
  end if;
end;
$verify$;

commit;
