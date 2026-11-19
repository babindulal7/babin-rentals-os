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

create function public.create_delivery_zone(
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
