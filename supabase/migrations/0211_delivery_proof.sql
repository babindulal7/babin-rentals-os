-- 0211_delivery_proof.sql
-- T4-03: Proof of delivery — evidence photo + recipient signature stored on the job
-- Delivered is terminal; this RPC attaches proof without changing status.
-- Mirrors T4-01 RPC patterns: actor resolution, idempotency key, fingerprint, audit event.

begin;

-- 1. Add proof columns to delivery_jobs (opaque storage paths, no FK)
alter table public.delivery_jobs
  add column if not exists proof_photo_path text,
  add column if not exists proof_signature_path text,
  add column if not exists proof_attached_at timestamptz,
  add column if not exists proof_attached_by uuid references public.users(id);

-- Proof columns are only meaningful when status = 'Delivered'
alter table public.delivery_jobs
  add constraint delivery_job_proof_requires_delivered
    check (
      proof_photo_path is null
      and proof_signature_path is null
      and proof_attached_at is null
      and proof_attached_by is null
      or status = 'Delivered'
    );

-- 2. Extend delivery_job_events event_kind to include 'Proof'
alter table public.delivery_job_events
  drop constraint if exists delivery_job_events_event_kind_check;

alter table public.delivery_job_events
  add constraint delivery_job_events_event_kind_check
    check (event_kind in ('Created', 'Assigned', 'Transition', 'Rescheduled', 'Proof'));

-- 3. RPC: delivery_attach_proof
create or replace function public.delivery_attach_proof(
  p_job_id uuid,
  p_request_key uuid,
  p_photo_path text default null,
  p_signature_path text default null,
  p_fingerprint text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_receipt public.delivery_job_events%rowtype;
  v_manager boolean;
  v_warehouse boolean;
  v_assigned_driver boolean;
  v_fingerprint text;
begin
  -- Authenticated actor required
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active) then
    raise exception 'Proof attachment requires an authenticated actor' using errcode = '42501';
  end if;

  -- At least one proof artifact must be provided
  if p_photo_path is null and p_signature_path is null then
    raise exception 'At least one proof artifact (photo or signature) must be provided';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  -- Role gating: Manager/Coordinator (branch), Warehouse (branch), Assigned Driver
  v_manager := v_role in ('Owner','Admin') or (
    v_role in ('Manager','Coordinator') and exists (
      select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
    )
  );
  v_warehouse := v_role = 'Warehouse' and exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  );
  -- RULING 2026-11-02: coalesce, or a Driver on a job with no assigned driver gets NULL (true AND NULL),
  -- 'not (false or false or NULL)' is NULL, and the IF below would not raise: any Driver could attach proof (B-1).
  v_assigned_driver := coalesce(v_role = 'Driver' and v_job.assigned_driver_id = v_actor, false);

  if not coalesce(v_manager or v_warehouse or v_assigned_driver, false) then
    raise exception 'Proof attachment role or assignment denied' using errcode = '42501';
  end if;

  -- Delivered is terminal — proof can only be attached to Delivered jobs
  if v_job.status <> 'Delivered' then
    raise exception 'Proof can only be attached to Delivered deliveries';
  end if;

  -- Idempotency: request_key must be unique per operation+actor
  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    v_fingerprint := md5(
      jsonb_build_array(
        p_request_key::text,
        coalesce(p_photo_path, ''),
        coalesce(p_signature_path, '')
      )::text
    );
    if v_receipt.job_id = p_job_id
       and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Proof'
       and v_receipt.metadata->>'request_fingerprint' = v_fingerprint then
      return p_job_id; -- idempotent replay
    end if;
    raise exception 'Proof key belongs to a different request' using errcode = '42501';
  end if;

  -- Attach proof paths
  update public.delivery_jobs
  set proof_photo_path = coalesce(proof_photo_path, p_photo_path),
      proof_signature_path = coalesce(proof_signature_path, p_signature_path),
      proof_attached_at = now(),
      proof_attached_by = v_actor,
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where id = p_job_id;

  -- Audit event
  insert into public.delivery_job_events
    (request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata)
  values (
    p_request_key,
    p_job_id,
    'Proof',
    'Delivered',
    'Delivered',
    v_actor,
    jsonb_build_object(
      'request_fingerprint', md5(
        jsonb_build_array(
          p_request_key::text,
          coalesce(p_photo_path, ''),
          coalesce(p_signature_path, '')
        )::text
      ),
      'photo_path', p_photo_path,
      'signature_path', p_signature_path
    )
  );

  return p_job_id;
end;
$$;

-- Revoke from anon; grant to authenticated
revoke all on function public.delivery_attach_proof(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delivery_attach_proof(uuid, uuid, text, text, text) to authenticated;

-- 4. Contract assertion
do $verify$
begin
 if has_table_privilege('authenticated','public.delivery_jobs','INSERT')
   or has_table_privilege('authenticated','public.delivery_jobs','UPDATE')
   or has_table_privilege('authenticated','public.delivery_jobs','DELETE')
   or has_function_privilege('anon','public.delivery_attach_proof(uuid,uuid,text,text,text)','EXECUTE')
 then raise exception '0211: delivery proof API exposure must fail closed'; end if;
end;
$verify$;

commit;
