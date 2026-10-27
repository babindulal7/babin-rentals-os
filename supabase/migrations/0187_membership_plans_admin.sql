-- =============================================================================
-- Migration 0187: Membership Plans Admin (T8-02, Law 3, Law 6, D21, D32)
--
-- Rulings & Invariants:
--   - Law 3: Nothing is deleted. Direct DELETE on membership_plans is refused by trigger.
--   - Law 6: Warehouse, Technician, Driver, Client are money-blind.
--   - Role permissions: Owner, Admin, Manager can save and retire plans.
--     Coordinator is read-only.
--   - Hard discount cap <= 25% (0005 check: membership_plans_discount_hard_cap).
--   - Audited: Every plan create, update, or status change writes an audit_events row.
-- =============================================================================

begin;

-- 1. Prevent hard DELETE on membership_plans (Law 3: never delete)
create or replace function public.prevent_membership_plans_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'GATE:membership_plan.delete.forbidden: Membership plans can never be deleted (Law 3). Retire the plan instead.'
    using errcode = '42501';
  return null;
end;
$$;

drop trigger if exists trg_prevent_membership_plans_delete on public.membership_plans;
create trigger trg_prevent_membership_plans_delete
  before delete on public.membership_plans
  for each row
  execute function public.prevent_membership_plans_delete();


