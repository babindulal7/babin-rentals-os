-- =============================================================================
-- BABIN RENTALS OS — PRODUCTION MIGRATION BUNDLE 3 OF 3
-- File: 03_PRODUCTION_BATCH_3_0245_TO_0260.sql
-- Range: Migrations 0245 through 0260
-- Total Migrations in Batch: 16
-- Target: Production Project sxguwvgoserhdolewibb
-- Description: Delivery fee grid, outsourced vehicles, booking requests queue, client portal binding, Fonepay intents, payment links, refunds.
--
-- INSTRUCTIONS FOR BABIN:
-- 1. Open Supabase Dashboard -> Project sxguwvgoserhdolewibb -> SQL Editor.
-- 2. Create a new query, paste this entire file, and click 'RUN'.
-- 3. Verify 'Success. No rows returned' or query execution completed.
-- 4. Execute the verification query at the bottom to verify migration registration.
-- =============================================================================

-- Ensure migration session config can bypass money line triggers during setup
select set_config('app.in_create_booking', 'on', false);

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0245_delivery_zone_vehicle_fee_grid.sql
-- SHA-256: 4e5044e61689bf640f81bc3e8b2d60bbc508c7a85597cde2513e5c85b950366c
-- Version: 20261122030126
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0245 — Delivery fee grid: zone × vehicle class (R-9.18), quoted zones (R-9.20).
--
-- RULINGS 2026-11-09 (owner: Babin):
--   R-9.18  Fee depends on zone AND vehicle. Vehicles: Motorbike · Car / pickup ·
--           Van / larger vehicle. Twelve values (4 zones × 3 vehicles). Amounts are
--           typed in Settings later; until typed the fee is "not set" (NULL), never 0.
--   R-9.20  Outside valley is quoted per trip for every vehicle. No amount is stored
--           or auto-priced for a quoted zone.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; flagged for Babin in OPEN_DECISIONS):
--   · Owner and Manager may set a grid amount (O-29, answered by Babin 18 Nov 2026).
--     The quoted flag stays Owner-only (R-9.20 is an owner ruling).
--   · Money-visible roles may read the grid (Law 6). Warehouse, Technician, Driver
--     and Client may not.
--   · delivery_zones (0189) is NOT altered. Its list_delivery_zones() returns the
--     whole row, so a new column would break it. The quoted flag lives in its own table.
--   · delivery_zones.fee_paisa (0189) is NOT changed here. Whether the grid replaces it
--     is an open question (OPEN_DECISIONS, R-9.18 follow-up).
-- =============================================================================

-- ---- Quoted zones (R-9.20) ---------------------------------------------------
create table if not exists public.delivery_zone_quoted (
  zone_id    uuid        not null primary key references public.delivery_zones (id),
  quoted     boolean     not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.delivery_zone_quoted is
  'RULING 2026-11-09 (R-9.20): a zone with quoted = true is quoted per trip for every vehicle. '
  'No grid amount may be stored for it. Written only through set_delivery_zone_quoted() (Owner).';

alter table public.delivery_zone_quoted enable row level security;

drop policy if exists delivery_zone_quoted_read on public.delivery_zone_quoted;
create policy delivery_zone_quoted_read on public.delivery_zone_quoted
  for select
  to authenticated
  using (auth_can_view_money());

revoke insert, update, delete on public.delivery_zone_quoted from anon, authenticated;

create or replace function public.set_delivery_zone_quoted(p_zone_id uuid, p_quoted boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth_user_role() is distinct from 'Owner' then
    raise insufficient_privilege using message = 'Only the Owner can mark a zone as quoted per trip (R-9.20)';
  end if;
  if not exists (select 1 from public.delivery_zones where id = p_zone_id) then
    raise exception 'Unknown delivery zone' using errcode = 'foreign_key_violation';
  end if;

  insert into public.delivery_zone_quoted (zone_id, quoted, updated_at, updated_by)
  values (p_zone_id, p_quoted, now(), auth.uid())
  on conflict (zone_id)
  do update set quoted = excluded.quoted,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by;
  return true;
end;
$$;

revoke all on function public.set_delivery_zone_quoted(uuid, boolean) from public, anon;
grant execute on function public.set_delivery_zone_quoted(uuid, boolean) to authenticated;

-- ---- The grid (R-9.18) -------------------------------------------------------
create table if not exists public.delivery_zone_vehicle_fees (
  zone_id       uuid        not null references public.delivery_zones (id),
  vehicle_class text        not null
                constraint delivery_zone_vehicle_fees_vehicle_check
                check (vehicle_class in ('Motorbike', 'Car / pickup', 'Van / larger vehicle')),
  -- NULL = not set. Never 0 for "not set": 0 would read as a free delivery.
  fee_paisa     bigint      null
                constraint delivery_zone_vehicle_fees_fee_nonneg check (fee_paisa is null or fee_paisa >= 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  primary key (zone_id, vehicle_class)
);

comment on table public.delivery_zone_vehicle_fees is
  'RULING 2026-11-09 (R-9.18): delivery fee per zone and vehicle class, in paisa. NULL = not set. '
  'Written only through set_delivery_zone_vehicle_fee() (Owner). Read by money-visible roles.';

alter table public.delivery_zone_vehicle_fees enable row level security;

drop policy if exists delivery_zone_vehicle_fees_read on public.delivery_zone_vehicle_fees;
create policy delivery_zone_vehicle_fees_read on public.delivery_zone_vehicle_fees
  for select
  to authenticated
  using (auth_can_view_money());

revoke insert, update, delete on public.delivery_zone_vehicle_fees from anon, authenticated;

create or replace function public.set_delivery_zone_vehicle_fee(
  p_zone_id       uuid,
  p_vehicle_class text,
  p_fee_paisa     bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Owner and Manager (O-29, answered 18 Nov 2026).
  if auth_user_role() not in ('Owner', 'Manager') then
    raise insufficient_privilege using message = 'Only the Owner or Manager can set delivery fee amounts (R-9.18, O-29)';
  end if;
  if not exists (select 1 from public.delivery_zones where id = p_zone_id) then
    raise exception 'Unknown delivery zone' using errcode = 'foreign_key_violation';
  end if;

  if p_fee_paisa is not null
     and exists (select 1 from public.delivery_zone_quoted q where q.zone_id = p_zone_id and q.quoted) then
    raise exception 'This zone is quoted per trip; no fixed amount can be set (R-9.20)'
      using errcode = 'check_violation';
  end if;

  if p_fee_paisa is not null and p_fee_paisa < 0 then
    raise exception 'Delivery fee cannot be negative' using errcode = 'check_violation';
  end if;

  insert into public.delivery_zone_vehicle_fees (zone_id, vehicle_class, fee_paisa, updated_at, updated_by)
  values (p_zone_id, p_vehicle_class, p_fee_paisa, now(), auth.uid())
  on conflict (zone_id, vehicle_class)
  do update set fee_paisa = excluded.fee_paisa,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by;

  return true;
end;
$$;

comment on function public.set_delivery_zone_vehicle_fee(uuid, text, bigint) is
  'RULING 2026-11-09 (R-9.18/R-9.20): set one grid amount (NULL clears to not set). Owner only. '
  'Refused for quoted-per-trip zones. Returns true when the row is written.';

revoke all on function public.set_delivery_zone_vehicle_fee(uuid, text, bigint) from public, anon;
grant execute on function public.set_delivery_zone_vehicle_fee(uuid, text, bigint) to authenticated;

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class c where c.relname = 'delivery_zone_vehicle_fees' and c.relrowsecurity) then
    raise exception '0245 post-condition failed: RLS not enabled on delivery_zone_vehicle_fees';
  end if;
  if not exists (select 1 from pg_class c where c.relname = 'delivery_zone_quoted' and c.relrowsecurity) then
    raise exception '0245 post-condition failed: RLS not enabled on delivery_zone_quoted';
  end if;
  if not exists (select 1 from pg_proc where proname = 'set_delivery_zone_vehicle_fee') then
    raise exception '0245 post-condition failed: set_delivery_zone_vehicle_fee missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'set_delivery_zone_quoted') then
    raise exception '0245 post-condition failed: set_delivery_zone_quoted missing';
  end if;
end
$$;

-- Record 0245_delivery_zone_vehicle_fee_grid in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030126', '0245_delivery_zone_vehicle_fee_grid')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0245_delivery_zone_vehicle_fee_grid.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0246_dispatch_zone_fee_from_grid.sql
-- SHA-256: a75c5e1eb23b17ae5ad70865d4b625f0b67fbadd3a121246daf5a19835ed3b27
-- Version: 20261122030127
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0246 — Dispatch reads the delivery fee grid by booking zone and job vehicle
--        (O-28, O-30, answered 18 Nov 2026).
--
-- RULINGS 2026-11-18 (owner: Babin):
--   O-28  The grid (0245) replaces the per-zone fee on delivery_zones (0189).
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

-- Record 0246_dispatch_zone_fee_from_grid in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030127', '0246_dispatch_zone_fee_from_grid')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0246_dispatch_zone_fee_from_grid.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0247_retire_per_zone_fee_on_create.sql
-- SHA-256: fd4ba8005ff7ce51e95fc1b03c575b7c0b9a169d4434368aca1df42efd2ec88e
-- Version: 20261122030128
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0247 — Retire the per-zone fee at creation (O-28, answered 18 Nov 2026).
--
-- RULING 2026-11-18 (owner: Babin), O-28: the delivery fee grid (0245) replaces the per-zone
-- fee on delivery_zones (0189). Booking and dispatch no longer read fee_paisa (0246 and the
-- booking form change in this branch). This migration stops new zones from storing a fee.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; B-6 reversible; nothing is deleted):
--   · The column is kept. Existing rows keep their values; nothing is dropped. Retiring the
--     column itself is a later step, once no reader remains.
--   · fee_paisa becomes nullable with no default. NULL means "not set", the same meaning as
--     the grid. A new zone never stores a zero, which would read as a free delivery.
--   · create_delivery_zone() accepts the fee as optional and stores NULL when none is given.
--     The parameter stays so that existing callers keep working.
--   · update_delivery_zone() is unchanged.
--   · Revert: alter column fee_paisa set default 0, set not null; restore the 0189 body of
--     create_delivery_zone (p_fee_paisa bigint, no default).
-- =============================================================================

alter table public.delivery_zones alter column fee_paisa drop not null;
alter table public.delivery_zones alter column fee_paisa drop default;

comment on column public.delivery_zones.fee_paisa is
  'LEGACY (O-28, 18 Nov 2026): the per-zone fee is retired. Booking and dispatch read the delivery fee grid (delivery_zone_vehicle_fees). NULL = not set. Kept, not dropped.';

drop function if exists public.create_delivery_zone(text, text, bigint);

create or replace function public.create_delivery_zone(
    p_name text,
    p_description text,
    p_fee_paisa bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_zone_id uuid;
begin
    -- Verify caller is Manager or above
    if not public.auth_is_manager_or_above() then
        raise insufficient_privilege using message = 'Only Manager+ can create delivery zones';
    end if;

    if p_name is null or trim(p_name) = '' then
        raise exception 'Zone name cannot be empty' using errcode = 'check_violation';
    end if;

    if p_fee_paisa is not null and p_fee_paisa < 0 then
        raise exception 'Zone fee cannot be negative' using errcode = 'check_violation';
    end if;

    insert into public.delivery_zones (name, description, fee_paisa)
    values (trim(p_name), trim(p_description), p_fee_paisa)
    returning id into v_zone_id;

    return v_zone_id;
end;
$$;

comment on function public.create_delivery_zone(text, text, bigint) is
  'Create a delivery zone (Manager+ only). The per-zone fee is optional and retired (O-28); amounts live in the delivery fee grid. Returns zone ID.';

revoke all on function public.create_delivery_zone(text, text, bigint) from anon, public;
grant execute on function public.create_delivery_zone(text, text, bigint) to authenticated;

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'delivery_zones'
                   and column_name = 'fee_paisa' and is_nullable = 'YES') then
    raise exception '0247: delivery_zones.fee_paisa must be nullable (NULL = not set)';
  end if;
  if not exists (select 1 from pg_proc p
                 where p.proname = 'create_delivery_zone' and p.pronamespace = 'public'::regnamespace
                   and p.pronargdefaults = 1) then
    raise exception '0247: create_delivery_zone fee parameter is not optional';
  end if;
end;
$$;

-- Record 0247_retire_per_zone_fee_on_create in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030128', '0247_retire_per_zone_fee_on_create')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0247_retire_per_zone_fee_on_create.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0248_delivery_zone_distance_band.sql
-- SHA-256: 69950f021630ee8d53dba26ffd20a321fa2dbccf3493275a94dfe16c06240b14
-- Version: 20261122030129
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0248 — Delivery zone road-distance band (O-28b).
--
-- RULING 2026-11-19 (owner: Babin), O-28b: delivery charging is HYBRID. Named zones stay the
-- unit staff pick; each zone also carries a road-distance band from Boudha as a CHECK. Prices
-- still come from the zone x vehicle grid (0245). No price depends on this table.
--
-- Band meaning: the zone covers road distances OVER min_km up to and including max_km. A zone
-- with min_km = 0 covers 0..max_km. max_km NULL means open-ended ("over min_km"). A zone with
-- no row, or min_km NULL, has no band set ("not set", never 0).
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; flagged in OPEN_DECISIONS section 23):
--   · delivery_zones (0189) is NOT altered. Its list_delivery_zones() returns the whole row, so a
--     new column would break it (the same reason 0245 keeps its tables apart).
--   · Distance is not money. Every staff role that can read zones may read the band; Client may
--     not. This mirrors the 0189 read policy.
--   · Writers are Owner, Admin and Manager, the same set as zone management (0189), so the
--     Settings control and the database agree (P3, N-3).
--   · Nothing is deleted. Clearing a band stores NULL; the row stays.
--   · Bands are not forced to be non-overlapping across zones: that would be a new rule. Only the
--     band's own shape is checked.
-- =============================================================================

create table if not exists public.delivery_zone_distance_bands (
  zone_id    uuid          not null primary key references public.delivery_zones (id),
  -- NULL min_km = band not set. Never 0 for "not set": 0 is a real lower bound (Z1: 0..3 km).
  min_km     numeric(6, 2) null
             constraint delivery_zone_distance_bands_min_nonneg check (min_km is null or min_km >= 0),
  -- NULL max_km = open-ended ("over min_km"). Only meaningful when min_km is set.
  max_km     numeric(6, 2) null,
  updated_at timestamptz   not null default now(),
  updated_by uuid,
  constraint delivery_zone_distance_bands_shape check (
    (min_km is not null or max_km is null)
    and (max_km is null or max_km > min_km)
  )
);

comment on table public.delivery_zone_distance_bands is
  'RULING 2026-11-19 (O-28b): road-distance band of a delivery zone, measured on the shortest practical '
  'driving route from Boudha. Covers distances over min_km up to max_km (inclusive); NULL max_km is '
  'open-ended; NULL min_km is not set. A check only: no price depends on it. Written through '
  'set_delivery_zone_distance_band() (Owner, Admin, Manager).';

alter table public.delivery_zone_distance_bands enable row level security;

drop policy if exists delivery_zone_distance_bands_read on public.delivery_zone_distance_bands;
create policy delivery_zone_distance_bands_read on public.delivery_zone_distance_bands
  for select
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts')
  );

revoke insert, update, delete on public.delivery_zone_distance_bands from anon, authenticated;

create or replace function public.set_delivery_zone_distance_band(
  p_zone_id uuid,
  p_min_km  numeric,
  p_max_km  numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager') then
    raise insufficient_privilege using message = 'Only the Owner, Admin or Manager can set a delivery zone distance band (O-28b)';
  end if;
  if not exists (select 1 from public.delivery_zones where id = p_zone_id) then
    raise exception 'Unknown delivery zone' using errcode = 'foreign_key_violation';
  end if;
  if p_min_km is null and p_max_km is not null then
    raise exception 'A distance band needs a lower bound before an upper bound' using errcode = 'check_violation';
  end if;
  if p_min_km is not null and p_min_km < 0 then
    raise exception 'Distance cannot be negative' using errcode = 'check_violation';
  end if;
  if p_max_km is not null and p_max_km <= p_min_km then
    raise exception 'The upper distance must be greater than the lower distance' using errcode = 'check_violation';
  end if;

  insert into public.delivery_zone_distance_bands (zone_id, min_km, max_km, updated_at, updated_by)
  values (p_zone_id, p_min_km, p_max_km, now(), auth.uid())
  on conflict (zone_id)
  do update set min_km = excluded.min_km,
                max_km = excluded.max_km,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by;

  return true;
end;
$$;

comment on function public.set_delivery_zone_distance_band(uuid, numeric, numeric) is
  'RULING 2026-11-19 (O-28b): set a zone road-distance band. NULL min clears it to not set (the row is kept). '
  'NULL max is open-ended. Owner, Admin, Manager. Returns true when the row is written.';

revoke all on function public.set_delivery_zone_distance_band(uuid, numeric, numeric) from public, anon;
grant execute on function public.set_delivery_zone_distance_band(uuid, numeric, numeric) to authenticated;

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class c where c.relname = 'delivery_zone_distance_bands' and c.relrowsecurity) then
    raise exception '0248 post-condition failed: RLS not enabled on delivery_zone_distance_bands';
  end if;
  if not exists (select 1 from pg_proc where proname = 'set_delivery_zone_distance_band') then
    raise exception '0248 post-condition failed: set_delivery_zone_distance_band missing';
  end if;
end
$$;

-- Record 0248_delivery_zone_distance_band in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030129', '0248_delivery_zone_distance_band')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0248_delivery_zone_distance_band.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0249_late_night_delivery_is_money_setting.sql
-- SHA-256: 8b43130bfbb6978df53268f3d2862dd74bee570c8296fb8bdd49965f79cf60cf
-- Version: 20261122030130
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0249: lateNightDeliveryRupees is a money setting (Law 6)
--
-- RULING 2026-11-19 (Babin, interview S2 row 5): a late-night or emergency delivery carries a flat extra
-- charge, an amount Babin sets in Settings ▸ Financial (`lateNightDeliveryRupees`, 0 = not set; the app
-- invents no figure). It is a money figure, so the settings read policy must keep it from Warehouse,
-- Technician and Driver (Law 6). Adding a key is a migration, exactly like 0202.
--
-- Only the list changes. The key's value, its default (0, in the app), who may write it (Owner, via
-- set_setting) and every other money key are untouched. Rows already saved under this key (none
-- expected) are marked is_money so the read policy applies to them too.
--
-- REVERT: re-create settings_is_money_key() without 'lateNightDeliveryRupees' (the list in 0202) and set
-- is_money = false on any rows for that key.
--
-- N-5: written, numbered, tested locally under PGlite. Babin applies after the backup.
-- =============================================================================

begin;

create or replace function settings_is_money_key(p_key text)
returns boolean language sql immutable as $$
  select p_key in (
    'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays', 'overdueStopDays',
    'latePaymentPercentPerMonth', 'allowDepositSkipOnClose',
    'staffDiscountPercent',
    'lateNightDeliveryRupees'
  );
$$;

update public.settings
   set is_money = true
 where key = 'lateNightDeliveryRupees'
   and is_money = false;

commit;

-- Record 0249_late_night_delivery_is_money_setting in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030130', '0249_late_night_delivery_is_money_setting')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0249_late_night_delivery_is_money_setting.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0250_outsourced_vehicle_quote.sql
-- SHA-256: b803e6fe22ab6c455aac87b0001fab255c9225076600e15afd3771c180773f84
-- Version: 20261122030131
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0250 — Outsourced vehicle: manual quote with an approval note (S2 row 8).
--
-- RULING 2026-11-19 (Babin, interview): an outsourced vehicle is handled by a MANUAL QUOTE WITH AN
-- APPROVAL NOTE. Staff type the quoted charge and mark the vehicle outsourced; the booking records who
-- approved it, and it goes in the audit log. RULINGS-2026-11-19 S2 row 8.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; routine engineering, flagged in PROGRESS):
--   · The approver is the signed-in person who records the quote (auth.uid()), never a value the
--     caller supplies. The approval note is their own words.
--   · Own table, append-only (Law 3): a changed quote is a NEW row, the latest is the live one. Nothing
--     is edited or deleted, even by a privileged role (trigger).
--   · Writers are Owner, Admin, Manager, Coordinator (the set that may choose a delivery zone, 0246),
--     and the caller must be able to see money (Law 6: a quote is a money figure). Branch-limited
--     for everyone except Owner and Admin, like 0246.
--   · Read by money-visible roles only. Warehouse, Technician, Driver and Client never see it.
--   · Audit: the existing log_audit_event() trigger (0010) on insert, so the record, the amount, the
--     approver and the time are in audit_events with no extra code.
--   · Idempotent: unique (booking_id, client_uuid), so a retried submit repeats safely.
--   · No amount, vendor or note is invented here; the quote is whatever staff typed.
-- =============================================================================

create table if not exists public.booking_outsourced_vehicle_quotes (
  id            uuid        not null primary key default gen_random_uuid(),
  client_uuid   uuid        not null,
  booking_id    uuid        not null references public.bookings (id),
  vendor        text        not null
                constraint booking_outsourced_vehicle_quotes_vendor_len
                check (char_length(btrim(vendor)) between 1 and 120),
  quote_paisa   bigint      not null
                constraint booking_outsourced_vehicle_quotes_quote_pos check (quote_paisa > 0),
  approval_note text        not null
                constraint booking_outsourced_vehicle_quotes_note_len
                check (char_length(btrim(approval_note)) between 1 and 500),
  approved_by   uuid        not null references public.users (id),
  approved_at   timestamptz not null default now(),
  constraint booking_outsourced_vehicle_quotes_idem unique (booking_id, client_uuid)
);

comment on table public.booking_outsourced_vehicle_quotes is
  'RULING 2026-11-19 (S2 row 8): a manual quote for an outsourced vehicle, with the approver''s note. '
  'Append-only (Law 3); the latest row for a booking is the live quote. Written only through '
  'record_outsourced_vehicle_quote(). Read by money-visible roles.';

create index if not exists booking_outsourced_vehicle_quotes_booking_idx
  on public.booking_outsourced_vehicle_quotes (booking_id, approved_at desc);

