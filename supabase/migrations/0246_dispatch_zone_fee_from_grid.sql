-- =============================================================================
-- 0246 — Dispatch reads the delivery fee grid by booking zone and job vehicle
--        (O-28, O-30, answered 18 Nov 2026).
--
-- RULINGS 2026-11-18 (owner: Babin):
--   O-28  The grid (0244) replaces the per-zone fee on delivery_zones (0189).
--         Dispatch reads zone × vehicle from the grid. This migration does NOT
--         alter or drop delivery_zones.fee_paisa; retiring it is a later step.
--   O-30  Staff choose the zone at booking. Delivery jobs inherit it: the job reads
--         its booking's zone, so no zone is copied onto the job.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; B-6 reversible):
--   · bookings.delivery_zone_id is nullable. Null means "zone not chosen"; it never
--     implies a free delivery. Written only through set_booking_delivery_zone().
--   · delivery_jobs.vehicle_class is nullable and uses the three grid classes. The
--     job's free-text vehicle (0187) is NOT parsed into a class. Written only through
--     set_delivery_job_vehicle_class().
--   · get_day_route() gains zone_fee_status, so the screen can say why a fee is
--     missing (words, not colour). Money-blind roles get NULL fee and NULL status.
--   · Zone name is not money and is returned to every staff role, as before.
--   · The class change is version-bumped but NOT written to delivery_job_events,
--     because that table's event_kind check does not include a vehicle event.
-- =============================================================================

-- ---- Booking zone (O-30) -----------------------------------------------------
alter table public.bookings
  add column if not exists delivery_zone_id uuid null references public.delivery_zones (id);

comment on column public.bookings.delivery_zone_id is
  'RULING 2026-11-18 (O-30): delivery zone chosen by staff at booking. Null = not chosen. '
  'Delivery jobs inherit it through their booking. Written only by set_booking_delivery_zone().';