-- 2. RPC: save_membership_plan (Create or Edit a membership plan)
create or replace function public.save_membership_plan(
  p_level text,
  p_label text,
  p_annual_fee numeric,
  p_individual_discount_pct numeric,
  p_bundle_discount_pct numeric,
  p_monthly_booking_limit int,
  p_simultaneous_rental_limit int,
  p_authorized_users int,
  p_default_credit_limit numeric,
  p_term_months int default 12,
  p_perks text[] default '{}',
  p_display_order int default null,
  p_client_uuid uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := auth_user_role();
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
  v_parsed_level membership_level;
  v_parsed_label membership_label;
  v_parsed_perks membership_perk[];
  v_next_order int;
  v_existing public.membership_plans%rowtype;
begin
  -- Authority check: Manager, Admin, Owner only
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:membership_plan.manage.forbidden: Only Manager, Admin or Owner can create or edit membership plans.'
      using errcode = '42501';
  end if;

  -- Validate level enum
  begin
    v_parsed_level := p_level::membership_level;
  exception when others then
    raise exception 'GATE:membership_plan.invalid_level: Level "%" is not a valid membership level.', p_level
      using errcode = '22P02';
  end;

  -- Validate label enum
  begin
    v_parsed_label := p_label::membership_label;
  exception when others then
    raise exception 'GATE:membership_plan.invalid_label: Label "%" is not a valid membership label.', p_label
      using errcode = '22P02';
  end;

  -- Validate discount caps (hard cap <= 25%)
  if p_individual_discount_pct is not null and (p_individual_discount_pct < 0 or p_individual_discount_pct > 25) then
    raise exception 'GATE:membership_plan.discount_cap: Individual discount cannot exceed 25%%.'
      using errcode = '23514';
  end if;
  if p_bundle_discount_pct is not null and (p_bundle_discount_pct < 0 or p_bundle_discount_pct > 25) then
    raise exception 'GATE:membership_plan.discount_cap: Bundle discount cannot exceed 25%%.'
      using errcode = '23514';
  end if;

  -- Validate term months
  if p_term_months is not null and p_term_months <= 0 then
    raise exception 'GATE:membership_plan.invalid_term: Term months must be positive.'
      using errcode = '23514';
  end if;

  -- Parse perks array
  if p_perks is not null and array_length(p_perks, 1) > 0 then
    v_parsed_perks := p_perks::membership_perk[];
  else
    v_parsed_perks := '{}'::membership_perk[];
  end if;

  -- Look up existing plan by level
  select * into v_existing from public.membership_plans where level = v_parsed_level;

  if found then
    v_plan_id := v_existing.id;
    update public.membership_plans
    set
      label = v_parsed_label,
      annual_fee = p_annual_fee,
      individual_discount_pct = p_individual_discount_pct,
      bundle_discount_pct = p_bundle_discount_pct,
      monthly_booking_limit = p_monthly_booking_limit,
      simultaneous_rental_limit = p_simultaneous_rental_limit,
      authorized_users = p_authorized_users,
      default_credit_limit = coalesce(p_default_credit_limit, 0),
      term_months = coalesce(p_term_months, 12),
      perks = v_parsed_perks,
      display_order = coalesce(p_display_order, v_existing.display_order),
      updated_at = now()
    where id = v_plan_id;

    -- Audit record for plan update
    insert into public.audit_events (
      action,
      entity_type,
      entity_id,
      actor_user_id,
      details,
      client_uuid
    ) values (
      'membership_plan.updated',
      'membership_plan',
      v_plan_id,
      v_user_id,
      jsonb_build_object(
        'level', p_level,
        'label', p_label,
        'annual_fee', p_annual_fee,
        'individual_discount_pct', p_individual_discount_pct,
        'bundle_discount_pct', p_bundle_discount_pct,
        'default_credit_limit', p_default_credit_limit,
        'term_months', p_term_months
      ),
      coalesce(p_client_uuid, gen_random_uuid())
    );
  else
    if p_display_order is null then
      select coalesce(max(display_order), 0) + 1 into v_next_order from public.membership_plans;
    else
      v_next_order := p_display_order;
    end if;

    insert into public.membership_plans (
      client_uuid,
      level,
      label,
      annual_fee,
      individual_discount_pct,
      bundle_discount_pct,
      monthly_booking_limit,
      simultaneous_rental_limit,
      authorized_users,
      default_credit_limit,
      term_months,
      perks,
      display_order,
      status
    ) values (
      coalesce(p_client_uuid, gen_random_uuid()),
      v_parsed_level,
      v_parsed_label,
      p_annual_fee,
      p_individual_discount_pct,
      p_bundle_discount_pct,
      p_monthly_booking_limit,
      p_simultaneous_rental_limit,
      p_authorized_users,
      coalesce(p_default_credit_limit, 0),
      coalesce(p_term_months, 12),
      v_parsed_perks,
      v_next_order,
      'Active'
    ) returning id into v_plan_id;

    -- Audit record for plan creation
    insert into public.audit_events (
      action,
      entity_type,
      entity_id,
      actor_user_id,
      details,
      client_uuid
    ) values (
      'membership_plan.created',
      'membership_plan',
      v_plan_id,
      v_user_id,
      jsonb_build_object(
        'level', p_level,
        'label', p_label,
        'annual_fee', p_annual_fee,
        'individual_discount_pct', p_individual_discount_pct,
        'bundle_discount_pct', p_bundle_discount_pct,
        'default_credit_limit', p_default_credit_limit,
        'term_months', p_term_months
      ),
      coalesce(p_client_uuid, gen_random_uuid())
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'plan_id', v_plan_id,
    'level', p_level,
    'status', 'Active'
  );
end;
$$;


-- 3. RPC: retire_membership_plan (Retire or Reactivate a membership plan)
create or replace function public.retire_membership_plan(
  p_plan_id uuid,
  p_retire boolean default true,
  p_client_uuid uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := auth_user_role();
  v_user_id uuid := auth.uid();
  v_plan public.membership_plans%rowtype;
  v_new_status membership_plan_status;
begin
  -- Authority check: Manager, Admin, Owner only
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:membership_plan.manage.forbidden: Only Manager, Admin or Owner can retire or reactivate membership plans.'
      using errcode = '42501';
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if not found then
    raise exception 'GATE:membership_plan.not_found: Membership plan with id % not found.', p_plan_id
      using errcode = 'P0002';
  end if;

  if p_retire then
    v_new_status := 'Retired';
    update public.membership_plans
    set
      status = 'Retired',
      retired_at = now(),
      updated_at = now()
    where id = p_plan_id;
  else
    v_new_status := 'Active';
    update public.membership_plans
    set
      status = 'Active',
      retired_at = null,
      updated_at = now()
    where id = p_plan_id;
  end if;

  -- Audit record for status change
  insert into public.audit_events (
    action,
    entity_type,
    entity_id,
    actor_user_id,
    details,
    client_uuid
  ) values (
    case when p_retire then 'membership_plan.retired' else 'membership_plan.reactivated' end,
    'membership_plan',
    p_plan_id,
    v_user_id,
    jsonb_build_object(
      'level', v_plan.level::text,
      'old_status', v_plan.status::text,
      'new_status', v_new_status::text
    ),
    coalesce(p_client_uuid, gen_random_uuid())
  );

  return jsonb_build_object(
    'ok', true,
    'plan_id', p_plan_id,
    'level', v_plan.level::text,
    'status', v_new_status::text
  );
end;
$$;

-- Grant execution to authenticated users (role checks are inside the functions)
grant execute on function public.save_membership_plan to authenticated;
grant execute on function public.retire_membership_plan to authenticated;

commit;
