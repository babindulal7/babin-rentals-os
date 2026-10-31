-- 0187_delivery_dispatch_rpcs.sql
-- Delivery dispatch on the database (T4-01, Phase 2, W46, W47)
-- Re-grants execution on delivery RPCs revoked by 0166, adds vehicle and rider tracking,
-- and aligns transition permissions with DELIVERY_DISPATCH_PHASE2.md.
begin;

alter table public.delivery_jobs
  add column if not exists vehicle text,
  add column if not exists rider_name text,
  add column if not exists rider_phone text;

-- Drop older signatures if needed so signature changes cleanly
drop function if exists public.delivery_create_job(uuid,text,timestamptz,uuid);
drop function if exists public.delivery_assign_driver(uuid,uuid,uuid);
drop function if exists public.delivery_transition_job(uuid,text,text,uuid,text,text);

create function public.delivery_create_job(
  p_booking_id uuid,
  p_leg text,
  p_scheduled_at timestamptz,
  p_key uuid,
  p_vehicle text default null,
  p_rider_name text default null,
  p_rider_phone text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_booking public.bookings%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if v_actor is null or v_role not in ('Owner','Admin','Manager','Coordinator')
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active)
     or p_key is null or p_leg not in ('Outbound','Return') or p_scheduled_at is null then
    raise exception 'Delivery creation is not authorized or required fields are missing' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for share;
  if not found or v_booking.cancelled_at is not null or v_booking.stage = 'Quote'
     or (p_leg = 'Outbound' and v_booking.delivery_type = 'Client Pickup') then
    raise exception 'No active booked delivery is eligible for this leg';
  end if;

  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u
    where u.id = v_actor and u.branch_id = v_booking.branch_id
  ) then
    raise exception 'Delivery branch access denied' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where client_uuid = p_key;
  if found then
    if v_job.booking_id = p_booking_id and v_job.leg = p_leg
       and v_job.scheduled_at = p_scheduled_at and v_job.created_by = v_actor then
      return v_job.id;
    end if;
    raise exception 'Delivery creation key was already used for different data';
  end if;

  insert into public.delivery_jobs (
    client_uuid, booking_id, branch_id, leg, scheduled_at,
    vehicle, rider_name, rider_phone,
    created_by, updated_by
  ) values (
    p_key, p_booking_id, v_booking.branch_id, p_leg, p_scheduled_at,
    nullif(btrim(p_vehicle), ''), nullif(btrim(p_rider_name), ''), nullif(btrim(p_rider_phone), ''),
    v_actor, v_actor
  ) returning * into v_job;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, next_status, actor_id, metadata
  ) values (
    p_key, v_job.id, 'Created', 'Scheduled', v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'vehicle', nullif(btrim(p_vehicle), ''),
      'rider_name', nullif(btrim(p_rider_name), '')
    ))
  );

  return v_job.id;
end;
$$;

create function public.delivery_assign_driver(
  p_job_id uuid,
  p_driver_id uuid default null,
  p_request_key uuid default null,
  p_vehicle text default null,
  p_rider_name text default null,
  p_rider_phone text default null
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
begin
  if v_actor is null or v_role not in ('Owner','Admin','Manager','Coordinator')
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active)
     or p_job_id is null or p_request_key is null then
    raise exception 'Driver assignment not authorized' using errcode = '42501';
  end if;

  if p_driver_id is null and nullif(btrim(coalesce(p_rider_name, '')), '') is null then
    raise exception 'Either a staff driver or an external rider name is required for assignment';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then raise exception 'Branch access denied' using errcode = '42501'; end if;

  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    if v_receipt.job_id = p_job_id and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Assigned' then
      return p_job_id;
    end if;
    raise exception 'Assignment key belongs to a different request';
  end if;

  if not exists (select 1 from public.bookings b where b.id = v_job.booking_id and b.cancelled_at is null) then
    raise exception 'Cancelled booking cannot receive a driver assignment';
  end if;

  if v_job.status not in ('Scheduled','Ready') then
    raise exception 'Driver cannot be reassigned during or after dispatch';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.users u
    where u.id = p_driver_id and u.primary_role = 'Driver'
      and u.is_active and u.branch_id = v_job.branch_id
  ) then
    raise exception 'The driver is not active in this branch';
  end if;

  update public.delivery_jobs
     set assigned_driver_id = p_driver_id,
         rider_name = coalesce(nullif(btrim(p_rider_name), ''), rider_name),
         rider_phone = coalesce(nullif(btrim(p_rider_phone), ''), rider_phone),
         vehicle = coalesce(nullif(btrim(p_vehicle), ''), vehicle),
         version = version + 1,
         updated_at = now(),
         updated_by = v_actor
   where id = p_job_id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    p_request_key, p_job_id, 'Assigned', v_job.status, v_job.status, v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'driver_id', p_driver_id,
      'rider_name', nullif(btrim(p_rider_name), ''),
      'vehicle', nullif(btrim(p_vehicle), '')
    ))
  );

  return p_job_id;