alter table public.booking_outsourced_vehicle_quotes enable row level security;

drop policy if exists booking_outsourced_vehicle_quotes_read on public.booking_outsourced_vehicle_quotes;
create policy booking_outsourced_vehicle_quotes_read on public.booking_outsourced_vehicle_quotes
  for select
  to authenticated
  using (auth_can_view_money());

revoke insert, update, delete on public.booking_outsourced_vehicle_quotes from anon, authenticated;

-- Law 3: never edited, never deleted, even by a privileged role.
create or replace function public.forbid_outsourced_vehicle_quote_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Law 3: an outsourced vehicle quote is never edited or deleted; record a new quote instead'
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.forbid_outsourced_vehicle_quote_change() from public, anon, authenticated;

drop trigger if exists trg_outsourced_vehicle_quote_immutable on public.booking_outsourced_vehicle_quotes;
create trigger trg_outsourced_vehicle_quote_immutable
  before update or delete on public.booking_outsourced_vehicle_quotes
  for each row execute function public.forbid_outsourced_vehicle_quote_change();

drop trigger if exists trg_audit_booking_outsourced_vehicle_quotes on public.booking_outsourced_vehicle_quotes;
create trigger trg_audit_booking_outsourced_vehicle_quotes
  after insert on public.booking_outsourced_vehicle_quotes
  for each row execute function log_audit_event();

create or replace function public.record_outsourced_vehicle_quote(
  p_client_uuid   uuid,
  p_booking_id    uuid,
  p_vendor        text,
  p_quote_paisa   bigint,
  p_approval_note text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    text := auth_user_role();
  v_branch  uuid;
  v_booking public.bookings%rowtype;
begin
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise insufficient_privilege using message = 'Only Owner, Admin, Manager or Coordinator may record an outsourced vehicle quote';
  end if;
  if not auth_can_view_money() then
    raise insufficient_privilege using message = 'An outsourced vehicle quote is a money figure; this role cannot see money (Law 6)';
  end if;
  if p_client_uuid is null then
    raise exception 'A client_uuid is required' using errcode = 'null_value_not_allowed';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'No active booking to record an outsourced vehicle quote on' using errcode = 'P0002';
  end if;

  if v_role not in ('Owner', 'Admin') then
    select u.branch_id into v_branch from public.users u where u.id = auth.uid() and u.is_active;
    if v_branch is distinct from v_booking.branch_id then
      raise insufficient_privilege using message = 'Outsourced vehicle quote branch access denied';
    end if;
  end if;

  if p_vendor is null or char_length(btrim(p_vendor)) not between 1 and 120 then
    raise exception 'Enter the vendor (1 to 120 characters)' using errcode = 'check_violation';
  end if;
  if p_quote_paisa is null or p_quote_paisa <= 0 then
    raise exception 'The quote must be more than 0' using errcode = 'check_violation';
  end if;
  if p_approval_note is null or char_length(btrim(p_approval_note)) not between 1 and 500 then
    raise exception 'Enter the approval note (1 to 500 characters)' using errcode = 'check_violation';
  end if;

  insert into public.booking_outsourced_vehicle_quotes
    (client_uuid, booking_id, vendor, quote_paisa, approval_note, approved_by, approved_at)
  values
    (p_client_uuid, p_booking_id, btrim(p_vendor), p_quote_paisa, btrim(p_approval_note), auth.uid(), now())
  on conflict (booking_id, client_uuid) do nothing;

  return true;
end;
$$;

comment on function public.record_outsourced_vehicle_quote(uuid, uuid, text, bigint, text) is
  'RULING 2026-11-19 (S2 row 8): record a manual outsourced-vehicle quote with an approval note. The approver '
  'is the caller. Owner, Admin, Manager, Coordinator who can see money; branch-limited except Owner and Admin. '
  'Idempotent on (booking, client_uuid). Returns true.';

revoke all on function public.record_outsourced_vehicle_quote(uuid, uuid, text, bigint, text) from public, anon;
grant execute on function public.record_outsourced_vehicle_quote(uuid, uuid, text, bigint, text) to authenticated;

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class c where c.relname = 'booking_outsourced_vehicle_quotes' and c.relrowsecurity) then
    raise exception '0250 post-condition failed: RLS not enabled on booking_outsourced_vehicle_quotes';
  end if;
  if not exists (select 1 from pg_proc where proname = 'record_outsourced_vehicle_quote') then
    raise exception '0250 post-condition failed: record_outsourced_vehicle_quote missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_booking_outsourced_vehicle_quotes') then
    raise exception '0250 post-condition failed: audit trigger missing';
  end if;
end
$$;

-- Record 0250_outsourced_vehicle_quote in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030131', '0250_outsourced_vehicle_quote')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0250_outsourced_vehicle_quote.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0251_waiting_charge_line.sql
-- SHA-256: ca6980201a201d60db713148ac81d4154bbbc01f35362c706d5ea32dc96aa434
-- Version: 20261122030132
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0251 — Waiting charge added after the trip (S2 row 6).
--
-- RULING 2026-11-19 (Babin, interview): waiting beyond the included 10 minutes is NOT priced at booking.
-- Staff add it after the trip as its own line on the booking. Who may add it (same interview): Owner,
-- Admin, Manager, Coordinator.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; routine engineering, flagged in PROGRESS and OPEN_DECISIONS §23):
--   · The amount is typed by the person adding it. No rate, per-minute figure or block size is invented.
--   · It is an ordinary flat Service line on the booking (service_basis 'Flat', qty 1, days 1), so it
--     bills like any service line: create_invoice snapshots it when the Draft is created.
--   · If the booking already has a DRAFT invoice the line is appended to it (SPEC-P0-1 R-02/R-03: extra
--     charges append to the one Draft; the totals trigger recalculates). If it has none, the line waits
--     on the booking for create_invoice.
--   · If the booking's invoice is already ISSUED, this REFUSES, in words. R-03 is one invoice per rental
--     and "corrections after issue are Void + Credit Note". Babin answered (19 Nov) that an issued
--     invoice should get a separate invoice for the extra charge; that conflicts with R-03 and with the
--     close gates, which read one invoice's outstanding amount, so it is NOT built here. It is recorded
--     as TODO(decision) in OPEN_DECISIONS §23 for Babin to confirm, with the hazard named.
--   · The caller must see money (Law 6), is branch-limited unless Owner or Admin, and the booking must
--     be active (not cancelled, returned or closed), like add_consumable_line (0239).
--   · Audit: a conditional trigger runs the existing log_audit_event() (0010) for waiting-charge lines
--     only, so the amount, the minutes and the person are in audit_events without auditing every line.
--   · Idempotent on booking_lines.client_uuid (Law 8): a retry returns the same line.
-- =============================================================================

create or replace function public.add_waiting_charge_line(
  p_client_uuid  uuid,
  p_booking_id   uuid,
  p_minutes      integer,
  p_amount_paisa bigint,
  p_note         text default null
)
returns table (line_id uuid, invoice_id uuid, appended_to_draft boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_role     text := auth_user_role();
  v_branch   uuid;
  v_booking  public.bookings%rowtype;
  v_invoice  record;
  v_rupees   numeric(14, 2);
  v_desc     text;
  v_line_id  uuid;
  v_existing uuid;
  v_has_invoice boolean;
begin
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise insufficient_privilege using message = 'Only Owner, Admin, Manager or Coordinator may add a waiting charge';
  end if;
  if not auth_can_view_money() then
    raise insufficient_privilege using message = 'A waiting charge is a money figure; this role cannot see money (Law 6)';
  end if;
  if p_client_uuid is null then
    raise exception 'A client_uuid is required (Law 8)' using errcode = 'null_value_not_allowed';
  end if;
  if p_minutes is null or p_minutes <= 0 or p_minutes > 1440 then
    raise exception 'Enter the minutes waited (1 to 1440)' using errcode = 'check_violation';
  end if;
  if p_amount_paisa is null or p_amount_paisa <= 0 then
    raise exception 'The waiting charge must be more than 0' using errcode = 'check_violation';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'No booking to add a waiting charge to' using errcode = 'P0002';
  end if;
  if v_booking.cancelled_at is not null or v_booking.stage in ('Returned', 'Closed') then
    raise exception 'Cannot add a waiting charge to a cancelled, returned or closed booking' using errcode = 'P0002';
  end if;

  if v_role not in ('Owner', 'Admin') then
    select u.branch_id into v_branch from public.users u where u.id = v_actor and u.is_active;
    if v_branch is distinct from v_booking.branch_id then
      raise insufficient_privilege using message = 'Waiting charge branch access denied';
    end if;
  end if;

  -- Law 8: a retry of the same press returns the same line and writes nothing.
  select bl.id into v_existing from public.booking_lines bl where bl.client_uuid = p_client_uuid;
  if found then
    return query
      select v_existing,
             (select i.id from public.invoices i where i.booking_id = p_booking_id and i.status = 'Draft' limit 1),
             exists (select 1 from public.invoices i where i.booking_id = p_booking_id and i.status = 'Draft');
    return;
  end if;

  -- R-03: one invoice per rental. A Draft takes the line; an issued invoice is not edited.
  select i.id, i.status::text as status, i.invoice_no into v_invoice
    from public.invoices i
   where i.booking_id = p_booking_id and i.status <> 'Void'
   order by i.created_at desc
   limit 1;
  v_has_invoice := found;
  if v_has_invoice and v_invoice.status <> 'Draft' then
    raise exception
      'This booking''s invoice (%) is already issued (%). A waiting charge cannot be added to an issued invoice: corrections after issue are Void + Credit Note (R-03). Nothing was added.',
      coalesce(v_invoice.invoice_no, 'unnumbered'), v_invoice.status
      using errcode = 'P0001';
  end if;

  v_rupees := (p_amount_paisa / 100.0)::numeric(14, 2);
  v_desc   := 'Waiting charge (' || p_minutes || ' min)';

  insert into public.booking_lines (
    client_uuid, booking_id, line_type, description, qty, days, rate, discount_amount, line_total,
    service_basis, line_note, price_breakdown, created_by
  ) values (
    p_client_uuid, p_booking_id, 'Service', v_desc, 1, 1, v_rupees, 0, v_rupees,
    'Flat', nullif(btrim(p_note), ''),
    jsonb_build_object('kind', 'waiting_charge', 'minutes', p_minutes, 'amount_paisa', p_amount_paisa),
    v_actor
  ) returning id into v_line_id;

  if v_has_invoice and v_invoice.status = 'Draft' then
    insert into public.invoice_lines (
      client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total,
      discount_percent, sort_order
    ) values (
      gen_random_uuid(), v_invoice.id, 'Services'::line_kind, v_desc, 1, 1, v_rupees, v_rupees, 0, 100
    );
    return query select v_line_id, v_invoice.id, true;
  else
    return query select v_line_id, null::uuid, false;
  end if;
end;
$$;

comment on function public.add_waiting_charge_line(uuid, uuid, integer, bigint, text) is
  'RULING 2026-11-19 (S2 row 6): add a flat waiting-charge Service line to an active booking, typed by '
  'Owner, Admin, Manager or Coordinator who can see money (branch-limited except Owner and Admin). '
  'Appended to the booking''s Draft invoice if one exists; refused in words if the invoice is issued (R-03). '
  'Idempotent on client_uuid. Returns the line, the invoice appended to and whether it was appended.';

revoke all on function public.add_waiting_charge_line(uuid, uuid, integer, bigint, text) from public, anon;
grant execute on function public.add_waiting_charge_line(uuid, uuid, integer, bigint, text) to authenticated;

-- Audit: only waiting-charge lines, through the existing universal logger (0010).
drop trigger if exists trg_audit_booking_waiting_charge on public.booking_lines;
create trigger trg_audit_booking_waiting_charge
  after insert on public.booking_lines
  for each row
  when (new.price_breakdown ->> 'kind' = 'waiting_charge')
  execute function log_audit_event();

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'add_waiting_charge_line') then
    raise exception '0251 post-condition failed: add_waiting_charge_line missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_booking_waiting_charge') then
    raise exception '0251 post-condition failed: audit trigger missing';
  end if;
end
$$;

-- Record 0251_waiting_charge_line in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030132', '0251_waiting_charge_line')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0251_waiting_charge_line.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0252_allow_overbooking_on_chosen_products.sql
-- SHA-256: c043d4bc5227cd139958edb3fa1b61519260ead50a775ab0e454307bdc300a95
-- Version: 20261122030133
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0245_allow_overbooking_on_chosen_products.sql
-- T2-23: Allow overbooking on chosen products (safe shortage handling)
-- B12, B53, K4; Law 1, Law 6, Law 8, Law 16.

-- 1. Add allow_overbooking to products (off by default, B12)
alter table public.products
  add column if not exists allow_overbooking boolean not null default false;

grant select (allow_overbooking) on public.products to authenticated;

comment on column public.products.allow_overbooking is
  'When true, confirming demand beyond free stock creates a shortage without reserving phantom units. Defaults to false (B12).';

-- 2. Add short_quantity to booking_lines
alter table public.booking_lines
  add column if not exists short_quantity integer not null default 0 check (short_quantity >= 0);

grant select (short_quantity) on public.booking_lines to authenticated;

comment on column public.booking_lines.short_quantity is
  'Durable uncovered quantity on this line. When > 0, Pack and Handover refuse until covered or resolved.';

-- 3. Extend booking_at_risk causes to include overbooking_shortage
alter table public.booking_at_risk
  drop constraint if exists booking_at_risk_cause_check;

alter table public.booking_at_risk
  add constraint booking_at_risk_cause_check
    check (cause in ('extension_clash', 'late_return', 'marked_will_be_late', 'overbooking_shortage'));

