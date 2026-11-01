-- 0191_delivery_reschedule_job.sql
-- Reschedule a delivery (T4-02, Ruling D8, Law 8)
-- Moves only the delivery job's scheduled time; booking rental dates stay unchanged (D8).
-- Change is recorded in delivery_job_events and audited.

begin;

alter table public.delivery_job_events
  drop constraint if exists delivery_job_events_event_kind_check;

alter table public.delivery_job_events
  add constraint delivery_job_events_event_kind_check
  check (event_kind in ('Created', 'Assigned', 'Transition', 'Rescheduled'));

create or replace function public.delivery_reschedule_job(
  p_job_id uuid,
  p_new_scheduled_at timestamptz,
  p_request_key uuid,
  p_notes text default null
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
  v_old_scheduled_at timestamptz;
begin
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active) then
    raise exception 'Delivery rescheduling requires an authenticated actor' using errcode = '42501';
  end if;

  if p_new_scheduled_at is null then
    raise exception 'New scheduled time is required for rescheduling';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  -- Only Owner, Admin, Manager, Coordinator (for matching branch) may reschedule delivery jobs
  if not (
    v_role in ('Owner','Admin') or (
      v_role in ('Manager','Coordinator') and exists (
        select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
      )
    )
  ) then
    raise exception 'Delivery rescheduling not permitted for role %', v_role using errcode = '42501';
  end if;

  -- Cannot reschedule terminal states (Delivered, Failed)
  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Delivered or Failed delivery jobs cannot be rescheduled';
  end if;

  -- Idempotency check via delivery_job_events (Law 8)
  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    if v_receipt.job_id = p_job_id and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Rescheduled' then
      return p_job_id;
    end if;
    raise exception 'Rescheduling key belongs to a different request';
  end if;

  if not exists (select 1 from public.bookings b where b.id = v_job.booking_id and b.cancelled_at is null) then
    raise exception 'Cancelled booking delivery cannot be rescheduled';
  end if;

  v_old_scheduled_at := v_job.scheduled_at;

  update public.delivery_jobs
     set scheduled_at = p_new_scheduled_at,
         last_note = coalesce(nullif(btrim(p_notes), ''), last_note),
         version = version + 1,
         updated_at = now(),
         updated_by = v_actor
   where id = p_job_id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    p_request_key, p_job_id, 'Rescheduled', v_job.status, v_job.status, v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'old_scheduled_at', v_old_scheduled_at,
      'new_scheduled_at', p_new_scheduled_at,
      'notes', nullif(btrim(p_notes), '')
    ))
  );

  return p_job_id;
end;
$$;

revoke all on function public.delivery_reschedule_job(uuid,timestamptz,uuid,text) from public, anon;
grant execute on function public.delivery_reschedule_job(uuid,timestamptz,uuid,text) to authenticated;

commit;
