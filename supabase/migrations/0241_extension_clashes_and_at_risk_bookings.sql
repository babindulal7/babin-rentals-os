-- =============================================================================
-- Migration 0241: Extension clashes and At-Risk Bookings (T3-29)
--
-- Features:
--   1. extension_clashes table & views (B41, gate.extend.clash)
--   2. at_risk_bookings table & views (B42, B39)
--   3. Gate gate.pack.at_risk in apply_booking_stage_transition:
--      an At-Risk booking cannot advance to Packed until covered/resolved.
--   4. request_clashing_extension RPC: Coordinator+ escalates to Manager.
--   5. decide_clashing_extension RPC: Owner, Admin, Manager only.
--      Three audited decisions:
--        a) extend_alternative: extend booking + reassign conflicting line
--        b) extend_at_risk: extend booking + mark next booking At-Risk
--        c) refuse: refuse extension
--   6. resolve_at_risk_booking RPC: mark At-Risk booking covered/reconciled.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Tables: extension_clashes and at_risk_bookings
-- -----------------------------------------------------------------------------

create table if not exists public.extension_clashes (
  id                      uuid primary key default gen_random_uuid(),
  client_uuid             uuid not null unique,
  booking_id              uuid not null references public.bookings(id) on delete cascade,
  requested_days          integer not null check (requested_days >= 1),
  requested_return_at     timestamptz not null,
  pricing_option          text not null check (pricing_option in ('same_rate', 'standard_rate')),
  reason                  text not null check (char_length(btrim(reason)) >= 10),
  requested_by            uuid not null references auth.users(id),
  conflicting_booking_id  uuid references public.bookings(id),
  conflicting_asset_id    uuid references public.product_units(id),
  conflicting_product_id  uuid references public.products(id),
  status                  text not null default 'Pending' check (status in ('Pending', 'Resolved_Alternative', 'Resolved_AtRisk', 'Refused')),
  decision                text check (decision is null or decision in ('extend_alternative', 'extend_at_risk', 'refuse')),
  decision_reason         text check (decision_reason is null or char_length(btrim(decision_reason)) >= 10),
  decided_by              uuid references auth.users(id),
  decided_at              timestamptz,
  created_at              timestamptz not null default now()
);