-- 4. Update record_editor_private allowed fields
create or replace function record_editor_private.fields(kind text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
select case kind
when 'client' then array['type_parent','org_subtype','name','phone','email','pan_vat','business_registration','website','address_line','city','district','postal_code','country','billing_address','notes','is_staff','staff_user_id']
when 'equipment' then array['name','short_name','category_id','brand','model','manufacturer','description','reorder_level','quantity_unit','purchase_date','purchase_price','replacement_value','daily_rate','weekly_rate','monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed','min_rental_days','rental_enabled','allow_overbooking','prep_time_minutes','cleaning_time_minutes','inspection_required','packing_required','notes_internal','notes_warehouse']
when 'bundle' then array['name','description','category_id','daily_rate','weekly_rate','is_active'] end;
$$;

revoke all on function record_editor_private.fields(text) from public, anon;
grant execute on function record_editor_private.fields(text) to authenticated;

create or replace function record_editor_private.section_fields(p_kind text, p_section text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
select case p_kind
  when 'client' then
    case p_section
      when 'identity' then array['type_parent', 'org_subtype', 'name', 'pan_vat', 'business_registration', 'website', 'is_staff', 'staff_user_id']
      when 'contact' then array['phone', 'email', 'website']
      when 'address' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'addresses' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'notes' then array['notes']
      when 'commercial' then array[]::text[]
      else null
    end
  when 'equipment' then
    case p_section
      when 'identity' then array['name', 'short_name', 'category_id', 'brand', 'model', 'manufacturer', 'description']
      when 'location' then array[]::text[]
      when 'stock' then array['quantity_unit', 'reorder_level']
      when 'relationships' then array[]::text[]
      when 'purchase' then array['purchase_date', 'purchase_price', 'replacement_value']
      when 'pricing' then array['daily_rate', 'weekly_rate', 'monthly_rate', 'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed', 'min_rental_days', 'rental_enabled', 'allow_overbooking']
      when 'maintenance' then array['prep_time_minutes', 'cleaning_time_minutes', 'inspection_required', 'packing_required', 'notes_internal', 'notes_warehouse']
      else null
    end
  when 'bundle' then
    case p_section
      when 'identity' then array['name', 'description', 'category_id', 'is_active']
      when 'rates' then array['daily_rate', 'weekly_rate']
      when 'components' then array[]::text[]
      else null
    end
  else null
end;
$$;

revoke all on function record_editor_private.section_fields(text, text) from public, anon;
grant execute on function record_editor_private.section_fields(text, text) to authenticated;

-- 5. Expose allow_overbooking on products_v
drop view if exists public.products_v cascade;
create or replace view public.products_v as
 select id,
    client_uuid,
    asset_code,
    name,
    short_name,
    category_id,
    brand,
    model,
    manufacturer,
    description,
    thumbnail_url,
    tracking_mode,
    status,
    total_quantity,
    reorder_level,
    quantity_unit,
    purchase_date,
        CASE
            WHEN auth_can_view_money() THEN purchase_price
            ELSE NULL::numeric
        END AS purchase_price,
        CASE
            WHEN auth_can_view_money() THEN replacement_value
            ELSE NULL::numeric
        END AS replacement_value,
        CASE
            WHEN auth_can_view_money() THEN daily_rate
            ELSE NULL::numeric
        END AS daily_rate,
        CASE
            WHEN auth_can_view_money() THEN weekly_rate
            ELSE NULL::numeric
        END AS weekly_rate,
        CASE
            WHEN auth_can_view_money() THEN monthly_rate
            ELSE NULL::numeric
        END AS monthly_rate,
        CASE
            WHEN auth_can_view_money() THEN hourly_rate
            ELSE NULL::numeric
        END AS hourly_rate,
        CASE
            WHEN auth_can_view_money() THEN weekend_rate
            ELSE NULL::numeric
        END AS weekend_rate,
        CASE
            WHEN auth_can_view_money() THEN deposit_percent
            ELSE NULL::numeric
        END AS deposit_percent,
        CASE
            WHEN auth_can_view_money() THEN deposit_fixed
            ELSE NULL::numeric
        END AS deposit_fixed,
    min_rental_days,
    rental_enabled,
    prep_time_minutes,
    cleaning_time_minutes,
    inspection_required,
    packing_required,
    is_subrental_only,
    weight_kg,
    case_capacity,
    supplier_id,
    notes_internal,
    notes_warehouse,
    notes_rental,
    is_active,
    created_at,
    created_by,
    updated_at,
    updated_by,
        CASE
            WHEN auth_can_view_money() THEN unit_sale_price
            ELSE NULL::numeric
        END AS unit_sale_price,
    allow_overbooking
   FROM products
  where auth_is_staff();

revoke all on public.products_v from public, anon;
grant select on public.products_v to authenticated;

comment on view public.products_v is
  'Column-masked read surface for products — unit_sale_price and rates resolve to NULL for money-blind roles (Law 6). Includes allow_overbooking.';

-- 6. Helper: get available product capacity over a period
create or replace function public.get_available_product_capacity(
  p_product_id  uuid,
  p_period      tstzrange,
  p_ignore_booking_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tracking_mode  product_tracking_mode;
  v_total_quantity integer;
  v_capacity       integer;
  v_peak           integer;
begin
  select tracking_mode, total_quantity
    into v_tracking_mode, v_total_quantity
    from products
   where id = p_product_id;

  if not found then
    return 0;
  end if;

  if v_tracking_mode = 'Serialised' then
    select count(*) into v_capacity
      from product_units pu
     where pu.product_id = p_product_id
       and pu.status not in ('Maintenance', 'Missing', 'Retired');
  else
    v_capacity := coalesce(v_total_quantity, 0);
  end if;

  with live as (
    select r.period, r.qty
      from inventory_reservations r
     where r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and (p_ignore_booking_id is null or r.booking_id is distinct from p_ignore_booking_id)
       and r.product_id = p_product_id
       and r.period && p_period
    union all
    select r.period, r.qty
      from inventory_reservations r
      join product_units pu on pu.id = r.asset_id
     where r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and (p_ignore_booking_id is null or r.booking_id is distinct from p_ignore_booking_id)
       and pu.product_id = p_product_id
       and r.period && p_period
  ),
  candidates as (
    select distinct lower(l.period) as at
      from live l
     where p_period @> lower(l.period)
  )
  select coalesce(max(occupancy.held), 0) into v_peak
    from (
      select (
        select coalesce(sum(l.qty), 0)
          from live l
         where l.period @> c.at
      ) as held
      from candidates c
    ) occupancy;

  return greatest(0, v_capacity - v_peak);
end;
$$;

revoke all on function public.get_available_product_capacity(uuid, tstzrange, uuid) from public, anon;
grant execute on function public.get_available_product_capacity(uuid, tstzrange, uuid) to authenticated;

-- 7. Stage Gate: Refuse Pack and Handover if unresolved shortages exist
create or replace function public.enforce_pack_shortage_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_short_count integer;
begin
  if NEW.to_stage in ('Packed', 'On Rent') then
    select coalesce(sum(short_quantity), 0) into v_short_count
      from public.booking_lines
     where booking_id = NEW.booking_id
       and voided_at is null
       and short_quantity > 0;

    if v_short_count > 0 then
      raise exception 'GATE:gate.pack.shortage|Booking % has % unresolved short item(s) and cannot reach Pack or Handover until covered.',
        NEW.booking_id, v_short_count using errcode = 'P0001';
    end if;

    if exists (
      select 1
        from public.booking_at_risk
       where booking_id = NEW.booking_id
         and cause = 'overbooking_shortage'
         and resolved_at is null
    ) then
      raise exception 'GATE:gate.pack.shortage|Booking % has an unresolved overbooking shortage and cannot reach Pack or Handover until covered.',
        NEW.booking_id using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_pack_shortage_gate on public.booking_stage_transitions;
drop trigger if exists trg_a_enforce_pack_shortage_gate on public.booking_stage_transitions;
create trigger trg_a_enforce_pack_shortage_gate
  before insert on public.booking_stage_transitions
  for each row execute function public.enforce_pack_shortage_gate();

-- 8. Update resolve_booking_at_risk to clear line short_quantity
create or replace function public.resolve_booking_at_risk(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at_risk_id      uuid := (p_payload ->> 'at_risk_id')::uuid;
  v_resolution      text := p_payload ->> 'resolution';
  v_notes           text := btrim(coalesce(p_payload ->> 'notes', ''));
  v_credit_amount   numeric(14,2) := coalesce((p_payload ->> 'credit_amount')::numeric, 0);
  v_row             public.booking_at_risk%rowtype;
  v_booking         public.bookings%rowtype;
  v_role            system_role;
  v_actor           uuid;
  v_now             timestamptz := now();
begin
  if v_at_risk_id is null then
    raise exception 'resolve_booking_at_risk: at_risk_id is required.';
  end if;
  if v_resolution not in ('sub_rent', 'similar_item', 'refund', 'credit', 'client_change', 'cancelled') then
    raise exception 'resolve_booking_at_risk: invalid resolution "%".', v_resolution;
  end if;

  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'resolve_booking_at_risk: booking desk roles only.'
      using errcode = '42501';
  end if;

  -- SECURITY DEFINER bypasses RLS: a Coordinator may resolve operational risks,
  -- but never create account credit or declare a refund on a client's behalf.
  -- Check even when the amount is zero, and reject crafted positive credit_amount
  -- with a non-money resolution before any data is read or written.
  if (v_resolution in ('credit', 'refund') or v_credit_amount > 0)
     and v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'resolve_booking_at_risk: monetary credit or refund resolution requires Owner, Admin or Manager.'
      using errcode = '42501';
  end if;

  select * into v_row from public.booking_at_risk where id = v_at_risk_id;
  if not found then
    raise exception 'resolve_booking_at_risk: at-risk record % not found.', v_at_risk_id;
  end if;

  v_actor := auth_user_id();

  select * into v_booking from public.bookings where id = v_row.booking_id;

  if v_resolution = 'credit' and v_credit_amount > 0 then
    insert into public.client_account_credits (
      client_uuid, client_id, booking_id, amount, amount_paisa, reason, created_by
    ) values (
      gen_random_uuid(), v_booking.client_id, v_row.booking_id, v_credit_amount,
      (v_credit_amount * 100)::bigint, coalesce(v_notes, 'At-risk resolution account credit'), v_actor
    );

    update public.clients
       set account_credit = account_credit + v_credit_amount,
           account_credit_paisa = account_credit_paisa + (v_credit_amount * 100)::bigint,
           updated_at = v_now
     where id = v_booking.client_id;
  end if;

  -- If resolving an overbooking shortage, verify coverage before reducing short_quantity
  if v_row.cause = 'overbooking_shortage' then
    declare
      v_covering_qty integer := coalesce((p_payload ->> 'covering_qty')::integer, null);
      v_sub_rent_qty integer := 0;
      v_line_short   integer := 0;
    begin
      -- Count existing active sub-rental lines on this booking
      select coalesce(sum(qty), 0) into v_sub_rent_qty
        from public.booking_lines
       where booking_id = v_row.booking_id
         and line_type = 'Sub-rental'
         and voided_at is null;

      if v_covering_qty is null then
        if v_resolution = 'sub_rent' and v_sub_rent_qty > 0 then
          v_covering_qty := v_sub_rent_qty;
        elsif v_resolution in ('client_change', 'cancelled', 'refund') then
          v_covering_qty := (select coalesce(sum(short_quantity), 0) from public.booking_lines where booking_id = v_row.booking_id and (product_id = v_row.product_id or v_row.product_id is null) and voided_at is null);
        else
          v_covering_qty := 0;
        end if;
      end if;

      if v_covering_qty > 0 then
        -- Reduce short_quantity by the covered amount
        update public.booking_lines
           set short_quantity = greatest(0, short_quantity - v_covering_qty)
         where booking_id = v_row.booking_id
           and (product_id = v_row.product_id or v_row.product_id is null)
           and voided_at is null;
      end if;

      -- Check remaining shortage on the booking lines
      select coalesce(sum(short_quantity), 0) into v_line_short
        from public.booking_lines
       where booking_id = v_row.booking_id
         and (product_id = v_row.product_id or v_row.product_id is null)
         and voided_at is null;

      -- Only mark the at_risk row resolved if the shortage is fully covered (v_line_short = 0)
      if v_line_short > 0 then
        update public.booking_at_risk
           set resolution_notes = format('%s (Partially covered: %s remaining)', v_notes, v_line_short),
               updated_at = v_now
         where id = v_at_risk_id;

        return jsonb_build_object(
          'success', true,
          'at_risk_id', v_at_risk_id,
          'resolution', v_resolution,
          'resolved', false,
          'remaining_short_quantity', v_line_short,
          'message', format('Shortage partially covered: %s units still short. Pack remains blocked until fully covered.', v_line_short)
        );
      end if;
    end;
  end if;

  update public.booking_at_risk
     set resolved_at = v_now,
         resolved_by = v_actor,
         resolution = v_resolution,
         resolution_notes = v_notes,
         updated_at = v_now
   where id = v_at_risk_id;

  return jsonb_build_object(
    'success', true,
    'at_risk_id', v_at_risk_id,
    'resolution', v_resolution,
    'resolved_at', v_now
  );
end;
$$;

revoke all on function public.resolve_booking_at_risk(jsonb) from public, anon;
grant execute on function public.resolve_booking_at_risk(jsonb) to authenticated;

-- 9. Update reservations_follow_stage_transition to account for short_quantity and turnaround windows
create or replace function public.reservations_follow_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pickup     timestamptz;
  v_return     timestamptz;
  v_booking_no text;
  v_uncovered  text;
begin
  -- ── Release paths ───────────────────────────────────────────────────────
  if NEW.to_stage in ('Returned', 'Closed', 'Quote') then
    update inventory_reservations
       set released_at     = NEW.occurred_at,
           released_reason = case NEW.to_stage
             when 'Returned' then 'Released on Return: the booking reached Returned.'
             when 'Closed'   then 'Released on Close: the booking reached Closed.'
             else 'Released by a reversal back to Quote: a Quote holds nothing.'
           end
     where booking_id = NEW.booking_id
       and released_at is null;
    return NEW;
  end if;

  if NEW.to_stage <> 'Booked' then
    return NEW;
  end if;

  -- ── Booked: place or confirm the holds ──────────────────────────────────
  select pickup_at, return_at, booking_no
    into v_pickup, v_return, v_booking_no
    from bookings
   where id = NEW.booking_id;

  if v_pickup is null then
    raise exception
      'Reservation rejected: booking % could not be read, so its rental window is unknown.',
      NEW.booking_id;
  end if;

  -- 1. Reclaim expired temporary holds for affected assets/products
  update inventory_reservations
     set hold_state = 'expired_hold',
         released_at = NEW.occurred_at,
         released_reason = 'Hold expired automatically prior to confirmation'
   where hold_state = 'active_hold'
     and expires_at <= NEW.occurred_at
     and released_at is null
     and (
       asset_id in (
         select distinct blu.asset_id
           from booking_line_units blu
           join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = NEW.booking_id
            and bl.voided_at is null
            and blu.released_at is null
       )
       or product_id in (
         select distinct bl.product_id
           from booking_lines bl
          where bl.booking_id = NEW.booking_id
            and bl.voided_at is null
            and bl.product_id is not null
       )
     );

  -- 2. Promote any existing active holds owned by this booking to confirmed with widened period
  update inventory_reservations r
     set hold_state = 'confirmed',
         expires_at = null,
         period = public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes)
    from booking_lines bl
    join products p on p.id = bl.product_id
   where r.booking_id = NEW.booking_id
     and r.booking_line_id = bl.id
     and r.hold_state = 'active_hold'
     and r.released_at is null;

  -- 3. Serialised: one row per live assigned unit (skipping units already reserved for this booking)
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, blu.asset_id, 1,
         public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes),
         NEW.actor_id, 'confirmed'
    from booking_lines bl
    join products p on p.id = bl.product_id
    join booking_line_units blu on blu.booking_line_id = bl.id
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and blu.released_at is null
     and not exists (
       select 1 from inventory_reservations r
        where r.booking_id = NEW.booking_id
          and r.asset_id = blu.asset_id
          and r.released_at is null
     );

  -- 4. Quantity: remainder of each line not covered by live units or existing reservations, minus short_quantity
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, bl.product_id,
         greatest(0, bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0) - coalesce(bl.short_quantity, 0)),
         public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes),
         NEW.actor_id, 'confirmed'
    from booking_lines bl
    join products p on p.id = bl.product_id
    left join lateral (
      select count(*) as n
        from booking_line_units blu
       where blu.booking_line_id = bl.id
         and blu.released_at is null
    ) u on true
    left join lateral (
      select coalesce(sum(r.qty), 0) as n
        from inventory_reservations r
       where r.booking_line_id = bl.id
         and r.product_id = bl.product_id
         and r.asset_id is null
         and r.released_at is null
    ) res on true
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0) - coalesce(bl.short_quantity, 0)) > 0;

  -- ── Coverage ────────────────────────────────────────────────────────────
  select string_agg(bl.description, ', ')
    into v_uncovered
    from booking_lines bl
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
     and (bl.qty - coalesce(bl.short_quantity, 0)) > 0
     and not exists (
       select 1 from inventory_reservations r
        where r.booking_line_id = bl.id
          and r.released_at is null
     );

  if v_uncovered is not null then
    raise exception
      'Reservation rejected: booking % reached Booked with no hold behind %. Nothing was booked.',
      coalesce(v_booking_no, NEW.booking_id::text), v_uncovered;
  end if;

  return NEW;
end;
$$;

-- 10. Update confirm_booking_atomic to handle overbooking and compute shortages
create or replace function public.confirm_booking_atomic(
  p_booking_id  uuid,
  p_actor_id    uuid,
  p_client_uuid uuid,
  p_occurred_at timestamptz default now(),
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking         record;
  v_role            text;
  v_line_count      int;
  v_occurred_at     timestamptz;
  v_res_units       int;
  v_res_qty         int;
  v_actor           uuid;
  v_period          tstzrange;
  v_line_rec        record;
  v_free_cap        int;
  v_short_qty       int;
  v_assigned_count  int;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null or p_actor_id is distinct from v_actor then
    raise exception 'Permission denied: confirmation actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'A confirmation idempotency key is required.';
  end if;

  v_occurred_at := coalesce(p_occurred_at, now());

  -- 1. Lock the booking row for update
  select id, booking_no, branch_id, client_id, stage, cancelled_at, closed_at, project_type, pickup_at, return_at
    into v_booking
    from bookings
   where id = p_booking_id
     for update;

  if not found then
    raise exception 'Booking % not found. Nothing was confirmed.', p_booking_id;
  end if;

  if v_role in ('Coordinator', 'Warehouse')
     and (auth_user_branch_id() is null
          or v_booking.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'Permission denied: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  if v_booking.cancelled_at is not null then
    raise exception '% was cancelled. A cancelled booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null then
    raise exception '% is Closed. A closed booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.stage <> 'Quote' then
    if v_booking.stage = 'Booked' then
      return jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'booking_no', v_booking.booking_no,
        'stage', 'Booked',
        'already_confirmed', true
      );
    end if;
    raise exception 'Confirm moves a booking from Quote to Booked; % is at %. Nothing was confirmed.',
      v_booking.booking_no, v_booking.stage;
  end if;

  if coalesce(trim(v_booking.project_type), '') = '' then
    raise exception 'Select a project type before confirming this rental. % has none recorded.',
      v_booking.booking_no;
  end if;

  -- 2. Verify live lines
  select count(*) into v_line_count
    from booking_lines
   where booking_id = p_booking_id
     and voided_at is null;

  if v_line_count = 0 then
    raise exception '% has no live lines, so there is nothing to commit.', v_booking.booking_no;
  end if;

  v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');

  -- 3. Deterministically lock affected products
  perform p.id
     from products p
    where p.id in (
      select distinct bl.product_id
        from booking_lines bl
       where bl.booking_id = p_booking_id
         and bl.voided_at is null
         and bl.product_id is not null
    )
    order by p.id
      for update;

  -- 4. Deterministically lock affected units
  perform pu.id
     from product_units pu
    where pu.id in (
      select distinct blu.asset_id
        from booking_line_units blu
        join booking_lines bl on bl.id = blu.booking_line_id
       where bl.booking_id = p_booking_id
         and bl.voided_at is null
         and blu.released_at is null
    )
    order by pu.id
      for update;

  -- 5. Atomically reclaim expired holds for affected products and units
  update inventory_reservations
     set hold_state = 'expired_hold',
         released_at = v_occurred_at,
         released_reason = 'Hold expired automatically prior to confirmation'
   where hold_state = 'active_hold'
     and expires_at <= v_occurred_at
     and released_at is null
     and (
       asset_id in (
         select distinct blu.asset_id
           from booking_line_units blu
           join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = p_booking_id
            and bl.voided_at is null
            and blu.released_at is null
       )
       or product_id in (
         select distinct bl.product_id
           from booking_lines bl
          where bl.booking_id = p_booking_id
            and bl.voided_at is null
            and bl.product_id is not null
       )
     );

  -- 6. Convert any existing active holds owned by this booking to confirmed
  update inventory_reservations
     set hold_state = 'confirmed',
         expires_at = null
   where booking_id = p_booking_id
     and hold_state = 'active_hold'
     and released_at is null;

  -- 6b. Evaluate available capacity vs demand for overbooking-enabled products
  for v_line_rec in
    select bl.id as line_id,
           bl.product_id,
           bl.qty,
           bl.description,
           coalesce(p.allow_overbooking, false) as allow_overbooking,
           p.tracking_mode
      from booking_lines bl
      join products p on p.id = bl.product_id
     where bl.booking_id = p_booking_id
       and bl.voided_at is null
       and bl.product_id is not null
     order by bl.id
  loop
    v_free_cap := public.get_available_product_capacity(v_line_rec.product_id, v_period, p_booking_id);

    if v_line_rec.allow_overbooking then
      if v_line_rec.qty > v_free_cap then
        v_short_qty := v_line_rec.qty - v_free_cap;
        update booking_lines
           set short_quantity = v_short_qty
         where id = v_line_rec.line_id;

        -- If serialised: prune any pre-assigned units exceeding free capacity or colliding
        if v_line_rec.tracking_mode = 'Serialised' then
          select count(*) into v_assigned_count
            from booking_line_units blu
           where blu.booking_line_id = v_line_rec.line_id
             and blu.released_at is null;

          if v_assigned_count > v_free_cap then
            -- Release excess assigned units beyond free capacity so GiST is not violated
            delete from booking_line_units
             where id in (
               select id from booking_line_units
                where booking_line_id = v_line_rec.line_id
                  and released_at is null
                order by created_at desc
                limit (v_assigned_count - v_free_cap)
             );
          end if;
        end if;

        -- Record shortage in booking_at_risk
        insert into public.booking_at_risk (
          client_uuid,
          booking_id,
          booking_no,
          cause,
          product_id,
          product_name,
          resolution_notes,
          raised_by
        ) values (
          gen_random_uuid(),
          p_booking_id,
          v_booking.booking_no,
          'overbooking_shortage',
          v_line_rec.product_id,
          v_line_rec.description,
          format('%s short — sub-rent or swap', v_short_qty),
          v_actor
        );
      else
        update booking_lines
           set short_quantity = 0
         where id = v_line_rec.line_id;
      end if;
    else
      -- allow_overbooking is FALSE: fail closed if capacity is exceeded
      update booking_lines
         set short_quantity = 0
       where id = v_line_rec.line_id;
    end if;
  end loop;

  -- 7. Insert the stage transition (which invokes triggers to move stage and write reservations)
  insert into booking_stage_transitions
    (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
  values
    (p_client_uuid, p_booking_id, v_booking.branch_id, 'Quote', 'Booked', p_actor_id, v_role, v_occurred_at, p_reason);

  -- Read back counts of reservations committed
  select count(asset_id), coalesce(sum(qty), 0)
    into v_res_units, v_res_qty
    from inventory_reservations
   where booking_id = p_booking_id
     and released_at is null;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'booking_no', v_booking.booking_no,
    'client_id', v_booking.client_id,
    'branch_id', v_booking.branch_id,
    'stage', 'Booked',
    'lines', v_line_count,
    'units_reserved', v_res_units,
    'quantity_reserved', v_res_qty
  );
end;
$$;

revoke execute on function confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) to authenticated;

-- Record 0252_allow_overbooking_on_chosen_products in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030133', '0252_allow_overbooking_on_chosen_products')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0252_allow_overbooking_on_chosen_products.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0253_temporary_stock_from_partners.sql
-- SHA-256: 414eb4ff8ef6755b00b27f218813e1f6e4aa2e2d720b978388d613431a331dad
-- Version: 20261122030134
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

begin;

-- ============================================================================
-- Migration 0253: Temporary Stock from Partners (T2-24, B13, B36, B47, Law 6)
-- ============================================================================