create or replace function public.set_booking_delivery_zone(
  p_booking_id uuid,
  p_zone_id    uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role   text := auth_user_role();
  v_branch uuid;
  v_booking public.bookings%rowtype;
begin
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise insufficient_privilege using message = 'Only Owner, Admin, Manager or Coordinator may choose a delivery zone (O-30)';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'No active booking to set a delivery zone on' using errcode = 'P0002';
  end if;

  if v_role not in ('Owner', 'Admin') then
    select u.branch_id into v_branch from public.users u where u.id = auth.uid() and u.is_active;
    if v_branch is distinct from v_booking.branch_id then
      raise insufficient_privilege using message = 'Delivery zone branch access denied';
    end if;
  end if;

  if p_zone_id is not null and not exists (
    select 1 from public.delivery_zones dz where dz.id = p_zone_id and dz.is_active
  ) then
    raise exception 'The delivery zone is not active' using errcode = 'foreign_key_violation';
  end if;

  update public.bookings set delivery_zone_id = p_zone_id where id = p_booking_id;
  return true;
end;
$$;

comment on function public.set_booking_delivery_zone(uuid, uuid) is
  'RULING 2026-11-18 (O-30): set or clear the delivery zone of an active booking. '
  'Owner, Admin, Manager, Coordinator; non-Owner/Admin limited to their branch.';

revoke all on function public.set_booking_delivery_zone(uuid, uuid) from public, anon;
grant execute on function public.set_booking_delivery_zone(uuid, uuid) to authenticated;

-- ---- Job vehicle class (O-28) ------------------------------------------------
alter table public.delivery_jobs
  add column if not exists vehicle_class text null
  constraint delivery_jobs_vehicle_class_check
  check (vehicle_class in ('Motorbike', 'Car / pickup', 'Van / larger vehicle'));

comment on column public.delivery_jobs.vehicle_class is
  'RULING 2026-11-18 (O-28): grid vehicle class for fee lookup. Null = not chosen. '
  'Written only by set_delivery_job_vehicle_class().';

create or replace function public.set_delivery_job_vehicle_class(
  p_job_id        uuid,
  p_vehicle_class text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role   text := auth_user_role();
  v_branch uuid;
  v_job    public.delivery_jobs%rowtype;
begin
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise insufficient_privilege using message = 'Only Owner, Admin, Manager or Coordinator may set a vehicle class (O-28)';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Delivery job not found' using errcode = 'P0002';
  end if;
  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'A finished delivery job keeps its vehicle class' using errcode = 'check_violation';
  end if;

  if v_role not in ('Owner', 'Admin') then
    select u.branch_id into v_branch from public.users u where u.id = auth.uid() and u.is_active;
    if v_branch is distinct from v_job.branch_id then
      raise insufficient_privilege using message = 'Delivery branch access denied';
    end if;
  end if;

  update public.delivery_jobs
     set vehicle_class = p_vehicle_class,
         version = version + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where id = p_job_id;
  return true;
end;
$$;

comment on function public.set_delivery_job_vehicle_class(uuid, text) is
  'RULING 2026-11-18 (O-28): set or clear the grid vehicle class of an open delivery job. '
  'Refused once the job is Delivered or Failed.';

revoke all on function public.set_delivery_job_vehicle_class(uuid, text) from public, anon;
grant execute on function public.set_delivery_job_vehicle_class(uuid, text) to authenticated;

-- ---- Route read: fee from the grid (O-28) ------------------------------------
-- The return shape gains zone_fee_status, so the old function is dropped first.
drop function if exists public.get_day_route(uuid, date);

create function public.get_day_route(
  p_branch_id uuid,
  p_date date
) returns table (
  id uuid,
  booking_id uuid,
  booking_no text,
  leg text,
  scheduled_at timestamptz,
  status text,
  route_position int,
  client_name text,
  client_phone text,
  address text,
  neighborhood text,
  map_pin_lat double precision,
  map_pin_lng double precision,
  driver_name text,
  driver_phone text,
  vehicle text,
  zone_name text,
  zone_fee_paisa bigint,
  zone_fee_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_branch_id uuid;
begin
  select u.primary_role::text, u.branch_id
    into v_role, v_branch_id
    from public.users u
    where u.id = v_actor and u.is_active;

  if v_actor is null or not public.auth_is_staff() or v_role is null then
    raise exception 'Only active staff may view a day route' using errcode = '42501';
  end if;

  if p_branch_id is null or p_date is null then
    raise exception 'Branch and date are required' using errcode = '22023';
  end if;

  -- Privileged staff may audit all branches; everyone else is site-bound.
  if v_role not in ('Owner', 'Admin') and p_branch_id is distinct from v_branch_id then
    raise exception 'Delivery route branch access denied' using errcode = '42501';
  end if;

  return query
  select
    dj.id,
    dj.booking_id,
    b.booking_no,
    dj.leg,
    dj.scheduled_at,
    dj.status,
    dj.route_position,
    c.name as client_name,
    c.phone as client_phone,
    c.address_line as address,
    c.neighborhood,
    c.map_pin_lat,
    c.map_pin_lng,
    u.full_name as driver_name,
    u.phone as driver_phone,
    dj.vehicle,
    dz.name as zone_name,
    -- Fee and status are money: money-visible roles only (Law 6).
    case when public.auth_can_view_money() and not coalesce(q.quoted, false)
         then vf.fee_paisa else null end as zone_fee_paisa,
    case
      when not public.auth_can_view_money() then null
      when b.delivery_zone_id is null then 'zone-not-chosen'
      when coalesce(q.quoted, false) then 'quoted-per-trip'
      when dj.vehicle_class is null then 'vehicle-not-chosen'
      when vf.fee_paisa is null then 'fee-not-set'
      else 'set'
    end as zone_fee_status
  from public.delivery_jobs dj
  join public.bookings b on b.id = dj.booking_id
  join public.clients c on c.id = b.client_id
  left join public.users u on u.id = dj.assigned_driver_id
  left join public.delivery_zones dz on dz.id = b.delivery_zone_id
  left join public.delivery_zone_quoted q on q.zone_id = b.delivery_zone_id
  left join public.delivery_zone_vehicle_fees vf
         on vf.zone_id = b.delivery_zone_id and vf.vehicle_class = dj.vehicle_class
  where dj.branch_id = p_branch_id
    and b.branch_id = dj.branch_id
    and dj.scheduled_at >= p_date
    and dj.scheduled_at < p_date + interval '1 day'
    and dj.status not in ('Delivered', 'Failed')
    -- Drivers may see ONLY their OWN assigned active jobs.
    and (v_role <> 'Driver' or dj.assigned_driver_id = v_actor)
  order by dj.route_position nulls last, dj.scheduled_at asc;
end;
$$;

comment on function public.get_day_route(uuid, date) is
  'Active staff only: Owner/Admin any branch; other staff own branch; Driver own assigned jobs. '
  'zone_fee_paisa and zone_fee_status come from the delivery fee grid by booking zone and job vehicle class (O-28); money-visible roles only (Law 6).';

revoke all on function public.get_day_route(uuid, date) from public, anon;
grant execute on function public.get_day_route(uuid, date) to authenticated;

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'bookings' and column_name = 'delivery_zone_id') then
    raise exception '0246: bookings.delivery_zone_id missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'delivery_jobs' and column_name = 'vehicle_class') then
    raise exception '0246: delivery_jobs.vehicle_class missing';
  end if;
  if not exists (select 1 from information_schema.routines
                 where routine_schema = 'public' and routine_name = 'get_day_route') then
    raise exception '0246: get_day_route missing';
  end if;
  -- Table-returning columns sit in pg_proc.proargnames, not in information_schema.parameters.
  if not exists (select 1 from pg_proc p
                 where p.proname = 'get_day_route' and p.pronamespace = 'public'::regnamespace
                   and p.proargnames @> array['zone_fee_status']::text[]) then
    raise exception '0246: get_day_route does not return zone_fee_status';
  end if;
end;
$$;
