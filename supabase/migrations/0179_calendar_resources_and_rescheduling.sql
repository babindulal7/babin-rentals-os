-- RULING 2026-10-26: source-backed resources and whole-rental, fixed-duration moves.
-- LOCAL ONLY: WRITTEN; verification receipts are separate. NEVER apply to hosted Supabase.
begin;

-- 0180 replaces this refusal with the versioned agreement contract. Until then,
-- no signed agreement can be bypassed merely by moving from Calendar.
create or replace function record_editor_private.finalize_reschedule_agreement(
  p_booking_id uuid,p_expected_pickup timestamptz,p_expected_return timestamptz,
  p_proposal uuid,p_key uuid,p_expected_revision text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_proposal is not null or exists(select 1 from document_registry d
    where d.booking_id=p_booking_id and d.document_type='Rental Agreement'
      and d.signed_at is not null and d.voided_at is null) then
    raise exception 'A signed replacement agreement is required before these dates can change.';
  end if;
end $$;
revoke all on function record_editor_private.finalize_reschedule_agreement(uuid,timestamptz,timestamptz,uuid,uuid,text) from public,anon,authenticated;

create or replace function record_editor_private.calendar_unit_usable(p_unit uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from product_units u where u.id=p_unit
    and u.retired_at is null and u.status not in ('Retired','Missing','Maintenance')
    and u.condition not in ('Damaged','Lost')
    and not exists(select 1 from maintenance_records m where m.product_unit_id=u.id and m.completed_at is null)
    and not exists(select 1 from damage_findings d where d.unit_id=u.id and d.voided_at is null)
    and not exists(select 1 from cleaning_queue_entries q where q.unit_id=u.id
      and (nullif(btrim(q.qc_fail_reason),'') is not null or q.problem_state not in ('No Problems'))))
$$;
revoke all on function record_editor_private.calendar_unit_usable(uuid) from public,anon,authenticated;

create or replace function public.reschedule_rental(
  p_booking_id uuid,p_revision text,p_shift_days integer,p_reason text,p_key uuid,
  p_agreement_proposal uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid(); actor_role text; actor_branch uuid;
  booking bookings; old_pickup timestamptz; old_return timestamptz;
  new_pickup timestamptz; new_return timestamptz; request jsonb; receipt record; response jsonb;
  line record; holding record; occupied bigint; available bigint;
begin
  select primary_role::text,branch_id into actor_role,actor_branch from users
    where id=actor and is_active and deactivated_at is null;
  if actor is null or actor_role is null or actor_role not in ('Owner','Admin','Manager','Coordinator') then
    raise exception 'You cannot reschedule this rental.' using errcode='42501';
  end if;
  if p_booking_id is null or p_key is null or p_revision is null or p_shift_days is null or p_shift_days=0
      or length(btrim(coalesce(p_reason,'')))<10 then
    raise exception 'A rental revision, non-zero whole-day move, save key and reason of at least ten characters are required.';
  end if;
  request:=jsonb_build_object('operation','reschedule_rental','id',p_booking_id,'revision',p_revision,
    'shift_days',p_shift_days,'reason',btrim(p_reason),'agreement_proposal',p_agreement_proposal);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into booking from bookings where id=p_booking_id for update;
  if not found or booking.cancelled_at is not null or booking.archived_at is not null then
    raise exception 'This rental is unavailable for rescheduling.';
  end if;
  if actor_role not in ('Owner','Admin') and booking.branch_id is distinct from actor_branch then
    raise exception 'Rental branch access denied.' using errcode='42501';
  end if;
  -- A receipt proves a committed change, never current branch authorization.
  -- Re-check active target access before returning a previous actor's result.
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then
    if receipt.actor<>actor or receipt.request<>request then raise exception 'This save key belongs to another change.'; end if;
    return receipt.response;
  end if;
  if p_revision::timestamptz is distinct from booking.updated_at then
    raise exception 'This rental changed. Reload before rescheduling.' using errcode='40001';
  end if;
  if booking.stage not in ('Quote','Booked') or public.rental_has_pickup_evidence(booking.id) then
    raise exception 'Calendar can move only Quote or Booked rentals before handover. Use the existing rental actions.';
  end if;
  if exists(select 1 from crew_assignments where booking_id=booking.id)
     or exists(select 1 from crew_bookings where booking_id=booking.id and cancelled_at is null)
     or exists(select 1 from delivery_jobs where booking_id=booking.id)
     or exists(select 1 from booking_transport where booking_id=booking.id
       and (scheduled_at is not null or driver_id is not null or delivery_status<>'Scheduled')) then
    raise exception 'This rental has independently scheduled crew or delivery work. Update that work in its workspace first.';
  end if;
  old_pickup:=booking.pickup_at; old_return:=booking.return_at;
  -- A whole 24-hour day preserves Kathmandu wall-clock times and the 06:00 boundary.
  new_pickup:=old_pickup + p_shift_days*interval '24 hours';
  new_return:=old_return + p_shift_days*interval '24 hours';
  if new_pickup>=new_return then raise exception 'Rental return must follow pickup.'; end if;

  -- Lock product ceilings in a fixed order. The same product locks protect
  -- concurrent quantity reservations; own old holds are excluded from preview.
  for line in select p.id,p.tracking_mode,p.total_quantity,sum(bl.qty)::bigint as required
    from booking_lines bl join products p on p.id=bl.product_id
    where bl.booking_id=booking.id and bl.voided_at is null
    group by p.id,p.tracking_mode,p.total_quantity order by p.id
  loop
    perform 1 from products where id=line.id for update;
    if line.tracking_mode='Serialised' then
      if booking.stage='Booked' then
        select count(*) into available from inventory_reservations r
          join booking_lines bl on bl.id=r.booking_line_id
          join product_units u on u.id=r.asset_id
          where r.booking_id=booking.id and bl.product_id=line.id and bl.voided_at is null
            and r.released_at is null;
        if available<>line.required then raise exception 'Serialized reservations are incomplete. Reload the rental before moving it.'; end if;
        for holding in select r.asset_id from inventory_reservations r join product_units u on u.id=r.asset_id
          where r.booking_id=booking.id and u.product_id=line.id and r.released_at is null
        loop
          if not record_editor_private.calendar_unit_usable(holding.asset_id) then
            raise exception 'An assigned unit is blocked by damage, maintenance or QC. No dates changed.';
          end if;
          if exists(select 1 from inventory_reservations r where r.asset_id=holding.asset_id
            and r.booking_id<>booking.id and r.released_at is null
            and r.period && tstzrange(new_pickup,new_return,'[)')) then
            raise exception 'An assigned unit is reserved during the proposed dates. No dates changed.';
          end if;
        end loop;
      else
        select count(*) into available from product_units u where u.product_id=line.id
          and u.branch_id=booking.branch_id and record_editor_private.calendar_unit_usable(u.id)
          and not exists(select 1 from inventory_reservations r where r.asset_id=u.id
            and r.booking_id<>booking.id and r.released_at is null
            and r.period && tstzrange(new_pickup,new_return,'[)'));
        if available<line.required then raise exception 'Not enough usable units are available for the proposed dates.'; end if;
      end if;
    else
      if booking.stage='Booked' then
        select coalesce(sum(r.qty),0)::bigint into available
        from inventory_reservations r join booking_lines bl on bl.id=r.booking_line_id
        where r.booking_id=booking.id and bl.product_id=line.id and bl.voided_at is null
          and r.product_id=line.id and r.asset_id is null and r.released_at is null;
        if available<>line.required then
          raise exception 'Quantity reservations are incomplete. Reload the rental before moving it.';
        end if;
      end if;
      -- Peak concurrency, not the sum of disjoint reservations in the window.
      with points as (
        select new_pickup as at
        union select greatest(lower(r.period),new_pickup) from inventory_reservations r
          where r.product_id=line.id and r.booking_id<>booking.id and r.released_at is null
            and r.period && tstzrange(new_pickup,new_return,'[)')
      ) select coalesce(max((select coalesce(sum(r.qty),0) from inventory_reservations r
          where r.product_id=line.id and r.booking_id<>booking.id and r.released_at is null and r.period @> points.at)),0)
        into occupied from points;
      if occupied+line.required>line.total_quantity then
        raise exception 'Recorded quantity is insufficient during the proposed dates. No dates changed.';
      end if;
    end if;
  end loop;
  -- Price-only crew lines follow the rental window; distinct scheduling rows
  -- were refused above. booking_crew_lines names users; crew_bookings/leaves
  -- name the separate legacy crew_members registry and must not be joined by
  -- UUID or name. Lock assigned users in a stable order so concurrent rental
  -- moves cannot both pass the same old-window conflict check.
  for holding in select distinct c.crew_member_id as id from booking_crew_lines c
    where c.booking_id=booking.id and c.voided_at is null and c.crew_member_id is not null
    order by c.crew_member_id
  loop
    perform 1 from users where id=holding.id for update;
  end loop;
  -- A known v2 person cannot be moved into a confirmed rental clash.
  if exists(select 1 from booking_crew_lines c join booking_crew_lines other
      on other.crew_member_id=c.crew_member_id and other.booking_id<>booking.id and other.voided_at is null
      join bookings b on b.id=other.booking_id
      where c.booking_id=booking.id and c.voided_at is null and c.crew_member_id is not null
        and b.cancelled_at is null and b.stage in ('Booked','Packed','On Rent')
        and tstzrange(b.pickup_at,b.return_at,'[)') && tstzrange(new_pickup,new_return,'[)')) then
    raise exception 'An assigned crew member has a conflicting rental. No dates changed.';
  end if;

  update bookings set pickup_at=new_pickup,return_at=new_return,
    updated_at=clock_timestamp(),updated_by=actor where id=booking.id returning * into booking;
  -- 0124 updates holds and exercises GiST/capacity in this transaction. A
  -- failed signature or any following write rolls the dates and holds back.
  perform record_editor_private.finalize_reschedule_agreement(booking.id,new_pickup,new_return,p_agreement_proposal,p_key,p_revision);
  response:=jsonb_build_object('id',booking.id,'booking_no',booking.booking_no,
    'pickup_at',booking.pickup_at,'return_at',booking.return_at,'revision',booking.updated_at::text);
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,
    actor_id,actor_role,branch_id,reason,old_values,new_values)
  values(p_key,'status change','Rentals','Rentals','Update','Informational','Success','bookings',booking.id,
    actor,actor_role::system_role,booking.branch_id,btrim(p_reason),
    jsonb_build_object('pickup_at',old_pickup,'return_at',old_return),response);
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,actor,request,response);
  return response;