-- 1. Create enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'partner_cost_kind') then
    create type public.partner_cost_kind as enum ('daily', 'fixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'temporary_stock_status') then
    create type public.temporary_stock_status as enum ('Active', 'Returned to partner', 'Cancelled');
  end if;
end $$;

-- 2. Table: temporary_stock
create table if not exists public.temporary_stock (
  id                  uuid primary key default gen_random_uuid(),
  client_uuid         uuid not null unique,
  supplier_id         uuid not null references public.suppliers(id),
  product_id          uuid not null references public.products(id),
  tracking_mode       public.product_tracking_mode not null default 'Serialised',
  quantity            integer not null check (quantity > 0),
  available_from      timestamptz not null,
  available_until     timestamptz not null,
  cost_kind           public.partner_cost_kind not null,
  cost_paisa          bigint not null check (cost_paisa >= 0),
  status              public.temporary_stock_status not null default 'Active',
  notes               text,
  returned_at         timestamptz,
  returned_by         uuid references public.users(id),
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  constraint chk_temp_stock_window check (available_until > available_from)
);

create index if not exists idx_temporary_stock_product on public.temporary_stock(product_id);
create index if not exists idx_temporary_stock_supplier on public.temporary_stock(supplier_id);
create index if not exists idx_temporary_stock_status on public.temporary_stock(status);

-- 3. Link partner units in product_units
alter table public.product_units
  add column if not exists temporary_stock_id uuid references public.temporary_stock(id),
  add column if not exists is_partner_unit boolean not null default false;

create index if not exists idx_product_units_temp_stock
  on public.product_units(temporary_stock_id)
  where temporary_stock_id is not null;

-- 4. RLS on temporary_stock
alter table public.temporary_stock enable row level security;

drop policy if exists temporary_stock_select on public.temporary_stock;
create policy temporary_stock_select on public.temporary_stock
  for select
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Accounts'));

drop policy if exists temporary_stock_modify on public.temporary_stock;
create policy temporary_stock_modify on public.temporary_stock
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts'));

-- 5. Law 6 column-level money masking on temporary_stock
revoke select on public.temporary_stock from authenticated;
grant select (
  id, client_uuid, supplier_id, product_id, tracking_mode, quantity,
  available_from, available_until, status, notes, returned_at, returned_by,
  created_at, created_by
) on public.temporary_stock to authenticated;

drop view if exists public.temporary_stock_v cascade;
create or replace view public.temporary_stock_v as
select
  id,
  client_uuid,
  supplier_id,
  product_id,
  tracking_mode,
  quantity,
  available_from,
  available_until,
  case when public.auth_can_view_money() then cost_kind else null end as cost_kind,
  case when public.auth_can_view_money() then cost_paisa else null end as cost_paisa,
  status,
  notes,
  returned_at,
  returned_by,
  created_at,
  created_by
from public.temporary_stock;

revoke all on public.temporary_stock_v from public, anon;
grant select on public.temporary_stock_v to authenticated;

comment on view public.temporary_stock_v is
  'Law 6 column-masked view: cost_kind and cost_paisa resolve to null for Warehouse, Technician, and Driver.';

-- 6. Update validate_unit_reservability trigger: partner units cannot be reserved outside agreement window
create or replace function public.validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_row public.product_units;
  v_stock public.temporary_stock;
begin
  if new.asset_id is null or new.released_at is not null then
    return new;
  end if;

  select * into unit_row from public.product_units where id = new.asset_id;
  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit does not exist in inventory.';
  end if;

  if unit_row.retired_at is not null or unit_row.status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit is retired and cannot be reserved.';
  end if;

  -- B13 / T2-24: Check partner unit agreement validity and window boundedness
  if coalesce(unit_row.is_partner_unit, false) and unit_row.temporary_stock_id is not null then
    select * into v_stock from public.temporary_stock where id = unit_row.temporary_stock_id;
    if not found or v_stock.status <> 'Active' then
      raise exception 'GATE:gate.partner_stock.inactive|Partner unit agreement is not active.';
    end if;
    if not (tstzrange(v_stock.available_from, v_stock.available_until, '[)') @> new.period) then
      raise exception 'GATE:gate.partner_stock.outside_window|Partner unit reservation [%, %) falls outside agreement window [%, %).',
        lower(new.period), upper(new.period), v_stock.available_from, v_stock.available_until;
    end if;
  end if;

  -- For downtime holds, skip active maintenance or damage finding blocks since downtime IS maintenance planning
  if new.kind = 'downtime' then
    return new;
  end if;

  -- 1. Unresolved damage finding check
  if exists (
    select 1 from public.damage_findings
    where unit_id = new.asset_id
      and voided_at is null
      and repaired_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit has an unresolved damage finding.';
  end if;

  -- 2. Damaged/Lost condition check
  if unit_row.condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit is damaged or lost and cannot be reserved.';
  end if;

  -- 3. Maintenance record/status check
  if unit_row.status = 'Maintenance' or exists (
    select 1 from public.maintenance_records
    where product_unit_id = new.asset_id
      and completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit is in maintenance and cannot be reserved.';
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries
    where unit_id = new.asset_id
      and (nullif(btrim(qc_fail_reason), '') is not null or problem_state <> 'No Problems')
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit has an unresolved QC defect.';
  end if;

  return new;
end;
$$;

-- 7. Update get_available_product_capacity to compose partner units inside their agreement window
create or replace function public.get_available_product_capacity(
  p_product_id  uuid,
  p_period      tstzrange,
  p_ignore_booking_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tracking_mode  product_tracking_mode;
  v_total_quantity integer;
  v_capacity       integer;
  v_peak           integer;
begin
  select tracking_mode, total_quantity
    into v_tracking_mode, v_total_quantity
    from products
   where id = p_product_id;

  if not found then
    return 0;
  end if;

  if v_tracking_mode = 'Serialised' then
    -- Count owned units that are not retired, maintenance, or missing
    select count(*) into v_capacity
      from product_units pu
     where pu.product_id = p_product_id
       and coalesce(pu.is_partner_unit, false) = false
       and pu.status not in ('Maintenance', 'Missing', 'Retired');

    -- Plus partner units whose agreement is Active AND covers the requested period
    select v_capacity + count(*) into v_capacity
      from product_units pu
      join temporary_stock ts on ts.id = pu.temporary_stock_id
     where pu.product_id = p_product_id
       and pu.is_partner_unit = true
       and ts.status = 'Active'
       and tstzrange(ts.available_from, ts.available_until, '[)') @> p_period
       and pu.status not in ('Maintenance', 'Missing', 'Retired');
  else
    v_capacity := coalesce(v_total_quantity, 0);

    -- Plus active partner stock quantity covering the requested period
    select v_capacity + coalesce(sum(ts.quantity), 0) into v_capacity
      from temporary_stock ts
     where ts.product_id = p_product_id
       and ts.tracking_mode = 'Quantity'
       and ts.status = 'Active'
       and tstzrange(ts.available_from, ts.available_until, '[)') @> p_period;
  end if;

  with live as (
    select r.period, r.qty
      from inventory_reservations r
     where r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and (p_ignore_booking_id is null or r.booking_id is distinct from p_ignore_booking_id)
       and r.product_id = p_product_id
       and r.period && p_period
    union all
    select r.period, r.qty
      from inventory_reservations r
      join product_units pu on pu.id = r.asset_id
     where r.released_at is null
       and r.hold_state in ('confirmed', 'active_hold')
       and (p_ignore_booking_id is null or r.booking_id is distinct from p_ignore_booking_id)
       and pu.product_id = p_product_id
       and r.period && p_period
  ),
  candidates as (
    select distinct lower(l.period) as at
      from live l
     where p_period @> lower(l.period)
  )
  select coalesce(max(occupancy.held), 0) into v_peak
    from (
      select (
        select coalesce(sum(l.qty), 0)
          from live l
         where l.period @> c.at
      ) as held
      from candidates c
    ) occupancy;

  return greatest(0, v_capacity - v_peak);
end;
$$;

-- 8. RPC: record_temporary_stock
create or replace function public.record_temporary_stock(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid     uuid;
  v_supplier_id     uuid;
  v_product_id      uuid;
  v_tracking_mode   product_tracking_mode;
  v_quantity        integer;
  v_available_from  timestamptz;
  v_available_until timestamptz;
  v_cost_kind       partner_cost_kind;
  v_cost_paisa      bigint;
  v_notes           text;
  v_branch_id       uuid;
  v_warehouse_id    uuid;
  v_stock_id        uuid;
  v_asset_codes     jsonb;
  v_code            text;
  v_sku             text;
  i                 integer;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts') then
    raise exception 'AUTH:permission_denied|Only management, coordinator, and accounts roles can record partner stock.';
  end if;

  v_client_uuid     := coalesce((p_payload ->> 'client_uuid')::uuid, gen_random_uuid());
  v_supplier_id     := (p_payload ->> 'supplier_id')::uuid;
  v_product_id      := (p_payload ->> 'product_id')::uuid;
  v_quantity        := coalesce((p_payload ->> 'quantity')::integer, 1);
  v_available_from  := (p_payload ->> 'available_from')::timestamptz;
  v_available_until := (p_payload ->> 'available_until')::timestamptz;
  v_cost_kind       := (p_payload ->> 'cost_kind')::partner_cost_kind;
  v_cost_paisa      := coalesce((p_payload ->> 'cost_paisa')::bigint, 0);
  v_notes           := p_payload ->> 'notes';
  v_asset_codes     := coalesce(p_payload -> 'asset_codes', '[]'::jsonb);

  if v_supplier_id is null or v_product_id is null or v_available_from is null or v_available_until is null then
    raise exception 'GATE:partner_stock.missing_fields|supplier_id, product_id, available_from, and available_until are required.';
  end if;

  if v_available_until <= v_available_from then
    raise exception 'GATE:partner_stock.invalid_window|available_until must be after available_from.';
  end if;

  if v_quantity <= 0 then
    raise exception 'GATE:partner_stock.invalid_quantity|quantity must be greater than zero.';
  end if;

  select tracking_mode, coalesce(model, asset_code) into v_tracking_mode, v_sku
    from public.products
   where id = v_product_id;

  if not found then
    raise exception 'GATE:partner_stock.product_not_found|Product does not exist.';
  end if;

  if p_payload ? 'tracking_mode' then
    v_tracking_mode := (p_payload ->> 'tracking_mode')::product_tracking_mode;
  end if;

  v_branch_id := coalesce(
    (p_payload ->> 'branch_id')::uuid,
    (select id from public.branches limit 1)
  );
  v_warehouse_id := coalesce(
    (p_payload ->> 'warehouse_id')::uuid,
    (select id from public.warehouses where branch_id = v_branch_id limit 1),
    (select id from public.warehouses limit 1)
  );

  insert into public.temporary_stock (
    client_uuid, supplier_id, product_id, tracking_mode, quantity,
    available_from, available_until, cost_kind, cost_paisa, status,
    notes, created_by
  ) values (
    v_client_uuid, v_supplier_id, v_product_id, v_tracking_mode, v_quantity,
    v_available_from, v_available_until, v_cost_kind, v_cost_paisa, 'Active',
    v_notes, auth.uid()
  ) returning id into v_stock_id;

  if v_tracking_mode = 'Serialised' then
    for i in 1..v_quantity loop
      if jsonb_array_length(v_asset_codes) >= i then
        v_code := v_asset_codes ->> (i - 1);
      else
        v_code := 'P-' || coalesce(v_sku, 'GEAR') || '-' || lpad(i::text, 2, '0');
      end if;

      insert into public.product_units (
        client_uuid, product_id, serial_no, asset_tag, barcode, qr_code,
        status, condition, branch_id, warehouse_id, temporary_stock_id,
        is_partner_unit, created_by
      ) values (
        gen_random_uuid(), v_product_id, v_code, v_code, v_code, v_code,
        'In Stock', 'Good', v_branch_id, v_warehouse_id, v_stock_id,
        true, auth.uid()
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_stock_id,
    'client_uuid', v_client_uuid,
    'status', 'Active',
    'quantity', v_quantity,
    'available_from', v_available_from,
    'available_until', v_available_until
  );
end;
$$;

revoke all on function public.record_temporary_stock(jsonb) from public, anon;
grant execute on function public.record_temporary_stock(jsonb) to authenticated;

-- 9. RPC: return_temporary_stock (B36, Law 3)
create or replace function public.return_temporary_stock(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock_id      uuid;
  v_stock         public.temporary_stock;
  v_notes         text;
  v_unit_rec      record;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'AUTH:permission_denied|Only staff roles can complete partner gear return.';
  end if;

  v_stock_id := coalesce((p_payload ->> 'temporary_stock_id')::uuid, (p_payload ->> 'id')::uuid);
  v_notes    := p_payload ->> 'notes';

  if v_stock_id is null then
    raise exception 'GATE:partner_stock.id_required|temporary_stock_id is required.';
  end if;

  select * into v_stock
    from public.temporary_stock
   where id = v_stock_id;

  if not found then
    raise exception 'GATE:partner_stock.not_found|Temporary stock agreement not found.';
  end if;

  if v_stock.status <> 'Active' then
    raise exception 'GATE:partner_stock.not_active|Temporary stock agreement is already % and cannot be returned again.', v_stock.status;
  end if;

  -- Refuse if any unit is currently on rent or packed on an open booking
  if exists (
    select 1
      from public.product_units pu
      join public.booking_line_units blu on blu.asset_id = pu.id
      join public.booking_lines bl on bl.id = blu.booking_line_id
      join public.bookings b on b.id = bl.booking_id
     where pu.temporary_stock_id = v_stock_id
       and blu.released_at is null
       and bl.voided_at is null
       and b.stage in ('Packed', 'On Rent')
  ) then
    raise exception 'GATE:gate.partner_stock.currently_on_rent|Cannot return partner stock while units are currently packed or on rent.';
  end if;

  -- Mark temporary_stock as Returned to partner
  update public.temporary_stock
     set status = 'Returned to partner',
         returned_at = now(),
         returned_by = auth.uid(),
         notes = case when v_notes is not null then coalesce(notes || E'\n', '') || v_notes else notes end
   where id = v_stock_id;

  -- Retire linked units and recompute unit status
  for v_unit_rec in
    select id from public.product_units where temporary_stock_id = v_stock_id
  loop
    update public.product_units
       set retired_at = now(),
           retired_by = auth.uid(),
           retirement_reason = 'Returned to partner at end of agreement'
     where id = v_unit_rec.id;

    perform public.recompute_unit_status(v_unit_rec.id);
  end loop;

  return jsonb_build_object(
    'id', v_stock_id,
    'status', 'Returned to partner',
    'returned_at', now()
  );
end;
$$;

revoke all on function public.return_temporary_stock(jsonb) from public, anon;
grant execute on function public.return_temporary_stock(jsonb) to authenticated;

-- 11. Update reservation capacity ceiling trigger to respect partner unit agreement windows
create or replace function public.enforce_inventory_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id     uuid;
  v_tracking_mode  public.product_tracking_mode;
  v_total_quantity int;
  v_capacity       int;
  v_peak           int;
begin
  if NEW.released_at is not null then
    return NEW;
  end if;

  if NEW.product_id is not null then
    v_product_id := NEW.product_id;
  else
    select pu.product_id into v_product_id
      from public.product_units pu
     where pu.id = NEW.asset_id;

    if v_product_id is null then
      raise exception
        'Reservation rejected: asset % does not resolve to a product.', NEW.asset_id;
    end if;
  end if;

  select p.tracking_mode, p.total_quantity
    into v_tracking_mode, v_total_quantity
    from public.products p
   where p.id = v_product_id
   for update;

  if not found then
    raise exception
      'Reservation rejected: product % does not exist.', v_product_id;
  end if;

  if v_tracking_mode = 'Serialised' then
    select count(*) into v_capacity
      from public.product_units pu
     where pu.product_id = v_product_id
       and (
         (coalesce(pu.is_partner_unit, false) = false and pu.status not in ('Retired'))
         or (
           pu.is_partner_unit = true
           and pu.status not in ('Retired')
           and exists (
             select 1 from public.temporary_stock ts
              where ts.id = pu.temporary_stock_id
                and ts.status = 'Active'
                and tstzrange(ts.available_from, ts.available_until, '[)') @> NEW.period
           )
         )
       );
  else
    v_capacity := coalesce(v_total_quantity, 0) + coalesce((
      select sum(ts.quantity) from public.temporary_stock ts
       where ts.product_id = v_product_id
         and ts.tracking_mode = 'Quantity'
         and ts.status = 'Active'
         and tstzrange(ts.available_from, ts.available_until, '[)') @> NEW.period
    ), 0);
  end if;

  with live as (
    select r.period, r.qty
      from public.inventory_reservations r
     where r.released_at is null
       and r.product_id = v_product_id
       and r.period && NEW.period
    union all
    select r.period, r.qty
      from public.inventory_reservations r
      join public.product_units pu on pu.id = r.asset_id
     where r.released_at is null
       and pu.product_id = v_product_id
       and r.period && NEW.period
  ),
  candidates as (
    select distinct lower(l.period) as at
      from live l
     where NEW.period @> lower(l.period)
  )
  select coalesce(max(occupancy.held), 0) into v_peak
  from (
    select (
      select coalesce(sum(l.qty), 0)
        from live l
       where l.period @> c.at
    ) as held
    from candidates c
  ) occupancy;

  if v_peak > v_capacity then
    raise exception
      'Reservation rejected: product % would have % units held at once between % and %, but stock on hand is %.',
      v_product_id, v_peak, lower(NEW.period), upper(NEW.period), v_capacity;
  end if;

  return NEW;
end;
$$;

-- 12. Update confirm_booking_atomic to fail-closed on capacity when allow_overbooking is false
create or replace function public.confirm_booking_atomic(
  p_booking_id  uuid,
  p_actor_id    uuid,
  p_client_uuid uuid,
  p_occurred_at timestamptz default now(),
  p_reason      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking         record;
  v_role            text;
  v_line_count      int;
  v_occurred_at     timestamptz;
  v_res_units       int;
  v_res_qty         int;
  v_actor           uuid;
  v_period          tstzrange;
  v_line_rec        record;
  v_free_cap        int;
  v_short_qty       int;
  v_assigned_count  int;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null or p_actor_id is distinct from v_actor then
    raise exception 'Permission denied: confirmation actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'A confirmation idempotency key is required.';
  end if;

  v_occurred_at := coalesce(p_occurred_at, now());

  -- 1. Lock the booking row for update
  select id, booking_no, branch_id, client_id, stage, cancelled_at, closed_at, project_type, pickup_at, return_at
    into v_booking
    from bookings
   where id = p_booking_id
     for update;

  if not found then
    raise exception 'Booking % not found. Nothing was confirmed.', p_booking_id;
  end if;

  if v_role in ('Coordinator', 'Warehouse')
     and (auth_user_branch_id() is null
          or v_booking.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'Permission denied: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  if v_booking.cancelled_at is not null then
    raise exception '% was cancelled. A cancelled booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null then
    raise exception '% is Closed. A closed booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.stage <> 'Quote' then
    if v_booking.stage = 'Booked' then
      return jsonb_build_object(
        'success', true,
        'booking_id', v_booking.id,
        'booking_no', v_booking.booking_no,
        'stage', 'Booked',
        'already_confirmed', true
      );
    end if;
    raise exception 'Confirm moves a booking from Quote to Booked; % is at %. Nothing was confirmed.',
      v_booking.booking_no, v_booking.stage;
  end if;

  if coalesce(trim(v_booking.project_type), '') = '' then
    raise exception 'Select a project type before confirming this rental. % has none recorded.',
      v_booking.booking_no;
  end if;

  -- 2. Verify live lines
  select count(*) into v_line_count
    from booking_lines
   where booking_id = p_booking_id
     and voided_at is null;

  if v_line_count = 0 then
    raise exception '% has no live lines, so there is nothing to commit.', v_booking.booking_no;
  end if;

  v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');

  -- 3. Deterministically lock affected products
  perform p.id
     from products p
    where p.id in (
      select distinct bl.product_id
        from booking_lines bl
       where bl.booking_id = p_booking_id
         and bl.voided_at is null
         and bl.product_id is not null
    )
    order by p.id
      for update;

  -- 4. Deterministically lock affected units
  perform pu.id
     from product_units pu
    where pu.id in (
      select distinct blu.asset_id
        from booking_line_units blu
        join booking_lines bl on bl.id = blu.booking_line_id
       where bl.booking_id = p_booking_id
         and bl.voided_at is null
         and blu.released_at is null
    )
    order by pu.id
      for update;

  -- 5. Atomically reclaim expired holds for affected products and units
  update inventory_reservations
     set hold_state = 'expired_hold',
         released_at = v_occurred_at,
         released_reason = 'Hold expired automatically prior to confirmation'
   where hold_state = 'active_hold'
     and expires_at <= v_occurred_at
     and released_at is null
     and (
       asset_id in (
         select distinct blu.asset_id
           from booking_line_units blu
           join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = p_booking_id
            and bl.voided_at is null
            and blu.released_at is null
       )
       or product_id in (
         select distinct bl.product_id
           from booking_lines bl
          where bl.booking_id = p_booking_id
            and bl.voided_at is null
            and bl.product_id is not null
       )
     );

  -- 6. Convert any existing active holds owned by this booking to confirmed
  update inventory_reservations
     set hold_state = 'confirmed',
         expires_at = null
   where booking_id = p_booking_id
     and hold_state = 'active_hold'
     and released_at is null;

  -- 6b. Evaluate available capacity vs demand for overbooking-enabled products
  for v_line_rec in
    select bl.id as line_id,
           bl.product_id,
           bl.qty,
           bl.description,
           coalesce(p.allow_overbooking, false) as allow_overbooking,
           p.tracking_mode
      from booking_lines bl
      join products p on p.id = bl.product_id
     where bl.booking_id = p_booking_id
       and bl.voided_at is null
       and bl.product_id is not null
     order by bl.id
  loop
    v_free_cap := public.get_available_product_capacity(v_line_rec.product_id, v_period, p_booking_id);

    if v_line_rec.allow_overbooking then
      if v_line_rec.qty > v_free_cap then
        v_short_qty := v_line_rec.qty - v_free_cap;
        update booking_lines
           set short_quantity = v_short_qty
         where id = v_line_rec.line_id;

        -- If serialised: prune any pre-assigned units exceeding free capacity or colliding
        if v_line_rec.tracking_mode = 'Serialised' then
          select count(*) into v_assigned_count
            from booking_line_units blu
           where blu.booking_line_id = v_line_rec.line_id
             and blu.released_at is null;

          if v_assigned_count > v_free_cap then
            delete from booking_line_units
             where id in (
               select id from booking_line_units
                where booking_line_id = v_line_rec.line_id
                  and released_at is null
                order by created_at desc
                limit (v_assigned_count - v_free_cap)
             );
          end if;
        end if;

        -- Record shortage in booking_at_risk
        insert into public.booking_at_risk (
          client_uuid,
          booking_id,
          booking_no,
          cause,
          product_id,
          product_name,
          resolution_notes,
          raised_by
        ) values (
          gen_random_uuid(),
          p_booking_id,
          v_booking.booking_no,
          'overbooking_shortage',
          v_line_rec.product_id,
          v_line_rec.description,
          format('%s short — sub-rent or swap', v_short_qty),
          v_actor
        );
      else
        update booking_lines
           set short_quantity = 0
         where id = v_line_rec.line_id;
      end if;
    else
      -- allow_overbooking is FALSE: fail closed if capacity is exceeded
      if v_line_rec.qty > v_free_cap then
        raise exception 'Reservation rejected: product "%" would have % units held at once, but stock on hand is %.',
          v_line_rec.description, v_line_rec.qty, v_free_cap;
      end if;

      update booking_lines
         set short_quantity = 0
       where id = v_line_rec.line_id;
    end if;
  end loop;

  -- 7. Insert the stage transition (which invokes triggers to move stage and write reservations)
  insert into booking_stage_transitions
    (client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, occurred_at, reason)
  values
    (p_client_uuid, p_booking_id, v_booking.branch_id, 'Quote', 'Booked', p_actor_id, v_role, v_occurred_at, p_reason);

  -- Read back counts of reservations committed
  select count(asset_id), coalesce(sum(qty), 0)
    into v_res_units, v_res_qty
    from inventory_reservations
   where booking_id = p_booking_id
     and released_at is null;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'booking_no', v_booking.booking_no,
    'client_id', v_booking.client_id,
    'branch_id', v_booking.branch_id,
    'stage', 'Booked',
    'lines', v_line_count,
    'units_reserved', v_res_units,
    'quantity_reserved', v_res_qty
  );
end;
$$;

revoke execute on function public.confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) to authenticated;

commit;

-- Record 0253_temporary_stock_from_partners in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030134', '0253_temporary_stock_from_partners')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0253_temporary_stock_from_partners.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0254_draft_invoice_resync_integrity_and_settlement_numbering.sql
-- SHA-256: 901b0be59acbfa22ef787050d539e1ca1d81d94262e64da66d63196e8b651272
-- Version: 20261122030135
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0255: Draft invoice resync integrity + settlement numbering (T3-14)
--
-- Implements W15/W16:
-- 1. charges.invoice_line_id FK on delete set null:
--    - Ensures that deleting lines on draft invoices during resync does not fail
--      with foreign key violation charges_invoice_line_id_fkey.
-- 2. resync_draft_invoice header synchronization & clean line rebuild:
--    - Synchronizes discount_percent from booking_discounts and vat_rate from bookings.
--    - Unlinks draft charge references and cleans existing draft lines.
--    - Re-inserts current billable booking lines, crew, and transport with canonical arithmetic.
-- 3. Numbering on full settlement (W16):
--    - When a Draft invoice is fully settled (outstanding_amount = 0 and total_amount > 0),
--      recompute_invoice_payment_state mints a monotonic invoice_no via next_document_number('invoice')
--      and advances status to 'Paid' inside the SAME database transaction.
--    - Unsettled or partially paid Draft invoices remain Draft with invoice_no IS NULL.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- =============================================================================
-- 0. charges_invoice_line_id_fkey: ON DELETE SET NULL
-- =============================================================================

alter table public.charges
  drop constraint if exists charges_invoice_line_id_fkey,
  add constraint charges_invoice_line_id_fkey
    foreign key (invoice_line_id) references public.invoice_lines(id)
    on delete set null;

-- =============================================================================
-- 1. resync_draft_invoice — hardened against charge FKs and syncs header discount/VAT
-- =============================================================================

create or replace function public.resync_draft_invoice(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking       bookings%rowtype;
  v_invoice_id    uuid;
  v_invoice       invoices%rowtype;
  v_line_count    integer := 0;
  v_written       integer;
  v_discount_pct  numeric := 0;
  v_vat_rate      numeric(5,4);
begin
  -- 1. Read booking
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'resync_draft_invoice: booking % does not exist.', p_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'resync_draft_invoice: booking % is cancelled; cannot resync a Draft.', v_booking.booking_no;
  end if;

  -- 2. Find the Draft invoice for this booking
  select id into v_invoice_id
    from invoices
   where booking_id = p_booking_id
     and status = 'Draft';
  if not found then
    raise exception 'resync_draft_invoice: no Draft invoice for booking %.', v_booking.booking_no;
  end if;

  select * into v_invoice from invoices where id = v_invoice_id;
  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception 'resync_draft_invoice: invoice % is not a Draft (status %, invoice_no %).', v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  -- 3. Synchronize invoice header (discount & VAT) from booking
  select coalesce(sum(percent), 0) into v_discount_pct
    from public.booking_discounts where booking_id = p_booking_id;
  v_vat_rate := coalesce(v_booking.vat_rate, 0.1300);

  update invoices
     set discount_percent = v_discount_pct,
         vat_rate         = v_vat_rate,
         updated_at       = now()
   where id = v_invoice_id;

  -- 4. Delete existing automatically generated lines for this invoice.
  --    Any charges referencing these draft lines are cleanly unlinked by ON DELETE SET NULL.
  update public.charges
     set invoice_line_id = null
   where invoice_line_id in (select id from public.invoice_lines where invoice_id = v_invoice_id);

  delete from invoice_lines
   where invoice_id = v_invoice_id;

  -- 5. Equipment / Bundle / Accessory / Service / Sub-rental lines
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order,
    price_breakdown
  )
  select
    gen_random_uuid(),
    v_invoice_id,
    (case bl.line_type
       when 'Equipment'   then 'Equipment Rental'
       when 'Bundle'      then 'Equipment Rental'
       when 'Accessory'   then 'Equipment Rental'
       when 'Manual item' then 'Equipment Rental'
       when 'Service'     then 'Services'
       when 'Sub-rental'  then 'Sub-Rental'
     end)::line_kind,
    coalesce(nullif(btrim(bl.description), ''), bl.line_type::text),
    greatest(1, bl.qty),
    greatest(1, bl.days),
    bl.rate,
    coalesce(bl.line_total, greatest(0, greatest(1, bl.qty) * greatest(1, bl.days) * bl.rate - coalesce(bl.discount_amount, 0))),
    0,
    coalesce(bl.sort_order, 0),
    bl.price_breakdown
  from booking_lines bl
  where bl.booking_id = p_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 6. Crew lines
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    gen_random_uuid(),
    v_invoice_id,
    'Crew Charges'::line_kind,
    coalesce(
      nullif(btrim(concat_ws(' - ', nullif(btrim(cl.name), ''), cl.crew_role::text)), ''),
      'Crew'
    ),
    1,
    greatest(1, cl.days),
    cl.day_rate
      + (coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0))
        / greatest(1, cl.days),
    cl.day_rate * greatest(1, cl.days)
      + coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0),
    0,
    1000 + (row_number() over (order by cl.created_at, cl.id))::integer - 1
  from booking_crew_lines cl
  where cl.booking_id = p_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 7. Transport lines
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    gen_random_uuid(),
    v_invoice_id,
    'Transport'::line_kind,
    case
      when nullif(btrim(coalesce(bt.vehicle, '')), '') is not null
        then 'Transport - ' || btrim(bt.vehicle)
      else 'Transport'
    end,
    1,
    1,
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    0,
    2000 + (row_number() over (order by bt.created_at, bt.id))::integer - 1
  from booking_transport bt
  where bt.booking_id = p_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 8. Return result
  return jsonb_build_object(
    'invoice_id',   v_invoice_id,
    'invoice_no',   v_invoice.invoice_no,
    'status',       v_invoice.status,
    'line_count',   v_line_count,
    'resynced_at',  now()
  );
end;
$$;

revoke all on function public.resync_draft_invoice(uuid) from public, anon, authenticated;

-- =============================================================================
-- 2. Number on full settlement (W16, T3-14)
-- =============================================================================

create or replace function public.recompute_invoice_payment_state(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total_amount  numeric(14,2);
  v_total_paid    numeric(14,2);
  v_reversed      numeric(14,2);
  v_outstanding   numeric(14,2);
  v_status        invoice_status;
  v_voided        timestamptz;
  v_invoice_no    text;
  v_issue_date    date;
  v_due_date      date;
  v_terms         text;
  v_term_days     integer := 0;
  v_client_id     uuid;
  v_branch_id     uuid;
  v_line_count    integer := 0;
begin
  select total_amount, status, voided_at, invoice_no, client_id, branch_id
    into v_total_amount, v_status, v_voided, v_invoice_no, v_client_id, v_branch_id
    from invoices
   where id = p_invoice_id;

  if not found then
    return;
  end if;

  if v_voided is not null then
    return;
  end if;

  select coalesce(sum(p.amount), 0)
    into v_total_paid
    from payments p
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  select coalesce(sum(r.amount), 0)
    into v_reversed
    from payment_reversals r
    join payments p on p.id = r.original_payment_id
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  v_total_paid  := greatest(0, v_total_paid - v_reversed);
  v_outstanding := greatest(0, v_total_amount - v_total_paid);

  -- W16 / T3-14: Numbering on full settlement
  -- When a Draft invoice is fully paid (v_outstanding = 0 and v_total_amount > 0),
  -- mint monotonic invoice_no in the same transaction and advance status to 'Paid'.
  if v_status = 'Draft'::invoice_status and v_outstanding = 0 and v_total_amount > 0 then
    select count(*) into v_line_count from invoice_lines where invoice_id = p_invoice_id;
    if v_line_count > 0 then
      v_invoice_no := next_document_number('invoice');
      v_issue_date := current_date;

      select payment_terms::text into v_terms from clients where id = v_client_id;
      v_term_days := case coalesce(v_terms, 'Immediate')
                       when '7 days'  then 7
                       when '15 days' then 15
                       when '30 days' then 30
                       else 0
                     end;
      v_due_date := v_issue_date + v_term_days;

      update invoices
         set invoice_no         = v_invoice_no,
             issue_date         = v_issue_date,
             due_date           = coalesce(v_due_date, due_date),
             status             = 'Paid'::invoice_status,
             paid_amount        = v_total_paid,
             outstanding_amount = 0,
             updated_at         = now()
       where id = p_invoice_id;

      -- Audit issuance on full settlement
      insert into audit_events (
        client_uuid,
        event_class,
        module,
        category,
        action,
        severity,
        status,
        table_name,
        record_id,
        actor_id,
        actor_role,
        branch_id,
        old_values,
        new_values,
        reason
      ) values (
        gen_random_uuid(),
        'money movement',
        'Finance',
        'Finance',
        'Update',
        'Informational',
        'Success',
        'invoices',
        p_invoice_id,
        auth.uid(),
        auth_user_role(),
        v_branch_id,
        jsonb_build_object('status', 'Draft', 'invoice_no', null),
        jsonb_build_object(
          'status', 'Paid',
          'invoice_no', v_invoice_no,
          'issue_date', v_issue_date,
          'paid_amount', v_total_paid
        ),
        'Invoice numbered on full settlement (W16, T3-14)'
      );
      return;
    end if;
  end if;

  update invoices
     set paid_amount        = v_total_paid,
         outstanding_amount = v_outstanding,
         status = case
           /* R-14: Unsettled Draft stays Draft */
           when v_status = 'Draft'::invoice_status then v_status
           /* Fully settled issued invoice */
           when v_outstanding = 0 and v_total_amount > 0 then 'Paid'::invoice_status
           when v_total_paid > 0 then 'Partially Paid'::invoice_status
           /* Reversal case: back to Sent, never back to Draft */
           when v_status in ('Paid'::invoice_status, 'Partially Paid'::invoice_status)
             then 'Sent'::invoice_status
           else v_status
         end,
         updated_at = now()
   where id = p_invoice_id;
end;
$function$;

-- =============================================================================
-- 3. issue_invoice idempotency (Law 8)
-- =============================================================================
-- If an invoice was already issued (e.g. numbered on full settlement under W16),
-- calling issue_invoice returns the existing issued invoice instead of raising
-- an exception. This guarantees idempotent retry without burning document numbers.

create or replace function public.issue_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id   uuid    := (p_payload ->> 'invoice_id')::uuid;
  v_actor        uuid    := nullif(coalesce(p_payload ->> 'issued_by', p_payload ->> 'actor_id', ''), '')::uuid;
  v_issue_date   date    := nullif(coalesce(p_payload ->> 'issue_date', ''), '')::date;
  v_role         system_role;
  v_invoice      invoices%rowtype;
  v_line_count   integer := 0;
  v_invoice_no   text;
  v_terms        text;
  v_term_days    integer := 0;
  v_due_date     date;
  v_new_status   invoice_status;
begin
  -- 1. Role & authorization checks (R-05)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'issue_invoice: this session (%) may not issue an invoice. R-05 gives that to Owner, Admin, Manager and Accounts.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if not auth_can_view_money() then
    raise exception
      'issue_invoice: this session cannot read money (Law 6), so it cannot issue an invoice.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'issue_invoice: invoice_id is required.';
  end if;

  -- 2. Verify invoice existence and eligibility — FOR UPDATE locks the row
  select * into v_invoice from invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'issue_invoice: invoice % does not exist.', v_invoice_id;
  end if;

  if v_invoice.voided_at is not null or v_invoice.status = 'Void' then
    raise exception 'issue_invoice: invoice % is voided and cannot be issued.', v_invoice_id;
  end if;

  -- Idempotency (Law 8): If already issued, return existing state
  if v_invoice.invoice_no is not null then
    select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
    return jsonb_build_object(
      'invoice_id',         v_invoice.id,
      'invoice_no',         v_invoice.invoice_no,
      'status',             v_invoice.status,
      'issue_date',         v_invoice.issue_date,
      'due_date',           v_invoice.due_date,
      'booking_id',         v_invoice.booking_id,
      'client_id',          v_invoice.client_id,
      'line_count',         v_line_count,
      'subtotal',           v_invoice.subtotal,
      'discount_amount',    v_invoice.discount_amount,
      'taxable_amount',     v_invoice.taxable_amount,
      'vat_amount',         v_invoice.vat_amount,
      'total_amount',       v_invoice.total_amount,
      'paid_amount',        v_invoice.paid_amount,
      'outstanding_amount', v_invoice.outstanding_amount
    );
  end if;

  if v_invoice.status <> 'Draft' then
    raise exception
      'issue_invoice: invoice % has status %. Only a Draft can be issued.',
      v_invoice_id, v_invoice.status;
  end if;

  select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
  if v_line_count = 0 then
    raise exception 'issue_invoice: invoice % has no lines. An empty invoice cannot be issued.', v_invoice_id;
  end if;

  -- 3. Mint invoice number (R-15) — still inside the same transaction/lock
  v_invoice_no := next_document_number('invoice');
  if v_invoice_no is null then
    raise exception 'issue_invoice: next_document_number failed to mint an invoice number.';
  end if;

  -- 4. Date calculation
  v_issue_date := coalesce(v_issue_date, current_date);

  select payment_terms::text into v_terms from clients where id = v_invoice.client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := v_issue_date + v_term_days;

  -- 5. Determine status
  if v_invoice.outstanding_amount = 0 and v_invoice.total_amount > 0 then
    v_new_status := 'Paid'::invoice_status;
  elsif v_invoice.paid_amount > 0 then
    v_new_status := 'Partially Paid'::invoice_status;
  else
    v_new_status := 'Sent'::invoice_status;
  end if;

  -- 6. Update the invoice row
  update invoices
     set invoice_no = v_invoice_no,
         issue_date = v_issue_date,
         due_date   = coalesce(v_due_date, due_date),
         status     = v_new_status,
         updated_at = now(),
         updated_by = coalesce(v_actor, v_invoice.updated_by)
   where id = v_invoice_id;

  -- 7. Read back updated invoice
  select * into v_invoice from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',         v_invoice.id,
    'invoice_no',         v_invoice.invoice_no,
    'status',             v_invoice.status,
    'issue_date',         v_invoice.issue_date,
    'due_date',           v_invoice.due_date,
    'booking_id',         v_invoice.booking_id,
    'client_id',          v_invoice.client_id,
    'line_count',         v_line_count,
    'subtotal',           v_invoice.subtotal,
    'discount_amount',    v_invoice.discount_amount,
    'taxable_amount',     v_invoice.taxable_amount,
    'vat_amount',         v_invoice.vat_amount,
    'total_amount',       v_invoice.total_amount,
    'paid_amount',        v_invoice.paid_amount,
    'outstanding_amount', v_invoice.outstanding_amount
  );
end;
$$;

revoke execute on function public.issue_invoice(jsonb) from public;
grant execute on function public.issue_invoice(jsonb) to authenticated;

-- =============================================================================
-- 4. Fix guard_invoice_lines_parent_status BEFORE DELETE return
-- =============================================================================
-- In Postgres, a BEFORE DELETE trigger returning NULL silently aborts the DELETE.
-- Migration 0193 returned NEW (which is NULL during DELETE), causing DELETEs on
-- Draft invoices to be silently cancelled and duplicating lines on resync.
-- Returning OLD allows DELETEs on Draft invoices while still blocking non-Drafts.

create or replace function public.guard_invoice_lines_parent_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_status invoice_status;
  v_parent_voided timestamptz;
  v_parent_no text;
begin
  if TG_OP = 'DELETE' then
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = OLD.invoice_id;
  else
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = NEW.invoice_id;
  end if;

  if not found then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  if v_parent_status <> 'Draft' or v_parent_voided is not null then
    raise exception
      'invoice_lines: invoice % is not a Draft (status %, voided_at %). An issued invoice''s lines are immutable — correct it with a credit note.',
      v_parent_no, v_parent_status, v_parent_voided
      using errcode = 'P0001';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

commit;

-- Record 0254_draft_invoice_resync_integrity_and_settlement_numbering in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030135', '0254_draft_invoice_resync_integrity_and_settlement_numbering')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0254_draft_invoice_resync_integrity_and_settlement_numbering.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0255_booking_site_and_public_catalogue.sql
-- SHA-256: 27cfff183f4d67a6e0749a559a8118ae9d5abc2b1fc7823142323ac7c3001049
-- Version: 20261122030136
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0255: Booking site and public catalogue (T7-02, S9, D34, W64, B3, B7, B45)
--
-- 1. Adds public online flags and photo fields to products & bundles:
--    - products: show_online (boolean, default false),
--                online_bundle_only (boolean, default false),
--                photos (text[], default '{}'),
--                slug (text)
--    - bundles: show_online (boolean, default false),
--               photos (text[], default '{}'),
--               slug (text)
-- 2. Creates public_catalogue_v view:
--    - Deliberately public catalogue view (security_invoker = false)
--    - Exposes id, kind, slug, name, category_name, description, photo_paths,
--      daily_rate_paisa, weekly_rate_paisa, monthly_rate_paisa, bundle_contents
--    - NEVER exposes purchase_price, replacement_value, serial numbers, stock counts,
--      supplier or internal notes
--    - Enforces W64 filter: show_online = true, online_bundle_only = false (or inside bundle),
--      positive daily rate, and is_active = true
--    - Revokes insert/update/delete from anon and authenticated (prevents 0095 vulnerability)
-- 3. Creates public_availability(p_product_ids uuid[], p_from date, p_to date) RPC:
--    - SECURITY DEFINER, STABLE, search_path = public, pg_temp, statement_timeout = 2s
--    - Bounds: <= 30 IDs, <= 60 days, p_from >= current_date - 1
--    - Returns (product_id uuid, day date, available boolean)
--    - NEVER leaks stock counts, booking numbers, client names, or reservations
-- 4. Ensures public 'catalogue' storage bucket exists with public read and
--    Owner/Admin/Manager upload policy.
-- =============================================================================

begin;

-- 1. Extend products and bundles with online catalogue attributes
alter table public.products
  add column if not exists show_online boolean not null default false,
  add column if not exists online_bundle_only boolean not null default false,
  add column if not exists photos text[] not null default '{}',
  add column if not exists slug text;

alter table public.bundles
  add column if not exists show_online boolean not null default false,
  add column if not exists photos text[] not null default '{}',
  add column if not exists slug text;

-- Helper to generate url-friendly slugs if missing
create or replace function public.generate_catalogue_slug()
returns trigger
language plpgsql
as $$
begin
  if NEW.slug is null or trim(NEW.slug) = '' then
    NEW.slug := lower(regexp_replace(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || substring(NEW.id::text, 1, 8);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_products_catalogue_slug on public.products;
create trigger trg_products_catalogue_slug
  before insert or update of name, slug on public.products
  for each row execute function public.generate_catalogue_slug();

drop trigger if exists trg_bundles_catalogue_slug on public.bundles;
create trigger trg_bundles_catalogue_slug
  before insert or update of name, slug on public.bundles
  for each row execute function public.generate_catalogue_slug();

-- Populate existing rows with slugs
update public.products
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || substring(id::text, 1, 8)
where slug is null or trim(slug) = '';

update public.bundles
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || substring(id::text, 1, 8)
where slug is null or trim(slug) = '';

create index if not exists idx_products_online_slug on public.products (slug);
create index if not exists idx_bundles_online_slug on public.bundles (slug);


-- 2. Create public_catalogue_v (view)
drop view if exists public.public_catalogue_v cascade;
create or replace view public.public_catalogue_v as
select
  p.id,
  'product'::text as kind,
  p.slug,
  p.name,
  c.name::text as category_name,
  coalesce(p.description, '') as description,
  p.photos as photo_paths,
  round(p.daily_rate * 100)::bigint as daily_rate_paisa,
  case when p.weekly_rate is not null and p.weekly_rate > 0 then round(p.weekly_rate * 100)::bigint else null end as weekly_rate_paisa,
  case when p.monthly_rate is not null and p.monthly_rate > 0 then round(p.monthly_rate * 100)::bigint else null end as monthly_rate_paisa,
  '[]'::jsonb as bundle_contents
from public.products p
left join public.inventory_categories c on c.id = p.category_id
where p.show_online = true
  and p.online_bundle_only = false
  and p.is_active = true
  and p.daily_rate is not null
  and p.daily_rate > 0

union all

select
  b.id,
  'bundle'::text as kind,
  b.slug,
  b.name,
  coalesce(c.name::text, 'Bundle Deals') as category_name,
  coalesce(b.description, '') as description,
  b.photos as photo_paths,
  round(b.daily_rate * 100)::bigint as daily_rate_paisa,
  case when b.weekly_rate is not null and b.weekly_rate > 0 then round(b.weekly_rate * 100)::bigint else null end as weekly_rate_paisa,
  null::bigint as monthly_rate_paisa,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', ip.name,
          'qty', bi.quantity
        ) order by bi.sort_order, ip.name
      )
      from public.bundle_items bi
      join public.products ip on ip.id = bi.product_id
      where bi.bundle_id = b.id
    ),
    '[]'::jsonb
  ) as bundle_contents
from public.bundles b
left join public.inventory_categories c on c.id = b.category_id
where b.show_online = true
  and b.is_active = true
  and b.daily_rate is not null
  and b.daily_rate > 0;

-- Ensure view is closed for mutation and explicitly granted for select
revoke all on public.public_catalogue_v from public, anon, authenticated;
grant select on public.public_catalogue_v to anon, authenticated;


-- 3. Create public_availability RPC
create or replace function public.public_availability(
  p_product_ids uuid[],
  p_from date,
  p_to date
)
returns table (
  product_id uuid,
  day date,
  available boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
set statement_timeout = '2s'
as $$
declare
  v_count integer;
  v_span integer;
begin
  if p_product_ids is null then
    raise exception 'public_availability: product_ids array is required';
  end if;

  v_count := cardinality(p_product_ids);
  if v_count is null or v_count < 1 or v_count > 30 then
    raise exception 'public_availability: product_ids count must be between 1 and 30 (got %)', coalesce(v_count, 0);
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'public_availability: invalid date range';
  end if;

  v_span := p_to - p_from;
  if v_span > 60 then
    raise exception 'public_availability: date range cannot exceed 60 days (got %)', v_span;
  end if;

  if p_from < (current_date - 1) then
    raise exception 'public_availability: date range cannot start before yesterday';
  end if;

  return query
  with dates as (
    select d::date as day
    from generate_series(p_from::timestamp, p_to::timestamp, '1 day'::interval) as d
  ),
  queried_items as (
    select distinct unnest(p_product_ids) as pid
  ),
  -- Only published catalogue IDs can be queried anonymously. Reuse the
  -- catalogue view's visibility/rate/active rules to prevent drift. A private
  -- component can still contribute to a *published bundle*'s availability
  -- without becoming independently queryable by UUID.
  publicly_queryable as (
    select qi.pid, catalogue.kind
    from queried_items qi
    join public.public_catalogue_v catalogue on catalogue.id = qi.pid
  ),
  -- Map the *visible request IDs* to products or published bundle components.
  product_expansion as (
    -- Visible standalone products; bundle-only and unpublished IDs are omitted.
    select
      qi.pid as requested_id,
      p.id as underlying_product_id,
      1 as required_qty,
      false as is_bundle
    from publicly_queryable qi
    join public.products p on p.id = qi.pid
    where qi.kind = 'product'
    union all
    -- Published bundles: include private/bundle-only components for capacity.
    select
      qi.pid as requested_id,
      bi.product_id as underlying_product_id,
      bi.quantity as required_qty,
      true as is_bundle
    from publicly_queryable qi
    join public.bundles b on b.id = qi.pid
    join public.bundle_items bi on bi.bundle_id = b.id
    where qi.kind = 'bundle'
  ),
  -- Compute capacity of each underlying product
  product_capacity as (
    select
      p.id as product_id,
      case
        when p.tracking_mode = 'Serialised' then (
          select count(*)::integer
          from public.product_units pu
          where pu.product_id = p.id
            and pu.retired_at is null
            and pu.status not in ('Maintenance', 'Missing', 'Retired')
        )
        else coalesce(p.total_quantity, 0)
      end as capacity
    from public.products p
    where p.id in (select underlying_product_id from product_expansion)
  ),
  -- Check availability for each (requested_id, underlying_product_id, day)
  component_day_status as (
    select
      pe.requested_id,
      pe.underlying_product_id,
      d.day,
      pe.required_qty,
      pc.capacity,
      coalesce(
        (
          select sum(ir.qty)::integer
          from public.inventory_reservations ir
          where ir.released_at is null
            and (
              ir.product_id = pe.underlying_product_id
              or ir.asset_id in (
                select pu.id
                from public.product_units pu
                where pu.product_id = pe.underlying_product_id
              )
            )
            and ir.period && tstzrange(
              (d.day::text || ' 06:00:00+05:45')::timestamptz,
              ((d.day + 1)::text || ' 06:00:00+05:45')::timestamptz,
              '[)'
            )
        ),
        0
      ) as reserved_qty
    from product_expansion pe
    cross join dates d
    join product_capacity pc on pc.product_id = pe.underlying_product_id
  )
  select
    cds.requested_id as product_id,
    cds.day,
    -- Available if capacity minus reservations is at least required_qty
    bool_and((cds.capacity - cds.reserved_qty) >= cds.required_qty) as available
  from component_day_status cds
  group by cds.requested_id, cds.day
  order by cds.requested_id, cds.day;
end;
$$;

revoke all on function public.public_availability(uuid[], date, date) from public;
grant execute on function public.public_availability(uuid[], date, date) to anon, authenticated;


-- 4. Catalogue Storage Bucket and Policies
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name)
    values ('catalogue', 'catalogue')
    on conflict (id) do nothing;

    if exists (select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
      execute 'update storage.buckets set public = true where id = ''catalogue''';
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    begin
      alter table storage.objects enable row level security;
    exception when insufficient_privilege then
      null;
    end;

    -- Public SELECT for catalogue objects
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_public_read'
    ) then
      create policy "catalogue_public_read"
        on storage.objects for select
        to anon, authenticated
        using (bucket_id = 'catalogue');
    end if;

    -- Staff upload/management (Owner, Admin, Manager)
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_staff_insert'
    ) then
      create policy "catalogue_staff_insert"
        on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'catalogue'
          and (
            exists (
              select 1 from public.users u
              where u.id = auth.uid()
                and u.primary_role in ('Owner', 'Admin', 'Manager')
                and u.is_active = true
            )
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_staff_update'
    ) then
      create policy "catalogue_staff_update"
        on storage.objects for update
        to authenticated
        using (
          bucket_id = 'catalogue'
          and (
            exists (
              select 1 from public.users u
              where u.id = auth.uid()
                and u.primary_role in ('Owner', 'Admin', 'Manager')
                and u.is_active = true
            )
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_staff_delete'
    ) then
      create policy "catalogue_staff_delete"
        on storage.objects for delete
        to authenticated
        using (
          bucket_id = 'catalogue'
          and (
            exists (
              select 1 from public.users u
              where u.id = auth.uid()
                and u.primary_role in ('Owner', 'Admin', 'Manager')
                and u.is_active = true
            )
          )
        );
    end if;
  end if;
end $$;

commit;

-- Record 0255_booking_site_and_public_catalogue in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030136', '0255_booking_site_and_public_catalogue')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0255_booking_site_and_public_catalogue.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0256_booking_requests_and_staff_queue.sql
-- SHA-256: c2a8090911f5a44d14950a7d1314ce9d287a6eb71b7851a6c68d8af411bfa010
-- Version: 20261122030137
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0252_booking_requests_and_staff_queue.sql
-- T7-04: Online booking requests, line items, staff queue, and atomic confirmation/decline RPCs.

-- 1. Request number generator sequence
create sequence if not exists public.booking_request_seq start with 1001;

-- 2. Table: public.booking_requests
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  client_name text not null,
  client_email text not null,
  client_phone text not null,
  project_name text,
  shoot_location text,
  start_date date not null,
  end_date date not null,
  fulfillment_type text not null check (fulfillment_type in ('pickup', 'delivery')),
  delivery_zone_id text,
  delivery_address text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  decline_reason text,
  booking_id uuid references public.bookings(id) on delete set null,
  total_paisa bigint not null default 0 check (total_paisa >= 0),
  vat_paisa bigint not null default 0 check (vat_paisa >= 0),
  advance_due_paisa bigint not null default 0 check (advance_due_paisa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_dates_valid check (end_date >= start_date)
);

create index if not exists idx_booking_requests_status on public.booking_requests(status);
create index if not exists idx_booking_requests_created_at on public.booking_requests(created_at desc);

-- 3. Table: public.booking_request_lines
create table if not exists public.booking_request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.booking_requests(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  bundle_id uuid references public.bundles(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  daily_rate_paisa bigint not null default 0 check (daily_rate_paisa >= 0),
  line_total_paisa bigint not null default 0 check (line_total_paisa >= 0),
  constraint request_line_item_target check (
    (product_id is not null and bundle_id is null) or
    (product_id is null and bundle_id is not null)
  )
);

create index if not exists idx_booking_request_lines_request on public.booking_request_lines(request_id);

-- 4. Enable RLS
alter table public.booking_requests enable row level security;
alter table public.booking_request_lines enable row level security;

-- Policies for booking_requests
drop policy if exists booking_requests_staff_select on public.booking_requests;
create policy booking_requests_staff_select on public.booking_requests
  for select
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

drop policy if exists booking_requests_staff_update on public.booking_requests;
create policy booking_requests_staff_update on public.booking_requests
  for update
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

-- Policies for booking_request_lines
drop policy if exists booking_request_lines_staff_select on public.booking_request_lines;
create policy booking_request_lines_staff_select on public.booking_request_lines
  for select
  to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

-- 5. Secure view masking money columns for floor roles (Law 6)
drop view if exists public.booking_requests_v cascade;
create or replace view public.booking_requests_v as
select
  r.id,
  r.request_number,
  r.client_name,
  r.client_email,
  r.client_phone,
  r.project_name,
  r.shoot_location,
  r.start_date,
  r.end_date,
  r.fulfillment_type,
  r.delivery_zone_id,
  r.delivery_address,
  r.status,
  r.decline_reason,
  r.booking_id,
  case when auth_can_view_money() then r.total_paisa else null end as total_paisa,
  case when auth_can_view_money() then r.vat_paisa else null end as vat_paisa,
  case when auth_can_view_money() then r.advance_due_paisa else null end as advance_due_paisa,
  r.created_at,
  r.updated_at
from public.booking_requests r;

revoke all on public.booking_requests_v from public, anon;
grant select on public.booking_requests_v to authenticated;

-- 6. RPC: submit_booking_request (callable by anon & authenticated)
create or replace function public.submit_booking_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_name text;
  v_client_email text;
  v_client_phone text;
  v_project_name text;
  v_shoot_location text;
  v_start_date date;
  v_end_date date;
  v_fulfillment text;
  v_delivery_zone text;
  v_delivery_address text;
  v_lines jsonb;
  v_line jsonb;
  v_rental_days integer;
  v_request_id uuid;
  v_request_num text;
  v_total_paisa bigint := 0;
  v_vat_paisa bigint := 0;
  v_advance_due_paisa bigint := 0;
  v_product_id uuid;
  v_bundle_id uuid;
  v_quantity integer;
  v_rate bigint;
  v_line_total bigint;
begin
  -- Validate client info
  v_client_name := nullif(trim(p_payload ->> 'client_name'), '');
  v_client_email := nullif(trim(p_payload ->> 'client_email'), '');
  v_client_phone := nullif(trim(p_payload ->> 'client_phone'), '');
  v_project_name := nullif(trim(p_payload ->> 'project_name'), '');
  v_shoot_location := nullif(trim(p_payload ->> 'shoot_location'), '');
  v_fulfillment := coalesce(nullif(trim(p_payload ->> 'fulfillment_type'), ''), 'pickup');
  v_delivery_zone := nullif(trim(p_payload ->> 'delivery_zone_id'), '');
  v_delivery_address := nullif(trim(p_payload ->> 'delivery_address'), '');

  if v_client_name is null then
    raise exception 'GATE:gate.booking_request.name_required|Client name is required.';
  end if;
  if v_client_email is null then
    raise exception 'GATE:gate.booking_request.email_required|Client email is required.';
  end if;
  if v_client_phone is null then
    raise exception 'GATE:gate.booking_request.phone_required|Client phone is required.';
  end if;

  -- Validate dates
  begin
    v_start_date := (p_payload ->> 'start_date')::date;
    v_end_date := (p_payload ->> 'end_date')::date;
  exception when others then
    raise exception 'GATE:gate.booking_request.invalid_dates|Valid start and end dates are required.';
  end;

  if v_end_date < v_start_date then
    raise exception 'GATE:gate.booking_request.invalid_date_range|End date must be on or after start date.';
  end if;

  -- 12-hour advance notice check for pickup (W63)
  if v_fulfillment = 'pickup' then
    if v_start_date < (current_date) then
      raise exception 'GATE:gate.booking_request.advance_notice|Pickup must be at least 12 hours after the request.';
    end if;
  end if;

  -- Validate lines
  v_lines := p_payload -> 'lines';
  if v_lines is null or jsonb_array_length(v_lines) = 0 then
    raise exception 'GATE:gate.booking_request.empty_cart|At least one item is required in the booking request.';
  end if;

  v_rental_days := (v_end_date - v_start_date) + 1;
  if v_rental_days <= 0 then
    v_rental_days := 1;
  end if;

  -- Generate request number: REQ-YYYYMMDD-XXXX
  v_request_num := 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.booking_request_seq')::text, 4, '0');
  v_request_id := gen_random_uuid();

  -- Insert header first
  insert into public.booking_requests (
    id,
    request_number,
    client_name,
    client_email,
    client_phone,
    project_name,
    shoot_location,
    start_date,
    end_date,
    fulfillment_type,
    delivery_zone_id,
    delivery_address,
    status
  ) values (
    v_request_id,
    v_request_num,
    v_client_name,
    v_client_email,
    v_client_phone,
    v_project_name,
    v_shoot_location,
    v_start_date,
    v_end_date,
    v_fulfillment,
    v_delivery_zone,
    v_delivery_address,
    'pending'
  );

  -- Process and insert each line
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_bundle_id := (v_line ->> 'bundle_id')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 1);

    if v_quantity <= 0 then
      v_quantity := 1;
    end if;

    v_rate := 0;
    if v_product_id is not null then
      select coalesce(daily_rate, 0) into v_rate from public.products where id = v_product_id;
    elsif v_bundle_id is not null then
      select coalesce(daily_rate, 0) into v_rate from public.bundles where id = v_bundle_id;
    end if;

    -- Calculate line total in paisa: daily_rate * days * quantity
    v_line_total := v_rate * v_rental_days * v_quantity;
    v_total_paisa := v_total_paisa + v_line_total;

    insert into public.booking_request_lines (
      request_id,
      product_id,
      bundle_id,
      quantity,
      daily_rate_paisa,
      line_total_paisa
    ) values (
      v_request_id,
      v_product_id,
      v_bundle_id,
      v_quantity,
      v_rate,
      v_line_total
    );
  end loop;

  -- 13% VAT
  v_vat_paisa := round(v_total_paisa * 0.13);
  -- 50% advance due standard
  v_advance_due_paisa := round((v_total_paisa + v_vat_paisa) * 0.50);

  update public.booking_requests set
    total_paisa = v_total_paisa,
    vat_paisa = v_vat_paisa,
    advance_due_paisa = v_advance_due_paisa,
    updated_at = now()
  where id = v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_request_num,
    'total_paisa', v_total_paisa,
    'vat_paisa', v_vat_paisa,
    'advance_due_paisa', v_advance_due_paisa,
    'status', 'pending'
  );
end;
$$;

grant execute on function public.submit_booking_request(jsonb) to anon, authenticated;

-- 7. RPC: confirm_booking_request (Coordinator+)
create or replace function public.confirm_booking_request(p_request_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.booking_requests;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'GATE:gate.auth.unauthorized|Only coordinator or higher can confirm online requests.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
  end if;

  -- Idempotency: if already confirmed with the same booking_id, return success
  if v_req.status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'booking_id', v_req.booking_id,
      'status', 'confirmed',
      'already_confirmed', true
    );
  end if;

  if v_req.status in ('declined', 'cancelled') then
    raise exception 'GATE:gate.booking_request.invalid_status|Cannot confirm a request that has been %.', v_req.status;
  end if;

  update public.booking_requests set
    status = 'confirmed',
    booking_id = p_booking_id,
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'booking_id', p_booking_id,
    'status', 'confirmed'
  );
