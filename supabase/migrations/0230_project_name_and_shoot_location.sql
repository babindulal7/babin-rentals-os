-- =============================================================================
-- 0230_project_name_and_shoot_location.sql
--
-- T3-26 · Project name and shoot location on every booking (B8, B52)
-- Two fields on every booking:
--  - Project / production name (e.g. "Kathmandu Diaries — music video")
--  - Shoot location (e.g. "Pokhara, Phewa lake")
-- Up to 120 characters each.
-- create_booking accepts both; the invoice snapshot carries the project name;
-- an issued invoice keeps the name it was issued with.
-- =============================================================================

begin;

-- 1. Add columns to bookings
alter table public.bookings
  add column if not exists project_name text,
  add column if not exists shoot_location text;

alter table public.bookings
  drop constraint if exists bookings_project_name_length,
  add constraint bookings_project_name_length check (project_name is null or length(btrim(project_name)) <= 120);

alter table public.bookings
  drop constraint if exists bookings_shoot_location_length,
  add constraint bookings_shoot_location_length check (shoot_location is null or length(btrim(shoot_location)) <= 120);

-- Backfill project_name from existing project
update public.bookings
   set project_name = left(btrim(project), 120)
 where project_name is null and project is not null;

-- Trigger to keep project and project_name synced on bookings
create or replace function public.trg_sync_booking_project_name()
returns trigger
language plpgsql
as $$
begin
  if new.project_name is not null and new.project is null then
    new.project := new.project_name;
  elsif new.project is not null and new.project_name is null then
    new.project_name := left(btrim(new.project), 120);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_sync_project_name on public.bookings;
create trigger trg_bookings_sync_project_name
  before insert or update on public.bookings
  for each row
  execute function public.trg_sync_booking_project_name();

-- 2. Add project_name snapshot column to invoices
alter table public.invoices
  add column if not exists project_name text;

alter table public.invoices
  drop constraint if exists invoices_project_name_length,
  add constraint invoices_project_name_length check (project_name is null or length(btrim(project_name)) <= 120);

update public.invoices i
   set project_name = coalesce(b.project_name, left(btrim(b.project), 120))
  from public.bookings b
 where i.booking_id = b.id
   and i.project_name is null
   and (b.project_name is not null or b.project is not null);

-- Invoice snapshot trigger: BEFORE INSERT
create or replace function public.trg_snapshot_invoice_project_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.project_name is null and new.booking_id is not null then
    select coalesce(b.project_name, left(btrim(b.project), 120))
      into new.project_name
      from public.bookings b
     where b.id = new.booking_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_snapshot_project_name on public.invoices;
create trigger trg_invoices_snapshot_project_name
  before insert on public.invoices
  for each row
  execute function public.trg_snapshot_invoice_project_name();

-- Invoice immutability trigger: BEFORE UPDATE (B52)
create or replace function public.trg_guard_invoice_project_name_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'Draft' and new.project_name is distinct from old.project_name then
    raise exception 'GATE:gate.invoice.project_name_immutable|An issued invoice keeps the project name it was issued with'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_invoice_project_name_immutable on public.invoices;
create trigger trg_guard_invoice_project_name_immutable
  before update on public.invoices
  for each row
  execute function public.trg_guard_invoice_project_name_immutable();

-- 3. Law 6 column-level SELECT grants
grant select (project_name, shoot_location) on public.bookings to authenticated;
grant select (project_name) on public.invoices to authenticated;

