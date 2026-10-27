-- =============================================================================
-- Migration 0185: Damage found during reset opens a case (T2-15)
--
-- Operations rule (W44, W23):
-- When Reset marks an item Damaged after the client has left (W44),
-- the app opens a damage case linked to the booking it last came back from,
-- defaulting to claim from the client ('Charge Client');
-- the client gets the "damage found — under review" notice without an amount (W23);
-- the amount follows only after a Manager (< Rs 25,000) or Owner (>= Rs 25,000) approves.
--
-- This migration ensures:
-- 1. A BEFORE INSERT trigger on damage_findings (for source = 'Cleaning')
--    automatically creates a cases row of type 'Damage' linked to the booking
--    (from cleaning_queue_entries.booking_id), with:
--      - type: 'Damage'
--      - counterparty_kind: 'Client'
--      - counterparty_name: client's name from booking
--      - status: 'Open'
--      - disposition: 'Charge Client' (W44)
--      - assessed_amount: 0 (W23)
--      - charged_to_client_amount: 0
--      - case_no: sequential ^CASE-[0-9]{4}-[0-9]{4}$
--    and sets damage_findings.case_id and disposition.
-- 2. An RPC create_damage_case() allowing floor staff (Warehouse, Technician)
--    and managers to open a damage case linked to a booking and unit directly.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Trigger function: open_damage_case_on_cleaning_finding
-- -----------------------------------------------------------------------------
create or replace function public.open_damage_case_on_cleaning_finding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_client_name text;
  v_booking_no text;
  v_case_no text;
  v_case_id uuid;
  v_year integer := extract(year from current_date);
  v_next_val bigint;
  v_title text;
  v_priority case_priority;
  v_creator uuid;
begin
  -- Only trigger for cleaning findings that do not already have a case attached
  if NEW.source = 'Cleaning' and NEW.case_id is null and NEW.cleaning_queue_entry_id is not null then
    -- Resolve booking and client details from the cleaning queue entry
    select cqe.booking_id, coalesce(c.name, 'Client'), b.booking_no
      into v_booking_id, v_client_name, v_booking_no
      from cleaning_queue_entries cqe
      join bookings b on b.id = cqe.booking_id
      left join clients c on c.id = b.client_id
     where cqe.id = NEW.cleaning_queue_entry_id;

    if v_booking_id is not null then
      -- Generate next sequential CASE-YYYY-NNNN number
      select coalesce(max(substring(case_no from 11)::bigint), 0) + 1
        into v_next_val
        from cases
       where case_no ~ ('^CASE-' || v_year::text || '-[0-9]+$');

      v_case_no := 'CASE-' || v_year::text || '-' || lpad(v_next_val::text, 4, '0');
      v_case_id := gen_random_uuid();

      v_title := 'Damage found post-inspection: ' || coalesce(NEW.damage_type, 'Equipment') ||
                 ' (' || coalesce(v_booking_no, 'Rental') || ')';

      -- Map finding severity to case_priority
      v_priority := case
        when NEW.severity = 'Critical' then 'Critical'::case_priority
        when NEW.severity = 'High' then 'High'::case_priority
        when NEW.severity = 'Low' then 'Low'::case_priority
        else 'Medium'::case_priority
      end;

      -- Default creator to an active staff user if null
      v_creator := coalesce(NEW.created_by, auth.uid());
      if v_creator is null then
        select id into v_creator from users where is_active = true limit 1;
      end if;

      -- Insert the linked case
      insert into cases (
        id,
        client_uuid,
        case_no,
        type,
        title,
        counterparty_kind,
        counterparty_name,
        priority,
        status,
        disposition,
        linked_booking_id,
        owner_id,
        created_by,
        assessed_amount,
        deposit_held_amount,
        charged_to_client_amount,
        opened_at
      ) values (
        v_case_id,
        gen_random_uuid(),
        v_case_no,
        'Damage',
        v_title,
        'Client',
        coalesce(v_client_name, 'Client'),
        v_priority,
        'Under Review', -- W23: Damage notice now ("found, under review with photos"); charge only after manager approves
        coalesce(NEW.disposition, 'Charge Client'), -- W44: Claim from client by default
        v_booking_id,
        v_creator,
        v_creator,
        0, -- W23: Notice now, amount later after manager/owner approval
        0,
        0,
        now()
      );

      -- Link the damage finding to the newly minted case
      NEW.case_id := v_case_id;
      if NEW.disposition is null then
        NEW.disposition := 'Charge Client';
      end if;

      -- Link evidence references from cleaning queue entry or unit to this case
      if NEW.cleaning_queue_entry_id is not null then
        update evidence_references
           set case_id = v_case_id
         where cleaning_queue_entry_id = NEW.cleaning_queue_entry_id
           and case_id is null;
      end if;

      if v_booking_id is not null and NEW.unit_id is not null then
        update evidence_references
           set case_id = v_case_id
         where booking_id = v_booking_id
           and item_id = NEW.unit_id
           and case_id is null;
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_open_damage_case_on_cleaning_finding on damage_findings;
create trigger trg_open_damage_case_on_cleaning_finding
  before insert on damage_findings
  for each row
  execute function open_damage_case_on_cleaning_finding();