end;
$$;

revoke all on function public.confirm_booking_request(uuid, uuid) from public, anon;
grant execute on function public.confirm_booking_request(uuid, uuid) to authenticated;

-- 8. RPC: decline_booking_request (Coordinator+)
create or replace function public.decline_booking_request(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.booking_requests;
  v_clean_reason text;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'GATE:gate.auth.unauthorized|Only coordinator or higher can decline online requests.';
  end if;

  v_clean_reason := nullif(trim(p_reason), '');
  if v_clean_reason is null then
    raise exception 'GATE:gate.booking_request.decline_reason_required|A reason is required to decline a request.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
  end if;

  if v_req.status = 'confirmed' then
    raise exception 'GATE:gate.booking_request.already_confirmed|Cannot decline an already confirmed request.';
  end if;

  update public.booking_requests set
    status = 'declined',
    decline_reason = v_clean_reason,
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'declined'
  );
end;
$$;

revoke all on function public.decline_booking_request(uuid, text) from public, anon;
grant execute on function public.decline_booking_request(uuid, text) to authenticated;

-- Record 0256_booking_requests_and_staff_queue in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030137', '0256_booking_requests_and_staff_queue')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0256_booking_requests_and_staff_queue.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0257_client_accounts_and_portal_binding.sql
-- SHA-256: c82d175c12ac583dc53ab608aa4d32b6dfba13a8c4dd1983f9a7ab47aa8cc0bf
-- Version: 20261122030138
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0253: Client accounts and portal binding (T7-03)
-- Authority: docs/ONLINE_BOOKING_SPEC.md §4, §5.5, §9; docs/PERMISSIONS.md §7; Rulings D2, D29, W50, W51, W84.

