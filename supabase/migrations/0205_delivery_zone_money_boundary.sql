-- 0205_delivery_zone_money_boundary.sql — T4-07 forward-only security repair
-- Do NOT apply directly to live. Verify on staging after migration reconciliation.
-- 0189 already exists on main; never rewrite an existing migration.
--
-- Law 6: floor/Driver seats can locate zones but cannot see fees.
-- Only Owner/Admin/Manager may create, edit or deactivate. Delete is forbidden.

drop policy if exists delivery_zones_read_staff on public.delivery_zones;
drop policy if exists delivery_zones_write_coordinator_plus on public.delivery_zones;
drop policy if exists delivery_zones_read_money on public.delivery_zones;
drop policy if exists delivery_zones_insert_management on public.delivery_zones;
drop policy if exists delivery_zones_update_management on public.delivery_zones;

-- A table SELECT includes fee_paisa, so only money-authorized roles may read it.
-- Floor roles use the explicitly masked list_delivery_zones() RPC instead.
create policy delivery_zones_read_money on public.delivery_zones
  for select to authenticated
  using (public.auth_can_view_money());

create policy delivery_zones_insert_management on public.delivery_zones
  for insert to authenticated
  with check (public.auth_user_role() in ('Owner','Admin','Manager'));

create policy delivery_zones_update_management on public.delivery_zones
  for update to authenticated
  using (public.auth_user_role() in ('Owner','Admin','Manager'))
  with check (public.auth_user_role() in ('Owner','Admin','Manager'));

-- No DELETE policy, including for management. Deactivate is the only removal.
-- Migration 0093 grants ALL by default to new tables, including TRUNCATE;
-- TRUNCATE bypasses RLS entirely. Revoke both destructive capabilities so
-- no client database role can physically erase zone rows.
revoke delete, truncate on public.delivery_zones from authenticated, anon, public;

-- Retain the public RPC signature and row shape for existing clients, but
-- deliberately return NULL fee_paisa for money-blind authenticated staff.
-- Table NOT NULL constraints only constrain stored rows, not function results.
create or replace function public.list_delivery_zones(
    p_limit int default 50,
    p_offset int default 0,
    p_active_only boolean default true
)
returns setof public.delivery_zones
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.auth_is_staff() then
    raise insufficient_privilege using message = 'Only staff can list delivery zones';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid zone pagination' using errcode = '22023';
  end if;

  return query
  select dz.id, dz.name, dz.description,
         case when public.auth_can_view_money() then dz.fee_paisa else null::bigint end,
         dz.is_active, dz.created_at, dz.updated_at
  from public.delivery_zones dz
  where not coalesce(p_active_only, true) or dz.is_active
  order by dz.name asc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_delivery_zone_fee(p_zone_name text)
returns bigint
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_fee bigint;
begin
  if not public.auth_is_staff() then
    raise insufficient_privilege using message = 'Only staff can query delivery zone fees';
  end if;
  if not public.auth_can_view_money() then
    return null; -- no zone-dependent money disclosure to floor/Driver roles
  end if;

  select dz.fee_paisa into v_fee
  from public.delivery_zones dz
  where dz.name = p_zone_name and dz.is_active;
  if v_fee is null then
    raise exception 'Zone not found or inactive: %', p_zone_name using errcode = 'no_data';
  end if;
  return v_fee;
end;
$$;

-- Replace RPC-level role checks as well: SECURITY DEFINER bypasses the table's RLS.
create or replace function public.create_delivery_zone(
    p_name text, p_description text, p_fee_paisa bigint
)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_zone_id uuid;
begin
  if public.auth_user_role() not in ('Owner','Admin','Manager') or public.auth_user_role() is null then
    raise insufficient_privilege using message = 'Only Owner, Admin or Manager can create delivery zones';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'Zone name cannot be empty' using errcode = 'check_violation';
  end if;
  if p_fee_paisa is null or p_fee_paisa < 0 then
    raise exception 'Zone fee must be non-negative' using errcode = 'check_violation';
  end if;

  insert into public.delivery_zones (name, description, fee_paisa)
  values (trim(p_name), nullif(trim(p_description), ''), p_fee_paisa)
  returning id into v_zone_id;
  return v_zone_id;
end;
$$;

create or replace function public.update_delivery_zone(
    p_zone_id uuid, p_name text default null,
    p_description text default null, p_fee_paisa bigint default null,
    p_is_active boolean default null
)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_count int;
begin
  if public.auth_user_role() not in ('Owner','Admin','Manager') or public.auth_user_role() is null then
    raise insufficient_privilege using message = 'Only Owner, Admin or Manager can update delivery zones';
  end if;
  if p_fee_paisa is not null and p_fee_paisa < 0 then
    raise exception 'Zone fee must be non-negative' using errcode = 'check_violation';
  end if;
  update public.delivery_zones
  set name = coalesce(nullif(trim(p_name), ''), name),
      description = coalesce(nullif(trim(p_description), ''), description),
      fee_paisa = coalesce(p_fee_paisa, fee_paisa),
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_zone_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.deactivate_delivery_zone(p_zone_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_count int;
begin
  if public.auth_user_role() not in ('Owner','Admin','Manager') or public.auth_user_role() is null then
    raise insufficient_privilege using message = 'Only Owner, Admin or Manager can deactivate delivery zones';
  end if;
  update public.delivery_zones set is_active = false, updated_at = now()
  where id = p_zone_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.list_delivery_zones(int, int, boolean) from anon, public;
revoke all on function public.get_delivery_zone_fee(text) from anon, public;
revoke all on function public.create_delivery_zone(text, text, bigint) from anon, public;
revoke all on function public.update_delivery_zone(uuid, text, text, bigint, boolean) from anon, public;
revoke all on function public.deactivate_delivery_zone(uuid) from anon, public;
grant execute on function public.list_delivery_zones(int, int, boolean) to authenticated;
grant execute on function public.get_delivery_zone_fee(text) to authenticated;
grant execute on function public.create_delivery_zone(text, text, bigint) to authenticated;
grant execute on function public.update_delivery_zone(uuid, text, text, bigint, boolean) to authenticated;
grant execute on function public.deactivate_delivery_zone(uuid) to authenticated;
