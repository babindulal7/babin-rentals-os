-- 0206_delivery_route_map_pins.sql
-- T4-09: Delivery route ordering + map pins for Google Maps links
-- Adds route_position to delivery_jobs and map_pin columns to client addresses

begin;

-- 1. Add route_position to delivery_jobs for ordering within a day's run
alter table public.delivery_jobs
  add column if not exists route_position integer;

-- Index for efficient ordering queries
create index if not exists delivery_jobs_branch_schedule_route_idx
  on public.delivery_jobs(branch_id, scheduled_at, route_position);

-- 2. Add map_pin_lat and map_pin_lng to clients for drop-pin / paste Maps link
alter table public.clients
  add column if not exists map_pin_lat double precision,
  add column if not exists map_pin_lng double precision;

-- 3. RPC: set_delivery_route_position
-- Called by staff to set the manual order for a day's run
create or replace function public.set_delivery_route_position(
  p_job_id uuid,
  p_route_position int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_updated boolean;
begin
  -- Authorization: Owner, Admin, Manager, Coordinator, Warehouse
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to set route position' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id;
  if not found then
    raise exception 'Delivery job not found';
  end if;

  -- Branch check for non-Owner/Admin
  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  update public.delivery_jobs
  set route_position = p_route_position,
      updated_at = now(),
      updated_by = v_actor
  where id = p_job_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.set_delivery_route_position(uuid, int) is 'Set route position for a delivery job (staff only). Returns true if updated.';

-- 4. RPC: set_client_map_pin
-- Staff drops a pin or pastes a Google Maps link (lat/lng extracted)
create or replace function public.set_client_map_pin(
  p_client_id uuid,
  p_lat double precision,
  p_lng double precision
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_updated boolean;
begin
  -- Authorization: Owner, Admin, Manager, Coordinator, Warehouse
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to set client map pin' using errcode = '42501';
  end if;

  -- Validate lat/lng ranges
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid latitude/longitude' using errcode = 'check_violation';
  end if;

  update public.clients
  set map_pin_lat = p_lat,
      map_pin_lng = p_lng,
      updated_at = now()
  where id = p_client_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.set_client_map_pin(uuid, double precision, double precision) is 'Set map pin coordinates for a client address (staff only). Returns true if updated.';

-- 5. RPC: get_day_route
-- Returns all jobs for a branch on a given date, ordered by route_position then scheduled_at
-- Includes client map pins for Google Maps link generation
create or replace function public.get_day_route(
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
  zone_fee_paisa bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Authorization: any authenticated staff
  if not public.auth_is_staff() then
    raise exception 'Only staff can view day route' using errcode = '42501';
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
    case when public.auth_can_view_money() then dz.fee_paisa else null end as zone_fee_paisa
  from public.delivery_jobs dj
  join public.bookings b on b.id = dj.booking_id
  join public.clients c on c.id = b.client_id
  left join public.users u on u.id = dj.assigned_driver_id
  left join public.delivery_zones dz on dz.id = b.delivery_zone_id
  where dj.branch_id = p_branch_id
    and dj.scheduled_at >= p_date
    and dj.scheduled_at < p_date + interval '1 day'
    and dj.status not in ('Delivered', 'Failed') -- Only active jobs in route
  order by
    dj.route_position nulls last, -- Manual order first
    dj.scheduled_at asc; -- Then by scheduled time
end;
$$;

comment on function public.get_day_route(uuid, date) is 'Get ordered delivery route for a branch on a date (staff only). Includes map pins for Google Maps links. fee_paisa masked for money-blind roles (Law 6).';

-- 6. RPC: generate_google_maps_links
-- Generates Google Maps URLs for a route (handles 3-stop phone limit)
create or replace function public.generate_google_maps_links(
  p_branch_id uuid,
  p_date date,
  p_shop_lat double precision default 27.7172, -- Boudha default
  p_shop_lng double precision default 85.3240
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jobs record;
  v_waypoints text[];
  v_links jsonb := '[]'::jsonb;
  v_current_link jsonb;
  v_stop_count int := 0;
  v_max_stops int := 3; -- Phone browser limit
  v_shop text := 'Babin Rentals, Boudha, Kathmandu';
begin
  -- Authorization
  if not public.auth_is_staff() then
    raise exception 'Only staff can generate map links' using errcode = '42501';
  end if;

  v_current_link := jsonb_build_object(
    'stops', jsonb_build_array(),
    'url', ''
  );

  for v_jobs in select * from public.get_day_route(p_branch_id, p_date) loop
    -- Build destination string: prefer map pin, fallback to address
    declare
      v_dest text;
    begin
      if v_jobs.map_pin_lat is not null and v_jobs.map_pin_lng is not null then
        v_dest := v_jobs.map_pin_lat || ',' || v_jobs.map_pin_lng;
      else
        v_dest := v_jobs.address || ', ' || v_jobs.neighborhood || ', Kathmandu, Nepal';
      end if;

      v_waypoints := v_waypoints || v_dest;
      v_stop_count := v_stop_count + 1;

      -- If we hit the phone limit, generate the current link and start a new one
      if v_stop_count > v_max_stops then
        -- Build URL for accumulated waypoints
        v_current_link := jsonb_build_object(
          'stops', to_jsonb(v_waypoints[1:v_max_stops]),
          'url', 'https://www.google.com/maps/dir/' || v_shop || '/' || array_to_string(v_waypoints[1:v_max_stops], '/')
        );
        v_links := v_links || v_current_link;

        -- Start new link with the overflow stop
        v_waypoints := array[v_dest];
        v_stop_count := 1;
      end if;
    end;
  end loop;

  -- Don't forget the last batch
  if v_stop_count > 0 then
    v_current_link := jsonb_build_object(
      'stops', to_jsonb(v_waypoints),
      'url', 'https://www.google.com/maps/dir/' || v_shop || '/' || array_to_string(v_waypoints, '/')
    );
    v_links := v_links || v_current_link;
  end if;

  return v_links;
end;
$$;

comment on function public.generate_google_maps_links(uuid, date, double precision, double precision) is 'Generate Google Maps route links for a day (staff only). Splits into multiple links if >3 stops for phone browsers.';

-- Grant execute on new RPCs
grant execute on function public.set_delivery_route_position(uuid, int) to authenticated;
grant execute on function public.set_client_map_pin(uuid, double precision, double precision) to authenticated;
grant execute on function public.get_day_route(uuid, date) to authenticated;
grant execute on function public.generate_google_maps_links(uuid, date, double precision, double precision) to authenticated;

revoke all on function public.set_delivery_route_position(uuid, int) from anon, public;
revoke all on function public.set_client_map_pin(uuid, double precision, double precision) from anon, public;
revoke all on function public.get_day_route(uuid, date) from anon, public;
revoke all on function public.generate_google_maps_links(uuid, date, double precision, double precision) from anon, public;

-- Verification assertions
do $verify$
declare
  v_col_exists boolean;
begin
  -- 1. route_position column exists on delivery_jobs
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_jobs' and column_name = 'route_position'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: route_position column missing on delivery_jobs';
  end if;

  -- 2. map_pin_lat/lng columns exist on clients
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'map_pin_lat'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: map_pin_lat column missing on clients';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'map_pin_lng'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: map_pin_lng column missing on clients';
  end if;

  -- 3. RPCs exist
  select exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'set_delivery_route_position'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: set_delivery_route_position RPC missing';
  end if;

  select exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'get_day_route'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: get_day_route RPC missing';
  end if;

  raise notice '0206 verification passed: route_position, map pins, RPCs all present';
end;
$verify$;

commit;