end;
$$;

create function public.delivery_transition_job(
  p_job_id uuid,
  p_expected_status text,
  p_next_status text,
  p_request_key uuid,
  p_recipient text default null,
  p_note text default null
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
  v_booking public.bookings%rowtype;
  v_receipt public.delivery_job_events%rowtype;
  v_manager boolean;
  v_warehouse boolean;
  v_assigned_driver boolean;
begin
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active) then
    raise exception 'Delivery transition requires an authenticated actor' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  v_manager := v_role in ('Owner','Admin') or (
    v_role in ('Manager','Coordinator') and exists (
      select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
    )
  );
  v_warehouse := v_role = 'Warehouse' and exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  );
  v_assigned_driver := v_role = 'Driver' and v_job.assigned_driver_id = v_actor;

  if not (v_manager or v_warehouse or v_assigned_driver) then
    raise exception 'Delivery transition role or assignment denied' using errcode = '42501';
  end if;

  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    if v_receipt.job_id = p_job_id and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Transition'
       and v_receipt.previous_status = p_expected_status
       and v_receipt.next_status = p_next_status
       and v_receipt.metadata->>'request_fingerprint' = md5(
         jsonb_build_array(p_request_key::text, coalesce(btrim(p_recipient),''), coalesce(btrim(p_note),''))::text
       ) then
      return p_job_id;
    end if;
    raise exception 'Transition key belongs to a different request';
  end if;

  if v_job.status is distinct from p_expected_status then
    raise exception 'Delivery status changed. Reload before saving.' using errcode = '40001';
  end if;

  if not (
      (p_expected_status = 'Scheduled' and p_next_status = 'Ready' and (v_manager or v_warehouse))
   or (p_expected_status = 'Ready' and p_next_status = 'In Transit' and (v_manager or v_assigned_driver))
   or (p_expected_status = 'In Transit' and p_next_status = 'Delivered' and (v_manager or v_assigned_driver))
   or (p_expected_status in ('Scheduled','Ready','In Transit') and p_next_status = 'Failed' and v_manager)
  ) then
    raise exception 'This delivery transition is not permitted' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = v_job.booking_id for share;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'Cancelled or missing booking cannot be dispatched';
  end if;

  if p_next_status in ('Ready','In Transit') and v_job.leg = 'Outbound'
     and v_booking.stage not in ('Packed','On Rent') then
    raise exception 'Packing must finish before outbound dispatch';
  end if;

  if p_next_status = 'In Transit' and (
    v_job.assigned_driver_id is null and nullif(btrim(coalesce(v_job.rider_name, '')), '') is null
  ) then
    raise exception 'An active assigned driver or hired rider is required before dispatch';
  end if;

  if p_next_status = 'Delivered' and length(btrim(coalesce(p_recipient,''))) < 2 then
    raise exception 'Delivery receipt requires the recipient name';
  end if;

  if p_next_status = 'Failed' and length(btrim(coalesce(p_note,''))) < 10 then
    raise exception 'Failed dispatch requires an explanatory note';
  end if;

  update public.delivery_jobs
  set status = p_next_status,
      dispatched_at = case when p_next_status = 'In Transit' then now() else dispatched_at end,
      delivered_at = case when p_next_status = 'Delivered' then now() else delivered_at end,
      received_by = case when p_next_status = 'Delivered' then btrim(p_recipient) else received_by end,
      last_note = nullif(btrim(coalesce(p_note,'')),''),
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where id = p_job_id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    p_request_key, p_job_id, 'Transition', p_expected_status, p_next_status, v_actor,
    jsonb_build_object('request_fingerprint', md5(
      jsonb_build_array(p_request_key::text, coalesce(btrim(p_recipient),''), coalesce(btrim(p_note),''))::text
    ))
  );

  return p_job_id;
end;
$$;

-- Grant execution to authenticated only (no anon)
revoke all on function public.delivery_create_job(uuid,text,timestamptz,uuid,text,text,text) from public, anon;
revoke all on function public.delivery_assign_driver(uuid,uuid,uuid,text,text,text) from public, anon;
revoke all on function public.delivery_transition_job(uuid,text,text,uuid,text,text) from public, anon;

grant execute on function public.delivery_create_job(uuid,text,timestamptz,uuid,text,text,text) to authenticated;
grant execute on function public.delivery_assign_driver(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.delivery_transition_job(uuid,text,text,uuid,text,text) to authenticated;

commit;