-- -----------------------------------------------------------------------------
-- 2. RPC: create_damage_case
-- -----------------------------------------------------------------------------
create or replace function public.create_damage_case(
  p_booking_id      uuid,
  p_unit_id         uuid,
  p_damage_type     text,
  p_description     text,
  p_severity        text default 'Medium',
  p_disposition     text default 'Charge Client',
  p_client_uuid     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_name  text;
  v_booking_no   text;
  v_case_no      text;
  v_case_id      uuid;
  v_finding_id   uuid;
  v_year         integer := extract(year from current_date);
  v_next_val     bigint;
  v_priority     case_priority;
  v_actor        uuid := auth.uid();
  v_title        text;
  v_clean_uuid   uuid := coalesce(p_client_uuid, gen_random_uuid());
begin
  if not auth_is_staff() then
    raise exception 'Permission denied: only staff may create damage cases.' using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'Booking ID is required to create a damage case.' using errcode = '23502';
  end if;

  if p_description is null or length(trim(p_description)) < 5 then
    raise exception 'A damage description of at least 5 characters is required.' using errcode = '23514';
  end if;

  select coalesce(c.name, 'Client'), b.booking_no
    into v_client_name, v_booking_no
    from bookings b
    left join clients c on c.id = b.client_id
   where b.id = p_booking_id;

  if not found then
    raise exception 'Booking % not found.', p_booking_id using errcode = 'P0002';
  end if;

  -- Generate sequential case number
  select coalesce(max(substring(case_no from 11)::bigint), 0) + 1
    into v_next_val
    from cases
   where case_no ~ ('^CASE-' || v_year::text || '-[0-9]+$');

  v_case_no := 'CASE-' || v_year::text || '-' || lpad(v_next_val::text, 4, '0');
  v_case_id := gen_random_uuid();
  v_title := 'Damage found: ' || coalesce(p_damage_type, 'Equipment') || ' (' || coalesce(v_booking_no, 'Rental') || ')';

  v_priority := case
    when p_severity = 'Critical' then 'Critical'::case_priority
    when p_severity = 'High' then 'High'::case_priority
    when p_severity = 'Low' then 'Low'::case_priority
    else 'Medium'::case_priority
  end;

  if v_actor is null then
    select id into v_actor from users where is_active = true limit 1;
  end if;

  -- 1. Insert case
  insert into cases (
    id,
    client_uuid,
    case_no,
    type,
    title,
    counterparty_kind,
    counterparty_name,
    priority,
    status,
    disposition,
    linked_booking_id,
    owner_id,
    created_by,
    assessed_amount,
    deposit_held_amount,
    charged_to_client_amount,
    opened_at
  ) values (
    v_case_id,
    v_clean_uuid,
    v_case_no,
    'Damage',
    v_title,
    'Client',
    v_client_name,
    v_priority,
    'Under Review',
    coalesce(p_disposition, 'Charge Client'),
    p_booking_id,
    v_actor,
    v_actor,
    0,
    0,
    0,
    now()
  );

  -- 2. Insert damage finding linked to case
  v_finding_id := gen_random_uuid();
  insert into damage_findings (
    id,
    client_uuid,
    source,
    unit_id,
    case_id,
    damage_type,
    description,
    severity,
    disposition,
    created_by
  ) values (
    v_finding_id,
    gen_random_uuid(),
    'Cleaning',
    p_unit_id,
    v_case_id,
    coalesce(p_damage_type, 'Not stated'),
    trim(p_description),
    coalesce(p_severity, 'Medium'),
    coalesce(p_disposition, 'Charge Client'),
    v_actor
  );

  return jsonb_build_object(
    'success', true,
    'case_id', v_case_id,
    'case_no', v_case_no,
    'finding_id', v_finding_id,
    'disposition', coalesce(p_disposition, 'Charge Client'),
    'status', 'Under Review'
  );
end;
$$;

revoke execute on function public.create_damage_case(uuid, uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_damage_case(uuid, uuid, text, text, text, text, uuid) to authenticated;

commit;
