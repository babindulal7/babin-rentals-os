-- 0164_delivery_jobs_and_event_rpc.sql
-- SOURCE PROPOSAL ONLY. DO NOT APPLY TO LIVE SUPABASE.
-- Requires migration-ledger reconciliation (including separate proposed 0163),
-- staging restore rehearsal and Owner approval under DEPLOYMENT.md N-5.
-- A delivery event does not advance a booking stage, prove a signed contract,
-- receive a payment, or waive the existing handover/return gates.
begin;

create table public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  booking_id uuid not null references public.bookings(id),
  branch_id uuid not null references public.branches(id),
  leg text not null check (leg in ('Outbound', 'Return')),
  scheduled_at timestamptz not null,
  status text not null default 'Scheduled'
    check (status in ('Scheduled', 'Ready', 'In Transit', 'Delivered', 'Failed')),
  assigned_driver_id uuid references public.users(id),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  received_by text,
  last_note text,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.users(id),
  updated_at timestamptz not null default now(),
  constraint delivery_job_one_leg_per_booking unique (booking_id, leg),
  constraint delivery_job_delivered_requires_receipt
    check (status <> 'Delivered' or (delivered_at is not null and nullif(btrim(received_by), '') is not null)),
  constraint delivery_job_dispatched_requires_clock
    check (status <> 'In Transit' or dispatched_at is not null)
);
create index delivery_jobs_driver_status_idx on public.delivery_jobs(assigned_driver_id,status);
create index delivery_jobs_branch_schedule_idx on public.delivery_jobs(branch_id,scheduled_at);