end $$;
revoke all on function public.reschedule_rental(uuid,text,integer,text,uuid,uuid) from public,anon;
grant execute on function public.reschedule_rental(uuid,text,integer,text,uuid,uuid) to authenticated;

-- One aggregate row avoids PostgREST row-limit truncation. Every field is
-- explicitly money-free. Source errors are unavailable, never a fake zero.
create or replace function public.calendar_resource_window(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  resources jsonb:='[]'; allocations jsonb:='[]'; sources jsonb:='[]'; rows jsonb; bars jsonb;
  actor uuid:=auth.uid(); actor_role text; actor_branch uuid;
begin
  select primary_role::text,branch_id into actor_role,actor_branch from users
    where id=actor and is_active and deactivated_at is null;
  if actor is null or actor_role is null or actor_role not in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Accounts') then
    raise exception 'Resource planning is unavailable to this role.' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_from>=p_to then raise exception 'A complete resource window is required.'; end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id','unit:'||u.id,'type','Equipment','name',p.name,
      'code',u.asset_tag,'meta',u.status::text||' · '||u.condition::text,'icon','box') order by p.name,u.asset_tag),'[]')
      into rows from product_units_v u join products_v p on p.id=u.product_id
      where u.retired_at is null and (actor_role in ('Owner','Admin') or u.branch_id=actor_branch);
    select coalesce(jsonb_agg(jsonb_build_object('id','hold:'||r.id,'resource_id','unit:'||r.asset_id,
      'booking_id',b.id,'booking_no',b.booking_no,'stage',b.stage,'start_at',lower(r.period),'end_at',upper(r.period),
      'quantity',1) order by lower(r.period),r.id),'[]') into bars
      from inventory_reservations r join product_units_v u on u.id=r.asset_id join bookings b on b.id=r.booking_id
      where r.released_at is null and b.cancelled_at is null and r.period && tstzrange(p_from,p_to,'[)')
        and (actor_role in ('Owner','Admin') or u.branch_id=actor_branch);
    resources:=resources||rows; allocations:=allocations||bars;
    sources:=sources||jsonb_build_array(jsonb_build_object('id','serialized','status','complete','count',jsonb_array_length(rows)));
  exception when insufficient_privilege then sources:=sources||'[{"id":"serialized","status":"unavailable","reason":"Equipment permissions could not be verified."}]'; end;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id','product:'||p.id,'type','Equipment','name',p.name,
      'code',p.asset_code,'meta',p.total_quantity||' recorded quantity · global stock','icon','box',
      'capacity',p.total_quantity,'trackingMode','Quantity') order by p.name,p.id),'[]') into rows
      from products_v p where p.is_active and p.tracking_mode in ('Quantity','Consumable');
    select coalesce(jsonb_agg(jsonb_build_object('id','hold:'||r.id,'resource_id','product:'||r.product_id,
      'booking_id',b.id,'booking_no',b.booking_no,'stage',b.stage,'start_at',lower(r.period),'end_at',upper(r.period),
      'quantity',r.qty) order by lower(r.period),r.id),'[]') into bars
      from inventory_reservations r join bookings b on b.id=r.booking_id
      where r.product_id is not null and r.released_at is null and b.cancelled_at is null
        and r.period && tstzrange(p_from,p_to,'[)');
    resources:=resources||rows; allocations:=allocations||bars;
    sources:=sources||jsonb_build_array(jsonb_build_object('id','quantity','status','complete','count',jsonb_array_length(rows)));
  exception when insufficient_privilege then sources:=sources||'[{"id":"quantity","status":"unavailable","reason":"Quantity permissions could not be verified."}]'; end;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id','crew-v2:'||c.id,'type','Crew','name',c.full_name,
      'code',c.crew_code,'meta','Recorded crew assignments','icon','crew') order by c.full_name,c.id),'[]') into rows
      from crew_profiles_v2_v c where c.is_active;
    select coalesce(jsonb_agg(jsonb_build_object('id','crew-assignment:'||a.id,'resource_id','crew-v2:'||a.crew_id,
      'booking_id',b.id,'booking_no',b.booking_no,'stage',b.stage,'kind','Crew Duty',
      'start_at',a.call_time,'end_at',a.wrap_time,'quantity',1) order by a.call_time,a.id),'[]') into bars
      from crew_assignments_v a join bookings b on b.id=a.booking_id
      where b.cancelled_at is null and a.wrap_time>a.call_time
        and a.call_time<p_to and a.wrap_time>p_from;
    resources:=resources||rows; allocations:=allocations||bars;
    sources:=sources||jsonb_build_array(jsonb_build_object('id','crew-v2','status','complete','count',jsonb_array_length(rows),
      'unallocated',(select count(*) from crew_assignments_v a where a.wrap_time is null)));
  exception when insufficient_privilege then sources:=sources||'[{"id":"crew-v2","status":"unavailable","reason":"Crew assignment permissions could not be verified."}]'; end;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id','crew-legacy:'||c.id,'type','Crew','name',c.full_name,
      'meta','Recorded crew engagements · separate roster','icon','crew') order by c.full_name,c.id),'[]') into rows
      from crew_members_v c where c.deactivated_at is null;
    select coalesce(jsonb_agg(jsonb_build_object('id','crew-engagement:'||c.id,'resource_id','crew-legacy:'||c.crew_member_id,
      'booking_id',b.id,'booking_no',b.booking_no,'label',c.crew_booking_no,
      'stage',case when c.state='Completed' then 'Closed' else 'Booked' end,'kind','Crew Duty',
      'start_at',c.start_date::timestamp at time zone 'Asia/Kathmandu',
      'end_at',(c.end_date+1)::timestamp at time zone 'Asia/Kathmandu','quantity',1,'precision','day')
      order by c.start_date,c.id),'[]') into bars from crew_bookings_v c left join bookings b on b.id=c.booking_id
      where c.cancelled_at is null and c.crew_member_id is not null and c.state in ('Confirmed','Completed')
        and c.start_date::timestamp at time zone 'Asia/Kathmandu'<p_to
        and (c.end_date+1)::timestamp at time zone 'Asia/Kathmandu'>p_from;
    resources:=resources||rows; allocations:=allocations||bars;
    sources:=sources||jsonb_build_array(jsonb_build_object('id','crew-legacy','status','complete','count',jsonb_array_length(rows)));
  exception when insufficient_privilege then sources:=sources||'[{"id":"crew-legacy","status":"unavailable","reason":"Crew engagement permissions could not be verified."}]'; end;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('id','vehicle:'||v.id,'type','Vehicles','name',v.make||' '||v.model,
      'code',v.registration_plate,'meta','Recorded fleet assignments','icon','truck') order by v.vehicle_code,v.id),'[]') into rows
      from vehicles v where v.is_active and (actor_role in ('Owner','Admin') or v.branch_id=actor_branch);
    select coalesce(jsonb_agg(jsonb_build_object('id','vehicle-day:'||s.id,'resource_id','vehicle:'||s.vehicle_id,
      'booking_id',b.id,'booking_no',b.booking_no,'label',c.crew_booking_no,
      'stage',case when s.actual_end is not null then 'Closed' else 'Booked' end,
      'start_at',coalesce(s.actual_start,s.planned_start,s.call_time),
      'end_at',coalesce(s.actual_end,s.planned_end,s.wrap_time),'quantity',1)
      order by s.work_date,s.id),'[]') into bars
      from crew_shoot_days s join vehicles v on v.id=s.vehicle_id join crew_bookings c on c.id=s.crew_booking_id
      left join bookings b on b.id=c.booking_id where c.cancelled_at is null
        and coalesce(s.actual_start,s.planned_start,s.call_time)<p_to
        and coalesce(s.actual_end,s.planned_end,s.wrap_time)>p_from
        and coalesce(s.actual_end,s.planned_end,s.wrap_time)>coalesce(s.actual_start,s.planned_start,s.call_time)
        and (actor_role in ('Owner','Admin') or v.branch_id=actor_branch);
    resources:=resources||rows; allocations:=allocations||bars;
    sources:=sources||jsonb_build_array(jsonb_build_object('id','vehicles','status','complete','count',jsonb_array_length(rows)));
  exception when insufficient_privilege then sources:=sources||'[{"id":"vehicles","status":"unavailable","reason":"Fleet assignment permissions could not be verified."}]'; end;
  sources:=sources||'[{"id":"warehouse-bays","status":"unavailable","reason":"Warehouse bay allocations have no authoritative scheduling contract."}]';
  return jsonb_build_object('resources',resources,'allocations',allocations,'sources',sources);
end $$;
revoke all on function public.calendar_resource_window(timestamptz,timestamptz) from public,anon;
grant execute on function public.calendar_resource_window(timestamptz,timestamptz) to authenticated;
commit;
