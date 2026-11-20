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
