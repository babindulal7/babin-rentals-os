-- 0164 - Finance: stacked discounts and booking VAT pinning
-- Based on inspected, currently live function definitions, without live writes.
-- DO NOT APPLY LIVE without an independently verified restorable backup
-- and migration reconciliation. See DEPLOYMENT.md N-5.
begin;
alter table public.bookings add column if not exists vat_rate numeric(5,4);
do $$ begin
  if not exists (select 1 from pg_constraint where conname='bookings_vat_rate_fraction' and conrelid='public.bookings'::regclass) then
    alter table public.bookings add constraint bookings_vat_rate_fraction
      check(vat_rate is null or (vat_rate>=0 and vat_rate<=1));
  end if;
end $$;

-- VAT is financial data. The RPC validates callers but PostgreSQL also
-- exposes an authorized table write path. Enforce the same rule at that boundary,
-- including INSERT of a new booking and UPDATE of an existing quotation.
create or replace function public.guard_booking_vat_write()
returns trigger
language plpgsql
set search_path=public, pg_temp
as $vat_guard$
begin
  if current_user not in ('authenticated','anon') then
    return new;
  end if;

  if tg_op='INSERT' then
    if new.vat_rate is not null and not coalesce(auth_can_view_money(),false) then
      raise exception 'GATE:gate.vat.money_blind|This staff role cannot set booking VAT'
        using errcode='42501';
    end if;
  elsif new.vat_rate is distinct from old.vat_rate then
    if not coalesce(auth_can_view_money(),false) then
      raise exception 'GATE:gate.vat.money_blind|This staff role cannot change booking VAT'
        using errcode='42501';
    end if;
    if old.stage <> 'Quote' or exists (
      select 1 from public.invoices i
      where i.booking_id=old.id
    ) then
      raise exception 'GATE:gate.vat.locked|Booking VAT is fixed after Quote or invoicing'
        using errcode='23514';
    end if;
  end if;
  return new;
end;
$vat_guard$;

drop trigger if exists trg_bookings_vat_write_guard on public.bookings;
create trigger trg_bookings_vat_write_guard
before insert or update on public.bookings
for each row execute function public.guard_booking_vat_write();
revoke all on function public.guard_booking_vat_write() from public, anon;