-- 4. create_booking(jsonb) with project_name and shoot_location
create or replace function public.create_booking(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_client_uuid     uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id     uuid;
  v_existing_no     text;
  v_existing_stage  text;
  v_booking_id      uuid;
  v_booking_no      text;
  v_actor           uuid := (p_payload ->> 'created_by')::uuid;
  v_branch          uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines           jsonb;
  v_line            jsonb;
  v_discount        jsonb;
  v_audit_id        uuid;
  v_line_count      integer := 0;
  v_unit_count      integer := 0;
  v_pending         jsonb;
  v_next            jsonb;
  v_parent_key      uuid;
  v_parent_id       uuid;
  v_wrote           integer;
  v_line_id         uuid;
  v_unit            jsonb;
  v_asset_product   uuid;
  v_dupe_assets     integer;
  v_base_rate       numeric;
  v_payload_rate    numeric;
  v_final_rate      numeric;
  v_rate_overridden boolean;
  /* 0168 */
  v_payload_total     numeric;
  v_payload_breakdown jsonb;
  v_final_total       numeric;
  v_line_qty          integer;
  v_line_days         integer;
  v_line_discount     numeric;
  v_computed_total    numeric;
  /* 0132 */
  v_crew            jsonb;
  v_transport       jsonb;
  v_crew_count      integer := 0;
  v_transport_written boolean := false;
  /* 0144 */
  v_project_type       text := nullif(btrim(p_payload ->> 'project_type'), '');
  v_project_type_other text := nullif(btrim(p_payload ->> 'project_type_other'), '');
  /* 0229 */
  v_project_name       text := nullif(btrim(coalesce(p_payload ->> 'project_name', p_payload ->> 'project', '')), '');
  v_shoot_location     text := nullif(btrim(coalesce(p_payload ->> 'shoot_location', '')), '');
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  /* 0229 length validation */
  if length(v_project_name) > 120 then
    raise exception 'create_booking: project_name must be 120 characters or fewer. Nothing was created.'
      using errcode = '22026';
  end if;
  if length(v_shoot_location) > 120 then
    raise exception 'create_booking: shoot_location must be 120 characters or fewer. Nothing was created.'
      using errcode = '22026';
  end if;

  -- ── 0144 project-type validation, BEFORE anything is written ──────────────
  if v_project_type is not null and v_project_type not in (
    'Feature Film',
    'Short Film',
    'Documentary',
    'Commercial / Advertisement',
    'Music Video',
    'Corporate',
    'Wedding',
    'Event',
    'TV / Broadcast',
    'Web / Digital Content',
    'Photography',
    'Student Project',
    'Personal / Test Shoot',
    'Rental House / Sub-rental',
    'Other'
  ) then
    raise exception 'create_booking: project_type "%" is not an allowed value. Nothing was created.', v_project_type;
  end if;
  if v_project_type_other is not null and v_project_type <> 'Other' then
    raise exception 'create_booking: project_type_other is only used with project_type Other. Nothing was created.';
  end if;
  if v_project_type = 'Other' and v_project_type_other is null then
    raise exception 'create_booking: project_type Other requires project_type_other. Nothing was created.';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id',     v_existing_id,
      'booking_no',     v_existing_no,
      'stage',          v_existing_stage,
      'project_name',   v_project_name,
      'shoot_location', v_shoot_location,
      'replayed',       true
    );
  end if;

  -- Mark transaction as inside create_booking so the lines guard admits our writes
  perform set_config('app.in_create_booking', 'on', true);

  -- Never let money-blind callers override VAT (including selecting 0%).
  if p_payload ? 'vat_rate' and not coalesce(auth_can_view_money(), false) then
    raise exception 'GATE:gate.vat.money_blind|Only authorized money-visible staff can select a booking VAT rate'
      using errcode = '42501';
  end if;

  -- ── Discount gate for money-blind callers (Law 6) ─────────────────────────
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
      using errcode = 'P0001';
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, project_name, shoot_location, project_type, project_type_other, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    vat_rate, created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    coalesce(v_project_name, p_payload ->> 'project'),
    v_project_name,
    v_shoot_location,
    v_project_type,
    v_project_type_other,
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    case when p_payload ? 'vat_rate' then (p_payload ->> 'vat_rate')::numeric else null end,
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ────────────────────────────────────────────
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;
  end loop;

  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) u;
  if coalesce(v_dupe_assets, 0) > 0 then
    raise exception 'create_booking: the same asset cannot be assigned to multiple lines. Nothing was created.';
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_next := '[]'::jsonb;
    v_wrote := 0;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;

      if v_parent_key is null then
        v_parent_id := null;
      else
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      -- ── S1-7: Line pricing calculation ─────────────────────────────────────
      if v_parent_id is not null or coalesce((v_line ->> 'is_included')::boolean, false) then
        v_base_rate := 0;
      elsif (v_line ->> 'product_id') is not null or (v_line ->> 'bundle_id') is not null then
        v_base_rate := get_model_daily_rate((v_line ->> 'product_id')::uuid, (v_line ->> 'bundle_id')::uuid);
      else
        v_base_rate := coalesce((v_line ->> 'rate')::numeric, 0);
      end if;

      v_payload_rate := (v_line ->> 'rate')::numeric;
      v_rate_overridden := false;

      if auth_can_view_money() then
        if v_payload_rate is not null then
          v_final_rate := v_payload_rate;
          if v_base_rate is not null and v_final_rate <> v_base_rate then
            v_rate_overridden := true;
          end if;
        else
          v_final_rate := coalesce(v_base_rate, 0);
        end if;
      else
        -- Money-blind caller: silently use server price
        v_final_rate := coalesce(v_base_rate, 0);
        v_rate_overridden := false;

        if v_payload_rate is not null and v_payload_rate <> v_final_rate then
          insert into audit_events (
            id, client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, branch_id, reason, new_values
          )
          values (
            gen_random_uuid(),
            gen_random_uuid(),
            'override',
            'Rentals',
            'Rentals',
            'price.server_applied',
            'Informational',
            'Success',
            'booking_lines',
            v_booking_id,
            v_actor,
            v_branch,
            'Server-side price applied for money-blind caller (Law 6)',
            jsonb_build_object(
              'booking_no',   v_booking_no,
              'product_id',   v_line ->> 'product_id',
              'payload_rate', v_payload_rate,
              'applied_rate', v_final_rate
            )
          );
        end if;
      end if;

      -- ── 0168: Line total + price breakdown (G3) ──────────────────────────
      v_line_qty      := greatest(1, coalesce((v_line ->> 'qty')::integer, 1));
      v_line_days     := greatest(1, (v_line ->> 'days')::integer);
      v_line_discount := case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end;
      v_computed_total := greatest(0, v_line_qty * v_line_days * v_final_rate - v_line_discount);

      v_payload_total := (v_line ->> 'line_total')::numeric;
      v_payload_breakdown := v_line -> 'price_breakdown';

      if not auth_can_view_money() then
        v_final_total := v_computed_total;
        v_payload_breakdown := null;
      elsif v_payload_total is not null then
        if v_payload_total < 0 then
          raise exception 'create_booking: line % carries a negative line_total %. Nothing was created.', v_line ->> 'client_uuid', v_payload_total;
        end if;
        if v_payload_total <> round(v_payload_total, 2) then
          raise exception 'create_booking: line % line_total % is not a whole-paisa figure. Nothing was created.', v_line ->> 'client_uuid', v_payload_total;
        end if;
        if v_payload_breakdown is not null and jsonb_typeof(v_payload_breakdown) <> 'object' then
          raise exception 'create_booking: line % price_breakdown must be a JSON object. Nothing was created.', v_line ->> 'client_uuid';
        end if;
        v_final_total := v_payload_total;
      else
        if v_payload_breakdown is not null then
          raise exception 'create_booking: line % carries a price_breakdown with no line_total. Nothing was created.', v_line ->> 'client_uuid';
        end if;
        v_final_total := v_computed_total;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by,
        rate_overridden, line_total, price_breakdown
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        v_final_rate,
        case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end,
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        case when auth_can_view_money() then (v_line ->> 'supplier_cost')::numeric else null end,
        case when auth_can_view_money() then (v_line ->> 'markup_amount')::numeric else null end,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor,
        v_rate_overridden,
        v_final_total,
        v_payload_breakdown
      )
      returning id into v_line_id;

      -- ── D5: creation-time unit assignment ───────────────────────────────
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      (v_discount ->> 'discount_source')::discount_source,
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  -- ── Crew (0132) ───────────────────────────────────────────────────────────
  for v_crew in select * from jsonb_array_elements(coalesce(p_payload -> 'crew', '[]'::jsonb))
  loop
    if v_crew ->> 'client_uuid' is null then
      raise exception 'create_booking: every crew row needs its own client_uuid (Law 8, one per ROW)';
    end if;

    insert into booking_crew_lines (
      client_uuid, booking_id, crew_member_id, name, crew_role, phone,
      day_rate, days, overtime, accommodation, meals, created_by
    )
    values (
      (v_crew ->> 'client_uuid')::uuid,
      v_booking_id,
      (v_crew ->> 'crew_member_id')::uuid,
      v_crew ->> 'name',
      (v_crew ->> 'crew_role')::crew_role,
      v_crew ->> 'phone',
      coalesce((v_crew ->> 'day_rate')::numeric, 0),
      (v_crew ->> 'days')::integer,
      coalesce((v_crew ->> 'overtime')::numeric, 0),
      coalesce((v_crew ->> 'accommodation')::numeric, 0),
      coalesce((v_crew ->> 'meals')::numeric, 0),
      v_actor
    );
    v_crew_count := v_crew_count + 1;
  end loop;

  -- ── Transport (0132) ──────────────────────────────────────────────────────
  if jsonb_typeof(p_payload -> 'transport') = 'object' then
    v_transport := p_payload -> 'transport';
    if v_transport ->> 'client_uuid' is null then
      raise exception 'create_booking: the transport row needs its own client_uuid (Law 8)';
    end if;

    insert into booking_transport (
      client_uuid, booking_id, delivery_charge, fuel_charge,
      vehicle, number_plate, driver_contact, special_instructions, created_by
    )
    values (
      (v_transport ->> 'client_uuid')::uuid,
      v_booking_id,
      coalesce((v_transport ->> 'delivery_charge')::numeric, 0),
      coalesce((v_transport ->> 'fuel_charge')::numeric, 0),
      v_transport ->> 'vehicle',
      v_transport ->> 'number_plate',
      v_transport ->> 'driver_contact',
      v_transport ->> 'special_instructions',
      v_actor
    );
    v_transport_written := true;
  end if;

  return jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_no',        v_booking_no,
    'stage',             'Quote',
    'line_count',        v_line_count,
    'unit_count',        v_unit_count,
    'crew_lines',        v_crew_count,
    'transport_written', v_transport_written,
    'project_name',      v_project_name,
    'shoot_location',    v_shoot_location,
    'replayed',          false
  );
