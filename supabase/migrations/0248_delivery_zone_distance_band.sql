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
