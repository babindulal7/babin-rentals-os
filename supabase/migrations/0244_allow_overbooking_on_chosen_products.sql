-- 0244_allow_overbooking_on_chosen_products.sql
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

  -- If resolving an overbooking shortage, clear short_quantity on the booking line
  if v_row.cause = 'overbooking_shortage' then
    update public.booking_lines
       set short_quantity = 0
     where booking_id = v_row.booking_id
       and (product_id = v_row.product_id or v_row.product_id is null)
       and voided_at is null;
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
