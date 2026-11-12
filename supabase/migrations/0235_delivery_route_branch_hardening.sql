-- 0209_delivery_route_branch_hardening.sql
-- T4-09 P0: close cross-branch/driver route reads and unscoped client-pin writes.
-- Forward-only: do not rewrite 0206, which may already exist in migration ledgers.
-- The 0206 get_day_route query references bookings.delivery_zone_id, which is NOT
-- created by the committed migrations. Until zone selection has a persisted
-- booking-level source, return NULL for zone name/fee rather than manufacture
-- billing information or read a nonexistent column.
-- SOURCE ONLY: never apply to live without migration-history reconciliation,
-- an isolated staging restore and Owner approval (DEPLOYMENT.md N-5).

begin;

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
  v_role text;
  v_branch_id uuid;
  v_updated boolean;
begin
  select u.primary_role::text, u.branch_id
    into v_role, v_branch_id
    from public.users u
    where u.id = v_actor and u.is_active;

  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to set client map pin' using errcode = '42501';
  end if;

  if p_client_id is null or p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid client or latitude/longitude' using errcode = '22023';
  end if;

  -- A client is not intrinsically branch-owned. For branch-scoped staff, only
  -- edit a client with a real delivery job in the actor's branch. This matches
  -- the route workspace's map-pin workflow without exposing unrelated clients.
  if v_role not in ('Owner', 'Admin') and not exists (
    select 1
      from public.delivery_jobs dj
      join public.bookings b on b.id = dj.booking_id
      where b.client_id = p_client_id
        and b.branch_id = v_branch_id
        and dj.branch_id = v_branch_id
  ) then
    raise exception 'Client map pin is outside your delivery branch' using errcode = '42501';
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
  -- This check must run INSIDE the SECURITY DEFINER function, not in React.
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
    null::text as zone_name,
    null::bigint as zone_fee_paisa
  from public.delivery_jobs dj
  join public.bookings b on b.id = dj.booking_id
  join public.clients c on c.id = b.client_id
  left join public.users u on u.id = dj.assigned_driver_id
  where dj.branch_id = p_branch_id
    and b.branch_id = dj.branch_id
    and dj.scheduled_at >= p_date
    and dj.scheduled_at < p_date + interval '1 day'
    and dj.status not in ('Delivered', 'Failed')
    -- Drivers may see ONLY their OWN assigned active jobs, never their
    -- colleagues' client names, addresses or phone numbers.
    and (v_role <> 'Driver' or dj.assigned_driver_id = v_actor)
  order by dj.route_position nulls last, dj.scheduled_at asc;
end;
$$;

comment on function public.set_client_map_pin(uuid, double precision, double precision)
  is 'Write a client map pin: Owner/Admin globally, authorized floor staff only when the client has a delivery job in their branch.';
comment on function public.get_day_route(uuid, date)
  is 'Active staff only: Owner/Admin any branch; other staff own branch; Driver own assigned jobs. Zone fields intentionally NULL pending persisted booking-zone mapping.';

revoke all on function public.set_client_map_pin(uuid, double precision, double precision) from public, anon;
revoke all on function public.get_day_route(uuid, date) from public, anon;
grant execute on function public.set_client_map_pin(uuid, double precision, double precision) to authenticated;
grant execute on function public.get_day_route(uuid, date) to authenticated;

commit;