end;
$$;

comment on function public.create_booking(jsonb) is
'0229: Atomic booking insertion supporting project_name and shoot_location up to 120 chars each alongside project_type.';

revoke execute on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- 5. create_invoice(jsonb) updated to report project_name in return payload
create or replace function public.create_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_client_uuid  uuid    := (p_payload ->> 'client_uuid')::uuid;
  v_actor        uuid    := (p_payload ->> 'created_by')::uuid;
  v_booking_no   text    := nullif(btrim(coalesce(p_payload ->> 'booking_no', '')), '');
  v_booking_key  uuid    := (p_payload ->> 'booking_id')::uuid;
  v_vat_rate     numeric := (p_payload ->> 'vat_rate')::numeric;
  v_notes        text    := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_role         system_role;
  v_existing     invoices%rowtype;
  v_booking_id   uuid;
  v_resolved_no  text;
  v_client_id    uuid;
  v_branch_id    uuid;
  v_cancelled    timestamptz;
  v_terms        text;
  v_term_days    integer;
  v_due_date     date;
  v_discounts    integer;
  v_booking_vat_rate numeric(5,4);
  v_percent      numeric := 0;
  v_prior        record;
  v_invoice_id   uuid;
  v_line_count   integer := 0;
  v_written      integer;
  v_totals       invoices%rowtype;