-- Durable action receipt. The request key identifies ONE operation and actor.
-- Never store a contact number or other client PII in event metadata.
create table public.delivery_job_events (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  job_id uuid not null references public.delivery_jobs(id),
  event_kind text not null check (event_kind in ('Created', 'Assigned', 'Transition')),
  previous_status text,
  next_status text not null,
  actor_id uuid not null references public.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index delivery_events_job_created_idx on public.delivery_job_events(job_id, created_at);

alter table public.delivery_jobs enable row level security;
alter table public.delivery_job_events enable row level security;

-- Only the explicit RPCs may mutate. A browser cannot directly create,
-- forge a driver assignment or back-date/audit-delete a transition.
revoke all on public.delivery_jobs from public, anon, authenticated;
revoke all on public.delivery_job_events from public, anon, authenticated;
grant select on public.delivery_jobs to authenticated;
grant select on public.delivery_job_events to authenticated;

-- Direct staff-role reads below bind role to auth.uid() *and* active staff row.
-- No client-supplied role, claim override or app.current_user_id fallback is trusted.
create policy delivery_jobs_authenticated_read on public.delivery_jobs
  for select to authenticated using (
    auth.uid() is not null and exists (
      select 1 from public.users u where u.id = auth.uid() and u.is_active and (
        u.primary_role in ('Owner','Admin')
        or (u.primary_role in ('Manager','Coordinator','Warehouse')
            and u.branch_id = delivery_jobs.branch_id)
        or (u.primary_role = 'Driver' and delivery_jobs.assigned_driver_id = u.id)
      )
    )
  );

create policy delivery_job_events_authenticated_read on public.delivery_job_events
  for select to authenticated using (
    auth.uid() is not null
    and exists (select 1 from public.delivery_jobs j where j.id = delivery_job_events.job_id)
  );

create function public.delivery_create_job(
  p_booking_id uuid, p_leg text, p_scheduled_at timestamptz, p_key uuid
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
     or not exists (select 1 from public.users u where u.id=v_actor and u.is_active)
     or p_key is null or p_leg not in ('Outbound','Return') or p_scheduled_at is null then
    raise exception 'Delivery creation is not authorized or required fields are missing' using errcode='42501';
  end if;
  select * into v_booking from public.bookings where id=p_booking_id for share;
  if not found or v_booking.cancelled_at is not null or v_booking.stage='Quote'
     or (p_leg='Outbound' and v_booking.delivery_type='Client Pickup') then
    raise exception 'No active booked delivery is eligible for this leg';
  end if;
  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u
    where u.id=v_actor and u.branch_id=v_booking.branch_id
  ) then raise exception 'Delivery branch access denied' using errcode='42501'; end if;

  select * into v_job from public.delivery_jobs where client_uuid=p_key;
  if found then
    if v_job.booking_id=p_booking_id and v_job.leg=p_leg
       and v_job.scheduled_at=p_scheduled_at and v_job.created_by=v_actor then
      return v_job.id;
    end if;
    raise exception 'Delivery creation key was already used for different data';
  end if;

  insert into public.delivery_jobs
    (client_uuid, booking_id, branch_id, leg, scheduled_at, created_by, updated_by)
  values (p_key,p_booking_id,v_booking.branch_id,p_leg,p_scheduled_at,v_actor,v_actor)
  returning * into v_job;

  insert into public.delivery_job_events
    (request_key,job_id,event_kind,next_status,actor_id)
  values (p_key,v_job.id,'Created','Scheduled',v_actor);
  return v_job.id;
end;
$$;

create function public.delivery_assign_driver(
  p_job_id uuid, p_driver_id uuid, p_request_key uuid
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
     or not exists (select 1 from public.users u where u.id=v_actor and u.is_active)
     or p_job_id is null or p_driver_id is null or p_request_key is null then
    raise exception 'Driver assignment not authorized' using errcode='42501';
  end if;
  select * into v_job from public.delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u where u.id=v_actor and u.branch_id=v_job.branch_id
  ) then raise exception 'Branch access denied' using errcode='42501'; end if;

  select * into v_receipt from public.delivery_job_events where request_key=p_request_key;
  if found then
    if v_receipt.job_id=p_job_id and v_receipt.actor_id=v_actor
       and v_receipt.event_kind='Assigned'
       and v_receipt.metadata->>'driver_id'=p_driver_id::text then
      return p_job_id;
    end if;
    raise exception 'Assignment key belongs to a different request';
  end if;
  if not exists (select 1 from public.bookings b where b.id=v_job.booking_id and b.cancelled_at is null) then
    raise exception 'Cancelled booking cannot receive a driver assignment';
  end if;
  if v_job.status not in ('Scheduled','Ready') then
    raise exception 'Driver cannot be reassigned during or after dispatch';
  end if;
  if not exists (
    select 1 from public.users u
    where u.id=p_driver_id and u.primary_role='Driver'
      and u.is_active and u.branch_id=v_job.branch_id
  ) then raise exception 'The driver is not active in this branch'; end if;

  update public.delivery_jobs
     set assigned_driver_id=p_driver_id, version=version+1,updated_at=now(),updated_by=v_actor
   where id=p_job_id;
  insert into public.delivery_job_events
    (request_key,job_id,event_kind,previous_status,next_status,actor_id,metadata)
  values (p_request_key,p_job_id,'Assigned',v_job.status,v_job.status,v_actor,
          jsonb_build_object('driver_id',p_driver_id));
  return p_job_id;
end;
$$;

create function public.delivery_transition_job(
  p_job_id uuid, p_expected_status text, p_next_status text,
  p_request_key uuid, p_recipient text default null, p_note text default null
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
     or not exists (select 1 from public.users u where u.id=v_actor and u.is_active) then
    raise exception 'Delivery transition requires an authenticated actor' using errcode='42501';
  end if;
  select * into v_job from public.delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  v_manager := v_role in ('Owner','Admin') or (
    v_role in ('Manager','Coordinator') and exists (
      select 1 from public.users u where u.id=v_actor and u.branch_id=v_job.branch_id
    )
  );
  v_warehouse := v_role='Warehouse' and exists (
    select 1 from public.users u where u.id=v_actor and u.branch_id=v_job.branch_id
  );
  v_assigned_driver := v_role='Driver' and v_job.assigned_driver_id=v_actor;
  if not (v_manager or v_warehouse or v_assigned_driver) then
    raise exception 'Delivery transition role or assignment denied' using errcode='42501';
  end if;

  select * into v_receipt from public.delivery_job_events where request_key=p_request_key;
  if found then
    if v_receipt.job_id=p_job_id and v_receipt.actor_id=v_actor
       and v_receipt.event_kind='Transition'
       and v_receipt.previous_status=p_expected_status
       and v_receipt.next_status=p_next_status
       and v_receipt.metadata->>'request_fingerprint' = md5(
         p_request_key::text || '|' ||
         coalesce(btrim(p_recipient),'') || '|' || coalesce(btrim(p_note),'')
       ) then
      return p_job_id;
    end if;
    raise exception 'Transition key belongs to a different request';
  end if;

  if v_job.status is distinct from p_expected_status then
    raise exception 'Delivery status changed. Reload before saving.' using errcode='40001';
  end if;
  if not (
      (p_expected_status='Scheduled' and p_next_status='Ready' and (v_manager or v_warehouse))
   or (p_expected_status='Ready' and p_next_status='In Transit' and (v_manager or v_assigned_driver))
   or (p_expected_status='In Transit' and p_next_status='Delivered' and (v_manager or v_assigned_driver))
   or (p_expected_status in ('Scheduled','Ready','In Transit') and p_next_status='Failed' and v_manager)
  ) then raise exception 'This delivery transition is not permitted'; end if;

  select * into v_booking from public.bookings where id=v_job.booking_id for share;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'Cancelled or missing booking cannot be dispatched'; end if;
  if p_next_status in ('Ready','In Transit') and v_job.leg='Outbound'
     and v_booking.stage not in ('Packed','On Rent') then
    raise exception 'Packing must finish before outbound dispatch';
  end if;
  if p_next_status='In Transit' and (
    v_job.assigned_driver_id is null or not exists (
      select 1 from public.users u
      where u.id=v_job.assigned_driver_id and u.primary_role='Driver'
        and u.is_active and u.branch_id=v_job.branch_id
    )
  ) then raise exception 'An active assigned driver is required before dispatch'; end if;
  if p_next_status='Delivered' and length(btrim(coalesce(p_recipient,'')))<2 then
    raise exception 'Delivery receipt requires the recipient name';
  end if;
  if p_next_status='Failed' and length(btrim(coalesce(p_note,'')))<10 then
    raise exception 'Failed dispatch requires an explanatory note';
  end if;

  update public.delivery_jobs
  set status=p_next_status,
      dispatched_at=case when p_next_status='In Transit' then now() else dispatched_at end,
      delivered_at=case when p_next_status='Delivered' then now() else delivered_at end,
      received_by=case when p_next_status='Delivered' then btrim(p_recipient) else received_by end,
      last_note=nullif(btrim(coalesce(p_note,'')),''),
      version=version+1, updated_at=now(),updated_by=v_actor
  where id=p_job_id;

  insert into public.delivery_job_events
    (request_key,job_id,event_kind,previous_status,next_status,actor_id,metadata)
  values (p_request_key,p_job_id,'Transition',p_expected_status,p_next_status,v_actor,
          jsonb_build_object('request_fingerprint',md5(
            p_request_key::text || '|' ||
            coalesce(btrim(p_recipient),'') || '|' || coalesce(btrim(p_note),'')
          )));
  return p_job_id;
end;
$$;

-- No anonymous callable business RPCs. No direct updates/deletes at all.
revoke all on function public.delivery_create_job(uuid,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.delivery_assign_driver(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.delivery_transition_job(uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.delivery_create_job(uuid,text,timestamptz,uuid) to authenticated;
grant execute on function public.delivery_assign_driver(uuid,uuid,uuid) to authenticated;
grant execute on function public.delivery_transition_job(uuid,text,text,uuid,text,text) to authenticated;

-- Contract assertions: the API role must not get a bypass write surface.
do $verify$
begin
 if has_table_privilege('authenticated','public.delivery_jobs','INSERT')
   or has_table_privilege('authenticated','public.delivery_jobs','UPDATE')
   or has_table_privilege('authenticated','public.delivery_job_events','INSERT')
   or has_table_privilege('anon','public.delivery_jobs','SELECT')
   or has_function_privilege('anon','public.delivery_create_job(uuid,text,timestamptz,uuid)','EXECUTE')
   or has_function_privilege('anon','public.delivery_assign_driver(uuid,uuid,uuid)','EXECUTE')
   or has_function_privilege('anon','public.delivery_transition_job(uuid,text,text,uuid,text,text)','EXECUTE')
 then raise exception '0164: delivery API exposure must fail closed'; end if;
end;
$verify$;
commit;