-- 1. create table if not exists public.online_profiles
create table if not exists public.online_profiles (
  auth_uid uuid not null primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text not null,
  company text,
  pan text,
  id_doc_type text,
  id_doc_number text,
  id_doc_path text,
  id_doc_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint online_profiles_phone_len check (char_length(btrim(phone)) >= 10)
);

-- Add auth and client linking columns to booking_requests (T7-03 / T7-04)
alter table public.booking_requests
  add column if not exists requester_auth_uid uuid references auth.users (id) on delete set null,
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists portal_user_id uuid references public.portal_users (id) on delete set null;

create index if not exists idx_booking_requests_requester_auth on public.booking_requests(requester_auth_uid);
create index if not exists idx_booking_requests_client on public.booking_requests(client_id);

comment on table public.online_profiles is
  'Client self-registration profiles with contact metadata and ID-on-file reference (T7-03).';

alter table public.online_profiles enable row level security;

-- Client reads and writes own profile
drop policy if exists online_profiles_self on public.online_profiles;
create policy online_profiles_self on public.online_profiles
  for all to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid());

-- Only online-request desk staff may inspect other clients' profile/ID data.
-- Floor roles and Accounts must not bypass the masked view by reading this
-- base table directly; clients retain their own-row policy above.
drop policy if exists online_profiles_staff_select on public.online_profiles;
create policy online_profiles_staff_select on public.online_profiles
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

-- 2. View public.online_profiles_v with Law 6 money and PII masking
drop view if exists public.online_profiles_v cascade;
create or replace view public.online_profiles_v as
select
  op.auth_uid,
  op.name,
  op.phone,
  op.company,
  case
    when public.auth_can_view_money() or op.auth_uid = auth.uid()
    then op.pan
    else null
  end as pan,
  op.id_doc_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') or op.auth_uid = auth.uid()
    then op.id_doc_number
    when op.id_doc_number is not null
    then '••••-••••-' || right(op.id_doc_number, 4)
    else null
  end as id_doc_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator') or op.auth_uid = auth.uid()
    then op.id_doc_path
    else null
  end as id_doc_path,
  op.id_doc_uploaded_at,
  op.created_at,
  op.updated_at
from public.online_profiles op
where op.auth_uid = auth.uid() or public.auth_is_staff();

comment on view public.online_profiles_v is
  'Secure view of online profiles with PAN and ID document masking for unauthorized roles (T7-03).';

revoke all on public.online_profiles_v from public, anon;
grant select on public.online_profiles_v to authenticated;

-- 3. Private storage bucket request-ids for KYC documents
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name)
    values ('request-ids', 'request-ids')
    on conflict (id) do nothing;

    if exists (select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
      execute 'update storage.buckets set public = false where id = ''request-ids''';
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    begin
      alter table storage.objects enable row level security;
    exception when insufficient_privilege then
      null;
    end;

    -- Client can insert into own folder in request-ids bucket
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'request_ids_client_insert'
    ) then
      create policy "request_ids_client_insert"
        on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'request-ids'
          and (string_to_array(name, '/'))[1] = auth.uid()::text
        );
    end if;

    -- Private KYC documents: signed-in client owns its UUID folder, while
    -- only the online-request desk roles may view other clients' ID files.
    -- A previous broad staff SELECT is intentionally replaced if present.
    drop policy if exists "request_ids_select" on storage.objects;
    create policy "request_ids_select"
      on storage.objects for select
      to authenticated
      using (
        bucket_id = 'request-ids'
        and (
          (auth.uid() is not null and (string_to_array(name, '/'))[1] = auth.uid()::text)
          or public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
        )
      );
  end if;
end $$;

-- 4. RPC online_profile_save
create or replace function public.online_profile_save(
  p_name text,
  p_phone text,
  p_company text default null,
  p_pan text default null,
  p_id_doc_type text default null,
  p_id_doc_number text default null,
  p_id_doc_path text default null
)
returns public.online_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid uuid;
  v_rec public.online_profiles;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'name is required' using errcode = '23502';
  end if;
  if p_phone is null or char_length(btrim(p_phone)) < 10 then
    raise exception 'valid phone number is required' using errcode = '23514';
  end if;

  insert into public.online_profiles (
    auth_uid,
    name,
    phone,
    company,
    pan,
    id_doc_type,
    id_doc_number,
    id_doc_path,
    id_doc_uploaded_at,
    updated_at
  )
  values (
    v_auth_uid,
    btrim(p_name),
    btrim(p_phone),
    nullif(btrim(p_company), ''),
    nullif(btrim(p_pan), ''),
    nullif(btrim(p_id_doc_type), ''),
    nullif(btrim(p_id_doc_number), ''),
    nullif(btrim(p_id_doc_path), ''),
    case when p_id_doc_path is not null then now() else null end,
    now()
  )
  on conflict (auth_uid) do update set
    name = excluded.name,
    phone = excluded.phone,
    company = coalesce(excluded.company, online_profiles.company),
    pan = coalesce(excluded.pan, online_profiles.pan),
    id_doc_type = coalesce(excluded.id_doc_type, online_profiles.id_doc_type),
    id_doc_number = coalesce(excluded.id_doc_number, online_profiles.id_doc_number),
    id_doc_path = coalesce(excluded.id_doc_path, online_profiles.id_doc_path),
    id_doc_uploaded_at = case
      when excluded.id_doc_path is not null then now()
      else online_profiles.id_doc_uploaded_at
    end,
    updated_at = now()
  returning * into v_rec;

  return v_rec;
end;
$$;