CREATE OR REPLACE FUNCTION public.booking_estimate_total(p_booking_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lines_subtotal numeric(14,2) := 0;
  v_crew_subtotal numeric(14,2) := 0;
  v_transport_subtotal numeric(14,2) := 0;
  v_subtotal numeric(14,2) := 0;
  v_percent numeric(5,2) := 0;
  v_vat_rate numeric(5,4) := 0.1300;
  v_invoice_total numeric(14,2);
  v_discount numeric(14,2) := 0;
  v_taxable numeric(14,2) := 0;
  v_vat numeric(14,2) := 0;
begin
  if p_booking_id is null then return 0; end if;
  -- An issued/draft non-voided invoice is the authoritative payment ceiling.
  select i.total_amount into v_invoice_total from public.invoices i
    where i.booking_id=p_booking_id and i.voided_at is null
    order by i.created_at desc limit 1;
  if found then return v_invoice_total; end if;
  -- A null pinned VAT is a legacy booking: preserve previous 13% behavior.
  select coalesce(b.vat_rate,0.1300) into v_vat_rate
    from public.bookings b where b.id=p_booking_id;

  select coalesce(sum(greatest(0, greatest(1, qty) * greatest(1, days) * rate - coalesce(discount_amount, 0))), 0)
    into v_lines_subtotal
    from booking_lines
   where booking_id = p_booking_id
     and voided_at is null;

  select coalesce(sum(day_rate * greatest(1, days) + coalesce(overtime, 0) + coalesce(accommodation, 0) + coalesce(meals, 0)), 0)
    into v_crew_subtotal
    from booking_crew_lines
   where booking_id = p_booking_id
     and voided_at is null;

  select coalesce(sum(coalesce(delivery_charge, 0) + coalesce(fuel_charge, 0)), 0)
    into v_transport_subtotal
    from booking_transport
   where booking_id = p_booking_id
     and (coalesce(delivery_charge, 0) + coalesce(fuel_charge, 0)) > 0;

  v_subtotal := v_lines_subtotal + v_crew_subtotal + v_transport_subtotal;

  select coalesce(sum(percent), 0)
    into v_percent
    from booking_discounts
   where booking_id = p_booking_id;

  if v_percent < 0 or v_percent > 100 then raise exception 'Invalid booking discount %',v_percent; end if;
  v_discount:=public.invoice_discount_amount(v_subtotal,v_percent);
  v_taxable:=v_subtotal-v_discount;
  v_vat:=public.invoice_vat_amount(v_taxable,v_vat_rate);

  return v_taxable + v_vat;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_booking(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  /* 0132 */
  v_crew            jsonb;
  v_transport       jsonb;
  v_crew_count      integer := 0;
  v_transport_written boolean := false;
  /* 0144 */
  v_project_type       text := nullif(btrim(p_payload ->> 'project_type'), '');
  v_project_type_other text := nullif(btrim(p_payload ->> 'project_type_other'), '');
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
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
      'booking_id', v_existing_id,
      'booking_no', v_existing_no,
      'stage',      v_existing_stage,
      'replayed',   true
    );
  end if;

  -- Mark transaction as inside create_booking so the lines guard admits our writes
  perform set_config('app.in_create_booking', 'on', true);

  -- Never let money-blind callers override VAT (including selecting 0%).
  if p_payload ? 'vat_rate' and not coalesce(auth_can_view_money(),false) then
    raise exception 'GATE:gate.vat.money_blind|Only authorized money-visible staff can select a booking VAT rate'
      using errcode='42501';
  end if;

  -- ── Discount gate for money-blind callers (Law 6) ─────────────────────────
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
      using errcode = 'P0001';
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, project_type, project_type_other, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    vat_rate, created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    p_payload ->> 'project',
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
    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) as l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) as u;
  if v_dupe_assets > 0 then
    raise exception
      'create_booking: the same physical unit appears % extra time(s) across this booking''s units. Nothing was created.',
      v_dupe_assets;
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
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

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by,
        rate_overridden
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
        v_rate_overridden
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

  -- ── Crew (0132) — inside the transaction, or the booking does not exist ──
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

  -- ── Transport (0132) — the one row `booking_transport_booking_id_key` allows ──
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
    'replayed',          false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- ── Rights, first, before anything is read ────────────────────────────────
  -- R-05: Owner · Admin · Manager · Accounts may raise an invoice. This is the
  -- gate, because definer rights mean RLS will not be. It repeats 0086's four
  -- policies on purpose; the post-conditions below prove the two agree by
  -- calling this function as a Coordinator and as Warehouse.
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'create_invoice: this session (%) may not raise an invoice. R-05 gives that to Owner, Admin, Manager and Accounts. Nothing was created.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- Law 6. Redundant while auth_can_view_money() excludes exactly the roles
  -- R-05 omits, and kept so that it stays true if either definition moves. A
  -- money-blind caller is refused by name rather than billing zero.
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

  -- ── Law 8 replay check, BEFORE anything is written ────────────────────────
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
      'replayed',        true
    );
  end if;

  -- ── The booking this bills ────────────────────────────────────────────────
  -- Either key is accepted; `booking_no` is what the operator saw on screen and
  -- what the action holds, `booking_id` is what a server-side caller holds.
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

  -- A cancelled booking is not invoiced from here. Whether a cancellation
  -- carries a fee is explicitly unruled (PLAN.md §4.16), so this refuses rather
  -- than deciding it — the same position `createInvoice.ts` took.
  if v_cancelled is not null then
    raise exception
      'create_invoice: booking % was cancelled on %. Whether a cancellation carries a fee is an open ruling (PLAN.md §4.16), so nothing was created.',
      v_resolved_no, v_cancelled::date;
  end if;

  -- ── R-03 · one invoice per rental ─────────────────────────────────────────
  -- Checked after the replay check, so a genuine retry of the same press is a
  -- replay and only a SECOND intent is refused. Refuses on ANY existing
  -- invoice including a voided one, which is stricter than SPEC-P0-1 §3.1's
  -- "no non-Void invoice": the line keys are the booking rows' own client_uuids
  -- (see the header), so a second invoice over the same booking would collide
  -- on invoice_lines_client_uuid_key partway through. Re-invoicing after a void
  -- needs its own key strategy and its own ruling; refusing is the honest
  -- interim. TODO(decision) — re-invoicing a booking whose only invoice was
  -- voided (MONEY-07).
  -- Aliased so the record's field names are unmistakable; an unaliased
  -- `status::text` is still called `status`, which reads like the column and is
  -- not one.
  select invoice_no as prior_no, status::text as prior_status into v_prior
    from invoices where booking_id = v_booking_id limit 1;
  if found then
    raise exception
      'create_invoice: booking % already has an invoice (%, %). One invoice per rental — damage and late fees append as lines to the existing Draft, and corrections after issue are Void + Credit Note. Nothing was created.',
      v_resolved_no, coalesce(v_prior.prior_no, 'a Draft'), v_prior.prior_status;
  end if;

  -- ── The due date, from the client's payment terms ─────────────────────────
  -- `clients.payment_terms` is an enum whose labels ARE the rule; this is not a
  -- policy decision restated in SQL. NOT NULL DEFAULT 'Immediate', so the
  -- coalesce is a belt, and Immediate (due today) is the safe direction: it is
  -- visible and correctable, where a wrong 30 grants credit nobody agreed to.
  select payment_terms::text into v_terms from clients where id = v_client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := current_date + v_term_days;

  -- Several audited discount rows add into one invoice discount percentage.
  select count(*), coalesce(sum(percent),0)
    into v_discounts, v_percent
    from public.booking_discounts where booking_id=v_booking_id;
  if v_percent < 0 or v_percent > 100 then
    raise exception 'Invalid booking discount %', v_percent using errcode='23514';
  end if;
  -- New bookings pin a VAT fraction; legacy bookings retain supplied invoice VAT.
  select b.vat_rate into v_booking_vat_rate from public.bookings b where b.id=v_booking_id;
  -- The booking's pinned tax mode is authoritative, including zero VAT.
  -- The caller's current Settings value might have changed since the Quote;
  -- do not let the later device setting reprice the client's agreed booking.
  if v_booking_vat_rate is not null then
    v_vat_rate:=v_booking_vat_rate;
  end if;
  -- ── The header ────────────────────────────────────────────────────────────
  -- `invoice_no` and `issue_date` are OMITTED, not set to null: the column list
  -- is what documents the intent (R-15). 0086 makes both nullable and adds
  -- `invoices_issued_together` so a half-issued row cannot exist.
  -- The money columns keep their zero defaults; the trigger owns them.
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
    -- numeric(5,4) — a FRACTION, not a percentage. 13% arrives as 0.1300.
    coalesce(v_vat_rate, 0.1300),
    v_notes,
    v_actor,
    v_actor
  )
  returning id into v_invoice_id;

  -- ── The lines: a snapshot, not a join ─────────────────────────────────────
  -- SPEC-P0-1 §3.1: the rate card is pinned per booking, so the figures are
  -- COPIED here and never re-derived from `products` afterwards.
  --
  -- `line_total` carries each line's NET figure, because
  -- `recalculate_invoice_totals` derives the subtotal as `sum(line_total)`. The
  -- booking-level percentage is applied on top by the trigger from the header's
  -- `discount_percent`; `invoice_lines.discount_percent` stays 0, because the
  -- line's own discount is already inside its total and counting it twice would
  -- discount twice.

  -- (1) Equipment and bundles, from `booking_lines`.
  -- The mapping is `LINE_KIND_BY_TYPE` from createInvoice.ts, moved next to the
  -- enums it maps. Every member of `booking_line_type` is named and the CASE
  -- has **no ELSE on purpose**: if `booking_line_type` ever grows a member,
  -- this yields NULL, `invoice_lines.line_kind` is NOT NULL, and the whole
  -- transaction aborts with nothing written. That is the safe direction. The
  -- TypeScript it replaces fell through a `?? 'Equipment Rental'`, so an
  -- accessory or an ad-hoc line was billed as equipment rental with nothing
  -- said about it.
  -- ⚠ `line_kind` has no `Damage` and no `Missing` member, so a damage charge
  -- cannot become an invoice line at all. That is MONEY-08; widening the enum
  -- is a ruling (it decides deposit-versus-invoice precedence too) and is NOT
  -- done here.
  -- Law 3 keeps a voided booking line in its table; a voided line is not
  -- billable, so it is kept off the bill.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
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
    -- `booking_lines.description` is nullable and `invoice_lines.description`
    -- is NOT NULL. The line type is the honest fallback: it says what the
    -- charge is for without inventing a product name nobody typed.
    coalesce(nullif(btrim(bl.description), ''), bl.line_type::text),
    greatest(1, bl.qty),
    greatest(1, bl.days),
    bl.rate,
    greatest(0, greatest(1, bl.qty) * greatest(1, bl.days) * bl.rate - coalesce(bl.discount_amount, 0)),
    0,
    coalesce(bl.sort_order, 0)
  from booking_lines bl
  where bl.booking_id = v_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (2) Crew, from `booking_crew_lines` — a different table, which is why it
  -- was billed to nobody until 4 Sep. Overtime, accommodation and meals are
  -- per-engagement totals, not per day; folding them into the unit rate keeps
  -- quantity × days × rate equal to the crew member's true cost, which is the
  -- arithmetic the recalc trigger applies to every line without exception.
  --
  -- `line_total` is computed EXACTLY (day_rate × days + extras) rather than
  -- from the divided unit rate, and that distinction earns its keep:
  -- `unit_rate` is `numeric(14,2)`, so a gaffer at 8000 × 3 days plus 4000 of
  -- extras stores a unit rate of 9333.33 whose product with days is 27,999.99
  -- — a rupee short of the 28,000 owed. `line_total` is what
  -- `recalculate_invoice_totals` sums, so the bill is exact and only the
  -- displayed per-day rate carries the rounding. Verified against the same
  -- reference figures the TypeScript suite used to pin (28,000 / 18,000 /
  -- 4,200), so this snapshot bills what its predecessor billed.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    cl.client_uuid,
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
  where cl.booking_id = v_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (3) Transport, from `booking_transport`. A row carrying no charge is a
  -- logistics record, not a bill line, so it is skipped rather than billed at
  -- zero. `booking_transport` has no `voided_at` column — there is nothing to
  -- exclude on.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bt.client_uuid,
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
  where bt.booking_id = v_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- ── The totals, as POSTGRES computed them ─────────────────────────────────
  -- Re-read, never derived here. A caller rendering its own figure is showing
  -- an estimate; this is the row.
  select * into v_totals from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',      v_totals.id,
    -- R-15 — stated rather than omitted, so a caller cannot mistake a missing
    -- field for a number it failed to read.
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
    'replayed',        false
  );
