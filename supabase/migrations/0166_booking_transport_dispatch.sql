-- RULING 2026-10-16: one dispatch per booking_transport; Driver remains read-only. WRITTEN, NOT APPLIED (N-5).
begin;

alter table public.booking_transport
  add column delivery_status text not null default 'Scheduled' check (delivery_status in ('Scheduled','Ready','In Transit','Delivered','Failed')),
  add column scheduled_at timestamptz,
  add column dispatched_at timestamptz,
  add column delivered_at timestamptz,
  add column recipient_name text,
  add column delivery_note text,
  add column delivery_revision integer not null default 1 check (delivery_revision>0),
  add column delivery_updated_at timestamptz not null default now();
alter table public.booking_transport add constraint booking_transport_delivery_receipt
  check (delivery_status<>'Delivered' or (delivered_at is not null and dispatched_at is not null and length(btrim(recipient_name))>=2));
create index booking_transport_driver_delivery_idx on public.booking_transport(driver_id,delivery_status);
grant select (delivery_status,scheduled_at,dispatched_at,delivered_at,recipient_name,delivery_revision,delivery_updated_at) on public.booking_transport to authenticated;

create view public.delivery_transport_v with (security_barrier=true) as
select t.id,t.booking_id,b.booking_no,b.stage::text as booking_stage,b.branch_id,
  c.name as client_name,
  case when auth_user_role()::text in ('Owner','Admin','Coordinator','Warehouse')
      or (auth_user_role()::text='Driver' and t.driver_id=auth_user_id() and t.delivery_status in ('Scheduled','Ready','In Transit'))
    then c.phone end as client_phone,
  case when auth_user_role()::text in ('Owner','Admin','Coordinator','Warehouse')
      or (auth_user_role()::text='Driver' and t.delivery_status in ('Scheduled','Ready','In Transit'))
    then b.pickup_location end as destination,
  b.delivery_type::text,t.driver_id,u.full_name as driver_name,t.vehicle,t.number_plate,
  t.delivery_status,coalesce(t.scheduled_at,b.pickup_at) as scheduled_at,
  t.dispatched_at,t.delivered_at,t.recipient_name,t.delivery_revision,t.delivery_updated_at,
  case when auth_can_view_money() then t.delivery_note end as delivery_note,
  case when auth_can_view_money() then (t.delivery_charge*100)::bigint end as delivery_charge_paisa
from public.booking_transport t join public.bookings b on b.id=t.booking_id
join public.clients c on c.id=b.client_id left join public.users u on u.id=t.driver_id
where auth_user_id() is not null and b.cancelled_at is null and b.stage<>'Quote'
  and b.delivery_type<>'Client Pickup'
  and (auth_user_role()::text in ('Owner','Admin')
    or (auth_user_role()::text in ('Coordinator','Warehouse') and b.branch_id=auth_user_branch_id())
    or (auth_user_role()::text='Driver' and t.driver_id=auth_user_id()));
revoke all on public.delivery_transport_v from public,anon;
grant select on public.delivery_transport_v to authenticated;

create function public.mutate_booking_transport(
  p_id uuid,p_revision integer,p_key uuid,p_action text,
  p_driver uuid default null,p_recipient text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); actor_role text; trip booking_transport; booking bookings;
  request jsonb; receipt record; response jsonb; next_status text;
begin
  select primary_role::text into actor_role from users where id=actor and is_active;
  if actor is null or actor_role is null or actor_role not in ('Owner','Admin') then
    raise exception 'Only authorized transport administrators may change dispatches.' using errcode='42501';
  end if;
  if p_key is null or p_id is null or p_revision is null or p_action is null then raise exception 'A stable request key and revision are required.'; end if;
  request:=jsonb_build_object('transport',p_id,'revision',p_revision,'action',p_action,'driver',p_driver,'recipient',p_recipient,'note',p_note);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then
    if receipt.actor<>actor or receipt.request<>request then raise exception 'This request key belongs to another change.'; end if;
    return receipt.response;
  end if;
  select * into trip from booking_transport where id=p_id for update;
  if not found then raise exception 'Transport plan not found.'; end if;
  select * into booking from bookings where id=trip.booking_id for share;
  if booking.cancelled_at is not null or booking.stage in ('Quote','Closed') or booking.delivery_type='Client Pickup' then raise exception 'This booking cannot be dispatched.'; end if;
  if trip.delivery_revision<>p_revision then raise exception 'Dispatch changed. Refresh before saving.' using errcode='40001'; end if;
  next_status:=trip.delivery_status;
  if p_action='assign' then
    if trip.delivery_status not in ('Scheduled','Ready') then raise exception 'Driver assignment is locked after dispatch.'; end if;
    if not exists(select 1 from users where id=p_driver and primary_role='Driver' and is_active and branch_id=booking.branch_id) then raise exception 'Choose an active driver from this branch.'; end if;
    next_status:='Ready';
  elsif p_action='dispatch' then
    if trip.delivery_status<>'Ready' or booking.stage<>'On Rent' then raise exception 'Complete the handover gates and assign a driver before dispatch.'; end if;
    if not exists(select 1 from users where id=trip.driver_id and primary_role='Driver' and is_active and branch_id=booking.branch_id) then raise exception 'Assigned driver is no longer active.'; end if;
    next_status:='In Transit';
  elsif p_action='deliver' then
    if trip.delivery_status<>'In Transit' or length(btrim(coalesce(p_recipient,'')))<2 then raise exception 'An in-transit trip and receiver name are required.'; end if;
    next_status:='Delivered';
  elsif p_action='fail' then
    if trip.delivery_status not in ('Scheduled','Ready','In Transit') or length(btrim(coalesce(p_note,'')))<10 then raise exception 'Explain the failed active trip using at least ten characters.'; end if;
    next_status:='Failed';
  else raise exception 'Unknown delivery action.'; end if;
  if length(coalesce(p_note,''))>2000 or length(coalesce(p_recipient,''))>200 then raise exception 'Delivery text is too long.'; end if;
  update booking_transport set delivery_status=next_status,
    driver_id=case when p_action='assign' then p_driver else driver_id end,
    dispatched_at=case when p_action='dispatch' then now() else dispatched_at end,
    delivered_at=case when p_action='deliver' then now() else delivered_at end,
    recipient_name=case when p_action='deliver' then btrim(p_recipient) else recipient_name end,
    delivery_note=coalesce(nullif(btrim(p_note),''),delivery_note),
    delivery_revision=delivery_revision+1,delivery_updated_at=clock_timestamp()
    where id=p_id;
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values)
  values(p_key,'status change','Operations','Operations','Update','Informational','Success','booking_transport',p_id,actor,actor_role::system_role,booking.branch_id,
    jsonb_build_object('delivery_status',trip.delivery_status,'revision',trip.delivery_revision),
    jsonb_build_object('delivery_status',next_status,'revision',trip.delivery_revision+1,'operation',p_action));
  response:=jsonb_build_object('id',p_id,'revision',trip.delivery_revision+1);
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,actor,request,response);
  return response;
end; $$;
revoke all on function public.mutate_booking_transport(uuid,integer,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.mutate_booking_transport(uuid,integer,uuid,text,uuid,text,text) to authenticated;

-- The unused 0165 proposal allowed Driver writes, contrary to PERMISSIONS D2; keep its history but close execution.
revoke all on function public.delivery_create_job(uuid,text,timestamptz,uuid) from authenticated;
revoke all on function public.delivery_assign_driver(uuid,uuid,uuid) from authenticated;
revoke all on function public.delivery_transition_job(uuid,text,text,uuid,text,text) from authenticated;
commit;