begin
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'create_invoice: this session (%) may not raise an invoice. R-05 gives that to Owner, Admin, Manager and Accounts. Nothing was created.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if not auth_can_view_money() then
    raise exception
      'create_invoice: this session cannot read money (Law 6), so the invoice it raised would bill nothing. Nothing was created.'
      using errcode = '42501';
  end if;

  if v_client_uuid is null then
    raise exception 'create_invoice: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_invoice: created_by is required; there is no system actor';
  end if;

  select * into v_existing from invoices where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'invoice_id',      v_existing.id,
      'invoice_no',      v_existing.invoice_no,
      'status',          v_existing.status,
      'booking_id',      v_existing.booking_id,
      'booking_no',      (select booking_no from bookings where id = v_existing.booking_id),
      'client_id',       v_existing.client_id,
      'due_date',        v_existing.due_date,
      'line_count',      (select count(*) from invoice_lines where invoice_id = v_existing.id),
      'subtotal',        v_existing.subtotal,
      'discount_amount', v_existing.discount_amount,
      'taxable_amount',  v_existing.taxable_amount,
      'vat_amount',      v_existing.vat_amount,
      'total',           v_existing.total_amount,
      'project_name',    v_existing.project_name,
      'replayed',        true
    );
  end if;

  if v_booking_key is null and v_booking_no is null then
    raise exception 'create_invoice: an invoice must name the booking it bills (booking_id or booking_no).';
  end if;

  select b.id, b.booking_no, b.client_id, b.branch_id, b.cancelled_at
    into v_booking_id, v_resolved_no, v_client_id, v_branch_id, v_cancelled
    from bookings b
   where (v_booking_key is not null and b.id = v_booking_key)
      or (v_booking_key is null and b.booking_no = v_booking_no);

  if not found then
    raise exception
      'create_invoice: no booking % exists, so there is nothing to invoice and nothing was created.',
      coalesce(v_booking_key::text, v_booking_no);
  end if;

  if v_cancelled is not null then
    raise exception
      'create_invoice: booking % was cancelled on %. Whether a cancellation carries a fee is an open ruling (PLAN.md §4.16), so nothing was created.',
      v_resolved_no, v_cancelled::date;
  end if;

  select invoice_no as prior_no, status::text as prior_status into v_prior
    from invoices where booking_id = v_booking_id limit 1;
  if found then
    raise exception
      'create_invoice: booking % already has an invoice (%, %). One invoice per rental — damage and late fees append as lines to the existing Draft, and corrections after issue are Void + Credit Note. Nothing was created.',
      v_resolved_no, coalesce(v_prior.prior_no, 'a Draft'), v_prior.prior_status;
  end if;

  select payment_terms::text into v_terms from clients where id = v_client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := current_date + v_term_days;

  select count(*), coalesce(sum(percent),0)
    into v_discounts, v_percent
    from public.booking_discounts where booking_id = v_booking_id;
  if v_percent < 0 or v_percent > 100 then
    raise exception 'Invalid booking discount %', v_percent using errcode = '23514';
  end if;

  select b.vat_rate into v_booking_vat_rate from public.bookings b where b.id = v_booking_id;
  if v_booking_vat_rate is not null then
    v_vat_rate := v_booking_vat_rate;
  end if;

  -- The BEFORE INSERT trigger trg_invoices_snapshot_project_name automatically
  -- snapshots coalesce(b.project_name, left(btrim(b.project), 120)) from bookings into project_name
  insert into invoices (
    client_uuid, booking_id, client_id, branch_id, status,
    due_date, currency, discount_percent, vat_rate, notes,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_id,
    v_client_id,
    v_branch_id,
    'Draft',
    v_due_date,
    'NPR',
    coalesce(v_percent, 0),
    coalesce(v_vat_rate, 0.1300),
    v_notes,
    v_actor,
    v_actor
  )
  returning id into v_invoice_id;

  -- (1) Equipment and bundles from booking_lines
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order,
    price_breakdown
  )
  select
    bl.client_uuid,
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
  where bl.booking_id = v_booking_id
    and bl.voided_at is null;

  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (2) Crew from booking_crew_lines
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bcl.client_uuid,
    v_invoice_id,
    'Services'::line_kind,
    coalesce(nullif(btrim(bcl.name), ''), bcl.crew_role::text) || ' — ' || bcl.crew_role::text,
    1,
    greatest(1, bcl.days),
    round((bcl.day_rate * greatest(1, bcl.days) + coalesce(bcl.overtime, 0) + coalesce(bcl.accommodation, 0) + coalesce(bcl.meals, 0)) / greatest(1, bcl.days), 2),
    round(bcl.day_rate * greatest(1, bcl.days) + coalesce(bcl.overtime, 0) + coalesce(bcl.accommodation, 0) + coalesce(bcl.meals, 0), 2),
    0,
    1000 + row_number() over (order by bcl.created_at)
  from booking_crew_lines bcl
  where bcl.booking_id = v_booking_id;

  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (3) Transport from booking_transport
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bt.client_uuid,
    v_invoice_id,
    'Services'::line_kind,
    'Transport — ' || coalesce(nullif(btrim(bt.vehicle), ''), 'Vehicle') || coalesce(' (' || nullif(btrim(bt.number_plate), '') || ')', ''),
    1,
    1,
    round(coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0), 2),
    round(coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0), 2),
    0,
    2000
  from booking_transport bt
  where bt.booking_id = v_booking_id
    and (coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0)) > 0;

  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  select * into v_totals from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',      v_totals.id,
    'invoice_no',      v_totals.invoice_no,
    'status',          v_totals.status,
    'booking_id',      v_booking_id,
    'booking_no',      v_resolved_no,
    'client_id',       v_client_id,
    'due_date',        v_totals.due_date,
    'line_count',      v_line_count,
    'subtotal',        v_totals.subtotal,
    'discount_amount', v_totals.discount_amount,
    'taxable_amount',  v_totals.taxable_amount,
    'vat_amount',      v_totals.vat_amount,
    'total',           v_totals.total_amount,
    'project_name',    v_totals.project_name,
    'replayed',        false
  );
end;
$$;

comment on function public.create_invoice(jsonb) is
'0229: Atomic invoice creation carrying project_name snapshot from booking.';

revoke execute on function public.create_invoice(jsonb) from public, anon;
grant execute on function public.create_invoice(jsonb) to authenticated;

commit;