create table if not exists public.at_risk_bookings (
  id                      uuid primary key default gen_random_uuid(),
  client_uuid             uuid not null unique,
  booking_id              uuid not null references public.bookings(id) on delete cascade,
  cause                   text not null check (cause in ('extension_clash', 'late_return', 'marked_late', 'damaged_equipment')),
  source_booking_id       uuid references public.bookings(id),
  clashing_asset_id       uuid references public.product_units(id),
  clashing_product_id     uuid references public.products(id),
  status                  text not null default 'Active' check (status in ('Active', 'Covered_Subrent', 'Covered_Similar', 'Refunded', 'Credit_Applied', 'Cancelled')),
  resolution_details      jsonb,
  raised_at               timestamptz not null default now(),
  resolved_at             timestamptz,
  resolved_by             uuid references auth.users(id),
  created_at              timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_extension_clashes_booking on public.extension_clashes(booking_id);
create index if not exists idx_extension_clashes_status on public.extension_clashes(status);
create index if not exists idx_at_risk_bookings_booking on public.at_risk_bookings(booking_id);
create index if not exists idx_at_risk_bookings_status on public.at_risk_bookings(status);

-- -----------------------------------------------------------------------------
-- 2. Row Level Security & Views
-- -----------------------------------------------------------------------------

alter table public.extension_clashes enable row level security;
alter table public.at_risk_bookings enable row level security;

-- Internal staff can view clashes and at-risk records
create policy extension_clashes_staff_select on public.extension_clashes
  for select
  to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts'));

create policy at_risk_bookings_staff_select on public.at_risk_bookings
  for select
  to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts'));

create or replace view public.extension_clashes_v as
select
  ec.id,
  ec.client_uuid,
  ec.booking_id,
  b.booking_no,
  ec.requested_days,
  ec.requested_return_at,
  ec.pricing_option,
  ec.reason,
  ec.requested_by,
  ec.conflicting_booking_id,
  cb.booking_no as conflicting_booking_no,
  ec.conflicting_asset_id,
  a.asset_tag as conflicting_asset_tag,
  ec.conflicting_product_id,
  p.name as conflicting_product_name,
  ec.status,
  ec.decision,
  ec.decision_reason,
  ec.decided_by,
  ec.decided_at,
  ec.created_at
from public.extension_clashes ec
left join public.bookings b on b.id = ec.booking_id
left join public.bookings cb on cb.id = ec.conflicting_booking_id
left join public.product_units a on a.id = ec.conflicting_asset_id
left join public.products p on p.id = ec.conflicting_product_id;

create or replace view public.at_risk_bookings_v as
select
  arb.id,
  arb.client_uuid,
  arb.booking_id,
  b.booking_no,
  b.client_id,
  c.name as client_name,
  b.stage as booking_stage,
  b.pickup_at,
  b.return_at,
  arb.cause,
  arb.source_booking_id,
  sb.booking_no as source_booking_no,
  arb.clashing_asset_id,
  a.asset_tag as clashing_asset_tag,
  arb.clashing_product_id,
  p.name as clashing_product_name,
  arb.status,
  arb.resolution_details,
  arb.raised_at,
  arb.resolved_at,
  arb.resolved_by,
  arb.created_at
from public.at_risk_bookings arb
left join public.bookings b on b.id = arb.booking_id
left join public.clients c on c.id = b.client_id
left join public.bookings sb on sb.id = arb.source_booking_id
left join public.product_units a on a.id = arb.clashing_asset_id
left join public.products p on p.id = arb.clashing_product_id;

grant select on public.extension_clashes_v to authenticated;
revoke select on public.extension_clashes_v from anon, public;
revoke all on public.extension_clashes from anon, public;

grant select on public.at_risk_bookings_v to authenticated;
revoke select on public.at_risk_bookings_v from anon, public;
revoke all on public.at_risk_bookings from anon, public;

-- -----------------------------------------------------------------------------
-- 3. Update apply_booking_stage_transition for gate.pack.at_risk
-- -----------------------------------------------------------------------------

create or replace function public.apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_stage         booking_stage;
  v_closed_at             timestamptz;
  v_prev_occurred_at      timestamptz;
  v_deposit_required      numeric(14,2) := 0;
  v_deposit_pending       numeric(14,2) := 0;
  v_rental_outstanding    numeric(14,2) := 0;
  v_reason                text;
  v_pack_session_id       uuid;
  v_handover_session_id   uuid;
  v_gov_id_verified       boolean := false;
  v_booking_auth_verified boolean := false;
  v_return_session_id     uuid;
  v_has_physical_lines    boolean := false;
  v_branch_id             uuid;
begin
  select stage, closed_at, coalesce(deposit_required, 0), branch_id
    into v_current_stage, v_closed_at, v_deposit_required, v_branch_id
  from bookings
  where id = NEW.booking_id
  for update;

  if not found then
    raise exception 'Stage transition rejected: booking % does not exist.', NEW.booking_id;
  end if;

  -- Check if booking has any physical equipment lines
  select exists (
    select 1
    from booking_lines bl
    where bl.booking_id = NEW.booking_id
      and bl.voided_at is null
      and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
  ) into v_has_physical_lines;

  -- ── Genesis ──
  if NEW.from_stage is null then
    if v_current_stage <> 'Quote' then
      raise exception 'Genesis transition rejected: booking % is not at Quote (currently %).', NEW.booking_id, v_current_stage;
    end if;
    if NEW.to_stage <> 'Quote' then
      raise exception 'Genesis transition must target Quote, got %.', NEW.to_stage;
    end if;
  else
    if NEW.from_stage <> v_current_stage then
      raise exception 'Stage transition rejected: from_stage (%) does not match booking %''s actual current stage (%). Stale read or concurrent write.',
        NEW.from_stage, NEW.booking_id, v_current_stage;
    end if;

    -- ── Closed reopen or immutability ──
    if v_current_stage = 'Closed' then
      if NEW.to_stage = 'Returned' then
        -- R-05 Reopen gate
        if not (auth_is_manager_or_above() or coalesce(NEW.actor_role, '') in ('Owner', 'Admin', 'Manager')) then
          raise exception 'GATE:gate.reopen.role|Only Manager or above can reopen a closed booking.' using errcode = 'P0001';
        end if;
        if NEW.reason is null or length(btrim(NEW.reason)) < 10 then
          raise exception 'GATE:gate.reopen.reason_missing|Reopening a closed booking requires a reason of at least 10 characters.' using errcode = 'P0001';
        end if;
      else
        raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
      end if;
    elsif v_closed_at is not null then
      raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
    else
      -- ── Normal forward or reversal transition ──
      if NEW.is_reversal then
        if NEW.to_stage >= NEW.from_stage then
          raise exception 'Reversal rejected: to_stage (%) does not precede from_stage (%).', NEW.to_stage, NEW.from_stage;
        end if;
      else
        if NEW.to_stage <> next_booking_stage(NEW.from_stage) then
          raise exception 'Stage transition rejected: % -> % is not a valid single-stage forward progression.',
            NEW.from_stage, NEW.to_stage;
        end if;
      end if;
    end if;
  end if;

  -- Forward-only monotonicity check on occurred_at
  select max(occurred_at) into v_prev_occurred_at
  from booking_stage_transitions
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  if v_prev_occurred_at is not null and NEW.occurred_at < v_prev_occurred_at then
    raise exception 'Stage transition rejected: occurred_at (%) precedes booking %''s previous transition (%).',
      NEW.occurred_at, NEW.booking_id, v_prev_occurred_at;
  end if;

  -- ── STAGE GATES ENFORCEMENT ──

  -- 1. Quote -> Booked
  if NEW.to_stage = 'Booked' and (NEW.from_stage is null or NEW.from_stage = 'Quote') then
    if exists (
      select 1 from bookings b
      join client_flags cf on cf.client_id = b.client_id
      where b.id = NEW.booking_id
        and cf.flag_type = 'Blocked'
        and cf.removed_at is null
    ) then
      raise exception 'GATE:gate.booking.client_blocked|Client is blocked from making bookings.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from booking_lines
      where booking_id = NEW.booking_id
        and voided_at is null
    ) then
      raise exception 'GATE:gate.booking.no_lines|Booking must have at least one line.' using errcode = 'P0001';
    end if;
  end if;

  -- 2. Booked -> Packed
  if NEW.to_stage = 'Packed' and NEW.from_stage = 'Booked' then
    -- P0-B location scoping (0171)
    if not auth_may_perform_operation('pack', v_branch_id) then
      raise exception 'GATE:operations.grant|This staff member''s pack grant does not cover the branch of booking %.', NEW.booking_id using errcode = 'P0001';
    end if;

    -- T3-29: At-Risk invariant (B42): an At-Risk booking cannot reach Pack until covered or resolved
    if exists (
      select 1 from public.at_risk_bookings
      where booking_id = NEW.booking_id
        and status = 'Active'
    ) then
      raise exception 'GATE:gate.pack.at_risk|Booking is At Risk and cannot reach Pack until equipment coverage is resolved.' using errcode = 'P0001';
    end if;

    if v_has_physical_lines then
      select id into v_pack_session_id
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Packing'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_pack_session_id is null then
        raise exception 'GATE:gate.pack.session_missing|Booking requires an active or completed packing session.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        join products p on p.id = bl.product_id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and p.tracking_mode = 'Serialised'
          and (
            select count(*)
            from booking_line_units blu
            where blu.booking_line_id = bl.id
              and blu.asset_id is not null
          ) <> bl.qty
      ) then
        raise exception 'GATE:gate.pack.units_unassigned|Every serialised line must have all units assigned.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        join booking_line_units blu on blu.booking_line_id = bl.id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and blu.asset_id is not null
          and not exists (
            select 1
            from session_line_movements slm
            where slm.session_id = v_pack_session_id
              and slm.unit_id = blu.asset_id
          )
      ) then
        raise exception 'GATE:gate.pack.units_unpacked|Every unit must have a movement in the packing session.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 3. Packed -> On Rent
  if NEW.to_stage = 'On Rent' and NEW.from_stage = 'Packed' then
    -- P0-B location scoping (0171)
    if not auth_may_perform_operation('handover', v_branch_id) then
      raise exception 'GATE:operations.grant|This staff member''s handover grant does not cover the branch of booking %.', NEW.booking_id using errcode = 'P0001';
    end if;

    if v_has_physical_lines then
      select id, government_id_verified, booking_authorization_verified
      into v_handover_session_id, v_gov_id_verified, v_booking_auth_verified
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Handover'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_handover_session_id is null then
        raise exception 'GATE:gate.handover.session_missing|Booking requires an active or completed handover session.' using errcode = 'P0001';
      end if;

      -- Gate 1: Receiver verified or overridden with 10+ char reason (T2-04, D2)
      if not (coalesce(v_gov_id_verified, false) and coalesce(v_booking_auth_verified, false)) then
        if not exists (
          select 1 from override_records
          where subject_type = 'operation_sessions'
            and subject_id = v_handover_session_id
            and override_type = 'Gate override'
            and gate_number = 1
            and char_length(reason) >= 10
        ) then
          raise exception 'GATE:gate.handover.receiver_unverified|Receiver government ID and booking authorization must be verified or overridden with a reason of at least 10 characters.' using errcode = 'P0001';
        end if;
      end if;

      if exists (
        select 1
        from booking_lines bl
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
          and not exists (
            select 1
            from handover_lines hl
            where hl.booking_line_id = bl.id
          )
      ) then
        raise exception 'GATE:gate.handover.units_unhanded|Every booking line must have a handover line recorded.' using errcode = 'P0001';
      end if;

      if not exists (
        select 1
        from signatures s
        where s.session_id = v_handover_session_id
      ) then
        raise exception 'GATE:gate.handover.agreement_unsigned|Rental agreement must be signed before handover.' using errcode = 'P0001';
      end if;
    end if;

    -- R-06 WARN on money (Enforced for ALL bookings, physical and service-only)
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.booking_id;

    -- D1 (26 Oct 2026, T2-03): Held ID document satisfies the deposit gate in lieu of cash.
    if exists (
      select 1 from public.collateral_documents
      where booking_id = NEW.booking_id
        and returned_at is null
    ) then
      v_deposit_pending := 0;
    end if;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.booking_id and status not in ('Void');

    v_deposit_pending    := coalesce(v_deposit_pending, 0);
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(NEW.reason, current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      insert into audit_events (
        client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
      )
      values (
        gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, v_reason,
        jsonb_build_object(
          'gate',                 'handover_money',
          'ruling',               'R-06',
          'rental_outstanding',   v_rental_outstanding,
          'deposit_pending',      v_deposit_pending,
          'from_stage',           NEW.from_stage,
          'to_stage',             NEW.to_stage
        )
      );
    end if;
  end if;

  -- 4. On Rent -> Returned
  if NEW.to_stage = 'Returned' and NEW.from_stage = 'On Rent' then
    -- P0-B location scoping (0171)
    if not auth_may_perform_operation('return', v_branch_id) then
      raise exception 'GATE:operations.grant|This staff member''s return grant does not cover the branch of booking %.', NEW.booking_id using errcode = 'P0001';
    end if;

    if v_has_physical_lines then
      select id into v_return_session_id
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Return'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_return_session_id is null then
        raise exception 'GATE:gate.return.session_missing|Booking requires an active or completed return session.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        left join products p on p.id = bl.product_id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
          and coalesce(p.tracking_mode, 'Serialised') <> 'Consumable'
          and not exists (
            select 1
            from return_lines rl
            where rl.booking_line_id = bl.id
          )
      ) then
        raise exception 'GATE:gate.return.units_unaccounted|Every physical booking line must have a return line recorded.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131, 0135, 0141, 0149, 0155, 0181)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice OR Owner/Admin Zero-Value Override (§4.51)
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      if (
        (auth_user_role() in ('Owner', 'Admin') or coalesce(NEW.actor_role, '') in ('Owner', 'Admin'))
        and NEW.reason is not null
        and length(btrim(NEW.reason)) >= 10
      ) then
        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, btrim(NEW.reason),
          jsonb_build_object(
            'gate', 'close_no_invoice',
            'ruling', '§4.51',
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
      end if;
    end if;

    -- (b) All non-void invoices settled
    if exists (
      select 1 from invoices
      where booking_id = NEW.booking_id
        and status not in ('Void')
        and outstanding_amount > 0
    ) then
      raise exception 'GATE:gate.close.invoice_unsettled|Cannot close booking with unsettled invoices.' using errcode = 'P0001';
    end if;

    -- (c) Deposit resolved, or skipped with a named reason (0155, RULING 2026-10-06).
    if (
      exists (
        select 1 from public.collateral_documents
        where booking_id = NEW.booking_id
          and returned_at is not null
      )
      and not exists (
        select 1 from public.collateral_documents
        where booking_id = NEW.booking_id
          and returned_at is null
      )
      and coalesce((select received_amount from security_deposits where booking_id = NEW.booking_id), 0) = 0
    ) then
      -- Collateral returned
      null;
    elsif (v_deposit_required > 0 and not exists (select 1 from security_deposits where booking_id = NEW.booking_id))
       or exists (
        select 1 from security_deposits
        where booking_id = NEW.booking_id
          and (pending_amount > 0 or (received_amount - refunded_amount - applied_amount) > 0)
      ) then
      if NEW.deposit_skip_reason is not null and length(btrim(NEW.deposit_skip_reason)) >= 10 then
        if not (auth_is_manager_or_above() or coalesce(NEW.actor_role, '') in ('Owner', 'Admin', 'Manager')) then
          raise exception 'GATE:gate.close.deposit_skip_role|Only Manager or above can close a rental without settling its deposit.' using errcode = 'P0001';
        end if;

        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, btrim(NEW.deposit_skip_reason),
          jsonb_build_object(
            'gate', 'close_deposit_skipped',
            'ruling', '2026-10-06',
            'deposit_required', v_deposit_required,
            'deposit_held', (
              select coalesce(sum(received_amount - refunded_amount - applied_amount), 0)
              from security_deposits where booking_id = NEW.booking_id
            ),
            'deposit_pending', (
              select coalesce(sum(pending_amount), 0)
              from security_deposits where booking_id = NEW.booking_id
            ),
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.deposit_unresolved|Cannot close booking with unresolved security deposit.' using errcode = 'P0001';
      end if;
    end if;

    -- (d) No open cases
    if exists (
      select 1
      from cases
      where linked_booking_id = NEW.booking_id
        and status not in ('Resolved', 'Closed', 'Cancelled')
    ) then
      raise exception 'GATE:gate.close.open_case|Cannot close booking with open cases.' using errcode = 'P0001';
    end if;

    -- (e) No live reservations
    if exists (
      select 1
      from inventory_reservations
      where booking_id = NEW.booking_id
        and released_at is null
    ) then
      raise exception 'GATE:gate.close.reservation_live|Cannot close booking with live reservations.' using errcode = 'P0001';
    end if;

    -- (f) No damage finding awaiting approval (RL-06)
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
    end if;

    -- (g) Collateral held check (D1, T2-03)
    if exists (
      select 1 from public.collateral_documents
      where booking_id = NEW.booking_id
        and returned_at is null
    ) then
      raise exception 'GATE:gate.close.collateral_held|Cannot close booking while client collateral (ID card) is still held. Return collateral first.' using errcode = 'P0001';
    end if;
  end if;

  -- Publish GUCs for downstream triggers if needed
  perform set_config('app.stage_override_reason', coalesce(NEW.reason, ''), true);
  perform set_config('app.stage_actor_id',        coalesce(NEW.actor_id::text, ''), true);
  perform set_config('app.stage_branch_id',      coalesce(NEW.branch_id::text, ''), true);

  -- Perform the booking stage update
  update bookings
  set stage      = NEW.to_stage,
      closed_at  = case
                     when NEW.to_stage = 'Closed' then NEW.occurred_at
                     when NEW.from_stage = 'Closed' and NEW.to_stage = 'Returned' then null
                     else closed_at
                   end,
      updated_at = now(),
      updated_by = NEW.actor_id
  where id = NEW.booking_id;

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. RPCs: request_clashing_extension, decide_clashing_extension, resolve_at_risk_booking
-- -----------------------------------------------------------------------------

create or replace function public.request_clashing_extension(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id              uuid := (p_payload ->> 'booking_id')::uuid;
  v_days                    integer := coalesce((p_payload ->> 'requested_days')::integer, (p_payload ->> 'days')::integer, 0);
  v_pricing_option          text := coalesce(p_payload ->> 'pricing_option', 'same_rate');
  v_reason                  text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_conflicting_booking_id  uuid := nullif(p_payload ->> 'conflicting_booking_id', '')::uuid;
  v_conflicting_asset_id    uuid := nullif(p_payload ->> 'conflicting_asset_id', '')::uuid;
  v_conflicting_product_id  uuid := nullif(p_payload ->> 'conflicting_product_id', '')::uuid;
  v_client_uuid             uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_role                    system_role;
  v_actor                   uuid;
  v_booking                 bookings%rowtype;
  v_requested_return_at     timestamptz;
  v_clash_id                uuid;
begin
  if v_booking_id is null then
    raise exception 'request_clashing_extension: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'request_clashing_extension: requested_days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception 'request_clashing_extension: reason of at least 10 characters is required.';
  end if;

  if v_pricing_option not in ('same_rate', 'standard_rate') then
    raise exception 'request_clashing_extension: invalid pricing_option %.', v_pricing_option;
  end if;

  if v_client_uuid is null then
    raise exception 'request_clashing_extension: client_uuid is required for Law 8 idempotency.';
  end if;

  -- 1. Check existing idempotent request
  select id into v_clash_id from extension_clashes where client_uuid = v_client_uuid;
  if v_clash_id is not null then
    return jsonb_build_object(
      'success', true,
      'clash_id', v_clash_id,
      'status', 'Pending',
      'already_existed', true
    );
  end if;

  -- 2. Role verification (Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'request_clashing_extension: role % not authorized to escalate extension clash.', coalesce(v_role::text, 'none') using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'request_clashing_extension: authenticated staff user required.' using errcode = '42501';
  end if;

  -- 3. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'request_clashing_extension: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null or v_booking.stage in ('Returned', 'Closed') then
    raise exception 'request_clashing_extension: booking % is % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  v_requested_return_at := v_booking.return_at + (v_days || ' days')::interval;

  -- 4. Insert into extension_clashes
  insert into extension_clashes (
    client_uuid,
    booking_id,
    requested_days,
    requested_return_at,
    pricing_option,
    reason,
    requested_by,
    conflicting_booking_id,
    conflicting_asset_id,
    conflicting_product_id,
    status
  ) values (
    v_client_uuid,
    v_booking_id,
    v_days,
    v_requested_return_at,
    v_pricing_option,
    v_reason,
    v_actor,
    v_conflicting_booking_id,
    v_conflicting_asset_id,
    v_conflicting_product_id,
    'Pending'
  )
  returning id into v_clash_id;

  -- 5. Audit event
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
    new_values,
    reason
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Rentals',
    'Request',
    'Informational',
    'Success',
    'extension_clashes',
    v_clash_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'booking_id', v_booking_id,
      'requested_days', v_days,
      'requested_return_at', v_requested_return_at,
      'conflicting_booking_id', v_conflicting_booking_id
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'clash_id', v_clash_id,
    'status', 'Pending',
    'already_existed', false
  );
end;
$$;

create or replace function public.decide_clashing_extension(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clash_id            uuid := (p_payload ->> 'clash_id')::uuid;
  v_decision            text := p_payload ->> 'decision';
  v_decision_reason     text := btrim(coalesce(p_payload ->> 'decision_reason', p_payload ->> 'reason', ''));
  v_client_uuid         uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_role                system_role;
  v_actor               uuid;
  v_clash               extension_clashes%rowtype;
  v_booking             bookings%rowtype;
  v_conflicting_booking bookings%rowtype;
  v_new_status          text;
  v_now                 timestamptz := now();
  v_resync              jsonb;
begin
  if v_clash_id is null then
    raise exception 'decide_clashing_extension: clash_id is required.';
  end if;

  if v_decision not in ('extend_alternative', 'extend_at_risk', 'refuse') then
    raise exception 'decide_clashing_extension: invalid decision %. Must be extend_alternative, extend_at_risk, or refuse.', v_decision;
  end if;

  if char_length(v_decision_reason) < 10 then
    raise exception 'decide_clashing_extension: decision reason of at least 10 characters is required.';
  end if;

  -- 1. Role verification: gate.extend.clash (PERMISSIONS.md §6.1: Owner, Admin, Manager only)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'decide_clashing_extension: gate.extend.clash requires Owner, Admin, or Manager role (got %).', coalesce(v_role::text, 'none') using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'decide_clashing_extension: authenticated staff user required.' using errcode = '42501';
  end if;

  -- 2. Read clash
  select * into v_clash from extension_clashes where id = v_clash_id for update;
  if not found then
    raise exception 'decide_clashing_extension: extension clash % not found.', v_clash_id;
  end if;

  if v_clash.status <> 'Pending' then
    return jsonb_build_object(
      'success', true,
      'clash_id', v_clash.id,
      'status', v_clash.status,
      'decision', v_clash.decision,
      'already_decided', true
    );
  end if;

  -- 3. Read booking
  select * into v_booking from bookings where id = v_clash.booking_id for update;
  if not found then
    raise exception 'decide_clashing_extension: booking % not found.', v_clash.booking_id;
  end if;

  if v_clash.conflicting_booking_id is not null then
    select * into v_conflicting_booking from bookings where id = v_clash.conflicting_booking_id for update;
  end if;

  -- 4. Execute decision
  if v_decision = 'refuse' then
    v_new_status := 'Refused';
  else
    -- Either extend_at_risk or extend_alternative
    if v_decision = 'extend_at_risk' then
      v_new_status := 'Resolved_AtRisk';

      -- Flag conflicting booking as At-Risk if present
      if v_clash.conflicting_booking_id is not null then
        -- Release the overlapping hold on conflicting booking so GiST exclusion does not throw
        update inventory_reservations
           set released_at = v_now,
               released_reason = 'Released due to extension clash decision; marked At Risk'
         where booking_id = v_clash.conflicting_booking_id
           and (asset_id = v_clash.conflicting_asset_id or (product_id = v_clash.conflicting_product_id and asset_id is null))
           and released_at is null;

        insert into at_risk_bookings (
          client_uuid,
          booking_id,
          cause,
          source_booking_id,
          clashing_asset_id,
          clashing_product_id,
          status,
          resolution_details
        ) values (
          coalesce(v_client_uuid, gen_random_uuid()),
          v_clash.conflicting_booking_id,
          'extension_clash',
          v_clash.booking_id,
          v_clash.conflicting_asset_id,
          v_clash.conflicting_product_id,
          'Active',
          jsonb_build_object(
            'clash_id', v_clash.id,
            'decision_reason', v_decision_reason,
            'requested_days', v_clash.requested_days,
            'decided_by', v_actor,
            'decided_at', v_now
          )
        );
      end if;

    elsif v_decision = 'extend_alternative' then
      v_new_status := 'Resolved_Alternative';

      -- Release conflicting unit hold so it can be rebooked to alternative/sub-rent
      if v_clash.conflicting_booking_id is not null then
        update inventory_reservations
           set released_at = v_now,
               released_reason = 'Reassigned to alternative/subrent due to extension clash decision'
         where booking_id = v_clash.conflicting_booking_id
           and (asset_id = v_clash.conflicting_asset_id or (product_id = v_clash.conflicting_product_id and asset_id is null))
           and released_at is null;
      end if;
    end if;

    -- Now extend the current booking safely
    update bookings
       set return_at = v_clash.requested_return_at,
           updated_at = v_now
     where id = v_clash.booking_id;

    update booking_lines
       set days = days + v_clash.requested_days,
           updated_at = v_now
     where booking_id = v_clash.booking_id
       and voided_at is null
       and days is not null;

    update inventory_reservations
       set period = tstzrange(lower(period), v_clash.requested_return_at, '[)')
     where booking_id = v_clash.booking_id
       and released_at is null;

    if exists (select 1 from invoices where booking_id = v_clash.booking_id and status = 'Draft') then
      v_resync := public.resync_draft_invoice(v_clash.booking_id);
    end if;
  end if;

  -- 5. Update clash record
  update extension_clashes
     set status = v_new_status,
         decision = v_decision,
         decision_reason = v_decision_reason,
         decided_by = v_actor,
         decided_at = v_now
   where id = v_clash.id;

  -- 6. Audit event
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
    new_values,
    reason
  ) values (
    gen_random_uuid(),
    'decision',
    'Rentals',
    'Rentals',
    'Decide',
    'Informational',
    'Success',
    'extension_clashes',
    v_clash.id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'decision', v_decision,
      'status', v_new_status,
      'booking_id', v_clash.booking_id,
      'conflicting_booking_id', v_clash.conflicting_booking_id
    ),
    v_decision_reason
  );

  return jsonb_build_object(
    'success', true,
    'clash_id', v_clash.id,
    'status', v_new_status,
    'decision', v_decision,
    'already_decided', false
  );
end;
$$;

create or replace function public.resolve_at_risk_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at_risk_id          uuid := (p_payload ->> 'at_risk_id')::uuid;
  v_resolution_type     text := p_payload ->> 'resolution_type';
  v_resolution_notes    text := btrim(coalesce(p_payload ->> 'resolution_notes', p_payload ->> 'notes', ''));
  v_role                system_role;
  v_actor               uuid;
  v_at_risk             at_risk_bookings%rowtype;
  v_now                 timestamptz := now();
begin
  if v_at_risk_id is null then
    raise exception 'resolve_at_risk_booking: at_risk_id is required.';
  end if;

  if v_resolution_type not in ('Covered_Subrent', 'Covered_Similar', 'Refunded', 'Credit_Applied', 'Cancelled') then
    raise exception 'resolve_at_risk_booking: invalid resolution_type %.', v_resolution_type;
  end if;

  if char_length(v_resolution_notes) < 10 then
    raise exception 'resolve_at_risk_booking: resolution notes of at least 10 characters required.';
  end if;

  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'resolve_at_risk_booking: role % not authorized.', coalesce(v_role::text, 'none') using errcode = '42501';
  end if;

  v_actor := auth_user_id();

  select * into v_at_risk from at_risk_bookings where id = v_at_risk_id for update;
  if not found then
    raise exception 'resolve_at_risk_booking: record % not found.', v_at_risk_id;
  end if;

  update at_risk_bookings
     set status = v_resolution_type,
         resolved_at = v_now,
         resolved_by = v_actor,
         resolution_details = coalesce(resolution_details, '{}'::jsonb) || jsonb_build_object(
           'resolution_type', v_resolution_type,
           'resolution_notes', v_resolution_notes,
           'resolved_by', v_actor,
           'resolved_at', v_now
         )
   where id = v_at_risk_id;

  return jsonb_build_object(
    'success', true,
    'at_risk_id', v_at_risk_id,
    'status', v_resolution_type
  );
end;
$$;

-- Security & Permissions
revoke all on function public.request_clashing_extension(jsonb) from anon, public;
grant execute on function public.request_clashing_extension(jsonb) to authenticated;

revoke all on function public.decide_clashing_extension(jsonb) from anon, public;
grant execute on function public.decide_clashing_extension(jsonb) to authenticated;

revoke all on function public.resolve_at_risk_booking(jsonb) from anon, public;
grant execute on function public.resolve_at_risk_booking(jsonb) to authenticated;

commit;