revoke all on function public.online_profile_save(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.online_profile_save(text, text, text, text, text, text, text) to authenticated;

-- 5. RPC bind_online_account_to_client (Coordinator+ hand-bind or confirm-bind)
create or replace function public.bind_online_account_to_client(
  p_auth_uid uuid,
  p_client_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_staff_id uuid;
  v_user_email text;
  v_portal_user_id uuid;
  v_client_name text;
begin
  v_role := public.auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'access denied: Coordinator or above required' using errcode = '42501';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'reason must be at least 10 characters' using errcode = '23514';
  end if;

  select email into v_user_email from auth.users where id = p_auth_uid;
  if v_user_email is null then
    raise exception 'auth user not found' using errcode = 'P0002';
  end if;

  select name into v_client_name from public.clients where id = p_client_id;
  if v_client_name is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  v_staff_id := auth.uid();

  -- Upsert portal_users binding
  insert into public.portal_users (
    client_uuid,
    client_id,
    auth_user_id,
    email,
    email_verified_at,
    invited_by_staff_id,
    role
  )
  values (
    gen_random_uuid(),
    p_client_id,
    p_auth_uid,
    v_user_email,
    now(),
    v_staff_id,
    'Member'
  )
  on conflict (auth_user_id) where auth_user_id is not null
  do update set
    client_id = excluded.client_id
  returning id into v_portal_user_id;

  -- Resolve any pending portal link request
  update public.portal_link_requests
  set resolved_at = now(),
      portal_user_id = v_portal_user_id
  where auth_user_id = p_auth_uid
    and resolved_at is null;

  -- Link unassigned booking requests for this auth user to this client
  update public.booking_requests
  set client_id = p_client_id,
      portal_user_id = v_portal_user_id,
      updated_at = now()
  where requester_auth_uid = p_auth_uid
    and client_id is null;

  -- Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    new_values
  )
  values (
    gen_random_uuid(),
    'session',
    'Users',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'portal_users',
    v_portal_user_id,
    coalesce(v_staff_id, auth.uid()),
    jsonb_build_object(
      'auth_uid', p_auth_uid,
      'client_id', p_client_id,
      'client_name', v_client_name,
      'reason', btrim(p_reason)
    )
  );

  return jsonb_build_object(
    'success', true,
    'portal_user_id', v_portal_user_id,
    'client_id', p_client_id
  );
end;
$$;

revoke all on function public.bind_online_account_to_client(uuid, uuid, text) from public, anon;
grant execute on function public.bind_online_account_to_client(uuid, uuid, text) to authenticated;

-- 6. Policies for client self-service on booking_requests
drop policy if exists booking_requests_client_select on public.booking_requests;
create policy booking_requests_client_select on public.booking_requests
  for select
  to authenticated
  using (
    requester_auth_uid = auth.uid()
  );

drop policy if exists booking_request_lines_client_select on public.booking_request_lines;
create policy booking_request_lines_client_select on public.booking_request_lines
  for select
  to authenticated
  using (
    exists (
      select 1 from public.booking_requests r
      where r.id = booking_request_lines.request_id
        and r.requester_auth_uid = auth.uid()
    )
  );

-- Update public.booking_requests_v with auth and client binding columns
drop view if exists public.booking_requests_v cascade;
create or replace view public.booking_requests_v as
select
  r.id,
  r.request_number,
  r.client_name,
  r.client_email,
  r.client_phone,
  r.project_name,
  r.shoot_location,
  r.start_date,
  r.end_date,
  r.fulfillment_type,
  r.delivery_zone_id,
  r.delivery_address,
  r.status,
  r.decline_reason,
  r.booking_id,
  r.requester_auth_uid,
  r.client_id,
  r.portal_user_id,
  case when auth_can_view_money() or r.requester_auth_uid = auth.uid() then r.total_paisa else null end as total_paisa,
  case when auth_can_view_money() or r.requester_auth_uid = auth.uid() then r.vat_paisa else null end as vat_paisa,
  case when auth_can_view_money() or r.requester_auth_uid = auth.uid() then r.advance_due_paisa else null end as advance_due_paisa,
  r.created_at,
  r.updated_at
from public.booking_requests r;

revoke all on public.booking_requests_v from public, anon;
grant select on public.booking_requests_v to authenticated;

-- 7. Update submit_booking_request to automatically bind authenticated requests to requester_auth_uid
create or replace function public.submit_booking_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_name text;
  v_client_email text;
  v_client_phone text;
  v_project_name text;
  v_shoot_location text;
  v_start_date date;
  v_end_date date;
  v_fulfillment text;
  v_delivery_zone text;
  v_delivery_address text;
  v_lines jsonb;
  v_line jsonb;
  v_rental_days integer;
  v_request_id uuid;
  v_request_num text;
  v_total_paisa bigint := 0;
  v_vat_paisa bigint := 0;
  v_advance_due_paisa bigint := 0;
  v_product_id uuid;
  v_bundle_id uuid;
  v_quantity integer;
  v_rate bigint;
  v_line_total bigint;
  v_auth_uid uuid;
  v_client_id uuid;
  v_portal_user_id uuid;
begin
  -- Validate client info
  v_client_name := nullif(trim(p_payload ->> 'client_name'), '');
  v_client_email := nullif(trim(p_payload ->> 'client_email'), '');
  v_client_phone := nullif(trim(p_payload ->> 'client_phone'), '');
  v_project_name := nullif(trim(p_payload ->> 'project_name'), '');
  v_shoot_location := nullif(trim(p_payload ->> 'shoot_location'), '');
  v_fulfillment := coalesce(nullif(trim(p_payload ->> 'fulfillment_type'), ''), 'pickup');
  v_delivery_zone := nullif(trim(p_payload ->> 'delivery_zone_id'), '');
  v_delivery_address := nullif(trim(p_payload ->> 'delivery_address'), '');

  if v_client_name is null then
    raise exception 'GATE:gate.booking_request.name_required|Client name is required.';
  end if;
  if v_client_email is null then
    raise exception 'GATE:gate.booking_request.email_required|Client email is required.';
  end if;
  if v_client_phone is null then
    raise exception 'GATE:gate.booking_request.phone_required|Client phone is required.';
  end if;

  -- Validate dates
  begin
    v_start_date := (p_payload ->> 'start_date')::date;
    v_end_date := (p_payload ->> 'end_date')::date;
  exception when others then
    raise exception 'GATE:gate.booking_request.invalid_dates|Valid start and end dates are required.';
  end;

  if v_end_date < v_start_date then
    raise exception 'GATE:gate.booking_request.invalid_date_range|End date must be on or after start date.';
  end if;

  -- 12-hour advance notice check for pickup (W63)
  if v_fulfillment = 'pickup' then
    if v_start_date < (current_date) then
      raise exception 'GATE:gate.booking_request.advance_notice|Pickup must be at least 12 hours after the request.';
    end if;
  end if;

  -- Validate lines
  v_lines := p_payload -> 'lines';
  if v_lines is null or jsonb_array_length(v_lines) = 0 then
    raise exception 'GATE:gate.booking_request.empty_cart|At least one item is required in the booking request.';
  end if;

  v_rental_days := (v_end_date - v_start_date) + 1;
  if v_rental_days <= 0 then
    v_rental_days := 1;
  end if;

  -- Resolve authenticated client identity and existing client/portal bindings
  v_auth_uid := auth.uid();
  if v_auth_uid is not null then
    -- Verify this auth user actually exists in auth.users and is a portal client (not internal staff)
    if exists (select 1 from auth.users where id = v_auth_uid) and not exists (select 1 from public.users where id = v_auth_uid) then
      select pu.id, pu.client_id
      into v_portal_user_id, v_client_id
      from public.portal_users pu
      join public.online_profiles op on op.phone = pu.phone
      where op.auth_uid = v_auth_uid
      order by pu.created_at desc
      limit 1;
    else
      v_auth_uid := null;
    end if;
  end if;

  -- Generate request number: REQ-YYYYMMDD-XXXX
  v_request_num := 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.booking_request_seq')::text, 4, '0');
  v_request_id := gen_random_uuid();

  -- Insert header
  insert into public.booking_requests (
    id,
    request_number,
    client_name,
    client_email,
    client_phone,
    project_name,
    shoot_location,
    start_date,
    end_date,
    fulfillment_type,
    delivery_zone_id,
    delivery_address,
    status,
    requester_auth_uid,
    client_id,
    portal_user_id
  ) values (
    v_request_id,
    v_request_num,
    v_client_name,
    v_client_email,
    v_client_phone,
    v_project_name,
    v_shoot_location,
    v_start_date,
    v_end_date,
    v_fulfillment,
    v_delivery_zone,
    v_delivery_address,
    'pending',
    v_auth_uid,
    v_client_id,
    v_portal_user_id
  );

  -- Process and insert each line
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_bundle_id := (v_line ->> 'bundle_id')::uuid;
    v_quantity := coalesce((v_line ->> 'quantity')::integer, 1);

    if v_quantity <= 0 then
      raise exception 'GATE:gate.booking_request.invalid_quantity|Quantity must be at least 1.';
    end if;

    if v_product_id is null and v_bundle_id is null then
      raise exception 'GATE:gate.booking_request.item_required|Line must reference a product or bundle.';
    end if;

    v_rate := 0;
    if v_product_id is not null then
      select coalesce(daily_rate, 0) into v_rate
      from public.products
      where id = v_product_id;
    elsif v_bundle_id is not null then
      select coalesce(daily_rate, 0) into v_rate
      from public.bundles
      where id = v_bundle_id;
    end if;

    v_line_total := v_rate * v_rental_days * v_quantity;
    v_total_paisa := v_total_paisa + v_line_total;

    insert into public.booking_request_lines (
      request_id,
      product_id,
      bundle_id,
      quantity,
      daily_rate_paisa,
      line_total_paisa
    ) values (
      v_request_id,
      v_product_id,
      v_bundle_id,
      v_quantity,
      v_rate,
      v_line_total
    );
  end loop;

  -- Standard Nepal 13% VAT and 50% advance due
  v_vat_paisa := round(v_total_paisa * 0.13);
  v_advance_due_paisa := round((v_total_paisa + v_vat_paisa) * 0.50);

  update public.booking_requests
  set total_paisa = v_total_paisa,
      vat_paisa = v_vat_paisa,
      advance_due_paisa = v_advance_due_paisa
  where id = v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'request_number', v_request_num,
    'total_paisa', v_total_paisa,
    'vat_paisa', v_vat_paisa,
    'advance_due_paisa', v_advance_due_paisa,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.submit_booking_request(jsonb) from public;
grant execute on function public.submit_booking_request(jsonb) to anon, authenticated;

-- Record 0257_client_accounts_and_portal_binding in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030138', '0257_client_accounts_and_portal_binding')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0257_client_accounts_and_portal_binding.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0258_payment_intents_and_fonepay.sql
-- SHA-256: ff4c2eca3a96c63778783d45b7a0461499a748fa7d81f39c37397ead79593a4f
-- Version: 20261122030139
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0254_payment_intents_and_fonepay.sql
-- T7-05: Online payment intents, Fonepay integration, server-calculated amounts,
-- idempotent allocation to immutable payments, and staff queue confirmation integration.
--
-- Rules:
-- - Server computes amount; client-submitted figures are ignored (D30).
-- - Security deposits strictly excluded; online payment covers rental advance or invoice balance only (O-3).
-- - Law 4: payments rows are immutable.
-- - Law 6: floor roles (Warehouse, Technician, Driver) receive zero rows/figures.
-- - Idempotent allocation: replayed callbacks change nothing.
-- =============================================================================

begin;

-- 1. Table: public.payment_intents
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  client_uuid text not null unique,
  booking_id uuid references public.bookings(id) on delete set null,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  requester_auth_uid uuid,
  provider text not null check (provider in ('fonepay', 'esewa', 'khalti')),
  amount_paisa bigint not null check (amount_paisa > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'allocated', 'failed', 'expired')),
  provider_ref text,
  provider_response jsonb,
  payment_id uuid references public.payments(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  paid_at timestamptz,
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_intents_target check (
    booking_id is not null or booking_request_id is not null
  )
);

create index if not exists idx_payment_intents_booking on public.payment_intents(booking_id);
create index if not exists idx_payment_intents_request on public.payment_intents(booking_request_id);
create index if not exists idx_payment_intents_requester on public.payment_intents(requester_auth_uid);
create index if not exists idx_payment_intents_status on public.payment_intents(status);
create index if not exists idx_payment_intents_provider_ref on public.payment_intents(provider_ref) where provider_ref is not null;

-- 2. RLS on public.payment_intents
alter table public.payment_intents enable row level security;

-- Staff with money view permission can view all intents
drop policy if exists payment_intents_staff_select on public.payment_intents;
create policy payment_intents_staff_select on public.payment_intents
  for select
  to authenticated
  using (
    auth_can_view_money()
  );

-- Clients can view intents belonging to their account or requests
drop policy if exists payment_intents_client_select on public.payment_intents;
create policy payment_intents_client_select on public.payment_intents
  for select
  to authenticated
  using (
    requester_auth_uid = auth.uid()
    or exists (
      select 1 from public.booking_requests br
      where br.id = payment_intents.booking_request_id
        and br.requester_auth_uid = auth.uid()
    )
  );

-- Revoke direct writes from public, anon, and authenticated
revoke insert, update, delete on public.payment_intents from public, anon, authenticated;
grant select on public.payment_intents to authenticated;

-- 3. SQL mirror of calculateAdvanceRequired()
create or replace function public.calculate_advance_required(p_total_paisa bigint)
returns bigint
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_five_thousand constant bigint := 500000;
  v_ten_thousand constant bigint := 1000000;
begin
  if p_total_paisa is null or p_total_paisa <= 0 then
    return 0;
  end if;
  if p_total_paisa <= v_five_thousand then
    return p_total_paisa;
  end if;
  if p_total_paisa <= v_ten_thousand then
    return v_five_thousand;
  end if;
  return (round((p_total_paisa::numeric * 0.5) / 100.0) * 100)::bigint;
end;
$$;

revoke all on function public.calculate_advance_required(bigint) from public, anon;
grant execute on function public.calculate_advance_required(bigint) to authenticated;

-- 4. RPC: create_payment_intent
-- Computes the amount ON THE SERVER (advance required or invoice balance).
-- Client submitted amount is completely omitted from the signature.
create or replace function public.create_payment_intent(
  p_client_uuid text,
  p_booking_id uuid default null,
  p_booking_request_id uuid default null,
  p_provider text default 'fonepay'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.payment_intents;
  v_amount_paisa bigint := 0;
  v_client_id uuid;
  v_requester_auth_uid uuid;
  v_clean_provider text;
  v_req record;
  v_inv record;
  v_bk record;
  v_prior_payments numeric(14,2) := 0;
  v_est_rupees numeric(14,2) := 0;
  v_intent_id uuid;
begin
  if p_client_uuid is null or trim(p_client_uuid) = '' then
    raise exception 'GATE:gate.payment.missing_client_uuid|A client UUID is required.';
  end if;

  v_clean_provider := lower(trim(coalesce(p_provider, 'fonepay')));
  if v_clean_provider not in ('fonepay', 'esewa', 'khalti') then
    raise exception 'GATE:gate.payment.invalid_provider|Provider % is not supported.', p_provider;
  end if;

  -- Idempotency check: if intent already exists for this client_uuid, return it
  select * into v_existing from public.payment_intents where client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_existing.id,
      'client_uuid', v_existing.client_uuid,
      'amount_paisa', v_existing.amount_paisa,
      'provider', v_existing.provider,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at,
      'is_existing', true
    );
  end if;

  v_requester_auth_uid := auth.uid();

  if p_booking_request_id is not null then
    select id, client_id, requester_auth_uid, total_paisa, vat_paisa, advance_due_paisa, status
      into v_req
      from public.booking_requests
     where id = p_booking_request_id;

    if not found then
      raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
    end if;

    if v_req.status in ('declined', 'cancelled') then
      raise exception 'GATE:gate.payment.request_inactive|Cannot create payment for a % request.', v_req.status;
    end if;

    v_client_id := v_req.client_id;
    v_requester_auth_uid := coalesce(v_requester_auth_uid, v_req.requester_auth_uid);
    if v_req.advance_due_paisa > 0 then
      v_amount_paisa := v_req.advance_due_paisa;
    else
      v_amount_paisa := public.calculate_advance_required(v_req.total_paisa + v_req.vat_paisa);
    end if;

  elsif p_booking_id is not null then
    select id, client_id, branch_id, stage
      into v_bk
      from public.bookings
     where id = p_booking_id;

    if not found then
      raise exception 'GATE:gate.booking.not_found|Booking not found.';
    end if;

    if v_bk.stage = 'Cancelled' then
      raise exception 'GATE:gate.payment.booking_cancelled|Cannot create payment for a cancelled booking.';
    end if;

    v_client_id := v_bk.client_id;

    -- Look up latest non-void invoice for the booking if any
    select id, outstanding_amount, status
      into v_inv
      from public.invoices
     where booking_id = p_booking_id
       and status <> 'Void'
     order by created_at desc
     limit 1;

    if found and v_inv.outstanding_amount > 0 then
      v_amount_paisa := (round(v_inv.outstanding_amount * 100))::bigint;
    else
      -- Compute booking estimate and advance required minus prior payments
      v_est_rupees := public.booking_estimate_total(p_booking_id);
      select coalesce(sum(amount), 0)
        into v_prior_payments
        from public.payments
       where booking_id = p_booking_id
         and status = 'Received'
         and payment_type = 'Advance Payment';

      v_amount_paisa := public.calculate_advance_required((round(v_est_rupees * 100))::bigint) - (round(v_prior_payments * 100))::bigint;
    end if;

  else
    raise exception 'GATE:gate.payment.target_required|Either booking_id or booking_request_id must be provided.';
  end if;

  if v_amount_paisa <= 0 then
    raise exception 'GATE:gate.payment.nothing_due|No payment or advance is due.';
  end if;

  insert into public.payment_intents (
    client_uuid,
    booking_id,
    booking_request_id,
    client_id,
    requester_auth_uid,
    provider,
    amount_paisa,
    status
  ) values (
    p_client_uuid,
    p_booking_id,
    p_booking_request_id,
    v_client_id,
    v_requester_auth_uid,
    v_clean_provider,
    v_amount_paisa,
    'pending'
  )
  returning id into v_intent_id;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent_id,
    'client_uuid', p_client_uuid,
    'amount_paisa', v_amount_paisa,
    'provider', v_clean_provider,
    'status', 'pending',
    'expires_at', (now() + interval '48 hours'),
    'is_existing', false
  );
end;
$$;

revoke all on function public.create_payment_intent(text, uuid, uuid, text) from public, anon;
grant execute on function public.create_payment_intent(text, uuid, uuid, text) to authenticated;

-- 5. RPC: allocate_payment_intent
-- Transitions payment intent to 'paid' and, if booking_id is present, records an immutable
-- payment ledger entry in public.payments.
create or replace function public.allocate_payment_intent(
  p_intent_id uuid,
  p_provider_ref text,
  p_provider_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_payment_no text;
  v_received_by uuid;
  v_duplicate_ref record;
begin
  if p_intent_id is null then
    raise exception 'GATE:gate.payment.missing_intent_id|Payment intent ID is required.';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
     for update;

  if not found then
    raise exception 'GATE:gate.payment.intent_not_found|Payment intent not found.';
  end if;

  -- Replay guard 1: if already allocated, return idempotent success
  if v_intent.status = 'allocated' and v_intent.payment_id is not null then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'payment_id', v_intent.payment_id,
      'status', 'allocated',
      'already_allocated', true
    );
  end if;

  -- Replay guard 2: if already paid (e.g. unconfirmed request), return idempotent state
  if v_intent.status = 'paid' and v_intent.booking_id is null then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'payment_id', null,
      'status', 'paid',
      'already_paid', true
    );
  end if;

  -- Expiry check
  if now() > v_intent.expires_at then
    update public.payment_intents set status = 'expired', updated_at = now() where id = v_intent.id;
    raise exception 'GATE:gate.payment.intent_expired|Payment intent has expired.';
  end if;

  -- Guard against reused provider_ref across different intents
  if p_provider_ref is not null and trim(p_provider_ref) <> '' then
    select id into v_duplicate_ref
      from public.payment_intents
     where provider = v_intent.provider
       and provider_ref = trim(p_provider_ref)
       and id <> v_intent.id
     limit 1;

    if found then
      raise exception 'GATE:gate.payment.provider_ref_reused|Provider reference has already been used for another intent.';
    end if;
  end if;

  -- Mark intent paid
  update public.payment_intents set
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    provider_ref = trim(p_provider_ref),
    provider_response = p_provider_response,
    updated_at = now()
  where id = v_intent.id;

  -- If linked to a confirmed booking, allocate to immutable payments row immediately
  if v_intent.booking_id is not null then
    select * into v_booking
      from public.bookings
     where id = v_intent.booking_id;

    if found and v_booking.stage <> 'Cancelled' then
      -- Pick latest non-void invoice if any
      select id into v_invoice_id
        from public.invoices
       where booking_id = v_intent.booking_id
         and status <> 'Void'
       order by created_at desc
       limit 1;

      -- Resolve received_by user
      select id into v_received_by
        from public.users
       where primary_role in ('Owner', 'Admin', 'Manager')
       order by created_at asc
       limit 1;

      if v_received_by is null then
        select id into v_received_by from public.users order by created_at asc limit 1;
      end if;

      v_payment_id := gen_random_uuid();
      v_payment_no := public.next_document_number('payment');

      insert into public.payments (
        id,
        client_uuid,
        payment_no,
        booking_id,
        invoice_id,
        client_id,
        branch_id,
        amount,
        payment_type,
        status,
        payment_date,
        transaction_ref,
        notes,
        received_by
      ) values (
        v_payment_id,
        gen_random_uuid(),
        v_payment_no,
        v_intent.booking_id,
        v_invoice_id,
        v_booking.client_id,
        v_booking.branch_id,
        (v_intent.amount_paisa::numeric / 100.0),
        'Advance Payment',
        'Received',
        now(),
        trim(p_provider_ref),
        'Online payment via ' || initcap(v_intent.provider) || ' (ref: ' || coalesce(p_provider_ref, '') || ')',
        v_received_by
      );

      update public.payment_intents set
        status = 'allocated',
        allocated_at = now(),
        payment_id = v_payment_id,
        updated_at = now()
      where id = v_intent.id;

      return jsonb_build_object(
        'success', true,
        'intent_id', v_intent.id,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount_paisa', v_intent.amount_paisa,
        'status', 'allocated'
      );
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'payment_id', null,
    'amount_paisa', v_intent.amount_paisa,
    'status', 'paid'
  );
end;
$$;

revoke all on function public.allocate_payment_intent(uuid, text, jsonb) from public, anon;
grant execute on function public.allocate_payment_intent(uuid, text, jsonb) to authenticated;

-- 6. Update confirm_booking_request to allocate any paid payment intents linked to the request
create or replace function public.confirm_booking_request(p_request_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.booking_requests;
  v_intent record;
  v_booking public.bookings;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_payment_no text;
  v_received_by uuid;
  v_allocated_count int := 0;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'GATE:gate.auth.unauthorized|Only coordinator or higher can confirm online requests.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
  end if;

  -- Idempotency: if already confirmed with the same booking_id, return success
  if v_req.status = 'confirmed' then
    return jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'booking_id', v_req.booking_id,
      'already_confirmed', true
    );
  end if;

  if v_req.status in ('declined', 'cancelled') then
    raise exception 'GATE:gate.booking_request.invalid_status|Cannot confirm a request that has been %.', v_req.status;
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'GATE:gate.booking.not_found|Target booking % does not exist.', p_booking_id;
  end if;

  update public.booking_requests set
    status = 'confirmed',
    booking_id = p_booking_id,
    updated_at = now()
  where id = p_request_id;

  -- Allocate any paid intents for this request
  select id into v_received_by
    from public.users
   where primary_role in ('Owner', 'Admin', 'Manager')
   order by created_at asc
   limit 1;
  if v_received_by is null then
    select id into v_received_by from public.users order by created_at asc limit 1;
  end if;

  select id into v_invoice_id
    from public.invoices
   where booking_id = p_booking_id
     and status <> 'Void'
   order by created_at desc
   limit 1;

  for v_intent in
    select * from public.payment_intents
     where booking_request_id = p_request_id
       and status = 'paid'
       and allocated_at is null
     for update
  loop
    v_payment_id := gen_random_uuid();
    v_payment_no := public.next_document_number('payment');

    insert into public.payments (
      id,
      client_uuid,
      payment_no,
      booking_id,
      invoice_id,
      client_id,
      branch_id,
      amount,
      payment_type,
      status,
      payment_date,
      transaction_ref,
      notes,
      received_by
    ) values (
      v_payment_id,
      gen_random_uuid(),
      v_payment_no,
      p_booking_id,
      v_invoice_id,
      v_booking.client_id,
      v_booking.branch_id,
      (v_intent.amount_paisa::numeric / 100.0),
      'Advance Payment',
      'Received',
      now(),
      v_intent.provider_ref,
      'Online advance via ' || initcap(v_intent.provider) || ' for Request ' || v_req.request_number || ' (ref: ' || coalesce(v_intent.provider_ref, '') || ')',
      v_received_by
    );

    update public.payment_intents set
      booking_id = p_booking_id,
      status = 'allocated',
      allocated_at = now(),
      payment_id = v_payment_id,
      updated_at = now()
    where id = v_intent.id;

    v_allocated_count := v_allocated_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'request_id', p_request_id,
    'booking_id', p_booking_id,
    'allocated_payments', v_allocated_count
  );
end;
$$;

-- 7. Verification assertions
do $$
begin
  assert exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'payment_intents'
  ), 'payment_intents table must exist';

  assert exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payment_intents' and c.relrowsecurity = true
  ), 'payment_intents must have RLS enabled';

  assert (select public.calculate_advance_required(0)) = 0, 'calculate_advance_required(0) = 0';
  assert (select public.calculate_advance_required(350000)) = 350000, 'calculate_advance_required(350000) = 350000';
  assert (select public.calculate_advance_required(750000)) = 500000, 'calculate_advance_required(750000) = 500000';
  assert (select public.calculate_advance_required(2000000)) = 1000000, 'calculate_advance_required(2000000) = 1000000';