end;
$function$;

-- A single manual discount may exceed 25%; combined discount rows may not.
-- Preserve the existing Student / College / named-client exclusivity trigger.
create or replace function public.enforce_booking_discount_stacking()
returns trigger
language plpgsql
set search_path=public, pg_temp
as $stack$
declare
  v_existing_sum numeric(5,2);
  v_existing_count integer;
  v_total numeric(5,2);
  v_exclusive_sources discount_source[] :=
    array['Student','College','Named-client rates']::discount_source[];
begin
  select coalesce(sum(percent),0),count(*) into v_existing_sum,v_existing_count
  from public.booking_discounts
  where booking_id=new.booking_id and id<>new.id;
  v_total:=v_existing_sum+new.percent;
  if v_total > 100 then
    raise exception 'This booking total discount % exceeds 100%%',v_total
      using errcode='23514';
  end if;
  if v_existing_count > 0 and v_total > 25 then
    raise exception 'Stacking discount rows above 25%% is not permitted; total %',v_total
      using errcode='23514';
  end if;
  if new.discount_source=any(v_exclusive_sources) then
    if v_existing_sum > 0 then
      raise exception '% cannot stack with other discounts',new.discount_source
        using errcode='23514';
    end if;
  elsif exists (
    select 1 from public.booking_discounts
    where booking_id=new.booking_id and id<>new.id and discount_source=any(v_exclusive_sources)
  ) then
    raise exception 'A Student, College, or named-client discount is exclusive'
      using errcode='23514';
  end if;
  return new;
end;
$stack$;

revoke execute on function public.booking_estimate_total(uuid) from public, anon;
grant execute on function public.booking_estimate_total(uuid) to authenticated,service_role;
commit;