end;
$$;

commit;

-- Record 0258_payment_intents_and_fonepay in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030139', '0258_payment_intents_and_fonepay')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0258_payment_intents_and_fonepay.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0259_payment_link_from_any_booking.sql
-- SHA-256: 6b484314d61a2ff79a25d73cbada8fd01302a4394b7ad265e365032a6136d3e4
-- Version: 20261122030140
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0255_payment_link_from_any_booking.sql
-- T7-15: Payment link from any booking (Fonepay, eSewa, Khalti)
--
-- Rules:
-- - Server computes amount; client-submitted figures are strictly ignored (D30).
-- - Security deposits strictly excluded; online payment covers rental advance or invoice balance only (O-3, B38).
-- - Links expire after 48 hours; a new link replaces the old; a paid link cannot be paid twice.
-- - Law 4: payments rows are immutable.
-- - Law 6: floor roles (Warehouse, Technician, Driver) denied from creating links.
-- - Functions revoked from public/anon to honor function-leak gate.
-- =============================================================================

begin;

-- 1. Extend public.payment_intents with payment link columns
alter table public.payment_intents
  add column if not exists token_hash text unique,
  add column if not exists is_payment_link boolean not null default false,
  add column if not exists created_by uuid references public.users(id) on delete set null;

create index if not exists idx_payment_intents_token_hash
  on public.payment_intents(token_hash)
  where token_hash is not null;

create index if not exists idx_payment_intents_link_booking
  on public.payment_intents(booking_id, is_payment_link)
  where is_payment_link = true;

-- 2. Stored Procedure: create_booking_payment_link
create or replace function public.create_booking_payment_link(
  p_client_uuid text,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bk record;
  v_inv record;
  v_amount_paisa bigint := 0;
  v_est_rupees numeric(14,2) := 0;
  v_prior_payments numeric(14,2) := 0;
  v_raw_token text;
  v_token_hash text;
  v_intent_id uuid;
  v_expires_at timestamptz;
begin
  -- Permission check: caller must have authority to view/manage money (Law 6)
  if not public.auth_can_view_money() then
    raise exception 'GATE:gate.rbac.money_denied|Forbidden: You do not have permission to generate payment links.';
  end if;

  if p_client_uuid is null or trim(p_client_uuid) = '' then
    raise exception 'GATE:gate.payment.missing_client_uuid|A client UUID is required.';
  end if;

  if p_booking_id is null then
    raise exception 'GATE:gate.payment.missing_booking_id|A booking ID is required.';
  end if;

  -- Validate booking existence and stage
  select id, client_id, branch_id, stage, booking_no
    into v_bk
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'GATE:gate.booking.not_found|Booking not found.';
  end if;

  if v_bk.stage::text in ('Cancelled', 'Closed') then
    raise exception 'GATE:gate.payment.booking_inactive|Cannot create payment link for an inactive or closed booking.';
  end if;

  -- Calculate authoritative amount due (server-computed, Law 1)
  -- 1) Latest non-void invoice with outstanding balance
  select id, outstanding_amount, status
    into v_inv
    from public.invoices
   where booking_id = p_booking_id
     and status <> 'Void'
   order by created_at desc
   limit 1;

  if found and v_inv.outstanding_amount > 0 then
    v_amount_paisa := (round(v_inv.outstanding_amount * 100))::bigint;
  else
    -- 2) Pre-invoice booking estimate and advance required minus prior advance payments
    v_est_rupees := public.booking_estimate_total(p_booking_id);
    select coalesce(sum(amount), 0)
      into v_prior_payments
      from public.payments
     where booking_id = p_booking_id
       and status = 'Received'
       and payment_type = 'Advance Payment';

    v_amount_paisa := public.calculate_advance_required((round(v_est_rupees * 100))::bigint) - (round(v_prior_payments * 100))::bigint;
  end if;

  if v_amount_paisa <= 0 then
    raise exception 'GATE:gate.payment.nothing_due|No payment or advance is due on this booking.';
  end if;

  -- "A new link replaces the old" — expire any prior active pending links for this booking
  update public.payment_intents
     set status = 'expired',
         updated_at = now()
   where booking_id = p_booking_id
     and is_payment_link = true
     and status = 'pending';

  -- High-entropy 64-character token
  v_raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');
  v_expires_at := now() + interval '48 hours';

  insert into public.payment_intents (
    client_uuid,
    booking_id,
    client_id,
    requester_auth_uid,
    provider,
    amount_paisa,
    status,
    token_hash,
    is_payment_link,
    created_by,
    expires_at
  ) values (
    p_client_uuid,
    p_booking_id,
    v_bk.client_id,
    auth.uid(),
    'fonepay',
    v_amount_paisa,
    'pending',
    v_token_hash,
    true,
    auth.uid(),
    v_expires_at
  )
  returning id into v_intent_id;

  -- Audit creation
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    branch_id,
    new_values
  ) values (
    gen_random_uuid(),
    'money movement',
    'Finance',
    'Finance',
    'Create',
    'Informational',
    'Success',
    'payment_intents',
    v_intent_id,
    auth.uid(),
    public.auth_user_role(),
    v_bk.branch_id,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'amount_paisa', v_amount_paisa,
      'expires_at', v_expires_at
    )
  );

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent_id,
    'token', v_raw_token,
    'amount_paisa', v_amount_paisa,
    'expires_at', v_expires_at,
    'booking_id', p_booking_id,
    'booking_no', coalesce(v_bk.booking_no, '')
  );
end;
$$;

-- 3. Stored Procedure: get_payment_link_details
create or replace function public.get_payment_link_details(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_intent public.payment_intents;
  v_bk record;
  v_client_name text := '';
  v_masked_name text := '';
  v_items_count integer := 0;
begin
  if p_token is null or trim(p_token) = '' then
    return jsonb_build_object('valid', false, 'reason', 'missing_token');
  end if;

  v_token_hash := encode(sha256(convert_to(trim(p_token), 'UTF8')), 'hex');

  select * into v_intent
    from public.payment_intents
   where token_hash = v_token_hash
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_intent.status = 'expired' or now() > v_intent.expires_at then
    return jsonb_build_object(
      'valid', false,
      'reason', 'expired',
      'expires_at', v_intent.expires_at,
      'intent_id', v_intent.id
    );
  end if;

  if v_intent.status in ('paid', 'allocated') then
    return jsonb_build_object(
      'valid', false,
      'reason', 'already_paid',
      'paid_at', v_intent.paid_at,
      'amount_paisa', v_intent.amount_paisa,
      'intent_id', v_intent.id
    );
  end if;

  if v_intent.status <> 'pending' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'inactive',
      'status', v_intent.status,
      'intent_id', v_intent.id
    );
  end if;

  -- Load booking info if present
  if v_intent.booking_id is not null then
    select b.id, b.booking_no, coalesce(b.project_name, b.project, '') as project_name, b.pickup_at, b.return_at, c.name as client_name
      into v_bk
      from public.bookings b
      left join public.clients c on c.id = b.client_id
     where b.id = v_intent.booking_id;

    if found then
      v_client_name := coalesce(v_bk.client_name, '');
      if length(v_client_name) > 3 then
        v_masked_name := substring(v_client_name from 1 for 1) || '*** ' || substring(v_client_name from length(v_client_name) for 1);
      else
        v_masked_name := 'Client';
      end if;

      select coalesce(count(*), 0)::integer
        into v_items_count
        from public.booking_lines
       where booking_id = v_intent.booking_id;
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'intent_id', v_intent.id,
    'amount_paisa', v_intent.amount_paisa,
    'booking_id', v_intent.booking_id,
    'booking_no', coalesce(v_bk.booking_no, ''),
    'project_name', coalesce(v_bk.project_name, ''),
    'pickup_at', v_bk.pickup_at,
    'return_at', v_bk.return_at,
    'client_name_masked', v_masked_name,
    'items_count', v_items_count,
    'expires_at', v_intent.expires_at,
    'provider', v_intent.provider
  );
end;
$$;

-- 4. Re-declare allocate_payment_intent to validate active status and safe stage enum comparison
create or replace function public.allocate_payment_intent(
  p_intent_id uuid,
  p_provider_ref text,
  p_provider_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_payment_no text;
  v_received_by uuid;
  v_duplicate_ref record;
begin
  if p_intent_id is null then
    raise exception 'GATE:gate.payment.missing_intent_id|Payment intent ID is required.';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
     for update;

  if not found then
    raise exception 'GATE:gate.payment.intent_not_found|Payment intent not found.';
  end if;

  -- Replay guard 1: if already allocated, return idempotent success
  if v_intent.status = 'allocated' and v_intent.payment_id is not null then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'payment_id', v_intent.payment_id,
      'status', 'allocated',
      'already_allocated', true
    );
  end if;

  -- Replay guard 2: if already paid (e.g. unconfirmed request), return idempotent state
  if v_intent.status = 'paid' and v_intent.booking_id is null then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'payment_id', null,
      'status', 'paid',
      'already_paid', true
    );
  end if;

  -- Expiry check
  if now() > v_intent.expires_at then
    update public.payment_intents set status = 'expired', updated_at = now() where id = v_intent.id;
    raise exception 'GATE:gate.payment.intent_expired|Payment intent has expired.';
  end if;

  -- Inactive check: refuse expired or failed intents
  if v_intent.status not in ('pending', 'paid') then
    raise exception 'GATE:gate.payment.intent_inactive|Payment intent is %.', v_intent.status;
  end if;

  -- Guard against reused provider_ref across different intents
  if p_provider_ref is not null and trim(p_provider_ref) <> '' then
    select id into v_duplicate_ref
      from public.payment_intents
     where provider = v_intent.provider
       and provider_ref = trim(p_provider_ref)
       and id <> v_intent.id
     limit 1;

    if found then
      raise exception 'GATE:gate.payment.provider_ref_reused|Provider reference has already been used for another intent.';
    end if;
  end if;

  -- Mark intent paid
  update public.payment_intents set
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    provider_ref = trim(p_provider_ref),
    provider_response = p_provider_response,
    updated_at = now()
  where id = v_intent.id;

  -- If linked to a confirmed booking, allocate to immutable payments row immediately
  if v_intent.booking_id is not null then
    select * into v_booking
      from public.bookings
     where id = v_intent.booking_id;

    if found and v_booking.stage::text not in ('Cancelled', 'Closed') then
      -- Pick latest non-void invoice if any
      select id into v_invoice_id
        from public.invoices
       where booking_id = v_intent.booking_id
         and status <> 'Void'
       order by created_at desc
       limit 1;

      -- Resolve received_by user
      select id into v_received_by
        from public.users
       where primary_role in ('Owner', 'Admin', 'Manager')
       order by created_at asc
       limit 1;

      if v_received_by is null then
        select id into v_received_by from public.users order by created_at asc limit 1;
      end if;

      v_payment_id := gen_random_uuid();
      v_payment_no := public.next_document_number('payment');

      insert into public.payments (
        id,
        client_uuid,
        payment_no,
        booking_id,
        invoice_id,
        client_id,
        branch_id,
        amount,
        payment_type,
        status,
        payment_date,
        transaction_ref,
        notes,
        received_by
      ) values (
        v_payment_id,
        gen_random_uuid(),
        v_payment_no,
        v_intent.booking_id,
        v_invoice_id,
        v_booking.client_id,
        v_booking.branch_id,
        (v_intent.amount_paisa::numeric / 100.0),
        'Advance Payment',
        'Received',
        now(),
        trim(p_provider_ref),
        'Online payment via ' || initcap(v_intent.provider) || ' (ref: ' || coalesce(p_provider_ref, '') || ')',
        v_received_by
      );

      update public.payment_intents set
        status = 'allocated',
        allocated_at = now(),
        payment_id = v_payment_id,
        updated_at = now()
      where id = v_intent.id;

      return jsonb_build_object(
        'success', true,
        'intent_id', v_intent.id,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount_paisa', v_intent.amount_paisa,
        'status', 'allocated'
      );
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'payment_id', null,
    'amount_paisa', v_intent.amount_paisa,
    'status', 'paid'
  );
end;
$$;

-- 5. Permissions: Function-leak gate protection
revoke all on function public.create_booking_payment_link(text, uuid) from public, anon;
grant execute on function public.create_booking_payment_link(text, uuid) to authenticated;

revoke all on function public.get_payment_link_details(text) from public, anon;
grant execute on function public.get_payment_link_details(text) to authenticated;

revoke all on function public.allocate_payment_intent(uuid, text, jsonb) from public, anon;
grant execute on function public.allocate_payment_intent(uuid, text, jsonb) to authenticated;

commit;

-- Record 0259_payment_link_from_any_booking in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030140', '0259_payment_link_from_any_booking')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0259_payment_link_from_any_booking.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0260_online_payment_refunds_and_reconciliation.sql
-- SHA-256: 430924cdabe3cec8f0d7ff9aef0f562295cea17e48f4e3f0156515708580ee3a
-- Version: 20261122030141
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0260: Online payment refunds and reconciliation (T7-07, D30, D31, B39, O-2, Law 4, Law 6)
-- 1. Adds refund metadata and status to payment_intents.
-- 2. Creates record_online_payment_refund RPC (records immutable reversal or client account credit, never edits payments).
-- 3. Creates reconciliation reporting RPCs flagging paid intents unallocated or unrefunded after 3 days.

-- 1. Alter payment_intents check constraint and add refund columns
alter table public.payment_intents
  drop constraint if exists payment_intents_status_check;

alter table public.payment_intents
  add constraint payment_intents_status_check check (
    status in ('pending', 'paid', 'allocated', 'failed', 'expired', 'refunded')
  );

alter table public.payment_intents add column if not exists refunded_at timestamptz;
alter table public.payment_intents add column if not exists refund_ref text;
alter table public.payment_intents add column if not exists refund_reason text;
alter table public.payment_intents add column if not exists refund_type text check (refund_type is null or refund_type in ('wallet_refund', 'account_credit'));
alter table public.payment_intents add column if not exists refunded_by uuid references public.users(id);

create index if not exists idx_payment_intents_refunded_at on public.payment_intents(refunded_at) where refunded_at is not null;

-- 2. RPC to record an online payment refund (wallet refund or client account credit)
create or replace function public.record_online_payment_refund(
  p_intent_id uuid,
  p_refund_type text default 'wallet_refund',
  p_refund_ref text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_user_id uuid;
  v_intent record;
  v_payment record;
  v_reversal_id uuid;
  v_reversal_no text;
  v_reason text;
  v_client_id uuid;
  v_amount_numeric numeric(14,2);
begin
  -- Role check: money-viewing management/finance roles only
  v_role := auth_user_role();
  if not auth_can_view_money() or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception 'GATE:MONEY_ROLE_REQUIRED (attempted by %)', coalesce(v_role, 'anon');
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    -- Fallback to system actor if executing within lifecycle/tests
    select id into v_user_id from public.users where role in ('Owner', 'Admin') limit 1;
  end if;

  select * into v_intent
  from public.payment_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Payment intent not found: %', p_intent_id;
  end if;

  -- Idempotency: if already refunded, return success
  if v_intent.status = 'refunded' then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'status', 'refunded',
      'already_refunded', true,
      'amount_paisa', v_intent.amount_paisa
    );
  end if;

  if v_intent.status not in ('paid', 'allocated') then
    raise exception 'Cannot refund payment intent with status % (must be paid or allocated)', v_intent.status;
  end if;

  v_reason := coalesce(nullif(trim(p_reason), ''), 'Online payment refund: ' || coalesce(p_refund_ref, 'Staff processed'));
  if length(v_reason) < 10 then
    v_reason := v_reason || ' (processed by staff)';
  end if;

  v_amount_numeric := round(v_intent.amount_paisa::numeric / 100.0, 2);

  -- Determine client ID
  v_client_id := v_intent.client_id;
  if v_client_id is null and v_intent.booking_id is not null then
    select client_id into v_client_id from public.bookings where id = v_intent.booking_id;
  end if;
  if v_client_id is null and v_intent.booking_request_id is not null then
    select client_id into v_client_id from public.booking_requests where id = v_intent.booking_request_id;
  end if;

  -- Case A: Intent was allocated to a physical payments row -> MUST mint an immutable payment_reversals row (Law 4)
  if v_intent.payment_id is not null then
    select * into v_payment from public.payments where id = v_intent.payment_id;

    if found then
      -- Generate reversal document number
      begin
        v_reversal_no := public.next_document_number('reversal');
      exception when others then
        v_reversal_no := 'REV-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 6);
      end;

      insert into public.payment_reversals (
        client_uuid,
        reversal_no,
        original_payment_id,
        amount,
        reason,
        reversed_by,
        approved_by,
        reversed_at
      ) values (
        gen_random_uuid(),
        v_reversal_no,
        v_payment.id,
        v_amount_numeric,
        v_reason,
        v_user_id,
        v_user_id,
        now()
      )
      returning id into v_reversal_id;
    end if;
  end if;

  -- Case B: Client chose account credit (B39, O-2) -> Record client account credit
  if p_refund_type = 'account_credit' and v_client_id is not null then
    insert into public.client_account_credits (
      client_uuid,
      client_id,
      booking_id,
      amount,
      amount_paisa,
      reason,
      created_by
    ) values (
      gen_random_uuid(),
      v_client_id,
      v_intent.booking_id,
      v_amount_numeric,
      v_intent.amount_paisa,
      v_reason,
      v_user_id
    );

    update public.clients
    set account_credit = account_credit + v_amount_numeric,
        account_credit_paisa = account_credit_paisa + v_intent.amount_paisa,
        updated_at = now()
    where id = v_client_id;
  end if;

  -- Update payment intent status to refunded
  update public.payment_intents
  set status = 'refunded',
      refunded_at = now(),
      refund_ref = coalesce(p_refund_ref, 'MERCHANT-REFUND'),
      refund_reason = v_reason,
      refund_type = coalesce(p_refund_type, 'wallet_refund'),
      refunded_by = v_user_id,
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'status', 'refunded',
    'refund_type', coalesce(p_refund_type, 'wallet_refund'),
    'amount_paisa', v_intent.amount_paisa,
    'reversal_id', v_reversal_id
  );
end;
$$;

revoke all on function public.record_online_payment_refund(uuid, text, text, text) from public, anon;
grant execute on function public.record_online_payment_refund(uuid, text, text, text) to authenticated;

-- 3. RPC: get_online_payment_reconciliation
-- Summarizes online payments by provider and date, counting unallocated/unrefunded intents > 3 days
create or replace function public.get_online_payment_reconciliation(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  provider text,
  txn_date date,
  total_intents bigint,
  total_paisa bigint,
  paid_intents bigint,
  paid_paisa bigint,
  allocated_intents bigint,
  allocated_paisa bigint,
  refunded_intents bigint,
  refunded_paisa bigint,
  flagged_unreconciled_intents bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Strictly enforce Law 6 money blindness
  if not auth_can_view_money() then
    return;
  end if;

  return query
  select
    pi.provider,
    cast(pi.created_at at time zone 'Asia/Kathmandu' as date) as txn_date,
    count(*)::bigint as total_intents,
    coalesce(sum(pi.amount_paisa), 0)::bigint as total_paisa,
    count(*) filter (where pi.status in ('paid', 'allocated'))::bigint as paid_intents,
    coalesce(sum(pi.amount_paisa) filter (where pi.status in ('paid', 'allocated')), 0)::bigint as paid_paisa,
    count(*) filter (where pi.status = 'allocated')::bigint as allocated_intents,
    coalesce(sum(pi.amount_paisa) filter (where pi.status = 'allocated'), 0)::bigint as allocated_paisa,
    count(*) filter (where pi.status = 'refunded')::bigint as refunded_intents,
    coalesce(sum(pi.amount_paisa) filter (where pi.status = 'refunded'), 0)::bigint as refunded_paisa,
    count(*) filter (
      where pi.status = 'paid'
        and pi.allocated_at is null
        and pi.refunded_at is null
        and pi.created_at < (now() - interval '3 days')
    )::bigint as flagged_unreconciled_intents
  from public.payment_intents pi
  where (p_start_date is null or cast(pi.created_at at time zone 'Asia/Kathmandu' as date) >= p_start_date)
    and (p_end_date is null or cast(pi.created_at at time zone 'Asia/Kathmandu' as date) <= p_end_date)
  group by pi.provider, cast(pi.created_at at time zone 'Asia/Kathmandu' as date)
  order by txn_date desc, pi.provider asc;
end;
$$;

revoke all on function public.get_online_payment_reconciliation(date, date) from public, anon;
grant execute on function public.get_online_payment_reconciliation(date, date) to authenticated;

-- Record 0260_online_payment_refunds_and_reconciliation in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030141', '0260_online_payment_refunds_and_reconciliation')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0260_online_payment_refunds_and_reconciliation.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Reset migration session config
select set_config('app.in_create_booking', 'off', false);

-- =============================================================================
-- BATCH 3 VERIFICATION QUERY
-- Run this query immediately after running the batch to confirm registration:
-- =============================================================================
select 'BATCH 3 VERIFICATION' as batch, count(*) as applied_count
from supabase_migrations.schema_migrations
where name in (
  '0245_delivery_zone_vehicle_fee_grid',
  '0246_dispatch_zone_fee_from_grid',
  '0247_retire_per_zone_fee_on_create',
  '0248_delivery_zone_distance_band',
  '0249_late_night_delivery_is_money_setting',
  '0250_outsourced_vehicle_quote',
  '0251_waiting_charge_line',
  '0252_allow_overbooking_on_chosen_products',
  '0253_temporary_stock_from_partners',
  '0254_draft_invoice_resync_integrity_and_settlement_numbering',
  '0255_booking_site_and_public_catalogue',
  '0256_booking_requests_and_staff_queue',
  '0257_client_accounts_and_portal_binding',
  '0258_payment_intents_and_fonepay',
  '0259_payment_link_from_any_booking',
  '0260_online_payment_refunds_and_reconciliation'
);
-- Expected applied_count: 16
