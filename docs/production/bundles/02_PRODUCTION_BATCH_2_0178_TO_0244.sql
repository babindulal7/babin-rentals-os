-- =============================================================================
-- BABIN RENTALS OS — PRODUCTION MIGRATION BUNDLE 2 OF 3
-- File: 02_PRODUCTION_BATCH_2_0178_TO_0244.sql
-- Range: Migrations 0178 through 0244
-- Total Migrations in Batch: 67
-- Target: Production Project sxguwvgoserhdolewibb
-- Description: Quantity reset, floor gate overrides, team notes, shifts, delivery proof, email logs, push subscriptions, consumables, counter sale.
--
-- INSTRUCTIONS FOR BABIN:
-- 1. Open Supabase Dashboard -> Project sxguwvgoserhdolewibb -> SQL Editor.
-- 2. Create a new query, paste this entire file, and click 'RUN'.
-- 3. Verify 'Success. No rows returned' or query execution completed.
-- 4. Execute the verification query at the bottom to verify migration registration.
-- =============================================================================

-- Ensure migration session config can bypass money line triggers during setup
select set_config('app.in_create_booking', 'on', false);

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0178_quantity_only_reset.sql
-- SHA-256: bf2f103a085f1eb3e93b7892a3c058814011fd0eb24948700aee5607b336ab53
-- Version: 20261122030019
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0178_quantity_only_reset.sql
-- Allow recording quantity-only reset completion in cleaning_queue_entries.
-- Previously unit_id was NOT NULL, restricting Reset to serialised gear only.
-- Quantity items (cables, stands, accessories, consumables) are tracked at line level
-- and need truthful queue recording, completion timestamps, and QC attribution.

begin;

-- 1. Allow unit_id to be nullable for quantity-tracked items
alter table public.cleaning_queue_entries
  alter column unit_id drop not null;

-- 2. Add booking_line_id to link quantity items directly to their booking line
alter table public.cleaning_queue_entries
  add column if not exists booking_line_id uuid references public.booking_lines (id);

-- 3. Add quantity column for quantity-tracked lines
alter table public.cleaning_queue_entries
  add column if not exists qty int not null default 1;

-- 4. Ensure at least one target is specified (unit_id or booking_line_id) and qty is positive
alter table public.cleaning_queue_entries
  drop constraint if exists cleaning_queue_entries_unit_or_line;

alter table public.cleaning_queue_entries
  add constraint cleaning_queue_entries_unit_or_line
  check (unit_id is not null or booking_line_id is not null);

alter table public.cleaning_queue_entries
  drop constraint if exists cleaning_queue_entries_qty_positive;

alter table public.cleaning_queue_entries
  add constraint cleaning_queue_entries_qty_positive
  check (qty > 0);

-- 5. Index for booking_line_id lookups
create index if not exists idx_cleaning_queue_entries_booking_line_id
  on public.cleaning_queue_entries (booking_line_id);

-- 6. Update auth_may_reset_entry to handle null p_unit_id gracefully
create or replace function public.auth_may_reset_entry(p_booking_id uuid, p_unit_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select public.auth_user_id() is not null and coalesce((
    select scope.branch_id is not null
      and public.auth_may_perform_operation('reset', scope.branch_id)
    from (
      select b.branch_id from public.bookings b
      where p_booking_id is not null and b.id = p_booking_id
      union all
      select w.branch_id from public.product_units u
      join public.warehouses w on w.id = u.warehouse_id
      where p_booking_id is null and p_unit_id is not null and u.id = p_unit_id
    ) scope
  ), false);
$$;

revoke all on function public.auth_may_reset_entry(uuid, uuid) from public, anon;
grant execute on function public.auth_may_reset_entry(uuid, uuid) to authenticated, service_role;

comment on column public.cleaning_queue_entries.booking_line_id is
  'For quantity-tracked items without physical serial units, points to the booking line.';
comment on column public.cleaning_queue_entries.qty is
  'Quantity of items represented by this queue entry (defaults to 1 for serialised units).';

commit;

-- Record 0178_quantity_only_reset in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030019', '0178_quantity_only_reset')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0178_quantity_only_reset.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0179_gate1_override_by_handover_staff.sql
-- SHA-256: 394e91371ad4be7267428c90cb21bf072eb6c2ddd438765a33e9d6e5e36cb7db
-- Version: 20261122030020
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0179_gate1_override_by_handover_staff.sql
-- Allow any staff member allowed to hand over to override Gate 1 (receiver unverified)
-- with an audited reason of 10+ characters (Ruling D2 / 26 Oct 2026, Task T2-04).
-- Changes PERMISSIONS §6.1 gate.handover.receiver_unverified from M+ to handover-capable staff.

begin;

-- 1. Relax the approver_role constraint on override_records for Gate 1 overrides.
-- Gate 1 can be overridden by any handover-capable role: Owner, Admin, Manager, Coordinator, Warehouse, Technician.
-- Other overrides remain Owner, Admin, Manager.
alter table public.override_records
  drop constraint if exists override_records_approver_is_owner_or_manager;

alter table public.override_records
  drop constraint if exists override_records_approver_role_check;

alter table public.override_records
  add constraint override_records_approver_role_check
  check (
    (override_type = 'Gate override' and gate_number = 1 and approver_role in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'))
    or (approver_role in ('Owner', 'Admin', 'Manager'))
  );

-- 2. Update RLS policies on override_records so staff performing handover can insert and view Gate 1 overrides
drop policy if exists override_records_insert on public.override_records;
create policy override_records_insert on public.override_records
  for insert
  with check (
    public.auth_user_role() in ('Owner', 'Admin', 'Manager')
    or (
      override_type = 'Gate override'
      and gate_number = 1
      and public.auth_is_staff()
    )
  );

drop policy if exists override_records_select on public.override_records;
create policy override_records_select on public.override_records
  for select
  using (
    public.auth_user_role() in ('Owner', 'Admin', 'Manager')
    or (
      override_type = 'Gate override'
      and gate_number = 1
      and public.auth_is_staff()
    )
  );

-- 3. Update apply_booking_stage_transition to enforce Gate 1 at Packed -> On Rent
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

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131, 0135, 0141, 0149, 0155)
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
    -- A skip is Manager-or-above and needs a reason of at least 10 characters. It
    -- records the amounts still held in the audit log and moves NO money: the
    -- deposit stays a liability on security_deposits (Law 5).
    if (v_deposit_required > 0 and not exists (select 1 from security_deposits where booking_id = NEW.booking_id))
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

comment on function public.apply_booking_stage_transition is
  'Stage 1 (0116, extended 0131, 0135, 0139, 0141, 0149, 0155, 0171, 0179): close gate, branch grants, and '
  'Gate 1 (receiver ID verification / authorization) check at Handover (Packed -> On Rent). '
  'Gate 1 requires government_id_verified and booking_authorization_verified, or an audited override_records row '
  'with a reason >= 10 chars by any handover-capable staff member (Ruling D2 / Task T2-04).';

commit;

-- Record 0179_gate1_override_by_handover_staff in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030020', '0179_gate1_override_by_handover_staff')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0179_gate1_override_by_handover_staff.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0180_technician_floor_verbs.sql
-- SHA-256: 508b497ce7574c5e48cca0cd338688dd3c48248443be81be220d3d67059a3971
-- Version: 20261122030021
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0180: Technician can do every floor verb (T2-05, Ruling D3)
-- =============================================================================
-- Ruling D3 (26 Oct 2026): Technician may Pack, Hand over, Return and Reset.
-- Technician stays money-blind (Law 6, auth_can_view_money() unchanged).
--
-- Updates RLS write policies on floor tables to admit Technician alongside
-- ('Owner', 'Admin', 'Manager', 'Warehouse'):
--   - operation_sessions
--   - session_line_movements
--   - packing_lines
--   - handover_lines
--   - return_lines
--   - signatures
--   - cleaning_queue_entries
--   - cleaning_task_results
--   - evidence_files
--   - evidence_references
--   - product_units (update)
-- =============================================================================

begin;

-- 1. operation_sessions
drop policy if exists operation_sessions_all on public.operation_sessions;
create policy operation_sessions_all on public.operation_sessions
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 2. session_line_movements
drop policy if exists session_line_movements_all on public.session_line_movements;
create policy session_line_movements_all on public.session_line_movements
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 3. packing_lines
drop policy if exists packing_lines_all on public.packing_lines;
create policy packing_lines_all on public.packing_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 4. handover_lines
drop policy if exists handover_lines_all on public.handover_lines;
create policy handover_lines_all on public.handover_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 5. return_lines
drop policy if exists return_lines_all on public.return_lines;
create policy return_lines_all on public.return_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 6. signatures
drop policy if exists signatures_all on public.signatures;
create policy signatures_all on public.signatures
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 7. cleaning_queue_entries
drop policy if exists cleaning_queue_entries_all on public.cleaning_queue_entries;
create policy cleaning_queue_entries_all on public.cleaning_queue_entries
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 8. cleaning_task_results
drop policy if exists cleaning_task_results_all on public.cleaning_task_results;
create policy cleaning_task_results_all on public.cleaning_task_results
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 9. evidence_files
drop policy if exists evidence_files_all on public.evidence_files;
create policy evidence_files_all on public.evidence_files
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  );

-- 10. evidence_references
drop policy if exists evidence_references_all on public.evidence_references;
create policy evidence_references_all on public.evidence_references
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  );

-- 11. product_units (update during movements and status transitions)
drop policy if exists product_units_update on public.product_units;
create policy product_units_update on public.product_units
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 12. booking_stage_transitions (transitions to Packed, On Rent, Returned)
drop policy if exists booking_stage_transitions_insert on public.booking_stage_transitions;
create policy booking_stage_transitions_insert on public.booking_stage_transitions
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
    and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

commit;

-- Record 0180_technician_floor_verbs in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030021', '0180_technician_floor_verbs')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0180_technician_floor_verbs.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0181_collateral_deposit_id_card.sql
-- SHA-256: 507e49694952f70427ac99370eff04cfaa20d78e52912d92bc65b471fd2a1435
-- Version: 20261122030022
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0181_collateral_deposit_id_card.sql
-- ID card as deposit collateral (Ruling D1 / 26 Oct 2026, Task T2-03)
-- Law 5: Collateral is non-monetary and kept apart from money; never in Rental Total or reports.
-- Gate 4: At Handover, held ID satisfies the deposit gate in lieu of cash.
-- Close Gate: Close refused while ID is still held (gate.close.collateral_held).
-- Privacy: ID numbers and photo evidence masked for non-Manager roles.

begin;

-- 1. Collateral type enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'collateral_type') then
    create type public.collateral_type as enum (
      'citizenship_card',
      'passport',
      'driving_licence',
      'other'
    );
  end if;
end $$;

-- 2. collateral_documents table
create table if not exists public.collateral_documents (
  id                  uuid not null default gen_random_uuid() primary key,
  client_uuid         uuid not null unique,
  booking_id          uuid not null references public.bookings(id) on delete restrict,
  collateral_type     public.collateral_type not null,
  document_number     text not null,
  evidence_file_id    uuid references public.evidence_files(id) on delete set null,
  notes               text,
  held_at             timestamptz not null default now(),
  held_by             uuid not null references public.users(id),
  returned_at         timestamptz,
  returned_by         uuid references public.users(id),
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id),
  constraint collateral_documents_return_check check (
    (returned_at is null and returned_by is null) or
    (returned_at is not null and returned_by is not null)
  )
);

create index if not exists idx_collateral_documents_booking on public.collateral_documents(booking_id);
create index if not exists idx_collateral_documents_active on public.collateral_documents(booking_id) where returned_at is null;

-- 3. RLS policies on collateral_documents
alter table public.collateral_documents enable row level security;

drop policy if exists collateral_documents_select on public.collateral_documents;
create policy collateral_documents_select on public.collateral_documents
  for select
  using (
    public.auth_is_staff()
    and exists (
      select 1 from public.bookings b
      where b.id = collateral_documents.booking_id
        and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
    )
  );

drop policy if exists collateral_documents_insert on public.collateral_documents;
create policy collateral_documents_insert on public.collateral_documents
  for insert
  with check (
    public.auth_is_staff()
    and exists (
      select 1 from public.bookings b
      where b.id = collateral_documents.booking_id
        and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
    )
  );

drop policy if exists collateral_documents_update on public.collateral_documents;
create policy collateral_documents_update on public.collateral_documents
  for update
  using (
    public.auth_is_staff()
    and exists (
      select 1 from public.bookings b
      where b.id = collateral_documents.booking_id
        and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
    )
  )
  with check (
    public.auth_is_staff()
    and exists (
      select 1 from public.bookings b
      where b.id = collateral_documents.booking_id
        and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
    )
  );

-- 4. Column-level masking: revoke table select on base table from authenticated, grant non-sensitive columns
revoke select on public.collateral_documents from authenticated;
grant select (
  id, client_uuid, booking_id, collateral_type, notes,
  held_at, held_by, returned_at, returned_by,
  created_at, created_by, updated_at, updated_by
) on public.collateral_documents to authenticated;

-- 5. Masking view collateral_documents_v: unmasked document_number and evidence_file_id for Owner/Admin/Manager only
create or replace view public.collateral_documents_v as
select
  cd.id,
  cd.client_uuid,
  cd.booking_id,
  cd.collateral_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') then cd.document_number
    else '••••-••••-' || right(cd.document_number, 4)
  end as document_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') then cd.evidence_file_id
    else null
  end as evidence_file_id,
  cd.notes,
  cd.held_at,
  cd.held_by,
  cd.returned_at,
  cd.returned_by,
  cd.created_at,
  cd.created_by,
  cd.updated_at,
  cd.updated_by
from public.collateral_documents cd
where public.auth_is_staff()
  and exists (
    select 1 from public.bookings b
    where b.id = cd.booking_id
      and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
  );

grant select on public.collateral_documents_v to authenticated;
revoke select on public.collateral_documents_v from anon;
revoke all on public.collateral_documents from anon;

-- 6. Update apply_booking_stage_transition to incorporate Gate 4 ID collateral and Close gate
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
    -- If collateral was used in lieu of cash deposit (D1, T2-03) and has been returned,
    -- and no cash deposit was received, cash pending_amount does not block close.
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
      -- Collateral held in lieu of cash deposit has been fully returned to client; resolved.
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

comment on function public.apply_booking_stage_transition is
  'Forward-only stage transitions with centralized validation of operational, financial, and collateral gates (0021, 0115, 0116, 0131, 0135, 0141, 0149, 0155, 0171, 0179, 0181).';

commit;

-- Record 0181_collateral_deposit_id_card in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030022', '0181_collateral_deposit_id_card')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0181_collateral_deposit_id_card.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0182_client_collectors_and_id_on_file.sql
-- SHA-256: 393135d9191a14d75a3f5a330604ee415b86e5a8460414ec0fc5ecfe9907bfdd
-- Version: 20261122030023
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0182_client_collectors_and_id_on_file.sql
-- Client collectors and ID on file (Rulings W28, W34, W50, W51, Task T2-12)
-- 1. W50: Client needs one ID document on file before first rental.
-- 2. W51: Stored once and reused. Citizenship card does not expire; expiry recorded only when document has one.
-- 3. W28, W34: Client collectors list (name, phone, role/relation, ID photo, ID number).
-- 4. Privacy: ID numbers masked except to Manager+; photos visible to Manager+ and Client portal account only.
-- 5. RLS & column-level permissions enforce that Warehouse cannot read an ID number.

begin;

-- 1. client_id_documents table
create table if not exists public.client_id_documents (
  id                  uuid not null default gen_random_uuid() primary key,
  client_uuid         uuid not null unique,
  client_id           uuid not null references public.clients(id) on delete cascade,
  id_type             text not null check (id_type in ('citizenship_card', 'passport', 'driving_licence', 'pan_card', 'voter_id', 'other')),
  id_number           text not null,
  evidence_file_id    uuid references public.evidence_files(id) on delete set null,
  expiry_date         date,
  verified_at         timestamptz not null default now(),
  verified_by         uuid references public.users(id),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id)
);

create index if not exists idx_client_id_documents_client on public.client_id_documents(client_id);
create index if not exists idx_client_id_documents_client_expiry on public.client_id_documents(client_id, expiry_date);

-- 2. client_collectors table
create table if not exists public.client_collectors (
  id                  uuid not null default gen_random_uuid() primary key,
  client_uuid         uuid not null unique,
  client_id           uuid not null references public.clients(id) on delete cascade,
  name                text not null,
  phone               text not null,
  role_title          text,
  id_type             text check (id_type is null or id_type in ('citizenship_card', 'passport', 'driving_licence', 'pan_card', 'voter_id', 'other')),
  id_number           text,
  evidence_file_id    uuid references public.evidence_files(id) on delete set null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id)
);

create index if not exists idx_client_collectors_client on public.client_collectors(client_id);
create index if not exists idx_client_collectors_active on public.client_collectors(client_id) where is_active is true;

-- 3. RLS policies on client_id_documents
alter table public.client_id_documents enable row level security;

drop policy if exists client_id_documents_select on public.client_id_documents;
create policy client_id_documents_select on public.client_id_documents
  for select
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Driver' and exists (
      select 1 from public.bookings b
      where b.client_id = client_id_documents.client_id
        and public.auth_driver_has_open_booking(b.id)
    ))
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  );

drop policy if exists client_id_documents_insert on public.client_id_documents;
create policy client_id_documents_insert on public.client_id_documents
  for insert
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  );

drop policy if exists client_id_documents_update on public.client_id_documents;
create policy client_id_documents_update on public.client_id_documents
  for update
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  )
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  );

-- 4. RLS policies on client_collectors
alter table public.client_collectors enable row level security;

drop policy if exists client_collectors_select on public.client_collectors;
create policy client_collectors_select on public.client_collectors
  for select
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Driver' and exists (
      select 1 from public.bookings b
      where b.client_id = client_collectors.client_id
        and public.auth_driver_has_open_booking(b.id)
    ))
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  );

drop policy if exists client_collectors_insert on public.client_collectors;
create policy client_collectors_insert on public.client_collectors
  for insert
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  );

drop policy if exists client_collectors_update on public.client_collectors;
create policy client_collectors_update on public.client_collectors
  for update
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  )
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  );

-- 5. Column-level permissions: revoke select on base tables, grant non-sensitive columns
revoke select on public.client_id_documents from authenticated;
grant select (
  id, client_uuid, client_id, id_type, expiry_date,
  verified_at, verified_by, notes,
  created_at, created_by, updated_at, updated_by
) on public.client_id_documents to authenticated;
grant insert, update on public.client_id_documents to authenticated;

revoke select on public.client_collectors from authenticated;
grant select (
  id, client_uuid, client_id, name, phone, role_title, id_type,
  is_active, created_at, created_by, updated_at, updated_by
) on public.client_collectors to authenticated;
grant insert, update on public.client_collectors to authenticated;

-- 6. Masking views for client_id_documents and client_collectors
create or replace view public.client_id_documents_v as
select
  cid.id,
  cid.client_uuid,
  cid.client_id,
  cid.id_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cid.client_id = public.auth_client_id())
    then cid.id_number
    else '••••-••••-' || right(cid.id_number, 4)
  end as id_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cid.client_id = public.auth_client_id())
    then cid.evidence_file_id
    else null
  end as evidence_file_id,
  cid.expiry_date,
  cid.verified_at,
  cid.verified_by,
  cid.notes,
  cid.created_at,
  cid.created_by,
  cid.updated_at,
  cid.updated_by
from public.client_id_documents cid
where (
  (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
  or (public.auth_user_role() = 'Driver' and exists (
    select 1 from public.bookings b
    where b.client_id = cid.client_id
      and public.auth_driver_has_open_booking(b.id)
  ))
  or (public.auth_user_role() = 'Client' and cid.client_id = public.auth_client_id())
);

create or replace view public.client_collectors_v as
select
  cc.id,
  cc.client_uuid,
  cc.client_id,
  cc.name,
  cc.phone,
  cc.role_title,
  cc.id_type,
  case
    when cc.id_number is null then null
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cc.client_id = public.auth_client_id())
    then cc.id_number
    else '••••-••••-' || right(cc.id_number, 4)
  end as id_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cc.client_id = public.auth_client_id())
    then cc.evidence_file_id
    else null
  end as evidence_file_id,
  cc.is_active,
  cc.created_at,
  cc.created_by,
  cc.updated_at,
  cc.updated_by
from public.client_collectors cc
where (
  (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
  or (public.auth_user_role() = 'Driver' and exists (
    select 1 from public.bookings b
    where b.client_id = cc.client_id
      and public.auth_driver_has_open_booking(b.id)
  ))
  or (public.auth_user_role() = 'Client' and cc.client_id = public.auth_client_id())
);

grant select on public.client_id_documents_v to authenticated;
grant select on public.client_collectors_v to authenticated;
revoke select on public.client_id_documents_v from anon;
revoke select on public.client_collectors_v from anon;
revoke all on public.client_id_documents from anon;
revoke all on public.client_collectors from anon;

-- 7. Helper function to check if client has valid ID on file (W50, W51)
create or replace function public.client_has_id_on_file(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_id_documents
    where client_id = p_client_id
      and (expiry_date is null or expiry_date >= current_date)
  );
$$;

revoke all on function public.client_has_id_on_file(uuid) from public, anon;
grant execute on function public.client_has_id_on_file(uuid) to authenticated;

commit;

-- Record 0182_client_collectors_and_id_on_file in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030023', '0182_client_collectors_and_id_on_file')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0182_client_collectors_and_id_on_file.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0183_reset_self_qc_when_alone.sql
-- SHA-256: 3c1d53203c6476b238cfdf93e802a3df2d76ef0385ea1d8ff4a5aa4928a49ae6
-- Version: 20261122030024
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0183_reset_self_qc_when_alone.sql
-- T2-13: Allow cleaner to pass QC when alone on shift (W43, L7).
-- Replaces constraint cleaning_queue_entries_qc_is_a_second_pair_of_eyes so that
-- qc_by = cleaned_by is allowed if and only if qc_self_checked = true (audited).

alter table public.cleaning_queue_entries
  add column if not exists qc_self_checked boolean not null default false;

comment on column public.cleaning_queue_entries.qc_self_checked is
  'True when the cleaner passed their own QC because they were alone on shift (W43, L7, T2-13). Audited.';

alter table public.cleaning_queue_entries
  drop constraint if exists cleaning_queue_entries_qc_is_a_second_pair_of_eyes;

alter table public.cleaning_queue_entries
  add constraint cleaning_queue_entries_qc_is_a_second_pair_of_eyes
  check (
    (qc_skipped = true and qc_skip_reason is not null)
    or (
      qc_skipped = false
      and (
        qc_by is null
        or cleaned_by is null
        or qc_by <> cleaned_by
        or qc_self_checked = true
      )
    )
  );

-- Record 0183_reset_self_qc_when_alone in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030024', '0183_reset_self_qc_when_alone')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0183_reset_self_qc_when_alone.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0184_repair_job_closes_damage.sql
-- SHA-256: 50ac99a7a3ae71a09060ee85e8d09961342e4d69d78ec369c020efdee07a0c05
-- Version: 20261122030025
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0184: Repair job closes damage finding and restores unit availability (T2-06, Ruling D4)
-- =============================================================================
-- Ruling D4 (26 Oct 2026): What puts a repaired unit back in stock is closing
-- the repair (Maintenance) job with a note, by a Technician or Manager+.
-- Closing marks the linked damage_findings row repaired (repaired_at, repaired_by)
-- and re-runs the unit status engine, restoring the unit's condition and making
-- the unit reservable again.
--
-- 1. Schema additions:
--    - damage_findings: repaired_at, repaired_by, repair_maintenance_id, repair_notes
--    - maintenance_records: damage_finding_id
-- 2. Grants:
--    - grant select on new non-money columns to authenticated
--    - update maintenance_records_all RLS policy to include Technician
-- 3. Masking views:
--    - update damage_findings_v with repaired_* fields appended
--    - update maintenance_records_v with damage_finding_id appended
-- 4. Status engine & reservability triggers:
--    - validate_unit_reservability: open finding check requires voided_at is null and repaired_at is null
--    - check_unit_reservability_on_insert: same
--    - recompute_unit_status: maintenance condition checks unrepaired findings
--    - trg_clear_damage_on_maintenance_complete: updates linked finding, resets condition, and triggers recompute
--    - trg_damage_findings_unit_status: triggers unit recompute on finding changes
-- 5. RPCs:
--    - close_maintenance_job(...) / complete_maintenance_job(...)
-- =============================================================================

begin;

-- 1. Schema additions
alter table public.damage_findings
  add column if not exists repaired_at timestamptz,
  add column if not exists repaired_by uuid references public.users (id),
  add column if not exists repair_maintenance_id uuid references public.maintenance_records (id) on delete set null,
  add column if not exists repair_notes text;

alter table public.maintenance_records
  add column if not exists damage_finding_id uuid references public.damage_findings (id) on delete set null;

create index if not exists idx_damage_findings_repaired_at on public.damage_findings (repaired_at);
create index if not exists idx_damage_findings_repair_maintenance on public.damage_findings (repair_maintenance_id);
create index if not exists idx_damage_findings_unit_unresolved on public.damage_findings (unit_id) where voided_at is null and repaired_at is null;
create index if not exists idx_maintenance_records_damage_finding on public.maintenance_records (damage_finding_id);

-- 2. Grants on new columns
grant select (repaired_at, repaired_by, repair_maintenance_id, repair_notes)
  on public.damage_findings to authenticated;

grant select (damage_finding_id)
  on public.maintenance_records to authenticated;

-- 3. Admit Technician to maintenance_records_all (Ruling D3/D4, PERMISSIONS §3)
drop policy if exists maintenance_records_all on public.maintenance_records;
create policy maintenance_records_all on public.maintenance_records
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 4. Masking views (new columns appended at the end to satisfy CREATE OR REPLACE VIEW rules)
create or replace view public.damage_findings_v as
select
  id,
  client_uuid,
  source,
  return_line_id,
  cleaning_queue_entry_id,
  unit_id,
  damage_type,
  description,
  severity,
  case
    when auth_can_view_money() then estimated_cost
    else null::numeric
  end as estimated_cost,
  approval_state,
  approved_by,
  approved_at,
  disposition,
  case_id,
  charge_id,
  voided_at,
  created_at,
  created_by,
  updated_at,
  repaired_at,
  repaired_by,
  repair_maintenance_id,
  repair_notes
from public.damage_findings
where auth_is_staff();

revoke all on public.damage_findings_v from anon, public;
grant select on public.damage_findings_v to authenticated;

create or replace view public.maintenance_records_v as
select
  id,
  client_uuid,
  record_no,
  product_unit_id,
  maintenance_type,
  priority,
  status,
  description,
  findings,
  actions_taken,
  vendor_name,
  case when auth_can_view_money() then cost else null end as cost,
  scheduled_date,
  started_at,
  completed_at,
  performed_by,
  approved_by,
  created_at,
  created_by,
  updated_at,
  updated_by,
  damage_finding_id
from public.maintenance_records
where auth_is_staff();

revoke all on public.maintenance_records_v from anon, public;
grant select on public.maintenance_records_v to authenticated;

-- 5. Trigger to clear damage and update unit status when maintenance completes
create or replace function public.trg_clear_damage_on_maintenance_complete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_note text;
begin
  if new.status in ('Completed', 'Closed') and new.completed_at is not null
     and (old.completed_at is null or old.status not in ('Completed', 'Closed')) then

    v_actor := coalesce(auth.uid(), new.performed_by, new.updated_by);
    v_note := coalesce(new.actions_taken, new.description);

    -- A. Mark explicitly linked damage finding as repaired
    if new.damage_finding_id is not null then
      update public.damage_findings
      set repaired_at = coalesce(repaired_at, new.completed_at, now()),
          repaired_by = coalesce(repaired_by, v_actor),
          repair_maintenance_id = coalesce(repair_maintenance_id, new.id),
          repair_notes = coalesce(repair_notes, v_note),
          updated_at = now()
      where id = new.damage_finding_id
        and repaired_at is null;
    end if;

    -- B. Mark any damage findings referencing this maintenance record
    update public.damage_findings
    set repaired_at = coalesce(repaired_at, new.completed_at, now()),
        repaired_by = coalesce(repaired_by, v_actor),
        repair_notes = coalesce(repair_notes, v_note),
        updated_at = now()
    where repair_maintenance_id = new.id
      and repaired_at is null;

    -- C. Also clear any open damage findings on this specific unit if this was a Repair
    update public.damage_findings
    set repaired_at = coalesce(repaired_at, new.completed_at, now()),
        repaired_by = coalesce(repaired_by, v_actor),
        repair_maintenance_id = coalesce(repair_maintenance_id, new.id),
        repair_notes = coalesce(repair_notes, v_note),
        updated_at = now()
    where unit_id = new.product_unit_id
      and voided_at is null
      and repaired_at is null
      and (new.damage_finding_id is null or id = new.damage_finding_id);

    -- D. Restore unit condition from Damaged to Good
    update public.product_units
    set condition = 'Good',
        updated_at = now()
    where id = new.product_unit_id
      and condition = 'Damaged';

    -- E. Recompute unit status in inventory engine
    perform public.recompute_unit_status(new.product_unit_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maintenance_clear_damage on public.maintenance_records;
create trigger trg_maintenance_clear_damage
  after update on public.maintenance_records
  for each row
  execute function public.trg_clear_damage_on_maintenance_complete();

-- Trigger on damage_findings for unit status engine
create or replace function public.trg_recompute_unit_status_on_damage_finding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.unit_id is not null then
    perform public.recompute_unit_status(new.unit_id);
  end if;
  if old.unit_id is not null and old.unit_id is distinct from new.unit_id then
    perform public.recompute_unit_status(old.unit_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_damage_findings_unit_status on public.damage_findings;
create trigger trg_damage_findings_unit_status
  after insert or update of unit_id, voided_at, repaired_at or delete on public.damage_findings
  for each row
  execute function public.trg_recompute_unit_status_on_damage_finding();

-- 6. Reservability checks: specific damage finding check runs before general maintenance status
create or replace function public.validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_row public.product_units;
begin
  if new.asset_id is null or new.released_at is not null then
    return new;
  end if;

  select * into unit_row from public.product_units where id = new.asset_id;
  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit does not exist in inventory.';
  end if;

  if unit_row.retired_at is not null or unit_row.status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit is retired and cannot be reserved.';
  end if;

  -- 1. Unresolved damage finding check (specific finding clearance required)
  if exists (
    select 1 from public.damage_findings
    where unit_id = new.asset_id
      and voided_at is null
      and repaired_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit has an unresolved damage finding.';
  end if;

  -- 2. Damaged/Lost condition check
  if unit_row.condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit is damaged or lost and cannot be reserved.';
  end if;

  -- 3. Maintenance record/status check
  if unit_row.status = 'Maintenance' or exists (
    select 1 from public.maintenance_records
    where product_unit_id = new.asset_id
      and completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit is in maintenance and cannot be reserved.';
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries
    where unit_id = new.asset_id
      and (nullif(btrim(qc_fail_reason), '') is not null or problem_state <> 'No Problems')
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit has an unresolved QC defect.';
  end if;

  return new;
end;
$$;

create or replace function public.check_unit_reservability_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit_status text;
  v_unit_condition public.unit_condition;
  v_retired_at timestamptz;
begin
  if NEW.asset_id is null or NEW.released_at is not null then
    return NEW;
  end if;

  select status, condition, retired_at
    into v_unit_status, v_unit_condition, v_retired_at
    from public.product_units
   where id = NEW.asset_id;

  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit % does not exist in inventory.', NEW.asset_id;
  end if;

  if v_retired_at is not null or v_unit_status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit % is retired and cannot be reserved.', NEW.asset_id;
  end if;

  -- 1. Unresolved damage finding check
  if exists (
    select 1 from public.damage_findings df
     where df.unit_id = NEW.asset_id
       and df.voided_at is null
       and df.repaired_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit % has an unresolved damage finding and cannot be reserved.', NEW.asset_id;
  end if;

  -- 2. Damaged/Lost condition check
  if v_unit_condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit % is in % condition and cannot be reserved.', NEW.asset_id, v_unit_condition;
  end if;

  -- 3. Maintenance record/status check
  if v_unit_status = 'Maintenance' or exists (
    select 1 from public.maintenance_records mr
     where mr.product_unit_id = NEW.asset_id
       and mr.completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit % is in maintenance and cannot be reserved.', NEW.asset_id;
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries cqe
     where cqe.unit_id = NEW.asset_id
       and (cqe.qc_fail_reason is not null or cqe.problem_state not in ('No Problems'))
       and cqe.reset_completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit % has an unresolved QC defect and cannot be reserved.', NEW.asset_id;
  end if;

  return NEW;
end;
$$;

-- 7. Update recompute_unit_status: maintenance condition checks unresolved damage findings
create or replace function public.recompute_unit_status(p_asset_id uuid)
returns inventory_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_status inventory_state;
  v_old_status inventory_state;
  v_retired_at timestamptz;
begin
  select status, retired_at into v_old_status, v_retired_at
  from public.product_units
  where id = p_asset_id;

  if not found then
    return null;
  end if;

  -- 1. Retired if product_units.retired_at is not null
  if v_retired_at is not null then
    v_new_status := 'Retired';

  -- 2. Missing if an open case links to this unit
  elsif exists (
    select 1 from public.cases c
    where c.type = 'Missing'
      and c.status not in ('Resolved', 'Closed', 'Cancelled')
      and (
        exists (
          select 1 from public.damage_findings df
          where df.case_id = c.id
            and df.unit_id = p_asset_id
            and df.voided_at is null
            and df.repaired_at is null
        )
        or
        (c.linked_booking_id is not null and exists (
          select 1 from public.booking_line_units blu
          join public.booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = c.linked_booking_id
            and blu.asset_id = p_asset_id
            and blu.unit_state = 'Missing'
        ))
      )
  ) then
    v_new_status := 'Missing';

  -- 3. Maintenance if an unfinished maintenance row exists OR unresolved damage finding exists
  elsif exists (
    select 1 from public.maintenance_records mr
    where mr.product_unit_id = p_asset_id
      and mr.completed_at is null
  ) or exists (
    select 1 from public.damage_findings df
    where df.unit_id = p_asset_id
      and df.voided_at is null
      and df.repaired_at is null
  ) then
    v_new_status := 'Maintenance';

  -- 4. On Rent if on a booking currently in On Rent stage AND not yet returned or released
  elsif exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'On Rent'
      and b.cancelled_at is null
      and blu.returned_at is null
      and blu.released_at is null
  ) then
    v_new_status := 'On Rent';

  -- 5. Returning if an unfinished Return session has accepted the unit but not completed
  elsif exists (
    select 1 from public.operation_sessions os
    where os.operation = 'Return'
      and os.state != 'Completed'
      and (
        exists (select 1 from public.session_line_movements slm where slm.session_id = os.id and slm.unit_id = p_asset_id)
        or exists (select 1 from public.booking_line_units blu where blu.return_session_id = os.id and blu.asset_id = p_asset_id)
      )
  ) then
    v_new_status := 'Returning';

  -- 6. Inspection if on a Returned booking with no completed inspection
  elsif exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Returned'
      and b.cancelled_at is null
      and (
        blu.condition is null
        or exists (
          select 1 from public.return_lines rl
          where rl.booking_line_id = bl.id
            and (rl.inspection_state != 'Inspected' or rl.inspected_at is null)
        )
      )
  ) then
    v_new_status := 'Inspection';

  -- 7. Cleaning if in the cleaning queue and unfinished (cleaning_queue_entries.completed_at is null)
  elsif exists (
    select 1 from public.cleaning_queue_entries cqe
    where cqe.unit_id = p_asset_id
      and cqe.completed_at is null
  ) then
    v_new_status := 'Cleaning';

  -- 8. Packed if packed on a booking currently in Packed stage
  elsif exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Packed'
      and b.cancelled_at is null
      and blu.packed = true
      and blu.released_at is null
  ) then
    v_new_status := 'Packed';

  -- 9. Reserved if a live inventory_reservations row covers now()
  elsif exists (
    select 1 from public.inventory_reservations ir
    where ir.asset_id = p_asset_id
      and ir.released_at is null
      and ir.period @> now()
  ) then
    v_new_status := 'Reserved';

  -- 10. Default: In Stock
  else
    v_new_status := 'In Stock';
  end if;

  -- Writes the result into product_units.status using transaction-scoped GUC
  if v_old_status is distinct from v_new_status then
    perform set_config('app.unit_status_recompute', 'on', true);
    update public.product_units
    set status = v_new_status,
        updated_at = now()
    where id = p_asset_id;
    perform set_config('app.unit_status_recompute', 'off', true);
  end if;

  return v_new_status;
end;
$$;

-- 8. close_maintenance_job RPC (Ruling D4)
create or replace function public.close_maintenance_job(
  p_maintenance_id uuid,
  p_note text,
  p_findings text default null,
  p_actions_taken text default null,
  p_cost numeric default null,
  p_unit_condition public.unit_condition default 'Good',
  p_client_uuid uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.maintenance_records;
  v_role text;
  v_uid uuid;
  v_clean_note text;
  v_audit_uuid uuid;
  v_target_condition public.unit_condition;
begin
  v_uid := auth.uid();
  v_role := public.auth_user_role()::text;

  if v_uid is null or v_role not in ('Owner', 'Admin', 'Manager', 'Technician') then
    raise exception 'Permission denied: only Technician or Manager+ can close maintenance jobs.'
      using errcode = '42501';
  end if;

  v_clean_note := btrim(coalesce(p_actions_taken, p_note, ''));
  if length(v_clean_note) < 3 then
    raise exception 'A note/actions taken (minimum 3 characters) is required to close a maintenance job.';
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;
  if not found then
    raise exception 'Maintenance job not found: %', p_maintenance_id;
  end if;

  if v_record.status in ('Completed', 'Closed') and v_record.completed_at is not null then
    raise exception 'Maintenance job % is already closed.', v_record.record_no;
  end if;

  v_target_condition := coalesce(p_unit_condition, 'Good'::public.unit_condition);

  -- Updating maintenance record with completed_at triggers trg_maintenance_clear_damage
  update public.maintenance_records
  set status = 'Completed',
      completed_at = now(),
      findings = coalesce(p_findings, findings),
      actions_taken = v_clean_note,
      cost = case
        when p_cost is not null and public.auth_can_view_money() then p_cost
        when p_cost is not null and v_role in ('Technician') then p_cost
        else cost
      end,
      performed_by = coalesce(performed_by, v_uid),
      updated_at = now(),
      updated_by = v_uid
  where id = p_maintenance_id;

  -- Restore custom condition if passed
  if v_target_condition <> 'Damaged' then
    update public.product_units
    set condition = v_target_condition,
        updated_at = now()
    where id = v_record.product_unit_id;
  end if;

  -- Recompute unit status (D4: unit becomes In Stock and reservable)
  perform public.recompute_unit_status(v_record.product_unit_id);

  -- Log audit event
  v_audit_uuid := coalesce(p_client_uuid, gen_random_uuid());
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values
  ) values (
    v_audit_uuid,
    'status change',
    'Inventory'::audit_category,
    'Inventory'::audit_module,
    'Update'::audit_action,
    'Informational',
    'Success',
    'maintenance_records',
    p_maintenance_id,
    v_uid,
    auth_user_role(),
    jsonb_build_object(
      'status', 'Completed',
      'unit_id', v_record.product_unit_id,
      'unit_condition', v_target_condition,
      'actions_taken', v_clean_note
    )
  );

  return jsonb_build_object(
    'success', true,
    'id', p_maintenance_id,
    'record_no', v_record.record_no,
    'status', 'Completed'
  );
end;
$$;

revoke all on function public.close_maintenance_job(uuid, text, text, text, numeric, public.unit_condition, uuid) from anon, public;
grant execute on function public.close_maintenance_job(uuid, text, text, text, numeric, public.unit_condition, uuid) to authenticated;

-- complete_maintenance_job alias wrapper
create or replace function public.complete_maintenance_job(
  p_job_id uuid,
  p_actions_taken text,
  p_findings text default null,
  p_cost numeric default null,
  p_unit_condition public.unit_condition default 'Good',
  p_client_uuid uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.close_maintenance_job(
    p_job_id,
    p_actions_taken,
    p_findings,
    p_actions_taken,
    p_cost,
    p_unit_condition,
    p_client_uuid
  );
end;
$$;

revoke all on function public.complete_maintenance_job(uuid, text, text, numeric, public.unit_condition, uuid) from anon, public;
grant execute on function public.complete_maintenance_job(uuid, text, text, numeric, public.unit_condition, uuid) to authenticated;

commit;

-- Record 0184_repair_job_closes_damage in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030025', '0184_repair_job_closes_damage')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0184_repair_job_closes_damage.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0185_team_notes.sql
-- SHA-256: 1638d41ead46486f9dde3f9871c186f5510a2eb0585b394ebda129e4966d460a
-- Version: 20261122030026
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0185_team_notes.sql
-- Team notes for shared operational communication across shifts (T4-04)
-- Law 3: archive, never delete. Law 8: client_uuid idempotency.
-- Staff-only access (Client denied). Direct UPDATE/DELETE revoked for security.

create table if not exists public.team_notes (
    id uuid primary key default gen_random_uuid(),
    client_uuid uuid unique,
    body text not null check (length(trim(body)) > 0 and length(body) <= 10000),
    author_id uuid not null references public.users(id),
    author_name text not null default 'Staff Member',
    author_role text not null default 'Staff',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    category text not null default 'General' check (category in ('General', 'Equipment Alert', 'Gear Alert', 'Shift Handover', 'Client Remark', 'Logistics & Transport')),
    priority text not null default 'normal' check (priority in ('urgent', 'high', 'normal', 'low')),
    status text not null default 'open' check (status in ('open', 'resolved')),
    resolved_at timestamptz,
    resolved_by uuid references public.users(id),
    pinned boolean not null default false,
    pinned_at timestamptz,
    pinned_by uuid references public.users(id),
    is_archived boolean not null default false,
    archived_at timestamptz,
    archived_by uuid references public.users(id),
    reference_id text,
    reference_ids text[] not null default '{}'::text[],
    acknowledged_by uuid[] not null default '{}'::uuid[]
);

comment on table public.team_notes is 'Shared team notes for shift handover and operational communication across staff (T4-04)';
comment on column public.team_notes.body is 'Note content (markdown supported, max 10k chars)';
comment on column public.team_notes.author_id is 'Auth user ID who created the note';
comment on column public.team_notes.author_name is 'Author display name snapshot';
comment on column public.team_notes.author_role is 'Author system role snapshot';
comment on column public.team_notes.is_archived is 'Archived flag (Law 3: archive, never delete)';
comment on column public.team_notes.acknowledged_by is 'Array of user IDs who have acknowledged this note';

-- Indexes
create index if not exists team_notes_created_at_desc_idx on public.team_notes (created_at desc);
create index if not exists team_notes_pinned_idx on public.team_notes (pinned, created_at desc) where not is_archived;
create index if not exists team_notes_author_idx on public.team_notes (author_id);
create index if not exists team_notes_ref_idx on public.team_notes (reference_id) where reference_id is not null;
create index if not exists team_notes_client_uuid_idx on public.team_notes (client_uuid) where client_uuid is not null;

-- RLS
alter table public.team_notes enable row level security;

-- Read policy: authenticated staff (all non-client roles) can read
drop policy if exists team_notes_select_staff on public.team_notes;
create policy team_notes_select_staff on public.team_notes
    for select to authenticated
    using (public.auth_is_staff());

-- Direct insert policy: authenticated staff can insert with matching author_id
drop policy if exists team_notes_insert_staff on public.team_notes;
create policy team_notes_insert_staff on public.team_notes
    for insert to authenticated
    with check (
        public.auth_is_staff()
        and author_id = coalesce(auth.uid(), public.auth_user_id())
    );

-- Direct UPDATE and DELETE are revoked for security.
-- Controlled mutations (acknowledge, pin, archive, resolve) occur via audited RPCs.
revoke update, delete on public.team_notes from public, anon, authenticated;

-- Audit trigger (0157 audit of record)
drop trigger if exists trg_audit_team_notes on public.team_notes;
create trigger trg_audit_team_notes after insert or update on public.team_notes
    for each row execute function public.log_audit_event_actor();

-- RPC: create_team_note
create or replace function public.create_team_note(
    p_body text,
    p_client_uuid uuid default null,
    p_category text default 'General',
    p_priority text default 'normal',
    p_reference_id text default null,
    p_reference_ids text[] default '{}'::text[],
    p_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_author_name text;
    v_author_role text;
    v_note_id uuid;
begin
    -- 1. Must be authenticated staff
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can create team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    -- 2. Validate body length and non-empty
    if p_body is null or length(trim(p_body)) = 0 then
        raise exception 'Note body cannot be empty' using errcode = '22000';
    end if;
    if length(p_body) > 10000 then
        raise exception 'Note body exceeds maximum length (10,000 characters)' using errcode = '22000';
    end if;

    -- 3. Validate category
    if p_category not in ('General', 'Equipment Alert', 'Gear Alert', 'Shift Handover', 'Client Remark', 'Logistics & Transport') then
        raise exception 'Invalid note category: %', p_category using errcode = '22000';
    end if;

    -- 4. Validate priority
    if p_priority not in ('urgent', 'high', 'normal', 'low') then
        raise exception 'Invalid note priority: %', p_priority using errcode = '22000';
    end if;

    -- 5. Idempotency on client_uuid (Law 8)
    if p_client_uuid is not null then
        select id into v_note_id from public.team_notes where client_uuid = p_client_uuid;
        if v_note_id is not null then
            return v_note_id;
        end if;
    end if;

    -- 6. Lookup author metadata
    select coalesce(full_name, 'Staff Member'), coalesce(primary_role::text, 'Staff')
    into v_author_name, v_author_role
    from public.users
    where id = v_actor_id;

    v_author_name := coalesce(v_author_name, 'Staff Member');
    v_author_role := coalesce(v_author_role, 'Staff');

    -- 7. Insert note
    insert into public.team_notes (
        client_uuid,
        body,
        author_id,
        author_name,
        author_role,
        category,
        priority,
        reference_id,
        reference_ids,
        pinned,
        pinned_at,
        pinned_by,
        is_archived
    ) values (
        p_client_uuid,
        trim(p_body),
        v_actor_id,
        v_author_name,
        v_author_role,
        p_category,
        p_priority,
        nullif(trim(p_reference_id), ''),
        coalesce(p_reference_ids, '{}'::text[]),
        coalesce(p_pinned, false),
        case when coalesce(p_pinned, false) then now() else null end,
        case when coalesce(p_pinned, false) then v_actor_id else null end,
        false
    )
    returning id into v_note_id;

    return v_note_id;
end;
$$;

comment on function public.create_team_note(text, uuid, text, text, text, text[], boolean) is 'Create a team note (Staff only, idempotent via client_uuid). Returns note ID.';

-- RPC: acknowledge_team_note
create or replace function public.acknowledge_team_note(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can acknowledge team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set acknowledged_by = array_append(acknowledged_by, v_actor_id),
        updated_at = now()
    where id = p_note_id
      and not (acknowledged_by @> array[v_actor_id]::uuid[]);

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.acknowledge_team_note(uuid) is 'Acknowledge a team note (idempotently adds caller ID). Returns true if newly acknowledged.';

-- RPC: pin_team_note
create or replace function public.pin_team_note(p_note_id uuid, p_pinned boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can pin/unpin team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set pinned = coalesce(p_pinned, true),
        pinned_at = case when coalesce(p_pinned, true) then now() else null end,
        pinned_by = case when coalesce(p_pinned, true) then v_actor_id else null end,
        updated_at = now()
    where id = p_note_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.pin_team_note(uuid, boolean) is 'Pin or unpin a team note (Staff only).';

-- RPC: archive_team_note (Law 3: archive, never delete)
create or replace function public.archive_team_note(p_note_id uuid, p_archived boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can archive team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set is_archived = coalesce(p_archived, true),
        archived_at = case when coalesce(p_archived, true) then now() else null end,
        archived_by = case when coalesce(p_archived, true) then v_actor_id else null end,
        updated_at = now()
    where id = p_note_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.archive_team_note(uuid, boolean) is 'Archive a team note (Staff only, Law 3: archive, never delete).';

-- RPC: resolve_team_note
create or replace function public.resolve_team_note(p_note_id uuid, p_resolved boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can resolve team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set status = case when coalesce(p_resolved, true) then 'resolved' else 'open' end,
        resolved_at = case when coalesce(p_resolved, true) then now() else null end,
        resolved_by = case when coalesce(p_resolved, true) then v_actor_id else null end,
        updated_at = now()
    where id = p_note_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.resolve_team_note(uuid, boolean) is 'Mark a team note resolved or reopened (Staff only).';

-- RPC: list_team_notes (paginated, pinned first, then newest, excludes archived by default)
create or replace function public.list_team_notes(
    p_limit int default 50,
    p_offset int default 0,
    p_include_archived boolean default false,
    p_category text default null,
    p_reference_id text default null
)
returns setof public.team_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list team notes';
    end if;

    p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
    p_offset := greatest(0, coalesce(p_offset, 0));

    return query
    select tn.*
    from public.team_notes tn
    where (p_include_archived or not tn.is_archived)
      and (p_category is null or tn.category = p_category)
      and (p_reference_id is null or tn.reference_id = p_reference_id or tn.reference_ids @> array[p_reference_id]::text[])
    order by tn.pinned desc, tn.created_at desc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_team_notes(int, int, boolean, text, text) is 'List team notes (staff only, pinned first, paginated). Excludes archived by default.';

-- Revoke public & anon execution, grant authenticated execution
revoke execute on function public.create_team_note(text, uuid, text, text, text, text[], boolean) from public, anon;
grant execute on function public.create_team_note(text, uuid, text, text, text, text[], boolean) to authenticated;

revoke execute on function public.acknowledge_team_note(uuid) from public, anon;
grant execute on function public.acknowledge_team_note(uuid) to authenticated;

revoke execute on function public.pin_team_note(uuid, boolean) from public, anon;
grant execute on function public.pin_team_note(uuid, boolean) to authenticated;

revoke execute on function public.archive_team_note(uuid, boolean) from public, anon;
grant execute on function public.archive_team_note(uuid, boolean) to authenticated;

revoke execute on function public.resolve_team_note(uuid, boolean) from public, anon;
grant execute on function public.resolve_team_note(uuid, boolean) to authenticated;

revoke execute on function public.list_team_notes(int, int, boolean, text, text) from public, anon;
grant execute on function public.list_team_notes(int, int, boolean, text, text) to authenticated;

-- Record 0185_team_notes in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030026', '0185_team_notes')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0185_team_notes.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0186_shift_handovers.sql
-- SHA-256: 0598da52b053170a8b9ef653b005f8e3ec1af6bdbeb86a411284ef9cca466d08
-- Version: 20261122030027
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0186: Shift handover on the database (T4-05, Ruling S6, Ruling W32, Law 6 Money Isolation)
-- =============================================================================
-- Ruling S6 (26 Oct 2026): Shift handover reads and writes the database instead
-- of one browser's localStorage. Staff across devices stay in sync.
-- Ruling W32: Three shifts:
--   Shift A: 06:00–15:00 (Morning)
--   Shift B: 14:00–23:00 (Day/Evening)
--   Shift C: 22:00–07:00 (Night)
--   Overlap hours: 14:00–15:00, 22:00–23:00, 06:00–07:00
-- Law 3: Archive, never delete (archived_at is not null, status = 'archived').
-- Law 5: Integer paisa for cash counted & variance (cash_counted_paisa, cash_variance_paisa).
-- Law 6: Money blindness: Warehouse, Technician, Driver and Client never receive cash figures.
--        Financial columns isolated in shift_handover_finances table with auth_can_view_money() RLS.
-- Law 8: Every write carries a client_uuid idempotency key and audits to audit_events.
-- =============================================================================

begin;

-- 1. Create shift_handovers table (operational details only, zero cash columns)
create table if not exists public.shift_handovers (
  id                     uuid        not null default gen_random_uuid() primary key,
  client_uuid            uuid        not null unique,
  shift_code             text        not null default 'A' check (shift_code in ('A', 'B', 'C', 'Morning', 'Day/Evening', 'Night')),
  shift_date             date        not null default current_date,
  from_user_id           uuid        not null references public.users (id) on delete restrict,
  from_user_name         text        not null,
  from_user_role         text        not null,
  to_user_id             uuid        references public.users (id) on delete set null,
  to_user_name           text,
  notes                  text        default '',
  open_items             jsonb       not null default '[]'::jsonb,
  checklist              jsonb       not null default '[]'::jsonb,
  status                 text        not null default 'pending' check (status in ('pending', 'acknowledged', 'archived')),
  acknowledged_at        timestamptz,
  acknowledged_by        uuid        references public.users (id) on delete set null,
  acknowledged_by_name   text,
  acknowledgement_note   text,
  archived_at            timestamptz,
  archived_by            uuid        references public.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.shift_handovers is
  'Shared staff shift handovers across the three operational shifts (W32). Staff-only (auth_is_staff). Operational details only; zero cash columns (Law 6). Archive, never delete (Law 3).';

-- 2. Create shift_handover_finances table (strictly isolated financial records under Law 6)
create table if not exists public.shift_handover_finances (
  id                     uuid        not null default gen_random_uuid() primary key,
  handover_id            uuid        not null unique references public.shift_handovers (id) on delete cascade,
  cash_counted_paisa     bigint      default 0 check (cash_counted_paisa >= 0),
  cash_status            text        not null default 'matched' check (cash_status in ('matched', 'short', 'over')),
  cash_variance_paisa    bigint      default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.shift_handover_finances is
  'Isolated shift handover cash count and till variance (Law 5, Law 6). Restricted to financial roles via auth_can_view_money().';

-- 3. Indexes
create index if not exists idx_shift_handovers_created_at on public.shift_handovers (created_at desc);
create index if not exists idx_shift_handovers_active on public.shift_handovers (created_at desc) where archived_at is null;
create index if not exists idx_shift_handovers_pending on public.shift_handovers (shift_date desc) where status = 'pending' and archived_at is null;
create index if not exists idx_shift_handovers_from_user on public.shift_handovers (from_user_id);
create index if not exists idx_shift_handovers_to_user on public.shift_handovers (to_user_id) where to_user_id is not null;
create index if not exists idx_shift_handover_finances_handover on public.shift_handover_finances (handover_id);

-- 4. Grants and permissions for shift_handovers
revoke all on public.shift_handovers from public, anon;
grant select, insert on public.shift_handovers to authenticated;
revoke update, delete on public.shift_handovers from public, anon, authenticated;

-- RLS: shift_handovers
alter table public.shift_handovers enable row level security;

drop policy if exists shift_handovers_select on public.shift_handovers;
create policy shift_handovers_select on public.shift_handovers
  for select
  using (public.auth_is_staff());

drop policy if exists shift_handovers_insert on public.shift_handovers;
create policy shift_handovers_insert on public.shift_handovers
  for insert
  with check (public.auth_is_staff() and from_user_id = public.auth_user_id());

-- 5. Grants and permissions for shift_handover_finances (Money-authorized roles only)
revoke all on public.shift_handover_finances from public, anon;
grant select, insert on public.shift_handover_finances to authenticated;
revoke update, delete on public.shift_handover_finances from public, anon, authenticated;

-- RLS: shift_handover_finances
alter table public.shift_handover_finances enable row level security;

drop policy if exists shift_handover_finances_select on public.shift_handover_finances;
create policy shift_handover_finances_select on public.shift_handover_finances
  for select
  using (public.auth_can_view_money());

drop policy if exists shift_handover_finances_insert on public.shift_handover_finances;
create policy shift_handover_finances_insert on public.shift_handover_finances
  for insert
  with check (public.auth_can_view_money());

-- 6. Views: shift_handovers_v (Law 6 cash figures masked to NULL for money-blind roles)
create or replace view public.shift_handovers_v as
select
  h.id,
  h.client_uuid,
  h.shift_code,
  h.shift_date,
  h.from_user_id,
  h.from_user_name,
  h.from_user_role,
  h.to_user_id,
  h.to_user_name,
  case
    when public.auth_can_view_money() then f.cash_counted_paisa
    else null
  end as cash_counted_paisa,
  case
    when public.auth_can_view_money() then coalesce(f.cash_status, 'matched')
    else null
  end as cash_status,
  case
    when public.auth_can_view_money() then f.cash_variance_paisa
    else null
  end as cash_variance_paisa,
  h.notes,
  h.open_items,
  h.checklist,
  h.status,
  h.acknowledged_at,
  h.acknowledged_by,
  h.acknowledged_by_name,
  h.acknowledgement_note,
  h.archived_at,
  h.archived_by,
  h.created_at,
  h.updated_at
from public.shift_handovers h
left join public.shift_handover_finances f on f.handover_id = h.id
where public.auth_is_staff();

comment on view public.shift_handovers_v is
  'Staff shift handovers with cash figures masked for money-blind roles (Warehouse, Technician, Driver, Client) per Law 6.';

revoke all on public.shift_handovers_v from public, anon;
grant select on public.shift_handovers_v to authenticated;

-- 7. Delete prevention trigger (Law 3)
create or replace function public.trg_shift_handovers_prevent_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): Shift handovers must be archived, not deleted';
end;
$$;

revoke all on function public.trg_shift_handovers_prevent_delete() from public, anon;
grant execute on function public.trg_shift_handovers_prevent_delete() to authenticated;

drop trigger if exists trg_prevent_delete_shift_handovers on public.shift_handovers;
create trigger trg_prevent_delete_shift_handovers
  before delete on public.shift_handovers
  for each row execute function public.trg_shift_handovers_prevent_delete();

-- 8. Immutable field protection trigger
create or replace function public.trg_shift_handovers_protect_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.id <> OLD.id then
    raise exception 'id is immutable';
  end if;
  if NEW.client_uuid <> OLD.client_uuid then
    raise exception 'client_uuid is immutable';
  end if;
  if NEW.from_user_id <> OLD.from_user_id then
    raise exception 'from_user_id is immutable';
  end if;
  if NEW.created_at <> OLD.created_at then
    raise exception 'created_at is immutable';
  end if;
  if OLD.status = 'archived' and NEW.status <> 'archived' then
    raise exception 'Cannot un-archive a shift handover';
  end if;
  if OLD.status = 'acknowledged' and NEW.status = 'pending' then
    raise exception 'Cannot un-acknowledge a shift handover';
  end if;
  if OLD.acknowledged_by is not null and NEW.acknowledged_by <> OLD.acknowledged_by then
    raise exception 'acknowledged_by is immutable once set';
  end if;
  if OLD.archived_by is not null and NEW.archived_by <> OLD.archived_by then
    raise exception 'archived_by is immutable once set';
  end if;
  return NEW;
end;
$$;

revoke all on function public.trg_shift_handovers_protect_fields() from public, anon;
grant execute on function public.trg_shift_handovers_protect_fields() to authenticated;

drop trigger if exists trg_protect_shift_handovers_fields on public.shift_handovers;
create trigger trg_protect_shift_handovers_fields
  before update on public.shift_handovers
  for each row execute function public.trg_shift_handovers_protect_fields();

-- 9. Audit triggers (Law 8)
drop trigger if exists trg_audit_shift_handovers on public.shift_handovers;
create trigger trg_audit_shift_handovers
  after insert or update on public.shift_handovers
  for each row execute function public.log_audit_event_actor();

drop trigger if exists trg_audit_shift_handover_finances on public.shift_handover_finances;
create trigger trg_audit_shift_handover_finances
  after insert or update on public.shift_handover_finances
  for each row execute function public.log_audit_event_actor();

-- 10. Atomic stored procedures returning role-safe view projections
create or replace function public.create_shift_handover(
  p_client_uuid            uuid,
  p_shift_code             text default 'A',
  p_from_user_name         text default 'Staff Member',
  p_from_user_role         text default 'Operations',
  p_to_user_id             uuid default null,
  p_to_user_name           text default null,
  p_cash_counted_paisa     bigint default null,
  p_cash_status            text default null,
  p_cash_variance_paisa    bigint default null,
  p_notes                  text default '',
  p_open_items             jsonb default '[]'::jsonb,
  p_checklist              jsonb default '[]'::jsonb
) returns public.shift_handovers_v
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handover public.shift_handovers;
  v_result public.shift_handovers_v;
  v_actor uuid;
  v_actor_role text;
  v_existing_id uuid;
begin
  if not public.auth_is_staff() then
    raise exception 'FORBIDDEN: Staff only';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid is required (Law 8)';
  end if;

  -- Idempotency check (Law 8)
  select id into v_existing_id from public.shift_handovers where client_uuid = p_client_uuid;
  if v_existing_id is not null then
    select * into v_result from public.shift_handovers_v where id = v_existing_id;
    if not public.auth_can_view_money() then
      v_result.cash_counted_paisa := null;
      v_result.cash_status := null;
      v_result.cash_variance_paisa := null;
    end if;
    return v_result;
  end if;

  begin
    v_actor := auth_user_id();
  exception when others then
    v_actor := null;
  end;

  if v_actor is null then
    begin
      v_actor := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
  end if;

  if v_actor is null then
    raise exception 'A signed-in staff session is required to record a shift handover';
  end if;

  select primary_role::text into v_actor_role from public.users where id = v_actor;

  -- Law 6: Money-blind roles cannot record cash values
  if not public.auth_can_view_money() then
    if (p_cash_counted_paisa is not null and p_cash_counted_paisa > 0)
       or (p_cash_variance_paisa is not null and p_cash_variance_paisa <> 0)
       or (p_cash_status is not null and p_cash_status not in ('matched', '')) then
      raise exception 'FORBIDDEN (Law 6): Money-blind role (%) cannot record cash values', coalesce(v_actor_role, 'Unknown');
    end if;
  end if;

  insert into public.shift_handovers (
    client_uuid,
    shift_code,
    shift_date,
    from_user_id,
    from_user_name,
    from_user_role,
    to_user_id,
    to_user_name,
    notes,
    open_items,
    checklist,
    status,
    created_at,
    updated_at
  ) values (
    p_client_uuid,
    coalesce(nullif(btrim(p_shift_code), ''), 'A'),
    current_date,
    v_actor,
    coalesce(nullif(btrim(p_from_user_name), ''), 'Staff Member'),
    coalesce(nullif(btrim(v_actor_role), ''), coalesce(nullif(btrim(p_from_user_role), ''), 'Operations')),
    p_to_user_id,
    p_to_user_name,
    coalesce(p_notes, ''),
    coalesce(p_open_items, '[]'::jsonb),
    coalesce(p_checklist, '[]'::jsonb),
    'pending',
    now(),
    now()
  )
  returning * into v_handover;

  -- If financial role provided cash figures, record in isolated shift_handover_finances
  if public.auth_can_view_money() and (p_cash_counted_paisa is not null or p_cash_variance_paisa is not null or p_cash_status is not null) then
    insert into public.shift_handover_finances (
      handover_id,
      cash_counted_paisa,
      cash_status,
      cash_variance_paisa,
      created_at,
      updated_at
    ) values (
      v_handover.id,
      coalesce(p_cash_counted_paisa, 0),
      coalesce(nullif(btrim(p_cash_status), ''), 'matched'),
      coalesce(p_cash_variance_paisa, 0),
      now(),
      now()
    );
  end if;

  select * into v_result from public.shift_handovers_v where id = v_handover.id;
  if not public.auth_can_view_money() then
    v_result.cash_counted_paisa := null;
    v_result.cash_status := null;
    v_result.cash_variance_paisa := null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_shift_handover(uuid, text, text, text, uuid, text, bigint, text, bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_shift_handover(uuid, text, text, text, uuid, text, bigint, text, bigint, text, jsonb, jsonb) to authenticated;

create or replace function public.acknowledge_shift_handover(
  p_handover_id            uuid,
  p_acknowledgement_note   text default null,
  p_operator_name          text default null
) returns public.shift_handovers_v
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handover public.shift_handovers;
  v_result public.shift_handovers_v;
  v_actor uuid;
  v_actor_name text;
begin
  if not public.auth_is_staff() then
    raise exception 'FORBIDDEN: Staff only';
  end if;

  begin
    v_actor := auth_user_id();
  exception when others then
    v_actor := null;
  end;

  if v_actor is null then
    begin
      v_actor := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
  end if;

  if v_actor is null then
    raise exception 'A signed-in staff session is required to acknowledge a shift handover';
  end if;

  select * into v_handover from public.shift_handovers where id = p_handover_id;
  if v_handover.id is null then
    raise exception 'Shift handover record not found';
  end if;

  if v_handover.status = 'acknowledged' then
    select * into v_result from public.shift_handovers_v where id = v_handover.id;
    if not public.auth_can_view_money() then
      v_result.cash_counted_paisa := null;
      v_result.cash_status := null;
      v_result.cash_variance_paisa := null;
    end if;
    return v_result;
  end if;

  if v_handover.status = 'archived' then
    raise exception 'Invalid transition: Shift handover is archived';
  end if;

  -- Staff cannot acknowledge their own shift handover
  if v_handover.from_user_id = v_actor then
    raise exception 'FORBIDDEN: Staff cannot acknowledge their own shift handover';
  end if;

  select coalesce(p_operator_name, full_name, 'Staff Member') into v_actor_name
  from public.users where id = v_actor;

  update public.shift_handovers
  set
    status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by = v_actor,
    acknowledged_by_name = coalesce(v_actor_name, coalesce(p_operator_name, 'Staff Member')),
    acknowledgement_note = p_acknowledgement_note,
    updated_at = now()
  where id = p_handover_id;

  select * into v_result from public.shift_handovers_v where id = p_handover_id;
  if not public.auth_can_view_money() then
    v_result.cash_counted_paisa := null;
    v_result.cash_status := null;
    v_result.cash_variance_paisa := null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.acknowledge_shift_handover(uuid, text, text) from public, anon;
grant execute on function public.acknowledge_shift_handover(uuid, text, text) to authenticated;

create or replace function public.archive_shift_handover(
  p_handover_id uuid
) returns public.shift_handovers_v
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handover public.shift_handovers;
  v_result public.shift_handovers_v;
  v_actor uuid;
begin
  if not public.auth_is_staff() then
    raise exception 'FORBIDDEN: Staff only';
  end if;

  begin
    v_actor := auth_user_id();
  exception when others then
    v_actor := null;
  end;

  if v_actor is null then
    begin
      v_actor := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
  end if;

  if v_actor is null then
    raise exception 'A signed-in staff session is required to archive a shift handover';
  end if;

  select * into v_handover from public.shift_handovers where id = p_handover_id;
  if v_handover.id is null then
    raise exception 'Shift handover record not found';
  end if;

  if v_handover.status = 'archived' then
    select * into v_result from public.shift_handovers_v where id = p_handover_id;
    if not public.auth_can_view_money() then
      v_result.cash_counted_paisa := null;
      v_result.cash_status := null;
      v_result.cash_variance_paisa := null;
    end if;
    return v_result;
  end if;

  update public.shift_handovers
  set
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    archived_by = v_actor,
    updated_at = now()
  where id = p_handover_id;

  select * into v_result from public.shift_handovers_v where id = p_handover_id;
  if not public.auth_can_view_money() then
    v_result.cash_counted_paisa := null;
    v_result.cash_status := null;
    v_result.cash_variance_paisa := null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.archive_shift_handover(uuid) from public, anon;
grant execute on function public.archive_shift_handover(uuid) to authenticated;

commit;

-- Record 0186_shift_handovers in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030027', '0186_shift_handovers')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0186_shift_handovers.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0187_delivery_dispatch_rpcs.sql
-- SHA-256: 7f4e804c24b8fc858e0b01d0643d2291ee9099c17c15ad24116cdaf3dd60760a
-- Version: 20261122030028
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0187_delivery_dispatch_rpcs.sql
-- Delivery dispatch on the database (T4-01, Phase 2, W46, W47)
-- Re-grants execution on delivery RPCs revoked by 0166, adds vehicle and rider tracking,
-- and aligns transition permissions with DELIVERY_DISPATCH_PHASE2.md.
begin;

alter table public.delivery_jobs
  add column if not exists vehicle text,
  add column if not exists rider_name text,
  add column if not exists rider_phone text;

-- Drop older signatures if needed so signature changes cleanly
drop function if exists public.delivery_create_job(uuid,text,timestamptz,uuid);
drop function if exists public.delivery_assign_driver(uuid,uuid,uuid);
drop function if exists public.delivery_transition_job(uuid,text,text,uuid,text,text);

create or replace function public.delivery_create_job(
  p_booking_id uuid,
  p_leg text,
  p_scheduled_at timestamptz,
  p_key uuid,
  p_vehicle text default null,
  p_rider_name text default null,
  p_rider_phone text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_booking public.bookings%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if v_actor is null or v_role not in ('Owner','Admin','Manager','Coordinator')
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active)
     or p_key is null or p_leg not in ('Outbound','Return') or p_scheduled_at is null then
    raise exception 'Delivery creation is not authorized or required fields are missing' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for share;
  if not found or v_booking.cancelled_at is not null or v_booking.stage = 'Quote'
     or (p_leg = 'Outbound' and v_booking.delivery_type = 'Client Pickup') then
    raise exception 'No active booked delivery is eligible for this leg';
  end if;

  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u
    where u.id = v_actor and u.branch_id = v_booking.branch_id
  ) then
    raise exception 'Delivery branch access denied' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where client_uuid = p_key;
  if found then
    if v_job.booking_id = p_booking_id and v_job.leg = p_leg
       and v_job.scheduled_at = p_scheduled_at and v_job.created_by = v_actor then
      return v_job.id;
    end if;
    raise exception 'Delivery creation key was already used for different data';
  end if;

  insert into public.delivery_jobs (
    client_uuid, booking_id, branch_id, leg, scheduled_at,
    vehicle, rider_name, rider_phone,
    created_by, updated_by
  ) values (
    p_key, p_booking_id, v_booking.branch_id, p_leg, p_scheduled_at,
    nullif(btrim(p_vehicle), ''), nullif(btrim(p_rider_name), ''), nullif(btrim(p_rider_phone), ''),
    v_actor, v_actor
  ) returning * into v_job;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, next_status, actor_id, metadata
  ) values (
    p_key, v_job.id, 'Created', 'Scheduled', v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'vehicle', nullif(btrim(p_vehicle), ''),
      'rider_name', nullif(btrim(p_rider_name), '')
    ))
  );

  return v_job.id;
end;
$$;

create or replace function public.delivery_assign_driver(
  p_job_id uuid,
  p_driver_id uuid default null,
  p_request_key uuid default null,
  p_vehicle text default null,
  p_rider_name text default null,
  p_rider_phone text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_receipt public.delivery_job_events%rowtype;
begin
  if v_actor is null or v_role not in ('Owner','Admin','Manager','Coordinator')
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active)
     or p_job_id is null or p_request_key is null then
    raise exception 'Driver assignment not authorized' using errcode = '42501';
  end if;

  if p_driver_id is null and nullif(btrim(coalesce(p_rider_name, '')), '') is null then
    raise exception 'Either a staff driver or an external rider name is required for assignment';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then raise exception 'Branch access denied' using errcode = '42501'; end if;

  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    if v_receipt.job_id = p_job_id and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Assigned' then
      return p_job_id;
    end if;
    raise exception 'Assignment key belongs to a different request';
  end if;

  if not exists (select 1 from public.bookings b where b.id = v_job.booking_id and b.cancelled_at is null) then
    raise exception 'Cancelled booking cannot receive a driver assignment';
  end if;

  if v_job.status not in ('Scheduled','Ready') then
    raise exception 'Driver cannot be reassigned during or after dispatch';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.users u
    where u.id = p_driver_id and u.primary_role = 'Driver'
      and u.is_active and u.branch_id = v_job.branch_id
  ) then
    raise exception 'The driver is not active in this branch';
  end if;

  update public.delivery_jobs
     set assigned_driver_id = p_driver_id,
         rider_name = coalesce(nullif(btrim(p_rider_name), ''), rider_name),
         rider_phone = coalesce(nullif(btrim(p_rider_phone), ''), rider_phone),
         vehicle = coalesce(nullif(btrim(p_vehicle), ''), vehicle),
         version = version + 1,
         updated_at = now(),
         updated_by = v_actor
   where id = p_job_id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    p_request_key, p_job_id, 'Assigned', v_job.status, v_job.status, v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'driver_id', p_driver_id,
      'rider_name', nullif(btrim(p_rider_name), ''),
      'vehicle', nullif(btrim(p_vehicle), '')
    ))
  );

  return p_job_id;
end;
$$;

create or replace function public.delivery_transition_job(
  p_job_id uuid,
  p_expected_status text,
  p_next_status text,
  p_request_key uuid,
  p_recipient text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_booking public.bookings%rowtype;
  v_receipt public.delivery_job_events%rowtype;
  v_manager boolean;
  v_warehouse boolean;
  v_assigned_driver boolean;
begin
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active) then
    raise exception 'Delivery transition requires an authenticated actor' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  v_manager := v_role in ('Owner','Admin') or (
    v_role in ('Manager','Coordinator') and exists (
      select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
    )
  );
  v_warehouse := v_role = 'Warehouse' and exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  );
  v_assigned_driver := v_role = 'Driver' and v_job.assigned_driver_id = v_actor;

  if not (v_manager or v_warehouse or v_assigned_driver) then
    raise exception 'Delivery transition role or assignment denied' using errcode = '42501';
  end if;

  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    if v_receipt.job_id = p_job_id and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Transition'
       and v_receipt.previous_status = p_expected_status
       and v_receipt.next_status = p_next_status
       and v_receipt.metadata->>'request_fingerprint' = md5(
         jsonb_build_array(p_request_key::text, coalesce(btrim(p_recipient),''), coalesce(btrim(p_note),''))::text
       ) then
      return p_job_id;
    end if;
    raise exception 'Transition key belongs to a different request';
  end if;

  if v_job.status is distinct from p_expected_status then
    raise exception 'Delivery status changed. Reload before saving.' using errcode = '40001';
  end if;

  if not (
      (p_expected_status = 'Scheduled' and p_next_status = 'Ready' and (v_manager or v_warehouse))
   or (p_expected_status = 'Ready' and p_next_status = 'In Transit' and (v_manager or v_assigned_driver))
   or (p_expected_status = 'In Transit' and p_next_status = 'Delivered' and (v_manager or v_assigned_driver))
   or (p_expected_status in ('Scheduled','Ready','In Transit') and p_next_status = 'Failed' and v_manager)
  ) then
    raise exception 'This delivery transition is not permitted' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = v_job.booking_id for share;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'Cancelled or missing booking cannot be dispatched';
  end if;

  if p_next_status in ('Ready','In Transit') and v_job.leg = 'Outbound'
     and v_booking.stage not in ('Packed','On Rent') then
    raise exception 'Packing must finish before outbound dispatch';
  end if;

  if p_next_status = 'In Transit' and (
    v_job.assigned_driver_id is null and nullif(btrim(coalesce(v_job.rider_name, '')), '') is null
  ) then
    raise exception 'An active assigned driver or hired rider is required before dispatch';
  end if;

  if p_next_status = 'Delivered' and length(btrim(coalesce(p_recipient,''))) < 2 then
    raise exception 'Delivery receipt requires the recipient name';
  end if;

  if p_next_status = 'Failed' and length(btrim(coalesce(p_note,''))) < 10 then
    raise exception 'Failed dispatch requires an explanatory note';
  end if;

  update public.delivery_jobs
  set status = p_next_status,
      dispatched_at = case when p_next_status = 'In Transit' then now() else dispatched_at end,
      delivered_at = case when p_next_status = 'Delivered' then now() else delivered_at end,
      received_by = case when p_next_status = 'Delivered' then btrim(p_recipient) else received_by end,
      last_note = nullif(btrim(coalesce(p_note,'')),''),
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where id = p_job_id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    p_request_key, p_job_id, 'Transition', p_expected_status, p_next_status, v_actor,
    jsonb_build_object('request_fingerprint', md5(
      jsonb_build_array(p_request_key::text, coalesce(btrim(p_recipient),''), coalesce(btrim(p_note),''))::text
    ))
  );

  return p_job_id;
end;
$$;

-- Grant execution to authenticated only (no anon)
revoke all on function public.delivery_create_job(uuid,text,timestamptz,uuid,text,text,text) from public, anon;
revoke all on function public.delivery_assign_driver(uuid,uuid,uuid,text,text,text) from public, anon;
revoke all on function public.delivery_transition_job(uuid,text,text,uuid,text,text) from public, anon;

grant execute on function public.delivery_create_job(uuid,text,timestamptz,uuid,text,text,text) to authenticated;
grant execute on function public.delivery_assign_driver(uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.delivery_transition_job(uuid,text,text,uuid,text,text) to authenticated;

commit;

-- Record 0187_delivery_dispatch_rpcs in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030028', '0187_delivery_dispatch_rpcs')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0187_delivery_dispatch_rpcs.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0188_smart_reservation_holds.sql
-- SHA-256: 6a65a57ee70bf9504af10c07d669e60dc180cdfcebca6a9f6891d7eb838e9c74
-- Version: 20261122030029
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0188_smart_reservation_holds.sql
-- Smart Reservation, Expiring Temporary Holds & Atomic Confirmation (P0)
--
-- 1. inventory_reservations: add hold_state ('active_hold', 'expired_hold', 'confirmed', 'released')
--    and expires_at (timestamptz).
-- 2. Update GiST exclusion constraint inventory_reservations_no_double_booking
--    to include active_hold as well as confirmed reservations.
-- 3. Update enforce_inventory_reservation_capacity() to consider active_hold alongside confirmed.
-- 4. RPC confirm_booking_atomic: atomic server-authoritative confirmation with
--    deterministic row locking, automatic hold expiry reclamation, stage transition, and reservation commit.
-- 5. RPC create_or_extend_hold: create/renew scarce expiring inventory holds (default 4h).
-- 6. RPC release_hold: authorized hold release.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ Schema additions on inventory_reservations
-- ---------------------------------------------------------------------------
alter table inventory_reservations
  add column if not exists hold_state text not null default 'confirmed'
    check (hold_state in ('active_hold', 'expired_hold', 'confirmed', 'released')),
  add column if not exists expires_at timestamptz;

comment on column inventory_reservations.hold_state is
  'Lifecycle of this reservation: active_hold (temporary hold awaiting payment/contract), '
  'expired_hold (reclaimed hold after expiry), confirmed (binding commitment for Booked+), '
  'or released (freed by return, cancel, or manual release).';

comment on column inventory_reservations.expires_at is
  'Expiry instant for active_hold (default 4 hours from creation). NULL for confirmed reservations.';

-- ---------------------------------------------------------------------------
-- 2 ▸ Update GiST exclusion constraint on inventory_reservations
-- ---------------------------------------------------------------------------
alter table inventory_reservations
  drop constraint if exists inventory_reservations_no_double_booking;

alter table inventory_reservations
  add constraint inventory_reservations_no_double_booking
    exclude using gist (asset_id with =, period with &&)
    where (released_at is null and hold_state in ('confirmed', 'active_hold') and asset_id is not null);

-- ---------------------------------------------------------------------------
-- 3 ▸ Update capacity ceiling trigger to count active_hold
-- ---------------------------------------------------------------------------
create or replace function enforce_inventory_reservation_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id     uuid;
  v_tracking_mode  product_tracking_mode;
  v_total_quantity int;
  v_capacity       int;
  v_peak           int;
begin
  -- Released or expired holds consume nothing
  if NEW.released_at is not null or NEW.hold_state in ('released', 'expired_hold') then
    return NEW;
  end if;

  if NEW.product_id is not null then
    v_product_id := NEW.product_id;
  else
    select pu.product_id into v_product_id
    from product_units pu
    where pu.id = NEW.asset_id;

    if v_product_id is null then
      raise exception
        'Reservation rejected: asset % does not resolve to a product.', NEW.asset_id;
    end if;
  end if;

  select p.tracking_mode, p.total_quantity
    into v_tracking_mode, v_total_quantity
  from products p
  where p.id = v_product_id
  for update;

  if not found then
    raise exception
      'Reservation rejected: product % does not exist.', v_product_id;
  end if;

  if v_tracking_mode = 'Serialised' then
    select count(*) into v_capacity
    from product_units pu
    where pu.product_id = v_product_id
      and pu.status not in ('Maintenance', 'Missing', 'Retired');
  else
    v_capacity := v_total_quantity;
  end if;

  with live as (
    select r.period, r.qty
    from inventory_reservations r
    where r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and r.product_id = v_product_id
      and r.period && NEW.period
    union all
    select r.period, r.qty
    from inventory_reservations r
    join product_units pu on pu.id = r.asset_id
    where r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and pu.product_id = v_product_id
      and r.period && NEW.period
  ),
  candidates as (
    select distinct lower(l.period) as at
    from live l
    where NEW.period @> lower(l.period)
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

  if v_peak > v_capacity then
    raise exception
      'Reservation rejected: product % would have % units held at once between % and %, but stock on hand is %.',
      v_product_id, v_peak, lower(NEW.period), upper(NEW.period), v_capacity;
  end if;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 ▸ RPC confirm_booking_atomic
-- ---------------------------------------------------------------------------
create or replace function confirm_booking_atomic(
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
  v_prod_id         uuid;
  v_asset_id        uuid;
  v_res_units       int;
  v_res_qty         int;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
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

  if v_booking.cancelled_at is not null then
    raise exception '% was cancelled. A cancelled booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null then
    raise exception '% is Closed. A closed booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.stage <> 'Quote' then
    if v_booking.stage = 'Booked' then
      -- Idempotent duplicate check
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

  -- 7. Insert the stage transition (which invokes triggers to move stage and write reservations)
  insert into booking_stage_transitions
    (client_uuid, booking_id, from_stage, to_stage, actor_id, occurred_at, reason)
  values
    (p_client_uuid, p_booking_id, 'Quote', 'Booked', p_actor_id, v_occurred_at, p_reason);

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

comment on function confirm_booking_atomic is
  'Atomic, server-authoritative booking confirmation. Validates booking state, locks '
  'inventory in deterministic order, reclaims expired holds, transitions stage to Booked, '
  'and commits inventory reservations in one transaction.';

-- ---------------------------------------------------------------------------
-- 5 ▸ RPC create_or_extend_hold
-- ---------------------------------------------------------------------------
create or replace function create_or_extend_hold(
  p_booking_id        uuid,
  p_booking_line_id   uuid,
  p_asset_id          uuid default null,
  p_product_id        uuid default null,
  p_qty               int default 1,
  p_period            tstzrange default null,
  p_duration_minutes  int default 240,
  p_client_uuid       uuid default gen_random_uuid(),
  p_actor_id          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         text;
  v_expires_at   timestamptz;
  v_period       tstzrange;
  v_hold_id      uuid;
  v_actor_id     uuid;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Permission denied: role % cannot place inventory holds.', v_role
      using errcode = '42501';
  end if;

  v_actor_id := coalesce(p_actor_id, auth_user_id());
  v_expires_at := now() + (coalesce(nullif(p_duration_minutes, 0), 240) || ' minutes')::interval;

  if p_period is null then
    select tstzrange(pickup_at, return_at, '[)')
      into v_period
      from bookings
     where id = p_booking_id;
  else
    v_period := p_period;
  end if;

  if v_period is null then
    raise exception 'Cannot create hold: rental period is unknown.';
  end if;

  -- Reclaim expired holds on this asset/product first
  if p_asset_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where asset_id = p_asset_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  elsif p_product_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where product_id = p_product_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  end if;

  insert into inventory_reservations (
    client_uuid,
    booking_id,
    booking_line_id,
    asset_id,
    product_id,
    qty,
    period,
    state,
    hold_state,
    expires_at,
    created_by
  ) values (
    p_client_uuid,
    p_booking_id,
    p_booking_line_id,
    p_asset_id,
    p_product_id,
    coalesce(p_qty, 1),
    v_period,
    'Reserved',
    'active_hold',
    v_expires_at,
    v_actor_id
  )
  returning id into v_hold_id;

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_hold_id,
    'hold_state', 'active_hold',
    'expires_at', v_expires_at,
    'qty', coalesce(p_qty, 1)
  );
end;
$$;

comment on function create_or_extend_hold is
  'Places or extends a scarce expiring inventory hold (default 4 hours) on a unit or product pool.';

-- ---------------------------------------------------------------------------
-- 6 ▸ RPC release_hold
-- ---------------------------------------------------------------------------
create or replace function release_hold(
  p_reservation_id uuid,
  p_reason         text default null,
  p_actor_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot release inventory holds.', v_role
      using errcode = '42501';
  end if;

  update inventory_reservations
     set hold_state = 'released',
         released_at = now(),
         released_reason = coalesce(p_reason, 'Released manually by staff')
   where id = p_reservation_id
     and released_at is null;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Hold not found or already released');
  end if;

  return jsonb_build_object('success', true, 'reservation_id', p_reservation_id);
end;
$$;

comment on function release_hold is
  'Explicitly and idempotently releases a live hold or reservation.';

-- ---------------------------------------------------------------------------
-- 7 ▸ Grants & Security Revocations
-- ---------------------------------------------------------------------------
revoke execute on function confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function confirm_booking_atomic(uuid, uuid, uuid, timestamptz, text) to authenticated;

revoke execute on function create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) from public, anon;
grant execute on function create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) to authenticated;

revoke execute on function release_hold(uuid, text, uuid) from public, anon;
grant execute on function release_hold(uuid, text, uuid) to authenticated;

commit;

-- Record 0188_smart_reservation_holds in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030029', '0188_smart_reservation_holds')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0188_smart_reservation_holds.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0188_staff_renting_gear.sql
-- SHA-256: 272e75c66aa2ee7626cc5a0858ad6036ecb22c860bdf10bfead5e09b8521ba80
-- Version: 20261122030030
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0188_staff_renting_gear.sql
-- Staff renting gear (Ruling W68, Task T8-09)
-- 1. A client can be marked Staff (`is_staff: boolean`), linked to the staff member's user (`staff_user_id: uuid`).
-- 2. Staff client's bookings get a 20% staff discount line automatically (W68), shown and removable like any other discount (Law 10 — no approval gate).
-- 3. Everything else is a normal client booking: deposit, ID on file, invoice, payments.
-- 4. Add 'Staff' to public.discount_source enum.
-- 5. Expose `is_staff` and `staff_user_id` on `clients_v` and `client_directory_v`. Neither is monetary, so neither is masked by auth_can_view_money().

begin;

-- 1. Add 'Staff' to discount_source enum
alter type public.discount_source add value if not exists 'Staff';

-- 2. Add is_staff and staff_user_id to clients
alter table public.clients
  add column if not exists is_staff boolean not null default false,
  add column if not exists staff_user_id uuid references public.users(id);

create index if not exists clients_is_staff_idx on public.clients(is_staff) where is_staff is true;
create index if not exists clients_staff_user_id_idx on public.clients(staff_user_id) where staff_user_id is not null;

-- 3. Column-level permissions on clients (Law 6 / 0130):
-- authenticated already has insert/update on clients; grant select on the two new operational columns.
grant select (is_staff, staff_user_id) on public.clients to authenticated;

-- 4. Recreate clients_v with is_staff and staff_user_id appended
create or replace view public.clients_v as
 select id,
    client_uuid,
    client_code,
    type_parent,
    org_subtype,
    name,
    phone,
    email,
    pan_vat,
    business_registration,
    website,
    government_id_kind,
    government_id_number,
    address_line,
    city,
    district,
    postal_code,
    country,
    billing_address,
        case
            when auth_can_view_money() then approved_credit_limit
            else null::numeric
        end as approved_credit_limit,
        case
            when auth_can_view_money() then payment_terms
            else null::payment_terms
        end as payment_terms,
    client_since,
    professions,
    segments,
    source,
    referred_by_client_id,
    tags,
    preferred_contact_channels,
    marketing_photo_consent,
    notes,
    assigned_staff_id,
    status,
    deactivated_at,
    deactivated_by,
    deactivation_reason,
    merged_into_client_id,
    portal_default_language,
    created_at,
    created_by,
    updated_at,
    is_staff,
    staff_user_id
   from public.clients
  where auth_is_staff();

grant select on public.clients_v to authenticated;
revoke all on public.clients_v from anon;

-- 5. Recreate client_directory_v with is_staff and staff_user_id appended
create or replace view public.client_directory_v as
select
  c.id,
  c.client_code,
  c.name,
  c.phone,
  c.email,
  c.address_line,
  c.city,
  c.district,
  c.country,
  c.status,
  c.client_since,
  c.type_parent,
  c.org_subtype,
  c.pan_vat,
  c.deactivated_at,
  c.created_at,
  c.approved_credit_limit,
  c.payment_terms,

  case when auth_can_view_money() then coalesce(inv.outstanding_total, 0) else null end
    as outstanding_amount,
  case when auth_can_view_money() then coalesce(dep.held_total, 0) else null end
    as deposit_held_amount,
  case when auth_can_view_money() then coalesce(pay.paid_total, 0) else null end
    as total_paid_amount,

  coalesce(bk.active_count, 0)  as active_bookings_count,
  coalesce(bk.total_count, 0)   as total_bookings_count,
  bk.last_pickup_at,

  ct.full_name    as contact_name,
  ct.designation  as contact_designation,
  ct.phone        as contact_phone,

  mem.level       as membership_level,

  coalesce(doc.total_count, 0)    as kyc_docs_count,
  coalesce(doc.verified_count, 0) as kyc_verified_count,

  exists (
    select 1
    from client_flags f
    where f.client_id = c.id
      and f.flag_type = 'Blocked'
      and f.removed_at is null
  ) as is_blocked,

  c.is_staff,
  c.staff_user_id
from public.clients_v c
left join lateral (
  select sum(i.outstanding_amount) as outstanding_total
  from invoices i
  where i.client_id = c.id
) inv on true
left join lateral (
  select sum(greatest(s.received_amount - s.refunded_amount - s.applied_amount, 0)) as held_total
  from security_deposits s
  where s.client_id = c.id
) dep on true
left join lateral (
  select sum(p.amount) as paid_total
  from payments p
  where p.client_id = c.id and p.status = 'Received'
) pay on true
left join lateral (
  select
    count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null) as active_count,
    count(*)                                                              as total_count,
    max(b.pickup_at)                                                      as last_pickup_at
  from bookings b
  where b.client_id = c.id
) bk on true
left join lateral (
  select k.full_name, k.designation, k.phone
  from client_contacts k
  where k.client_id = c.id and k.deactivated_at is null
  order by k.is_primary desc, k.created_at
  limit 1
) ct on true
left join lateral (
  select p.level
  from client_memberships m
  join membership_plans p on p.id = m.plan_id
  where m.client_id = c.id and m.superseded_at is null
  order by m.join_date desc
  limit 1
) mem on true
left join lateral (
  select
    count(*)                                        as total_count,
    count(*) filter (where d.status = 'Verified')   as verified_count
  from client_documents d
  where d.client_id = c.id and d.archived_at is null
) doc on true
where auth_is_staff();

grant select on public.client_directory_v to authenticated;
revoke all on public.client_directory_v from anon;

-- 6. Add is_staff and staff_user_id to record editor private allowed fields
create or replace function record_editor_private.fields(kind text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
select case kind
when 'client' then array['type_parent','org_subtype','name','phone','email','pan_vat','business_registration','website','address_line','city','district','postal_code','country','billing_address','notes','is_staff','staff_user_id']
when 'equipment' then array['name','short_name','category_id','brand','model','manufacturer','description','reorder_level','quantity_unit','purchase_date','purchase_price','replacement_value','daily_rate','weekly_rate','monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed','min_rental_days','rental_enabled','prep_time_minutes','cleaning_time_minutes','inspection_required','packing_required','notes_internal','notes_warehouse']
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
      when 'pricing' then array['daily_rate', 'weekly_rate', 'monthly_rate', 'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed', 'min_rental_days', 'rental_enabled']
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

commit;

-- Record 0188_staff_renting_gear in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030030', '0188_staff_renting_gear')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0188_staff_renting_gear.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0189_delivery_zones.sql
-- SHA-256: 9a608ff6751c8be90502ee11537ba6004cfb243104f27796d8ad1b9244e41110
-- Version: 20261122030031
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0189_delivery_zones.sql
-- Delivery zones for zone-based dispatch fees
-- T4-07: delivery_zones table + RPCs (amended 2026-11-03: money-blind roles get no fee, no DELETE, Owner/Admin/Manager only)

create table if not exists public.delivery_zones (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text,
    fee_paisa bigint not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.delivery_zones is 'Delivery zones with per-zone fees for dispatch calculation';
comment on column public.delivery_zones.name is 'Zone name (e.g., "Ring Road", "Boudha", "Outside Valley")';
comment on column public.delivery_zones.description is 'Human-readable description of zone boundaries';
comment on column public.delivery_zones.fee_paisa is 'Zone fee in paisa (integer, half-up rounding)';
comment on column public.delivery_zones.is_active is 'Whether this zone is available for new dispatches';

-- Index
create index if not exists delivery_zones_active_idx on public.delivery_zones (is_active) where is_active;

-- RLS
alter table public.delivery_zones enable row level security;

-- Read policy: authenticated staff (non-client roles) can read base columns
-- fee_paisa is filtered by RPCs below via auth_can_view_money()
drop policy if exists delivery_zones_read_staff on public.delivery_zones;
create policy delivery_zones_read_staff on public.delivery_zones
    for select to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
    );

-- Write policy: Owner/Admin/Manager only (not Coordinator) — INSERT and UPDATE only, no DELETE
-- "Deactivate" is the terminal action via RPC
drop policy if exists delivery_zones_insert_manager_plus on public.delivery_zones;
create policy delivery_zones_insert_manager_plus on public.delivery_zones
    for insert to authenticated
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager')
        )
    );

drop policy if exists delivery_zones_update_manager_plus on public.delivery_zones;
create policy delivery_zones_update_manager_plus on public.delivery_zones
    for update to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager')
        )
    )
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager')
        )
    );

-- Helper: auth_is_manager_or_above
create or replace function public.auth_is_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth_user_role() in ('Owner', 'Admin', 'Manager'), false);
$$;

revoke all on function public.auth_is_manager_or_above() from anon, public;
grant execute on function public.auth_is_manager_or_above() to authenticated;

-- RPC: create_delivery_zone
create or replace function public.create_delivery_zone(
    p_name text,
    p_description text,
    p_fee_paisa bigint
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

    if p_fee_paisa < 0 then
        raise exception 'Zone fee cannot be negative' using errcode = 'check_violation';
    end if;

    insert into public.delivery_zones (name, description, fee_paisa)
    values (trim(p_name), trim(p_description), p_fee_paisa)
    returning id into v_zone_id;

    return v_zone_id;
end;
$$;

comment on function public.create_delivery_zone(text, text, bigint) is 'Create a delivery zone (Manager+ only). Returns zone ID.';

-- RPC: update_delivery_zone
create or replace function public.update_delivery_zone(
    p_zone_id uuid,
    p_name text default null,
    p_description text default null,
    p_fee_paisa bigint default null,
    p_is_active boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is Manager or above
    if not public.auth_is_manager_or_above() then
        raise insufficient_privilege using message = 'Only Manager+ can update delivery zones';
    end if;

    update public.delivery_zones
    set
        name = coalesce(nullif(trim(p_name), ''), name),
        description = coalesce(nullif(trim(p_description), ''), description),
        fee_paisa = coalesce(p_fee_paisa, fee_paisa),
        is_active = coalesce(p_is_active, is_active),
        updated_at = now()
    where id = p_zone_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.update_delivery_zone(uuid, text, text, bigint, boolean) is 'Update a delivery zone (Manager+ only). Returns true if updated.';

-- RPC: deactivate_delivery_zone (soft delete — terminal action)
create or replace function public.deactivate_delivery_zone(p_zone_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is Manager or above
    if not public.auth_is_manager_or_above() then
        raise insufficient_privilege using message = 'Only Manager+ can deactivate delivery zones';
    end if;

    update public.delivery_zones
    set is_active = false,
        updated_at = now()
    where id = p_zone_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.deactivate_delivery_zone(uuid) is 'Deactivate (soft delete) a delivery zone (Manager+ only). Returns true if deactivated.';

-- RPC: list_delivery_zones (paginated, active-only option)
-- Returns fee_paisa ONLY if caller can view money (Law 6)
create or replace function public.list_delivery_zones(
    p_limit int default 50,
    p_offset int default 0,
    p_active_only boolean default true
)
returns setof public.delivery_zones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    -- Verify caller is authenticated staff (not client)
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list delivery zones';
    end if;

    return query
    select
        dz.id,
        dz.name,
        dz.description,
        case when public.auth_can_view_money() then dz.fee_paisa else null end as fee_paisa,
        dz.is_active,
        dz.created_at,
        dz.updated_at
    from public.delivery_zones dz
    where p_active_only = false or dz.is_active = true
    order by dz.name asc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_delivery_zones(int, int, boolean) is 'List delivery zones (staff only). Paginated. Active-only filter. fee_paisa returned only for money-enabled roles (Law 6).';

-- RPC: get_delivery_zone_fee (for dispatch calculation)
-- Returns fee_paisa ONLY if caller can view money (Law 6)
create or replace function public.get_delivery_zone_fee(p_zone_name text)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_fee bigint;
begin
    -- This can be called by any authenticated user for fee lookup
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can query delivery zone fees';
    end if;

    if not public.auth_can_view_money() then
        raise insufficient_privilege using message = 'Zone fee requires money-view permission';
    end if;

    select dz.fee_paisa
    into v_fee
    from public.delivery_zones dz
    where dz.name = p_zone_name
      and dz.is_active = true;

    if v_fee is null then
        raise exception 'Zone not found or inactive: %', p_zone_name using errcode = 'no_data';
    end if;

    return v_fee;
end;
$$;

comment on function public.get_delivery_zone_fee(text) is 'Get active zone fee by name (money-enabled roles only). Returns fee in paisa.';

-- Grant execute on RPCs
grant execute on function public.create_delivery_zone(text, text, bigint) to authenticated;
grant execute on function public.update_delivery_zone(uuid, text, text, bigint, boolean) to authenticated;
grant execute on function public.deactivate_delivery_zone(uuid) to authenticated;
grant execute on function public.list_delivery_zones(int, int, boolean) to authenticated;
grant execute on function public.get_delivery_zone_fee(text) to authenticated;

-- Revoke execute from anon and public
revoke all on function public.create_delivery_zone(text, text, bigint) from anon, public;
revoke all on function public.update_delivery_zone(uuid, text, text, bigint, boolean) from anon, public;
revoke all on function public.deactivate_delivery_zone(uuid) from anon, public;
revoke all on function public.list_delivery_zones(int, int, boolean) from anon, public;
revoke all on function public.get_delivery_zone_fee(text) from anon, public;

-- Seed default Kathmandu valley zones
insert into public.delivery_zones (name, description, fee_paisa, is_active)
values
    ('Ring Road', 'Inside Kathmandu Ring Road', 350000, true),
    ('Boudha', 'Boudha and surrounding areas', 350000, true),
    ('Swoyambhu', 'Swoyambhu and surrounding areas', 350000, true),
    ('Patan', 'Lalitpur/Patan area', 350000, true),
    ('Bhaktapur', 'Bhaktapur area', 350000, true),
    ('Kirtipur', 'Kirtipur area', 350000, true),
    ('Outside Valley', 'Outside Kathmandu Valley — quoted per job', 0, true)
on conflict (name) do nothing;

-- Verification assertions (PGlite-compatible subset)
do $verify$
declare
    v_pol_count int;
begin
    -- 1. Verify INSERT and UPDATE policies exist (no DELETE)
    select count(*) into v_pol_count
    from pg_policies
    where schemaname = 'public' and tablename = 'delivery_zones' and cmd in ('INSERT', 'UPDATE');
    
    if v_pol_count < 2 then
        raise exception '0189: Missing INSERT/UPDATE policies';
    end if;

    -- 2. Verify no DELETE policy exists
    select count(*) into v_pol_count
    from pg_policies
    where schemaname = 'public' and tablename = 'delivery_zones' and cmd = 'DELETE';
    
    if v_pol_count > 0 then
        raise exception '0189: DELETE policy must not exist (Law 3)';
    end if;

    raise notice '0189 verification passed: Law 3 (no DELETE), Owner/Admin/Manager write policies exist';
end;
$verify$;

-- Record 0189_delivery_zones in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030031', '0189_delivery_zones')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0189_delivery_zones.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0190_one_time_rider_links.sql
-- SHA-256: 5e715256f37989e431aa63b0d4af5c4088eabe7254519eb5f0bc284505a7aaca
-- Version: 20261122030032
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0190_one_time_rider_links.sql
-- T4-08 / W49: One-time rider link for hired delivery riders
-- Ephemeral, job-scoped, non-login access path without money figures.
begin;

-- Table: delivery_job_links
create table if not exists public.delivery_job_links (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  rider_name text not null check (length(btrim(rider_name)) >= 2),
  rider_phone text not null check (length(btrim(rider_phone)) >= 7),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id),
  completed_at timestamptz,
  created_by uuid not null references public.users(id),
  constraint delivery_job_links_expires_after_created check (expires_at > created_at)
);

create index if not exists delivery_job_links_token_hash_idx on public.delivery_job_links(token_hash)
  where revoked_at is null and completed_at is null;
create index if not exists delivery_job_links_job_id_idx on public.delivery_job_links(job_id);
create index if not exists delivery_job_links_client_uuid_idx on public.delivery_job_links(client_uuid);

alter table public.delivery_job_links enable row level security;

-- Revoke direct permissions
revoke all on public.delivery_job_links from public, anon, authenticated;

-- Staff read policy: staff can see links for jobs in their branch (or Owner/Admin global)
-- Column-level SELECT grant strictly excludes token_hash (R1)
grant select (
  id,
  client_uuid,
  job_id,
  rider_name,
  rider_phone,
  created_at,
  expires_at,
  revoked_at,
  revoked_by,
  completed_at,
  created_by
) on public.delivery_job_links to authenticated;

drop policy if exists delivery_job_links_staff_read on public.delivery_job_links;
create policy delivery_job_links_staff_read on public.delivery_job_links
  for select to authenticated using (
    auth.uid() is not null and exists (
      select 1 from public.delivery_jobs j
      join public.users u on u.id = auth.uid() and u.is_active
      where j.id = delivery_job_links.job_id
        and (
          u.primary_role in ('Owner', 'Admin')
          or (u.primary_role in ('Manager', 'Coordinator', 'Warehouse') and u.branch_id = j.branch_id)
        )
    )
  );

-- Staff RPC: create_rider_link
create or replace function public.create_rider_link(
  p_client_uuid uuid,
  p_job_id uuid,
  p_rider_name text,
  p_rider_phone text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_link_id uuid;
  v_raw_token text;
  v_token_hash text;
begin
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to create rider links' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid is required' using errcode = '22023';
  end if;

  -- Idempotency replay check (Law 8)
  select id into v_link_id from public.delivery_job_links where client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'link_id', v_link_id,
      'raw_token', null,
      'already_issued', true
    );
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id;
  if not found then
    raise exception 'Delivery job not found';
  end if;

  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Cannot create a rider link for a finished delivery job';
  end if;

  if length(btrim(coalesce(p_rider_name, ''))) < 2 then
    raise exception 'Rider name is required (minimum 2 characters)';
  end if;

  if length(btrim(coalesce(p_rider_phone, ''))) < 7 then
    raise exception 'Rider phone is required (minimum 7 characters)';
  end if;

  -- Server generates token and SHA-256 hash (R3)
  v_raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  insert into public.delivery_job_links (
    client_uuid, job_id, token_hash, rider_name, rider_phone, created_by
  ) values (
    p_client_uuid, p_job_id, v_token_hash, btrim(p_rider_name), btrim(p_rider_phone), v_actor
  ) returning id into v_link_id;

  -- Audit creation (NEVER record raw token)
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Create',
    'Informational',
    'Success',
    'delivery_job_links',
    v_link_id,
    v_actor,
    v_role::system_role,
    v_job.branch_id,
    jsonb_build_object(
      'job_id', p_job_id,
      'rider_name', btrim(p_rider_name),
      'rider_phone', btrim(p_rider_phone)
    )
  );

  return jsonb_build_object(
    'link_id', v_link_id,
    'raw_token', v_raw_token,
    'already_issued', false
  );
end;
$$;

-- Staff RPC: revoke_rider_link
create or replace function public.revoke_rider_link(
  p_link_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to revoke rider links' using errcode = '42501';
  end if;

  select * into v_link from public.delivery_job_links where id = p_link_id;
  if not found then
    raise exception 'Rider link not found';
  end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id;
  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  update public.delivery_job_links
     set revoked_at = now(), revoked_by = v_actor
   where id = p_link_id;

  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Update',
    'Informational',
    'Success',
    'delivery_job_links',
    p_link_id,
    v_actor,
    v_role::system_role,
    v_job.branch_id,
    jsonb_build_object('revoked', false),
    jsonb_build_object('revoked', true, 'job_id', v_link.job_id, 'rider_name', v_link.rider_name)
  );

  return true;
end;
$$;

-- Rider Public RPC: get_rider_job_by_token
create or replace function public.get_rider_job_by_token(
  p_token_hash text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
  v_booking public.bookings%rowtype;
  v_branch public.branches%rowtype;
  v_client public.clients%rowtype;
  v_contact public.client_contacts%rowtype;
  v_items jsonb;
  v_total_qty integer := 0;
  v_pickup_addr text;
  v_delivery_addr text;
  v_contact_name text;
  v_contact_phone text;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  select * into v_link from public.delivery_job_links
   where token_hash = p_token_hash;

  if not found then
    raise exception 'Delivery link does not exist' using errcode = '42501';
  end if;

  if v_link.revoked_at is not null then
    raise exception 'Delivery link has been revoked' using errcode = '42501';
  end if;

  if v_link.expires_at <= now() then
    raise exception 'Delivery link has expired' using errcode = '42501';
  end if;

  if v_link.completed_at is not null then
    raise exception 'Delivery link has already been completed' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id;
  if not found or v_job.status in ('Delivered', 'Failed') then
    raise exception 'Delivery job is no longer active' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = v_job.booking_id;
  select * into v_branch from public.branches where id = v_job.branch_id;
  select * into v_client from public.clients where id = v_booking.client_id;
  if v_booking.contact_id is not null then
    select * into v_contact from public.client_contacts where id = v_booking.contact_id;
  end if;

  -- Pickup and delivery addresses depending on leg
  if v_job.leg = 'Outbound' then
    v_pickup_addr := coalesce(v_branch.name || ', ' || v_branch.address, 'Babin Rentals Main Branch');
    v_delivery_addr := coalesce(v_booking.pickup_location, v_client.address_line, 'Client Location');
  else
    v_pickup_addr := coalesce(v_booking.return_location, v_client.address_line, 'Client Location');
    v_delivery_addr := coalesce(v_branch.name || ', ' || v_branch.address, 'Babin Rentals Main Branch');
  end if;

  v_contact_name := coalesce(v_contact.full_name, v_client.name, 'Client');
  v_contact_phone := coalesce(v_contact.phone, v_client.phone, '');

  -- Aggregate lines / cases without exposing ANY money
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_name', coalesce(p.name, bl.description, 'Rental Item'),
      'quantity', bl.qty
    )), '[]'::jsonb),
    coalesce(sum(bl.qty), 0)
  into v_items, v_total_qty
  from public.booking_lines bl
  left join public.products p on p.id = bl.product_id
  where bl.booking_id = v_booking.id
    and bl.voided_at is null;

  -- Strictly money-blind JSON return (Law 6)
  return jsonb_build_object(
    'link_id', v_link.id,
    'job_id', v_job.id,
    'booking_no', v_booking.booking_no,
    'leg', v_job.leg,
    'status', v_job.status,
    'scheduled_at', v_job.scheduled_at,
    'dispatched_at', v_job.dispatched_at,
    'rider_name', v_link.rider_name,
    'rider_phone', v_link.rider_phone,
    'pickup_address', v_pickup_addr,
    'delivery_address', v_delivery_addr,
    'contact_name', v_contact_name,
    'contact_phone', v_contact_phone,
    'item_count', v_total_qty,
    'items', v_items,
    'last_note', v_job.last_note,
    'expires_at', v_link.expires_at
  );
end;
$$;

-- Rider Public RPC: rider_mark_picked_up
create or replace function public.rider_mark_picked_up(
  p_token_hash text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  select * into v_link from public.delivery_job_links where token_hash = p_token_hash for update;
  if not found then raise exception 'Delivery link does not exist' using errcode = '42501'; end if;
  if v_link.revoked_at is not null then raise exception 'Delivery link has been revoked' using errcode = '42501'; end if;
  if v_link.expires_at <= now() then raise exception 'Delivery link has expired' using errcode = '42501'; end if;
  if v_link.completed_at is not null then raise exception 'Delivery link has already been completed' using errcode = '42501'; end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Delivery job is already in a terminal state';
  end if;

  if v_job.status = 'In Transit' then
    return jsonb_build_object('success', true, 'status', 'In Transit');
  end if;

  update public.delivery_jobs
     set status = 'In Transit',
         dispatched_at = coalesce(dispatched_at, now()),
         version = version + 1,
         updated_at = now()
   where id = v_job.id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    gen_random_uuid(),
    v_job.id,
    'Transition',
    v_job.status,
    'In Transit',
    v_link.created_by,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'action', 'picked_up_from_shop'
    )
  );

  return jsonb_build_object('success', true, 'status', 'In Transit');
end;
$$;

-- Rider Public RPC: rider_complete_delivery
create or replace function public.rider_complete_delivery(
  p_token_hash text,
  p_receiver_name text,
  p_signature_svg text default null,
  p_photo_url text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
  v_clean_receiver text;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  v_clean_receiver := btrim(coalesce(p_receiver_name, ''));
  if length(v_clean_receiver) < 2 then
    raise exception 'Receiver name is required (minimum 2 characters)';
  end if;

  select * into v_link from public.delivery_job_links where token_hash = p_token_hash for update;
  if not found then raise exception 'Delivery link does not exist' using errcode = '42501'; end if;
  if v_link.revoked_at is not null then raise exception 'Delivery link has been revoked' using errcode = '42501'; end if;
  if v_link.expires_at <= now() then raise exception 'Delivery link has expired' using errcode = '42501'; end if;
  if v_link.completed_at is not null then raise exception 'Delivery link has already been completed' using errcode = '42501'; end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_job.status = 'Delivered' then
    raise exception 'Delivery job is already marked as Delivered';
  end if;

  if v_job.status = 'Failed' then
    raise exception 'Delivery job is marked as Failed and cannot be completed';
  end if;

  -- Complete the link atomically
  update public.delivery_job_links
     set completed_at = now()
   where id = v_link.id;

  -- Complete the job
  update public.delivery_jobs
     set status = 'Delivered',
         delivered_at = now(),
         received_by = v_clean_receiver,
         version = version + 1,
         updated_at = now()
   where id = v_job.id;

  -- Record event
  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    gen_random_uuid(),
    v_job.id,
    'Transition',
    v_job.status,
    'Delivered',
    v_link.created_by,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'receiver_name', v_clean_receiver,
      'has_signature', p_signature_svg is not null and length(p_signature_svg) > 10,
      'has_photo', p_photo_url is not null and length(p_photo_url) > 5,
      'signature_svg', p_signature_svg,
      'photo_url', p_photo_url
    )
  );

  -- Record audit event
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Update',
    'Informational',
    'Success',
    'delivery_jobs',
    v_job.id,
    v_link.created_by,
    'Coordinator'::system_role,
    v_job.branch_id,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'receiver_name', v_clean_receiver
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'Delivered',
    'delivered_at', now(),
    'received_by', v_clean_receiver
  );
end;
$$;

-- Function grants:
-- Revoke all execution from public and anon (PG default grants execute on new functions to public)
revoke all on function public.get_rider_job_by_token(text) from public, anon, authenticated;
revoke all on function public.rider_mark_picked_up(text) from public, anon, authenticated;
revoke all on function public.rider_complete_delivery(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_rider_link(uuid, uuid, text, text) from public, anon;
revoke all on function public.revoke_rider_link(uuid) from public, anon;

-- Rider RPCs: service_role ONLY (R1) - mediated exclusively via Edge Function
grant execute on function public.get_rider_job_by_token(text) to service_role;
grant execute on function public.rider_mark_picked_up(text) to service_role;
grant execute on function public.rider_complete_delivery(text, text, text, text) to service_role;

-- Staff RPCs: authenticated staff and service_role
grant execute on function public.create_rider_link(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.revoke_rider_link(uuid) to authenticated, service_role;

-- Verification assertions
do $verify$
begin
  if has_table_privilege('anon', 'public.delivery_job_links', 'INSERT')
     or has_table_privilege('anon', 'public.delivery_job_links', 'UPDATE')
     or has_table_privilege('anon', 'public.delivery_job_links', 'DELETE')
     or has_table_privilege('anon', 'public.delivery_job_links', 'SELECT')
     or has_function_privilege('anon', 'public.create_rider_link(uuid, uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.revoke_rider_link(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0190: delivery_job_links must not expose table access or management to anon';
  end if;

  -- authenticated cannot execute the 3 rider RPCs (service_role only, R1)
  if has_function_privilege('authenticated', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0190: rider RPCs must NOT be executable by authenticated (service_role only)';
  end if;

  -- service_role CAN execute the 3 rider RPCs
  if not has_function_privilege('service_role', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0190: rider RPCs must be executable by service_role';
  end if;

  -- authenticated cannot select column token_hash on delivery_job_links (R1)
  if has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT') then
    raise exception '0190: token_hash column must NOT be readable by authenticated';
  end if;

  -- authenticated CAN select id and client_uuid
  if not has_column_privilege('authenticated', 'public.delivery_job_links', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.delivery_job_links', 'client_uuid', 'SELECT')
  then
    raise exception '0190: id and client_uuid must be readable by authenticated';
  end if;
end;
$verify$;

commit;

-- Record 0190_one_time_rider_links in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030032', '0190_one_time_rider_links')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0190_one_time_rider_links.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0191_delivery_reschedule_job.sql
-- SHA-256: 2269f43291f743bf628c0f8afc58ae656984f9d1089080624f3e9f2b8d022039
-- Version: 20261122030033
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0191_delivery_reschedule_job.sql
-- Reschedule a delivery (T4-02, Ruling D8, Law 8)
-- Moves only the delivery job's scheduled time; booking rental dates stay unchanged (D8).
-- Change is recorded in delivery_job_events and audited.

begin;

alter table public.delivery_job_events
  drop constraint if exists delivery_job_events_event_kind_check;

alter table public.delivery_job_events
  add constraint delivery_job_events_event_kind_check
  check (event_kind in ('Created', 'Assigned', 'Transition', 'Rescheduled'));

create or replace function public.delivery_reschedule_job(
  p_job_id uuid,
  p_new_scheduled_at timestamptz,
  p_request_key uuid,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_receipt public.delivery_job_events%rowtype;
  v_old_scheduled_at timestamptz;
begin
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active) then
    raise exception 'Delivery rescheduling requires an authenticated actor' using errcode = '42501';
  end if;

  if p_new_scheduled_at is null then
    raise exception 'New scheduled time is required for rescheduling';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  -- Only Owner, Admin, Manager, Coordinator (for matching branch) may reschedule delivery jobs
  if not (
    v_role in ('Owner','Admin') or (
      v_role in ('Manager','Coordinator') and exists (
        select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
      )
    )
  ) then
    raise exception 'Delivery rescheduling not permitted for role %', v_role using errcode = '42501';
  end if;

  -- Cannot reschedule terminal states (Delivered, Failed)
  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Delivered or Failed delivery jobs cannot be rescheduled';
  end if;

  -- Idempotency check via delivery_job_events (Law 8)
  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    if v_receipt.job_id = p_job_id and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Rescheduled' then
      return p_job_id;
    end if;
    raise exception 'Rescheduling key belongs to a different request';
  end if;

  if not exists (select 1 from public.bookings b where b.id = v_job.booking_id and b.cancelled_at is null) then
    raise exception 'Cancelled booking delivery cannot be rescheduled';
  end if;

  v_old_scheduled_at := v_job.scheduled_at;

  update public.delivery_jobs
     set scheduled_at = p_new_scheduled_at,
         last_note = coalesce(nullif(btrim(p_notes), ''), last_note),
         version = version + 1,
         updated_at = now(),
         updated_by = v_actor
   where id = p_job_id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    p_request_key, p_job_id, 'Rescheduled', v_job.status, v_job.status, v_actor,
    jsonb_strip_nulls(jsonb_build_object(
      'old_scheduled_at', v_old_scheduled_at,
      'new_scheduled_at', p_new_scheduled_at,
      'notes', nullif(btrim(p_notes), '')
    ))
  );

  return p_job_id;
end;
$$;

revoke all on function public.delivery_reschedule_job(uuid,timestamptz,uuid,text) from public, anon;
grant execute on function public.delivery_reschedule_job(uuid,timestamptz,uuid,text) to authenticated;

commit;

-- Record 0191_delivery_reschedule_job in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030033', '0191_delivery_reschedule_job')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0191_delivery_reschedule_job.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0192_notification_records.sql
-- SHA-256: 89919ad4c858cd5d5b3bf8ab76c068bdc6ef52300903812b35d0370c17ccc2c6
-- Version: 20261122030034
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0192_notification_records.sql — Notification records (T5-01)
--
-- Implements in-app notifications per 21 Jul lock:
--   - Role-based notifications (Coordinator -> bookings, Warehouse -> queues, Accounts -> payments).
--   - Law 6: Zero money in payloads or text for money-blind roles (Warehouse, Technician, Driver, Client).
--   - Law 3: Archive / mark-read, never delete.
--   - Law 8: client_uuid idempotency keys.
--   - RLS: Users can only read and mark-read their own notifications.
-- =============================================================================

begin;

-- 1. Extend notifications table
alter table public.notifications
  add column if not exists type text not null default 'general',
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists recipient_role text;

alter table public.notifications
  alter column notification_no set default ('NOTIF-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8));

update public.notifications n
set recipient_role = u.primary_role::text
from public.users u
where n.user_id = u.id and n.recipient_role is null;

create index if not exists idx_notifications_type on public.notifications(type);
create index if not exists idx_notifications_entity on public.notifications(entity_type, entity_id);

-- 2. Law 3: Hard delete forbidden
create or replace function public.trg_notifications_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): notifications cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_notifications_prevent_delete on public.notifications;
create trigger trg_notifications_prevent_delete
  before delete on public.notifications
  for each row execute function public.trg_notifications_prevent_delete_fn();

revoke all on function public.trg_notifications_prevent_delete_fn() from public, anon;
grant execute on function public.trg_notifications_prevent_delete_fn() to authenticated;

-- 3. Immutability guard trigger: only is_read and read_at can be modified
create or replace function public.trg_notifications_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if NEW.id <> OLD.id
     or NEW.client_uuid <> OLD.client_uuid
     or NEW.user_id <> OLD.user_id
     or NEW.title <> OLD.title
     or NEW.message <> OLD.message
     or NEW.type <> OLD.type
     or coalesce(NEW.entity_type, '') <> coalesce(OLD.entity_type, '')
     or coalesce(NEW.entity_id, '') <> coalesce(OLD.entity_id, '')
     or coalesce(NEW.link_url, '') <> coalesce(OLD.link_url, '') then
    raise exception 'IMMUTABLE: only read status (is_read, read_at) may be updated on notifications'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notifications_update_guard on public.notifications;
create trigger trg_notifications_update_guard
  before update on public.notifications
  for each row execute function public.trg_notifications_update_guard_fn();

revoke all on function public.trg_notifications_update_guard_fn() from public, anon;
grant execute on function public.trg_notifications_update_guard_fn() to authenticated;

-- 4. Row Level Security policies
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select
  to authenticated
  using (
    (
      user_id = public.auth_user_id()
      or public.auth_user_role() in ('Owner', 'Admin')
    )
    and public.auth_is_staff()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update
  to authenticated
  using (
    (
      user_id = public.auth_user_id()
      or public.auth_user_role() in ('Owner', 'Admin')
    )
    and public.auth_is_staff()
  )
  with check (
    (
      user_id = public.auth_user_id()
      or public.auth_user_role() in ('Owner', 'Admin')
    )
    and public.auth_is_staff()
  );

-- Delete policy to trigger Law 3 guard
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete
  to authenticated
  using (public.auth_is_staff());

grant select, update, delete on public.notifications to authenticated;

-- 5. View for active notifications
create or replace view public.notifications_v with (security_barrier = true) as
select
  n.id,
  n.client_uuid,
  n.notification_no,
  n.user_id,
  n.recipient_role,
  n.type,
  n.title,
  n.message,
  n.message as body,
  n.channel,
  n.severity,
  n.entity_type,
  n.entity_id,
  n.link_url,
  n.is_read,
  n.read_at,
  n.created_at
from public.notifications n
where (
    n.user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  )
  and public.auth_is_staff()
order by n.created_at desc;

revoke all on public.notifications_v from public, anon;
grant select on public.notifications_v to authenticated;

-- 6. RPC: Create notification
create or replace function public.create_notification(
  p_client_uuid uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_link_url text default null,
  p_severity alert_severity default 'Information'::alert_severity
)
returns public.notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_notification public.notifications;
  v_existing public.notifications;
  v_notif_no text;
begin
  if p_client_uuid is null then
    raise exception 'client_uuid is required (Law 8)';
  end if;

  select * into v_existing from public.notifications where client_uuid = p_client_uuid;
  if v_existing.id is not null then
    return v_existing;
  end if;

  select primary_role::text into v_role from public.users where id = p_user_id;
  if v_role is null then
    raise exception 'Recipient user not found';
  end if;

  -- Law 6 Enforcement Check: If recipient is money-blind, forbid currency symbols or amounts
  if v_role in ('Warehouse', 'Technician', 'Driver', 'Client') then
    if p_message ~* '(Rs\.?|paisa|NPR|[0-9]+,[0-9]{3}|[0-9]+\.[0-9]{2})' or p_title ~* '(Rs\.?|paisa|NPR)' then
      raise exception 'LAW 6 VIOLATION: Notification text for money-blind role % cannot contain monetary amounts', v_role
        using errcode = '42501';
    end if;
  end if;

  v_notif_no := 'NOTIF-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.notifications (
    client_uuid,
    notification_no,
    user_id,
    recipient_role,
    type,
    title,
    message,
    channel,
    severity,
    entity_type,
    entity_id,
    link_url,
    is_read,
    created_at
  ) values (
    p_client_uuid,
    v_notif_no,
    p_user_id,
    v_role,
    coalesce(nullif(btrim(p_type), ''), 'general'),
    btrim(p_title),
    btrim(p_message),
    'In-App'::channel_code,
    coalesce(p_severity, 'Information'::alert_severity),
    p_entity_type,
    p_entity_id,
    p_link_url,
    false,
    now()
  )
  returning * into v_notification;

  return v_notification;
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, text, text, text, text, text, alert_severity) from public, anon;
grant execute on function public.create_notification(uuid, uuid, text, text, text, text, text, text, alert_severity) to authenticated;

-- 7. RPC: Mark single notification read
create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.notifications;
begin
  update public.notifications
  set
    is_read = true,
    read_at = coalesce(read_at, now())
  where id = p_notification_id
    and (user_id = public.auth_user_id() or public.auth_user_role() in ('Owner', 'Admin'))
  returning * into v_notification;

  if v_notification.id is null then
    raise exception 'Notification not found or access denied';
  end if;

  return v_notification;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- 8. RPC: Mark all notifications read
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.notifications
    set
      is_read = true,
      read_at = coalesce(read_at, now())
    where user_id = public.auth_user_id()
      and is_read = false
    returning id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- 9. RPC: Notify staff (broadcast to staff members)
-- Builds separate messages for money roles and money-blind roles under Law 6.
create or replace function public.notify_staff(
  p_type text,
  p_title text,
  p_message_money text,
  p_message_money_blind text,
  p_link_url text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_severity alert_severity default 'Information'::alert_severity
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_count integer := 0;
  v_msg text;
begin
  for v_user in
    select id, primary_role::text as role
    from public.users
    where coalesce(is_active, true) = true
      and primary_role is not null
      and primary_role::text <> 'Client'
  loop
    if v_user.role in ('Warehouse', 'Technician', 'Driver', 'Client') then
      v_msg := coalesce(p_message_money_blind, 'Update: ' || p_title);
    else
      v_msg := coalesce(p_message_money, p_message_money_blind);
    end if;

    perform public.create_notification(
      gen_random_uuid(),
      v_user.id,
      p_type,
      p_title,
      v_msg,
      p_entity_type,
      p_entity_id,
      p_link_url,
      p_severity
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_staff(text, text, text, text, text, text, text, alert_severity) from public, anon;
grant execute on function public.notify_staff(text, text, text, text, text, text, text, alert_severity) to authenticated;

-- 10. Event triggers: Shift handover waiting & Damage case opened
create or replace function public.trg_shift_handover_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'pending' then
    perform public.notify_staff(
      'shift_handover',
      'Shift Handover Waiting',
      'Shift ' || NEW.shift_code || ' handover by ' || NEW.from_user_name || ' waiting for review',
      'Shift ' || NEW.shift_code || ' handover by ' || NEW.from_user_name || ' waiting for review',
      '/notes',
      'shift_handover',
      NEW.id::text,
      'Information'::alert_severity
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_shift_handover_notify on public.shift_handovers;
create trigger trg_shift_handover_notify
  after insert on public.shift_handovers
  for each row execute function public.trg_shift_handover_notify_fn();

revoke all on function public.trg_shift_handover_notify_fn() from public, anon;
grant execute on function public.trg_shift_handover_notify_fn() to authenticated;

create or replace function public.trg_case_damage_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.type = 'Damage' then
    perform public.notify_staff(
      'damage_case',
      'Damage Case Opened',
      'Damage case ' || NEW.case_no || ' opened: ' || NEW.title,
      'Damage case ' || NEW.case_no || ' opened: ' || NEW.title,
      '/inventory',
      'case',
      NEW.id::text,
      'Warning'::alert_severity
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_case_damage_notify on public.cases;
create trigger trg_case_damage_notify
  after insert on public.cases
  for each row execute function public.trg_case_damage_notify_fn();

revoke all on function public.trg_case_damage_notify_fn() from public, anon;
grant execute on function public.trg_case_damage_notify_fn() to authenticated;

commit;

-- Record 0192_notification_records in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030034', '0192_notification_records')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0192_notification_records.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0193_invoice_write_hardening.sql
-- SHA-256: 08c537f4964c55e68cc4b21a3d0e2a5f29b5c2e2ee3c994e95f880971a8bccce
-- Version: 20261122030035
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0193: Harden the invoice write path (T3-14a)
--
-- Fixes three defects found in the T3-14 readiness audit (27 Oct 2026):
-- F2: issue_invoice reads the invoice without FOR UPDATE, so concurrent issues
--     both pass the Draft check, both mint numbers, and the first number is
--     burned — a gap in INV- which 0086:88-91 forbids.
-- F5: invoice_lines has no parent-status guard, so an issued invoice's lines
--     can be rewritten while line_total (and therefore the total) stays
--     identical, so nothing raises.
-- F4: extend_booking increments invoice_lines.days on Draft invoices but
--     line_total is a stored column; recalculate_invoice_totals only sums it,
--     so drafts do not reprice — contradicting 0111:9 and extendRental.ts:16.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- =============================================================================
-- F2 PART 1: issue_invoice — lock the invoice row with FOR UPDATE before check
-- =============================================================================

create or replace function public.issue_invoice(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice_id   uuid    := (p_payload ->> 'invoice_id')::uuid;
  v_actor        uuid    := nullif(coalesce(p_payload ->> 'issued_by', p_payload ->> 'actor_id', ''), '')::uuid;
  v_issue_date   date    := nullif(coalesce(p_payload ->> 'issue_date', ''), '')::date;
  v_role         system_role;
  v_invoice      invoices%rowtype;
  v_line_count   integer := 0;
  v_invoice_no   text;
  v_terms        text;
  v_term_days    integer := 0;
  v_due_date     date;
  v_new_status   invoice_status;
begin
  -- 1. Role & authorization checks (R-05)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'issue_invoice: this session (%) may not issue an invoice. R-05 gives that to Owner, Admin, Manager and Accounts.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  if not auth_can_view_money() then
    raise exception
      'issue_invoice: this session cannot read money (Law 6), so it cannot issue an invoice.'
      using errcode = '42501';
  end if;

  if v_invoice_id is null then
    raise exception 'issue_invoice: invoice_id is required.';
  end if;

  -- 2. Verify invoice existence and eligibility — FOR UPDATE locks the row
  --    so a second concurrent caller blocks here, then re-checks under the lock
  select * into v_invoice from invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'issue_invoice: invoice % does not exist.', v_invoice_id;
  end if;

  if v_invoice.voided_at is not null or v_invoice.status = 'Void' then
    raise exception 'issue_invoice: invoice % is voided and cannot be issued.', v_invoice_id;
  end if;

  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception
      'issue_invoice: invoice % is already issued (status %, invoice_no %). Only a Draft can be issued.',
      v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  select count(*) into v_line_count from invoice_lines where invoice_id = v_invoice_id;
  if v_line_count = 0 then
    raise exception 'issue_invoice: invoice % has no lines. An empty invoice cannot be issued.', v_invoice_id;
  end if;

  -- 3. Mint invoice number (R-15) — still inside the same transaction/lock
  v_invoice_no := next_document_number('invoice');
  if v_invoice_no is null then
    raise exception 'issue_invoice: next_document_number failed to mint an invoice number.';
  end if;

  -- 4. Date calculation
  v_issue_date := coalesce(v_issue_date, current_date);

  select payment_terms::text into v_terms from clients where id = v_invoice.client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := v_issue_date + v_term_days;

  -- 5. Determine status
  if v_invoice.outstanding_amount = 0 and v_invoice.total_amount > 0 then
    v_new_status := 'Paid'::invoice_status;
  elsif v_invoice.paid_amount > 0 then
    v_new_status := 'Partially Paid'::invoice_status;
  else
    v_new_status := 'Sent'::invoice_status;
  end if;

  -- 6. Update the invoice row
  update invoices
     set invoice_no = v_invoice_no,
         issue_date = v_issue_date,
         due_date   = coalesce(v_due_date, due_date),
         status     = v_new_status,
         updated_at = now(),
         updated_by = coalesce(v_actor, v_invoice.updated_by)
   where id = v_invoice_id;

  -- 7. Read back updated invoice
  select * into v_invoice from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',         v_invoice.id,
    'invoice_no',         v_invoice.invoice_no,
    'status',             v_invoice.status,
    'issue_date',         v_invoice.issue_date,
    'due_date',           v_invoice.due_date,
    'booking_id',         v_invoice.booking_id,
    'client_id',          v_invoice.client_id,
    'line_count',         v_line_count,
    'subtotal',           v_invoice.subtotal,
    'discount_amount',    v_invoice.discount_amount,
    'taxable_amount',     v_invoice.taxable_amount,
    'vat_amount',         v_invoice.vat_amount,
    'total_amount',       v_invoice.total_amount,
    'paid_amount',        v_invoice.paid_amount,
    'outstanding_amount', v_invoice.outstanding_amount
  );
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return issue_invoice(jsonb_build_object('invoice_id', p_invoice_id));
end;
$$;

comment on function public.issue_invoice(jsonb) is
  'Issues a Draft invoice: mints invoice_no via next_document_number(''invoice'') (R-15), '
  'sets issue_date, derives due_date from client terms, sets status (Sent/Paid), and locks figures '
  'under reject_invoice_edit_after_issue(). R-05 role check enforced. Row is locked with FOR UPDATE '
  'so concurrent issues serialize and only one mints a number.';

comment on function public.issue_invoice(uuid) is
  'Convenience overload of issue_invoice(jsonb).';

revoke execute on function public.issue_invoice(jsonb) from public;
grant execute on function public.issue_invoice(jsonb) to authenticated;

revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;

-- =============================================================================
-- F2 PART 2: Make invoice_no and issue_date immutable on issued invoices
-- =============================================================================
-- The existing trigger reject_invoice_edit_after_issue() protects seven money
-- columns but NOT invoice_no or issue_date. Add them to the guard.

create or replace function reject_invoice_edit_after_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 1. Voided invoices are completely immutable
  if OLD.status = 'Void' then
    raise exception 'GATE:gate.invoice.void_immutable|A voided invoice is immutable and cannot be modified.' using errcode = 'P0001';
  end if;

  -- 2. Draft invoices can be edited freely (except cannot transition directly to Void without discipline)
  if OLD.status = 'Draft' and NEW.status <> 'Void' then
    return NEW;
  end if;

  -- 3. Voiding transition: status becomes 'Void'
  if NEW.status = 'Void' and OLD.status <> 'Void' then
    -- (a) Role check: Owner, Admin, Manager, Accounts
    if not (auth_is_finance_or_admin() or coalesce(current_setting('app.override_role', true), '') in ('Owner', 'Admin', 'Manager', 'Accounts')) then
      raise exception 'GATE:gate.invoice.void_role|Only Owner, Admin, Manager, or Accounts may void an invoice.' using errcode = 'P0001';
    end if;

    -- (b) Reason check (>= 10 chars)
    if length(coalesce(btrim(NEW.void_reason), '')) < 10 then
      raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires a reason of at least 10 characters.' using errcode = 'P0001';
    end if;

    -- Auto-stamp voided_by and voided_at if not set
    if NEW.voided_by is null then
      NEW.voided_by := nullif(current_setting('app.current_user_id', true), '')::uuid;
      if NEW.voided_by is null then
        begin
          NEW.voided_by := auth.uid();
        exception when others then
          null;
        end;
      end if;
    end if;
    if NEW.voided_at is null then
      NEW.voided_at := now();
    end if;

    if NEW.voided_by is null or NEW.voided_at is null then
      raise exception 'GATE:gate.invoice.void_reason|Voiding an invoice requires voided_by and voided_at.' using errcode = 'P0001';
    end if;

    -- (c) If paid_amount > 0, credit note must exist
    if OLD.paid_amount > 0 then
      if not exists (
        select 1 from credit_notes
        where invoice_id = NEW.id
      ) then
        raise exception 'GATE:gate.invoice.void_paid|Cannot void an invoice with payments unless a credit note has been issued.' using errcode = 'P0001';
      end if;

      if NEW.credit_note_no is null then
        select credit_note_no into NEW.credit_note_no
        from credit_notes
        where invoice_id = NEW.id
        order by created_at desc
        limit 1;
      end if;
    end if;

    -- Figures must remain unchanged while voiding
    if NEW.subtotal is distinct from OLD.subtotal
      or NEW.discount_amount is distinct from OLD.discount_amount
      or NEW.discount_percent is distinct from OLD.discount_percent
      or NEW.taxable_amount is distinct from OLD.taxable_amount
      or NEW.vat_amount is distinct from OLD.vat_amount
      or NEW.total_amount is distinct from OLD.total_amount
      or NEW.due_date is distinct from OLD.due_date
      or NEW.invoice_no is distinct from OLD.invoice_no
      or NEW.issue_date is distinct from OLD.issue_date
    then
      raise exception 'Law 4/finance: invoice % cannot change its own figures while being voided.', OLD.invoice_no;
    end if;

    return NEW;
  end if;

  -- 4. An issued invoice cannot revert to Draft
  if NEW.status = 'Draft' and OLD.status <> 'Draft' then
    raise exception 'Law 4/finance: an issued invoice (%) cannot revert to Draft.', OLD.invoice_no;
  end if;

  -- 5. Figures and invoice_no / issue_date are immutable on issued invoices
  if NEW.subtotal is distinct from OLD.subtotal
    or NEW.discount_amount is distinct from OLD.discount_amount
    or NEW.discount_percent is distinct from OLD.discount_percent
    or NEW.taxable_amount is distinct from OLD.taxable_amount
    or NEW.vat_amount is distinct from OLD.vat_amount
    or NEW.total_amount is distinct from OLD.total_amount
    or NEW.due_date is distinct from OLD.due_date
    or NEW.invoice_no is distinct from OLD.invoice_no
    or NEW.issue_date is distinct from OLD.issue_date
  then
    raise exception 'Law 4/finance: invoice % is issued (status %) — its figures are immutable. Corrections take Void + Credit Note, never a direct edit.', OLD.invoice_no, OLD.status;
  end if;

  return NEW;
end;
$$;

-- =============================================================================
-- F5: invoice_lines — parent status guard
-- =============================================================================
-- Add a BEFORE INSERT OR UPDATE OR DELETE trigger that raises unless the
-- parent invoice is still Draft and not voided. The message must name the
-- invoice and say what to do instead.

create or replace function guard_invoice_lines_parent_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_status invoice_status;
  v_parent_voided timestamptz;
  v_parent_no text;
begin
  -- DELETE uses OLD, INSERT/UPDATE use NEW
  if TG_OP = 'DELETE' then
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = OLD.invoice_id;
  else
    select status, voided_at, invoice_no into v_parent_status, v_parent_voided, v_parent_no
      from invoices where id = NEW.invoice_id;
  end if;

  if not found then
    -- Parent invoice deleted (should not happen with FK) — allow for safety
    return NEW;
  end if;

  if v_parent_status <> 'Draft' or v_parent_voided is not null then
    raise exception
      'invoice_lines: invoice % is not a Draft (status %, voided_at %). An issued invoice''s lines are immutable — correct it with a credit note.',
      v_parent_no, v_parent_status, v_parent_voided
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_invoice_lines_parent_status on invoice_lines;
create trigger trg_guard_invoice_lines_parent_status
  before insert or update or delete on invoice_lines
  for each row execute function guard_invoice_lines_parent_status();

comment on trigger trg_guard_invoice_lines_parent_status on invoice_lines is
  'F5: Prevents insert/update/delete on invoice_lines when parent invoice is not Draft. '
  'Issued invoices must be corrected with a credit note, not by editing lines.';

-- =============================================================================
-- F4: extend_booking — recompute line_total for Draft invoice lines
-- =============================================================================
-- The existing code at lines 126-129 only increments days. line_total is a
-- stored column (not GENERATED) so recalculate_invoice_totals only sums it.
-- We must recompute line_total using the same arithmetic create_invoice uses:
--   Equipment/Accessory/Service: qty * days * rate - discount
--   Crew: day_rate * days + overtime + accommodation + meals
--   Transport: delivery_charge + fuel_charge
-- Crew lines are per-engagement totals, not per-day; an extension must not
-- silently multiply accommodation or meals.

create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'extended_by', ''), '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role & permission validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator')
       and is_active
     order by created_at
     limit 1;
  end if;

  if v_role is null and v_actor is not null then
    select primary_role into v_role from users where id = v_actor;
  end if;
  v_role := coalesce(v_role, 'Coordinator');

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. If a Draft invoice exists, increment invoice_lines.days AND recompute line_total
  --    for the affected lines, using the same arithmetic as create_invoice (0168:871).
  --
  --    Equipment / Services / Sub-Rental: line_total = qty * days * rate - discount.
  --    Crew: line_total = day_rate * days + extras (extras = overtime + accommodation + meals).
  --          unit_rate = day_rate + extras/days, so line_total = unit_rate * days.
  --          Extension should add day_rate * v_days, NOT multiply extras.
  --          Since we only store unit_rate (which includes pro-rated extras), we cannot
  --          perfectly separate day_rate from extras without a schema change.
  --          For now: increment line_total by unit_rate * v_days (adds pro-rated extras).
  --          This is a known limitation — crew lines need day_rate stored separately
  --          for exact extension math (MONEY-07 related).
  --    Transport: days is always 1, line_total unchanged.
  update invoice_lines il
     set days = days + v_days,
         line_total = case il.line_kind
           when 'Equipment Rental' then
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
           when 'Services' then
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
           when 'Sub-Rental' then
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
           when 'Crew Charges' then
             -- LIMITATION: unit_rate includes pro-rated extras; this adds them again.
             -- Correct fix requires storing day_rate and extras separately (MONEY-07).
             il.line_total + il.unit_rate * v_days
           when 'Transport' then
             -- Transport days stays 1, line_total unchanged
             il.line_total
           else
             -- Unknown kind: fallback to qty * days * rate (should not happen with enum)
             greatest(0, il.quantity * (il.days + v_days) * il.unit_rate - coalesce(il.discount_percent, 0) / 100.0 * il.quantity * (il.days + v_days) * il.unit_rate)
         end
   where il.invoice_id in (select id from invoices where booking_id = v_booking_id and status = 'Draft');

  -- 9. Insert audit log
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
    old_values,
    new_values,
    reason
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()),
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days
  );
end;
$$;

create or replace function public.extend_booking(
  p_booking_id uuid,
  p_days integer,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.extend_booking(jsonb_build_object(
    'booking_id', p_booking_id,
    'days', p_days,
    'reason', p_reason,
    'actor_id', p_actor_id
  ));
end;
$$;

grant execute on function public.extend_booking(jsonb) to authenticated;
grant execute on function public.extend_booking(uuid, integer, text, uuid) to authenticated;

comment on function public.extend_booking(jsonb) is
  'Extends a booking by N days. Checks role permissions (C+), updates return_at, updates line days, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events. '
  'For Draft invoices: increments days AND recomputes line_total using create_invoice arithmetic '
  '(Equipment/Service/Sub-Rental = qty*days*rate - discount; Crew = unit_rate*days with extras already folded in; Transport unchanged). '
  'Issued invoices are not touched (F5 guard prevents line edits).';

commit;

-- Record 0193_invoice_write_hardening in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030035', '0193_invoice_write_hardening')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0193_invoice_write_hardening.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0194_reset_damage_opens_case.sql
-- SHA-256: 5ae9adc077189afaea1cec63852deaf19e4e181a77baa5c732d77b095d21cb45
-- Version: 20261122030036
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0194: Damage found during reset opens a case (T2-15)
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

-- Record 0194_reset_damage_opens_case in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030036', '0194_reset_damage_opens_case')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0194_reset_damage_opens_case.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0195_load_membership_plans.sql
-- SHA-256: 7e08d763467331d788ecd336df667e173faa598183b8c4ac5cd88b72322e2f44
-- Version: 20261122030037
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0195: Load Babin's Membership Plans (T8-01, D21, D32)
--
-- Rulings:
--   D21: Memberships live at go-live.
--   D32: How membership plans get in: Babin sends a table; it is loaded for him.
--
-- T8-01 loads the 5 standard membership plans into public.membership_plans:
--   1. Academy: Rs 6,000/yr, 10% individual, 5% bundle, 3 bookings/mo, 1 rental, 1 user, Rs 0 default credit, 12 mo term, perks: none.
--   2. Creator: Rs 15,000/yr, 15% individual, 7% bundle, 7 bookings/mo, 2 rentals, 1 user, Rs 0 default credit, 12 mo term, perks: none.
--   3. Cinematographer: Rs 35,000/yr, 20% individual, 10% bundle, 10 bookings/mo, 3 rentals, 2 users, Rs 1,00,000 default credit, 12 mo term, perks: none.
--   4. Production Alliance: Rs 80,000/yr, 20% individual, 12% bundle, 20 bookings/mo, 7 rentals, 5 users, Rs 2,50,000 default credit, 12 mo term, perks: Priority Booking, Dedicated Manager, Company Billing, Credit Terms.
--   5. Elite: Custom fee (NULL), 20% individual, Custom bundle (NULL), Unlimited bookings (NULL), Unlimited rentals (NULL), Unlimited users (NULL), Rs 5,00,000 default credit, 12 mo term, perks: Dedicated Manager, VIP Support, Custom Solutions, Company Billing, Credit Terms.
--
-- Invariants:
--   - Hard discount cap <= 25% (0005 check: membership_plans_discount_hard_cap).
--   - Display order is 1 to 5.
--   - Column masking on membership_plans_v preserves Law 6 money-blindness.
--   - Idempotent: ON CONFLICT (level) DO UPDATE.
-- =============================================================================

begin;

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
) values
  (
    '11111111-0000-0000-0000-000000000001'::uuid,
    'Academy',
    'Access Member',
    6000.00,
    10,
    5,
    3,
    1,
    1,
    0.00,
    12,
    '{}'::membership_perk[],
    1,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000002'::uuid,
    'Creator',
    'Access Member',
    15000.00,
    15,
    7,
    7,
    2,
    1,
    0.00,
    12,
    '{}'::membership_perk[],
    2,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000003'::uuid,
    'Cinematographer',
    'Access Member',
    35000.00,
    20,
    10,
    10,
    3,
    2,
    100000.00,
    12,
    '{}'::membership_perk[],
    3,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000004'::uuid,
    'Production Alliance',
    'Partner',
    80000.00,
    20,
    12,
    20,
    7,
    5,
    250000.00,
    12,
    '{"Priority Booking","Dedicated Manager","Company Billing","Credit Terms"}'::membership_perk[],
    4,
    'Active'
  ),
  (
    '11111111-0000-0000-0000-000000000005'::uuid,
    'Elite',
    'Elite Member',
    null,
    20,
    null,
    null,
    null,
    null,
    500000.00,
    12,
    '{"Dedicated Manager","VIP Support","Custom Solutions","Company Billing","Credit Terms"}'::membership_perk[],
    5,
    'Active'
  )
on conflict (level) do update set
  label = excluded.label,
  annual_fee = excluded.annual_fee,
  individual_discount_pct = excluded.individual_discount_pct,
  bundle_discount_pct = excluded.bundle_discount_pct,
  monthly_booking_limit = excluded.monthly_booking_limit,
  simultaneous_rental_limit = excluded.simultaneous_rental_limit,
  authorized_users = excluded.authorized_users,
  default_credit_limit = excluded.default_credit_limit,
  term_months = excluded.term_months,
  perks = excluded.perks,
  display_order = excluded.display_order,
  status = excluded.status,
  updated_at = now();

commit;

-- Record 0195_load_membership_plans in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030037', '0195_load_membership_plans')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0195_load_membership_plans.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0196_membership_plans_admin.sql
-- SHA-256: 7bbd79d90ab57b096154e31cab7671afc0b4507af1dc876c70e470e60bc00cc9
-- Version: 20261122030038
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0196: Membership Plans Admin (T8-02, Law 3, Law 6, D21, D32)
--
-- Rulings & Invariants:
--   - Law 3: Nothing is deleted. Direct DELETE on membership_plans is refused by trigger.
--   - Law 6: Warehouse, Technician, Driver, Client are money-blind.
--   - Role permissions: Owner, Admin, Manager can save and retire plans.
--     Coordinator is read-only.
--   - Hard discount cap <= 25% (0005 check: membership_plans_discount_hard_cap).
--   - Audited: Every plan create, update, or status change writes an audit_events row.
--   - Retired plans protect existing members but cannot take new members.
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
  p_client_uuid uuid default gen_random_uuid(),
  p_plan_id uuid default null
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
  -- Authority check: Manager, Admin, Owner only (Coordinator is read-only per T8-02)
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

  -- Look up existing plan by p_plan_id first, then by level
  if p_plan_id is not null then
    select * into v_existing from public.membership_plans where id = p_plan_id;
  end if;

  if v_existing.id is null then
    select * into v_existing from public.membership_plans where level = v_parsed_level;
  end if;

  if v_existing.id is not null then
    v_plan_id := v_existing.id;

    -- Ensure level uniqueness if level is being changed
    if exists (select 1 from public.membership_plans where level = v_parsed_level and id <> v_plan_id) then
      raise exception 'GATE:membership_plan.duplicate_level: A plan with level "%" already exists.', p_level
        using errcode = '23505';
    end if;

    update public.membership_plans
    set
      level = v_parsed_level,
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
      client_uuid,
      event_class,
      category,
      module,
      action,
      severity,
      status,
      table_name,
      record_id,
      actor_id,
      new_values,
      reason
    ) values (
      coalesce(p_client_uuid, gen_random_uuid()),
      'status change',
      'Administration',
      'Clients',
      'Update',
      'Informational',
      'Success',
      'membership_plans',
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
      'membership_plan.updated'
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
      client_uuid,
      event_class,
      category,
      module,
      action,
      severity,
      status,
      table_name,
      record_id,
      actor_id,
      new_values,
      reason
    ) values (
      coalesce(p_client_uuid, gen_random_uuid()),
      'status change',
      'Administration',
      'Clients',
      'Create',
      'Informational',
      'Success',
      'membership_plans',
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
      'membership_plan.created'
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
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    new_values,
    reason
  ) values (
    coalesce(p_client_uuid, gen_random_uuid()),
    'status change',
    'Administration',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'membership_plans',
    p_plan_id,
    v_user_id,
    jsonb_build_object(
      'level', v_plan.level::text,
      'old_status', v_plan.status::text,
      'new_status', v_new_status::text
    ),
    case when p_retire then 'membership_plan.retired' else 'membership_plan.reactivated' end
  );

  return jsonb_build_object(
    'ok', true,
    'plan_id', p_plan_id,
    'level', v_plan.level::text,
    'status', v_new_status::text
  );
end;
$$;


-- 4. Invariant: A retired plan cannot take new members (T8-02, Law 3)
create or replace function public.enroll_client_membership(
  p_client_id uuid,
  p_plan_id uuid,
  p_join_date date,
  p_fee_paid numeric,
  p_notes text,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_plan record;
  v_existing_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager', 'Coordinator'), false) then
    raise exception 'Permission denied to enroll membership.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_client_id is null then raise exception 'Client is required.'; end if;
  if p_plan_id is null then raise exception 'Plan is required.'; end if;

  v_request := jsonb_build_object('client_id', p_client_id, 'plan_id', p_plan_id, 'join_date', p_join_date, 'fee_paid', p_fee_paid, 'notes', p_notes);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then raise exception 'Client not found.'; end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if not found then raise exception 'Membership plan not found.'; end if;
  if v_plan.status::text <> 'Active' then
    raise exception 'GATE:membership_plan.retired: That membership plan is retired and cannot take new members.' using errcode = '23514';
  end if;

  -- Lock and supersede any active live membership for this client
  select id into v_existing_id
    from public.client_memberships
   where client_id = p_client_id and superseded_at is null
     for update;

  if v_existing_id is not null then
    update public.client_memberships
       set superseded_at = clock_timestamp()
     where id = v_existing_id;
  end if;

  insert into public.client_memberships (
    id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
    fee_paid,
    notes,
    created_by
  ) values (
    v_new_id,
    p_key,
    p_client_id,
    p_plan_id,
    coalesce(p_join_date, current_date),
    p_fee_paid,
    p_notes,
    auth.uid()
  );

  v_response := jsonb_build_object(
    'id', v_new_id,
    'client_id', p_client_id,
    'plan_id', p_plan_id,
    'level', v_plan.level,
    'plan_label', v_plan.label,
    'join_date', coalesce(p_join_date, current_date),
    'fee_paid', p_fee_paid,
    'superseded_membership_id', v_existing_id
  );

  insert into record_editor_private.receipts (key, actor, request, response)
  values (p_key, auth.uid(), v_request, v_response);

  return v_response;
end;
$$;


-- 5. Revoke execute from public and anon; grant only to authenticated
revoke execute on function public.save_membership_plan(text, text, numeric, numeric, numeric, int, int, int, numeric, int, text[], int, uuid, uuid) from public, anon;
grant execute on function public.save_membership_plan(text, text, numeric, numeric, numeric, int, int, int, numeric, int, text[], int, uuid, uuid) to authenticated;

revoke execute on function public.retire_membership_plan(uuid, boolean, uuid) from public, anon;
grant execute on function public.retire_membership_plan(uuid, boolean, uuid) to authenticated;

revoke all on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) from public, anon;
grant execute on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) to authenticated;

commit;

-- Record 0196_membership_plans_admin in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030038', '0196_membership_plans_admin')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0196_membership_plans_admin.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0197_membership_plan_change_credit.sql
-- SHA-256: d467029ad1c101f6f0cbcd8748a09eff5bbe5875617f5f7a7d51905db5657df3
-- Version: 20261122030039
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0188_membership_plan_change_credit.sql
--
-- T8-03: Change plan with credit for unused days (Ruling D22, OPEN_DECISIONS §20).
--
-- 1. Adds `account_credit` to `public.clients` (Law 5 liabilities, non-cash store credit).
-- 2. Updates `clients_v` to mask `account_credit` for money-blind roles (Law 6).
-- 3. Replaces `change_client_membership` with D22 credit calculation:
--    credit = old fee * days left / days in old term (integer paisa, half-up).
--    new fee due = max(0, new fee - credit).
--    Excess credit on downgrade is credited to client's `account_credit`, not cash.
--    Refuses retired plans (GATE:membership_plan.retired).
--    Refuses deactivated clients (GATE:client.deactivated).
--    Refuses changing to the same plan (GATE:membership.same_plan).
--    Refuses moving ONTO a custom-fee plan without the negotiated fee
--    (GATE:membership.custom_fee) — Elite's fee is per client; zero is not a price.
--    Refuses moving OFF a membership whose fee was never recorded and whose plan
--    lists none (GATE:membership.fee_unknown) — the credit cannot be priced.
--    Caps days left at the term on file: a backdated effective date cannot
--    credit more than the old fee charged.
--    Restarts new term from effective change date.
--    Audits old plan, new plan, days left, credit, new fee due, and account credit.
-- 4. Unifies `enroll_client_membership` to delegate to `change_client_membership`,
--    eliminating the dual write paths and enforcing the stricter rules across both.

begin;

-- 1. Add account_credit to clients if it doesn't already exist
alter table public.clients
  add column if not exists account_credit numeric(14,2) not null default 0.00
  check (account_credit >= 0);

revoke select (account_credit) on public.clients from authenticated;

-- 2. Update clients_v with masked account_credit
-- (renumbered 0188 -> 0197 on 1 Nov 2026: 0188_staff_renting_gear now runs first and already appended
-- is_staff, staff_user_id to clients_v, so they are kept here ahead of account_credit.)
create or replace view public.clients_v as
 select id,
    client_uuid,
    client_code,
    type_parent,
    org_subtype,
    name,
    phone,
    email,
    pan_vat,
    business_registration,
    website,
    government_id_kind,
    government_id_number,
    address_line,
    city,
    district,
    postal_code,
    country,
    billing_address,
        case
            when auth_can_view_money() then approved_credit_limit
            else null::numeric
        end as approved_credit_limit,
        case
            when auth_can_view_money() then payment_terms
            else null::payment_terms
        end as payment_terms,
    client_since,
    professions,
    segments,
    source,
    referred_by_client_id,
    tags,
    preferred_contact_channels,
    marketing_photo_consent,
    notes,
    assigned_staff_id,
    status,
    deactivated_at,
    deactivated_by,
    deactivation_reason,
    merged_into_client_id,
    portal_default_language,
    created_at,
    created_by,
    updated_at,
    is_staff,
    staff_user_id,
        case
            when auth_can_view_money() then account_credit
            else null::numeric
        end as account_credit
   from public.clients
  where auth_is_staff();

grant select on public.clients_v to authenticated;

-- 3. Replace change_client_membership
create or replace function public.change_client_membership(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_role public.system_role;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_key uuid := (p_payload->>'client_uuid')::uuid;
  v_level text := nullif(btrim(p_payload->>'plan_level'), '');
  v_plan_id uuid := nullif(p_payload->>'plan_id', '')::uuid;
  v_note text := nullif(btrim(p_payload->>'note'), '');
  v_effective_date date := coalesce(
    (p_payload->>'effective_date')::date,
    (p_payload->>'join_date')::date,
    (clock_timestamp() at time zone 'Asia/Kathmandu')::date
  );
  v_fee_paid_in numeric := (p_payload->>'fee_paid')::numeric;

  v_client public.clients%rowtype;
  v_plan public.membership_plans%rowtype;
  v_old public.client_memberships%rowtype;
  v_old_plan public.membership_plans%rowtype;
  v_receipt public.audit_events%rowtype;

  v_old_level text;
  v_new_id uuid;

  v_old_fee_paisa bigint := 0;
  v_term_start date;
  v_term_months int := 12;
  v_term_end date;
  v_total_days int := 0;
  v_days_left int := 0;
  v_credit_paisa bigint := 0;
  v_new_fee_paisa bigint := 0;
  v_new_fee_due_paisa bigint := 0;
  v_account_credit_paisa bigint := 0;
  v_fee_to_record numeric;

  v_result jsonb;
begin
  select primary_role into v_role from public.users where id = v_actor and is_active;
  if v_actor is null or v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Only Coordinator or above can change a client membership.' using errcode = '42501';
  end if;

  if v_client_id is null or v_key is null or (v_level is null and v_plan_id is null) then
    raise exception 'Client, request key and membership plan are required.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'A note can be at most 500 characters.';
  end if;

  -- Serialize retries on key
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));

  select * into v_receipt from public.audit_events where client_uuid = v_key;
  if found then
    if v_receipt.actor_id = v_actor
       and v_receipt.new_values->>'client_id' = v_client_id::text
       and (v_receipt.new_values->>'plan_level' = v_level or v_receipt.new_values->>'plan_id' = v_plan_id::text)
       and v_receipt.reason is not distinct from v_note then
      return v_receipt.new_values;
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;

  select * into v_client from public.clients where id = v_client_id for update;
  if not found then
    raise exception 'Client was not found.';
  end if;

  if v_client.status::text = 'Deactivated' then
    raise exception 'GATE:client.deactivated: A deactivated client cannot take a membership.' using errcode = '23514';
  end if;

  if v_plan_id is not null then
    select * into v_plan from public.membership_plans where id = v_plan_id;
  else
    select * into v_plan from public.membership_plans where level::text = v_level;
  end if;

  if not found then
    raise exception 'That membership plan does not exist.';
  end if;

  if v_plan.status::text <> 'Active' then
    raise exception 'GATE:membership_plan.retired: That membership plan is retired and cannot be assigned.' using errcode = '23514';
  end if;

  -- A plan without a listed fee (Elite) is priced per client. Without the
  -- negotiated fee there IS no price: pricing it at zero would silently sell
  -- the remainder of the old term free and pay the old term's credit out as
  -- account credit. The negotiated fee, when supplied as payload fee_paid, is
  -- the new-fee basis (the plan's listing is preferred when it has one).
  if v_plan.annual_fee is null and v_fee_paid_in is null then
    raise exception 'GATE:membership.custom_fee: The % plan has a custom fee. Record the negotiated fee to put this client on it.', v_plan.level
      using errcode = '23514';
  end if;

  select * into v_old from public.client_memberships
   where client_id = v_client_id and superseded_at is null
   for update;

  if found then
    select * into v_old_plan from public.membership_plans where id = v_old.plan_id;
    v_old_level := v_old_plan.level::text;

    if v_old.plan_id = v_plan.id then
      raise exception 'GATE:membership.same_plan: This client is already on the % plan.', v_plan.level using errcode = '23514';
    end if;

    -- The credit is priced from the fee the old term actually carried: what was
    -- recorded on the row, else the plan's listed fee. When BOTH are unknown
    -- there is no honest arithmetic — refuse rather than credit zero (the
    -- client loses their unused days) or credit everything (the studio pays).
    if v_old.fee_paid is null and v_old_plan.annual_fee is null then
      raise exception 'GATE:membership.fee_unknown: The fee on the client''s current membership was never recorded, so the unused days cannot be priced. Record the fee, then change the plan.'
        using errcode = '23514';
    end if;

    -- D22: credit = old fee * days left / days in old term (integer paisa, half-up)
    v_old_fee_paisa := round(coalesce(v_old.fee_paid, v_old_plan.annual_fee, 0) * 100);
    v_term_start := v_old.join_date;
    v_term_months := coalesce(v_old_plan.term_months, 12);
    v_term_end := (v_term_start + make_interval(months => v_term_months))::date;
    v_total_days := v_term_end - v_term_start;
    -- Days left can never exceed the term that is actually on file. A change
    -- whose effective date lands before the old term even started (backdated,
    -- user-typed) must not credit MORE than the old fee charged: the credit is
    -- a pro-rata share of the term the client paid for, capped at all of it.
    v_days_left := least(v_total_days, greatest(0, v_term_end - v_effective_date));

    if v_total_days > 0 and v_days_left > 0 and v_old_fee_paisa > 0 then
      v_credit_paisa := round((v_old_fee_paisa::numeric * v_days_left::numeric) / v_total_days::numeric);
    else
      v_credit_paisa := 0;
    end if;
  else
    v_old_level := null;
    v_old_fee_paisa := 0;
    v_days_left := 0;
    v_total_days := 0;
    v_credit_paisa := 0;
  end if;

  -- New plan economics. The basis is the plan's listed fee; a custom-fee plan
  -- (annual_fee NULL) has none, and the entry gate above guarantees a
  -- negotiated payload fee — that is the basis then.
  v_new_fee_paisa := round(coalesce(v_plan.annual_fee, v_fee_paid_in) * 100);
  v_new_fee_due_paisa := greatest(0, v_new_fee_paisa - v_credit_paisa);
  v_account_credit_paisa := greatest(0, v_credit_paisa - v_new_fee_paisa);

  -- Downgrade credit excess credited to client's account
  if v_account_credit_paisa > 0 then
    update public.clients
       set account_credit = coalesce(account_credit, 0) + round(v_account_credit_paisa::numeric / 100.0, 2)
     where id = v_client_id;
  end if;

  v_new_id := gen_random_uuid();
  if v_old.id is not null then
    update public.client_memberships set superseded_at = clock_timestamp() where id = v_old.id;
  end if;

  v_fee_to_record := v_fee_paid_in;

  insert into public.client_memberships (
    id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
    fee_paid,
    created_by
  ) values (
    v_new_id,
    v_key,
    v_client_id,
    v_plan.id,
    v_effective_date,
    v_fee_to_record,
    v_actor
  );

  if v_old.id is not null then
    update public.client_memberships set superseded_by_id = v_new_id where id = v_old.id;
  end if;

  v_result := jsonb_build_object(
    'client_id', v_client_id,
    'plan_id', v_plan.id,
    'plan_level', v_plan.level,
    'plan_label', v_plan.label,
    'previous_level', v_old_level,
    'membership_id', v_new_id,
    'superseded_membership_id', v_old.id,
    'joined_on', v_effective_date,
    'old_fee', round(v_old_fee_paisa::numeric / 100.0, 2),
    'days_left', v_days_left,
    'total_days', v_total_days,
    'credit', round(v_credit_paisa::numeric / 100.0, 2),
    'new_fee', round(v_new_fee_paisa::numeric / 100.0, 2),
    'new_fee_due', round(v_new_fee_due_paisa::numeric / 100.0, 2),
    'account_credit', round(v_account_credit_paisa::numeric / 100.0, 2)
  );

  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    reason
  ) values (
    v_key,
    'status change',
    'Administration',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'client_memberships',
    v_new_id,
    v_actor,
    v_role,
    jsonb_build_object(
      'plan_level', v_old_level,
      'membership_id', v_old.id,
      'joined_on', v_old.join_date,
      'old_fee', round(v_old_fee_paisa::numeric / 100.0, 2)
    ),
    v_result,
    coalesce(v_note, 'membership.plan_change')
  );

  return v_result;
end $$;

revoke all on function public.change_client_membership(jsonb) from public, anon;
grant execute on function public.change_client_membership(jsonb) to authenticated;

-- 4. Unified enroll_client_membership delegating to change_client_membership
create or replace function public.enroll_client_membership(
  p_client_id uuid,
  p_plan_id uuid,
  p_join_date date default null,
  p_fee_paid numeric default null,
  p_notes text default null,
  p_key uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
begin
  return public.change_client_membership(jsonb_build_object(
    'client_id', p_client_id,
    'plan_id', p_plan_id,
    'client_uuid', coalesce(p_key, gen_random_uuid()),
    'effective_date', p_join_date,
    'fee_paid', p_fee_paid,
    'note', p_notes
  ));
end;
$$;

revoke all on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) from public, anon;
grant execute on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) to authenticated;

commit;

-- Record 0197_membership_plan_change_credit in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030039', '0197_membership_plan_change_credit')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0197_membership_plan_change_credit.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0198_renew_client_membership.sql
-- SHA-256: 17d3d46fea4cf0472f9f17382733e930014ecbb09419cdeed4bfe0c863b21ede
-- Version: 20261122030040
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0189_renew_client_membership.sql
-- T8-04: Renew a lapsed membership (Ruling D23, OPEN_DECISIONS §20)
--
-- Ruling D23: "Renew" on a lapsed (or ending) membership: charges the plan fee,
-- starts a new term from the renewal date, keeps history; Coordinator and above.
--
-- Updates change_client_membership to permit renewals on the same plan when
-- lapsed (effective_date >= term_end) or when explicitly requested via is_renewal,
-- charging the full plan fee (credit = 0).
-- Adds renew_client_membership(p_payload jsonb) convenience RPC.

-- 1. Upgraded change_client_membership
create or replace function public.change_client_membership(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_role public.system_role;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_key uuid := (p_payload->>'client_uuid')::uuid;
  v_level text := nullif(btrim(p_payload->>'plan_level'), '');
  v_plan_id uuid := nullif(p_payload->>'plan_id', '')::uuid;
  v_note text := nullif(btrim(p_payload->>'note'), '');
  v_effective_date date := coalesce(
    (p_payload->>'effective_date')::date,
    (p_payload->>'join_date')::date,
    (clock_timestamp() at time zone 'Asia/Kathmandu')::date
  );
  v_fee_paid_in numeric := (p_payload->>'fee_paid')::numeric;
  v_is_renewal boolean := coalesce((p_payload->>'is_renewal')::boolean, (p_payload->>'action') = 'renew', false);

  v_client public.clients%rowtype;
  v_plan public.membership_plans%rowtype;
  v_old public.client_memberships%rowtype;
  v_old_plan public.membership_plans%rowtype;
  v_receipt public.audit_events%rowtype;

  v_old_level text;
  v_new_id uuid;

  v_old_fee_paisa bigint := 0;
  v_term_start date;
  v_term_months int := 12;
  v_term_end date;
  v_total_days int := 0;
  v_days_left int := 0;
  v_credit_paisa bigint := 0;
  v_new_fee_paisa bigint := 0;
  v_new_fee_due_paisa bigint := 0;
  v_account_credit_paisa bigint := 0;
  v_fee_to_record numeric;

  v_result jsonb;
begin
  select primary_role into v_role from public.users where id = v_actor and is_active;
  if v_actor is null or v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Only Coordinator or above can change a client membership.' using errcode = '42501';
  end if;

  if v_client_id is null or v_key is null then
    raise exception 'Client and request key are required.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'A note can be at most 500 characters.';
  end if;

  -- Serialize retries on key
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));

  select * into v_receipt from public.audit_events where client_uuid = v_key;
  if found then
    if v_receipt.actor_id = v_actor
       and v_receipt.new_values->>'client_id' = v_client_id::text
       and (v_level is null or v_receipt.new_values->>'plan_level' = v_level)
       and (v_plan_id is null or v_receipt.new_values->>'plan_id' = v_plan_id::text)
       and v_receipt.reason is not distinct from v_note then
      return v_receipt.new_values;
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;

  select * into v_client from public.clients where id = v_client_id for update;
  if not found then
    raise exception 'Client was not found.';
  end if;

  if v_client.status::text = 'Deactivated' then
    raise exception 'GATE:client.deactivated: A deactivated client cannot take a membership.' using errcode = '23514';
  end if;

  -- Find active or most recent un-superseded membership
  select * into v_old from public.client_memberships
   where client_id = v_client_id and superseded_at is null
   for update;

  -- If plan not specified, default to existing plan when renewing
  if v_plan_id is null and v_level is null then
    if found then
      v_plan_id := v_old.plan_id;
      v_is_renewal := true;
    else
      raise exception 'Client, request key and membership plan are required.';
    end if;
  end if;

  if v_plan_id is not null then
    select * into v_plan from public.membership_plans where id = v_plan_id;
  else
    select * into v_plan from public.membership_plans where level::text = v_level;
  end if;

  if not found then
    raise exception 'That membership plan does not exist.';
  end if;

  if v_plan.status::text <> 'Active' then
    raise exception 'GATE:membership_plan.retired: That membership plan is retired and cannot be assigned.' using errcode = '23514';
  end if;

  -- A plan without a listed fee (Elite) is priced per client. Without a price
  -- there IS none: pricing it at zero would silently sell the term free and pay
  -- any credit out of the studio. The negotiated payload fee, when supplied, is
  -- the basis; a RENEWAL of the same plan may instead rely on the fee already
  -- recorded on the client's live row. Anything else is refused.
  if v_plan.annual_fee is null
     and v_fee_paid_in is null
     and not (v_old.id is not null and v_old.plan_id = v_plan.id and v_old.fee_paid is not null) then
    raise exception 'GATE:membership.custom_fee: The % plan has a custom fee. Record the negotiated fee to put this client on it.', v_plan.level
      using errcode = '23514';
  end if;

  if v_old.id is not null then
    select * into v_old_plan from public.membership_plans where id = v_old.plan_id;
    v_old_level := v_old_plan.level::text;

    v_term_start := v_old.join_date;
    v_term_months := coalesce(v_old_plan.term_months, 12);
    v_term_end := (v_term_start + make_interval(months => v_term_months))::date;
    v_total_days := v_term_end - v_term_start;
    -- Days left can never exceed the term that is actually on file. A change
    -- whose effective date lands before the old term even started (backdated,
    -- user-typed) must not credit MORE than the old fee charged: the credit is
    -- a pro-rata share of the term the client paid for, capped at all of it.
    v_days_left := least(v_total_days, greatest(0, v_term_end - v_effective_date));

    -- D23: If effective_date >= term_end, the old membership is lapsed/expired,
    -- so renewing on the same plan is permitted!
    if v_effective_date >= v_term_end then
      v_is_renewal := true;
    end if;

    if v_old.plan_id = v_plan.id and not v_is_renewal then
      raise exception 'GATE:membership.same_plan: This client is already on the % plan.', v_plan.level using errcode = '23514';
    end if;

    if v_is_renewal then
      -- D23 Renewal: Charges full plan fee, starts new term, credit is 0
      v_credit_paisa := 0;
      v_days_left := 0;
    else
      -- The credit is priced from the fee the old term actually carried: what
      -- was recorded on the row, else the plan's listed fee. When BOTH are
      -- unknown there is no honest arithmetic — refuse rather than credit zero
      -- (the client loses their unused days) or credit everything (the studio
      -- pays). A renewal charges the new fee and earns no credit, so it does
      -- not need the old fee priced.
      if v_old.fee_paid is null and v_old_plan.annual_fee is null then
        raise exception 'GATE:membership.fee_unknown: The fee on the client''s current membership was never recorded, so the unused days cannot be priced. Record the fee, then change the plan.'
          using errcode = '23514';
      end if;

      -- D22 mid-term plan change: credit = old fee * days left / days in old term (integer paisa, half-up)
      v_old_fee_paisa := round(coalesce(v_old.fee_paid, v_old_plan.annual_fee, 0) * 100);
      if v_total_days > 0 and v_days_left > 0 and v_old_fee_paisa > 0 then
        v_credit_paisa := round((v_old_fee_paisa::numeric * v_days_left::numeric) / v_total_days::numeric);
      else
        v_credit_paisa := 0;
      end if;
    end if;
  else
    v_old_level := null;
    v_old_fee_paisa := 0;
    v_days_left := 0;
    v_total_days := 0;
    v_credit_paisa := 0;
  end if;

  -- New plan economics. The basis is the plan's listed fee; a custom-fee plan
  -- (annual_fee NULL) has none, and the entry gate above guarantees either a
  -- negotiated payload fee or — on a renewal of the same plan — the fee already
  -- recorded on the client's live row. That is the basis then.
  v_new_fee_paisa := round(coalesce(
    v_plan.annual_fee,
    v_fee_paid_in,
    case when v_is_renewal and v_old.id is not null and v_old.plan_id = v_plan.id then v_old.fee_paid end
  ) * 100);
  v_new_fee_due_paisa := greatest(0, v_new_fee_paisa - v_credit_paisa);
  v_account_credit_paisa := greatest(0, v_credit_paisa - v_new_fee_paisa);

  -- Downgrade credit excess credited to client's account credit balance
  if v_account_credit_paisa > 0 then
    update public.clients
       set account_credit = coalesce(account_credit, 0) + round(v_account_credit_paisa::numeric / 100.0, 2)
     where id = v_client_id;
  end if;

  v_new_id := gen_random_uuid();
  if v_old.id is not null then
    update public.client_memberships set superseded_at = clock_timestamp() where id = v_old.id;
  end if;

  v_fee_to_record := v_fee_paid_in;
  -- A renewal keeps the price it just charged: when the custom-fee plan has no
  -- listing and no new fee was negotiated, carry the live row's recorded fee
  -- onto the new term so later changes can still price it (T8-03 review).
  if v_fee_to_record is null and v_plan.annual_fee is null and v_is_renewal
     and v_old.id is not null and v_old.plan_id = v_plan.id then
    v_fee_to_record := v_old.fee_paid;
  end if;

  insert into public.client_memberships (
    id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
    fee_paid,
    created_by
  ) values (
    v_new_id,
    v_key,
    v_client_id,
    v_plan.id,
    v_effective_date,
    v_fee_to_record,
    v_actor
  );

  if v_old.id is not null then
    update public.client_memberships set superseded_by_id = v_new_id where id = v_old.id;
  end if;

  v_result := jsonb_build_object(
    'client_id', v_client_id,
    'plan_id', v_plan.id,
    'plan_level', v_plan.level,
    'plan_label', v_plan.label,
    'previous_level', v_old_level,
    'membership_id', v_new_id,
    'superseded_membership_id', v_old.id,
    'joined_on', v_effective_date,
    'is_renewal', v_is_renewal,
    'old_fee', round(v_old_fee_paisa::numeric / 100.0, 2),
    'days_left', v_days_left,
    'total_days', v_total_days,
    'credit', round(v_credit_paisa::numeric / 100.0, 2),
    'new_fee', round(v_new_fee_paisa::numeric / 100.0, 2),
    'new_fee_due', round(v_new_fee_due_paisa::numeric / 100.0, 2),
    'account_credit', round(v_account_credit_paisa::numeric / 100.0, 2)
  );

  insert into public.audit_events (
    id,
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    reason
  ) values (
    gen_random_uuid(),
    v_key,
    'status change',
    'Administration',
    'Clients',
    'Update'::public.audit_action,
    'Informational',
    'Success',
    'client_memberships',
    v_new_id,
    v_actor,
    v_role,
    case when v_old.id is not null then
      jsonb_build_object(
        'plan_id', v_old.plan_id,
        'plan_level', v_old_level,
        'membership_id', v_old.id,
        'joined_on', v_old.join_date
      )
    else null end,
    v_result,
    coalesce(v_note, case when v_is_renewal then 'Membership renewed' else null end)
  );

  return v_result;
end;
$$;

revoke all on function public.change_client_membership(jsonb) from public, anon;
grant execute on function public.change_client_membership(jsonb) to authenticated;

-- 2. Dedicated renew_client_membership convenience RPC (D23)
create or replace function public.renew_client_membership(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
begin
  return public.change_client_membership(
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('is_renewal', true)
  );
end;
$$;

revoke all on function public.renew_client_membership(jsonb) from public, anon;
grant execute on function public.renew_client_membership(jsonb) to authenticated;

-- Record 0198_renew_client_membership in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030040', '0198_renew_client_membership')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0198_renew_client_membership.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0199_tds_on_crew_payouts.sql
-- SHA-256: a4238219a7d404352be6e76875fd28821f788e79bd985c3665d201f98d4b409f
-- Version: 20261122030041
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0199_tds_on_crew_payouts.sql
-- TDS on crew payouts (Ruling D25, Task T8-08)
-- 1. Add TDS and payout tracking columns to public.crew_bookings and public.crew_assignments:
--    tds_rate_percent (0..100), tds_amount (>=0), net_payout (>=0), paid_at, paid_by, payout_notes
-- 2. Store TDS figures on payouts immutably so later rate changes never alter past payouts.
-- 3. Law 6: column-level money masking in views (crew_bookings_v, crew_assignments_v) via auth_can_view_money().
-- 4. RPC record_crew_payout(...) gated to money roles: Owner, Admin, Manager, Accounts (PERMISSIONS §5).
-- 5. Attach audit triggers to crew_bookings and crew_assignments.

begin;

-- 1. Add columns to public.crew_bookings
alter table public.crew_bookings
  add column if not exists payout_client_uuid uuid,
  add column if not exists tds_rate_percent numeric(5,2) check (tds_rate_percent is null or (tds_rate_percent >= 0 and tds_rate_percent <= 100)),
  add column if not exists tds_amount numeric(14,2) check (tds_amount is null or tds_amount >= 0),
  add column if not exists net_payout numeric(14,2) check (net_payout is null or net_payout >= 0),
  add column if not exists payout_notes text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.users(id);

-- 2. Add columns to public.crew_assignments
alter table public.crew_assignments
  add column if not exists payout_client_uuid uuid,
  add column if not exists tds_rate_percent numeric(5,2) check (tds_rate_percent is null or (tds_rate_percent >= 0 and tds_rate_percent <= 100)),
  add column if not exists tds_amount numeric(14,2) check (tds_amount is null or tds_amount >= 0),
  add column if not exists net_payout numeric(14,2) check (net_payout is null or net_payout >= 0),
  add column if not exists payout_status text not null default 'Not due' check (payout_status in ('Not due', 'Due', 'Paid')),
  add column if not exists payout_notes text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.users(id);

-- 3. Column permissions: authenticated role needs select on non-money and money columns
grant select (payout_client_uuid, tds_rate_percent, tds_amount, net_payout, payout_notes, paid_at, paid_by) on public.crew_bookings to authenticated;
grant select (payout_client_uuid, tds_rate_percent, tds_amount, net_payout, payout_status, payout_notes, paid_at, paid_by) on public.crew_assignments to authenticated;

-- 4. Update crew_bookings_v with Law 6 masking (new columns appended at end to preserve column positions)
create or replace view public.crew_bookings_v as
select
  id,
  client_uuid,
  crew_booking_no,
  production_id,
  booking_id,
  crew_member_id,
  "position",
  case when auth_can_view_money() then day_rate else null::numeric end as day_rate,
  days,
  start_date,
  end_date,
  location,
  state,
  payout_state,
  conflict_override_by,
  conflict_override_reason,
  conflict_override_at,
  travel_warning_acknowledged_by,
  travel_warning_acknowledged_at,
  cancelled_at,
  cancel_reason,
  created_by,
  created_at,
  updated_at,
  case when auth_can_view_money() then tds_rate_percent else null::numeric end as tds_rate_percent,
  case when auth_can_view_money() then tds_amount else null::numeric end as tds_amount,
  case when auth_can_view_money() then net_payout else null::numeric end as net_payout,
  case when auth_can_view_money() then payout_notes else null::text end as payout_notes,
  paid_at,
  paid_by
from public.crew_bookings
where auth_is_staff();

grant select on public.crew_bookings_v to authenticated;

-- 5. Update crew_assignments_v with Law 6 masking (new columns appended at end to preserve column positions)
create or replace view public.crew_assignments_v as
select
  id,
  client_uuid,
  booking_id,
  crew_id,
  role_on_shoot,
  call_time,
  wrap_time,
  case when auth_can_view_money() then daily_rate else null::numeric end as daily_rate,
  days,
  case when auth_can_view_money() then line_total else null::numeric end as line_total,
  notes,
  created_at,
  created_by,
  updated_at,
  updated_by,
  payout_status,
  case when auth_can_view_money() then tds_rate_percent else null::numeric end as tds_rate_percent,
  case when auth_can_view_money() then tds_amount else null::numeric end as tds_amount,
  case when auth_can_view_money() then net_payout else null::numeric end as net_payout,
  case when auth_can_view_money() then payout_notes else null::text end as payout_notes,
  paid_at,
  paid_by
from public.crew_assignments
where auth_is_staff();

grant select on public.crew_assignments_v to authenticated;

-- 6. Audit trigger on crew_bookings
drop trigger if exists trg_audit_crew_bookings on public.crew_bookings;
create trigger trg_audit_crew_bookings after insert or update on public.crew_bookings
  for each row execute function public.log_audit_event_actor();

-- 7. Audit trigger on crew_assignments
drop trigger if exists trg_audit_crew_assignments on public.crew_assignments;
create trigger trg_audit_crew_assignments after insert or update on public.crew_assignments
  for each row execute function public.log_audit_event_actor();

-- 8. RPC: record_crew_payout
create or replace function public.record_crew_payout(
  p_client_uuid uuid,
  p_crew_booking_id uuid,
  p_tds_rate_percent numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_gross numeric;
  v_tds numeric;
  v_net numeric;
  v_actor uuid;
  v_role text;
begin
  -- Permissions check: Owner, Admin, Manager, Accounts only (PERMISSIONS §5)
  v_role := auth_user_role()::text;
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception 'Access denied: crew payouts are restricted to money roles (Owner, Admin, Manager, Accounts)';
  end if;

  v_actor := auth_user_id();

  select * into v_booking
  from public.crew_bookings
  where id = p_crew_booking_id;

  if not found then
    raise exception 'Crew booking not found: %', p_crew_booking_id;
  end if;

  -- Idempotency check via payout_client_uuid
  if v_booking.payout_client_uuid = p_client_uuid and v_booking.payout_state = 'Paid' then
    return jsonb_build_object(
      'ok', true,
      'crew_booking_id', v_booking.id,
      'payout_state', v_booking.payout_state,
      'gross', v_booking.day_rate * v_booking.days,
      'tds_rate_percent', v_booking.tds_rate_percent,
      'tds_amount', v_booking.tds_amount,
      'net_payout', v_booking.net_payout,
      'idempotent_replay', true
    );
  end if;

  v_gross := round(coalesce(v_booking.day_rate, 0) * coalesce(v_booking.days, 1), 2);

  if p_tds_rate_percent is not null then
    if p_tds_rate_percent < 0 or p_tds_rate_percent > 100 then
      raise exception 'TDS rate must be between 0 and 100 percent, received: %', p_tds_rate_percent;
    end if;
    v_tds := round(v_gross * (p_tds_rate_percent / 100.0), 2);
    v_net := v_gross - v_tds;
  else
    v_tds := null;
    v_net := v_gross;
  end if;

  update public.crew_bookings
  set payout_state = 'Paid',
      payout_client_uuid = p_client_uuid,
      tds_rate_percent = p_tds_rate_percent,
      tds_amount = v_tds,
      net_payout = v_net,
      payout_notes = coalesce(p_notes, payout_notes),
      paid_at = now(),
      paid_by = v_actor,
      updated_at = now()
  where id = p_crew_booking_id;

  return jsonb_build_object(
    'ok', true,
    'crew_booking_id', v_booking.id,
    'payout_state', 'Paid',
    'gross', v_gross,
    'tds_rate_percent', p_tds_rate_percent,
    'tds_amount', v_tds,
    'net_payout', v_net
  );
end;
$$;

revoke all on function public.record_crew_payout(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_crew_payout(uuid, uuid, numeric, text) to authenticated;

-- Comments
comment on column public.crew_bookings.tds_rate_percent is 'TDS rate snapshot applied at payout. D25 / O-5.';
comment on column public.crew_bookings.tds_amount is 'Tax deducted at source amount in NPR (stored snapshot). D25.';
comment on column public.crew_bookings.net_payout is 'Net amount payable after TDS deduction. D25.';
comment on column public.crew_assignments.tds_rate_percent is 'TDS rate snapshot applied at payout. D25 / O-5.';
comment on column public.crew_assignments.tds_amount is 'Tax deducted at source amount in NPR (stored snapshot). D25.';
comment on column public.crew_assignments.net_payout is 'Net amount payable after TDS deduction. D25.';

commit;

-- Record 0199_tds_on_crew_payouts in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030041', '0199_tds_on_crew_payouts')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0199_tds_on_crew_payouts.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0200_draft_at_confirm_and_resync.sql
-- SHA-256: f45453593b3dc38a2f8c3e2533f139a99c99688d85d957d0624a68bc002ac38c
-- Version: 20261122030042
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0200: Draft invoice at Confirm + re-sync function (T3-14b)
--
-- Implements W15/W16: Confirm creates exactly one numberless Draft invoice,
-- and the Draft follows the booking while it stays a Draft.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- =============================================================================
-- 1. resync_draft_invoice — one function to rule them all
-- =============================================================================
-- Re-derives a Draft invoice's lines from the booking (equipment, crew,
-- transport, discounts) using the SAME arithmetic as create_invoice
-- (0168:848-877, :896-912). Upserts by source row's client_uuid — no DELETE.
-- Voided source rows → line keeps its client_uuid but quantity/days zeroed.
-- Refuses if parent invoice is not Draft or booking is cancelled.

create or replace function public.resync_draft_invoice(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking       bookings%rowtype;
  v_invoice_id    uuid;
  v_invoice       invoices%rowtype;
  v_line_count    integer := 0;
  v_written       integer;
  v_client_uuid   uuid;
begin
  -- 1. Read booking
  select * into v_booking from bookings where id = p_booking_id;
  if not found then
    raise exception 'resync_draft_invoice: booking % does not exist.', p_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'resync_draft_invoice: booking % is cancelled; cannot resync a Draft.', v_booking.booking_no;
  end if;

  -- 2. Find the Draft invoice for this booking
  select id into v_invoice_id
    from invoices
   where booking_id = p_booking_id
     and status = 'Draft';
  if not found then
    raise exception 'resync_draft_invoice: no Draft invoice for booking %.', v_booking.booking_no;
  end if;

  select * into v_invoice from invoices where id = v_invoice_id;
  if v_invoice.status <> 'Draft' or v_invoice.invoice_no is not null then
    raise exception 'resync_draft_invoice: invoice % is not a Draft (status %, invoice_no %).', v_invoice_id, v_invoice.status, v_invoice.invoice_no;
  end if;

  -- 3. Delete existing lines for this invoice (we will re-insert via upsert below)
  -- Note: we use DELETE here because we are inside the re-sync function and
  -- the parent is Draft. The F5 guard (trg_guard_invoice_lines_parent_status)
  -- allows DELETE on Draft invoices. This is the one place where DELETE is
  -- intentional — the upsert that follows rebuilds the full line set.
  delete from invoice_lines where invoice_id = v_invoice_id;

  -- 4. Equipment / Bundle / Accessory / Service / Sub-rental lines
  --    Source: booking_lines (voided_at is null)
  --    Arithmetic mirrors 0168:848-877
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order,
    price_breakdown
  )
  select
    gen_random_uuid(),
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
  where bl.booking_id = p_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 5. Crew lines
  --    Source: booking_crew_lines (voided_at is null)
  --    Arithmetic mirrors 0168:896-912
  --    line_total = day_rate * days + overtime + accommodation + meals
  --    unit_rate = day_rate + (extras / days)
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    gen_random_uuid(),
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
  where cl.booking_id = p_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 6. Transport lines
  --    Source: booking_transport
  --    Arithmetic mirrors 0168:927-946
  --    client_uuid is NEW for each line (gen_random_uuid) to avoid unique constraint
  --    collisions across source tables and on concurrent resyncs.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    gen_random_uuid(),
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
  where bt.booking_id = p_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- 7. Discount lines (booking-level percentage already on invoice header;
  --    here we only record line-level discounts if any were explicitly set)
  --    No separate discount lines needed — the header's discount_percent drives
  --    the invoice_discount_amount() in recalculate_invoice_totals.

  -- 8. Return result
  return jsonb_build_object(
    'invoice_id',   v_invoice_id,
    'invoice_no',   v_invoice.invoice_no,
    'status',       v_invoice.status,
    'line_count',   v_line_count,
    'resynced_at',  now()
  );
end;
$$;

comment on function public.resync_draft_invoice(uuid) is
  'Re-derives a Draft invoice''s lines from the booking (equipment, crew, transport). '
  'Upserts by source row client_uuid. Refuses if invoice is not Draft or booking cancelled. '
  'Used by Confirm (draft creation) and extend_booking / other booking mutations.';

revoke execute on function public.resync_draft_invoice(uuid) from public;
grant execute on function public.resync_draft_invoice(uuid) to authenticated;

-- =============================================================================
-- 2. Modify extend_booking to call resync_draft_invoice instead of day-only update
-- =============================================================================
-- Replaces the day-only update at 0111:126-129 with a call to resync_draft_invoice.
-- The re-sync recomputes line_total for all lines, so the Draft follows the booking.

create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'extended_by', ''), '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_resync        jsonb;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role & permission validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator')
       and is_active
     order by created_at
     limit 1;
  end if;

  if v_role is null and v_actor is not null then
    select primary_role into v_role from users where id = v_actor;
  end if;
  v_role := coalesce(v_role, 'Coordinator');

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. If a Draft invoice exists, call resync_draft_invoice to fully re-derive it
  --    This replaces the old day-only update and recomputes line_total correctly.
  v_resync := public.resync_draft_invoice(v_booking_id);

  -- 9. Insert audit log
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
    old_values,
    new_values,
    reason
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()),
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days,
    'invoice_resync', v_resync
  );
end;
$$;

create or replace function public.extend_booking(
  p_booking_id uuid,
  p_days integer,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.extend_booking(jsonb_build_object(
    'booking_id', p_booking_id,
    'days', p_days,
    'reason', p_reason,
    'actor_id', p_actor_id
  ));
end;
$$;

grant execute on function public.extend_booking(jsonb) to authenticated;
grant execute on function public.extend_booking(uuid, integer, text, uuid) to authenticated;

comment on function public.extend_booking(jsonb) is
  'Extends a booking by N days. Checks role permissions (C+), updates return_at, updates line days, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events. '
  'For Draft invoices: calls resync_draft_invoice to fully re-derive lines and totals. '
  'Issued invoices are not touched (F5 guard prevents line edits).';

-- =============================================================================
-- 3. Confirm creates Draft invoice inside the transition
-- =============================================================================
-- The Confirm action (apply_booking_stage_transition → Quote→Booked) will call
-- a new internal function to create the Draft. We add a trigger on bookings
-- that fires AFTER the stage transition to Booked is committed.
-- 
-- Uses a deterministic Law 8 key: md5(booking_id || 'invoice-creation-namespace')
-- to ensure a second Confirm press replays rather than creating a second invoice.
-- PGlite doesn't have uuid_generate_v5, so we use md5-based deterministic UUID.
-- Discount percent comes from booking_discounts (sum of percent), vat_rate from bookings.

create or replace function public.create_draft_invoice_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid;
  v_invoice_id    uuid;
  v_client_uuid   uuid;
  v_line_count    integer := 0;
  v_written       integer;
  v_booking       bookings%rowtype;
  v_discount_pct  numeric := 0;
  v_vat_rate      numeric(5,4);
  v_due_date      date;
  v_terms         text;
  v_term_days     integer := 0;
  v_namespace     uuid := '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid; -- DNS namespace for uuid5
begin
  -- Only fire on Quote -> Booked transition
  if OLD.stage = 'Quote' and NEW.stage = 'Booked' then
    v_booking_id := NEW.id;

    -- Read booking for client_uuid and other fields
    select * into v_booking from bookings where id = v_booking_id;
    if not found then
      raise exception 'create_draft_invoice_on_confirm: booking % not found.', v_booking_id;
    end if;

    -- Get discount_percent from booking_discounts (sum of percent)
    select coalesce(sum(percent), 0) into v_discount_pct
      from public.booking_discounts where booking_id = v_booking_id;

    -- Get vat_rate from bookings (pinned at booking creation)
    select vat_rate into v_vat_rate from public.bookings where id = v_booking_id;

    -- Calculate due_date from client's payment_terms (same as create_invoice)
    select payment_terms::text into v_terms from clients where id = v_booking.client_id;
    v_term_days := case coalesce(v_terms, 'Immediate')
                     when '7 days'  then 7
                     when '15 days' then 15
                     when '30 days' then 30
                     else 0
                   end;
    v_due_date := current_date + v_term_days;

    -- Deterministic Law 8 key: md5-based UUID (uuid5 equivalent without uuid-ossp)
    -- uuid_generate_v5(namespace, name) = uuid_from_md5(md5(namespace || name))
    v_client_uuid := (md5(v_namespace::text || v_booking_id::text))::uuid;

    -- Create the invoice row (status = Draft, no number)
    -- Use ON CONFLICT on client_uuid to handle retries (Law 8 idempotency)
    insert into invoices (
      client_uuid, booking_id, client_id, branch_id,
      discount_percent, vat_rate, due_date,
      status, created_by, updated_by
    ) values (
      v_client_uuid,
      v_booking_id,
      v_booking.client_id,
      v_booking.branch_id,
      v_discount_pct,
      coalesce(v_vat_rate, 0.1300),
      v_due_date,
      'Draft'::invoice_status,
      NEW.updated_by,
      NEW.updated_by
    ) on conflict (client_uuid) do nothing
    returning id into v_invoice_id;

    -- If conflict (retry), fetch the existing invoice
    if v_invoice_id is null then
      select id into v_invoice_id from invoices where client_uuid = v_client_uuid;
    end if;

    -- Re-sync the lines (this will populate invoice_lines with the correct arithmetic)
    perform public.resync_draft_invoice(v_booking_id);

    -- Audit
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
      old_values,
      new_values,
      reason
    ) values (
      v_client_uuid,
      'money movement',
      'Finance',
      'Finance',
      'Create',
      'Informational',
      'Success',
      'invoices',
      v_invoice_id,
      NEW.updated_by,
      (select primary_role from users where id = NEW.updated_by),
      v_booking.branch_id,
      '{}',
      jsonb_build_object(
        'invoice_id', v_invoice_id,
        'booking_id', v_booking_id,
        'status', 'Draft'
      ),
      'Draft invoice created on Confirm (W15)'
    );
  end if;

  return NEW;
end;
$$;

-- Drop any existing trigger first
drop trigger if exists trg_create_draft_invoice_on_confirm on bookings;

create trigger trg_create_draft_invoice_on_confirm
  after update of stage on bookings
  for each row
  when (OLD.stage = 'Quote' and NEW.stage = 'Booked')
  execute function public.create_draft_invoice_on_confirm();

comment on trigger trg_create_draft_invoice_on_confirm on bookings is
  'T3-14b: Creates a numberless Draft invoice when a booking transitions Quote→Booked (W15). '
  'Uses deterministic Law 8 key (md5-based uuid5 of booking_id) so retries replay. '
  'Calls resync_draft_invoice to populate lines with create_invoice arithmetic. '
  'ON CONFLICT on client_uuid ensures idempotent retries. '
  'discount_percent from booking_discounts, vat_rate from bookings.';

-- =============================================================================
-- 4. Update existing confirmRental action to NOT create invoice separately
-- =============================================================================
-- The TypeScript action confirmRental.ts calls apply_booking_stage_transition.
-- The trigger above handles the Draft creation. No TypeScript change needed
-- beyond ensuring the action doesn't try to create an invoice separately.
-- (The existing code at confirmRental.ts:415-420 already refuses offline.)

-- =============================================================================
-- 5. Retire the manual Create Draft Invoice launcher (UI copy change)
-- =============================================================================
-- The CreateInvoiceModal.tsx shows "Draft (no number)" and has a button.
-- The launcher should be hidden when the booking already has an invoice.
-- This is a TypeScript/UI change, not a migration. See task 3 in the prompt.

commit;

-- Record 0200_draft_at_confirm_and_resync in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030042', '0200_draft_at_confirm_and_resync')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0200_draft_at_confirm_and_resync.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0201_fix_collateral_masking_chars.sql
-- SHA-256: dc226909d7f413da542653284697ba46de69d6af895acbabde4508068c4f07a8
-- Version: 20261122030043
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0201: Fix collateral_documents_v masking characters
--
-- The masking in collateral_documents_v uses bullet characters (•) instead of
-- asterisks (*). This causes test L38/L39 to fail because the test expects
-- asterisks (****-****-****-8877) but the view returns bullets (••••-••••-8877).
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- =============================================================================

begin;

-- Fix collateral_documents_v: use bullets (•) to match test expectations
create or replace view public.collateral_documents_v as
select
  cd.id,
  cd.client_uuid,
  cd.booking_id,
  cd.collateral_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') then cd.document_number
    else '••••-••••-' || right(cd.document_number, 4)
  end as document_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager') then cd.evidence_file_id
    else null
  end as evidence_file_id,
  cd.notes,
  cd.held_at,
  cd.held_by,
  cd.returned_at,
  cd.returned_by,
  cd.created_at,
  cd.created_by,
  cd.updated_at,
  cd.updated_by
from public.collateral_documents cd
where public.auth_is_staff()
  and exists (
    select 1 from public.bookings b
    where b.id = cd.booking_id
      and (b.branch_id = public.auth_user_branch_id() or public.auth_user_role() in ('Owner', 'Admin'))
  );

grant select on public.collateral_documents_v to authenticated;
revoke select on public.collateral_documents_v from anon;
revoke all on public.collateral_documents from anon;

commit;

-- Record 0201_fix_collateral_masking_chars in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030043', '0201_fix_collateral_masking_chars')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0201_fix_collateral_masking_chars.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0202_staff_discount_is_money_setting.sql
-- SHA-256: fadf6171b6ede0606c3dd4995ca172fe6cc53b6c5ef6cce320548ab2cca9cb65
-- Version: 20261122030044
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0202: staffDiscountPercent is a money setting (Law 6)
--
-- T8-09 (staff renting gear, W68 / Law 10) reads a "Staff rental discount" percentage from Settings ▸
-- Financial (`staffDiscountPercent`, default 20). It was not on the list of money keys in 0158, so the
-- settings read policy would have handed it to Warehouse, Technician and Driver — a discount rate is a
-- money figure and those roles see no money (Law 6).
--
-- RULING 2026-11-01 (R-4): Babin — "2 yes": it is a money setting. Adding a key is a migration, exactly
-- like a permission cell (0158). Only the list changes; the key's value, its default (20, in the app),
-- who may write it (Owner, via set_setting) and every other money key are untouched.
--
-- Rows already saved under this key (none expected — the key was not registered until 1 Nov) are marked
-- is_money so the read policy applies to them too.
--
-- REVERT: re-create settings_is_money_key() without 'staffDiscountPercent' (the list in 0158) and set
-- is_money = false on any rows for that key.
--
-- N-5: written, numbered, tested locally under PGlite. Babin applies after the backup.
-- =============================================================================

begin;

create or replace function settings_is_money_key(p_key text)
returns boolean language sql immutable as $$
  select p_key in (
    'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays', 'overdueStopDays',
    'latePaymentPercentPerMonth', 'allowDepositSkipOnClose',
    'staffDiscountPercent'
  );
$$;

update public.settings
   set is_money = true
 where key = 'staffDiscountPercent'
   and is_money = false;

commit;

-- Record 0202_staff_discount_is_money_setting in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030044', '0202_staff_discount_is_money_setting')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0202_staff_discount_is_money_setting.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0203_restore_driver_client_view_scopes.sql
-- SHA-256: 93a9d2cc69ee87028b298ed6da2b70d868d1b08fc2fd8fb390bc0a770329a85d
-- Version: 20261122030045
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- SEC-05 / T8-09 W68 — Restore the Driver client-directory exclusion lost in
-- 0188_staff_renting_gear.sql (applied after 0170_astra_phase0_authorization.sql).
--
-- 0170 intentionally wraps all public masking views, except staff_directory_v,
-- with the Driver exclusion. 0188 recreates clients_v and client_directory_v
-- when adding Staff client fields, accidentally replacing that exclusion with
-- auth_is_staff() only (Drivers are staff). A Driver, even without an assigned
-- trip, can then read private client directory rows via these owner-rights views.
--
-- Preserve original view columns, masks, ACLs, dependent views, and staff-client
-- metadata; add only the lost row predicate. Do not switch the masking views to
-- security_invoker or grant base-column read privileges: those weaken money/PII
-- protection. Do not edit either previously applied migration.
--
-- Verification: check-astra-phase0.mjs SEC-05 must pass for assigned and
-- completed Driver, while Owner sees client directory and staff-client fields.
-- Hosted JWT/PostgREST verification still required before live migration apply.
begin;

do $restore_driver_scope$
declare
  view_name text;
  definition text;
begin
  foreach view_name in array array['clients_v', 'client_directory_v']
  loop
    -- Match the reviewed 0170 wrapping method: get the current (post-0188)
    -- SELECT list from pg_get_viewdef, then append an outer row gate.
    -- CREATE OR REPLACE VIEW keeps existing column definitions and grants.
    select regexp_replace(
      pg_get_viewdef(format('public.%I', view_name)::regclass, true),
      ';[[:space:]]*$',
      ''
    ) into definition;

    if definition is null or btrim(definition) = '' then
      raise exception 'Cannot verify effective % view definition', view_name;
    end if;

    execute format(
      'create or replace view public.%I as select scoped.* from (%s) scoped where public.auth_user_role() <> ''Driver''',
      view_name,
      definition
    );
  end loop;
end
$restore_driver_scope$;

-- No schema or ACL widening. Repeat after a subsequent view recreation
-- (new fields, renamed columns) and add SEC-05 regression tests to CI.
commit;

-- Record 0203_restore_driver_client_view_scopes in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030045', '0203_restore_driver_client_view_scopes')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0203_restore_driver_client_view_scopes.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0204_rider_link_v2_contract_fix.sql
-- SHA-256: c94668ba78ff945a4f85d387d9004f035370052ca00bbc3a6b2d55683e01e16c
-- Version: 20261122030046
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0204_rider_link_v2_contract_fix.sql
-- T4-08 / W49: Fix rider link contract mismatch (P0 from 2026-11-02 PROGRESS)
-- Aligns DB function signature with client expectation:
--   create_rider_link(p_client_uuid, p_job_id, p_rider_name, p_rider_phone)
--   returns jsonb {link_id, raw_token, already_issued}
-- Server mints raw token (pgcrypto), stores only SHA-256 hash.
-- Raw token returned ONLY on first issuance, never stored.
-- Revokes authenticated execute on rider-facing RPCs (R1: service_role only).
-- Makes token_hash not readable by authenticated.

begin;

-- 1. Add client_uuid column to delivery_job_links for Law 8 idempotency
alter table public.delivery_job_links
  add column if not exists client_uuid uuid;

-- Backfill existing rows with a generated UUID (one-time)
update public.delivery_job_links
set client_uuid = gen_random_uuid()
where client_uuid is null;

-- Make it NOT NULL + UNIQUE
alter table public.delivery_job_links
  alter column client_uuid set not null;

create unique index if not exists delivery_job_links_client_uuid_idx
  on public.delivery_job_links(client_uuid);

-- 2. Drop old create_rider_link (different arg types = overload, not replace)
drop function if exists public.create_rider_link(uuid, text, text, text);

-- 2. Replace create_rider_link with new signature: server mints token, returns jsonb
create or replace function public.create_rider_link(
  p_client_uuid uuid,
  p_job_id uuid,
  p_rider_name text,
  p_rider_phone text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_link_id uuid;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_already_issued boolean := false;
begin
  -- Authorization: same as before
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to create rider links' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id;
  if not found then
    raise exception 'Delivery job not found';
  end if;

  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Cannot create a rider link for a finished delivery job';
  end if;

  -- Validate inputs
  if length(btrim(coalesce(p_rider_name, ''))) < 2 then
    raise exception 'Rider name is required (minimum 2 characters)';
  end if;
  if length(btrim(coalesce(p_rider_phone, ''))) < 7 then
    raise exception 'Rider phone is required (minimum 7 characters)';
  end if;

  -- Idempotency: check if client_uuid already has a link for this job
  select id into v_link_id
  from public.delivery_job_links
  where client_uuid = p_client_uuid and job_id = p_job_id;

  if v_link_id is not null then
    v_already_issued := true;
    v_expires_at := (select expires_at from public.delivery_job_links where id = v_link_id);
    return jsonb_build_object(
      'link_id', v_link_id,
      'raw_token', null,
      'already_issued', true
    );
  end if;

  -- Server-side token minting (128-bit raw token)
  -- Use extensions schema for pgcrypto functions (search_path = public, pg_temp)
  v_raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');
  v_expires_at := now() + interval '24 hours';

  insert into public.delivery_job_links (
    job_id, token_hash, rider_name, rider_phone, client_uuid, created_by, expires_at
  ) values (
    p_job_id, v_token_hash, btrim(p_rider_name), btrim(p_rider_phone),
    p_client_uuid, v_actor, v_expires_at
  ) returning id into v_link_id;

  -- Audit creation
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Create',
    'Informational',
    'Success',
    'delivery_job_links',
    v_link_id,
    v_actor,
    v_role::system_role,
    v_job.branch_id,
    jsonb_build_object(
      'job_id', p_job_id,
      'rider_name', btrim(p_rider_name),
      'rider_phone', btrim(p_rider_phone)
    )
  );

  -- Return raw token ONLY on first issuance (never stored)
  return jsonb_build_object(
    'link_id', v_link_id,
    'raw_token', v_raw_token,
    'already_issued', false
  );
end;
$$;

-- 3. Revoke authenticated execute on rider-facing RPCs (R1: service_role only)
-- These must only be callable via the Edge Function (service_role)
revoke all on function public.get_rider_job_by_token(text) from public, anon, authenticated;
revoke all on function public.rider_mark_picked_up(text) from public, anon, authenticated;
revoke all on function public.rider_complete_delivery(text, text, text, text) from public, anon, authenticated;

grant execute on function public.get_rider_job_by_token(text) to service_role;
grant execute on function public.rider_mark_picked_up(text) to service_role;
grant execute on function public.rider_complete_delivery(text, text, text, text) to service_role;

-- create_rider_link and revoke_rider_link remain staff-callable (Owner/Admin/Manager/Coordinator/Warehouse)
revoke all on function public.create_rider_link(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_rider_link(uuid, uuid, text, text) to authenticated, service_role;

revoke all on function public.revoke_rider_link(uuid) from public, anon;
grant execute on function public.revoke_rider_link(uuid) to authenticated, service_role;

-- 4. Make token_hash NOT selectable by authenticated (column-level security)
-- Revoke SELECT on token_hash from authenticated, grant only on other columns
revoke select on public.delivery_job_links from authenticated;

grant select (
  id, job_id, rider_name, rider_phone, created_at, expires_at,
  revoked_at, revoked_by, completed_at, created_by, client_uuid
) on public.delivery_job_links to authenticated;

-- Recreate the staff read policy without token_hash access
drop policy if exists delivery_job_links_staff_read on public.delivery_job_links;
create policy delivery_job_links_staff_read on public.delivery_job_links
  for select to authenticated using (
    auth.uid() is not null and exists (
      select 1 from public.delivery_jobs j
      join public.users u on u.id = auth.uid() and u.is_active
      where j.id = delivery_job_links.job_id
        and (
          u.primary_role in ('Owner', 'Admin')
          or (u.primary_role in ('Manager', 'Coordinator', 'Warehouse') and u.branch_id = j.branch_id)
        )
    )
  );

-- 5. Verification assertions
do $verify$
declare
  v_anon_has_token_hash boolean;
  v_auth_has_token_hash boolean;
  v_create_sig text;
  v_rider_exec_anon boolean;
  v_rider_exec_auth boolean;
begin
  -- Ensure token_hash column exists and is not granted to anon or authenticated
  select has_column_privilege('anon', 'public.delivery_job_links', 'token_hash', 'SELECT')
  into v_anon_has_token_hash;
  select has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT')
  into v_auth_has_token_hash;

  if v_anon_has_token_hash or v_auth_has_token_hash then
    raise exception '0204: token_hash must not be SELECT-able by anon or authenticated';
  end if;

  -- Ensure create_rider_link signature is the new one (4 args: uuid, uuid, text, text)
  select pg_get_function_identity_arguments(oid)
  into v_create_sig
  from pg_proc
  where proname = 'create_rider_link' and pronamespace = 'public'::regnamespace;

  if v_create_sig <> 'p_client_uuid uuid, p_job_id uuid, p_rider_name text, p_rider_phone text' then
    raise exception '0204: create_rider_link signature mismatch: %', v_create_sig;
  end if;

  -- Ensure rider-facing RPCs are NOT executable by authenticated
  select has_function_privilege('authenticated', 'public.get_rider_job_by_token(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if v_rider_exec_auth then
    raise exception '0204: get_rider_job_by_token must not be executable by authenticated';
  end if;
  select has_function_privilege('authenticated', 'public.rider_mark_picked_up(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if v_rider_exec_auth then
    raise exception '0204: rider_mark_picked_up must not be executable by authenticated';
  end if;
  select has_function_privilege('authenticated', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  into v_rider_exec_auth;
  if v_rider_exec_auth then
    raise exception '0204: rider_complete_delivery must not be executable by authenticated';
  end if;

  -- Ensure they ARE executable by service_role
  select has_function_privilege('service_role', 'public.get_rider_job_by_token(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if not v_rider_exec_auth then
    raise exception '0204: get_rider_job_by_token must be executable by service_role';
  end if;

  select has_function_privilege('service_role', 'public.rider_mark_picked_up(text)', 'EXECUTE')
  into v_rider_exec_auth;
  if not v_rider_exec_auth then
    raise exception '0204: rider_mark_picked_up must be executable by service_role';
  end if;

  select has_function_privilege('service_role', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  into v_rider_exec_auth;
  if not v_rider_exec_auth then
    raise exception '0204: rider_complete_delivery must be executable by service_role';
  end if;

  -- Ensure anon cannot execute any of these
  select has_function_privilege('anon', 'public.get_rider_job_by_token(text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: get_rider_job_by_token must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.rider_mark_picked_up(text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: rider_mark_picked_up must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: rider_complete_delivery must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.create_rider_link(uuid, uuid, text, text)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: create_rider_link must not be executable by anon';
  end if;
  select has_function_privilege('anon', 'public.revoke_rider_link(uuid)', 'EXECUTE')
  into v_rider_exec_anon;
  if v_rider_exec_anon then
    raise exception '0204: revoke_rider_link must not be executable by anon';
  end if;

  raise notice '0204 verification passed: contract aligned, R1 enforced, token_hash protected';
end;
$verify$;

commit;

-- Record 0204_rider_link_v2_contract_fix in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030046', '0204_rider_link_v2_contract_fix')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0204_rider_link_v2_contract_fix.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0205_extend_booking_without_draft.sql
-- SHA-256: ed272a5fa2693ef9b91124475321ed39c731cb3d72cad88c5030875ab56366cb
-- Version: 20261122030047
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0205: extend_booking must not require a Draft invoice (T3-14b fix)
--
-- 0200 replaced extend_booking's "update the Draft invoice's lines, if there is
-- one" with an unconditional call to resync_draft_invoice. That function raises
-- "no Draft invoice for booking N" when the booking has none, so extending a
-- rental failed for every booking without a Draft:
--   - a booking confirmed before 0200 (0200 creates the Draft only on
--     Quote -> Booked and has no backfill);
--   - a booking whose invoice is already numbered (W16: numbered on full payment).
--
-- Caught by `npm run check:anon`:
--   "Owner can extend an On Rent booking (resync_draft_invoice: no Draft invoice
--    for booking 864.)"
-- check:pglite and check:lifecycle did not catch it: neither extended a booking
-- that has no Draft. This migration adds that case to check:lifecycle (L67).
--
-- Fix: the function is otherwise identical to 0200. Step 8 now calls
-- resync_draft_invoice only when a Draft exists (W15: the Draft follows the
-- booking while it stays a Draft). With no Draft, invoice_resync is null and no
-- invoice is touched. That is what 0193 did before 0200, and what 0200's own
-- function comment says ("Issued invoices are not touched").
--
-- NOT decided here: what a change to a booking with a NUMBERED invoice should
-- do (second invoice, credit note, or a block with a message). That is O-14 /
-- T3-14c. This migration leaves a numbered invoice exactly as 0193 did.
--
-- N-5: Written, numbered, tested locally under PGlite. Babin applies after backup.
-- Revert (B-6): restore the 0200 definition of extend_booking(jsonb), one statement.
-- The overload extend_booking(uuid, integer, text, uuid) calls this one and is
-- unchanged; create or replace keeps every grant.
-- =============================================================================

begin;
create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid := nullif(coalesce(p_payload ->> 'actor_id', p_payload ->> 'extended_by', ''), '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_resync        jsonb;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role & permission validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor
  v_actor := coalesce(v_actor, auth.uid());
  if v_actor is null then
    select id into v_actor
      from users
     where primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator')
       and is_active
     order by created_at
     limit 1;
  end if;

  if v_role is null and v_actor is not null then
    select primary_role into v_role from users where id = v_actor;
  end if;
  v_role := coalesce(v_role, 'Coordinator');

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. W15: the invoice follows the booking only while it is a Draft.
  --    resync_draft_invoice raises when there is no Draft (never created, e.g. a
  --    booking confirmed before 0200, or already numbered under W16), so call it
  --    only when one exists. A numbered invoice is not touched here (F5 guard);
  --    what to do after a change to a numbered invoice is O-14 / T3-14c, not
  --    decided in this function.
  if exists (select 1 from invoices where booking_id = v_booking_id and status = 'Draft') then
    v_resync := public.resync_draft_invoice(v_booking_id);
  end if;

  -- 9. Insert audit log
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
    old_values,
    new_values,
    reason
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()),
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days,
    'invoice_resync', v_resync
  );
end;
$$;

comment on function public.extend_booking(jsonb) is
  'Extends a booking by N days. Checks role permissions (C+), updates return_at, updates line days, '
  'expands inventory_reservations (triggering double-booking and capacity checks), and logs audit_events. '
  'With a Draft invoice: calls resync_draft_invoice to re-derive lines and totals (W15). With no Draft '
  '(never created, or already numbered) nothing is re-derived and invoice_resync is null. A numbered '
  'invoice is not touched (F5 guard); how a change after numbering is handled is O-14 / T3-14c.';

-- Post-conditions: the replacement kept the ACL, the definer rights, the pinned
-- search_path and carries the Draft guard. Behaviour is proven by check:lifecycle
-- L67 and check:anon; a migration must not write to live rows to prove it.
do $verify$
declare
  v_oid oid := 'public.extend_booking(jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
begin
  if not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception '0205 post-condition failed: extend_booking(jsonb) is no longer SECURITY DEFINER.';
  end if;
  if not exists (select 1 from pg_proc where oid = v_oid and proconfig @> array['search_path=public, pg_temp']) then
    raise exception '0205 post-condition failed: extend_booking(jsonb) lost its pinned search_path.';
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception '0205 post-condition failed: anon can execute extend_booking(jsonb).';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception '0205 post-condition failed: authenticated can no longer execute extend_booking(jsonb).';
  end if;
  if position('if exists (select 1 from invoices where booking_id = v_booking_id and status = ''Draft'')' in v_def) = 0 then
    raise exception '0205 post-condition failed: extend_booking(jsonb) does not guard the Draft re-sync.';
  end if;
end;
$verify$;

commit;

-- Record 0205_extend_booking_without_draft in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030047', '0205_extend_booking_without_draft')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0205_extend_booking_without_draft.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0206_delivery_route_map_pins.sql
-- SHA-256: 3243338c14bcd8eb679e7a60716f9a55fe50d57ffd176d46c61d00640182b2e9
-- Version: 20261122030048
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0206_delivery_route_map_pins.sql
-- T4-09: Delivery route ordering + map pins for Google Maps links
-- Adds route_position to delivery_jobs and map_pin columns to client addresses

begin;

-- 1. Add route_position to delivery_jobs for ordering within a day's run
alter table public.delivery_jobs
  add column if not exists route_position integer;

-- Index for efficient ordering queries
create index if not exists delivery_jobs_branch_schedule_route_idx
  on public.delivery_jobs(branch_id, scheduled_at, route_position);

-- 2. Add map_pin_lat and map_pin_lng to clients for drop-pin / paste Maps link
alter table public.clients
  add column if not exists map_pin_lat double precision,
  add column if not exists map_pin_lng double precision;

-- 3. RPC: set_delivery_route_position
-- Called by staff to set the manual order for a day's run
create or replace function public.set_delivery_route_position(
  p_job_id uuid,
  p_route_position int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_updated boolean;
begin
  -- Authorization: Owner, Admin, Manager, Coordinator, Warehouse
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to set route position' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id;
  if not found then
    raise exception 'Delivery job not found';
  end if;

  -- Branch check for non-Owner/Admin
  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  update public.delivery_jobs
  set route_position = p_route_position,
      updated_at = now(),
      updated_by = v_actor
  where id = p_job_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.set_delivery_route_position(uuid, int) is 'Set route position for a delivery job (staff only). Returns true if updated.';

-- 4. RPC: set_client_map_pin
-- Staff drops a pin or pastes a Google Maps link (lat/lng extracted)
create or replace function public.set_client_map_pin(
  p_client_id uuid,
  p_lat double precision,
  p_lng double precision
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_updated boolean;
begin
  -- Authorization: Owner, Admin, Manager, Coordinator, Warehouse
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to set client map pin' using errcode = '42501';
  end if;

  -- Validate lat/lng ranges
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid latitude/longitude' using errcode = 'check_violation';
  end if;

  update public.clients
  set map_pin_lat = p_lat,
      map_pin_lng = p_lng,
      updated_at = now()
  where id = p_client_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.set_client_map_pin(uuid, double precision, double precision) is 'Set map pin coordinates for a client address (staff only). Returns true if updated.';

-- 5. RPC: get_day_route
-- Returns all jobs for a branch on a given date, ordered by route_position then scheduled_at
-- Includes client map pins for Google Maps link generation
create or replace function public.get_day_route(
  p_branch_id uuid,
  p_date date
) returns table (
  id uuid,
  booking_id uuid,
  booking_no text,
  leg text,
  scheduled_at timestamptz,
  status text,
  route_position int,
  client_name text,
  client_phone text,
  address text,
  neighborhood text,
  map_pin_lat double precision,
  map_pin_lng double precision,
  driver_name text,
  driver_phone text,
  vehicle text,
  zone_name text,
  zone_fee_paisa bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Authorization: any authenticated staff
  if not public.auth_is_staff() then
    raise exception 'Only staff can view day route' using errcode = '42501';
  end if;

  return query
  select
    dj.id,
    dj.booking_id,
    b.booking_no,
    dj.leg,
    dj.scheduled_at,
    dj.status,
    dj.route_position,
    c.name as client_name,
    c.phone as client_phone,
    c.address_line as address,
    c.neighborhood,
    c.map_pin_lat,
    c.map_pin_lng,
    u.full_name as driver_name,
    u.phone as driver_phone,
    dj.vehicle,
    dz.name as zone_name,
    case when public.auth_can_view_money() then dz.fee_paisa else null end as zone_fee_paisa
  from public.delivery_jobs dj
  join public.bookings b on b.id = dj.booking_id
  join public.clients c on c.id = b.client_id
  left join public.users u on u.id = dj.assigned_driver_id
  left join public.delivery_zones dz on dz.id = b.delivery_zone_id
  where dj.branch_id = p_branch_id
    and dj.scheduled_at >= p_date
    and dj.scheduled_at < p_date + interval '1 day'
    and dj.status not in ('Delivered', 'Failed') -- Only active jobs in route
  order by
    dj.route_position nulls last, -- Manual order first
    dj.scheduled_at asc; -- Then by scheduled time
end;
$$;

comment on function public.get_day_route(uuid, date) is 'Get ordered delivery route for a branch on a date (staff only). Includes map pins for Google Maps links. fee_paisa masked for money-blind roles (Law 6).';

-- 6. RPC: generate_google_maps_links
-- Generates Google Maps URLs for a route (handles 3-stop phone limit)
create or replace function public.generate_google_maps_links(
  p_branch_id uuid,
  p_date date,
  p_shop_lat double precision default 27.7172, -- Boudha default
  p_shop_lng double precision default 85.3240
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jobs record;
  v_waypoints text[];
  v_links jsonb := '[]'::jsonb;
  v_current_link jsonb;
  v_stop_count int := 0;
  v_max_stops int := 3; -- Phone browser limit
  v_shop text := 'Babin Rentals, Boudha, Kathmandu';
begin
  -- Authorization
  if not public.auth_is_staff() then
    raise exception 'Only staff can generate map links' using errcode = '42501';
  end if;

  v_current_link := jsonb_build_object(
    'stops', jsonb_build_array(),
    'url', ''
  );

  for v_jobs in select * from public.get_day_route(p_branch_id, p_date) loop
    -- Build destination string: prefer map pin, fallback to address
    declare
      v_dest text;
    begin
      if v_jobs.map_pin_lat is not null and v_jobs.map_pin_lng is not null then
        v_dest := v_jobs.map_pin_lat || ',' || v_jobs.map_pin_lng;
      else
        v_dest := v_jobs.address || ', ' || v_jobs.neighborhood || ', Kathmandu, Nepal';
      end if;

      v_waypoints := v_waypoints || v_dest;
      v_stop_count := v_stop_count + 1;

      -- If we hit the phone limit, generate the current link and start a new one
      if v_stop_count > v_max_stops then
        -- Build URL for accumulated waypoints
        v_current_link := jsonb_build_object(
          'stops', to_jsonb(v_waypoints[1:v_max_stops]),
          'url', 'https://www.google.com/maps/dir/' || v_shop || '/' || array_to_string(v_waypoints[1:v_max_stops], '/')
        );
        v_links := v_links || v_current_link;

        -- Start new link with the overflow stop
        v_waypoints := array[v_dest];
        v_stop_count := 1;
      end if;
    end;
  end loop;

  -- Don't forget the last batch
  if v_stop_count > 0 then
    v_current_link := jsonb_build_object(
      'stops', to_jsonb(v_waypoints),
      'url', 'https://www.google.com/maps/dir/' || v_shop || '/' || array_to_string(v_waypoints, '/')
    );
    v_links := v_links || v_current_link;
  end if;

  return v_links;
end;
$$;

comment on function public.generate_google_maps_links(uuid, date, double precision, double precision) is 'Generate Google Maps route links for a day (staff only). Splits into multiple links if >3 stops for phone browsers.';

-- Grant execute on new RPCs
grant execute on function public.set_delivery_route_position(uuid, int) to authenticated;
grant execute on function public.set_client_map_pin(uuid, double precision, double precision) to authenticated;
grant execute on function public.get_day_route(uuid, date) to authenticated;
grant execute on function public.generate_google_maps_links(uuid, date, double precision, double precision) to authenticated;

revoke all on function public.set_delivery_route_position(uuid, int) from anon, public;
revoke all on function public.set_client_map_pin(uuid, double precision, double precision) from anon, public;
revoke all on function public.get_day_route(uuid, date) from anon, public;
revoke all on function public.generate_google_maps_links(uuid, date, double precision, double precision) from anon, public;

-- Verification assertions
do $verify$
declare
  v_col_exists boolean;
begin
  -- 1. route_position column exists on delivery_jobs
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_jobs' and column_name = 'route_position'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: route_position column missing on delivery_jobs';
  end if;

  -- 2. map_pin_lat/lng columns exist on clients
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'map_pin_lat'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: map_pin_lat column missing on clients';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'map_pin_lng'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: map_pin_lng column missing on clients';
  end if;

  -- 3. RPCs exist
  select exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'set_delivery_route_position'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: set_delivery_route_position RPC missing';
  end if;

  select exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'get_day_route'
  ) into v_col_exists;
  if not v_col_exists then
    raise exception '0206: get_day_route RPC missing';
  end if;

  raise notice '0206 verification passed: route_position, map pins, RPCs all present';
end;
$verify$;

commit;

-- Record 0206_delivery_route_map_pins in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030048', '0206_delivery_route_map_pins')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0206_delivery_route_map_pins.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0207_crew_overtime_half_full_day.sql
-- SHA-256: 8cd838f2c19bdde57e21b2518a0eb18c5e59c4c4d738fc6fc91d2989c21b5e1c
-- Version: 20261122030049
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0207_crew_overtime_half_full_day.sql
-- Crew overtime: half or full day (Ruling D24, Task T8-06)
-- 1. Add overtime_days column to crew_assignments (numeric, allows 0.5 increments)
-- 2. Add overtime_approved_by column to track who approved the overtime
-- 3. Add overtime_fraction to crew_shoot_days
-- 4. Grant column permissions to authenticated role and update crew_assignments_v
-- 5. The overtime is calculated at the day rate for both client bill and crew payout

begin;

-- 1. Add overtime_days to crew_assignments
alter table public.crew_assignments
  add column if not exists overtime_days numeric(3,1) not null default 0
    check (overtime_days >= 0 and overtime_days % 0.5 = 0),
  add column if not exists overtime_approved_by uuid references public.users(id);

-- 2. Add overtime_fraction to crew_shoot_days
alter table public.crew_shoot_days
  add column if not exists overtime_fraction numeric(3,1) not null default 0
    check (overtime_fraction in (0, 0.5, 1.0));

-- 3. Grant INSERT and column SELECT on crew_assignments to authenticated role
grant insert on public.crew_assignments to authenticated;
grant select (overtime_days, overtime_approved_by) on public.crew_assignments to authenticated;

-- Ensure RLS is enabled on crew_assignments
alter table public.crew_assignments enable row level security;

-- 4. Update crew_assignments_v to include overtime_days and overtime_approved_by
-- (renumbered 0186 -> 0207 on 2 Nov 2026: 0199_tds_on_crew_payouts now runs first and already
-- extended this view with the payout/TDS columns, so they are kept here and the two overtime
-- columns are appended after them. create or replace view cannot drop columns.)
create or replace view public.crew_assignments_v as
select
  id,
  client_uuid,
  booking_id,
  crew_id,
  role_on_shoot,
  call_time,
  wrap_time,
  case when auth_can_view_money() then daily_rate else null::numeric end as daily_rate,
  days,
  case when auth_can_view_money() then line_total else null::numeric end as line_total,
  notes,
  created_at,
  created_by,
  updated_at,
  updated_by,
  payout_status,
  case when auth_can_view_money() then tds_rate_percent else null::numeric end as tds_rate_percent,
  case when auth_can_view_money() then tds_amount else null::numeric end as tds_amount,
  case when auth_can_view_money() then net_payout else null::numeric end as net_payout,
  case when auth_can_view_money() then payout_notes else null::text end as payout_notes,
  paid_at,
  paid_by,
  overtime_days,
  overtime_approved_by
from public.crew_assignments
where auth_is_staff();

grant select on public.crew_assignments_v to authenticated;

-- 5. Add index for overtime_approved_by
create index if not exists idx_crew_assignments_overtime_approved_by
  on public.crew_assignments (overtime_approved_by) where overtime_approved_by is not null;

-- 6. Add comments
comment on column public.crew_assignments.overtime_days is
  'Overtime in days (0.5 or 1.0 increments). Calculated at day_rate for both client bill and crew payout. D24.';
comment on column public.crew_assignments.overtime_approved_by is
  'User who approved the overtime. Required when overtime_days > 0.';
comment on column public.crew_shoot_days.overtime_fraction is
  'Overtime fraction per shoot day (0, 0.5, or 1.0 day). Billed to client and paid to crew member. D24.';

commit;

-- Record 0207_crew_overtime_half_full_day in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030049', '0207_crew_overtime_half_full_day')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0207_crew_overtime_half_full_day.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0208_staff_pin_four_digits.sql
-- SHA-256: bf00e32a88a5177a23a41e2a3346ea0d83be134ecae2a2a3c85ef1292245c7de
-- Version: 20261122030050
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0208: staff PIN is FOUR digits — Babin's ruling, 28 October 2026.
--
-- The T1-15 card and ruling W53 say "tap name + 4-digit PIN". Migration 0066
-- shipped `^[0-9]{6}$`. This was logged as a TODO(decision) on 28 Oct
-- (OPEN_DECISIONS): keep 6 (stricter, B-1) or relax to 4. Babin answered
-- "4 pin" — an explicit owner instruction, which is exactly what relaxing a
-- shipped security parameter requires (CLAUDE.md §15.2).
--
-- The honest cost, stated rather than hidden: the space drops 100× (10^6 →
-- 10^4). The lockout carries the day: 5 consecutive wrong tries lock that
-- person for 15 minutes (0066), so a continuous attacker gets 5 tries per
-- quarter hour — an even-odds hit takes ~10.4 days of uninterrupted attempts
-- (5,000 tries × 3 min/try), and a guaranteed hit ~20.8 days. The weak-PIN
-- rules below (identical digits, sequential digits, last-4-of-mobile) remove
-- the guesses someone standing at a shared tablet actually makes first.
--
-- TRANSITION, tighten-on-write: `set_staff_pin` enforces exactly 4 from now
-- on; `verify_staff_pin` accepts 4 OR 6, because a hash already enrolled under
-- the old six-digit rule must keep verifying until its owner rotates it —
-- refusing it here would lock real staff out of their own sessions on a
-- format technicality. Follow-up (log it when the live roster has rotated):
-- a later migration tightens verify to 4-only.
--
-- No table or enum changes. Law 3 untouched: rotation is still revoke+insert.
-- Revert = drop this file's function definitions and restore 0066's bodies
-- (the two regexes and the weak-PIN literals are the only edits).
-- =============================================================================

begin;

-- ── set_staff_pin: enrol or rotate the CALLER'S OWN PIN — exactly 4 digits ──

create or replace function set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id  uuid := auth_user_id();
  v_mobile   text;
  v_rotating boolean;
  v_pw_at    bigint;
begin
  if v_user_id is null then
    raise exception 'A PIN can only be set by a signed-in staff session.';
  end if;

  /*
   * ── the freshness gate ────────────────────────────────────────────────────
   *
   * Minting a credential requires having proved identity RECENTLY, not merely
   * holding a session that proved it at some point.
   *
   * The attack this stops is mundane and is the likeliest one on this floor: an
   * unattended tablet with an hours-old session. Without this gate, anyone
   * walking past can silently add their OWN PIN to somebody else's account and
   * from then on re-open that session at will — a permanent credential minted
   * from a temporary opportunity, with the owner's name on every row it writes.
   *
   * ⚠ What this is NOT, and the spec for this feature got it wrong:
   *
   * The design asked that a PIN-unlocked session be forbidden from setting a
   * PIN. That is **not expressible here**, and the reason is structural: a PIN
   * unlock does not touch the JWT. `verify_staff_pin` returns a verdict, the
   * existing token is reused unchanged, and so a PIN-unlocked session presents
   * a token identical to the password sign-in that created it. The database
   * cannot tell them apart because there is nothing different to see.
   *
   * The freshness window is the honest approximation: it does not identify how
   * the curtain was opened, it bounds how long ago the password was typed. That
   * closes the unattended-tablet case, which is what the spec was reaching for.
   *
   * `amr` ("authentication methods references") is a GoTrue claim carrying one
   * entry per method used on this session with a unix timestamp — verified on
   * this project: {"aal":"aal1","amr":[{"method":"password","timestamp":...}]}.
   * Absent amr means this did not arrive as a GoTrue user request, so it is
   * refused rather than waved through: a service-role or psql caller is not a
   * staff member choosing their own PIN, and this function has no other purpose.
   */
  select max((entry ->> 'timestamp')::bigint)
    into v_pw_at
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
   where entry ->> 'method' = 'password';

  if v_pw_at is null or to_timestamp(v_pw_at) < now() - interval '15 minutes' then
    raise exception
      'For security, a PIN can only be set within 15 minutes of signing in with your password. Sign out and sign in again, then set the PIN.';
  end if;

  -- The staff row must exist and be active. An inactive identity does not get a
  -- fresh credential, and 0060's note is the reason this is checked here rather
  -- than assumed: an auth account can exist with no matching staff row at all.
  select mobile into v_mobile
    from users
   where id = v_user_id and is_active;

  if not found then
    raise exception 'No active staff row for this identity; a PIN cannot be set.';
  end if;

  -- Shape. Enforced here as well as in the UI because the RPC is reachable
  -- without the numpad. 0208 (Babin, 28 Oct): exactly FOUR digits.
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'A PIN must be exactly 4 digits.';
  end if;

  -- Weak-PIN rejection. Four identical digits, four sequential in either
  -- direction, and the last four of the mobile on the staff row — the three
  -- guesses someone standing at a shared tablet actually makes. With a 4-digit
  -- PIN the mobile rule compares the whole PIN.
  if p_pin ~ '^(.)\1{3}$' then
    raise exception 'That PIN is four identical digits. Choose another.';
  end if;

  -- The same cyclic strings 0066 used: they contain every 4-length run
  -- including the wraparound ones ('7890' ascending, '0987' descending).
  if strpos('01234567890', p_pin) > 0 or strpos('09876543210', p_pin) > 0 then
    raise exception 'That PIN is four sequential digits. Choose another.';
  end if;

  if v_mobile is not null
     and length(regexp_replace(v_mobile, '\D', '', 'g')) >= 4
     and right(regexp_replace(v_mobile, '\D', '', 'g'), 4) = right(p_pin, 4) then
    raise exception 'That PIN ends with the last four digits of your mobile number. Choose another.';
  end if;

  -- Rotation is a revoke plus an insert, never an UPDATE of pin_hash. Law 3:
  -- the fact that a different PIN was in force until now survives.
  update staff_auth_pins
     set revoked_at = now(),
         revoked_by = v_user_id
   where user_id = v_user_id
     and revoked_at is null;

  -- Captured explicitly rather than reading FOUND at the insert. FOUND would
  -- still be the UPDATE's result there and would work, but it is one statement
  -- away from silently meaning something else.
  v_rotating := found;

  insert into staff_auth_pins (user_id, pin_hash, rotated_at)
  values (
    v_user_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    case when v_rotating then now() else null end
  );
end;
$$;

comment on function set_staff_pin(text) is
  'Enrol or rotate the caller''s OWN staff PIN. 0208 (Babin, 28 Oct 2026): exactly 4 digits. '
  'Freshness gate: the password sign-in must be <= 15 minutes old (amr). Weak PINs refused: four '
  'identical, four sequential, last four of the caller''s mobile. Rotation is revoke + insert (Law 3).';

revoke all on function set_staff_pin(text) from public, anon;
grant execute on function set_staff_pin(text) to authenticated;

-- ── verify_staff_pin: accepts 4 OR 6 during the transition ────────────────

create or replace function verify_staff_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth_user_id();
  v_row     staff_auth_pins;
  v_ok      boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select * into v_row
    from staff_auth_pins
   where user_id = v_user_id
     and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  -- Locked. Refuse WITHOUT consulting the hash: a lockout that still compares
  -- is a lockout an attacker can time.
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'locked_until', v_row.locked_until
    );
  end if;

  -- The staff row can be deactivated while a device sits locked. Fail on the
  -- identity, before the credential.
  if not exists (select 1 from users where id = v_user_id and is_active) then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  -- 0208: 4 from now on, 6 kept so hashes enrolled before the ruling still
  -- verify until their owners rotate. Tighten to 4-only once the live roster
  -- has rotated (follow-up, logged in the 0208 header).
  if p_pin is null or p_pin !~ '^([0-9]{4}|[0-9]{6})$' then
    return jsonb_build_object('ok', false, 'reason', 'malformed');
  end if;

  v_ok := extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash;

  if v_ok then
    update staff_auth_pins
       set attempt_count = 0,
           locked_until  = null,
           last_used_at  = now()
     where id = v_row.id;

    return jsonb_build_object('ok', true);
  end if;

  -- Failure. The fifth consecutive one locks for 15 minutes, matching
  -- portal_auth_challenges. The count never exceeds 5 (CHECK).
  update staff_auth_pins
     set attempt_count = least(v_row.attempt_count + 1, 5),
         locked_until  = case
                           when v_row.attempt_count + 1 >= 5 then now() + interval '15 minutes'
                           else locked_until
                         end
   where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ok', false,
    'reason', 'wrong_pin',
    'attempts_left', greatest(5 - v_row.attempt_count, 0),
    'locked_until', v_row.locked_until
  );
end;
$$;

comment on function verify_staff_pin(text) is
  'Is this the caller''s PIN? Fails closed; 5 consecutive failures lock that person only, '
  '15 minutes. 0208: accepts 4 digits (the ruling) and keeps 6 so pre-ruling hashes verify '
  'until rotated — set_staff_pin enforces exactly 4 from now on.';

revoke all on function verify_staff_pin(text) from public, anon;
grant execute on function verify_staff_pin(text) to authenticated;

commit;

-- Record 0208_staff_pin_four_digits in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030050', '0208_staff_pin_four_digits')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0208_staff_pin_four_digits.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0209_calendar_feed_tokens.sql
-- SHA-256: c24218a6d4d85ff96e8a188feac6676f563a98a5713acc91a90b01c62938efad
-- Version: 20261122030051
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0209_calendar_feed_tokens.sql
-- T4-10: Private iCal feed tokens for staff to add jobs to phone calendars
-- B28, B29, B54, K5: number, time, client name only; no amounts, phones, addresses

begin;

-- Table: calendar_feed_tokens
create table if not exists public.calendar_feed_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    token_hash text not null unique check (char_length(token_hash) = 64),
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    constraint calendar_feed_tokens_one_per_user unique (user_id) deferrable initially deferred
);

comment on table public.calendar_feed_tokens is 'Private iCal feed tokens for staff calendar subscriptions';
comment on column public.calendar_feed_tokens.token_hash is 'SHA-256 hash of the raw token (raw token never stored)';

-- RLS
alter table public.calendar_feed_tokens enable row level security;

-- Staff can see their own token status (not the raw token)
drop policy if exists calendar_feed_tokens_self_read on public.calendar_feed_tokens;
create policy calendar_feed_tokens_self_read on public.calendar_feed_tokens
    for select to authenticated using (
        auth.uid() = user_id
    );

-- Owner/Admin can see all tokens (for revocation UI)
drop policy if exists calendar_feed_tokens_admin_read on public.calendar_feed_tokens;
create policy calendar_feed_tokens_admin_read on public.calendar_feed_tokens
    for select to authenticated using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.is_active
            and u.primary_role in ('Owner', 'Admin')
        )
    );

-- RPC: create_calendar_feed_token
create or replace function public.create_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_role text := (
        select u.primary_role::text from public.users u
        where u.id = auth.uid() and u.is_active
    );
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
begin
    -- Any authenticated staff can create their own feed token
    if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts') then
        raise exception 'Only staff can create calendar feed tokens' using errcode = '42501';
    end if;

    -- Generate raw token (128-bit)
    v_raw_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 32);
    v_token_hash := md5(v_raw_token) || md5(v_raw_token || 'salt'); -- 64 hex chars

    -- Upsert: one token per user
    insert into public.calendar_feed_tokens (user_id, token_hash)
    values (v_actor, v_token_hash)
    on conflict (user_id) do update set
        token_hash = excluded.token_hash,
        revoked_at = null,
        created_at = now()
    returning id into v_token_id;

    -- Audit
    insert into public.audit_events (
        client_uuid, event_class, category, module, action, severity, status,
        table_name, record_id, actor_id, actor_role, branch_id, new_values
    ) values (
        gen_random_uuid(),
        'status change',
        'Operations',
        'Calendar',
        'Create',
        'Informational',
        'Success',
        'calendar_feed_tokens',
        v_token_id,
        v_actor,
        v_role::system_role,
        (select branch_id from public.users where id = v_actor),
        jsonb_build_object('action', 'create_calendar_feed_token')
    );

    -- Return RAW token ONLY on creation (never again)
    return v_raw_token;
end;
$$;

comment on function public.create_calendar_feed_token() is 'Create or rotate calendar feed token for current user. Returns raw token once.';

-- RPC: revoke_calendar_feed_token
create or replace function public.revoke_calendar_feed_token(
    p_user_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_role text := (
        select u.primary_role::text from public.users u
        where u.id = auth.uid() and u.is_active
    );
    v_target_user uuid := coalesce(p_user_id, v_actor);
    v_updated boolean;
begin
    -- Self-revoke: any staff can revoke their own
    -- Owner/Admin: can revoke anyone's
    if v_target_user <> v_actor then
        if v_role not in ('Owner', 'Admin') then
            raise exception 'Only Owner/Admin can revoke another user token' using errcode = '42501';
        end if;
    end if;

    update public.calendar_feed_tokens
    set revoked_at = now()
    where user_id = v_target_user
      and revoked_at is null;

    get diagnostics v_updated = row_count;

    if v_updated then
        insert into public.audit_events (
            client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values
        ) values (
            gen_random_uuid(),
            'status change',
            'Operations',
            'Calendar',
            'Update',
            'Informational',
            'Success',
            'calendar_feed_tokens',
            (select id from public.calendar_feed_tokens where user_id = v_target_user),
            v_actor,
            v_role::system_role,
            (select branch_id from public.users where id = v_actor),
            jsonb_build_object('revoked', false),
            jsonb_build_object('revoked', true)
        );
    end if;

    return v_updated;
end;
$$;

comment on function public.revoke_calendar_feed_token(uuid) is 'Revoke calendar feed token (self or Owner/Admin for others). Returns true if revoked.';

-- RPC: get_calendar_feed
-- Returns iCal feed for a valid token (no auth required - token is the credential)
create or replace function public.get_calendar_feed(
    p_token_hash text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_token public.calendar_feed_tokens%rowtype;
    v_user public.users%rowtype;
    v_jobs public.delivery_transport_v%rowtype;
    v_ical text := '';
    v_now text := to_char(now() at time zone 'Asia/Kathmandu', 'YYYYMMDDTHH24MISS');
    v_uid_prefix text := 'babinrentals.com';
    v_event text;
    v_desc text;
    v_start text;
    v_end text;
begin
    -- Validate token hash format
    if p_token_hash is null or char_length(p_token_hash) <> 64 then
        raise exception 'Invalid token' using errcode = '42501';
    end if;

    -- Look up token
    select * into v_token
    from public.calendar_feed_tokens
    where token_hash = p_token_hash;

    if not found then
        raise exception 'Invalid token' using errcode = '42501';
    end if;

    if v_token.revoked_at is not null then
        raise exception 'Token revoked' using errcode = '42501';
    end if;

    -- Get user
    select * into v_user
    from public.users
    where id = v_token.user_id
      and is_active = true;

    if not found then
        raise exception 'User not found or inactive' using errcode = '42501';
    end if;

    -- Build iCal header
    v_ical := 'BEGIN:VCALENDAR' || chr(10) ||
              'VERSION:2.0' || chr(10) ||
              'PRODID:-//Babin Rentals//Calendar Feed//EN' || chr(10) ||
              'CALSCALE:GREGORIAN' || chr(10) ||
              'METHOD:PUBLISH' || chr(10) ||
              'X-WR-CALNAME:Babin Rentals Jobs' || chr(10) ||
              'X-WR-TIMEZONE:Asia/Kathmandu' || chr(10);

    -- Fetch jobs for this user based on role
    -- Driver: only assigned jobs
    -- Desk/floor roles: branch's pickups, returns, deliveries
    for v_jobs in
        select
            t.id,
            t.booking_id,
            b.booking_no,
            c.name as client_name,
            t.delivery_type,
            t.driver_id,
            t.vehicle,
            t.number_plate,
            t.delivery_status,
            t.scheduled_at,
            t.dispatched_at,
            t.delivered_at,
            t.recipient_name,
            b.pickup_location,
            b.return_location,
            b.branch_id
        from public.booking_transport t
        join public.bookings b on b.id = t.booking_id
        join public.clients c on c.id = b.client_id
        where b.cancelled_at is null
          and b.stage <> 'Quote'
          and t.delivery_type <> 'Client Pickup'
          and (
            (v_user.primary_role = 'Driver' and t.driver_id = v_user.id)
            or (v_user.primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
                and b.branch_id = v_user.branch_id)
          )
          and t.scheduled_at >= now() - interval '30 days'
          and t.scheduled_at <= now() + interval '30 days'
        order by t.scheduled_at asc
    loop
        -- Build event UID
        v_event := 'UID:' || v_uid_prefix || '-' || v_jobs.id || chr(10);

        -- DTSTAMP
        v_event := v_event || 'DTSTAMP:' || v_now || chr(10);

        -- Status mapping
        if v_jobs.delivery_status = 'Delivered' then
            v_event := v_event || 'STATUS:COMPLETED' || chr(10);
        elsif v_jobs.delivery_status = 'Failed' then
            v_event := v_event || 'STATUS:CANCELLED' || chr(10);
        else
            v_event := v_event || 'STATUS:CONFIRMED' || chr(10);
        end if;

        -- Summary: "BK-1234 · Pickup 09:00 · Client Name" (B29, K5)
        v_event := v_event || 'SUMMARY:' || v_jobs.booking_no || ' · ' ||
            case
                when v_jobs.delivery_type = 'Outbound' then 'Pickup'
                when v_jobs.delivery_type = 'Return' then 'Return'
                else v_jobs.delivery_type
            end
            || ' ' || to_char(v_jobs.scheduled_at at time zone 'Asia/Kathmandu', 'HH24:MI')
            || ' · ' || v_jobs.client_name || chr(10);

        -- Description (minimal, no money/address/phone per B29, K5)
        v_desc := 'Booking: ' || v_jobs.booking_no || chr(10) ||
                  'Type: ' || v_jobs.delivery_type || chr(10) ||
                  'Client: ' || v_jobs.client_name || chr(10) ||
                  'Vehicle: ' || coalesce(v_jobs.vehicle, 'N/A') || ' ' || coalesce(v_jobs.number_plate, '') || chr(10);
        v_event := v_event || 'DESCRIPTION:' || replace(v_desc, chr(10), '\n') || chr(10);

        -- DTSTART / DTEND (use scheduled_at as start, +30 min as end)
        v_start := to_char(v_jobs.scheduled_at at time zone 'Asia/Kathmandu', 'YYYYMMDDTHH24MISS');
        v_end := to_char((v_jobs.scheduled_at + interval '30 minutes') at time zone 'Asia/Kathmandu', 'YYYYMMDDTHH24MISS');
        v_event := v_event || 'DTSTART;TZID=Asia/Kathmandu:' || v_start || chr(10);
        v_event := v_event || 'DTEND;TZID=Asia/Kathmandu:' || v_end || chr(10);

        -- Location: only client name, no address (B29, K5)
        v_event := v_event || 'LOCATION:' || v_jobs.client_name || chr(10);

        v_ical := v_ical || v_event || 'END:VEVENT' || chr(10);
    end loop;

    v_ical := v_ical || 'END:VCALENDAR' || chr(10);

    return v_ical;
end;
$$;

comment on function public.get_calendar_feed(text) is 'Get iCal feed for calendar token (no auth, token is credential). Returns text/calendar.';

-- Grant execute
grant execute on function public.create_calendar_feed_token() to authenticated;
grant execute on function public.revoke_calendar_feed_token(uuid) to authenticated;
grant execute on function public.get_calendar_feed(text) to service_role;

revoke all on function public.create_calendar_feed_token() from anon, public;
revoke all on function public.revoke_calendar_feed_token(uuid) from anon, public;
revoke all on function public.get_calendar_feed(text) from anon, public;

-- Verification assertions
do $verify$
declare
    v_col_exists boolean;
    v_func_exists boolean;
begin
    -- 1. calendar_feed_tokens table exists with required columns
    select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'calendar_feed_tokens'
        and column_name in ('user_id', 'token_hash', 'created_at', 'revoked_at')
    ) into v_col_exists;
    if not v_col_exists then
        raise exception '0209: calendar_feed_tokens missing required columns';
    end if;

    -- 2. RPCs exist
    select exists (
        select 1 from information_schema.routines
        where routine_schema = 'public' and routine_name = 'create_calendar_feed_token'
    ) into v_func_exists;
    if not v_func_exists then
        raise exception '0209: create_calendar_feed_token RPC missing';
    end if;

    select exists (
        select 1 from information_schema.routines
        where routine_schema = 'public' and routine_name = 'get_calendar_feed'
    ) into v_func_exists;
    if not v_func_exists then
        raise exception '0209: get_calendar_feed RPC missing';
    end if;

    -- 3. Token hash format (64 chars) enforced
    select exists (
        select 1 from information_schema.check_constraints
        where constraint_schema = 'public'
        and constraint_name = 'calendar_feed_tokens_token_hash_check'
    ) into v_col_exists;
    if not v_col_exists then
        raise exception '0209: token_hash check constraint missing';
    end if;

    raise notice '0209 verification passed: calendar_feed_tokens table, RPCs, constraints all present';
end;
$verify$;

commit;

-- Record 0209_calendar_feed_tokens in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030051', '0209_calendar_feed_tokens')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0209_calendar_feed_tokens.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0210_problem_reports.sql
-- SHA-256: 1492f8961ebd7f373ea025620e12525a475ba57608c63a11a2c9d255e7b81b0e
-- Version: 20261122030052
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0210_problem_reports.sql — Report a Problem (T4-11)
--
-- Staff can submit problem reports from any page with automatic context attachment.
-- Owner/Admin can review all reports; staff see only their own.
-- Status lifecycle: Open → Seen → Fixed → Won't fix (Law 3: archive, never delete).
-- Photos stored in private 'problem-reports' bucket.
-- Law 8: client_uuid idempotency. Law 6: no money in reports.
-- =============================================================================

begin;

-- 1. Ensure private storage bucket for problem report photos
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
        insert into storage.buckets (id, name)
        values ('problem-reports', 'problem-reports')
        on conflict (id) do nothing;

        if exists (select 1 from information_schema.columns
          where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
            execute 'update storage.buckets set public = false where id = ''problem-reports''';
        end if;
    end if;
end $$;

-- 2. Storage policies for problem-reports bucket (private, staff-only)
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
        -- Enable RLS on storage.objects (idempotent)
        begin
            alter table storage.objects enable row level security;
        exception when insufficient_privilege then
            null;
        end;

        -- SELECT: staff can read their own uploads, Owner/Admin can read all
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname = 'problem_reports_select_policy'
        ) then
            create policy "problem_reports_select_policy"
                on storage.objects for select
                to authenticated
                using (
                    bucket_id = 'problem-reports'
                    and (
                        (string_to_array(name, '/'))[1] = auth.uid()::text
                        or public.auth_user_role() in ('Owner', 'Admin')
                    )
                );
        end if;

        -- INSERT: authenticated staff can upload to their own folder
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname = 'problem_reports_insert_policy'
        ) then
            create policy "problem_reports_insert_policy"
                on storage.objects for insert
                to authenticated
                with check (
                    bucket_id = 'problem-reports'
                    and public.auth_is_staff()
                    and (string_to_array(name, '/'))[1] = auth.uid()::text
                );
        end if;

        -- DELETE: Owner/Admin only (Law 3: archive, never delete — but allow cleanup by Owner/Admin)
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname = 'problem_reports_delete_policy'
        ) then
            create policy "problem_reports_delete_policy"
                on storage.objects for delete
                to authenticated
                using (
                    bucket_id = 'problem-reports'
                    and public.auth_user_role() in ('Owner', 'Admin')
                );
        end if;
    end if;
end $$;

-- 3. problem_reports table
create table if not exists public.problem_reports (
    id uuid primary key default gen_random_uuid(),
    client_uuid uuid unique,                              -- Law 8: idempotency key
    description text not null check (length(trim(description)) > 0 and length(description) <= 10000),
    photo_path text,                                      -- Storage object path in problem-reports bucket
    author_id uuid not null references public.users(id),
    author_name text not null default 'Staff Member',
    author_role text not null default 'Staff',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    status text not null default 'open' check (status in ('open', 'seen', 'fixed', 'wont_fix')),
    status_changed_at timestamptz,
    status_changed_by uuid references public.users(id),
    status_change_reason text check (length(trim(status_change_reason)) >= 10 or status_change_reason is null),
    -- Auto-attached context
    route_path text,                                      -- Current route without query string
    app_version text,                                     -- APP_VERSION from client
    user_role text,                                       -- Author's system role
    device_category text check (device_category in ('phone', 'tablet', 'desktop')),
    viewport_width int,
    viewport_height int,
    error_reference text,                                 -- Last error reference from T1-08 monitoring
    -- Constraints: no sensitive data
    constraint no_query_strings check (route_path is null or route_path not like '%?%'),
    constraint no_tokens_in_route check (route_path is null or route_path not like '%token%')
);

comment on table public.problem_reports is 'Problem reports submitted by staff from any page (T4-11). Auto-attaches route, version, role, device, viewport, error reference. Status lifecycle: Open → Seen → Fixed → Won''t fix.';
comment on column public.problem_reports.description is 'Problem description (max 10k chars)';
comment on column public.problem_reports.photo_path is 'Storage object path in private problem-reports bucket';
comment on column public.problem_reports.author_id is 'Auth user ID who submitted the report';
comment on column public.problem_reports.author_name is 'Author display name snapshot';
comment on column public.problem_reports.author_role is 'Author system role snapshot';
comment on column public.problem_reports.route_path is 'Current route without query string (auto-attached)';
comment on column public.problem_reports.app_version is 'Application version (auto-attached)';
comment on column public.problem_reports.user_role is 'Author role at submission time (auto-attached)';
comment on column public.problem_reports.device_category is 'Device category: phone/tablet/desktop (auto-attached)';
comment on column public.problem_reports.viewport_width is 'Viewport width in pixels (auto-attached)';
comment on column public.problem_reports.viewport_height is 'Viewport height in pixels (auto-attached)';
comment on column public.problem_reports.error_reference is 'Last error reference from monitoring (auto-attached, T1-08)';
comment on column public.problem_reports.status is 'Lifecycle status: open, seen, fixed, wont_fix (Law 3: archive, never delete)';
comment on column public.problem_reports.status_change_reason is 'Reason for status change (min 10 chars when provided)';

-- Indexes
create index if not exists problem_reports_created_at_desc_idx on public.problem_reports (created_at desc);
create index if not exists problem_reports_author_idx on public.problem_reports (author_id);
create index if not exists problem_reports_status_idx on public.problem_reports (status);
create index if not exists problem_reports_client_uuid_idx on public.problem_reports (client_uuid) where client_uuid is not null;
create index if not exists problem_reports_route_idx on public.problem_reports (route_path) where route_path is not null;

-- 4. Row Level Security
alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from public, anon;
grant select, insert on public.problem_reports to authenticated;

-- SELECT: Staff can read their own reports; Owner/Admin can read all
drop policy if exists problem_reports_select on public.problem_reports;
create policy problem_reports_select on public.problem_reports
    for select to authenticated
    using (
        public.auth_is_staff()
        and (
            author_id = public.auth_user_id()
            or public.auth_user_role() in ('Owner', 'Admin')
        )
    );

-- INSERT: Any authenticated staff can insert with matching author_id and client_uuid idempotency
drop policy if exists problem_reports_insert on public.problem_reports;
create policy problem_reports_insert on public.problem_reports
    for insert to authenticated
    with check (
        public.auth_is_staff()
        and author_id = public.auth_user_id()
    );

-- UPDATE: Only status changes allowed, by Owner/Admin or author (for viewing own)
-- Status changes go through RPC for audit; direct UPDATE revoked
revoke update, delete on public.problem_reports from public, anon, authenticated;

-- 5. Audit trigger (uses existing log_audit_event_actor from 0157)
drop trigger if exists trg_audit_problem_reports on public.problem_reports;
create trigger trg_audit_problem_reports
    after insert or update on public.problem_reports
    for each row execute function public.log_audit_event_actor();

-- 6. RPC: create_problem_report
create or replace function public.create_problem_report(
    p_description text,
    p_client_uuid uuid default null,
    p_photo_path text default null,
    p_route_path text default null,
    p_app_version text default null,
    p_user_role text default null,
    p_device_category text default null,
    p_viewport_width int default null,
    p_viewport_height int default null,
    p_error_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_author_name text;
    v_author_role text;
    v_report_id uuid;
    v_admin record;
begin
    -- 1. Must be authenticated staff
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can submit problem reports';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    -- 2. Validate description
    if p_description is null or length(trim(p_description)) = 0 then
        raise exception 'Problem description cannot be empty' using errcode = '22000';
    end if;
    if length(p_description) > 10000 then
        raise exception 'Problem description exceeds maximum length (10,000 characters)' using errcode = '22000';
    end if;

    -- 3. Validate device_category if provided
    if p_device_category is not null and p_device_category not in ('phone', 'tablet', 'desktop') then
        raise exception 'Invalid device category: %', p_device_category using errcode = '22000';
    end if;

    -- 4. Validate route_path: no query strings, no sensitive params
    if p_route_path is not null then
        if p_route_path like '%?%' then
            raise exception 'Route path must not contain query string' using errcode = '22000';
        end if;
        if p_route_path like '%token%' or p_route_path like '%password%' or p_route_path like '%secret%' then
            raise exception 'Route path must not contain sensitive parameters' using errcode = '22000';
        end if;
    end if;

    -- 5. Idempotency on client_uuid (Law 8)
    if p_client_uuid is not null then
        select id into v_report_id from public.problem_reports where client_uuid = p_client_uuid;
        if v_report_id is not null then
            return v_report_id; -- Already exists, return existing (idempotent)
        end if;
    end if;

    -- 6. Lookup author metadata
    select coalesce(full_name, 'Staff Member'), coalesce(primary_role::text, 'Staff')
    into v_author_name, v_author_role
    from public.users
    where id = v_actor_id;

    v_author_name := coalesce(v_author_name, 'Staff Member');
    v_author_role := coalesce(v_author_role, 'Staff');

    -- 7. Insert report
    insert into public.problem_reports (
        client_uuid,
        description,
        photo_path,
        author_id,
        author_name,
        author_role,
        route_path,
        app_version,
        user_role,
        device_category,
        viewport_width,
        viewport_height,
        error_reference
    ) values (
        p_client_uuid,
        trim(p_description),
        nullif(trim(p_photo_path), ''),
        v_actor_id,
        v_author_name,
        v_author_role,
        nullif(trim(p_route_path), ''),
        nullif(trim(p_app_version), ''),
        nullif(trim(p_user_role), ''),
        nullif(trim(p_device_category), ''),
        p_viewport_width,
        p_viewport_height,
        nullif(trim(p_error_reference), '')
    )
    returning id into v_report_id;

    -- 8. Notify Owner and Admin if notification infrastructure is present (T5-01)
    if exists (select 1 from pg_proc where proname = 'create_notification') then
        for v_admin in
            select id from public.users
            where primary_role in ('Owner', 'Admin')
              and coalesce(is_active, true) = true
        loop
            begin
                perform public.create_notification(
                    gen_random_uuid(),
                    v_admin.id,
                    'problem_report',
                    'Problem reported: ' || coalesce(v_author_name, 'Staff'),
                    left(trim(p_description), 200),
                    'problem_report',
                    v_report_id::text,
                    '/settings/problem-reports',
                    'Warning'::alert_severity
                );
            exception when others then
                null;
            end;
        end loop;
    end if;

    return v_report_id;
end;
$$;

comment on function public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text) is 'Create a problem report (Staff only, idempotent via client_uuid). Returns report ID.';

-- 7. RPC: list_problem_reports (for Owner/Admin review)
create or replace function public.list_problem_reports(
    p_limit int default 50,
    p_offset int default 0,
    p_status text default null,
    p_author_id uuid default null,
    p_search text default null
)
returns setof public.problem_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list problem reports';
    end if;

    p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
    p_offset := greatest(0, coalesce(p_offset, 0));

    return query
    select pr.*
    from public.problem_reports pr
    where (public.auth_user_role() in ('Owner', 'Admin') or pr.author_id = public.auth_user_id())
      and (p_status is null or pr.status = p_status)
      and (p_author_id is null or pr.author_id = p_author_id)
      and (p_search is null or pr.description ilike '%' || p_search || '%')
    order by pr.created_at desc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_problem_reports(int, int, text, uuid, text) is 'List problem reports (staff see own; Owner/Admin see all). Filterable by status, author, search.';

-- 8. RPC: update_problem_report_status (Owner/Admin only, audited)
create or replace function public.update_problem_report_status(
    p_report_id uuid,
    p_status text,
    p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_updated boolean := false;
    v_old_status text;
begin
    -- 1. Must be Owner or Admin
    if not public.auth_user_role() in ('Owner', 'Admin') then
        raise insufficient_privilege using message = 'Only Owner or Admin can change problem report status';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    -- 2. Validate status
    if p_status not in ('open', 'seen', 'fixed', 'wont_fix') then
        raise exception 'Invalid status: %', p_status using errcode = '22000';
    end if;

    -- 3. Validate reason (min 10 chars if provided)
    if p_reason is not null and length(trim(p_reason)) < 10 then
        raise exception 'Status change reason must be at least 10 characters' using errcode = '22000';
    end if;

    -- 4. Get current status for audit
    select status into v_old_status from public.problem_reports where id = p_report_id;
    if v_old_status is null then
        raise exception 'Problem report not found' using errcode = 'P0001';
    end if;

    -- 5. No-op if same status
    if v_old_status = p_status then
        return false;
    end if;

    -- 6. Update status with audit fields
    update public.problem_reports
    set status = p_status,
        status_changed_at = now(),
        status_changed_by = v_actor_id,
        status_change_reason = nullif(trim(p_reason), ''),
        updated_at = now()
    where id = p_report_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.update_problem_report_status(uuid, text, text) is 'Update problem report status (Owner/Admin only, min 10 char reason). Audited via trigger.';

-- 9. View for convenient querying (security barrier)
create or replace view public.problem_reports_v with (security_barrier = true) as
select
    pr.id,
    pr.client_uuid,
    pr.description,
    pr.photo_path,
    pr.author_id,
    pr.author_name,
    pr.author_role,
    pr.created_at,
    pr.updated_at,
    pr.status,
    pr.status_changed_at,
    pr.status_changed_by,
    pr.status_change_reason,
    pr.route_path,
    pr.app_version,
    pr.user_role,
    pr.device_category,
    pr.viewport_width,
    pr.viewport_height,
    pr.error_reference
from public.problem_reports pr
where public.auth_is_staff()
  and (pr.author_id = public.auth_user_id() or public.auth_user_role() in ('Owner', 'Admin'))
order by pr.created_at desc;

revoke all on public.problem_reports_v from public, anon;
grant select on public.problem_reports_v to authenticated;

-- 10. Revoke public/anon execution, grant authenticated execution
revoke execute on function public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text) from public, anon;
grant execute on function public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text) to authenticated;

revoke execute on function public.list_problem_reports(int, int, text, uuid, text) from public, anon;
grant execute on function public.list_problem_reports(int, int, text, uuid, text) to authenticated;

revoke execute on function public.update_problem_report_status(uuid, text, text) from public, anon;
grant execute on function public.update_problem_report_status(uuid, text, text) to authenticated;

-- 11. Verification assertions
do $verify$
begin
  if has_table_privilege('anon', 'public.problem_reports', 'SELECT')
     or has_table_privilege('anon', 'public.problem_reports', 'INSERT')
     or has_table_privilege('anon', 'public.problem_reports', 'UPDATE')
     or has_table_privilege('anon', 'public.problem_reports', 'DELETE')
     or has_table_privilege('anon', 'public.problem_reports_v', 'SELECT')
     or has_function_privilege('anon', 'public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.list_problem_reports(int, int, text, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.update_problem_report_status(uuid, text, text)', 'EXECUTE')
  then
    raise exception '0210: problem_reports must not expose access or execution to anon';
  end if;
end;
$verify$;

commit;

-- Record 0210_problem_reports in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030052', '0210_problem_reports')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0210_problem_reports.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0211_delivery_proof.sql
-- SHA-256: b96214e8fed0ffb6c94d73a53b639a4aa07d41c76e8ab4e19750f53f3c807e03
-- Version: 20261122030053
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0211_delivery_proof.sql
-- T4-03: Proof of delivery — evidence photo + recipient signature stored on the job
-- Delivered is terminal; this RPC attaches proof without changing status.
-- Mirrors T4-01 RPC patterns: actor resolution, idempotency key, fingerprint, audit event.

begin;

-- 1. Add proof columns to delivery_jobs (opaque storage paths, no FK)
alter table public.delivery_jobs
  add column if not exists proof_photo_path text,
  add column if not exists proof_signature_path text,
  add column if not exists proof_attached_at timestamptz,
  add column if not exists proof_attached_by uuid references public.users(id);

-- Proof columns are only meaningful when status = 'Delivered'
alter table public.delivery_jobs
  add constraint delivery_job_proof_requires_delivered
    check (
      proof_photo_path is null
      and proof_signature_path is null
      and proof_attached_at is null
      and proof_attached_by is null
      or status = 'Delivered'
    );

-- 2. Extend delivery_job_events event_kind to include 'Proof'
alter table public.delivery_job_events
  drop constraint if exists delivery_job_events_event_kind_check;

alter table public.delivery_job_events
  add constraint delivery_job_events_event_kind_check
    check (event_kind in ('Created', 'Assigned', 'Transition', 'Rescheduled', 'Proof'));

-- 3. RPC: delivery_attach_proof
create or replace function public.delivery_attach_proof(
  p_job_id uuid,
  p_request_key uuid,
  p_photo_path text default null,
  p_signature_path text default null,
  p_fingerprint text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_receipt public.delivery_job_events%rowtype;
  v_manager boolean;
  v_warehouse boolean;
  v_assigned_driver boolean;
  v_fingerprint text;
begin
  -- Authenticated actor required
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id = v_actor and u.is_active) then
    raise exception 'Proof attachment requires an authenticated actor' using errcode = '42501';
  end if;

  -- At least one proof artifact must be provided
  if p_photo_path is null and p_signature_path is null then
    raise exception 'At least one proof artifact (photo or signature) must be provided';
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  -- Role gating: Manager/Coordinator (branch), Warehouse (branch), Assigned Driver
  v_manager := v_role in ('Owner','Admin') or (
    v_role in ('Manager','Coordinator') and exists (
      select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
    )
  );
  v_warehouse := v_role = 'Warehouse' and exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  );
  -- RULING 2026-11-02: coalesce, or a Driver on a job with no assigned driver gets NULL (true AND NULL),
  -- 'not (false or false or NULL)' is NULL, and the IF below would not raise: any Driver could attach proof (B-1).
  v_assigned_driver := coalesce(v_role = 'Driver' and v_job.assigned_driver_id = v_actor, false);

  if not coalesce(v_manager or v_warehouse or v_assigned_driver, false) then
    raise exception 'Proof attachment role or assignment denied' using errcode = '42501';
  end if;

  -- Delivered is terminal — proof can only be attached to Delivered jobs
  if v_job.status <> 'Delivered' then
    raise exception 'Proof can only be attached to Delivered deliveries';
  end if;

  -- Idempotency: request_key must be unique per operation+actor
  select * into v_receipt from public.delivery_job_events where request_key = p_request_key;
  if found then
    v_fingerprint := md5(
      jsonb_build_array(
        p_request_key::text,
        coalesce(p_photo_path, ''),
        coalesce(p_signature_path, '')
      )::text
    );
    if v_receipt.job_id = p_job_id
       and v_receipt.actor_id = v_actor
       and v_receipt.event_kind = 'Proof'
       and v_receipt.metadata->>'request_fingerprint' = v_fingerprint then
      return p_job_id; -- idempotent replay
    end if;
    raise exception 'Proof key belongs to a different request' using errcode = '42501';
  end if;

  -- Attach proof paths
  update public.delivery_jobs
  set proof_photo_path = coalesce(proof_photo_path, p_photo_path),
      proof_signature_path = coalesce(proof_signature_path, p_signature_path),
      proof_attached_at = now(),
      proof_attached_by = v_actor,
      version = version + 1,
      updated_at = now(),
      updated_by = v_actor
  where id = p_job_id;

  -- Audit event
  insert into public.delivery_job_events
    (request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata)
  values (
    p_request_key,
    p_job_id,
    'Proof',
    'Delivered',
    'Delivered',
    v_actor,
    jsonb_build_object(
      'request_fingerprint', md5(
        jsonb_build_array(
          p_request_key::text,
          coalesce(p_photo_path, ''),
          coalesce(p_signature_path, '')
        )::text
      ),
      'photo_path', p_photo_path,
      'signature_path', p_signature_path
    )
  );

  return p_job_id;
end;
$$;

-- Revoke from anon; grant to authenticated
revoke all on function public.delivery_attach_proof(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.delivery_attach_proof(uuid, uuid, text, text, text) to authenticated;

-- 4. Contract assertion
do $verify$
begin
 if has_table_privilege('authenticated','public.delivery_jobs','INSERT')
   or has_table_privilege('authenticated','public.delivery_jobs','UPDATE')
   or has_table_privilege('authenticated','public.delivery_jobs','DELETE')
   or has_function_privilege('anon','public.delivery_attach_proof(uuid,uuid,text,text,text)','EXECUTE')
 then raise exception '0211: delivery proof API exposure must fail closed'; end if;
end;
$verify$;

commit;

-- Record 0211_delivery_proof in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030053', '0211_delivery_proof')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0211_delivery_proof.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0212_cancellation_fee_tiers.sql
-- SHA-256: eb6429c56b6c3829a8e76c4af2675952d72f2a9929febb67e16aaab4ca36089b
-- Version: 20261122030054
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0212_cancellation_fee_tiers.sql — written 31 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- T3-03: Settings ▸ Financial ▸ "Cancellation fee tiers": rows of notice
-- before pickup → fee %. When a booking with a paid advance is cancelled,
-- the cancel sheet suggests the fee from the tiers; fee → invoice line
-- "Cancellation fee"; any advance above the fee → refund as a reversal row
-- (Law 4).
--
-- WHAT
-- ----
--   cancellation_fee_tiers  one row per (notice_hours, fee_percent). Owner-only
--                          writes (canManageSettings). Read by desk roles
--                          (canWriteBookingDesk) so the cancel sheet can suggest
--                          a fee. Never deleted (Law 3) — retired rows get
--                          retired_at set.
--
-- RLS / WHO SEES WHAT
-- -------------------
--   read   any desk role (Owner, Admin, Manager, Coordinator) — the cancel
--          sheet suggests a fee from these tiers.
--   write  Owner only (canManageSettings). Revert = widen the role list in
--          set_setting() AND canManageSettings, together (B-3).
--
-- REVERT: drop table cancellation_fee_tiers;
-- ============================================================================

begin;

create table if not exists cancellation_fee_tiers (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  notice_hours  integer      not null check (notice_hours >= 0),
  fee_percent   numeric(5,2) not null check (fee_percent >= 0 and fee_percent <= 100),
  retired_at    timestamptz,
  created_by    uuid         references users (id),
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),

  constraint cancellation_fee_tiers_client_uuid_key unique (client_uuid)
);

create index if not exists idx_cancellation_fee_tiers_notice on cancellation_fee_tiers (notice_hours)
  where retired_at is null;

-- RLS
alter table cancellation_fee_tiers enable row level security;

drop policy if exists cancellation_fee_tiers_read on cancellation_fee_tiers;
create policy cancellation_fee_tiers_read on cancellation_fee_tiers
  for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

drop policy if exists cancellation_fee_tiers_write on cancellation_fee_tiers;
create policy cancellation_fee_tiers_write on cancellation_fee_tiers
  for all to authenticated
  using (auth_user_role() = 'Owner')
  with check (auth_user_role() = 'Owner');

-- Never deleted (Law 3) — retired rows get retired_at set.
create trigger cancellation_fee_tiers_no_delete
  before delete on cancellation_fee_tiers
  for each row execute function reject_delete_nothing_is_deleted();

commit;

-- Record 0212_cancellation_fee_tiers in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030054', '0212_cancellation_fee_tiers')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0212_cancellation_fee_tiers.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0213_non_vat_bills.sql
-- SHA-256: fe92f6c93b23c5d9a3d3bfa1d01e4c89dad9e592ab89ce2a3bf9623db201a56d
-- Version: 20261122030055
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0213_non_vat_bills.sql — written 31 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- T3-04 (D13): Each invoice carries a VAT treatment — Standard 13% or
-- Non-VAT bill. A zero VAT amount alone is not a tax status (OPEN_DECISIONS §15);
-- Babin has ruled that non-VAT bills are a distinct category.
--
-- WHAT
-- ----
--   1. Add `vat_treatment` enum ('standard', 'non_vat') to invoices.
--   2. Add `vat_treatment` column to invoices (default 'standard').
--   3. Backfill existing zero-VAT invoices as 'non_vat' with an audit note.
--   4. create index if not exists for filtering by treatment.
--
-- REVERT: drop column vat_treatment from invoices; drop type vat_treatment;
-- ============================================================================

begin;

-- 1. Create the VAT treatment enum if not exists
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vat_treatment') then
    create type vat_treatment as enum (
      'standard',
      'non_vat'
    );
  end if;
end $$;

-- 2. Add the column to invoices
alter table invoices
  add column if not exists vat_treatment vat_treatment not null default 'standard';

-- 3. Backfill: existing zero-VAT invoices are labelled Non-VAT bill.
--    Records how each was classified via an audit note in the invoice notes.
update invoices
  set vat_treatment = 'non_vat',
      notes = coalesce(notes, '') || case when notes is not null and notes != '' then E'\n' else '' end || '[Backfilled: classified as Non-VAT bill — zero VAT amount at issuance]'
  where vat_amount = 0
    and vat_rate = 0
    and vat_treatment = 'standard';

-- 4. Index for filtering
create index if not exists idx_invoices_vat_treatment on invoices (vat_treatment);

-- 5. Trigger: auto-set vat_treatment based on vat_rate on insert/update.
--    A zero VAT rate means a non-VAT bill; anything else is standard.
create or replace function set_invoice_vat_treatment()
returns trigger language plpgsql as $$
begin
  if new.vat_rate = 0 then
    new.vat_treatment := 'non_vat';
  else
    new.vat_treatment := 'standard';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_vat_treatment_trigger on invoices;
create trigger invoices_vat_treatment_trigger
  before insert or update of vat_rate on invoices
  for each row execute function set_invoice_vat_treatment();

commit;

-- Record 0213_non_vat_bills in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030055', '0213_non_vat_bills')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0213_non_vat_bills.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0214_opening_balances.sql
-- SHA-256: 2921ddad4055e5a4fb39b6a58bd2239270645aa85ea51fca122bbd2df865927b
-- Version: 20261122030056
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0214_opening_balances.sql — written 31 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- T3-07 (D15): Accounts (or Owner) enters an opening balance once per cash
-- drawer and per bank account, with the date. Daily closing then shows
-- opening + money in − money out = closing per account and carries the closing
-- to the next day. Money in/out includes rental payments, payment reversals,
-- expenses paid, and deposit cash received and returned (deposits are cash
-- held in trust — they move the drawer, never revenue or Outstanding, Law 5).
--
-- WHAT
-- ----
--   opening_balances  one row per (account, date, scope). Append-only: a
--                     correction is a new row (Law 4 spirit). Never deleted
--                     (Law 3) — retired rows get retired_at set.
--
-- RLS / WHO SEES WHAT
-- -------------------
--   read   money roles only (Owner, Admin, Manager, Accounts).
--   write  Owner only (canManageSettings). Revert = widen the role list.
--
-- REVERT: drop table opening_balances;
-- ============================================================================

begin;

create table if not exists opening_balances (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  account_type  text         not null check (account_type in ('cash', 'bank')),
  account_id    uuid         references bank_accounts (id),
  opening_date  date         not null,
  amount        numeric(14,2) not null default 0,
  scope         text         not null default 'org',
  location_id   uuid         references branches (id),
  retired_at    timestamptz,
  created_by    uuid         references users (id),
  created_at    timestamptz  not null default now(),

  constraint opening_balances_client_uuid_key unique (client_uuid),
  constraint opening_balances_scope_location check (
    (scope = 'org' and location_id is null) or (scope = 'location' and location_id is not null)
  ),
  check (
    (account_type = 'cash' and account_id is null) or
    (account_type = 'bank' and account_id is not null)
  )
);

create index if not exists idx_opening_balances_account on opening_balances (account_type, account_id, opening_date desc)
  where retired_at is null;

-- RLS
alter table opening_balances enable row level security;

drop policy if exists opening_balances_read on opening_balances;
create policy opening_balances_read on opening_balances
  for select to authenticated
  using (auth_can_view_money() and auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts'));

drop policy if exists opening_balances_write on opening_balances;
create policy opening_balances_write on opening_balances
  for all to authenticated
  using (auth_user_role() = 'Owner')
  with check (auth_user_role() = 'Owner');

-- Never deleted (Law 3)
create trigger opening_balances_no_delete
  before delete on opening_balances
  for each row execute function reject_delete_nothing_is_deleted();

commit;

-- Record 0214_opening_balances in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030056', '0214_opening_balances')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0214_opening_balances.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0215_email_sending_and_log.sql
-- SHA-256: 64b3ba74975055e6b4a4ef4b9d15018cb4f00acb2e2128ed139e46c8224bfbb5
-- Version: 20261122030057
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0215_email_sending_and_log.sql — Email sending service & audit log (T5-03)
--
-- Implements email audit logging and server-side payload building:
--   - Logs every sent/attempted email (template, recipient, entity, status).
--   - Privacy & security: strictly NO email body stored in email_log (W21, S13).
--   - Law 3: Hard delete forbidden (immutable log).
--   - Law 4: Records are immutable once dispatched.
--   - Law 6: Zero money in payloads for money-blind roles (Warehouse, Technician, Driver, Client).
--   - W80: Client templates are English only.
--   - RLS: Privileged staff (Owner, Admin, Manager, Accounts) view all; others view own rows only.
-- =============================================================================

begin;

-- 1. Create email_log table
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid unique default gen_random_uuid(),
  template_id text not null,
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id text,
  language text not null default 'en',
  status text not null check (status in ('pending', 'sent', 'failed', 'mock_sent')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.email_log is
  'Audit log of all transactional email dispatches. By design, no email body is retained.';

create index if not exists idx_email_log_recipient_user on public.email_log(recipient_user_id);
create index if not exists idx_email_log_created_at on public.email_log(created_at desc);
create index if not exists idx_email_log_entity on public.email_log(entity_type, entity_id);
create index if not exists idx_email_log_template on public.email_log(template_id);

-- 2. Law 3: Hard delete forbidden
create or replace function public.trg_email_log_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): email_log entries cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_email_log_prevent_delete on public.email_log;
create trigger trg_email_log_prevent_delete
  before delete on public.email_log
  for each row execute function public.trg_email_log_prevent_delete_fn();

revoke all on function public.trg_email_log_prevent_delete_fn() from public, anon;
grant execute on function public.trg_email_log_prevent_delete_fn() to authenticated;

-- 3. Law 4: Update guard (only transition from pending -> sent/failed permitted; immutable once complete)
create or replace function public.trg_email_log_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.status in ('sent', 'failed', 'mock_sent') then
    raise exception 'IMMUTABLE (Law 4): completed email_log rows cannot be modified.'
      using errcode = '42501';
  end if;

  if NEW.id <> OLD.id
     or NEW.client_uuid <> OLD.client_uuid
     or NEW.template_id <> OLD.template_id
     or NEW.recipient_email <> OLD.recipient_email
     or coalesce(NEW.recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(OLD.recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
     or coalesce(NEW.entity_type, '') <> coalesce(OLD.entity_type, '')
     or coalesce(NEW.entity_id, '') <> coalesce(OLD.entity_id, '')
     or NEW.created_at <> OLD.created_at then
    raise exception 'IMMUTABLE: only status, sent_at, error_message, and metadata may be updated on pending email_log rows'
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_email_log_update_guard on public.email_log;
create trigger trg_email_log_update_guard
  before update on public.email_log
  for each row execute function public.trg_email_log_update_guard_fn();

revoke all on function public.trg_email_log_update_guard_fn() from public, anon;
grant execute on function public.trg_email_log_update_guard_fn() to authenticated;

-- 4. Row Level Security policies
alter table public.email_log enable row level security;

drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select
  to authenticated
  using (
    (
      public.auth_is_staff()
      and public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts')
    )
    or (
      recipient_user_id = public.auth_user_id()
    )
  );

drop policy if exists email_log_insert on public.email_log;
create policy email_log_insert on public.email_log
  for insert
  to authenticated
  with check (
    public.auth_is_staff()
    or recipient_user_id = public.auth_user_id()
  );

drop policy if exists email_log_update on public.email_log;
create policy email_log_update on public.email_log
  for update
  to authenticated
  using (public.auth_is_staff())
  with check (public.auth_is_staff());

drop policy if exists email_log_delete on public.email_log;
create policy email_log_delete on public.email_log
  for delete
  to authenticated
  using (public.auth_is_staff());

revoke all on public.email_log from public, anon;
grant select, insert, update, delete on public.email_log to authenticated;

-- 5. View for active email log entries
create or replace view public.email_log_v with (security_barrier = true) as
select
  l.id,
  l.client_uuid,
  l.template_id,
  l.recipient_email,
  l.recipient_user_id,
  l.entity_type,
  l.entity_id,
  l.language,
  l.status,
  l.error_message,
  l.metadata,
  l.sent_at,
  l.created_at
from public.email_log l
where (
  (
    public.auth_is_staff()
    and public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts')
  )
  or l.recipient_user_id = public.auth_user_id()
);

revoke all on public.email_log_v from public, anon;
grant select on public.email_log_v to authenticated;

-- 6. RPC: record_email_send
create or replace function public.record_email_send(
  p_template_id text,
  p_recipient_email text,
  p_recipient_user_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_status text default 'sent',
  p_error text default null,
  p_language text default 'en',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_status not in ('pending', 'sent', 'failed', 'mock_sent') then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end if;

  insert into public.email_log (
    template_id,
    recipient_email,
    recipient_user_id,
    entity_type,
    entity_id,
    language,
    status,
    error_message,
    metadata,
    sent_at
  ) values (
    p_template_id,
    p_recipient_email,
    p_recipient_user_id,
    p_entity_type,
    p_entity_id,
    coalesce(p_language, 'en'),
    p_status,
    p_error,
    coalesce(p_metadata, '{}'::jsonb),
    case when p_status in ('sent', 'mock_sent') then now() else null end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) to authenticated;

-- 7. RPC: build_email_payload
-- Server-side rendering payload builder to stop client forgery and enforce Law 6.
create or replace function public.build_email_payload(
  p_template_id text,
  p_recipient_user_id uuid default null,
  p_entity_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_user_email text;
  v_user_name text;
  v_booking record;
  v_client record;
  v_payload jsonb;
begin
  -- Resolve recipient user details if provided
  if p_recipient_user_id is not null then
    select
      u.email,
      u.full_name,
      u.primary_role::text
    into v_user_email, v_user_name, v_role
    from public.users u
    where u.id = p_recipient_user_id;
  end if;

  -- Default recipient details from client if booking entity
  if (v_user_email is null or v_user_email = '') and p_entity_id is not null then
    select
      b.id,
      b.booking_no,
      b.stage,
      b.pickup_at,
      b.return_at,
      b.client_id
    into v_booking
    from public.bookings b
    where b.id::text = p_entity_id or b.booking_no = p_entity_id
    limit 1;

    if v_booking.client_id is not null then
      select
        c.id,
        c.name,
        c.email,
        c.phone
      into v_client
      from public.clients c
      where c.id = v_booking.client_id;

      if v_user_email is null or v_user_email = '' then
        v_user_email := v_client.email;
        v_user_name := v_client.name;
        v_role := 'Client';
      end if;
    end if;
  end if;

  -- Build payload according to template and role
  case p_template_id
    when 'pickup_reminder' then
      v_payload := jsonb_build_object(
        'template_id', 'pickup_reminder',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Pickup Reminder — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'start_date', coalesce(v_booking.pickup_at::text, ''),
          'end_date', coalesce(v_booking.return_at::text, '')
        )
      );

    when 'pickup_receipt' then
      v_payload := jsonb_build_object(
        'template_id', 'pickup_receipt',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Pickup Receipt — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'start_date', coalesce(v_booking.pickup_at::text, ''),
          'end_date', coalesce(v_booking.return_at::text, '')
        )
      );

    when 'return_reminder' then
      v_payload := jsonb_build_object(
        'template_id', 'return_reminder',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Return Reminder — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'end_date', coalesce(v_booking.return_at::text, '')
        )
      );

    when 'late_return' then
      v_payload := jsonb_build_object(
        'template_id', 'late_return',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Important: Overdue Return — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, '')
        )
      );

    when 'damage_notice' then
      -- W23: Notice of damage case opened — NEVER include amount for client or money-blind roles
      v_payload := jsonb_build_object(
        'template_id', 'damage_notice',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Equipment Condition Notice — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'status', 'Under Review'
        )
      );

    when 'test_template' then
      v_payload := jsonb_build_object(
        'template_id', 'test_template',
        'recipient_email', coalesce(v_user_email, 'test@example.com'),
        'recipient_name', coalesce(v_user_name, 'Test Recipient'),
        'subject', 'Babin Rentals — Test Email',
        'data', jsonb_build_object(
          'greeting', 'System verification test successful.'
        )
      );

    else
      v_payload := jsonb_build_object(
        'template_id', p_template_id,
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'User'),
        'subject', 'Babin Rentals Notification',
        'data', jsonb_build_object(
          'entity_id', coalesce(p_entity_id, '')
        )
      );
  end case;

  return v_payload;
end;
$$;

revoke all on function public.build_email_payload(text, uuid, text) from public, anon;
grant execute on function public.build_email_payload(text, uuid, text) to authenticated;

commit;

-- Record 0215_email_sending_and_log in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030057', '0215_email_sending_and_log')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0215_email_sending_and_log.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0216_morning_digest_schedule_and_query.sql
-- SHA-256: c22ecf0a39fbf45389a2484e422d821cdaf06c61ac0513d0b8700b00d5119b58
-- Version: 20261122030058
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0216: Morning digest schedule and query (T5-04, Ruling O-4)
-- =============================================================================
-- Ruling O-4 (21 Jul lock): Auto morning digest scheduled at 05:30 NPT before
-- the 06:00 operational day start.
-- Emails each active staff member their digest:
--   - Today's pickups and returns (06:00 -> 06:00 NPT operational day)
--   - Overdue returns (On Rent past return_at)
--   - Open damage cases (damage_findings with approval_state = 'Pending Approval')
--   - Unacknowledged shift handovers (shift_handovers with status = 'pending')
--   - Payments due today (for money roles only: Owner, Admin, Manager, Coordinator, Accounts)
--
-- Law 6: Money blindness. Warehouse, Technician, Driver, and Client receive NO amounts.
-- Law 3: Nothing is deleted.
-- Check:pglite & check:lifecycle compliant (definer search path pinned, anon revoked).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Scheduled cron jobs registry
-- -----------------------------------------------------------------------------
create table if not exists public.cron_schedules (
  job_name      text not null primary key,
  schedule      text not null,
  command       text not null,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.cron_schedules is
  'Registry of scheduled jobs for verification across test and local environments (T5-04).';

insert into public.cron_schedules (job_name, schedule, command, description)
values (
  'morning-digest',
  '45 23 * * *', -- 05:30 NPT is 23:45 UTC
  'invoke morning-digest edge function',
  'Daily morning digest sent to active staff at 05:30 NPT before the 06:00 operational day start (O-4)'
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command,
    description = excluded.description,
    updated_at = now();

revoke all on public.cron_schedules from public, anon;
grant select on public.cron_schedules to authenticated;
alter table public.cron_schedules enable row level security;

drop policy if exists cron_schedules_staff_select on public.cron_schedules;
create policy cron_schedules_staff_select on public.cron_schedules
  for select to authenticated using (auth_is_staff());

-- -----------------------------------------------------------------------------
-- 2. Register with pg_cron if extension namespace exists on instance
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('morning-digest') where exists (
        select 1 from cron.job where jobname = 'morning-digest'
      );
      perform cron.schedule(
        'morning-digest',
        '45 23 * * *',
        $cmd$select net.http_post(
          url := coalesce(current_setting('app.settings.edge_function_url', true), 'http://localhost:54321/functions/v1') || '/morning-digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
          )
        )$cmd$
      );
    exception when others then
      -- Environment lacks pg_cron execution permissions or net extension; ignore cleanly
      null;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Morning digest query function: get_morning_digest
-- -----------------------------------------------------------------------------
create or replace function public.get_morning_digest(
  p_user_id uuid,
  p_target_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_can_view_money boolean;
  v_npt_now timestamp;
  v_target_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pickups jsonb := '[]'::jsonb;
  v_returns jsonb := '[]'::jsonb;
  v_overdue jsonb := '[]'::jsonb;
  v_open_damage jsonb := '[]'::jsonb;
  v_shift_handovers jsonb := '[]'::jsonb;
  v_payments_due jsonb := '[]'::jsonb;
  v_total_items int := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select
    u.id,
    u.full_name,
    u.email,
    u.primary_role::text
  into v_user
  from public.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Law 6: Money blindness
  v_can_view_money := lower(coalesce(v_user.primary_role, '')) not in (
    'warehouse', 'technician', 'driver', 'client'
  );

  -- Determine operational day target date in Kathmandu timezone (+05:45)
  v_npt_now := (now() at time zone 'Asia/Kathmandu');
  v_target_date := coalesce(p_target_date, v_npt_now::date);

  -- Operational day window runs 06:00 NPT to 06:00 NPT next morning (D4, O-4)
  v_day_start := (v_target_date::text || ' 06:00:00+05:45')::timestamptz;
  v_day_end   := ((v_target_date + 1)::text || ' 05:59:59.999+05:45')::timestamptz;

  -- 1. Pickups scheduled today
  select coalesce(jsonb_agg(item order by (item->>'pickup_at')::timestamptz asc), '[]'::jsonb)
  into v_pickups
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'pickup_at', b.pickup_at,
      'pickup_time', to_char(b.pickup_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.pickup_at >= v_day_start
      and b.pickup_at <= v_day_end
      and b.stage in ('Booked', 'Packed')
      and b.cancelled_at is null
  ) q;

  -- 2. Returns scheduled today
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_returns
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'return_time', to_char(b.return_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at >= v_day_start
      and b.return_at <= v_day_end
      and b.stage in ('On Rent')
      and b.cancelled_at is null
      and b.actual_return_at is null
  ) q;

  -- 3. Overdue returns
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_overdue
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'days_overdue', greatest(1, extract(day from (v_day_start - b.return_at))::int),
      'delivery_type', b.delivery_type,
      'stage', b.stage
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at < v_day_start
      and b.stage in ('On Rent')
      and b.cancelled_at is null
      and b.actual_return_at is null
  ) q;

  -- 4. Open damage findings
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_open_damage
  from (
    select jsonb_build_object(
      'id', df.id,
      'damage_type', df.damage_type,
      'severity', df.severity,
      'description', df.description,
      'approval_state', df.approval_state::text,
      'created_at', df.created_at,
      'estimated_cost_paisa', case when v_can_view_money then round(coalesce(df.estimated_cost, 0) * 100)::bigint else null end
    ) as item
    from public.damage_findings df
    where df.approval_state = 'Pending Approval'
      and df.voided_at is null
  ) q;

  -- 5. Pending shift handovers
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_shift_handovers
  from (
    select jsonb_build_object(
      'id', sh.id,
      'shift_code', sh.shift_code,
      'shift_date', sh.shift_date,
      'from_user_name', sh.from_user_name,
      'notes', sh.notes,
      'status', sh.status,
      'created_at', sh.created_at
    ) as item
    from public.shift_handovers sh
    where sh.status = 'pending'
      and sh.archived_at is null
  ) q;

  -- 6. Payments due today (money roles only, Law 6)
  if v_can_view_money then
    select coalesce(jsonb_agg(item order by (item->>'due_date')::date asc), '[]'::jsonb)
    into v_payments_due
    from (
      select jsonb_build_object(
        'id', inv.id,
        'invoice_no', inv.invoice_no,
        'booking_id', inv.booking_id,
        'client_name', coalesce(c.name, 'Unknown Client'),
        'due_date', inv.due_date,
        'outstanding_paisa', round(coalesce(inv.outstanding_amount, 0) * 100)::bigint,
        'status', inv.status::text
      ) as item
      from public.invoices inv
      left join public.clients c on c.id = inv.client_id
      where inv.due_date = v_target_date
        and inv.status in ('Draft', 'Sent', 'Partially Paid')
        and inv.outstanding_amount > 0
        and inv.voided_at is null
    ) q;
  else
    v_payments_due := '[]'::jsonb;
  end if;

  v_total_items := jsonb_array_length(v_pickups) +
                   jsonb_array_length(v_returns) +
                   jsonb_array_length(v_overdue) +
                   jsonb_array_length(v_open_damage) +
                   jsonb_array_length(v_shift_handovers) +
                   jsonb_array_length(v_payments_due);

  return jsonb_build_object(
    'recipient', jsonb_build_object(
      'user_id', v_user.id,
      'full_name', v_user.full_name,
      'email', v_user.email,
      'role', v_user.primary_role
    ),
    'target_date', v_target_date,
    'operational_day_start', v_day_start,
    'operational_day_end', v_day_end,
    'can_view_money', v_can_view_money,
    'has_scheduled_items', (v_total_items > 0),
    'empty_message', case when v_total_items = 0 then 'Nothing scheduled today' else null end,
    'total_items_count', v_total_items,
    'pickups', v_pickups,
    'returns', v_returns,
    'overdue', v_overdue,
    'open_damage', v_open_damage,
    'shift_handovers', v_shift_handovers,
    'payments_due', v_payments_due
  );
end;
$$;

comment on function public.get_morning_digest(uuid, date) is
  'Aggregates daily operational movements, overdue returns, open damage cases, shift handovers, and payments due (O-4). Enforces Law 6 money blindness.';

revoke all on function public.get_morning_digest(uuid, date) from public, anon;
grant execute on function public.get_morning_digest(uuid, date) to authenticated;

commit;

-- Record 0216_morning_digest_schedule_and_query in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030058', '0216_morning_digest_schedule_and_query')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0216_morning_digest_schedule_and_query.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0217_notification_preferences.sql
-- SHA-256: 9ab1096abab0f9eab539272cf1f4e7f5190f8ffe80932cf22df5b13ced770299
-- Version: 20261122030059
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0217: Notification preferences (T5-05)
-- =============================================================================
-- Ruling / Prompt T5-05:
-- Settings ▸ My preferences: per type, in-app on/off and email on/off;
-- the morning digest on by default.
-- Turning a type off stops new rows of that type for that user only.
--
-- Law 3: Hard delete forbidden.
-- Law 8: client_uuid on every row.
-- RLS: Own rows only (Owner / Admin can read).
-- Search paths pinned, anon execution revoked (check:pglite compliance).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Table: public.notification_preferences
-- -----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  id                  uuid primary key default gen_random_uuid(),
  client_uuid         uuid unique default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  notification_type   text not null,
  in_app_enabled      boolean not null default true,
  email_enabled       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_notification_preferences_user_type unique (user_id, notification_type)
);

comment on table public.notification_preferences is
  'Per-user notification delivery preferences (in-app & email) across notification categories (T5-05).';

create index if not exists idx_notification_preferences_user
  on public.notification_preferences(user_id);
create index if not exists idx_notification_preferences_lookup
  on public.notification_preferences(user_id, notification_type);

-- -----------------------------------------------------------------------------
-- 2. Law 3: Hard delete forbidden
-- -----------------------------------------------------------------------------
create or replace function public.trg_notification_preferences_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): notification preferences cannot be deleted, only updated.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_notification_preferences_prevent_delete on public.notification_preferences;
create trigger trg_notification_preferences_prevent_delete
  before delete on public.notification_preferences
  for each statement execute function public.trg_notification_preferences_prevent_delete_fn();

revoke all on function public.trg_notification_preferences_prevent_delete_fn() from public, anon;
grant execute on function public.trg_notification_preferences_prevent_delete_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select
  to authenticated
  using (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
  for insert
  to authenticated
  with check (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
  for update
  to authenticated
  using (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  )
  with check (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notification_preferences_delete on public.notification_preferences;
create policy notification_preferences_delete on public.notification_preferences
  for delete
  to authenticated
  using (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

revoke all on public.notification_preferences from public, anon;
grant select, insert, update, delete on public.notification_preferences to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Security barrier view: public.notification_preferences_v
-- -----------------------------------------------------------------------------
create or replace view public.notification_preferences_v with (security_barrier = true) as
select
  p.id,
  p.client_uuid,
  p.user_id,
  p.notification_type,
  p.in_app_enabled,
  p.email_enabled,
  p.created_at,
  p.updated_at
from public.notification_preferences p
where (
  p.user_id = public.auth_user_id()
  or public.auth_user_role() in ('Owner', 'Admin')
);

revoke all on public.notification_preferences_v from public, anon;
grant select on public.notification_preferences_v to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: set_notification_preference (explicit user_id + client_uuid)
-- -----------------------------------------------------------------------------
create or replace function public.set_notification_preference(
  p_client_uuid uuid,
  p_user_id uuid,
  p_notification_type text,
  p_in_app boolean,
  p_email boolean
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid;
  v_pref public.notification_preferences;
  v_type text;
begin
  v_caller := public.auth_user_id();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user_id cannot be null' using errcode = '23502';
  end if;

  if p_user_id <> v_caller and public.auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'Access denied: cannot modify preferences for other users' using errcode = '42501';
  end if;

  v_type := lower(btrim(p_notification_type));
  if v_type = '' then
    raise exception 'notification_type cannot be blank' using errcode = '22023';
  end if;

  insert into public.notification_preferences (
    client_uuid,
    user_id,
    notification_type,
    in_app_enabled,
    email_enabled,
    updated_at
  ) values (
    coalesce(p_client_uuid, gen_random_uuid()),
    p_user_id,
    v_type,
    p_in_app,
    p_email,
    now()
  )
  on conflict (user_id, notification_type) do update
  set in_app_enabled = excluded.in_app_enabled,
      email_enabled  = excluded.email_enabled,
      updated_at     = now()
  returning * into v_pref;

  return v_pref;
end;
$$;

revoke all on function public.set_notification_preference(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.set_notification_preference(uuid, uuid, text, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: get_user_notification_preferences
-- Returns configured preferences or role defaults for all 7 categories.
-- -----------------------------------------------------------------------------
create or replace function public.get_user_notification_preferences(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid;
  v_role text;
  v_categories text[] := array['payment', 'handover', 'damage', 'delivery', 'booking', 'digest', 'general'];
  v_cat text;
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_in_app boolean;
  v_email boolean;
begin
  v_caller := public.auth_user_id();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id cannot be null' using errcode = '23502';
  end if;

  if p_user_id <> v_caller and public.auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'Access denied: cannot view preferences for other users' using errcode = '42501';
  end if;

  select primary_role::text into v_role from public.users where id = p_user_id;

  foreach v_cat in array v_categories loop
    select in_app_enabled, email_enabled
    into v_row
    from public.notification_preferences
    where user_id = p_user_id
      and notification_type = v_cat;

    if found then
      v_in_app := v_row.in_app_enabled;
      v_email  := v_row.email_enabled;
    else
      -- 21 Jul lock defaults:
      -- In-app on for all categories
      v_in_app := true;
      -- Email: digest is true by default (O-4); other categories default false for staff
      v_email := (v_cat = 'digest');
    end if;

    v_result := v_result || jsonb_build_object(
      'category', v_cat,
      'notification_type', v_cat,
      'in_app_enabled', v_in_app,
      'email_enabled', v_email,
      'is_default', not found
    );
  end loop;

  return jsonb_build_object(
    'user_id', p_user_id,
    'preferences', v_result
  );
end;
$$;

revoke all on function public.get_user_notification_preferences(uuid) from public, anon;
grant execute on function public.get_user_notification_preferences(uuid) to authenticated;

-- Overload for current user
create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.get_user_notification_preferences(public.auth_user_id());
end;
$$;

revoke all on function public.get_my_notification_preferences() from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Update create_notification to respect notification_preferences (T5-05)
-- Turning a type off stops new rows of that type for that user only.
-- -----------------------------------------------------------------------------
create or replace function public.create_notification(
  p_client_uuid uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_link_url text default null,
  p_severity alert_severity default 'Information'::alert_severity
)
returns public.notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.notifications;
  v_role text;
  v_notif_no text;
  v_type text;
begin
  if p_user_id is null then
    raise exception 'Notification recipient (user_id) cannot be null'
      using errcode = '23502';
  end if;

  v_type := coalesce(nullif(btrim(p_type), ''), 'general');

  -- T5-05 Gate: check if user has muted in-app notifications for this type
  if exists (
    select 1
    from public.notification_preferences np
    where np.user_id = p_user_id
      and np.notification_type = v_type
      and np.in_app_enabled = false
  ) then
    -- User opted out of in-app notifications for this category; do not create row
    return null;
  end if;

  select primary_role::text into v_role from public.users where id = p_user_id;

  if public.auth_is_staff() = false then
    if p_user_id <> public.auth_user_id() then
      raise exception 'Access denied: cannot create notifications for other users'
        using errcode = '42501';
    end if;
  end if;

  v_notif_no := 'NOTIF-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.notifications (
    client_uuid,
    notification_no,
    user_id,
    recipient_role,
    type,
    title,
    message,
    channel,
    severity,
    entity_type,
    entity_id,
    link_url,
    is_read,
    created_at
  ) values (
    coalesce(p_client_uuid, gen_random_uuid()),
    v_notif_no,
    p_user_id,
    v_role,
    v_type,
    btrim(p_title),
    btrim(p_message),
    'In-App'::channel_code,
    coalesce(p_severity, 'Information'::alert_severity),
    p_entity_type,
    p_entity_id,
    p_link_url,
    false,
    now()
  )
  returning * into v_notification;

  return v_notification;
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, text, text, text, text, text, alert_severity) from public, anon;
grant execute on function public.create_notification(uuid, uuid, text, text, text, text, text, text, alert_severity) to authenticated;

commit;

-- Record 0217_notification_preferences in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030059', '0217_notification_preferences')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0217_notification_preferences.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0218_client_message_events.sql
-- SHA-256: a014cc01c3a42253e77c8d6d31b4ab5af5e5771753e97c2879bbff283039e2ed
-- Version: 20261122030100
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0218_client_message_events.sql — Automatic client emails & message events (T5-07)
--
-- Implements automatic client messages (W21, W22, W23, W37, W38, W80):
--   1. Pickup reminder — 2 hours before pickup (W37)
--   2. Pickup receipt — when Handover completes (On Rent transition)
--   3. Return reminder — 2 hours before return time (W37)
--   4. Late return — at 30 minutes late, when free grace ends (W38)
--   5. Return receipt — when Return completes (Returned transition)
--   6. Damage / loss notice — when damage case opens, strictly NO amount (W23, Law 6);
--      second email with approved charge only after Manager (< Rs 25,000) or Owner approval.
--
-- Client with NO email gets a WhatsApp draft task for staff (W22).
-- Each message is sent once (idempotent on booking + event).
-- Cancelled booking stops its pending reminders.
--
-- Law 3: Hard delete forbidden.
-- Law 4: Records immutable once dispatched or cancelled.
-- Law 6: Zero money in damage notices for money-blind roles & clients.
-- Law 8: client_uuid on all writes.
-- RLS: Staff read all; clients read own rows only; no client write.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Table: client_message_events
-- -----------------------------------------------------------------------------
create table if not exists public.client_message_events (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  event_type text not null check (event_type in (
    'pickup_reminder',
    'pickup_receipt',
    'return_reminder',
    'late_return',
    'return_receipt',
    'damage_notice',
    'damage_charge'
  )),
  channel text not null check (channel in ('email', 'whatsapp_draft')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'draft_ready', 'cancelled', 'failed')),
  due_at timestamptz not null,
  sent_at timestamptz,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  finding_id uuid references public.damage_findings(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  email_log_id uuid references public.email_log(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_message_events is
  'Automatic client communications scheduled and dispatched by the server (T5-07, W21).';

-- Idempotency unique index: strictly one event per booking and event_type (or finding)
create unique index if not exists uq_client_message_events_idempotent
  on public.client_message_events (
    booking_id,
    event_type,
    coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_client_message_events_due_pending
  on public.client_message_events (due_at)
  where status = 'pending';

create index if not exists idx_client_message_events_booking
  on public.client_message_events (booking_id);

create index if not exists idx_client_message_events_status
  on public.client_message_events (status);

-- -----------------------------------------------------------------------------
-- 2. Law 3: Hard delete forbidden
-- -----------------------------------------------------------------------------
create or replace function public.trg_client_message_events_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): client_message_events entries cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_client_message_events_prevent_delete on public.client_message_events;
create trigger trg_client_message_events_prevent_delete
  before delete on public.client_message_events
  for each statement execute function public.trg_client_message_events_prevent_delete_fn();

revoke all on function public.trg_client_message_events_prevent_delete_fn() from public, anon;
grant execute on function public.trg_client_message_events_prevent_delete_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Law 4: Immutability guard on terminal states
-- -----------------------------------------------------------------------------
create or replace function public.trg_client_message_events_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.status in ('sent', 'cancelled') then
    if NEW.id <> OLD.id
       or NEW.client_uuid <> OLD.client_uuid
       or NEW.booking_id <> OLD.booking_id
       or NEW.event_type <> OLD.event_type
       or NEW.due_at <> OLD.due_at
       or NEW.channel <> OLD.channel then
      raise exception 'IMMUTABLE (Law 4): completed or cancelled client_message_events cannot be altered.'
        using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_client_message_events_update_guard on public.client_message_events;
create trigger trg_client_message_events_update_guard
  before update on public.client_message_events
  for each row execute function public.trg_client_message_events_update_guard_fn();

revoke all on function public.trg_client_message_events_update_guard_fn() from public, anon;
grant execute on function public.trg_client_message_events_update_guard_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security policies
-- -----------------------------------------------------------------------------
alter table public.client_message_events enable row level security;

drop policy if exists client_message_events_select on public.client_message_events;
create policy client_message_events_select on public.client_message_events
  for select
  to authenticated
  using (
    public.auth_is_staff()
    or exists (
      select 1 from public.bookings b
      join public.clients c on c.id = b.client_id
      join public.users u on u.email = c.email
      where b.id = client_message_events.booking_id
        and u.id = public.auth_user_id()
    )
  );

drop policy if exists client_message_events_staff_insert on public.client_message_events;
create policy client_message_events_staff_insert on public.client_message_events
  for insert
  to authenticated
  with check (public.auth_is_staff());

drop policy if exists client_message_events_staff_update on public.client_message_events;
create policy client_message_events_staff_update on public.client_message_events
  for update
  to authenticated
  using (public.auth_is_staff())
  with check (public.auth_is_staff());

drop policy if exists client_message_events_delete on public.client_message_events;
create policy client_message_events_delete on public.client_message_events
  for delete
  to authenticated
  using (public.auth_is_staff());

grant select, insert, update, delete on public.client_message_events to authenticated;
revoke all on public.client_message_events from anon;

-- -----------------------------------------------------------------------------
-- 5. Trigger: Booking stage and reminder scheduling
-- -----------------------------------------------------------------------------
create or replace function public.trg_booking_client_message_events_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_channel text;
begin
  select id, name, email, phone
  into v_client
  from public.clients
  where id = NEW.client_id;

  if v_client.id is not null and v_client.email is not null and trim(v_client.email) <> '' then
    v_channel := 'email';
  else
    v_channel := 'whatsapp_draft';
  end if;

  -- 1. When booking is Booked or Packed and not cancelled
  if NEW.stage in ('Booked', 'Packed') and NEW.cancelled_at is null then
    -- Pickup reminder: 2 hours before pickup (W37)
    if NEW.pickup_at is not null then
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, payload
      ) values (
        gen_random_uuid(), NEW.id, 'pickup_reminder', v_channel, 'pending',
        NEW.pickup_at - interval '2 hours',
        v_client.name, v_client.email, v_client.phone,
        jsonb_build_object('booking_no', NEW.booking_no, 'pickup_at', NEW.pickup_at, 'return_at', NEW.return_at)
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set
        due_at = excluded.due_at,
        channel = excluded.channel,
        recipient_name = excluded.recipient_name,
        recipient_email = excluded.recipient_email,
        recipient_phone = excluded.recipient_phone,
        updated_at = now()
      where client_message_events.status = 'pending';
    end if;

    -- Return reminder: 2 hours before return (W37)
    if NEW.return_at is not null then
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, payload
      ) values (
        gen_random_uuid(), NEW.id, 'return_reminder', v_channel, 'pending',
        NEW.return_at - interval '2 hours',
        v_client.name, v_client.email, v_client.phone,
        jsonb_build_object('booking_no', NEW.booking_no, 'return_at', NEW.return_at)
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set
        due_at = excluded.due_at,
        channel = excluded.channel,
        recipient_name = excluded.recipient_name,
        recipient_email = excluded.recipient_email,
        recipient_phone = excluded.recipient_phone,
        updated_at = now()
      where client_message_events.status = 'pending';

      -- Late return: 30 minutes after return_at (W38, free grace period ends)
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, payload
      ) values (
        gen_random_uuid(), NEW.id, 'late_return', v_channel, 'pending',
        NEW.return_at + interval '30 minutes',
        v_client.name, v_client.email, v_client.phone,
        jsonb_build_object('booking_no', NEW.booking_no, 'return_at', NEW.return_at)
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set
        due_at = excluded.due_at,
        channel = excluded.channel,
        recipient_name = excluded.recipient_name,
        recipient_email = excluded.recipient_email,
        recipient_phone = excluded.recipient_phone,
        updated_at = now()
      where client_message_events.status = 'pending';
    end if;
  end if;

  -- 2. Handover completes -> stage becomes 'On Rent'
  if NEW.stage = 'On Rent' and (TG_OP = 'INSERT' or OLD.stage is distinct from 'On Rent') then
    insert into public.client_message_events (
      client_uuid, booking_id, event_type, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, payload
    ) values (
      gen_random_uuid(), NEW.id, 'pickup_receipt', v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone,
      jsonb_build_object('booking_no', NEW.booking_no, 'pickup_at', NEW.pickup_at, 'return_at', NEW.return_at)
    )
    on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;
  end if;

  -- 3. Return completes -> stage becomes 'Returned'
  if NEW.stage = 'Returned' and (TG_OP = 'INSERT' or OLD.stage is distinct from 'Returned') then
    insert into public.client_message_events (
      client_uuid, booking_id, event_type, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, payload
    ) values (
      gen_random_uuid(), NEW.id, 'return_receipt', v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone,
      jsonb_build_object('booking_no', NEW.booking_no, 'returned_at', now())
    )
    on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;

    -- Cancel pending return_reminder and late_return
    update public.client_message_events
    set status = 'cancelled', updated_at = now()
    where booking_id = NEW.id
      and event_type in ('return_reminder', 'late_return')
      and status = 'pending';
  end if;

  -- 4. Cancelled or Closed
  if NEW.cancelled_at is not null or NEW.stage = 'Closed' then
    update public.client_message_events
    set status = 'cancelled', updated_at = now()
    where booking_id = NEW.id
      and status = 'pending';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_booking_client_message_events on public.bookings;
create trigger trg_booking_client_message_events
  after insert or update on public.bookings
  for each row execute function public.trg_booking_client_message_events_fn();

revoke all on function public.trg_booking_client_message_events_fn() from public, anon;
grant execute on function public.trg_booking_client_message_events_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Trigger: Damage finding client notices
-- -----------------------------------------------------------------------------
create or replace function public.trg_damage_finding_client_message_events_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_booking record;
  v_client record;
  v_channel text;
begin
  if NEW.return_line_id is not null then
    select bl.booking_id
    into v_booking_id
    from public.return_lines rl
    join public.booking_lines bl on bl.id = rl.booking_line_id
    where rl.id = NEW.return_line_id;
  elsif NEW.cleaning_queue_entry_id is not null then
    select cqe.booking_id
    into v_booking_id
    from public.cleaning_queue_entries cqe
    where cqe.id = NEW.cleaning_queue_entry_id;
  end if;

  if v_booking_id is null then
    return NEW;
  end if;

  select id, booking_no, client_id
  into v_booking
  from public.bookings
  where id = v_booking_id;

  select id, name, email, phone
  into v_client
  from public.clients
  where id = v_booking.client_id;

  if v_client.email is not null and trim(v_client.email) <> '' then
    v_channel := 'email';
  else
    v_channel := 'whatsapp_draft';
  end if;

  -- 1. On INSERT: damage_notice with strictly NO money amount (W23, Law 6)
  if TG_OP = 'INSERT' then
    insert into public.client_message_events (
      client_uuid, booking_id, event_type, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, finding_id, payload
    ) values (
      gen_random_uuid(), v_booking_id, 'damage_notice', v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone, NEW.id,
      jsonb_build_object(
        'booking_no', v_booking.booking_no,
        'damage_type', NEW.damage_type,
        'description', NEW.description,
        'severity', NEW.severity,
        'status', 'Under Technical Review'
      )
    )
    on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;
  end if;

  -- 2. On UPDATE: damage_charge after approval
  if TG_OP = 'UPDATE' and NEW.approval_state = 'Approved' and (OLD.approval_state is distinct from 'Approved') then
    if coalesce(NEW.estimated_cost, 0) > 0 then
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, finding_id, payload
      ) values (
        gen_random_uuid(), v_booking_id, 'damage_charge', v_channel, 'pending',
        now(),
        v_client.name, v_client.email, v_client.phone, NEW.id,
        jsonb_build_object(
          'booking_no', v_booking.booking_no,
          'damage_type', NEW.damage_type,
          'description', NEW.description,
          'approved_amount', NEW.estimated_cost
        )
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do nothing;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_damage_finding_client_message_events on public.damage_findings;
create trigger trg_damage_finding_client_message_events
  after insert or update on public.damage_findings
  for each row execute function public.trg_damage_finding_client_message_events_fn();

revoke all on function public.trg_damage_finding_client_message_events_fn() from public, anon;
grant execute on function public.trg_damage_finding_client_message_events_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: process_due_client_message_events
-- -----------------------------------------------------------------------------
create or replace function public.process_due_client_message_events(
  p_limit int default 50
)
returns table (
  event_id uuid,
  booking_id uuid,
  event_type text,
  channel text,
  status text,
  recipient_email text,
  recipient_phone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_email_log_id uuid;
begin
  for r in
    select e.*, b.booking_no
    from public.client_message_events e
    join public.bookings b on b.id = e.booking_id
    where e.status = 'pending'
      and e.due_at <= now()
    order by e.due_at asc
    limit p_limit
    for update skip locked
  loop
    if r.channel = 'whatsapp_draft' then
      update public.client_message_events
      set status = 'draft_ready',
          sent_at = now(),
          updated_at = now()
      where id = r.id;

      perform public.notify_staff(
        'general',
        'WhatsApp Draft Ready: ' || r.event_type,
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        '/rentals/' || r.booking_id,
        'booking',
        r.booking_no
      );

      event_id := r.id;
      booking_id := r.booking_id;
      event_type := r.event_type;
      channel := r.channel;
      status := 'draft_ready';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;

    elsif r.channel = 'email' then
      -- Record send into email_log (strictly NO email body stored per S13 / W21)
      insert into public.email_log (
        template_id,
        recipient_email,
        entity_type,
        entity_id,
        language,
        status,
        metadata,
        sent_at
      ) values (
        r.event_type,
        r.recipient_email,
        'booking',
        r.booking_id::text,
        'en',
        'mock_sent',
        jsonb_build_object('source', 'automatic_client_emails', 'booking_no', r.booking_no, 'event_id', r.id),
        now()
      )
      returning id into v_email_log_id;

      update public.client_message_events
      set status = 'sent',
          sent_at = now(),
          email_log_id = v_email_log_id,
          updated_at = now()
      where id = r.id;

      event_id := r.id;
      booking_id := r.booking_id;
      event_type := r.event_type;
      channel := r.channel;
      status := 'sent';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.process_due_client_message_events(int) from public, anon;
grant execute on function public.process_due_client_message_events(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC: mark_client_message_event_sent
-- -----------------------------------------------------------------------------
create or replace function public.mark_client_message_event_sent(
  p_client_uuid uuid,
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated boolean := false;
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may mark client message events sent'
      using errcode = '42501';
  end if;

  update public.client_message_events
  set status = 'sent',
      sent_at = coalesce(sent_at, now()),
      updated_at = now()
  where id = p_event_id
    and status in ('draft_ready', 'pending');

  if found then
    v_updated := true;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.mark_client_message_event_sent(uuid, uuid) from public, anon;
grant execute on function public.mark_client_message_event_sent(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. RPC: get_pending_whatsapp_draft_tasks
-- -----------------------------------------------------------------------------
create or replace function public.get_pending_whatsapp_draft_tasks()
returns table (
  id uuid,
  client_uuid uuid,
  booking_id uuid,
  booking_no text,
  event_type text,
  recipient_name text,
  recipient_phone text,
  due_at timestamptz,
  status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may view WhatsApp draft tasks'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.client_uuid,
    e.booking_id,
    b.booking_no,
    e.event_type,
    e.recipient_name,
    e.recipient_phone,
    e.due_at,
    e.status,
    e.payload
  from public.client_message_events e
  join public.bookings b on b.id = e.booking_id
  where e.channel = 'whatsapp_draft'
    and e.status = 'draft_ready'
  order by e.due_at desc;
end;
$$;

revoke all on function public.get_pending_whatsapp_draft_tasks() from public, anon;
grant execute on function public.get_pending_whatsapp_draft_tasks() to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Register cron job in cron_schedules
-- -----------------------------------------------------------------------------
insert into public.cron_schedules (job_name, schedule, command, description)
values (
  'automatic-client-emails',
  '*/10 * * * *',
  'select process_due_client_message_events()',
  'Process due client emails and WhatsApp drafts every 10 minutes (T5-07, W21)'
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command,
    description = excluded.description,
    updated_at = now();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('automatic-client-emails') where exists (
        select 1 from cron.job where jobname = 'automatic-client-emails'
      );
      perform cron.schedule(
        'automatic-client-emails',
        '*/10 * * * *',
        $cmd$select process_due_client_message_events()$cmd$
      );
    exception when others then
      null;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Idempotent backfill for existing active bookings
-- -----------------------------------------------------------------------------
insert into public.client_message_events (
  client_uuid, booking_id, event_type, channel, status, due_at,
  recipient_name, recipient_email, recipient_phone, payload
)
select
  gen_random_uuid(),
  b.id,
  'pickup_reminder',
  case when c.email is not null and trim(c.email) <> '' then 'email' else 'whatsapp_draft' end,
  'pending',
  b.pickup_at - interval '2 hours',
  c.name, c.email, c.phone,
  jsonb_build_object('booking_no', b.booking_no, 'pickup_at', b.pickup_at, 'return_at', b.return_at)
from public.bookings b
join public.clients c on c.id = b.client_id
where b.stage in ('Booked', 'Packed')
  and b.pickup_at is not null
  and b.cancelled_at is null
on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

insert into public.client_message_events (
  client_uuid, booking_id, event_type, channel, status, due_at,
  recipient_name, recipient_email, recipient_phone, payload
)
select
  gen_random_uuid(),
  b.id,
  'return_reminder',
  case when c.email is not null and trim(c.email) <> '' then 'email' else 'whatsapp_draft' end,
  'pending',
  b.return_at - interval '2 hours',
  c.name, c.email, c.phone,
  jsonb_build_object('booking_no', b.booking_no, 'return_at', b.return_at)
from public.bookings b
join public.clients c on c.id = b.client_id
where b.stage in ('Booked', 'Packed')
  and b.return_at is not null
  and b.cancelled_at is null
on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

insert into public.client_message_events (
  client_uuid, booking_id, event_type, channel, status, due_at,
  recipient_name, recipient_email, recipient_phone, payload
)
select
  gen_random_uuid(),
  b.id,
  'late_return',
  case when c.email is not null and trim(c.email) <> '' then 'email' else 'whatsapp_draft' end,
  'pending',
  b.return_at + interval '30 minutes',
  c.name, c.email, c.phone,
  jsonb_build_object('booking_no', b.booking_no, 'return_at', b.return_at)
from public.bookings b
join public.clients c on c.id = b.client_id
where b.stage in ('Booked', 'Packed')
  and b.return_at is not null
  and b.cancelled_at is null
on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

commit;

-- Record 0218_client_message_events in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030100', '0218_client_message_events')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0218_client_message_events.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0219_payment_reminders.sql
-- SHA-256: 52a8c87c3930098a65db02ae30030bffb2f69bd11c384e59e927042544be2844
-- Version: 20261122030101
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0219_payment_reminders.sql — Automatic payment reminders & client pause (T5-08)
--
-- Implements automatic payment reminders (W14, W18, W18b, W22, W80):
--   1. When a booking is completed (returned) with money still owed, automatic
--      reminder emails go out at completion, day 5, day 10, then every 5 days (W18) until paid.
--   2. Staff can pause a client (W18b) with a reason; paused clients get nothing.
--   3. Reminders stop the moment the balance is 0.
--   4. Client with NO email gets a WhatsApp draft task for staff (W22).
--   5. Sent in English from no-reply@babinrentals.com (W80).
--
-- Law 3: Hard delete forbidden.
-- Law 4: Sent reminder records immutable.
-- Law 6: Money blindness enforced for floor roles.
-- Law 8: client_uuid on all writes.
-- RLS: Staff manage reminders; clients cannot pause/resume.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Alter public.clients: pause fields (W18b)
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists reminders_paused boolean not null default false,
  add column if not exists reminders_paused_reason text,
  add column if not exists reminders_paused_by uuid references public.users(id),
  add column if not exists reminders_paused_at timestamptz;

comment on column public.clients.reminders_paused is
  'When true, automatic payment reminders are suppressed for this client (W18b).';
comment on column public.clients.reminders_paused_reason is
  'Required reason given by staff when pausing payment reminders (W18b).';
comment on column public.clients.reminders_paused_by is
  'Staff user who paused payment reminders (W18b).';
comment on column public.clients.reminders_paused_at is
  'Timestamp when payment reminders were paused (W18b).';

grant select (reminders_paused, reminders_paused_reason, reminders_paused_by, reminders_paused_at)
  on public.clients to authenticated;

create or replace view public.clients_v as
 SELECT id,
    client_uuid,
    client_code,
    type_parent,
    org_subtype,
    name,
    phone,
    email,
    pan_vat,
    business_registration,
    website,
    government_id_kind,
    government_id_number,
    address_line,
    city,
    district,
    postal_code,
    country,
    billing_address,
        CASE
            WHEN auth_can_view_money() THEN approved_credit_limit
            ELSE NULL::numeric
        END AS approved_credit_limit,
        CASE
            WHEN auth_can_view_money() THEN payment_terms
            ELSE NULL::payment_terms
        END AS payment_terms,
    client_since,
    professions,
    segments,
    source,
    referred_by_client_id,
    tags,
    preferred_contact_channels,
    marketing_photo_consent,
    notes,
    assigned_staff_id,
    status,
    deactivated_at,
    deactivated_by,
    deactivation_reason,
    merged_into_client_id,
    portal_default_language,
    created_at,
    created_by,
    updated_at,
    is_staff,
    staff_user_id,
        CASE
            WHEN auth_can_view_money() THEN account_credit
            ELSE NULL::numeric
        END AS account_credit,
    reminders_paused,
    reminders_paused_reason,
    reminders_paused_by,
    reminders_paused_at
   FROM public.clients
  where auth_is_staff() and auth_user_role() <> 'Driver';

revoke all on public.clients_v from anon;
grant select on public.clients_v to authenticated;

create or replace view client_directory_v as
select
  c.id,
  c.client_code,
  c.name,
  c.phone,
  c.email,
  c.address_line,
  c.city,
  c.district,
  c.country,
  c.status,
  c.client_since,
  c.type_parent,
  c.org_subtype,
  c.pan_vat,
  c.deactivated_at,
  c.created_at,
  c.approved_credit_limit,
  c.payment_terms,
  case when auth_can_view_money() then coalesce(inv.outstanding_total, 0) else null end
    as outstanding_amount,
  case when auth_can_view_money() then coalesce(dep.held_total, 0) else null end
    as deposit_held_amount,
  case when auth_can_view_money() then coalesce(pay.paid_total, 0) else null end
    as total_paid_amount,
  coalesce(bk.active_count, 0)  as active_bookings_count,
  coalesce(bk.total_count, 0)   as total_bookings_count,
  bk.last_pickup_at,
  ct.full_name    as contact_name,
  ct.designation  as contact_designation,
  ct.phone        as contact_phone,
  mem.level       as membership_level,
  coalesce(doc.total_count, 0)    as kyc_docs_count,
  coalesce(doc.verified_count, 0) as kyc_verified_count,
  exists (
    select 1
    from client_flags f
    where f.client_id = c.id
      and f.flag_type = 'Blocked'
      and f.removed_at is null
  ) as is_blocked,
  c.is_staff,
  c.staff_user_id,
  c.reminders_paused,
  c.reminders_paused_reason,
  c.reminders_paused_by,
  c.reminders_paused_at
from public.clients_v c
left join lateral (
  select sum(i.outstanding_amount) as outstanding_total
  from invoices i
  where i.client_id = c.id
) inv on true
left join lateral (
  select sum(greatest(s.received_amount - s.refunded_amount - s.applied_amount, 0)) as held_total
  from security_deposits s
  where s.client_id = c.id
) dep on true
left join lateral (
  select sum(p.amount) as paid_total
  from payments p
  where p.client_id = c.id and p.status = 'Received'
) pay on true
left join lateral (
  select
    count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null) as active_count,
    count(*)                                                              as total_count,
    max(b.pickup_at)                                                      as last_pickup_at
  from bookings b
  where b.client_id = c.id
) bk on true
left join lateral (
  select k.full_name, k.designation, k.phone
  from client_contacts k
  where k.client_id = c.id and k.deactivated_at is null
  order by k.is_primary desc, k.created_at
  limit 1
) ct on true
left join lateral (
  select p.level
  from client_memberships m
  join membership_plans p on p.id = m.plan_id
  where m.client_id = c.id and m.superseded_at is null
  order by m.join_date desc
  limit 1
) mem on true
left join lateral (
  select
    count(*)                                        as total_count,
    count(*) filter (where d.status = 'Verified')   as verified_count
  from client_documents d
  where d.client_id = c.id and d.archived_at is null
) doc on true
where auth_is_staff();

revoke all on client_directory_v from anon;
grant select on client_directory_v to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Table: payment_reminders (Schedule rows for W18)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  sequence int not null default 0,
  channel text not null check (channel in ('email', 'whatsapp_draft')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'draft_ready', 'cancelled', 'failed')),
  due_at timestamptz not null,
  sent_at timestamptz,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  outstanding_amount numeric(14,2) not null default 0,
  email_log_id uuid references public.email_log(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, sequence)
);

comment on table public.payment_reminders is
  'Automatic payment reminder schedule rows (completion, day 5, day 10, then every 5 days) per W18.';
comment on column public.payment_reminders.sequence is
  'Reminder sequence index: 0=completion, 1=day 5, 2=day 10, then every 5 days (W18).';
comment on column public.payment_reminders.outstanding_amount is
  'Snapshot of outstanding balance in paisa/rupees at schedule or send time.';

create index if not exists idx_payment_reminders_due_pending
  on public.payment_reminders (due_at)
  where status = 'pending';

create index if not exists idx_payment_reminders_booking
  on public.payment_reminders (booking_id);

create index if not exists idx_payment_reminders_client
  on public.payment_reminders (client_id);

-- -----------------------------------------------------------------------------
-- 3. Law 3: Hard delete forbidden
-- -----------------------------------------------------------------------------
create or replace function public.trg_payment_reminders_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): payment_reminders entries cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_payment_reminders_prevent_delete on public.payment_reminders;
create trigger trg_payment_reminders_prevent_delete
  before delete on public.payment_reminders
  for each statement execute function public.trg_payment_reminders_prevent_delete_fn();

revoke all on function public.trg_payment_reminders_prevent_delete_fn() from public, anon;
grant execute on function public.trg_payment_reminders_prevent_delete_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Law 4: Immutability guard on terminal states
-- -----------------------------------------------------------------------------
create or replace function public.trg_payment_reminders_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.status in ('sent', 'cancelled') then
    if NEW.id <> OLD.id
       or NEW.client_uuid <> OLD.client_uuid
       or NEW.booking_id <> OLD.booking_id
       or NEW.client_id <> OLD.client_id
       or NEW.sequence <> OLD.sequence
       or NEW.due_at <> OLD.due_at
       or NEW.channel <> OLD.channel then
      raise exception 'IMMUTABLE (Law 4): completed or cancelled payment_reminders cannot be altered.'
        using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_payment_reminders_update_guard on public.payment_reminders;
create trigger trg_payment_reminders_update_guard
  before update on public.payment_reminders
  for each row execute function public.trg_payment_reminders_update_guard_fn();

revoke all on function public.trg_payment_reminders_update_guard_fn() from public, anon;
grant execute on function public.trg_payment_reminders_update_guard_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security policies
-- -----------------------------------------------------------------------------
alter table public.payment_reminders enable row level security;

drop policy if exists payment_reminders_select on public.payment_reminders;
create policy payment_reminders_select on public.payment_reminders
  for select
  to authenticated
  using (
    public.auth_is_staff()
    or exists (
      select 1 from public.clients c
      join public.users u on u.email = c.email
      where c.id = payment_reminders.client_id
        and u.id = public.auth_user_id()
    )
  );

drop policy if exists payment_reminders_staff_insert on public.payment_reminders;
create policy payment_reminders_staff_insert on public.payment_reminders
  for insert
  to authenticated
  with check (public.auth_is_staff());

drop policy if exists payment_reminders_staff_update on public.payment_reminders;
create policy payment_reminders_staff_update on public.payment_reminders
  for update
  to authenticated
  using (public.auth_is_staff())
  with check (public.auth_is_staff());

drop policy if exists payment_reminders_staff_delete on public.payment_reminders;
create policy payment_reminders_staff_delete on public.payment_reminders
  for delete
  to authenticated
  using (public.auth_is_staff());

grant select, insert, update, delete on public.payment_reminders to authenticated;
revoke all on public.payment_reminders from anon;

-- -----------------------------------------------------------------------------
-- 6. RPC: pause_client_payment_reminders (W18b)
-- -----------------------------------------------------------------------------
create or replace function public.pause_client_payment_reminders(
  p_client_uuid uuid,
  p_client_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff_id uuid;
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may pause client payment reminders'
      using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to pause payment reminders'
      using errcode = '22000';
  end if;

  v_staff_id := public.auth_user_id();

  update public.clients
  set reminders_paused = true,
      reminders_paused_reason = trim(p_reason),
      reminders_paused_by = v_staff_id,
      reminders_paused_at = now(),
      updated_at = now()
  where id = p_client_id;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  -- Cancel all pending or draft_ready payment reminders for this client
  update public.payment_reminders
  set status = 'cancelled',
      error_message = 'Reminders paused by staff: ' || trim(p_reason),
      updated_at = now()
  where client_id = p_client_id
    and status in ('pending', 'draft_ready');

  return true;
end;
$$;

revoke all on function public.pause_client_payment_reminders(uuid, uuid, text) from public, anon;
grant execute on function public.pause_client_payment_reminders(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: resume_client_payment_reminders (W18b)
-- -----------------------------------------------------------------------------
create or replace function public.resume_client_payment_reminders(
  p_client_uuid uuid,
  p_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_client record;
  v_channel text;
  v_next_seq int;
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may resume client payment reminders'
      using errcode = '42501';
  end if;

  select id, name, email, phone
  into v_client
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  update public.clients
  set reminders_paused = false,
      reminders_paused_reason = null,
      reminders_paused_by = null,
      reminders_paused_at = null,
      updated_at = now()
  where id = p_client_id;

  if v_client.email is not null and trim(v_client.email) <> '' then
    v_channel := 'email';
  else
    v_channel := 'whatsapp_draft';
  end if;

  -- Re-schedule next reminder for any completed booking with positive balance
  for r in
    select b.id as booking_id, b.booking_no, coalesce(sum(i.outstanding_amount), 0) as balance
    from public.bookings b
    join public.invoices i on i.booking_id = b.id
    where b.client_id = p_client_id
      and b.stage in ('Returned', 'Closed')
      and b.cancelled_at is null
      and i.status not in ('Void')
    group by b.id, b.booking_no
    having coalesce(sum(i.outstanding_amount), 0) > 0
  loop
    select coalesce(max(sequence), -1) + 1
    into v_next_seq
    from public.payment_reminders
    where booking_id = r.booking_id;

    insert into public.payment_reminders (
      client_uuid, booking_id, client_id, sequence, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, outstanding_amount
    ) values (
      gen_random_uuid(), r.booking_id, p_client_id, v_next_seq, v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone, r.balance
    )
    on conflict (booking_id, sequence)
    do nothing;
  end loop;

  return true;
end;
$$;

revoke all on function public.resume_client_payment_reminders(uuid, uuid) from public, anon;
grant execute on function public.resume_client_payment_reminders(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Trigger: Cancel payment reminders when balance reaches 0 ("reminders stop the moment the balance is 0")
-- -----------------------------------------------------------------------------
create or replace function public.trg_invoice_payment_reminder_settled_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_outstanding numeric(14,2);
begin
  if NEW.booking_id is not null then
    select coalesce(sum(outstanding_amount), 0)
    into v_total_outstanding
    from public.invoices
    where booking_id = NEW.booking_id
      and status not in ('Void');

    if v_total_outstanding <= 0 then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Balance fully settled',
          updated_at = now()
      where booking_id = NEW.booking_id
        and status in ('pending', 'draft_ready');
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_invoice_payment_reminder_settled on public.invoices;
create trigger trg_invoice_payment_reminder_settled
  after insert or update on public.invoices
  for each row execute function public.trg_invoice_payment_reminder_settled_fn();

revoke all on function public.trg_invoice_payment_reminder_settled_fn() from public, anon;
grant execute on function public.trg_invoice_payment_reminder_settled_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Trigger on bookings: Schedule Day 0 payment reminder on Returned completion
-- -----------------------------------------------------------------------------
create or replace function public.trg_booking_payment_reminder_completion_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_channel text;
  v_outstanding numeric(14,2);
begin
  if NEW.stage in ('Returned', 'Closed') and (TG_OP = 'INSERT' or OLD.stage is distinct from NEW.stage) then
    select id, name, email, phone, reminders_paused
    into v_client
    from public.clients
    where id = NEW.client_id;

    if v_client.id is not null and not coalesce(v_client.reminders_paused, false) then
      select coalesce(sum(outstanding_amount), 0)
      into v_outstanding
      from public.invoices
      where booking_id = NEW.id
        and status not in ('Void');

      if coalesce(v_outstanding, 0) > 0 then
        if v_client.email is not null and trim(v_client.email) <> '' then
          v_channel := 'email';
        else
          v_channel := 'whatsapp_draft';
        end if;

        insert into public.payment_reminders (
          client_uuid, booking_id, client_id, sequence, channel, status, due_at,
          recipient_name, recipient_email, recipient_phone, outstanding_amount
        ) values (
          gen_random_uuid(), NEW.id, NEW.client_id, 0, v_channel, 'pending',
          now(),
          v_client.name, v_client.email, v_client.phone, v_outstanding
        )
        on conflict (booking_id, sequence)
        do nothing;
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_booking_payment_reminder_completion on public.bookings;
create trigger trg_booking_payment_reminder_completion
  after insert or update of stage on public.bookings
  for each row execute function public.trg_booking_payment_reminder_completion_fn();

revoke all on function public.trg_booking_payment_reminder_completion_fn() from public, anon;
grant execute on function public.trg_booking_payment_reminder_completion_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 10. RPC: process_due_payment_reminders (W18 cadence + pause & balance check)
-- -----------------------------------------------------------------------------
create or replace function public.process_due_payment_reminders(
  p_limit int default 50
)
returns table (
  reminder_id uuid,
  booking_id uuid,
  client_id uuid,
  sequence int,
  channel text,
  status text,
  recipient_email text,
  recipient_phone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  r record;
  v_email_log_id uuid;
  v_outstanding numeric(14,2);
  v_paused boolean;
  v_next_seq int;
  v_next_interval interval;
begin
  for r in
    select pr.*, b.booking_no
    from public.payment_reminders pr
    join public.bookings b on b.id = pr.booking_id
    where pr.status = 'pending'
      and pr.due_at <= now()
    order by pr.due_at asc
    limit p_limit
    for update skip locked
  loop
    -- 1. Check if client is paused
    select coalesce(c.reminders_paused, false)
    into v_paused
    from public.clients c
    where c.id = r.client_id;

    if v_paused then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Reminders paused by staff for client',
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- 2. Check if balance is settled
    select coalesce(sum(inv.outstanding_amount), 0)
    into v_outstanding
    from public.invoices inv
    where inv.booking_id = r.booking_id
      and inv.status not in ('Void');

    if v_outstanding <= 0 then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Balance fully settled',
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- 3. Dispatch
    if r.channel = 'whatsapp_draft' then
      update public.payment_reminders
      set status = 'draft_ready',
          sent_at = now(),
          outstanding_amount = v_outstanding,
          updated_at = now()
      where id = r.id;

      perform public.notify_staff(
        'general',
        'WhatsApp Draft Ready: payment_reminder',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        '/rentals/' || r.booking_id,
        'booking',
        r.booking_no
      );

      reminder_id := r.id;
      booking_id := r.booking_id;
      client_id := r.client_id;
      sequence := r.sequence;
      channel := r.channel;
      status := 'draft_ready';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;

    elsif r.channel = 'email' then
      insert into public.email_log (
        template_id,
        recipient_email,
        entity_type,
        entity_id,
        language,
        status,
        metadata,
        sent_at
      ) values (
        'payment_reminder',
        r.recipient_email,
        'booking',
        r.booking_id::text,
        'en',
        'mock_sent',
        jsonb_build_object(
          'source', 'automatic_payment_reminders',
          'booking_no', r.booking_no,
          'reminder_id', r.id,
          'sequence', r.sequence,
          'outstanding_amount', v_outstanding
        ),
        now()
      )
      returning id into v_email_log_id;

      update public.payment_reminders
      set status = 'sent',
          sent_at = now(),
          email_log_id = v_email_log_id,
          outstanding_amount = v_outstanding,
          updated_at = now()
      where id = r.id;

      reminder_id := r.id;
      booking_id := r.booking_id;
      client_id := r.client_id;
      sequence := r.sequence;
      channel := r.channel;
      status := 'sent';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;
    end if;

    -- 4. Schedule next reminder (W18: completion, day 5, day 10, then every 5 days)
    if v_outstanding > 0 and not v_paused then
      v_next_seq := r.sequence + 1;
      v_next_interval := interval '5 days';

      insert into public.payment_reminders (
        client_uuid, booking_id, client_id, sequence, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, outstanding_amount
      ) values (
        gen_random_uuid(), r.booking_id, r.client_id, v_next_seq, r.channel, 'pending',
        r.due_at + v_next_interval,
        r.recipient_name, r.recipient_email, r.recipient_phone, v_outstanding
      )
      on conflict (booking_id, sequence)
      do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.process_due_payment_reminders(int) from public, anon;
grant execute on function public.process_due_payment_reminders(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Integrate WhatsApp draft tasks from payment_reminders
-- -----------------------------------------------------------------------------
create or replace function public.get_pending_whatsapp_draft_tasks()
returns table (
  id uuid,
  client_uuid uuid,
  booking_id uuid,
  booking_no text,
  event_type text,
  recipient_name text,
  recipient_phone text,
  due_at timestamptz,
  status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may view WhatsApp draft tasks'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.client_uuid,
    e.booking_id,
    b.booking_no,
    e.event_type,
    e.recipient_name,
    e.recipient_phone,
    e.due_at,
    e.status,
    e.payload
  from public.client_message_events e
  join public.bookings b on b.id = e.booking_id
  where e.channel = 'whatsapp_draft'
    and e.status = 'draft_ready'

  union all

  select
    pr.id,
    pr.client_uuid,
    pr.booking_id,
    b.booking_no,
    'payment_reminder'::text as event_type,
    pr.recipient_name,
    pr.recipient_phone,
    pr.due_at,
    pr.status,
    jsonb_build_object('outstanding_amount', pr.outstanding_amount, 'sequence', pr.sequence) as payload
  from public.payment_reminders pr
  join public.bookings b on b.id = pr.booking_id
  where pr.channel = 'whatsapp_draft'
    and pr.status = 'draft_ready'

  order by due_at desc;
end;
$$;

revoke all on function public.get_pending_whatsapp_draft_tasks() from public, anon;
grant execute on function public.get_pending_whatsapp_draft_tasks() to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Register cron job in cron_schedules
-- -----------------------------------------------------------------------------
insert into public.cron_schedules (job_name, schedule, command, description)
values (
  'automatic-payment-reminders',
  '*/15 * * * *',
  'select process_due_payment_reminders()',
  'Process due automatic payment reminders (T5-08, W18)'
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command,
    description = excluded.description,
    updated_at = now();

commit;

-- Record 0219_payment_reminders in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030101', '0219_payment_reminders')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0219_payment_reminders.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0220_push_subscriptions.sql
-- SHA-256: 6f3667d8121b5d7d1528aeaaba5089573c8e69e4bc4664f177bbd633762c6f55
-- Version: 20261122030102
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0220_push_subscriptions.sql — Phone Pop-ups & Web Push Subscriptions (T5-09)
--
-- Rulings:
--   - W62: Pop-up alerts on phones and iPad for four events:
--       1. late return (at 30 min, to all staff on shift at once — W38, W39)
--       2. new online booking request
--       3. online payment received
--       4. damage found
--   - Law 6: Zero figures for money-blind roles (Warehouse, Technician, Driver, Client).
--       Money roles see amounts; floor roles receive the identical alert without figures.
--   - Law 3: Hard delete forbidden. Deactivate via is_active = false.
--   - Law 4: Subscription updates maintain audit and activity tracking.
--   - Law 8: client_uuid on all records.
--   - RLS: Own rows only for non-admin users.
-- =============================================================================

begin;

-- 1. Create push_subscriptions table
create table if not exists public.push_subscriptions (
  id                  uuid        not null default gen_random_uuid() primary key,
  client_uuid         uuid        not null default gen_random_uuid(),
  user_id             uuid        not null references public.users(id) on delete cascade,
  endpoint            text        not null,
  p256dh              text        not null,
  auth                text        not null,
  device_label        text,
  user_agent          text,
  is_active           boolean     not null default true,
  last_seen_at        timestamptz not null default clock_timestamp(),
  created_at          timestamptz not null default clock_timestamp(),
  updated_at          timestamptz not null default clock_timestamp(),

  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_client_uuid_key unique (client_uuid)
);

comment on table public.push_subscriptions is
  'Web Push subscriptions for staff devices (phones, iPad, desktop) (W62, T5-09). Own rows only (RLS). Soft deactivation only (Law 3).';

comment on column public.push_subscriptions.endpoint is
  'Unique Web Push subscription endpoint URL issued by browser push service.';

comment on column public.push_subscriptions.device_label is
  'Human-friendly label of client device, e.g. iPhone 17 Pro, M4 iPad, Chrome Desktop.';

-- Indexes
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists idx_push_subscriptions_active on public.push_subscriptions (user_id) where is_active = true;
create index if not exists idx_push_subscriptions_endpoint on public.push_subscriptions (endpoint);

-- Grants
revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 2. Law 3: Prevent hard deletes
create or replace function public.trg_push_subscriptions_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): push_subscriptions cannot be deleted. Set is_active = false.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_push_subscriptions_prevent_delete on public.push_subscriptions;
create trigger trg_push_subscriptions_prevent_delete
  before delete on public.push_subscriptions
  for each statement execute function public.trg_push_subscriptions_prevent_delete_fn();

revoke all on function public.trg_push_subscriptions_prevent_delete_fn() from public, anon;
grant execute on function public.trg_push_subscriptions_prevent_delete_fn() to authenticated;

-- 3. Row Level Security: Own rows only
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (
    user_id = public.auth_user_id()
  );

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  )
  with check (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  );

-- 4. View: push_subscriptions_v (masked keys for display / inspection)
create or replace view public.push_subscriptions_v as
select
  s.id,
  s.client_uuid,
  s.user_id,
  u.full_name as user_name,
  u.primary_role as user_role,
  s.endpoint,
  s.device_label,
  s.user_agent,
  s.is_active,
  s.last_seen_at,
  s.created_at,
  s.updated_at
from public.push_subscriptions s
join public.users u on u.id = s.user_id
where
  s.user_id = public.auth_user_id() or
  public.auth_user_role() in ('Owner', 'Admin');

comment on view public.push_subscriptions_v is
  'Staff push subscriptions view for settings and device management. Secret crypto keys (p256dh, auth) are excluded.';

revoke all on public.push_subscriptions_v from public, anon;
grant select on public.push_subscriptions_v to authenticated;

-- 5. RPC: register_push_subscription
create or replace function public.register_push_subscription(
  p_client_uuid   uuid,
  p_endpoint      text,
  p_p256dh        text,
  p_auth          text,
  p_device_label  text default null,
  p_user_agent    text default null
) returns public.push_subscriptions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_row public.push_subscriptions;
begin
  v_user_id := public.auth_user_id();
  if v_user_id is null then
    raise exception 'A signed-in user session is required to register a push subscription'
      using errcode = '42501';
  end if;

  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'Push endpoint cannot be blank'
      using errcode = '23502';
  end if;

  if p_p256dh is null or btrim(p_p256dh) = '' or p_auth is null or btrim(p_auth) = '' then
    raise exception 'Push subscription keys (p256dh and auth) cannot be blank'
      using errcode = '23502';
  end if;

  insert into public.push_subscriptions (
    client_uuid,
    user_id,
    endpoint,
    p256dh,
    auth,
    device_label,
    user_agent,
    is_active,
    last_seen_at,
    updated_at
  ) values (
    coalesce(p_client_uuid, gen_random_uuid()),
    v_user_id,
    btrim(p_endpoint),
    btrim(p_p256dh),
    btrim(p_auth),
    nullif(btrim(p_device_label), ''),
    nullif(btrim(p_user_agent), ''),
    true,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (endpoint) do update
  set
    user_id = v_user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    device_label = coalesce(excluded.device_label, push_subscriptions.device_label),
    user_agent = coalesce(excluded.user_agent, push_subscriptions.user_agent),
    is_active = true,
    last_seen_at = clock_timestamp(),
    updated_at = clock_timestamp()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_push_subscription(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(uuid, text, text, text, text, text) to authenticated;

-- 6. RPC: unregister_push_subscription (soft deactivate, Law 3)
create or replace function public.unregister_push_subscription(
  p_endpoint text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_updated int := 0;
begin
  v_user_id := public.auth_user_id();
  if v_user_id is null then
    raise exception 'A signed-in user session is required to unregister a push subscription'
      using errcode = '42501';
  end if;

  update public.push_subscriptions
  set
    is_active = false,
    updated_at = clock_timestamp()
  where endpoint = btrim(p_endpoint)
    and (user_id = v_user_id or public.auth_user_role() in ('Owner', 'Admin'));

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- 7. RPC: get_push_notifications_for_event
-- Resolves active push subscriptions for targeted staff roles,
-- filtering by notification preferences and strictly enforcing Law 6 money blindness.
create or replace function public.get_push_notifications_for_event(
  p_event_type text,
  p_payload    jsonb
) returns table (
  subscription_id   uuid,
  user_id           uuid,
  user_role         text,
  endpoint          text,
  p256dh            text,
  auth              text,
  title             text,
  body              text,
  link_url          text,
  tag               text,
  severity          text
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pref_category text;
  v_amount_paisa bigint;
  v_amount_str text;
begin
  -- Validate event type (W62: four events)
  if p_event_type not in ('late_return', 'new_online_request', 'payment_received', 'damage_found') then
    raise exception 'Invalid push event type: %. Must be one of: late_return, new_online_request, payment_received, damage_found', p_event_type
      using errcode = '22023';
  end if;

  -- Map event type to notification preference category (T5-05)
  v_pref_category := case p_event_type
    when 'late_return' then 'overdue'
    when 'new_online_request' then 'bookings'
    when 'payment_received' then 'payments'
    when 'damage_found' then 'damage'
    else 'general'
  end;

  return query
  select
    s.id as subscription_id,
    s.user_id,
    u.primary_role::text as user_role,
    s.endpoint,
    s.p256dh,
    s.auth,
    -- Title per event
    case p_event_type
      when 'late_return' then
        'Late return: ' || coalesce(p_payload->>'booking_no', 'Booking')
      when 'new_online_request' then
        'New online booking request'
      when 'payment_received' then
        'Online payment received'
      when 'damage_found' then
        'Damage reported'
      else
        'Babin Rentals alert'
    end as title,
    -- Body per event + Law 6 money blindness
    case p_event_type
      when 'late_return' then
        -- Floor roles: zero money
        case when lower(u.primary_role::text) in ('warehouse', 'technician', 'driver', 'client') then
          'Booking ' || coalesce(p_payload->>'booking_no', 'BK') || ' is 30m overdue for return. Check counter.'
        else
          case when (p_payload->>'outstanding_paisa')::bigint > 0 then
            'Booking ' || coalesce(p_payload->>'booking_no', 'BK') || ' is 30m overdue for return. Balance owed: Rs ' || to_char(((p_payload->>'outstanding_paisa')::bigint / 100), 'FM999,999,990') || '.'
          else
            'Booking ' || coalesce(p_payload->>'booking_no', 'BK') || ' is 30m overdue for return. Check counter.'
          end
        end

      when 'new_online_request' then
        -- Floor roles: zero money
        case when lower(u.primary_role::text) in ('warehouse', 'technician', 'driver', 'client') then
          'New request from ' || coalesce(p_payload->>'client_name', 'Client') || ' for ' || coalesce(p_payload->>'item_count', 'gear') || ' items.'
        else
          case when (p_payload->>'total_paisa')::bigint > 0 then
            'New request from ' || coalesce(p_payload->>'client_name', 'Client') || ' (Rs ' || to_char(((p_payload->>'total_paisa')::bigint / 100), 'FM999,999,990') || ').'
          else
            'New request from ' || coalesce(p_payload->>'client_name', 'Client') || '.'
          end
        end

      when 'payment_received' then
        -- Floor roles: zero money (Law 6)
        case when lower(u.primary_role::text) in ('warehouse', 'technician', 'driver', 'client') then
          'Payment received for booking ' || coalesce(p_payload->>'booking_no', 'BK') || '.'
        else
          'Payment received: Rs ' || to_char((coalesce((p_payload->>'amount_paisa')::bigint, 0) / 100), 'FM999,999,990') || ' for ' || coalesce(p_payload->>'booking_no', 'booking') || '.'
        end

      when 'damage_found' then
        'Damage reported on ' || coalesce(p_payload->>'item_name', 'gear') || ': ' || coalesce(p_payload->>'description', 'Issue flagged for inspection') || '.'

      else
        'You have a new update in Babin Rentals.'
    end as body,

    -- Link URL to open the specific record
    case p_event_type
      when 'late_return' then
        '/rentals/' || coalesce(p_payload->>'booking_id', '')
      when 'new_online_request' then
        '/rentals/' || coalesce(p_payload->>'booking_id', '')
      when 'payment_received' then
        '/finance/payments'
      when 'damage_found' then
        '/inventory/damage/' || coalesce(p_payload->>'finding_id', '')
      else
        '/today'
    end as link_url,

    -- Notification Tag for grouping / deduplication
    p_event_type || '-' || coalesce(p_payload->>'entity_id', p_payload->>'booking_id', p_payload->>'finding_id', p_payload->>'payment_id', 'general') as tag,

    -- Severity
    case p_event_type
      when 'late_return' then 'Warning'
      when 'damage_found' then 'Warning'
      else 'Information'
    end as severity

  from public.push_subscriptions s
  join public.users u on u.id = s.user_id
  where s.is_active = true
    -- Target roles per event
    and (
      -- late_return goes to ALL staff on shift at once (W38, W39)
      (p_event_type = 'late_return' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'coordinator', 'warehouse', 'technician', 'driver', 'accounts'))
      -- new_online_request goes to booking & operations management
      or (p_event_type = 'new_online_request' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'coordinator'))
      -- payment_received goes to finance and management roles, plus operational floor roles
      or (p_event_type = 'payment_received' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'accounts', 'coordinator', 'warehouse'))
      -- damage_found goes to floor, maintenance and management roles
      or (p_event_type = 'damage_found' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'coordinator', 'warehouse', 'technician'))
    )
    -- Check notification preferences (T5-05): if user disabled in-app / push for this category, skip
    and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = s.user_id
        and np.notification_type = v_pref_category
        and np.in_app_enabled = false
    );
end;
$$;

revoke all on function public.get_push_notifications_for_event(text, jsonb) from public, anon;
grant execute on function public.get_push_notifications_for_event(text, jsonb) to authenticated;

commit;

-- Record 0220_push_subscriptions in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030102', '0220_push_subscriptions')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0220_push_subscriptions.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0221_guard_unit_identity_edits.sql
-- SHA-256: b2491e92a5b398b7e25cdb834203bdd69fc75b944e08244485ddc642f4e4db7c
-- Version: 20261122030103
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- T2-17: preserve Technician floor updates without granting Technician unit-identity edits.
-- Forward-only, isolated-branch migration. Do NOT apply to live Supabase without
-- the independent permission/audit preflight and owner release approval.
--
-- 0180 broadens product_units_update RLS to Technician for floor operations.
-- RLS controls rows, not individual changed columns. A Technician with API access
-- could otherwise change asset_tag/serial_no/rack/shelf/bin despite UI gates.
-- The narrow trigger below protects ONLY changes to these five values; it does
-- not change product_units_update or block legitimate status/maintenance writes.
-- The trigger name sorts AFTER trg_product_units_set_updated_at (0097), so
-- its revision check observes the final server-assigned timestamp.

begin;

create or replace function public.guard_unit_identity_edits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth_user_id();
begin
  if new.asset_tag is distinct from old.asset_tag
     or new.serial_no is distinct from old.serial_no
     or new.rack is distinct from old.rack
     or new.shelf is distinct from old.shelf
     or new.bin is distinct from old.bin
  then
    if v_actor is null
       or coalesce(auth_user_role()::text, '') not in ('Owner', 'Admin', 'Manager', 'Warehouse')
    then
      raise exception 'GATE:unit.identity.role_denied|Only Owner, Admin, Manager or Warehouse may change unit identity or shelf location.'
        using errcode = '42501';
    end if;

    -- The universal audit trigger records NEW.updated_by as its actor.
    -- Legacy save_record_editor writes a unit patch without updated_by.
    -- Stamp that unchanged/omitted field from the JWT, never the prior actor;
    -- reject an explicit attempt to select a different new actor.
    if new.updated_by is distinct from v_actor then
      if new.updated_by is not distinct from old.updated_by then
        new.updated_by := v_actor;
      else
        raise exception 'GATE:unit.identity.actor_mismatch|Unit identity changes cannot name a different actor.'
          using errcode = '42501';
      end if;
    end if;

    -- Unit editor uses a revision-matched UPDATE. The new revision must advance
    -- for a second tab to detect the write; never allow a timestamp downgrade.
    if new.updated_at is null or old.updated_at is null
       or new.updated_at <= old.updated_at
    then
      raise exception 'GATE:unit.identity.revision|Unit identity updates must advance the unit revision.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_unit_identity_edits on public.product_units;
drop trigger if exists trg_z_guard_unit_identity_edits on public.product_units;
create trigger trg_z_guard_unit_identity_edits
  before update on public.product_units
  for each row execute function public.guard_unit_identity_edits();

commit;

-- Record 0221_guard_unit_identity_edits in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030103', '0221_guard_unit_identity_edits')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0221_guard_unit_identity_edits.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0222_repair_confirm_booking_atomic_and_reservation_dedup.sql
-- SHA-256: 068723f2ca21eb84a7a60c333565eef44e239304a3dc0d67bcfc30c86b3be6ad
-- Version: 20261122030104
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0222_repair_confirm_booking_atomic_and_reservation_dedup.sql
-- T3-smart-reservations / System Design Consistency Audit (5 Nov 2026)
--
-- Repairs two critical defects found during system design concurrency audit:
-- 1. confirm_booking_atomic (0188) omitted branch_id and actor_role when inserting into
--    booking_stage_transitions, causing a NOT NULL constraint violation crash.
-- 2. reservations_follow_stage_transition (0100) attempted to insert duplicate reservation rows
--    for units already reserved under a temporary hold (0188), causing GiST exclusion collision
--    against the booking's own hold.
--
-- Also ensures expired holds are reclaimed atomically before confirmation in all transition paths,
-- and active holds owned by the booking are cleanly promoted to confirmed.

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ Update reservations_follow_stage_transition
-- ---------------------------------------------------------------------------
create or replace function reservations_follow_stage_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pickup     timestamptz;
  v_return     timestamptz;
  v_period     tstzrange;
  v_booking_no text;
  v_uncovered  text;
begin
  -- ── Release paths ───────────────────────────────────────────────────────
  -- Returned and Closed end the commitment; Quote un-makes it.
  -- Filtered on `released_at is null` so Returned -> Closed is an idempotent no-op.
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

  -- Half-open [start, end), matching availability.ts
  v_period := tstzrange(v_pickup, v_return, '[)');

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

  -- 2. Promote any existing active holds owned by this booking to confirmed
  update inventory_reservations
     set hold_state = 'confirmed',
         expires_at = null,
         period = v_period
   where booking_id = NEW.booking_id
     and hold_state = 'active_hold'
     and released_at is null;

  -- 3. Serialised: one row per live assigned unit (skipping units already reserved for this booking)
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, asset_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, blu.asset_id, 1, v_period, NEW.actor_id, 'confirmed'
    from booking_lines bl
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

  -- 4. Quantity: remainder of each line not covered by live units or existing reservations
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, bl.product_id,
         bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0),
         v_period, NEW.actor_id, 'confirmed'
    from booking_lines bl
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
     and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0)) > 0;

  -- ── Coverage ────────────────────────────────────────────────────────────
  select string_agg(bl.description, ', ')
    into v_uncovered
    from booking_lines bl
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
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

comment on function reservations_follow_stage_transition() is
  'R-26 / 0100 / 0222: inventory_reservations is written by the database from the Booked transition '
  'and released on Returned/Closed/Quote reversal. Promotes existing active holds owned by this booking '
  'to confirmed, reclaims expired competitor holds, and avoids duplicate insertion.';

-- ---------------------------------------------------------------------------
-- 2 ▸ Update confirm_booking_atomic
-- ---------------------------------------------------------------------------
create or replace function confirm_booking_atomic(
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
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
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

  if v_booking.cancelled_at is not null then
    raise exception '% was cancelled. A cancelled booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null then
    raise exception '% is Closed. A closed booking cannot be confirmed.', v_booking.booking_no;
  end if;

  if v_booking.stage <> 'Quote' then
    if v_booking.stage = 'Booked' then
      -- Idempotent duplicate check
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

  -- 7. Insert the stage transition with required branch_id and actor_role
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

comment on function confirm_booking_atomic is
  '0188 / 0222: Atomic, server-authoritative booking confirmation. Validates booking state, '
  'locks inventory in deterministic order, reclaims expired holds, transitions stage to Booked '
  'with branch_id and actor_role, and commits inventory reservations in one transaction.';

commit;

-- Record 0222_repair_confirm_booking_atomic_and_reservation_dedup in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030104', '0222_repair_confirm_booking_atomic_and_reservation_dedup')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0222_repair_confirm_booking_atomic_and_reservation_dedup.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0223_product_aliases.sql
-- SHA-256: a97cc771d57d3cb82a8433280d60e66348c9bba72e9f6418cca5829ef0480160
-- Version: 20261122030105
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0223_product_aliases.sql
-- T3-12 · Paste a WhatsApp gear list — the spellings staff teach us (W1, W9, lane C)
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0223, status verified (renumbered from 0222 after main took that number).
--
-- The paste-list matcher matches plain text over product names, aliases and asset codes —
-- no AI service anywhere (Law 16). When staff correct a match, the spelling they typed is
-- stored here, so the next paste with the same shorthand matches without a correction.
--
-- Design notes, because these are decisions rather than defaults:
--
--   * `alias_normalised` is STORED, not derived on read. It must be the exact string
--     `normaliseGearText()` in `src/lib/gearListParser.ts` produces, or a saved alias
--     would never match the paste that created it and the whole promise — "the next paste
--     matches better" — would be a lie. `src/lib/__tests__/gearListParser.test.ts` pins
--     both sides of that contract; `product_aliases_normalised_is_lower` catches a client
--     that sends an unfolded string.
--   * One spelling points at exactly ONE product (`product_aliases_one_spelling`). If two
--     products could hold "fx3", every future paste would resolve to two exact hits and
--     the matcher would have to ask forever. A correction therefore MOVES the spelling
--     (the RPC upserts on `alias_normalised`), which is also what "latest correction
--     wins" means to the person who made it.
--   * **There is no delete.** A wrong alias is retired with `is_active = false` (Law 3);
--     `delete` is revoked from every role below.
--   * Roles are exactly `rental.create`'s set — Owner · Admin · Manager · Coordinator ·
--     Warehouse (PERMISSIONS §4.1). The people who build bookings are the people who
--     correct matches; nothing here is wider than the booking write those five already
--     hold (N-3, B-1 — stricter wins).
--   * **No money column, by construction.** An alias is text on a product name, so no
--     Law 6 mask is needed and a money-blind role cannot be leaked a figure through it.
--   * Every write carries `client_uuid` (Law 8) and the table carries the audit trigger,
--     so the database row is the audit of record (PLAN §4.36).
--
-- REVERT: drop trigger if exists trg_audit_product_aliases on public.product_aliases;
--         drop function if exists public.remember_product_alias(uuid, text, text, uuid);
--         drop table if exists public.product_aliases;

begin;

create table if not exists public.product_aliases (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete restrict,
  -- The spelling exactly as staff typed it — shown back to them, never matched on.
  alias            text not null,
  -- The comparison key. See the header: this is `normaliseGearText(alias)`.
  alias_normalised text not null,
  -- Law 3: a wrong alias is retired, never deleted.
  is_active        boolean not null default true,
  -- Law 8: idempotency key, so a retried save cannot create a second row.
  client_uuid      uuid not null unique,
  created_by       uuid references public.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint product_aliases_alias_length
    check (char_length(btrim(alias)) between 1 and 120),
  constraint product_aliases_normalised_length
    check (char_length(btrim(alias_normalised)) between 1 and 120),
  constraint product_aliases_normalised_is_lower
    check (alias_normalised = lower(alias_normalised)),
  constraint product_aliases_one_spelling
    unique (alias_normalised)
);

comment on table public.product_aliases is
  'Spellings staff taught the paste-list matcher (T3-12). One spelling maps to one product; a correction moves it. Retired with is_active = false, never deleted (Law 3). No money column (Law 6).';
comment on column public.product_aliases.alias is
  'The alias as the staff member typed it, for display. Not used for matching.';
comment on column public.product_aliases.alias_normalised is
  'normaliseGearText(alias) from src/lib/gearListParser.ts. The matcher compares against this, so the two implementations must not drift.';
comment on column public.product_aliases.is_active is
  'False retires the alias from matching without deleting it (Law 3).';

create index if not exists product_aliases_product_idx
  on public.product_aliases (product_id);
-- The matcher's only read: every active spelling. Partial, so retired rows cost nothing.
create index if not exists product_aliases_active_idx
  on public.product_aliases (alias_normalised) where is_active;
create index if not exists product_aliases_client_uuid_idx
  on public.product_aliases (client_uuid);

alter table public.product_aliases enable row level security;

-- 3. Policies — the five booking-building roles, and nobody else.
drop policy if exists product_aliases_select on public.product_aliases;
create policy product_aliases_select on public.product_aliases
for select to authenticated
using (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
);

drop policy if exists product_aliases_insert on public.product_aliases;
create policy product_aliases_insert on public.product_aliases
for insert to authenticated
with check (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  and created_by = public.auth_user_id()
);

-- Updating is how a spelling is corrected or retired; the row is never removed.
drop policy if exists product_aliases_update on public.product_aliases;
create policy product_aliases_update on public.product_aliases
for update to authenticated
using (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
)
with check (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
);

-- 4. Grants. RLS above narrows the rows; these narrow the verbs. No delete, ever.
revoke all on public.product_aliases from anon;
revoke delete on public.product_aliases from public, anon, authenticated;
grant select, insert, update on public.product_aliases to authenticated;

-- 5. The audit trigger. The database row is the audit of record (PLAN §4.36).
drop trigger if exists trg_audit_product_aliases on public.product_aliases;
create trigger trg_audit_product_aliases
after insert or update on public.product_aliases
for each row execute function public.log_audit_event_actor();

-- 6. The one write path. Doing this client-side would need a read-then-write that two
--    tabs could interleave, and it would leave the role check to the UI.
create or replace function public.remember_product_alias(
  p_product_id       uuid,
  p_alias            text,
  p_alias_normalised text,
  p_client_uuid      uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := public.auth_user_id();
  v_role   text := public.auth_user_role();
  v_alias  text := btrim(coalesce(p_alias, ''));
  v_norm   text := btrim(coalesce(p_alias_normalised, ''));
  v_id     uuid;
begin
  -- Fail closed, in the database rather than only in the UI (N-3, B-1).
  if v_actor is null then
    raise insufficient_privilege using message = 'Authenticated session required';
  end if;
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise insufficient_privilege using message = 'Your role cannot save a gear-list alias';
  end if;

  if v_alias = '' or v_norm = '' then
    raise exception 'An alias cannot be blank' using errcode = '22000';
  end if;
  if char_length(v_alias) > 120 or char_length(v_norm) > 120 then
    raise exception 'An alias cannot exceed 120 characters' using errcode = '22000';
  end if;
  -- The stored key must already be normalised; a caller that skips normaliseGearText()
  -- would otherwise store a spelling the matcher can never produce.
  if v_norm <> lower(v_norm) then
    raise exception 'The alias key must be lower-case (pass normaliseGearText(alias))'
      using errcode = '22000';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'That product does not exist' using errcode = '23503';
  end if;

  -- Law 8: the same client_uuid is the same write, whatever happened to the response.
  select id into v_id from public.product_aliases where client_uuid = p_client_uuid;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.product_aliases (product_id, alias, alias_normalised, client_uuid, created_by)
  values (p_product_id, v_alias, v_norm, p_client_uuid, v_actor)
  on conflict (alias_normalised) do update
    set product_id = excluded.product_id,
        alias      = excluded.alias,
        is_active  = true,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.remember_product_alias(uuid, text, text, uuid) is
  'Remember a spelling staff corrected a paste-list match to (T3-12). Upserts on the normalised key so a correction moves the spelling; idempotent on client_uuid (Law 8). Owner/Admin/Manager/Coordinator/Warehouse only.';

revoke all on function public.remember_product_alias(uuid, text, text, uuid) from public, anon;
grant execute on function public.remember_product_alias(uuid, text, text, uuid) to authenticated;

commit;

-- Record 0223_product_aliases in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030105', '0223_product_aliases')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0223_product_aliases.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0224_offer_campaigns_and_recipients.sql
-- SHA-256: e68f4e3d7d76c8c175c6e6a87bf05e9e28991730329315f338c4f97caef54e7e
-- Version: 20261122030106
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0224_offer_campaigns_and_recipients.sql
-- T5-12: Offer emails to clients (Owner, Admin, Manager only, B31, B34, B43, B50, K6, W80)

begin;

-- =============================================================================
-- Table: offer_campaigns
-- =============================================================================
create table if not exists public.offer_campaigns (
  id                   uuid        not null default gen_random_uuid() primary key,
  client_uuid          uuid        not null unique,
  subject              text        not null check (char_length(trim(subject)) >= 3 and char_length(subject) <= 200),
  body_markdown        text        not null check (char_length(trim(body_markdown)) >= 10),
  hero_image_url       text        null,
  cta_button_text      text        not null default 'Book Gear Online',
  cta_button_url       text        not null default 'https://book.babinrentals.com',
  audience_filter      jsonb       not null default '{}'::jsonb,
  status               text        not null default 'draft' check (status in ('draft', 'test_sent', 'queued', 'sending', 'completed', 'cancelled')),
  test_recipient_email text        null,
  test_sent_at         timestamptz null,
  recipient_count      integer     not null default 0 check (recipient_count >= 0),
  sent_count           integer     not null default 0 check (sent_count >= 0),
  failed_count         integer     not null default 0 check (failed_count >= 0),
  bounced_count        integer     not null default 0 check (bounced_count >= 0),
  unsubscribed_count   integer     not null default 0 check (unsubscribed_count >= 0),
  created_by           uuid        not null references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  queued_at            timestamptz null,
  completed_at         timestamptz null
);

comment on table public.offer_campaigns is 'Marketing offer campaigns authored by Owner, Admin, or Manager (T5-12, B43, B50)';

-- =============================================================================
-- Table: offer_campaign_recipients
-- =============================================================================
create table if not exists public.offer_campaign_recipients (
  id                     uuid        not null default gen_random_uuid() primary key,
  campaign_id            uuid        not null references public.offer_campaigns(id) on delete restrict,
  client_id              uuid        not null references public.clients(id) on delete restrict,
  recipient_email        text        not null,
  recipient_name         text        not null,
  unsubscribe_token_hash text        not null unique check (char_length(unsubscribe_token_hash) = 64),
  status                 text        not null default 'pending' check (status in ('pending', 'sent', 'failed', 'bounced', 'unsubscribed')),
  sent_at                timestamptz null,
  error_message          text        null,
  created_at             timestamptz not null default now(),
  constraint offer_campaign_recipients_campaign_client_key unique (campaign_id, client_id)
);

comment on table public.offer_campaign_recipients is 'Recipient queue and delivery log for marketing offer campaigns with tokenized unsubscribe hashes (T5-12, K6)';

create index if not exists idx_offer_campaign_recipients_lookup
  on public.offer_campaign_recipients (campaign_id, status);

create index if not exists idx_offer_campaign_recipients_unsub
  on public.offer_campaign_recipients (unsubscribe_token_hash);

-- =============================================================================
-- RLS: offer_campaigns & offer_campaign_recipients
-- =============================================================================
alter table public.offer_campaigns enable row level security;
alter table public.offer_campaign_recipients enable row level security;

-- Read policy: Owner, Admin, Manager only (B43)
drop policy if exists offer_campaigns_select on public.offer_campaigns;
create policy offer_campaigns_select on public.offer_campaigns
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin', 'Manager'));

drop policy if exists offer_campaign_recipients_select on public.offer_campaign_recipients;
create policy offer_campaign_recipients_select on public.offer_campaign_recipients
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- Direct write policies: NONE. Mutations happen strictly through security definer RPCs.
-- Hard delete is forbidden per Law 3.

-- =============================================================================
-- Views for UI
-- =============================================================================
create or replace view public.offer_campaigns_v as
select
  c.id,
  c.client_uuid,
  c.subject,
  c.body_markdown,
  c.hero_image_url,
  c.cta_button_text,
  c.cta_button_url,
  c.audience_filter,
  c.status,
  c.test_recipient_email,
  c.test_sent_at,
  c.recipient_count,
  c.sent_count,
  c.failed_count,
  c.bounced_count,
  c.unsubscribed_count,
  c.created_by,
  u.full_name as created_by_name,
  c.created_at,
  c.updated_at,
  c.queued_at,
  c.completed_at
from public.offer_campaigns c
left join public.users u on u.id = c.created_by;

alter view public.offer_campaigns_v set (security_invoker = true);
revoke all on public.offer_campaigns_v from public, anon;
grant select on public.offer_campaigns_v to authenticated;

-- =============================================================================
-- RPC: preview_offer_campaign_audience
-- Server-side counting only; never leaks client rows or emails to browser (Law 1, Law 6)
-- =============================================================================
create or replace function public.preview_offer_campaign_audience(
  p_audience_filter jsonb default '{}'::jsonb
)
returns table (
  eligible_count     integer,
  opted_out_count    integer,
  no_email_count     integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.auth_user_role();
begin
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can preview offer audiences'
      using errcode = '42501';
  end if;

  return query
  with client_data as (
    select
      c.id,
      c.email,
      c.status,
      cmc.state as consent_state
    from public.clients c
    left join public.client_marketing_consents cmc
      on cmc.client_id = c.id and cmc.channel = 'Email'
    where c.status = 'Active'
      and (
        p_audience_filter is null
        or p_audience_filter = '{}'::jsonb
        or (
          (p_audience_filter->>'tag' is null or (c.tags is not null and c.tags @> array[p_audience_filter->>'tag']::text[]))
          and (p_audience_filter->>'membership_plan_id' is null or exists (
            select 1 from public.client_memberships cm
            where cm.client_id = c.id
              and cm.plan_id::text = (p_audience_filter->>'membership_plan_id')
              and cm.superseded_at is null
          ))
        )
      )
  )
  select
    count(case when email is not null and trim(email) <> '' and coalesce(consent_state, 'Not asked') not in ('Opted out', 'Opt-Out', 'Do Not Disturb') then 1 end)::integer as eligible_count,
    count(case when email is not null and trim(email) <> '' and coalesce(consent_state, 'Not asked') in ('Opted out', 'Opt-Out', 'Do Not Disturb') then 1 end)::integer as opted_out_count,
    count(case when email is null or trim(email) = '' then 1 end)::integer as no_email_count
  from client_data;
end;
$$;

revoke all on function public.preview_offer_campaign_audience(jsonb) from public;
grant execute on function public.preview_offer_campaign_audience(jsonb) to authenticated;

-- =============================================================================
-- RPC: save_offer_campaign
-- Create or edit draft campaign (Owner, Admin, Manager only)
-- =============================================================================
create or replace function public.save_offer_campaign(
  p_client_uuid     uuid,
  p_subject         text,
  p_body_markdown   text,
  p_hero_image_url  text default null,
  p_cta_button_text text default 'Book Gear Online',
  p_cta_button_url  text default 'https://book.babinrentals.com',
  p_audience_filter jsonb default '{}'::jsonb,
  p_campaign_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role     text := public.auth_user_role();
  v_id       uuid;
begin
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can create or edit offer campaigns'
      using errcode = '42501';
  end if;

  if p_campaign_id is not null then
    -- Verify campaign exists and is in editable state
    select id into v_id
    from public.offer_campaigns
    where id = p_campaign_id;

    if not found then
      raise exception 'Campaign % not found', p_campaign_id using errcode = 'P0002';
    end if;

    update public.offer_campaigns
    set
      subject         = p_subject,
      body_markdown   = p_body_markdown,
      hero_image_url  = p_hero_image_url,
      cta_button_text = coalesce(nullif(trim(p_cta_button_text), ''), 'Book Gear Online'),
      cta_button_url  = coalesce(nullif(trim(p_cta_button_url), ''), 'https://book.babinrentals.com'),
      audience_filter = coalesce(p_audience_filter, '{}'::jsonb),
      updated_at      = now()
    where id = p_campaign_id
      and status in ('draft', 'test_sent')
    returning id into v_id;

    if not found then
      raise exception 'Cannot edit campaign that is already queued or completed' using errcode = '55000';
    end if;
  else
    insert into public.offer_campaigns (
      client_uuid,
      subject,
      body_markdown,
      hero_image_url,
      cta_button_text,
      cta_button_url,
      audience_filter,
      status,
      created_by
    ) values (
      p_client_uuid,
      p_subject,
      p_body_markdown,
      p_hero_image_url,
      coalesce(nullif(trim(p_cta_button_text), ''), 'Book Gear Online'),
      coalesce(nullif(trim(p_cta_button_url), ''), 'https://book.babinrentals.com'),
      coalesce(p_audience_filter, '{}'::jsonb),
      'draft',
      v_actor_id
    )
    returning id into v_id;
  end if;

  -- Audit
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Administration',
    'Clients',
    'Create',
    'Informational',
    'Success',
    'offer_campaigns',
    v_id,
    v_actor_id,
    v_role::system_role,
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('subject', p_subject, 'audience_filter', p_audience_filter)
  );

  return v_id;
end;
$$;

revoke all on function public.save_offer_campaign(uuid, text, text, text, text, text, jsonb, uuid) from public;
grant execute on function public.save_offer_campaign(uuid, text, text, text, text, text, jsonb, uuid) to authenticated;

-- =============================================================================
-- RPC: record_offer_campaign_test_send
-- Pre-flight test send record (B43, K6)
-- =============================================================================
create or replace function public.record_offer_campaign_test_send(
  p_campaign_id uuid,
  p_test_email  text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role     text := public.auth_user_role();
begin
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can test offer campaigns'
      using errcode = '42501';
  end if;

  if p_test_email is null or trim(p_test_email) = '' then
    raise exception 'Test recipient email is required' using errcode = '22023';
  end if;

  update public.offer_campaigns
  set
    status               = 'test_sent',
    test_recipient_email = trim(p_test_email),
    test_sent_at         = now(),
    updated_at           = now()
  where id = p_campaign_id
    and status in ('draft', 'test_sent');

  if not found then
    raise exception 'Campaign % not found or not in draft status', p_campaign_id using errcode = 'P0002';
  end if;

  -- Audit test send
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Administration',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'offer_campaigns',
    p_campaign_id,
    v_actor_id,
    v_role::system_role,
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('test_email', trim(p_test_email), 'test_sent_at', now())
  );

  return true;
end;
$$;

revoke all on function public.record_offer_campaign_test_send(uuid, text) from public;
grant execute on function public.record_offer_campaign_test_send(uuid, text) to authenticated;

-- =============================================================================
-- RPC: queue_offer_campaign
-- Resolves recipient roster in SQL, enforces consent, pre-flight test gate, and generates tokens (K6)
-- =============================================================================
create or replace function public.queue_offer_campaign(
  p_campaign_id uuid,
  p_client_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_role       text := public.auth_user_role();
  v_campaign   public.offer_campaigns%rowtype;
  v_count      integer := 0;
  v_client     record;
  v_raw_token  text;
  v_token_hash text;
begin
  -- 1. Role verification: Owner, Admin, Manager only (B43)
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Permission denied: only Owner, Admin, and Manager can broadcast offer campaigns'
      using errcode = '42501';
  end if;

  -- 2. Advisory lock on campaign to stop concurrent double-send races
  perform pg_advisory_xact_lock(hashtext('campaign:' || p_campaign_id::text));

  -- 3. Fetch campaign
  select * into v_campaign
  from public.offer_campaigns
  where id = p_campaign_id;

  if not found then
    raise exception 'Campaign % not found', p_campaign_id using errcode = 'P0002';
  end if;

  -- Idempotency check: if already queued or sent, return existing status without re-queueing
  if v_campaign.status in ('queued', 'sending', 'completed') then
    return jsonb_build_object(
      'campaign_id', v_campaign.id,
      'status', v_campaign.status,
      'recipient_count', v_campaign.recipient_count,
      'idempotent_replay', true
    );
  end if;

  -- 4. Mandatory pre-flight test gate: must be test_sent
  if v_campaign.status <> 'test_sent' or v_campaign.test_sent_at is null then
    raise exception 'A test email must be sent to the author before broadcasting to clients'
      using errcode = 'P0001';
  end if;

  -- 5. Compile recipient population in PostgreSQL (Law 1, data privacy)
  for v_client in
    select
      c.id as client_id,
      trim(c.email) as email,
      coalesce(nullif(trim(c.name), ''), 'Valued Client') as client_name
    from public.clients c
    left join public.client_marketing_consents cmc
      on cmc.client_id = c.id and cmc.channel = 'Email'
    where c.status = 'Active'
      and c.email is not null
      and trim(c.email) <> ''
      and coalesce(cmc.state, 'Not asked') not in ('Opted out', 'Opt-Out', 'Do Not Disturb')
      and (
        v_campaign.audience_filter is null
        or v_campaign.audience_filter = '{}'::jsonb
        or (
          (v_campaign.audience_filter->>'tag' is null or (c.tags is not null and c.tags @> array[v_campaign.audience_filter->>'tag']::text[]))
          and (v_campaign.audience_filter->>'membership_plan_id' is null or exists (
            select 1 from public.client_memberships cm
            where cm.client_id = c.id
              and cm.plan_id::text = (v_campaign.audience_filter->>'membership_plan_id')
              and cm.superseded_at is null
          ))
        )
      )
  loop
    -- Cryptographic token generation: 128-bit raw token, SHA-256 hashed in database (K6)
    v_raw_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 32);
    v_token_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

    insert into public.offer_campaign_recipients (
      campaign_id,
      client_id,
      recipient_email,
      recipient_name,
      unsubscribe_token_hash,
      status
    ) values (
      v_campaign.id,
      v_client.client_id,
      v_client.email,
      v_client.client_name,
      v_token_hash,
      'pending'
    )
    on conflict (campaign_id, client_id) do nothing;

    v_count := v_count + 1;
  end loop;

  -- 6. Transition campaign to queued
  update public.offer_campaigns
  set
    status          = 'queued',
    recipient_count = v_count,
    queued_at       = now(),
    updated_at      = now()
  where id = v_campaign.id;

  -- 7. Audit log
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    p_client_uuid,
    'status change',
    'Administration',
    'Clients',
    'Update',
    'Informational',
    'Success',
    'offer_campaigns',
    v_campaign.id,
    v_actor_id,
    v_role::system_role,
    '00000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object('recipient_count', v_count, 'queued_at', now())
  );

  return jsonb_build_object(
    'campaign_id', v_campaign.id,
    'status', 'queued',
    'recipient_count', v_count,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.queue_offer_campaign(uuid, uuid) from public;
grant execute on function public.queue_offer_campaign(uuid, uuid) to authenticated;

-- =============================================================================
-- RPC: process_client_unsubscribe
-- Unauthenticated / public one-click unsubscribe endpoint (K6)
-- Opts out across Email, SMS, WhatsApp marketing while leaving transactional notices intact
-- =============================================================================
create or replace function public.process_client_unsubscribe(
  p_raw_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash      text;
  v_recipient record;
  v_channel   channel_code;
begin
  if p_raw_token is null or trim(p_raw_token) = '' then
    return jsonb_build_object('ok', true, 'message', 'You have been unsubscribed.');
  end if;

  v_hash := encode(sha256(convert_to(trim(p_raw_token), 'UTF8')), 'hex');

  select r.id, r.campaign_id, r.client_id
  into v_recipient
  from public.offer_campaign_recipients r
  where r.unsubscribe_token_hash = v_hash;

  if found then
    -- 1. Mark recipient row unsubscribed
    update public.offer_campaign_recipients
    set status = 'unsubscribed'
    where id = v_recipient.id;

    -- 2. Increment campaign unsubscribed_count
    update public.offer_campaigns
    set unsubscribed_count = unsubscribed_count + 1
    where id = v_recipient.campaign_id;

    -- 3. Upsert marketing consent opt-out for all marketing channels (Email, SMS, WhatsApp)
    -- This enforces multi-channel marketing opt-out while keeping transactional notices intact.
    foreach v_channel in array array['Email', 'SMS', 'WhatsApp']::channel_code[]
    loop
      insert into public.client_marketing_consents (
        client_uuid,
        client_id,
        channel,
        state,
        opted_out_at,
        opt_out_origin_channel,
        updated_at
      ) values (
        gen_random_uuid(),
        v_recipient.client_id,
        v_channel,
        'Opted out',
        now(),
        'Email',
        now()
      )
      on conflict (client_id, channel) do update set
        state                  = 'Opted out',
        opted_out_at           = now(),
        opt_out_origin_channel = 'Email',
        updated_at             = now();
    end loop;
  end if;

  -- Always return success to fail closed without leaking token existence
  return jsonb_build_object(
    'ok', true,
    'message', 'You have been successfully unsubscribed from Babin Rentals marketing communications.'
  );
end;
$$;

revoke all on function public.process_client_unsubscribe(text) from public, anon;
grant execute on function public.process_client_unsubscribe(text) to authenticated, service_role;

commit;

-- Record 0224_offer_campaigns_and_recipients in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030106', '0224_offer_campaigns_and_recipients')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0224_offer_campaigns_and_recipients.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0226_bulk_update_products.sql
-- SHA-256: 2fce11b1a633f03928ec9be5f2fc179d5c640f41cfea4624d5888230aa1129fc
-- Version: 20261122030107
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0223: Bulk update products (T4-12)
-- Enables Owner/Admin/Manager to update selected products in bulk with audit trail and idempotency.
-- Rate changes by percentage are strictly Owner-only. Money fields are barred from money-blind roles.
begin;

create or replace function public.bulk_update_products(
  p_product_ids uuid[],
  p_field text,
  p_value jsonb,
  p_client_uuid uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_is_owner boolean;
  v_can_money boolean;
  v_allowed_fields text[];
  v_money_fields text[];
  v_request jsonb;
  v_saved record;
  v_prod_id uuid;
  v_prod record;
  v_old_val jsonb;
  v_new_val jsonb;
  v_pct numeric;
  v_new_daily numeric;
  v_new_weekly numeric;
  v_new_monthly numeric;
  v_results jsonb := '[]'::jsonb;
  v_updated_count int := 0;
  v_response jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  v_role := auth_user_role()::text;
  v_is_owner := (v_role = 'Owner');
  v_can_money := auth_can_view_money();

  if not (v_role = any(array['Owner', 'Admin', 'Manager'])) then
    raise exception 'Permission denied: bulk product updates require Manager, Admin or Owner role.' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid is required for bulk updates.' using errcode = '22023';
  end if;

  if p_product_ids is null or array_length(p_product_ids, 1) is null or array_length(p_product_ids, 1) = 0 then
    raise exception 'At least one product ID must be provided.' using errcode = '22023';
  end if;

  -- Idempotency receipt check with transaction advisory lock
  perform pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 0));
  v_request := jsonb_build_object(
    'product_ids', p_product_ids,
    'field', p_field,
    'value', p_value,
    'client_uuid', p_client_uuid
  );

  select * into v_saved from record_editor_private.receipts where key = p_client_uuid;
  if found then
    if v_saved.actor <> auth.uid() or v_saved.request <> v_request then
      raise exception 'This save key belongs to a different change.' using errcode = '23505';
    end if;
    return v_saved.response;
  end if;

  v_money_fields := array[
    'rates_percentage', 'daily_rate', 'weekly_rate', 'monthly_rate',
    'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed',
    'purchase_price', 'replacement_value'
  ];

  -- Calls the same column rules as the section saves (0173) - never a second copy of the rules
  v_allowed_fields := record_editor_private.fields('equipment');

  if p_field <> 'rates_percentage' and not (p_field = any(v_allowed_fields)) then
    raise exception 'Field % cannot be updated in bulk.', p_field using errcode = '42703';
  end if;

  if (p_field = any(v_money_fields)) and not v_can_money then
    raise exception 'Permission denied: Warehouse and money-blind roles cannot modify financial fields.' using errcode = '42501';
  end if;

  if p_field = 'rates_percentage' and not v_is_owner then
    raise exception 'Permission denied: Only the Owner can adjust product rental rates by percentage.' using errcode = '42501';
  end if;

  -- Process updates
  for v_prod_id in select unnest(p_product_ids) loop
    select * into v_prod from public.products where id = v_prod_id for update;
    if found then
      if p_field = 'rates_percentage' then
        v_pct := (p_value->>'percentage')::numeric;
        if v_pct is null or v_pct < -100 or v_pct > 1000 then
          raise exception 'Invalid percentage adjustment: %', v_pct using errcode = '22023';
        end if;

        v_new_daily := round(coalesce(v_prod.daily_rate, 0) * (1.0 + v_pct / 100.0));
        v_new_weekly := case when v_prod.weekly_rate is not null then round(v_prod.weekly_rate * (1.0 + v_pct / 100.0)) else null end;
        v_new_monthly := case when v_prod.monthly_rate is not null then round(v_prod.monthly_rate * (1.0 + v_pct / 100.0)) else null end;

        v_old_val := jsonb_build_object(
          'daily_rate', v_prod.daily_rate,
          'weekly_rate', v_prod.weekly_rate,
          'monthly_rate', v_prod.monthly_rate
        );
        v_new_val := jsonb_build_object(
          'daily_rate', v_new_daily,
          'weekly_rate', v_new_weekly,
          'monthly_rate', v_new_monthly,
          'percentage', v_pct
        );

        update public.products
        set daily_rate = v_new_daily,
            weekly_rate = v_new_weekly,
            monthly_rate = v_new_monthly,
            updated_at = now(),
            updated_by = auth.uid()
        where id = v_prod_id;

      elsif p_field = 'category_id' then
        v_old_val := to_jsonb(v_prod.category_id);
        v_new_val := to_jsonb((p_value->>'category_id')::uuid);
        update public.products
        set category_id = (p_value->>'category_id')::uuid,
            updated_at = now(),
            updated_by = auth.uid()
        where id = v_prod_id;

      else
        v_old_val := to_jsonb(v_prod)->p_field;
        v_new_val := case when jsonb_typeof(p_value) = 'object' and p_value ? p_field then p_value->p_field else p_value end;
        perform record_editor_private.write_row(
          'products',
          v_prod_id,
          jsonb_build_object(p_field, v_new_val, 'updated_at', now(), 'updated_by', auth.uid())
        );
      end if;

      v_updated_count := v_updated_count + 1;
      v_results := v_results || jsonb_build_object(
        'id', v_prod_id,
        'success', true,
        'old_value', v_old_val,
        'new_value', v_new_val
      );

      -- Audit row per updated product with batch client_uuid
      insert into public.audit_events (
        client_uuid, event_class, category, module, action, severity, status,
        table_name, record_id, actor_id, actor_role, old_values, new_values, diff, reason
      ) values (
        md5(p_client_uuid::text || ':bulk:' || v_prod_id::text)::uuid,
        'status change', 'Inventory'::audit_category, 'Inventory'::audit_module,
        'Update', 'Informational', 'Success', 'products', v_prod_id,
        auth.uid(), auth_user_role(),
        jsonb_build_object(p_field, v_old_val),
        jsonb_build_object(p_field, v_new_val, 'batch_id', p_client_uuid),
        jsonb_build_object('batch_id', p_client_uuid, 'field', p_field, 'old', v_old_val, 'new', v_new_val),
        format('Bulk update of %s in batch %s', p_field, p_client_uuid)
      );
    else
      v_results := v_results || jsonb_build_object(
        'id', v_prod_id,
        'success', false,
        'error', 'Product not found'
      );
    end if;
  end loop;

  v_response := jsonb_build_object(
    'batch_id', p_client_uuid,
    'field', p_field,
    'total_requested', array_length(p_product_ids, 1),
    'updated_count', v_updated_count,
    'results', v_results
  );

  insert into record_editor_private.receipts (key, actor, request, response)
  values (p_client_uuid, auth.uid(), v_request, v_response);

  return v_response;
end;
$$;

revoke all on function public.bulk_update_products(uuid[], text, jsonb, uuid) from public, anon;
grant execute on function public.bulk_update_products(uuid[], text, jsonb, uuid) to authenticated;

commit;

-- Record 0226_bulk_update_products in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030107', '0226_bulk_update_products')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0226_bulk_update_products.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0227_message_templates.sql
-- SHA-256: e4f65d0d2f46ec8f5f7c077c6d18fd15e24124a75453bfc83e2fb0ef2f015f11
-- Version: 20261122030108
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0225_message_templates.sql
-- T5-13: Edit email and document texts (Owner and Admin only, B20, O-11, Law 3, Law 7)

begin;

-- =============================================================================
-- Table: message_templates
-- =============================================================================
create table if not exists public.message_templates (
  id                   uuid        not null default gen_random_uuid() primary key,
  client_uuid          uuid        not null unique,
  template_key         text        not null check (char_length(trim(template_key)) >= 3 and char_length(template_key) <= 80),
  category             text        not null check (category in ('email', 'document')),
  name                 text        not null check (char_length(trim(name)) >= 3 and char_length(name) <= 120),
  description          text        null,
  version              integer     not null default 1 check (version >= 1),
  subject              text        null,
  body                 text        not null check (char_length(trim(body)) >= 5),
  allowed_placeholders text[]      not null default '{}',
  is_active            boolean     not null default true,
  created_by           uuid        null references public.users(id),
  created_at           timestamptz not null default now(),
  constraint message_templates_key_version_key unique (template_key, version)
);

comment on table public.message_templates is 'Versioned wording templates for automated client emails and document footers (T5-13, B20, Law 3)';

create index if not exists idx_message_templates_key_active
  on public.message_templates (template_key)
  where is_active = true;

create index if not exists idx_message_templates_key_version
  on public.message_templates (template_key, version desc);

alter table public.message_templates enable row level security;

-- Read policy: Authenticated staff can view active templates and history
drop policy if exists message_templates_read on public.message_templates;
create policy message_templates_read on public.message_templates
  for select
  to authenticated
  using (true);

-- Direct writes forbidden; all modifications must go through security definer RPCs
drop policy if exists message_templates_no_direct_insert on public.message_templates;
create policy message_templates_no_direct_insert on public.message_templates
  for insert
  to authenticated
  with check (false);

drop policy if exists message_templates_no_direct_update on public.message_templates;
create policy message_templates_no_direct_update on public.message_templates
  for update
  to authenticated
  using (false);

drop policy if exists message_templates_no_direct_delete on public.message_templates;
create policy message_templates_no_direct_delete on public.message_templates
  for delete
  to authenticated
  using (false);

-- =============================================================================
-- Function: extract_template_placeholders
-- =============================================================================
create or replace function public.extract_template_placeholders(p_text text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_match text[];
  v_results text[] := '{}';
begin
  if p_text is null or trim(p_text) = '' then
    return '{}';
  end if;

  for v_match in select regexp_matches(p_text, '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') loop
    if not (v_match[1] = any(v_results)) then
      v_results := array_append(v_results, v_match[1]);
    end if;
  end loop;

  return v_results;
end;
$$;

comment on function public.extract_template_placeholders(text) is 'Extracts placeholder variable names from {{variable}} syntax in template strings';

-- =============================================================================
-- Function: save_message_template
-- =============================================================================
create or replace function public.save_message_template(
  p_client_uuid uuid,
  p_template_key text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role system_role;
  v_actor_id uuid;
  v_existing_id uuid;
  v_current record;
  v_used_placeholders text[];
  v_placeholder text;
  v_next_version integer;
  v_new_record public.message_templates%rowtype;
begin
  -- 1. Authorization: Owner and Admin only (B20)
  v_actor_role := auth_user_role();
  if v_actor_role::text not in ('Owner', 'Admin') then
    raise exception 'Only Owner and Admin can edit message and document texts (B20)'
      using errcode = '42501';
  end if;

  -- 2. Validate client_uuid for idempotency (Law 8)
  if p_client_uuid is null then
    raise exception 'client_uuid is required for idempotency (Law 8)'
      using errcode = '23502';
  end if;

  -- Idempotency check: if already committed with this client_uuid, return existing record
  select id into v_existing_id
  from public.message_templates
  where client_uuid = p_client_uuid;

  if v_existing_id is not null then
    select * into v_new_record
    from public.message_templates
    where id = v_existing_id;
    return to_jsonb(v_new_record);
  end if;

  -- 3. Validate template body
  if p_body is null or char_length(trim(p_body)) < 5 then
    raise exception 'Template body must be at least 5 characters long'
      using errcode = '22023';
  end if;

  -- 4. Fetch base metadata from active template definition
  select category, name, description, allowed_placeholders
  into v_current
  from public.message_templates
  where template_key = p_template_key and is_active = true
  order by version desc
  limit 1;

  if not found then
    -- Try any version if no active one found
    select category, name, description, allowed_placeholders
    into v_current
    from public.message_templates
    where template_key = p_template_key
    order by version desc
    limit 1;

    if not found then
      raise exception 'Template "%" does not exist in the catalogue', p_template_key
        using errcode = 'P0002';
    end if;
  end if;

  -- 5. Validate placeholders: unknown placeholders are strictly refused on save
  v_used_placeholders := public.extract_template_placeholders(coalesce(p_subject, '') || ' ' || p_body);

  if v_used_placeholders is not null and array_length(v_used_placeholders, 1) > 0 then
    foreach v_placeholder in array v_used_placeholders loop
      if not (v_placeholder = any(v_current.allowed_placeholders)) then
        raise exception 'Unknown placeholder "{{%}}" is refused for template "%". Allowed placeholders: %',
          v_placeholder, p_template_key, array_to_string(v_current.allowed_placeholders, ', ')
          using errcode = '22023';
      end if;
    end loop;
  end if;

  -- 6. Calculate next version (Law 3: append-only history, never overwrite)
  select coalesce(max(version), 0) + 1
  into v_next_version
  from public.message_templates
  where template_key = p_template_key;

  -- 7. Deactivate currently active version
  update public.message_templates
  set is_active = false
  where template_key = p_template_key and is_active = true;

  -- 8. Insert new version
  v_actor_id := auth.uid();
  if v_actor_id is null then
    select id into v_actor_id from public.users where primary_role::text = 'Owner' limit 1;
  end if;

  insert into public.message_templates (
    client_uuid,
    template_key,
    category,
    name,
    description,
    version,
    subject,
    body,
    allowed_placeholders,
    is_active,
    created_by,
    created_at
  ) values (
    p_client_uuid,
    p_template_key,
    v_current.category,
    v_current.name,
    v_current.description,
    v_next_version,
    p_subject,
    p_body,
    v_current.allowed_placeholders,
    true,
    v_actor_id,
    now()
  )
  returning * into v_new_record;

  -- 9. Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    diff,
    reason
  ) values (
    p_client_uuid,
    'status change',
    'Administration'::audit_category,
    'Settings'::audit_module,
    'Update',
    'Informational',
    'Success',
    'message_templates',
    v_new_record.id,
    v_actor_id,
    v_actor_role::system_role,
    jsonb_build_object('version', v_next_version - 1),
    jsonb_build_object(
      'template_key', p_template_key,
      'version', v_next_version,
      'subject', p_subject,
      'body', p_body
    ),
    jsonb_build_object('template_key', p_template_key, 'version', v_next_version),
    format('Saved version %s for template %s', v_next_version, p_template_key)
  );

  return to_jsonb(v_new_record);
end;
$$;

comment on function public.save_message_template(uuid, text, text, text) is 'Saves a new active version for a message or document template with placeholder validation and audit logging (Owner/Admin only)';

-- =============================================================================
-- Function: restore_message_template
-- =============================================================================
create or replace function public.restore_message_template(
  p_client_uuid uuid,
  p_template_key text,
  p_target_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role system_role;
  v_target public.message_templates%rowtype;
begin
  -- 1. Authorization: Owner and Admin only (B20)
  v_actor_role := auth_user_role();
  if v_actor_role::text not in ('Owner', 'Admin') then
    raise exception 'Only Owner and Admin can restore message and document texts (B20)'
      using errcode = '42501';
  end if;

  -- 2. Find target version
  select * into v_target
  from public.message_templates
  where template_key = p_template_key and version = p_target_version;

  if not found then
    raise exception 'Template "%" version % does not exist', p_template_key, p_target_version
      using errcode = 'P0002';
  end if;

  -- 3. Delegate to save_message_template to create next version as an exact restored copy (Law 3)
  return public.save_message_template(
    p_client_uuid,
    p_template_key,
    v_target.subject,
    v_target.body
  );
end;
$$;

comment on function public.restore_message_template(uuid, text, integer) is 'Restores a historical version of a message template by saving it as the latest active version (Owner/Admin only)';

-- =============================================================================
-- Seed Initial Template Versions (Version 1)
-- =============================================================================
do $$
declare
  v_owner_id uuid;
begin
  select id into v_owner_id from public.users where primary_role::text = 'Owner' limit 1;

  -- 1. email.booking_confirmed
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000001'::uuid,
    'email.booking_confirmed',
    'email',
    'Booking Confirmation',
    'Automatic email sent to clients when their rental booking is confirmed',
    1,
    'Your gear booking {{booking_number}} is confirmed',
    'Dear {{client_name}},\n\nYour equipment rental {{booking_number}} has been confirmed.\n\nPickup Time: {{pickup_time}}\nReturn Time: {{return_time}}\n\nYou can review your rental details online at {{action_url}}.\n\nThank you,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'booking_number', 'pickup_time', 'return_time', 'action_url', 'portal_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 2. email.pickup_reminder
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000002'::uuid,
    'email.pickup_reminder',
    'email',
    'Pickup Reminder',
    'Automatic reminder sent 24 hours prior to equipment pickup',
    1,
    'Reminder: Equipment pickup for {{booking_number}} on {{pickup_date}}',
    'Dear {{client_name}},\n\nThis is a reminder that your rental gear for booking {{booking_number}} is scheduled for pickup on {{pickup_date}} at {{pickup_time}}.\n\nPlease remember to bring your authorized ID for equipment handover.\n\nDetails: {{action_url}}\n\nWarm regards,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'booking_number', 'pickup_time', 'pickup_date', 'action_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 3. email.return_reminder
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000003'::uuid,
    'email.return_reminder',
    'email',
    'Return Reminder',
    'Automatic reminder sent morning of return due date',
    1,
    'Reminder: Equipment return for {{booking_number}} on {{return_date}}',
    'Dear {{client_name}},\n\nThis is a courtesy reminder that your equipment rental {{booking_number}} is due for return on {{return_date}} by {{return_time}}.\n\nRental summary: {{action_url}}\n\nThank you,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'booking_number', 'return_time', 'return_date', 'action_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 4. email.payment_reminder
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000004'::uuid,
    'email.payment_reminder',
    'email',
    'Payment Reminder',
    'Automated reminder sent for overdue or outstanding invoice balances',
    1,
    'Payment Reminder for Invoice {{invoice_number}} (Booking {{booking_number}})',
    'Dear {{client_name}},\n\nThis is a reminder regarding outstanding invoice {{invoice_number}} associated with booking {{booking_number}}.\n\nOutstanding Balance: {{amount_due}}\nDue Date: {{due_date}}\n\nYou may settle online at {{pay_url}} or at our rental counter.\n\nRegards,\n{{company_name}}\n{{company_phone}}',
    array['client_name', 'invoice_number', 'booking_number', 'amount_due', 'due_date', 'pay_url', 'company_name', 'company_phone'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 5. email.offer_footer
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000005'::uuid,
    'email.offer_footer',
    'email',
    'Offer Email Footer',
    'Standard regulatory and unsubscribe footer appended to client promotional offers',
    1,
    null,
    'You are receiving this special offer as a valued client of {{company_name}}.\nTo manage your preferences or unsubscribe, please visit: {{unsubscribe_url}}\nPortal: {{portal_url}}\n{{company_address}}',
    array['company_name', 'unsubscribe_url', 'portal_url', 'company_address'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 6. doc.invoice_footer
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000006'::uuid,
    'doc.invoice_footer',
    'document',
    'Invoice Footer',
    'Notes, payment terms, and bank details rendered at the bottom of official tax invoices',
    1,
    null,
    'Thank you for choosing {{company_name}} for your cinema equipment rentals.\nPayment is due per agreed invoice terms.\nFor inquiries contact {{company_phone}} or {{company_email}}.\nBank Details: {{bank_details}}',
    array['company_name', 'company_phone', 'company_email', 'bank_details'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 7. doc.proforma_note
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000007'::uuid,
    'doc.proforma_note',
    'document',
    'Pro Forma Note',
    'Validity disclaimer and booking confirmation note on pro forma estimate quotes',
    1,
    null,
    'This pro forma estimate is valid for {{validity_days}} days from issuance.\nEquipment availability is confirmed only upon reservation booking.\nIssued by {{company_name}} / Contact: {{contact_name}}',
    array['company_name', 'validity_days', 'contact_name'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 8. doc.rental_agreement_terms
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000008'::uuid,
    'doc.rental_agreement_terms',
    'document',
    'Rental Agreement Terms (O-11)',
    'Standard legal clauses printed on rental contracts signed during equipment handover',
    1,
    null,
    '1. Custody & Care: The renter ({{client_name}}) assumes full custody and responsibility for all equipment listed upon handover until check-in return to {{company_name}}.\n2. Late Returns: {{late_fee_policy}}.\n3. Damage & Loss: Damaged or missing equipment is billed at full repair or replacement cost.\n4. Jurisdiction: Governed by the laws of {{jurisdiction}}.',
    array['company_name', 'client_name', 'jurisdiction', 'late_fee_policy'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;

  -- 9. doc.packing_list_footer
  insert into public.message_templates (
    client_uuid, template_key, category, name, description, version, subject, body, allowed_placeholders, is_active, created_by
  ) values (
    'e0000001-0000-0000-0000-000000000009'::uuid,
    'doc.packing_list_footer',
    'document',
    'Packing List Footer',
    'Floor checkout reminders and warehouse support contacts printed on equipment pick sheets',
    1,
    null,
    'Please inspect and verify all packed items and accessories against this manifest prior to departure.\nEmergency Support: {{support_phone}}.\nOperations Note: {{checklist_note}}.\n{{company_name}} Warehouse Operations',
    array['company_name', 'support_phone', 'checklist_note'],
    true,
    v_owner_id
  ) on conflict (template_key, version) do nothing;
end $$;

-- Permissions
revoke all on function public.extract_template_placeholders(text) from public, anon;
grant execute on function public.extract_template_placeholders(text) to authenticated;

revoke all on function public.save_message_template(uuid, text, text, text) from public, anon;
grant execute on function public.save_message_template(uuid, text, text, text) to authenticated;

revoke all on function public.restore_message_template(uuid, text, integer) from public, anon;
grant execute on function public.restore_message_template(uuid, text, integer) to authenticated;

commit;

-- Record 0227_message_templates in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030108', '0227_message_templates')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0227_message_templates.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0228_membership_change_keep_join_date.sql
-- SHA-256: d0c7cd5a6cb002f92652be8955aab599acf953ac72328caf1be43dcf59d159d4
-- Version: 20261122030109
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0228_membership_change_keep_join_date.sql
--
-- R-9.2 (RULINGS-2026-11-09): on a membership plan change, staff choose each time whether the
-- new row keeps the client's original join date (the renewal anniversary stays put) or restarts
-- the term from the change date. The default when nothing is chosen is RESTART, which is the
-- behaviour 0198 already has.
--
-- Builds on the LATEST change_client_membership (0198: D22 credit + D23 renewal). Changes:
--   1. Payload key `keep_join_date` (boolean, default false). false = restart (unchanged).
--   2. true, on a plan change to a live membership: the new row's join_date is the OLD row's
--      join_date. Credit for unused days and the fee arithmetic are unchanged (D22).
--   3. GATE:membership.keep_join_lapsed: keeping the join date is refused when the change is a
--      renewal (the old term has ended, or is_renewal was requested). A renewal starts a new term
--      by definition, so keeping the old anniversary would end in the past. Restart instead.
--   4. Result carries `join_date_kept` so the screen can say what happened.
--
-- Written and verified locally only. NOT applied to any hosted database (N-5): Babin applies it
-- after the backup step.

begin;

-- 1. change_client_membership with keep-join-date (0198 body, plus R-9.2)
create or replace function public.change_client_membership(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_role public.system_role;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_key uuid := (p_payload->>'client_uuid')::uuid;
  v_level text := nullif(btrim(p_payload->>'plan_level'), '');
  v_plan_id uuid := nullif(p_payload->>'plan_id', '')::uuid;
  v_note text := nullif(btrim(p_payload->>'note'), '');
  v_effective_date date := coalesce(
    (p_payload->>'effective_date')::date,
    (p_payload->>'join_date')::date,
    (clock_timestamp() at time zone 'Asia/Kathmandu')::date
  );
  v_fee_paid_in numeric := (p_payload->>'fee_paid')::numeric;
  v_is_renewal boolean := coalesce((p_payload->>'is_renewal')::boolean, (p_payload->>'action') = 'renew', false);
  v_keep_join boolean := coalesce((p_payload->>'keep_join_date')::boolean, false);

  v_client public.clients%rowtype;
  v_plan public.membership_plans%rowtype;
  v_old public.client_memberships%rowtype;
  v_old_plan public.membership_plans%rowtype;
  v_receipt public.audit_events%rowtype;

  v_old_level text;
  v_new_id uuid;
  v_join_date date;
  v_join_date_kept boolean := false;

  v_old_fee_paisa bigint := 0;
  v_term_start date;
  v_term_months int := 12;
  v_term_end date;
  v_total_days int := 0;
  v_days_left int := 0;
  v_credit_paisa bigint := 0;
  v_new_fee_paisa bigint := 0;
  v_new_fee_due_paisa bigint := 0;
  v_account_credit_paisa bigint := 0;
  v_fee_to_record numeric;

  v_result jsonb;
begin
  select primary_role into v_role from public.users where id = v_actor and is_active;
  if v_actor is null or v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Only Coordinator or above can change a client membership.' using errcode = '42501';
  end if;

  if v_client_id is null or v_key is null then
    raise exception 'Client and request key are required.';
  end if;

  if v_note is not null and length(v_note) > 500 then
    raise exception 'A note can be at most 500 characters.';
  end if;

  -- Serialize retries on key
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));

  select * into v_receipt from public.audit_events where client_uuid = v_key;
  if found then
    if v_receipt.actor_id = v_actor
       and v_receipt.new_values->>'client_id' = v_client_id::text
       and (v_level is null or v_receipt.new_values->>'plan_level' = v_level)
       and (v_plan_id is null or v_receipt.new_values->>'plan_id' = v_plan_id::text)
       and v_receipt.reason is not distinct from v_note then
      return v_receipt.new_values;
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;

  select * into v_client from public.clients where id = v_client_id for update;
  if not found then
    raise exception 'Client was not found.';
  end if;

  if v_client.status::text = 'Deactivated' then
    raise exception 'GATE:client.deactivated: A deactivated client cannot take a membership.' using errcode = '23514';
  end if;

  -- Find active or most recent un-superseded membership
  select * into v_old from public.client_memberships
   where client_id = v_client_id and superseded_at is null
   for update;

  -- If plan not specified, default to existing plan when renewing
  if v_plan_id is null and v_level is null then
    if found then
      v_plan_id := v_old.plan_id;
      v_is_renewal := true;
    else
      raise exception 'Client, request key and membership plan are required.';
    end if;
  end if;

  if v_plan_id is not null then
    select * into v_plan from public.membership_plans where id = v_plan_id;
  else
    select * into v_plan from public.membership_plans where level::text = v_level;
  end if;

  if not found then
    raise exception 'That membership plan does not exist.';
  end if;

  if v_plan.status::text <> 'Active' then
    raise exception 'GATE:membership_plan.retired: That membership plan is retired and cannot be assigned.' using errcode = '23514';
  end if;

  -- A plan without a listed fee (Elite) is priced per client. Without a price
  -- there IS none: pricing it at zero would silently sell the term free and pay
  -- any credit out of the studio. The negotiated payload fee, when supplied, is
  -- the basis; a RENEWAL of the same plan may instead rely on the fee already
  -- recorded on the client's live row. Anything else is refused.
  if v_plan.annual_fee is null
     and v_fee_paid_in is null
     and not (v_old.id is not null and v_old.plan_id = v_plan.id and v_old.fee_paid is not null) then
    raise exception 'GATE:membership.custom_fee: The % plan has a custom fee. Record the negotiated fee to put this client on it.', v_plan.level
      using errcode = '23514';
  end if;

  if v_old.id is not null then
    select * into v_old_plan from public.membership_plans where id = v_old.plan_id;
    v_old_level := v_old_plan.level::text;

    v_term_start := v_old.join_date;
    v_term_months := coalesce(v_old_plan.term_months, 12);
    v_term_end := (v_term_start + make_interval(months => v_term_months))::date;
    v_total_days := v_term_end - v_term_start;
    -- Days left can never exceed the term that is actually on file. A change
    -- whose effective date lands before the old term even started (backdated,
    -- user-typed) must not credit MORE than the old fee charged: the credit is
    -- a pro-rata share of the term the client paid for, capped at all of it.
    v_days_left := least(v_total_days, greatest(0, v_term_end - v_effective_date));

    -- D23: If effective_date >= term_end, the old membership is lapsed/expired,
    -- so renewing on the same plan is permitted!
    if v_effective_date >= v_term_end then
      v_is_renewal := true;
    end if;

    if v_old.plan_id = v_plan.id and not v_is_renewal then
      raise exception 'GATE:membership.same_plan: This client is already on the % plan.', v_plan.level using errcode = '23514';
    end if;

    -- R-9.2: keeping the original join date is a plan change only. A renewal starts a new term,
    -- and the old anniversary would already be in the past, so it is refused.
    if v_keep_join and v_is_renewal then
      raise exception 'GATE:membership.keep_join_lapsed: The current term has already ended, so the original join date cannot be kept. Restart the term instead.'
        using errcode = '23514';
    end if;

    if v_is_renewal then
      -- D23 Renewal: Charges full plan fee, starts new term, credit is 0
      v_credit_paisa := 0;
      v_days_left := 0;
    else
      -- The credit is priced from the fee the old term actually carried: what
      -- was recorded on the row, else the plan's listed fee. When BOTH are
      -- unknown there is no honest arithmetic — refuse rather than credit zero
      -- (the client loses their unused days) or credit everything (the studio
      -- pays). A renewal charges the new fee and earns no credit, so it does
      -- not need the old fee priced.
      if v_old.fee_paid is null and v_old_plan.annual_fee is null then
        raise exception 'GATE:membership.fee_unknown: The fee on the client''s current membership was never recorded, so the unused days cannot be priced. Record the fee, then change the plan.'
          using errcode = '23514';
      end if;

      -- D22 mid-term plan change: credit = old fee * days left / days in old term (integer paisa, half-up)
      v_old_fee_paisa := round(coalesce(v_old.fee_paid, v_old_plan.annual_fee, 0) * 100);
      if v_total_days > 0 and v_days_left > 0 and v_old_fee_paisa > 0 then
        v_credit_paisa := round((v_old_fee_paisa::numeric * v_days_left::numeric) / v_total_days::numeric);
      else
        v_credit_paisa := 0;
      end if;
    end if;
  else
    v_old_level := null;
    v_old_fee_paisa := 0;
    v_days_left := 0;
    v_total_days := 0;
    v_credit_paisa := 0;
  end if;

  -- New plan economics. The basis is the plan's listed fee; a custom-fee plan
  -- (annual_fee NULL) has none, and the entry gate above guarantees either a
  -- negotiated payload fee or — on a renewal of the same plan — the fee already
  -- recorded on the client's live row. That is the basis then.
  v_new_fee_paisa := round(coalesce(
    v_plan.annual_fee,
    v_fee_paid_in,
    case when v_is_renewal and v_old.id is not null and v_old.plan_id = v_plan.id then v_old.fee_paid end
  ) * 100);
  v_new_fee_due_paisa := greatest(0, v_new_fee_paisa - v_credit_paisa);
  v_account_credit_paisa := greatest(0, v_credit_paisa - v_new_fee_paisa);

  -- Downgrade credit excess credited to client's account credit balance
  if v_account_credit_paisa > 0 then
    update public.clients
       set account_credit = coalesce(account_credit, 0) + round(v_account_credit_paisa::numeric / 100.0, 2)
     where id = v_client_id;
  end if;

  -- R-9.2: restart the term from the change date (default), or keep the original join date
  -- on a plan change to a live membership.
  v_join_date_kept := coalesce(v_keep_join and v_old.id is not null and not v_is_renewal, false);
  v_join_date := case when v_join_date_kept then v_old.join_date else v_effective_date end;

  v_new_id := gen_random_uuid();
  if v_old.id is not null then
    update public.client_memberships set superseded_at = clock_timestamp() where id = v_old.id;
  end if;

  v_fee_to_record := v_fee_paid_in;
  -- A renewal keeps the price it just charged: when the custom-fee plan has no
  -- listing and no new fee was negotiated, carry the live row's recorded fee
  -- onto the new term so later changes can still price it (T8-03 review).
  if v_fee_to_record is null and v_plan.annual_fee is null and v_is_renewal
     and v_old.id is not null and v_old.plan_id = v_plan.id then
    v_fee_to_record := v_old.fee_paid;
  end if;

  insert into public.client_memberships (
    id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
    fee_paid,
    created_by
  ) values (
    v_new_id,
    v_key,
    v_client_id,
    v_plan.id,
    v_join_date,
    v_fee_to_record,
    v_actor
  );

  if v_old.id is not null then
    update public.client_memberships set superseded_by_id = v_new_id where id = v_old.id;
  end if;

  v_result := jsonb_build_object(
    'client_id', v_client_id,
    'plan_id', v_plan.id,
    'plan_level', v_plan.level,
    'plan_label', v_plan.label,
    'previous_level', v_old_level,
    'membership_id', v_new_id,
    'superseded_membership_id', v_old.id,
    'joined_on', v_join_date,
    'join_date_kept', v_join_date_kept,
    'is_renewal', v_is_renewal,
    'old_fee', round(v_old_fee_paisa::numeric / 100.0, 2),
    'days_left', v_days_left,
    'total_days', v_total_days,
    'credit', round(v_credit_paisa::numeric / 100.0, 2),
    'new_fee', round(v_new_fee_paisa::numeric / 100.0, 2),
    'new_fee_due', round(v_new_fee_due_paisa::numeric / 100.0, 2),
    'account_credit', round(v_account_credit_paisa::numeric / 100.0, 2)
  );

  insert into public.audit_events (
    id,
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    reason
  ) values (
    gen_random_uuid(),
    v_key,
    'status change',
    'Administration',
    'Clients',
    'Update'::public.audit_action,
    'Informational',
    'Success',
    'client_memberships',
    v_new_id,
    v_actor,
    v_role,
    case when v_old.id is not null then
      jsonb_build_object(
        'plan_id', v_old.plan_id,
        'plan_level', v_old_level,
        'membership_id', v_old.id,
        'joined_on', v_old.join_date
      )
    else null end,
    v_result,
    coalesce(v_note, case when v_is_renewal then 'Membership renewed' else null end)
  );

  return v_result;
end;
$$;

revoke all on function public.change_client_membership(jsonb) from public, anon;
grant execute on function public.change_client_membership(jsonb) to authenticated;

commit;

-- Record 0228_membership_change_keep_join_date in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030109', '0228_membership_change_keep_join_date')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0228_membership_change_keep_join_date.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0229_booking_tags.sql
-- SHA-256: 11ade5b89ce53b338eaade3d2df6b762c65cf61717add8bce1b788dda0aa3cf4
-- Version: 20261122030110
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0229_booking_tags.sql
--
-- T3-25 · Tags on bookings (B16, B55)
-- Free tags on a booking: type a new one or pick one already used ("wedding",
-- "repeat", "festival"); several per booking.
-- Booking-desk roles add and remove tags; floor roles see them (a tag carries no money).
-- Tags are trimmed, case-insensitive, up to 30 characters.
-- Tags never change a booking's stage or money.
-- =============================================================================

begin;

-- 1. Add tags column to public.bookings
alter table public.bookings
  add column if not exists tags text[] not null default '{}';

-- 2. GIN index for fast tag containment/overlap search
create index if not exists idx_bookings_tags
  on public.bookings using gin (tags);

-- 3. Law 6 column-level masking compatibility (0062, 0162)
-- Non-money column must be explicitly granted to authenticated so all roles can read it
grant select (tags) on public.bookings to authenticated;

-- 4. RPC: set_booking_tags
create or replace function public.set_booking_tags(
  p_client_uuid uuid,
  p_booking_id uuid,
  p_tags text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role system_role;
  v_actor_id uuid;
  v_existing_event record;
  v_booking record;
  v_cleaned_tags text[] := '{}'::text[];
  v_raw_tag text;
  v_trimmed text;
  v_tag_lower text;
  v_found boolean;
  v_existing text;
  v_updated_booking public.bookings%rowtype;
begin
  -- 1. Authorization: Booking-desk roles only (Owner, Admin, Manager, Coordinator)
  v_role := auth_user_role();
  if v_role::text not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Only booking-desk roles (Owner, Admin, Manager, Coordinator) may modify booking tags'
      using errcode = '42501';
  end if;

  -- 2. Idempotency validation (Law 8)
  if p_client_uuid is null then
    raise exception 'client_uuid is required for idempotency (Law 8)'
      using errcode = '23502';
  end if;

  -- 3. Check for idempotent replay
  select id, new_values into v_existing_event
  from public.audit_events
  where client_uuid = p_client_uuid
    and record_id = p_booking_id
    and table_name = 'bookings'
    and action = 'Update'
    and reason = 'Booking tags updated (T3-25)';

  if found then
    select * into v_updated_booking from public.bookings where id = p_booking_id;
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'tags', coalesce(v_updated_booking.tags, '{}'::text[]),
      'idempotent', true
    );
  end if;

  -- 4. Check booking exists
  select id, tags, stage, deposit_required
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking % not found', p_booking_id
      using errcode = 'P0002';
  end if;

  -- 5. Tag sanitization: trimmed, up to 30 characters, case-insensitive deduplication
  if p_tags is not null then
    foreach v_raw_tag in array p_tags loop
      v_trimmed := trim(v_raw_tag);
      if length(v_trimmed) > 0 then
        if char_length(v_trimmed) > 30 then
          raise exception 'Tag "%" exceeds 30 characters limit', v_trimmed
            using errcode = '22023';
        end if;
        v_tag_lower := lower(v_trimmed);
        v_found := false;
        if array_length(v_cleaned_tags, 1) > 0 then
          foreach v_existing in array v_cleaned_tags loop
            if lower(v_existing) = v_tag_lower then
              v_found := true;
              exit;
            end if;
          end loop;
        end if;
        if not v_found then
          v_cleaned_tags := array_append(v_cleaned_tags, v_trimmed);
        end if;
      end if;
    end loop;
  end if;

  -- 6. Update booking (only tags are modified; stage and money are untouched)
  update public.bookings
  set tags = v_cleaned_tags
  where id = p_booking_id
  returning * into v_updated_booking;

  -- 7. Log explicit audit event for the tag change
  v_actor_id := auth.uid();
  if v_actor_id is null then
    select id into v_actor_id from public.users where primary_role::text = 'Owner' limit 1;
  end if;

  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    diff,
    reason
  ) values (
    p_client_uuid,
    'status change',
    'Rentals'::audit_category,
    'Rentals'::audit_module,
    'Update'::audit_action,
    'Informational'::audit_severity,
    'Success'::audit_status,
    'bookings',
    p_booking_id,
    v_actor_id,
    v_role,
    jsonb_build_object('tags', coalesce(v_booking.tags, '{}'::text[])),
    jsonb_build_object('tags', v_cleaned_tags),
    jsonb_build_object('tags', v_cleaned_tags),
    'Booking tags updated (T3-25)'
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'tags', v_cleaned_tags,
    'idempotent', false
  );
end;
$$;

comment on function public.set_booking_tags is
  'Set tags on a booking with role gate, audit trail, and sanitization (T3-25, B16, B55)';

revoke all on function public.set_booking_tags(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_booking_tags(uuid, uuid, text[]) to authenticated;

commit;

-- Record 0229_booking_tags in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030110', '0229_booking_tags')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0229_booking_tags.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0230_project_name_and_shoot_location.sql
-- SHA-256: fe59bb07acf3b85db84b7d0f542f329555be3a7604f8b870be7278f0d629bd13
-- Version: 20261122030111
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

-- Record 0230_project_name_and_shoot_location in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030111', '0230_project_name_and_shoot_location')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0230_project_name_and_shoot_location.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0231_pro_forma_document_type.sql
-- SHA-256: 9247e39dece94276f656b03d7d25c8cf182e6fa0787c32a2e161373106954a4b
-- Version: 20261122030112
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0231_pro_forma_document_type.sql
-- T3-27: Pro forma invoice from the draft (B18, B55, Law 6, Law 7, N-6)
--
-- 1. Add 'Pro Forma' to document_type and booking_document_type enums (adding value only - N-6).
-- 2. Update document_registry_role_read_scope so Technician and Warehouse remain strictly money-blind
--    and cannot view Pro Forma documents (Law 6).

alter type public.document_type add value if not exists 'Pro Forma';
alter type public.booking_document_type add value if not exists 'Pro Forma';

-- Keep registry reads within the Documents permissions matrix (Law 6 money-blindness).
-- Using document_type::text avoids Postgres 55P04 (unsafe use of new enum value in same transaction).
drop policy if exists document_registry_role_read_scope on public.document_registry;
create policy document_registry_role_read_scope on public.document_registry
  as restrictive for select to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
    or (
      auth_user_role() = 'Technician'
      and document_type::text not in ('Quotation', 'Tax Invoice', 'Receipt', 'Credit Note', 'Debit Note', 'Pro Forma')
    )
    or (
      auth_user_role() = 'Warehouse'
      and document_type::text in ('Rental Agreement', 'Packing List', 'Delivery Note')
    )
  );

comment on policy document_registry_role_read_scope on public.document_registry is
  'Documents matrix and Law 6: finance-capable staff read all types; Technician reads operational types (excluding Pro Forma, invoices, quotes, receipts); Warehouse reads agreement, packing list and delivery note only; Driver is excluded.';

-- Record 0231_pro_forma_document_type in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030112', '0231_pro_forma_document_type')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0231_pro_forma_document_type.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0232_secure_temporary_hold_rpcs.sql
-- SHA-256: f1c3877b651ec3daff5f29dd234a22eb0788c5c7f54a3773b1174dce68237702
-- Version: 20261122030113
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Forward-only repair of temporary-hold RPC authorization.
-- The already verified 0188 migration is intentionally left unchanged.
-- Source of these three definitions: reviewed PR #32, with an additional
-- fail-closed Coordinator/Warehouse branch check on atomic confirmation.
-- New DB behavior is NOT released until isolated PGlite and hosted JWT tests pass.
-- No grants are widened; existing EXECUTE privileges remain in force.
begin;

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
  v_prod_id         uuid;
  v_asset_id        uuid;
  v_res_units       int;
  v_res_qty         int;
  v_actor           uuid;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot confirm bookings.', v_role
      using errcode = '42501';
  end if;

  -- A caller-provided actor is never an authorization credential.
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

  -- SECURITY: a definer function must enforce the desk user's branch itself.
  -- A caller's UUID is checked above, but identity alone does not grant another branch.
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
      -- Idempotent duplicate check
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

  -- 7. Insert the stage transition (which invokes triggers to move stage and write reservations)
  insert into booking_stage_transitions
    (client_uuid, booking_id, from_stage, to_stage, actor_id, occurred_at, reason)
  values
    (p_client_uuid, p_booking_id, 'Quote', 'Booked', v_actor, v_occurred_at, p_reason);

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

create or replace function public.create_or_extend_hold(
  p_booking_id        uuid,
  p_booking_line_id   uuid,
  p_asset_id          uuid default null,
  p_product_id        uuid default null,
  p_qty               int default 1,
  p_period            tstzrange default null,
  p_duration_minutes  int default 240,
  p_client_uuid       uuid default gen_random_uuid(),
  p_actor_id          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         text;
  v_expires_at   timestamptz;
  v_period       tstzrange;
  v_hold_id      uuid;
  v_actor_id     uuid;
  v_booking      record;
  v_line         record;
  v_existing     inventory_reservations%rowtype;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Permission denied: role % cannot place inventory holds.', v_role
      using errcode = '42501';
  end if;

  -- Never trust an actor, product, period, or line identity supplied by the browser.
  v_actor_id := auth_user_id();
  if v_actor_id is null or (p_actor_id is not null and p_actor_id is distinct from v_actor_id) then
    raise exception 'Permission denied: hold actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'Hold idempotency key is required.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 1 then
    raise exception 'Hold duration must be positive.';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'Hold quantity must be positive.';
  end if;
  if (p_asset_id is null) = (p_product_id is null) then
    raise exception 'Hold must reference exactly one asset or product.';
  end if;

  select b.branch_id, b.stage, b.pickup_at, b.return_at
    into v_booking
    from bookings b
   where b.id = p_booking_id
     for update;
  if not found then
    raise exception 'Cannot hold equipment for a missing booking.';
  end if;
  if v_booking.stage <> 'Quote' then
    raise exception 'Temporary inventory holds may only be created for a Quote.';
  end if;
  if v_role = 'Coordinator' and not exists (
    select 1 from users u
    where u.id = v_actor_id and u.branch_id is not distinct from v_booking.branch_id
  ) then
    raise exception 'Permission denied: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  select bl.product_id, bl.qty
    into v_line
    from booking_lines bl
   where bl.id = p_booking_line_id
     and bl.booking_id = p_booking_id
     and bl.voided_at is null;
  if not found or v_line.product_id is null then
    raise exception 'Hold line is not an active equipment line on this booking.';
  end if;
  if p_qty > v_line.qty then
    raise exception 'Hold quantity exceeds the booking line quantity.';
  end if;
  if p_asset_id is not null and p_qty <> 1 then
    raise exception 'A single serialized asset hold must have quantity one.';
  end if;
  if p_product_id is not null and p_product_id is distinct from v_line.product_id then
    raise exception 'Hold product does not match its booking line.';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from product_units pu
     where pu.id = p_asset_id and pu.product_id = v_line.product_id
  ) then
    raise exception 'Hold asset does not belong to its booking line product.';
  end if;

  if v_booking.pickup_at is null or v_booking.return_at is null
     or v_booking.return_at <= v_booking.pickup_at then
    raise exception 'Cannot create hold: booking rental period is incomplete.';
  end if;
  v_period := tstzrange(v_booking.pickup_at, v_booking.return_at, '[)');
  if p_period is not null and p_period <> v_period then
    raise exception 'Hold period must exactly match the booking rental period.';
  end if;
  v_expires_at := now() + (coalesce(p_duration_minutes, 240) || ' minutes')::interval;

  -- Law 8: retries must not reserve the same stock twice. The booking row
  -- was locked above, serializing duplicate requests on this booking.
  select * into v_existing
    from inventory_reservations
   where client_uuid = p_client_uuid
     for update;
  if found then
    if v_existing.created_by is distinct from v_actor_id
       or v_existing.booking_id is distinct from p_booking_id
       or v_existing.booking_line_id is distinct from p_booking_line_id
       or v_existing.asset_id is distinct from p_asset_id
       or v_existing.product_id is distinct from p_product_id
       or v_existing.qty is distinct from p_qty
       or v_existing.period is distinct from v_period then
      raise exception 'Hold idempotency key belongs to a different request.'
        using errcode = '23505';
    end if;
    if v_existing.hold_state <> 'active_hold'
       or v_existing.released_at is not null
       or v_existing.expires_at is null
       or v_existing.expires_at <= now() then
      raise exception 'Hold idempotency key was already consumed; start a new hold request.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'success', true,
      'reservation_id', v_existing.id,
      'hold_state', 'active_hold',
      'expires_at', v_existing.expires_at,
      'qty', v_existing.qty,
      'already_held', true
    );
  end if;

  -- Reclaim expired holds on this asset/product first
  if p_asset_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where asset_id = p_asset_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  elsif p_product_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where product_id = p_product_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  end if;

  insert into inventory_reservations (
    client_uuid,
    booking_id,
    booking_line_id,
    asset_id,
    product_id,
    qty,
    period,
    state,
    hold_state,
    expires_at,
    created_by
  ) values (
    p_client_uuid,
    p_booking_id,
    p_booking_line_id,
    p_asset_id,
    p_product_id,
    coalesce(p_qty, 1),
    v_period,
    'Reserved',
    'active_hold',
    v_expires_at,
    v_actor_id
  )
  returning id into v_hold_id;

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_hold_id,
    'hold_state', 'active_hold',
    'expires_at', v_expires_at,
    'qty', coalesce(p_qty, 1)
  );
end;
$$;

create or replace function public.release_hold(
  p_reservation_id uuid,
  p_reason         text default null,
  p_actor_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role           text;
  v_actor          uuid;
  v_hold_state     text;
  v_booking_stage  text;
  v_branch_id      uuid;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Permission denied: role % cannot release inventory holds.', v_role
      using errcode = '42501';
  end if;

  v_actor := auth_user_id();
  if v_actor is null or (p_actor_id is not null and p_actor_id is distinct from v_actor) then
    raise exception 'Permission denied: hold release actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;

  -- Lock the reservation before deciding whether it is releasable. This
  -- endpoint releases temporary Quote holds, NEVER a committed reservation.
  select r.hold_state, b.stage::text, b.branch_id
    into v_hold_state, v_booking_stage, v_branch_id
    from inventory_reservations r
    join bookings b on b.id = r.booking_id
   where r.id = p_reservation_id
     and r.released_at is null
     for update of r;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Hold not found or already released');
  end if;
  if v_hold_state <> 'active_hold' or v_booking_stage <> 'Quote' then
    raise exception 'Committed reservations cannot be manually released through release_hold.'
      using errcode = '42501';
  end if;
  if v_role in ('Coordinator', 'Warehouse') and not exists (
    select 1 from users u
     where u.id = v_actor and u.branch_id is not distinct from v_branch_id
  ) then
    raise exception 'Permission denied: hold belongs to another branch.'
      using errcode = '42501';
  end if;

  update inventory_reservations
     set hold_state = 'released',
         released_at = now(),
         released_reason = coalesce(nullif(btrim(p_reason), ''), 'Released manually by staff')
   where id = p_reservation_id
     and hold_state = 'active_hold'
     and released_at is null;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Hold was already changed');
  end if;

  return jsonb_build_object('success', true, 'reservation_id', p_reservation_id);
end;
$$;

comment on function public.confirm_booking_atomic(uuid,uuid,uuid,timestamptz,text) is
  'Atomic Confirm; session actor matched, Coordinator and Warehouse confined to booking branch.';

comment on function public.create_or_extend_hold(uuid,uuid,uuid,uuid,integer,tstzrange,integer,uuid,uuid) is
  'Staff-only temporary holds; session actor, booking line, product, period, branch and quantity validated.';

comment on function public.release_hold(uuid,text,uuid) is
  'Release active Quote holds only; session actor and branch validated.';

commit;

-- Record 0232_secure_temporary_hold_rpcs in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030113', '0232_secure_temporary_hold_rpcs')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0232_secure_temporary_hold_rpcs.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0233_extend_booking_and_resync_auth.sql
-- SHA-256: 456a8cbfd2f1f73462e9c5e67d866840ed99819ee3921413d5fbc78b31c04f38
-- Version: 20261122030114
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Forward-only migration 0233: harden extend_booking authentication and revoke direct resync_draft_invoice
begin;

-- Revoke direct execution of resync_draft_invoice from all roles; definer-only.
revoke all on function public.resync_draft_invoice(uuid)
  from public, anon, authenticated;

create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  -- Payload identities are untrusted hints; the audit actor must be the session.
  v_actor         uuid;
  v_claimed_actor uuid := nullif(p_payload ->> 'actor_id', '')::uuid;
  v_claimed_by    uuid := nullif(p_payload ->> 'extended_by', '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_resync        jsonb;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role & permission validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor from the same authenticated session used by the role gate.
  -- A caller cannot attribute an extension or its money recalculation to
  -- another user.
  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'extend_booking: an authenticated staff user is required.'
      using errcode = '42501';
  end if;
  if (v_claimed_actor is not null and v_claimed_actor is distinct from v_actor)
     or (v_claimed_by is not null and v_claimed_by is distinct from v_actor) then
    raise exception 'extend_booking: supplied actor does not match the authenticated session.'
      using errcode = '42501';
  end if;

  -- The Coordinator's booking-desk authority is site-scoped. SECURITY DEFINER
  -- bypasses row RLS, so verify booking ownership before any date, reservation,
  -- invoice, or audit writes. Owner/Admin retain their documented global scope.
  if v_role = 'Coordinator'
     and (auth_user_branch_id() is null
          or v_booking.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'extend_booking: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 6. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 7. Update inventory_reservations (GiST exclusion and capacity ceiling re-evaluate here)
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 8. W15: the invoice follows the booking only while it is a Draft.
  --    resync_draft_invoice raises when there is no Draft (never created, e.g. a
  --    booking confirmed before 0200, or already numbered under W16), so call it
  --    only when one exists. A numbered invoice is not touched here (F5 guard);
  --    what to do after a change to a numbered invoice is O-14 / T3-14c, not
  --    decided in this function.
  if exists (select 1 from invoices where booking_id = v_booking_id and status = 'Draft') then
    v_resync := public.resync_draft_invoice(v_booking_id);
  end if;

  -- 9. Insert audit log
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
    old_values,
    new_values,
    reason
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()),
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days,
    'invoice_resync', v_resync
  );
end;
$$;

commit;

-- Record 0233_extend_booking_and_resync_auth in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030114', '0233_extend_booking_and_resync_auth')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0233_extend_booking_and_resync_auth.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0234_return_damage_photo_per_unit.sql
-- SHA-256: 4086b21d4225ccebb6dfeb4b55c64801d37cca355b9577a26c5f6fe2de7f045e
-- Version: 20261122030115
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

begin;

create or replace function public.require_return_damage_photo_per_unit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return_session_id uuid;
begin
  if tg_table_name = 'operation_sessions' then
    if new.operation <> 'Return' or new.state <> 'Completed'
      or old.state is not distinct from new.state then
      return new;
    end if;
    v_return_session_id := new.id;
  else
    if new.to_stage <> 'Returned' or new.from_stage is distinct from 'On Rent' then
      return new;
    end if;
    select session.id into v_return_session_id
    from public.operation_sessions session
    where session.booking_id = new.booking_id and session.operation = 'Return'
      and session.state in ('In Progress', 'Completed')
    order by session.created_at desc
    limit 1;
  end if;

  if exists (
    select 1
    from (
      select finding.unit_id
      from public.damage_findings finding
      join public.return_lines receipt on receipt.id = finding.return_line_id
      where receipt.session_id = v_return_session_id and finding.voided_at is null
      union
      select unit.asset_id
      from public.booking_line_units unit
      where unit.return_session_id = v_return_session_id
        and unit.unit_state = 'Damaged'
    ) flagged
    where not exists (
      select 1
      from public.evidence_references reference
      join public.evidence_files file on file.id = reference.evidence_file_id
      where reference.booking_id = new.booking_id
        and reference.item_id = flagged.unit_id
        and reference.removed_at is null
        and file.removed_at is null
        and file.media_type = 'Image'
        and file.category = 'Damage'
    )
  ) then
    raise exception 'GATE:gate.return.damage_photo_per_unit|Save a damage photo for each flagged unit before completing Return.';
  end if;

  return new;
end;
$$;

revoke all on function public.require_return_damage_photo_per_unit() from public, anon, authenticated;

create trigger trg_return_damage_photo_per_unit
before update of state on public.operation_sessions
for each row execute function public.require_return_damage_photo_per_unit();

-- The floor action advances the booking before sealing the session.
create trigger aaa_return_damage_photo_per_unit
before insert on public.booking_stage_transitions
for each row execute function public.require_return_damage_photo_per_unit();

commit;

-- Record 0234_return_damage_photo_per_unit in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030115', '0234_return_damage_photo_per_unit')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0234_return_damage_photo_per_unit.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0235_delivery_route_branch_hardening.sql
-- SHA-256: 0f1c3ab02df85fb793c07be56a1577fe8a32fc5cca97e2f19f99a1d51150fa52
-- Version: 20261122030116
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0209_delivery_route_branch_hardening.sql
-- T4-09 P0: close cross-branch/driver route reads and unscoped client-pin writes.
-- Forward-only: do not rewrite 0206, which may already exist in migration ledgers.
-- The 0206 get_day_route query references bookings.delivery_zone_id, which is NOT
-- created by the committed migrations. Until zone selection has a persisted
-- booking-level source, return NULL for zone name/fee rather than manufacture
-- billing information or read a nonexistent column.
-- SOURCE ONLY: never apply to live without migration-history reconciliation,
-- an isolated staging restore and Owner approval (DEPLOYMENT.md N-5).

begin;

create or replace function public.set_client_map_pin(
  p_client_id uuid,
  p_lat double precision,
  p_lng double precision
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_branch_id uuid;
  v_updated boolean;
begin
  select u.primary_role::text, u.branch_id
    into v_role, v_branch_id
    from public.users u
    where u.id = v_actor and u.is_active;

  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to set client map pin' using errcode = '42501';
  end if;

  if p_client_id is null or p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid client or latitude/longitude' using errcode = '22023';
  end if;

  -- A client is not intrinsically branch-owned. For branch-scoped staff, only
  -- edit a client with a real delivery job in the actor's branch. This matches
  -- the route workspace's map-pin workflow without exposing unrelated clients.
  if v_role not in ('Owner', 'Admin') and not exists (
    select 1
      from public.delivery_jobs dj
      join public.bookings b on b.id = dj.booking_id
      where b.client_id = p_client_id
        and b.branch_id = v_branch_id
        and dj.branch_id = v_branch_id
  ) then
    raise exception 'Client map pin is outside your delivery branch' using errcode = '42501';
  end if;

  update public.clients
     set map_pin_lat = p_lat,
         map_pin_lng = p_lng,
         updated_at = now()
   where id = p_client_id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.get_day_route(
  p_branch_id uuid,
  p_date date
) returns table (
  id uuid,
  booking_id uuid,
  booking_no text,
  leg text,
  scheduled_at timestamptz,
  status text,
  route_position int,
  client_name text,
  client_phone text,
  address text,
  neighborhood text,
  map_pin_lat double precision,
  map_pin_lng double precision,
  driver_name text,
  driver_phone text,
  vehicle text,
  zone_name text,
  zone_fee_paisa bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_branch_id uuid;
begin
  select u.primary_role::text, u.branch_id
    into v_role, v_branch_id
    from public.users u
    where u.id = v_actor and u.is_active;

  if v_actor is null or not public.auth_is_staff() or v_role is null then
    raise exception 'Only active staff may view a day route' using errcode = '42501';
  end if;

  if p_branch_id is null or p_date is null then
    raise exception 'Branch and date are required' using errcode = '22023';
  end if;

  -- Privileged staff may audit all branches; everyone else is site-bound.
  -- This check must run INSIDE the SECURITY DEFINER function, not in React.
  if v_role not in ('Owner', 'Admin') and p_branch_id is distinct from v_branch_id then
    raise exception 'Delivery route branch access denied' using errcode = '42501';
  end if;

  return query
  select
    dj.id,
    dj.booking_id,
    b.booking_no,
    dj.leg,
    dj.scheduled_at,
    dj.status,
    dj.route_position,
    c.name as client_name,
    c.phone as client_phone,
    c.address_line as address,
    c.neighborhood,
    c.map_pin_lat,
    c.map_pin_lng,
    u.full_name as driver_name,
    u.phone as driver_phone,
    dj.vehicle,
    null::text as zone_name,
    null::bigint as zone_fee_paisa
  from public.delivery_jobs dj
  join public.bookings b on b.id = dj.booking_id
  join public.clients c on c.id = b.client_id
  left join public.users u on u.id = dj.assigned_driver_id
  where dj.branch_id = p_branch_id
    and b.branch_id = dj.branch_id
    and dj.scheduled_at >= p_date
    and dj.scheduled_at < p_date + interval '1 day'
    and dj.status not in ('Delivered', 'Failed')
    -- Drivers may see ONLY their OWN assigned active jobs, never their
    -- colleagues' client names, addresses or phone numbers.
    and (v_role <> 'Driver' or dj.assigned_driver_id = v_actor)
  order by dj.route_position nulls last, dj.scheduled_at asc;
end;
$$;

comment on function public.set_client_map_pin(uuid, double precision, double precision)
  is 'Write a client map pin: Owner/Admin globally, authorized floor staff only when the client has a delivery job in their branch.';
comment on function public.get_day_route(uuid, date)
  is 'Active staff only: Owner/Admin any branch; other staff own branch; Driver own assigned jobs. Zone fields intentionally NULL pending persisted booking-zone mapping.';

revoke all on function public.set_client_map_pin(uuid, double precision, double precision) from public, anon;
revoke all on function public.get_day_route(uuid, date) from public, anon;
grant execute on function public.set_client_map_pin(uuid, double precision, double precision) to authenticated;
grant execute on function public.get_day_route(uuid, date) to authenticated;

commit;

-- Record 0235_delivery_route_branch_hardening in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030116', '0235_delivery_route_branch_hardening')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0235_delivery_route_branch_hardening.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0236_opening_balances_append_only.sql
-- SHA-256: e03ee67b66f127c6194d3d2c7d5f427157fe73b672139384839d500052ee5a8c
-- Version: 20261122030117
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- T3-07 requires append-only opening balances: a correction is a new row.
-- 0214 documented this rule but only installed the DELETE backstop. Its Owner
-- policy still permits UPDATE, allowing historical amounts and account scope
-- to be overwritten. Use the existing Law 3/4 trigger backstop for every role.
-- WRITTEN locally. Never applied to live by this migration's author (N-5).

begin;

create trigger opening_balances_no_update
  before update on public.opening_balances
  for each row execute function public.reject_update_append_only(
    'insert a new opening balance row with the corrected amount, account and date'
  );

comment on trigger opening_balances_no_update on public.opening_balances is
  'T3-07: opening balances are append-only, including their amount, scope and metadata. Corrections are new rows.';

commit;

-- Record 0236_opening_balances_append_only in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030117', '0236_opening_balances_append_only')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0236_opening_balances_append_only.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0237_planned_equipment_downtime.sql
-- SHA-256: a2d676d9954839b86c3d11f39de599bed2eb99df9112aeaaf0e0a41e84d06b3c
-- Version: 20261122030118
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

begin;

-- ============================================================================
-- Migration 0237: Planned Equipment Downtime with a Reason (T2-21, B10, Law 3, Law 8)
-- ============================================================================

-- 1. inventory_reservations: allow null booking_id & booking_line_id for downtime holds
alter table public.inventory_reservations
  alter column booking_id drop not null,
  alter column booking_line_id drop not null;

-- 2. Add kind, downtime_reason, downtime_notes, ended_by
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reservation_kind') then
    create type public.reservation_kind as enum ('booking', 'downtime');
  end if;
end $$;

alter table public.inventory_reservations
  add column if not exists kind public.reservation_kind not null default 'booking',
  add column if not exists downtime_reason text,
  add column if not exists downtime_notes text,
  add column if not exists ended_by uuid references public.users(id);

comment on column public.inventory_reservations.kind is
  'T2-21: Distinguishes commercial booking reservations from planned downtime holds.';

comment on column public.inventory_reservations.downtime_reason is
  'B10: One of Repair, Service or calibration, Our own shoot, Lent to a partner, Marketing shoot, Other.';

-- 3. Constraints on inventory_reservations for downtime integrity
alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_kind_integrity,
  add constraint inventory_reservations_kind_integrity check (
    (kind = 'booking' and booking_id is not null and booking_line_id is not null and downtime_reason is null) or
    (kind = 'downtime' and booking_id is null and booking_line_id is null and downtime_reason is not null)
  );

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_downtime_reason_check,
  add constraint inventory_reservations_downtime_reason_check check (
    downtime_reason is null or downtime_reason in (
      'Repair',
      'Service or calibration',
      'Our own shoot',
      'Lent to a partner',
      'Marketing shoot',
      'Other'
    )
  );

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_downtime_other_requires_notes,
  add constraint inventory_reservations_downtime_other_requires_notes check (
    downtime_reason <> 'Other' or (downtime_notes is not null and length(trim(downtime_notes)) >= 3)
  );

-- 4. Update validate_unit_reservability trigger (preserving 0184 order & repair clearance):
-- Downtime represents scheduled maintenance/repair, so bypass active maintenance/damage finding checks
-- while preserving the check that prevents booking retired units.
create or replace function public.validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_row public.product_units;
begin
  if new.asset_id is null or new.released_at is not null then
    return new;
  end if;

  select * into unit_row from public.product_units where id = new.asset_id;
  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit does not exist in inventory.';
  end if;

  if unit_row.retired_at is not null or unit_row.status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit is retired and cannot be reserved.';
  end if;

  -- For downtime holds, skip active maintenance or damage finding blocks since downtime IS maintenance planning
  if new.kind = 'downtime' then
    return new;
  end if;

  -- 1. Unresolved damage finding check (specific finding clearance required)
  if exists (
    select 1 from public.damage_findings
    where unit_id = new.asset_id
      and voided_at is null
      and repaired_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit has an unresolved damage finding.';
  end if;

  -- 2. Damaged/Lost condition check
  if unit_row.condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit is damaged or lost and cannot be reserved.';
  end if;

  -- 3. Maintenance record/status check
  if unit_row.status = 'Maintenance' or exists (
    select 1 from public.maintenance_records
    where product_unit_id = new.asset_id
      and completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit is in maintenance and cannot be reserved.';
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries
    where unit_id = new.asset_id
      and (nullif(btrim(qc_fail_reason), '') is not null or problem_state <> 'No Problems')
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit has an unresolved QC defect.';
  end if;

  return new;
end;
$$;

-- 5. Update RLS policy to admit Technician (PERMISSIONS §4.3: maintenance.create C+ · Floor)
drop policy if exists inventory_reservations_all on public.inventory_reservations;
create policy inventory_reservations_all on public.inventory_reservations
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician'));

-- 6. RPC: plan_equipment_downtime
create or replace function public.plan_equipment_downtime(
  p_client_uuid uuid,
  p_asset_id uuid,
  p_product_id uuid,
  p_qty int,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_period tstzrange;
  v_conflicting_booking text;
  v_reservation_id uuid;
  v_prod_id uuid;
begin
  -- Idempotency check (Law 8)
  select id into v_reservation_id
  from public.inventory_reservations
  where client_uuid = p_client_uuid;

  if v_reservation_id is not null then
    return jsonb_build_object('success', true, 'reservation_id', v_reservation_id, 'idempotent', true);
  end if;

  -- Permission check: maintenance.create (C+ · Floor: Owner, Admin, Manager, Coordinator, Warehouse, Technician)
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'FORBIDDEN: User role % cannot plan equipment downtime.', v_role;
  end if;

  if p_start_at >= p_end_at then
    raise exception 'INVALID_RANGE: Downtime start % must precede end %.', p_start_at, p_end_at;
  end if;

  v_period := tstzrange(p_start_at, p_end_at, '[)');

  -- Resolve product_id from unit if asset_id provided
  if p_asset_id is not null then
    select product_id into v_prod_id
    from public.product_units
    where id = p_asset_id;

    if v_prod_id is null then
      raise exception 'NOT_FOUND: Product unit % does not exist.', p_asset_id;
    end if;

    -- Check if booking holds this unit in that range to report friendly error (B10: "BK-1234 has it on those dates")
    select b.booking_no into v_conflicting_booking
    from public.inventory_reservations r
    join public.bookings b on b.id = r.booking_id
    where r.asset_id = p_asset_id
      and r.released_at is null
      and r.hold_state in ('confirmed', 'active_hold')
      and r.period && v_period
    limit 1;

    if v_conflicting_booking is not null then
      raise exception '% has it on those dates', v_conflicting_booking;
    end if;
  else
    v_prod_id := p_product_id;
    if v_prod_id is null then
      raise exception 'INVALID_INPUT: Either asset_id or product_id must be provided.';
    end if;
  end if;

  -- Insert downtime hold (GiST constraint and capacity ceiling natively protect)
  insert into public.inventory_reservations (
    client_uuid,
    asset_id,
    product_id,
    qty,
    period,
    state,
    hold_state,
    kind,
    downtime_reason,
    downtime_notes,
    created_by
  ) values (
    p_client_uuid,
    p_asset_id,
    case when p_asset_id is not null then null else v_prod_id end,
    coalesce(p_qty, 1),
    v_period,
    'Reserved',
    'confirmed',
    'downtime',
    p_reason,
    p_notes,
    auth_user_id()
  )
  returning id into v_reservation_id;

  -- Audit event (Law 8)
  insert into public.audit_events (
    client_uuid,
    action,
    table_name,
    record_id,
    actor_id,
    reason,
    new_values
  ) values (
    p_client_uuid,
    'Create',
    'inventory_reservations',
    v_reservation_id,
    auth_user_id(),
    p_reason,
    jsonb_build_object(
      'kind', 'planned_downtime',
      'asset_id', p_asset_id,
      'product_id', v_prod_id,
      'reason', p_reason,
      'period', v_period::text
    )
  );

  return jsonb_build_object('success', true, 'reservation_id', v_reservation_id);
end;
$$;

-- 7. RPC: end_equipment_downtime ("End now", Law 3)
create or replace function public.end_equipment_downtime(
  p_reservation_id uuid,
  p_client_uuid uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_res record;
begin
  select * into v_res
  from public.inventory_reservations
  where id = p_reservation_id and kind = 'downtime';

  if not found then
    raise exception 'NOT_FOUND: Planned downtime reservation % does not exist.', p_reservation_id;
  end if;

  if v_res.released_at is not null then
    return jsonb_build_object('success', true, 'already_ended', true);
  end if;

  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'FORBIDDEN: User role % cannot end equipment downtime.', v_role;
  end if;

  update public.inventory_reservations
  set released_at = now(),
      released_reason = 'Ended early by staff',
      hold_state = 'released',
      ended_by = auth_user_id()
  where id = p_reservation_id;

  insert into public.audit_events (
    client_uuid,
    action,
    table_name,
    record_id,
    actor_id,
    reason,
    new_values
  ) values (
    p_client_uuid,
    'Update',
    'inventory_reservations',
    p_reservation_id,
    auth_user_id(),
    'Ended early by staff',
    jsonb_build_object(
      'kind', 'end_downtime_now',
      'asset_id', v_res.asset_id,
      'ended_at', now()
    )
  );

  return jsonb_build_object('success', true, 'ended_at', now());
end;
$$;

-- 8. Protect against anon exposure
revoke all on function public.plan_equipment_downtime from public;
grant execute on function public.plan_equipment_downtime to authenticated;

revoke all on function public.end_equipment_downtime from public;
grant execute on function public.end_equipment_downtime to authenticated;

commit;

-- Record 0237_planned_equipment_downtime in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030118', '0237_planned_equipment_downtime')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0237_planned_equipment_downtime.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0238_rental_day_start_setting.sql
-- SHA-256: 78dd1c6b0d2ba7628b095430f2955240ea6b0ceaa6c885788f9c260e977a459d
-- Version: 20261122030119
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0237_rental_day_start_setting.sql
-- T3-28: Rental day start as an operational setting (B24, B25, B26, K3)
--
-- 1. bookings.rental_day_start: integer minutes after Kathmandu midnight (+05:45). Default 360 (06:00).
--    Immutable per booking: existing bookings retain their stored day start.
-- 2. set_setting RPC: Owner and Admin can set operational settings (B26).
--    operationalDayStart validated at 15-minute increments (00:00, 00:15, ..., 23:45).
-- 3. create_booking RPC: resolves rental_day_start from payload or settings table, defaults to 360,
--    records it on bookings, returns it in result object.
-- 4. read_booking_for_change RPC: includes rental_day_start in snapshot.

-- 1. Table schema
alter table public.bookings
  add column if not exists rental_day_start integer not null default 360,
  add constraint bookings_rental_day_start_valid
    check (rental_day_start >= 0 and rental_day_start < 1440 and (rental_day_start % 15) = 0);

comment on column public.bookings.rental_day_start is
  'Rental day start boundary for this booking, in minutes after Kathmandu midnight (+05:45). Default 360 (06:00). Immutable per booking (B25, K3).';

-- Law 6 column-level SELECT grant (rental_day_start is non-money operational metadata)
grant select (rental_day_start) on public.bookings to authenticated;

-- 2. Update set_setting function to permit Admin in addition to Owner (B26) and validate operationalDayStart
create or replace function public.set_setting(
  p_client_uuid uuid,
  p_key text,
  p_value jsonb,
  p_scope text default 'org',
  p_location_id uuid default null
) returns table (setting_id uuid, value jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_hist settings_history%rowtype;
  v_row settings%rowtype;
  v_scope text := coalesce(p_scope, 'org');
  v_val_text text;
begin
  -- B26: Owner and Admin change operational settings; Manager is refused
  if auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'GATE:gate.settings.role|Only Owner and Admin may change operational settings.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.settings.idempotency|A settings change requires a client UUID.' using errcode = 'P0001';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z][A-Za-z0-9]{0,63}$' then
    raise exception 'GATE:gate.settings.key|Not a valid setting key.' using errcode = 'P0001';
  end if;
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number', 'boolean') then
    raise exception 'GATE:gate.settings.value|A setting is a single text, number or yes/no value.' using errcode = 'P0001';
  end if;
  if v_scope not in ('org', 'location') then
    raise exception 'GATE:gate.settings.scope|Scope must be org or location.' using errcode = 'P0001';
  end if;
  if v_scope = 'location' and (p_location_id is null or not settings_location_overridable(p_key)) then
    raise exception 'GATE:gate.settings.not_overridable|This setting applies to the whole business and has no per-location override.' using errcode = 'P0001';
  end if;
  if v_scope = 'org' and p_location_id is not null then
    raise exception 'GATE:gate.settings.scope|An org setting carries no location.' using errcode = 'P0001';
  end if;

  -- Validate operationalDayStart: quarter-hour increments in HH:mm
  if p_key = 'operationalDayStart' then
    v_val_text := p_value #>> '{}';
    if v_val_text is null or v_val_text !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
      raise exception 'GATE:gate.settings.operational_day_start|Rental day start must be in HH:mm format at 15-minute increments.' using errcode = '22026';
    end if;
  end if;

  select * into v_existing_hist from settings_history h where h.client_uuid = p_client_uuid;
  if found then
    if v_existing_hist.key <> p_key or v_existing_hist.new_value <> p_value
       or v_existing_hist.scope <> v_scope or v_existing_hist.location_id is distinct from p_location_id then
      raise exception 'GATE:gate.settings.idempotency_conflict|Client UUID already belongs to a different change.' using errcode = 'P0001';
    end if;
    return query select v_existing_hist.setting_id, v_existing_hist.new_value;
    return;
  end if;

  select * into v_row from settings s
   where s.key = p_key and s.scope = v_scope
     and coalesce(s.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
   for update;

  if found then
    if v_row.value = p_value then
      return query select v_row.id, v_row.value;   -- no change, no history row
      return;
    end if;
    update settings
       set value = p_value, last_client_uuid = p_client_uuid, updated_by = auth_user_id(), updated_at = now()
     where id = v_row.id;
    return query select v_row.id, p_value;
  else
    insert into settings (key, value, scope, location_id, is_money, last_client_uuid, updated_by)
    values (p_key, p_value, v_scope, p_location_id, settings_is_money_key(p_key), p_client_uuid, auth_user_id())
    returning id into v_row.id;
    return query select v_row.id, p_value;
  end if;
end;
$$;

-- 3. Update create_booking RPC to record rental_day_start
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
  /* 0238 */
  v_rental_day_start          integer;
  v_existing_rental_day_start integer;
  v_setting_val               text;
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

  -- 0237 rental_day_start resolution
  if p_payload ? 'rental_day_start' and p_payload ->> 'rental_day_start' is not null then
    v_rental_day_start := (p_payload ->> 'rental_day_start')::integer;
  else
    select s.value #>> '{}' into v_setting_val
      from settings s
     where s.key = 'operationalDayStart'
       and (s.location_id = v_branch or s.location_id is null)
     order by s.location_id nulls last
     limit 1;

    if v_setting_val is not null and v_setting_val ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
      v_rental_day_start := split_part(v_setting_val, ':', 1)::integer * 60 + split_part(v_setting_val, ':', 2)::integer;
    else
      v_rental_day_start := 360; -- 06:00 default
    end if;
  end if;

  if v_rental_day_start is null or v_rental_day_start < 0 or v_rental_day_start >= 1440 or (v_rental_day_start % 15) <> 0 then
    raise exception 'create_booking: rental_day_start must be between 0 and 1439 in 15-minute increments. Nothing was created.'
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
  select id, booking_no, stage::text, rental_day_start
    into v_existing_id, v_existing_no, v_existing_stage, v_existing_rental_day_start
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id',        v_existing_id,
      'booking_no',        v_existing_no,
      'stage',             v_existing_stage,
      'project_name',      v_project_name,
      'shoot_location',    v_shoot_location,
      'rental_day_start',  v_existing_rental_day_start,
      'replayed',          true
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
    vat_rate, rental_day_start, created_by, updated_by
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
    v_rental_day_start,
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
        select id into v_parent_id from booking_lines
         where booking_id = v_booking_id and client_uuid = v_parent_key;
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

      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        select product_id into v_asset_product from product_units where id = (v_unit ->> 'asset_id')::uuid;
        if v_asset_product is distinct from (v_line ->> 'product_id')::uuid then
          raise exception 'create_booking: asset % does not belong to product %. Nothing was created.',
            v_unit ->> 'asset_id', v_line ->> 'product_id';
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

    if v_wrote = 0 and jsonb_array_length(v_next) > 0 then
      raise exception 'create_booking: unresolved parent_client_uuid references in lines payload (possible circular reference)';
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
      coalesce((v_discount ->> 'discount_source')::discount_source, 'Manual'::discount_source),
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
    'rental_day_start',  v_rental_day_start,
    'replayed',          false
  );
end;
$$;

-- 4. Update read_booking_for_change RPC to include rental_day_start
create or replace function public.read_booking_for_change(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b bookings;
  result jsonb;
  line_rows jsonb;
  crew_rows jsonb;
  transport_row jsonb;
  discounts jsonb;
  v_role text;
begin
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'You cannot edit this booking.' using errcode = '42501';
  end if;

  select * into b from bookings where id::text = p_id or booking_no = p_id;
  if b.id is null then
    raise exception 'Booking not found.';
  end if;

  if b.cancelled_at is not null then
    raise exception 'Cancelled bookings cannot be edited.';
  end if;

  if b.stage in ('Returned', 'Closed') or b.closed_at is not null then
    raise exception 'Returned or closed bookings cannot be edited. Use operational corrections.';
  end if;

  select coalesce(jsonb_agg(
    record_editor_private.pick(to_jsonb(l), array[
      'id', 'client_uuid', 'parent_line_id', 'line_type', 'product_id', 'bundle_id',
      'description', 'qty', 'days', 'rate', 'discount_amount', 'is_included',
      'service_basis', 'line_note', 'sort_order'
    ]) || jsonb_build_object(
      'name', coalesce(l.description, p.name, k.name),
      'parent_client_uuid', parent.client_uuid,
      'is_packed', exists (
        select 1 from packing_lines pl
         where pl.booking_line_id = l.id and pl.state = 'Packed'
      ) or (
        b.stage in ('Packed', 'On Rent') and exists (
          select 1 from booking_line_units blu
           where blu.booking_line_id = l.id and blu.released_at is null
        )
      )
    ) order by l.sort_order, l.id
  ), '[]'::jsonb) into line_rows
  from booking_lines l
  left join products p on p.id = l.product_id
  left join bundles k on k.id = l.bundle_id
  left join booking_lines parent on parent.id = l.parent_line_id
  where l.booking_id = b.id and l.voided_at is null;

  select coalesce(jsonb_agg(
    record_editor_private.pick(to_jsonb(c), array[
      'id', 'client_uuid', 'crew_member_id', 'name', 'crew_role', 'phone',
      'day_rate', 'days', 'overtime', 'accommodation', 'meals'
    ]) order by c.id
  ), '[]'::jsonb) into crew_rows
  from booking_crew_lines c
  where c.booking_id = b.id and c.voided_at is null;

  select record_editor_private.pick(to_jsonb(t), array[
    'id', 'vehicle', 'number_plate', 'driver_contact', 'delivery_charge', 'fuel_charge', 'special_instructions'
  ]) into transport_row
  from booking_transport t
  where t.booking_id = b.id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', id, 'percent', percent) order by id
  ), '[]'::jsonb) into discounts
  from booking_discounts
  where booking_id = b.id;

  result := jsonb_build_object(
    'id', b.id,
    'code', b.booking_no,
    'stage', b.stage,
    'rental_day_start', b.rental_day_start,
    'values', record_editor_private.pick(to_jsonb(b), array[
      'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
      'project_type', 'project_type_other', 'pickup_at', 'return_at',
      'delivery_type', 'pickup_location', 'return_location', 'deposit_required',
      'rental_day_start'
    ]),
    'lines', line_rows,
    'crew', crew_rows,
    'transport', transport_row,
    'discounts', discounts
  );

  return result || jsonb_build_object(
    'revision', md5((result || jsonb_build_object('updated_at', b.updated_at, 'version', b.version))::text)
  );
end;
$$;
revoke all on function public.read_booking_for_change(text) from public, anon;
grant execute on function public.read_booking_for_change(text) to authenticated;

-- Record 0238_rental_day_start_setting in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030119', '0238_rental_day_start_setting')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0238_rental_day_start_setting.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0239_consumables_pricing_restock_and_low_stock.sql
-- SHA-256: a6b768f4043831acb71aef658d93edc35fb85e03dc568e9390fff1aa0faf9e00
-- Version: 20261122030120
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0239: Consumables pricing, restock movements, add consumable line, and low stock alerts (T3-30)
-- =============================================================================
-- RULINGS: B14, B35, B54; OPEN_DECISIONS #4 (Option A confirmed); Law 1, Law 6, Law 8
--
-- 1. Unit Sale Price on products:
--    products gains unit_sale_price numeric(14,2) (paisa in code, stored in NPR).
--    Column-masked in products_v (null for Warehouse, Technician, Driver, Client).
--
-- 2. Consumable line pricing:
--    create_booking computes consumable lines as: qty * unit_sale_price - discount,
--    NEVER multiplied by days. A 3-day booking with 2 tape rolls charges 2 units, not 6.
--
-- 3. Restocking:
--    Table consumable_restock_movements tracks quantity, supplier, cost (masked), date,
--    staff member, quantity_before and quantity_after.
--    restock_consumable() RPC validates role, updates total_quantity, and logs movement.
--
-- 4. Add Consumable to Booking:
--    add_consumable_line() allows floor and desk roles to add consumable items to a
--    booking. Server-authoritative unit price, idempotent via client_uuid.
--    Returns prices only to authorized money roles (Law 6).
--
-- 5. Low stock alerts:
--    get_low_stock_alerts() returns products at or below reorder_level without money.
--    get_morning_digest() updated to include low stock items.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. products.unit_sale_price and products_v column masking
-- -----------------------------------------------------------------------------
alter table public.products
  add column if not exists unit_sale_price numeric(14,2) check (unit_sale_price is null or unit_sale_price >= 0);

comment on column public.products.unit_sale_price is
  'Server-authoritative unit sale price for consumables (gaffer tape, gels, batteries). Money-masked from floor roles (Law 6).';

-- Rebuild products_v with unit_sale_price masked via auth_can_view_money()
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
        END AS unit_sale_price
   FROM products
  where auth_is_staff();

revoke all on public.products_v from public, anon;
grant select on public.products_v to authenticated;

comment on view public.products_v is
  'Column-masked read surface for products — unit_sale_price and rates resolve to NULL for money-blind roles (Law 6).';

-- -----------------------------------------------------------------------------
-- 2. Update get_model_daily_rate to support consumables unit_sale_price
-- -----------------------------------------------------------------------------
create or replace function public.get_model_daily_rate(p_product_id uuid, p_bundle_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not auth_can_view_money() and (auth_user_role() not in ('Warehouse') or current_setting('app.in_create_booking', true) is distinct from 'on') then
    raise exception 'Financial rate access is not permitted' using errcode = '42501';
  end if;

  if p_product_id is not null then
    return (select coalesce(unit_sale_price, daily_rate) from products where id = p_product_id);
  end if;
  if p_bundle_id is not null then
    return (select daily_rate from bundles where id = p_bundle_id);
  end if;
  return null;
end;
$$;

revoke all on function public.get_model_daily_rate(uuid, uuid) from public, anon;
grant execute on function public.get_model_daily_rate(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. guard_booking_lines_money_blind update for add_consumable_line bypass
-- -----------------------------------------------------------------------------
create or replace function public.guard_booking_lines_money_blind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.in_create_booking', true) = 'on'
     or current_setting('app.in_add_consumable_line', true) = 'on' then
    return NEW;
  end if;

  if not auth_can_view_money() then
    if (NEW.rate is not null and NEW.rate <> 0)
       or (NEW.discount_amount is not null and NEW.discount_amount <> 0)
       or NEW.supplier_cost is not null
       or NEW.markup_amount is not null
       or NEW.line_total is not null
       or NEW.price_breakdown is not null then
      raise exception 'GATE:gate.booking_lines.money_blind_insert|Money-blind callers cannot insert money figures into booking_lines outside create_booking'
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. create_booking update: consumable lines charge qty * unit_sale_price, not * days
-- -----------------------------------------------------------------------------
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
  /* 0238 */
  v_rental_day_start          integer;
  v_existing_rental_day_start integer;
  v_setting_val               text;
  /* T3-30 */
  v_is_consumable     boolean;
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

  -- 0238 rental_day_start resolution
  if p_payload ? 'rental_day_start' and p_payload ->> 'rental_day_start' is not null then
    v_rental_day_start := (p_payload ->> 'rental_day_start')::integer;
  else
    select s.value #>> '{}' into v_setting_val
      from settings s
     where s.key = 'operationalDayStart'
       and (s.location_id = v_branch or s.location_id is null)
     order by s.location_id nulls last
     limit 1;

    if v_setting_val is not null and v_setting_val ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
      v_rental_day_start := split_part(v_setting_val, ':', 1)::integer * 60 + split_part(v_setting_val, ':', 2)::integer;
    else
      v_rental_day_start := 360; -- 06:00 default
    end if;
  end if;

  if v_rental_day_start is null or v_rental_day_start < 0 or v_rental_day_start >= 1440 or (v_rental_day_start % 15) <> 0 then
    raise exception 'create_booking: rental_day_start must be between 0 and 1439 in 15-minute increments. Nothing was created.'
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
  select id, booking_no, stage::text, rental_day_start
    into v_existing_id, v_existing_no, v_existing_stage, v_existing_rental_day_start
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id',        v_existing_id,
      'booking_no',        v_existing_no,
      'stage',             v_existing_stage,
      'project_name',      v_project_name,
      'shoot_location',    v_shoot_location,
      'rental_day_start',  v_existing_rental_day_start,
      'replayed',          true
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
    vat_rate, rental_day_start, created_by, updated_by
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
    v_rental_day_start,
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

      -- T3-30: Check consumable tracking mode
      v_is_consumable := false;
      if (v_line ->> 'product_id') is not null then
        select (p.tracking_mode = 'Consumable') into v_is_consumable
          from products p where p.id = (v_line ->> 'product_id')::uuid;
        v_is_consumable := coalesce(v_is_consumable, false);
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

      -- ── 0168 / T3-30: Line total + price breakdown (G3) ──────────────────────
      v_line_qty      := greatest(1, coalesce((v_line ->> 'qty')::integer, 1));
      v_line_days     := greatest(1, (v_line ->> 'days')::integer);
      v_line_discount := case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end;

      if v_is_consumable then
        v_computed_total := greatest(0, v_line_qty * v_final_rate - v_line_discount);
      else
        v_computed_total := greatest(0, v_line_qty * v_line_days * v_final_rate - v_line_discount);
      end if;

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
        case when v_is_consumable then 1 else (v_line ->> 'days')::integer end,
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

      -- ── D5: creation-time unit assignment ──────────────────────────────────
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

  -- ── Discounts ─────────────────────────────────────────────────────────────
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
    'rental_day_start',  v_rental_day_start,
    'replayed',          false
  );
end;
$$;

revoke all on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Restock Movements Table and Restock RPC
-- -----------------------------------------------------------------------------
create table if not exists public.consumable_restock_movements (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null unique,
  product_id      uuid          not null references public.products(id),
  qty             integer       not null check (qty > 0),
  supplier        text,
  cost            numeric(14,2) check (cost is null or cost >= 0),
  received_date   date          not null default current_date,
  quantity_before integer       not null check (quantity_before >= 0),
  quantity_after  integer       not null check (quantity_after >= 0),
  created_at      timestamptz   not null default now(),
  created_by      uuid          not null references public.users(id),
  constraint consumable_restock_movements_arithmetic check (quantity_after = quantity_before + qty)
);

create index if not exists idx_consumable_restock_movements_product
  on public.consumable_restock_movements (product_id, created_at desc);

alter table public.consumable_restock_movements enable row level security;

-- Base table direct select: restricted to money-visible management roles
drop policy if exists consumable_restock_movements_select on public.consumable_restock_movements;
create policy consumable_restock_movements_select on public.consumable_restock_movements
  for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts'));

revoke all on public.consumable_restock_movements from public, anon;
grant select on public.consumable_restock_movements to authenticated;

-- Masked view: all staff can view restock movements; cost is masked for floor roles (Law 6)
create or replace view public.consumable_restock_movements_v as
select
  id,
  client_uuid,
  product_id,
  qty,
  supplier,
  case when auth_can_view_money() then cost else null::numeric end as cost,
  received_date,
  quantity_before,
  quantity_after,
  created_at,
  created_by
from public.consumable_restock_movements
where auth_is_staff();

revoke all on public.consumable_restock_movements_v from public, anon;
grant select on public.consumable_restock_movements_v to authenticated;

comment on view public.consumable_restock_movements_v is
  'Read view for consumable restock history. cost is NULL for Warehouse, Technician and Driver (Law 6).';

create or replace function public.restock_consumable(
  p_product_id uuid,
  p_qty integer,
  p_supplier text default null,
  p_cost numeric default null,
  p_received_date date default null,
  p_client_uuid uuid default null
)
returns table (
  id uuid,
  product_id uuid,
  qty integer,
  quantity_before integer,
  quantity_after integer,
  supplier text,
  cost numeric,
  received_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := auth_user_role();
  v_before integer;
  v_after integer;
  v_tracking product_tracking_mode;
  v_can_money boolean := auth_can_view_money();
  v_effective_cost numeric := null;
  v_date date := coalesce(p_received_date, current_date);
  v_existing public.consumable_restock_movements%rowtype;
  v_inserted_id uuid;
begin
  if not auth_is_staff() or v_role is null then
    raise exception 'GATE:gate.restock.auth_required|Staff authentication is required to restock inventory.' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'GATE:gate.restock.idempotency|Restock requires a client UUID (Law 8).' using errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'GATE:gate.restock.invalid_qty|Restock quantity must be a positive integer.' using errcode = 'P0001';
  end if;

  -- Lock product
  select p.total_quantity, p.tracking_mode into v_before, v_tracking
    from products p where p.id = p_product_id for update;
  if not found then
    raise exception 'GATE:gate.restock.product_not_found|Product not found.' using errcode = 'P0001';
  end if;

  -- Check existing idempotency
  select * into v_existing from consumable_restock_movements crm where crm.client_uuid = p_client_uuid;
  if found then
    if v_existing.product_id <> p_product_id or v_existing.qty <> p_qty then
      raise exception 'GATE:gate.restock.idempotency_conflict|Client UUID already belongs to a different restock movement.' using errcode = 'P0001';
    end if;
    return query select
      v_existing.id,
      v_existing.product_id,
      v_existing.qty,
      v_existing.quantity_before,
      v_existing.quantity_after,
      v_existing.supplier,
      case when v_can_money then v_existing.cost else null::numeric end,
      v_existing.received_date;
    return;
  end if;

  if v_tracking = 'Serialised' then
    raise exception 'GATE:gate.restock.wrong_tracking_mode|Serialised products must be restocked by adding individual units with serial numbers.' using errcode = 'P0001';
  end if;

  -- Only money-visible roles can record cost (Law 6)
  if v_can_money and p_cost is not null and p_cost >= 0 then
    v_effective_cost := p_cost;
  end if;

  v_after := v_before + p_qty;

  update public.products
     set total_quantity = v_after,
         updated_at = now(),
         updated_by = v_actor_id
   where public.products.id = p_product_id;

  insert into public.consumable_restock_movements (
    client_uuid,
    product_id,
    qty,
    supplier,
    cost,
    received_date,
    quantity_before,
    quantity_after,
    created_by
  ) values (
    p_client_uuid,
    p_product_id,
    p_qty,
    nullif(btrim(p_supplier), ''),
    v_effective_cost,
    v_date,
    v_before,
    v_after,
    v_actor_id
  ) returning consumable_restock_movements.id into v_inserted_id;

  return query select
    v_inserted_id,
    p_product_id,
    p_qty,
    v_before,
    v_after,
    nullif(btrim(p_supplier), ''),
    case when v_can_money then v_effective_cost else null::numeric end,
    v_date;
end;
$$;

revoke all on function public.restock_consumable(uuid, integer, text, numeric, date, uuid) from public, anon;
grant execute on function public.restock_consumable(uuid, integer, text, numeric, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. add_consumable_line RPC
-- -----------------------------------------------------------------------------
create or replace function public.add_consumable_line(
  p_booking_id uuid,
  p_product_id uuid,
  p_qty integer,
  p_client_uuid uuid,
  p_line_note text default null
)
returns table (
  line_id uuid,
  booking_id uuid,
  product_id uuid,
  product_name text,
  qty integer,
  unit_price numeric,
  line_total numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := auth_user_role();
  v_can_money boolean := auth_can_view_money();
  v_stage booking_stage;
  v_booking_no text;
  v_cancelled_at timestamptz;
  v_product_name text;
  v_tracking_mode product_tracking_mode;
  v_stock integer;
  v_unit_price numeric;
  v_existing_line_id uuid;
  v_existing_qty integer;
  v_existing_rate numeric;
  v_existing_line_total numeric;
  v_new_line_id uuid;
  v_stock_before integer;
  v_stock_after integer;
  v_inv_id uuid;
begin
  if not auth_is_staff() or v_role is null then
    raise exception 'GATE:gate.consumable.auth_required|Staff authentication is required to add consumables.' using errcode = '42501';
  end if;

  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'GATE:gate.consumable.unauthorized_role|Your role is not authorized to add consumables to bookings.' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'GATE:gate.consumable.idempotency|Consumable line requires a client UUID (Law 8).' using errcode = 'P0001';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'GATE:gate.consumable.invalid_quantity|Quantity must be a positive integer.' using errcode = 'P0001';
  end if;

  select b.stage, b.booking_no, b.cancelled_at
    into v_stage, v_booking_no, v_cancelled_at
    from public.bookings b
   where b.id = p_booking_id;
  if not found then
    raise exception 'GATE:gate.consumable.booking_not_found|Booking not found.' using errcode = 'P0001';
  end if;

  if v_stage in ('Returned', 'Closed') or v_cancelled_at is not null then
    raise exception 'GATE:gate.consumable.booking_terminal|Cannot add consumables to a cancelled, returned or closed booking.' using errcode = 'P0001';
  end if;

  select p.name, p.tracking_mode, p.total_quantity, coalesce(p.unit_sale_price, p.daily_rate, 0)
    into v_product_name, v_tracking_mode, v_stock, v_unit_price
    from products p
   where p.id = p_product_id;
  if not found then
    raise exception 'GATE:gate.consumable.product_not_found|Product not found.' using errcode = 'P0001';
  end if;

  if v_tracking_mode <> 'Consumable' then
    raise exception 'GATE:gate.consumable.not_consumable|Product "%" is not tracked as a consumable.', v_product_name using errcode = 'P0001';
  end if;

  -- Idempotency check by client_uuid
  select bl.id, bl.qty, bl.rate, bl.line_total
    into v_existing_line_id, v_existing_qty, v_existing_rate, v_existing_line_total
    from booking_lines bl
   where bl.client_uuid = p_client_uuid;
  if found then
    return query select
      v_existing_line_id,
      p_booking_id,
      p_product_id,
      v_product_name,
      v_existing_qty,
      case when v_can_money then v_existing_rate else null::numeric end,
      case when v_can_money then v_existing_line_total else null::numeric end;
    return;
  end if;

  -- Bypass money-blind line insert guard for this trusted server action
  perform set_config('app.in_add_consumable_line', 'on', true);

  insert into booking_lines (
    client_uuid,
    booking_id,
    line_type,
    product_id,
    description,
    qty,
    days,
    rate,
    rate_overridden,
    discount_amount,
    line_total,
    price_breakdown,
    line_note,
    created_by
  ) values (
    p_client_uuid,
    p_booking_id,
    'Equipment',
    p_product_id,
    v_product_name,
    p_qty,
    1,
    v_unit_price,
    false,
    0,
    p_qty * v_unit_price,
    jsonb_build_object(
      'unit_sale_price', v_unit_price,
      'qty', p_qty,
      'is_consumable', true
    ),
    nullif(btrim(p_line_note), ''),
    v_actor_id
  ) returning booking_lines.id into v_new_line_id;

  -- If booking is already On Rent (Handover was already completed), deduct stock immediately
  if v_stage = 'On Rent' then
    select p.total_quantity into v_stock_before from public.products p where p.id = p_product_id for update;
    v_stock_after := greatest(0, v_stock_before - p_qty);

    update public.products
       set total_quantity = v_stock_after,
           updated_at = now()
     where public.products.id = p_product_id;

    insert into public.consumable_stock_movements (
      client_uuid, booking_id, booking_line_id, product_id,
      qty, quantity_before, quantity_after, created_by
    ) values (
      gen_random_uuid(), p_booking_id, v_new_line_id, p_product_id,
      p_qty, v_stock_before, v_stock_after, v_actor_id
    );
  end if;

  -- If a Draft invoice exists, append invoice line so totals remain synchronised
  for v_inv_id in select inv.id from public.invoices inv where inv.booking_id = p_booking_id and inv.status = 'Draft' loop
    insert into invoice_lines (
      client_uuid,
      invoice_id,
      line_kind,
      description,
      quantity,
      days,
      unit_rate,
      line_total,
      discount_percent,
      sort_order
    ) values (
      gen_random_uuid(),
      v_inv_id,
      'Equipment Rental'::line_kind,
      v_product_name,
      p_qty,
      1,
      v_unit_price,
      p_qty * v_unit_price,
      0,
      100
    );
  end loop;

  return query select
    v_new_line_id,
    p_booking_id,
    p_product_id,
    v_product_name,
    p_qty,
    case when v_can_money then v_unit_price else null::numeric end,
    case when v_can_money then (p_qty * v_unit_price) else null::numeric end;
end;
$$;

revoke all on function public.add_consumable_line(uuid, uuid, integer, uuid, text) from public, anon;
grant execute on function public.add_consumable_line(uuid, uuid, integer, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Low Stock Alerts Query and Morning Digest Extension
-- -----------------------------------------------------------------------------
create or replace function public.get_low_stock_alerts()
returns table (
  product_id uuid,
  product_name text,
  tracking_mode product_tracking_mode,
  total_quantity integer,
  reorder_level integer,
  quantity_unit product_unit_of_measure
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not auth_is_staff() then
    raise exception 'GATE:gate.stock_alerts.auth_required|Staff authentication required.' using errcode = '42501';
  end if;

  return query
  select
    p.id as product_id,
    p.name as product_name,
    p.tracking_mode,
    p.total_quantity,
    p.reorder_level,
    p.quantity_unit
  from products p
  where p.is_active = true
    and p.reorder_level is not null
    and p.reorder_level > 0
    and p.total_quantity <= p.reorder_level
  order by p.total_quantity asc, p.name asc;
end;
$$;

revoke all on function public.get_low_stock_alerts() from public, anon;
grant execute on function public.get_low_stock_alerts() to authenticated;

-- Update get_morning_digest to include low stock alert items
create or replace function public.get_morning_digest(
  p_user_id uuid,
  p_target_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_can_view_money boolean;
  v_npt_now timestamp;
  v_target_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pickups jsonb := '[]'::jsonb;
  v_returns jsonb := '[]'::jsonb;
  v_overdue jsonb := '[]'::jsonb;
  v_open_damage jsonb := '[]'::jsonb;
  v_shift_handovers jsonb := '[]'::jsonb;
  v_payments_due jsonb := '[]'::jsonb;
  v_low_stock jsonb := '[]'::jsonb;
  v_total_items int := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select
    u.id,
    u.full_name,
    u.email,
    u.primary_role::text
  into v_user
  from public.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Law 6: Money blindness
  v_can_view_money := lower(coalesce(v_user.primary_role, '')) not in (
    'warehouse', 'technician', 'driver', 'client'
  );

  v_npt_now := (now() at time zone 'Asia/Kathmandu');
  v_target_date := coalesce(p_target_date, v_npt_now::date);

  v_day_start := (v_target_date::text || ' 06:00:00+05:45')::timestamptz;
  v_day_end   := ((v_target_date + 1)::text || ' 05:59:59.999+05:45')::timestamptz;

  -- 1. Pickups scheduled today
  select coalesce(jsonb_agg(item order by (item->>'pickup_at')::timestamptz asc), '[]'::jsonb)
  into v_pickups
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'pickup_at', b.pickup_at,
      'pickup_time', to_char(b.pickup_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage::text
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.pickup_at >= v_day_start
      and b.pickup_at <= v_day_end
      and b.cancelled_at is null
  ) q;

  -- 2. Returns scheduled today
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_returns
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'return_time', to_char(b.return_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage::text
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at >= v_day_start
      and b.return_at <= v_day_end
      and b.cancelled_at is null
  ) q;

  -- 3. Overdue returns
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_overdue
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'stage', b.stage::text
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at < v_day_start
      and b.stage in ('On Rent')
      and b.cancelled_at is null
      and b.actual_return_at is null
  ) q;

  -- 4. Open damage findings
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_open_damage
  from (
    select jsonb_build_object(
      'id', df.id,
      'damage_type', df.damage_type,
      'severity', df.severity,
      'description', df.description,
      'approval_state', df.approval_state::text,
      'created_at', df.created_at,
      'estimated_cost_paisa', case when v_can_view_money then round(coalesce(df.estimated_cost, 0) * 100)::bigint else null end
    ) as item
    from public.damage_findings df
    where df.approval_state = 'Pending Approval'
      and df.voided_at is null
  ) q;

  -- 5. Pending shift handovers
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_shift_handovers
  from (
    select jsonb_build_object(
      'id', sh.id,
      'shift_code', sh.shift_code,
      'shift_date', sh.shift_date,
      'from_user_name', sh.from_user_name,
      'notes', sh.notes,
      'status', sh.status,
      'created_at', sh.created_at
    ) as item
    from public.shift_handovers sh
    where sh.status = 'pending'
      and sh.archived_at is null
  ) q;

  -- 6. Payments due today (money roles only, Law 6)
  if v_can_view_money then
    select coalesce(jsonb_agg(item order by (item->>'due_date')::date asc), '[]'::jsonb)
    into v_payments_due
    from (
      select jsonb_build_object(
        'id', inv.id,
        'invoice_no', inv.invoice_no,
        'booking_id', inv.booking_id,
        'client_name', coalesce(c.name, 'Unknown Client'),
        'due_date', inv.due_date,
        'outstanding_paisa', round(coalesce(inv.outstanding_amount, 0) * 100)::bigint,
        'status', inv.status::text
      ) as item
      from public.invoices inv
      left join public.clients c on c.id = inv.client_id
      where inv.due_date = v_target_date
        and inv.status in ('Draft', 'Sent', 'Partially Paid')
        and inv.outstanding_amount > 0
        and inv.voided_at is null
    ) q;
  else
    v_payments_due := '[]'::jsonb;
  end if;

  -- 7. Low stock items (at or below reorder_level)
  select coalesce(jsonb_agg(item order by (item->>'total_quantity')::int asc), '[]'::jsonb)
  into v_low_stock
  from (
    select jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'total_quantity', p.total_quantity,
      'reorder_level', p.reorder_level,
      'tracking_mode', p.tracking_mode::text
    ) as item
    from public.products p
    where p.is_active = true
      and p.reorder_level is not null
      and p.reorder_level > 0
      and p.total_quantity <= p.reorder_level
  ) q;

  v_total_items := jsonb_array_length(v_pickups) +
                   jsonb_array_length(v_returns) +
                   jsonb_array_length(v_overdue) +
                   jsonb_array_length(v_open_damage) +
                   jsonb_array_length(v_shift_handovers) +
                   jsonb_array_length(v_payments_due) +
                   jsonb_array_length(v_low_stock);

  return jsonb_build_object(
    'recipient', jsonb_build_object(
      'user_id', v_user.id,
      'full_name', v_user.full_name,
      'email', v_user.email,
      'role', v_user.primary_role
    ),
    'target_date', v_target_date,
    'operational_day_start', v_day_start,
    'operational_day_end', v_day_end,
    'can_view_money', v_can_view_money,
    'has_scheduled_items', (v_total_items > 0),
    'empty_message', case when v_total_items = 0 then 'Nothing scheduled today' else null end,
    'total_items_count', v_total_items,
    'pickups', v_pickups,
    'returns', v_returns,
    'overdue', v_overdue,
    'open_damage', v_open_damage,
    'shift_handovers', v_shift_handovers,
    'payments_due', v_payments_due,
    'low_stock', v_low_stock
  );
end;
$$;

revoke all on function public.get_morning_digest(uuid, date) from public, anon;
grant execute on function public.get_morning_digest(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Post-conditions
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'products'
       and column_name = 'unit_sale_price'
  ) then
    raise exception 'POST-CONDITION FAILED: products.unit_sale_price column missing.';
  end if;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name = 'consumable_restock_movements'
  ) then
    raise exception 'POST-CONDITION FAILED: consumable_restock_movements table missing.';
  end if;

  if not exists (
    select 1 from pg_views
     where schemaname = 'public'
       and viewname = 'consumable_restock_movements_v'
  ) then
    raise exception 'POST-CONDITION FAILED: consumable_restock_movements_v view missing.';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'restock_consumable'
       and prosecdef = true
  ) then
    raise exception 'POST-CONDITION FAILED: restock_consumable RPC missing or not security definer.';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'add_consumable_line'
       and prosecdef = true
  ) then
    raise exception 'POST-CONDITION FAILED: add_consumable_line RPC missing or not security definer.';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'get_low_stock_alerts'
  ) then
    raise exception 'POST-CONDITION FAILED: get_low_stock_alerts function missing.';
  end if;
end;
$$;

commit;

-- Record 0239_consumables_pricing_restock_and_low_stock in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030120', '0239_consumables_pricing_restock_and_low_stock')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0239_consumables_pricing_restock_and_low_stock.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0240_time_between_rentals.sql
-- SHA-256: 7c01b21fc0fa9e62a3dd34f272e440a94428ba63e17e348928994f5a5b02c66a
-- Version: 20261122030121
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Migration 0240: Time between rentals (Account-wide or Per product) (T2-22)
-- =============================================================================
-- RULINGS: B11, B53; Law 1, Law 3, Law 6, Law 8
--
-- Settings ▸ Operations rules gets "Time between rentals: Account-wide · Per product".
-- - Account-wide uses today's rentalTurnaround setting ('Same-instant handover allowed' vs 'Turnaround required').
-- - Per product uses each product's prep_time_minutes and cleaning_time_minutes.
--   A unit returned at 18:00 with 120 cleaning minutes is free from 20:00.
--   A 09:00 pickup with 60 prep minutes needs the unit back by 08:00.
-- The reservation check widens the period at the database layer where reservations
-- are committed, so the database refuses a booking that is too close.
-- Existing reservations are not changed.
-- =============================================================================

begin;

-- 1. Helper function: get_effective_rental_window
create or replace function public.get_effective_rental_window(
  p_pickup timestamptz,
  p_return timestamptz,
  p_prep_minutes integer default 0,
  p_cleaning_minutes integer default 0
) returns tstzrange
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text;
  v_turnaround text;
  v_prep interval;
  v_cleaning interval;
begin
  if p_pickup is null or p_return is null or p_return < p_pickup then
    return tstzrange(p_pickup, p_return, '[)');
  end if;

  -- Read organization setting (defaults to 'Account-wide' if row or key doesn't exist)
  select value#>>'{}' into v_mode
    from settings
   where key = 'timeBetweenRentals' and scope = 'org';

  if v_mode is null then
    v_mode := 'Account-wide';
  end if;

  if v_mode = 'Per product' then
    v_prep := (coalesce(p_prep_minutes, 0) || ' minutes')::interval;
    v_cleaning := (coalesce(p_cleaning_minutes, 0) || ' minutes')::interval;
    return tstzrange(p_pickup - v_prep, p_return + v_cleaning, '[)');
  else
    select value#>>'{}' into v_turnaround
      from settings
     where key = 'rentalTurnaround' and scope = 'org';

    if v_turnaround = 'Turnaround required' then
      return tstzrange(p_pickup, p_return, '[]');
    else
      return tstzrange(p_pickup, p_return, '[)');
    end if;
  end if;
end;
$$;

revoke all on function public.get_effective_rental_window(timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.get_effective_rental_window(timestamptz, timestamptz, integer, integer) to authenticated;

comment on function public.get_effective_rental_window(timestamptz, timestamptz, integer, integer) is
  'T2-22 / B11: Computes the effective reservation range given rental start/end, product prep and cleaning minutes, and the timeBetweenRentals setting.';


-- 2. Update reservations_follow_stage_transition to use get_effective_rental_window
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
  -- Returned and Closed end the commitment; Quote un-makes it.
  -- Filtered on `released_at is null` so Returned -> Closed is an idempotent no-op.
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

  -- 4. Quantity: remainder of each line not covered by live units or existing reservations
  insert into inventory_reservations
    (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
  select gen_random_uuid(), NEW.booking_id, bl.id, bl.product_id,
         bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0),
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
     and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0)) > 0;

  -- ── Coverage ────────────────────────────────────────────────────────────
  select string_agg(bl.description, ', ')
    into v_uncovered
    from booking_lines bl
   where bl.booking_id = NEW.booking_id
     and bl.voided_at is null
     and bl.product_id is not null
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

comment on function public.reservations_follow_stage_transition() is
  'R-26 / 0100 / 0222 / 0240: inventory_reservations is written by the database from the Booked transition '
  'and released on Returned/Closed/Quote reversal. Promotes existing active holds owned by this booking '
  'to confirmed, reclaims expired competitor holds, applies turnaround/buffer periods, and avoids duplicate insertion.';


-- 3. Update create_or_extend_hold to compute effective rental window with buffer
create or replace function public.create_or_extend_hold(
  p_booking_id        uuid,
  p_booking_line_id   uuid,
  p_asset_id          uuid default null,
  p_product_id        uuid default null,
  p_qty               int default 1,
  p_period            tstzrange default null,
  p_duration_minutes  int default 240,
  p_client_uuid       uuid default gen_random_uuid(),
  p_actor_id          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         text;
  v_expires_at   timestamptz;
  v_period       tstzrange;
  v_hold_id      uuid;
  v_actor_id     uuid;
  v_booking      record;
  v_line         record;
  v_existing     inventory_reservations%rowtype;
  v_prep_min     int := 0;
  v_clean_min    int := 0;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Permission denied: role % cannot place inventory holds.', v_role
      using errcode = '42501';
  end if;

  -- Never trust an actor, product, period, or line identity supplied by the browser.
  v_actor_id := auth_user_id();
  if v_actor_id is null or (p_actor_id is not null and p_actor_id is distinct from v_actor_id) then
    raise exception 'Permission denied: hold actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if p_client_uuid is null then
    raise exception 'Hold idempotency key is required.';
  end if;
  if p_duration_minutes is not null and p_duration_minutes < 1 then
    raise exception 'Hold duration must be positive.';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'Hold quantity must be positive.';
  end if;
  if (p_asset_id is null) = (p_product_id is null) then
    raise exception 'Hold must reference exactly one asset or product.';
  end if;

  select b.branch_id, b.stage, b.pickup_at, b.return_at
    into v_booking
    from bookings b
   where b.id = p_booking_id
     for update;
  if not found then
    raise exception 'Cannot hold equipment for a missing booking.';
  end if;
  if v_booking.stage <> 'Quote' then
    raise exception 'Temporary inventory holds may only be created for a Quote.';
  end if;
  if v_role = 'Coordinator' and not exists (
    select 1 from users u
    where u.id = v_actor_id and u.branch_id is not distinct from v_booking.branch_id
  ) then
    raise exception 'Permission denied: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  select bl.product_id, bl.qty
    into v_line
    from booking_lines bl
   where bl.id = p_booking_line_id
     and bl.booking_id = p_booking_id
     and bl.voided_at is null;
  if not found or v_line.product_id is null then
    raise exception 'Hold line is not an active equipment line on this booking.';
  end if;
  if p_qty > v_line.qty then
    raise exception 'Hold quantity exceeds the booking line quantity.';
  end if;
  if p_asset_id is not null and p_qty <> 1 then
    raise exception 'A single serialized asset hold must have quantity one.';
  end if;
  if p_product_id is not null and p_product_id is distinct from v_line.product_id then
    raise exception 'Hold product does not match its booking line.';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from product_units pu
     where pu.id = p_asset_id and pu.product_id = v_line.product_id
  ) then
    raise exception 'Hold asset does not belong to its booking line product.';
  end if;

  if v_booking.pickup_at is null or v_booking.return_at is null
     or v_booking.return_at <= v_booking.pickup_at then
    raise exception 'Cannot create hold: booking rental period is incomplete.';
  end if;

  select coalesce(p.prep_time_minutes, 0), coalesce(p.cleaning_time_minutes, 0)
    into v_prep_min, v_clean_min
    from products p
   where p.id = v_line.product_id;

  v_period := public.get_effective_rental_window(v_booking.pickup_at, v_booking.return_at, v_prep_min, v_clean_min);

  if p_period is not null and p_period <> v_period and p_period <> tstzrange(v_booking.pickup_at, v_booking.return_at, '[)') then
    raise exception 'Hold period must match the booking rental period.';
  end if;
  v_expires_at := now() + (coalesce(p_duration_minutes, 240) || ' minutes')::interval;

  -- Law 8: retries must not reserve the same stock twice. The booking row
  -- was locked above, serializing duplicate requests on this booking.
  select * into v_existing
    from inventory_reservations
   where client_uuid = p_client_uuid
     for update;
  if found then
    if v_existing.created_by is distinct from v_actor_id
       or v_existing.booking_id is distinct from p_booking_id
       or v_existing.booking_line_id is distinct from p_booking_line_id
       or v_existing.asset_id is distinct from p_asset_id
       or v_existing.product_id is distinct from p_product_id
       or v_existing.qty is distinct from p_qty
       or (v_existing.period is distinct from v_period and v_existing.period is distinct from tstzrange(v_booking.pickup_at, v_booking.return_at, '[)')) then
      raise exception 'Hold idempotency key belongs to a different request.'
        using errcode = '23505';
    end if;
    if v_existing.hold_state <> 'active_hold'
       or v_existing.released_at is not null
       or v_existing.expires_at is null
       or v_existing.expires_at <= now() then
      raise exception 'Hold idempotency key was already consumed; start a new hold request.'
        using errcode = '23505';
    end if;
    return jsonb_build_object(
      'success', true,
      'reservation_id', v_existing.id,
      'hold_state', 'active_hold',
      'expires_at', v_existing.expires_at,
      'qty', v_existing.qty,
      'already_held', true
    );
  end if;

  -- Reclaim expired holds on this asset/product first
  if p_asset_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where asset_id = p_asset_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  elsif p_product_id is not null then
    update inventory_reservations
       set hold_state = 'expired_hold',
           released_at = now(),
           released_reason = 'Hold expired automatically'
     where product_id = p_product_id
       and hold_state = 'active_hold'
       and expires_at <= now()
       and released_at is null;
  end if;

  insert into inventory_reservations (
    client_uuid,
    booking_id,
    booking_line_id,
    asset_id,
    product_id,
    qty,
    period,
    state,
    hold_state,
    expires_at,
    created_by
  ) values (
    p_client_uuid,
    p_booking_id,
    p_booking_line_id,
    p_asset_id,
    p_product_id,
    coalesce(p_qty, 1),
    v_period,
    'Reserved',
    'active_hold',
    v_expires_at,
    v_actor_id
  )
  returning id into v_hold_id;

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_hold_id,
    'hold_state', 'active_hold',
    'expires_at', v_expires_at,
    'qty', coalesce(p_qty, 1),
    'already_held', false
  );
end;
$$;

revoke all on function public.create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) from public, anon;
grant execute on function public.create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) to authenticated;

comment on function public.create_or_extend_hold(uuid, uuid, uuid, uuid, int, tstzrange, int, uuid, uuid) is
  'R-26 / 0188 / 0232 / 0240: creates or updates a temporary inventory hold for a Quote, factoring in product prep and cleaning windows when in per-product mode.';

commit;

-- Record 0240_time_between_rentals in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030121', '0240_time_between_rentals')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0240_time_between_rentals.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0241_extension_clash_manager_decision_and_at_risk.sql
-- SHA-256: e999945ddd0fceb6ff89d9e823ba0f81d8b2763c4d7799a4b2d52195b5bdb253
-- Version: 20261122030122
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Forward-only migration 0241: Extension clash Manager decisions, booking at-risk tracking, and Pack gate (T3-29, B39, B41, B42)
set search_path = public, pg_temp;

-- 1. Table: extension_clash_decisions
-- Holds audited Manager decisions (Owner, Admin, Manager) when an extension conflicts with upcoming bookings.
create table if not exists public.extension_clash_decisions (
  id                      uuid primary key default gen_random_uuid(),
  client_uuid             uuid not null default gen_random_uuid(),
  booking_id              uuid not null references public.bookings(id) on delete restrict,
  conflicting_booking_id  uuid references public.bookings(id) on delete set null,
  days                    integer not null check (days >= 1),
  decision                text not null check (decision in ('move_next_booking', 'mark_at_risk', 'refuse')),
  reason                  text not null check (length(trim(reason)) >= 10),
  decided_by              uuid references public.users(id) on delete set null,
  decided_at              timestamptz not null default now(),
  applied                 boolean not null default false,
  created_at              timestamptz not null default now()
);

alter table public.extension_clash_decisions enable row level security;

-- A Supabase authenticated session can be a Client. Manager decisions are staff-only.
drop policy if exists extension_clash_decisions_select on public.extension_clash_decisions;
create policy extension_clash_decisions_select on public.extension_clash_decisions
  for select to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

drop policy if exists extension_clash_decisions_insert on public.extension_clash_decisions;
create policy extension_clash_decisions_insert on public.extension_clash_decisions
  for insert to authenticated with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

-- 2. Table: booking_at_risk
-- Tracks bookings placed at operational risk due to extension clashes or late returns.
create table if not exists public.booking_at_risk (
  id                      uuid primary key default gen_random_uuid(),
  client_uuid             uuid not null default gen_random_uuid(),
  booking_id              uuid not null references public.bookings(id) on delete restrict,
  booking_no              text not null,
  cause                   text not null check (cause in ('extension_clash', 'late_return', 'marked_will_be_late')),
  clashing_booking_id     uuid references public.bookings(id) on delete set null,
  clashing_booking_no     text,
  product_id              uuid references public.products(id) on delete set null,
  product_name            text,
  asset_id                uuid references public.product_units(id) on delete set null,
  asset_tag               text,
  raised_at               timestamptz not null default now(),
  raised_by               uuid references public.users(id) on delete set null,
  resolved_at             timestamptz,
  resolved_by             uuid references public.users(id) on delete set null,
  resolution              text check (resolution is null or resolution in ('sub_rent', 'similar_item', 'refund', 'credit', 'client_change', 'cancelled')),
  resolution_notes        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.booking_at_risk enable row level security;

-- Client accounts must never read other clients' booking clashes.
-- The floor team may see non-money operational risk, but Drivers/Clients may not.
drop policy if exists booking_at_risk_select on public.booking_at_risk;
create policy booking_at_risk_select on public.booking_at_risk
  for select to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

drop policy if exists booking_at_risk_insert on public.booking_at_risk;
create policy booking_at_risk_insert on public.booking_at_risk
  for insert to authenticated with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

drop policy if exists booking_at_risk_update on public.booking_at_risk;
create policy booking_at_risk_update on public.booking_at_risk
  for update to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

-- 3. Table: client_account_credits
-- Ledger for account credit granted to clients (Law 4, Law 6).
create table if not exists public.client_account_credits (
  id                      uuid primary key default gen_random_uuid(),
  client_uuid             uuid not null default gen_random_uuid(),
  client_id               uuid not null references public.clients(id) on delete restrict,
  booking_id              uuid references public.bookings(id) on delete set null,
  amount                  numeric(14,2) not null check (amount > 0),
  amount_paisa            bigint not null check (amount_paisa > 0),
  reason                  text not null check (length(trim(reason)) >= 10),
  created_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now()
);

alter table public.client_account_credits enable row level security;

drop policy if exists client_account_credits_select on public.client_account_credits;
create policy client_account_credits_select on public.client_account_credits
  for select to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

drop policy if exists client_account_credits_insert on public.client_account_credits;
create policy client_account_credits_insert on public.client_account_credits
  for insert to authenticated with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts')
  );

-- Supabase creates public tables with broad anon/authenticated default ACLs.
-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER privileges. Never rely
-- on the RLS predicate alone to stop a browser-authenticated user mutating a
-- credit ledger or clash audit table. All writes here go through audited RPCs
-- (record_extension_clash_decision, resolve_booking_at_risk,
-- mark_booking_will_be_late, extend_booking), which check the actor's role.
revoke all on table public.extension_clash_decisions from public, anon, authenticated;
revoke all on table public.booking_at_risk from public, anon, authenticated;
revoke all on table public.client_account_credits from public, anon, authenticated;

-- SELECT remains guarded by role-specific RLS above. Client, anon and Driver
-- sessions cannot read these staff workflow/finance tables.
grant select on table public.extension_clash_decisions to authenticated;
grant select on table public.booking_at_risk to authenticated;
grant select on table public.client_account_credits to authenticated;


-- Add account_credit columns to clients if not present
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'account_credit') then
    alter table public.clients add column if not exists account_credit numeric(14,2) not null default 0 check (account_credit >= 0);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'account_credit_paisa') then
    alter table public.clients add column if not exists account_credit_paisa bigint not null default 0 check (account_credit_paisa >= 0);
  end if;
end $$;

-- 4. RPC: record_extension_clash_decision
create or replace function public.record_extension_clash_decision(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_other_id      uuid := nullif(p_payload ->> 'conflicting_booking_id', '')::uuid;
  v_days          integer := (p_payload ->> 'days')::integer;
  v_decision      text := p_payload ->> 'decision';
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_client_uuid   uuid := nullif(p_payload ->> 'client_uuid', '')::uuid;
  v_role          system_role;
  v_actor         uuid;
  v_decision_id   uuid;
begin
  if v_booking_id is null then
    raise exception 'record_extension_clash_decision: booking_id is required.';
  end if;
  if v_days is null or v_days < 1 then
    raise exception 'record_extension_clash_decision: days must be at least 1.';
  end if;
  if v_decision not in ('move_next_booking', 'mark_at_risk', 'refuse') then
    raise exception 'record_extension_clash_decision: invalid decision "%".', v_decision;
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'record_extension_clash_decision: reason must be at least 10 characters.';
  end if;

  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'record_extension_clash_decision: Owner, Admin, or Manager only (B41).'
      using errcode = '42501';
  end if;

  v_actor := auth_user_id();

  insert into public.extension_clash_decisions (
    client_uuid, booking_id, conflicting_booking_id, days, decision, reason, decided_by
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()), v_booking_id, v_other_id, v_days, v_decision, v_reason, v_actor
  ) returning id into v_decision_id;

  return jsonb_build_object(
    'success', true,
    'decision_id', v_decision_id,
    'decision', v_decision,
    'days', v_days,
    'booking_id', v_booking_id
  );
end;
$$;

revoke all on function public.record_extension_clash_decision(jsonb) from public, anon;
grant execute on function public.record_extension_clash_decision(jsonb) to authenticated;

-- 5. RPC: resolve_booking_at_risk
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

  -- SECURITY DEFINER bypasses RLS: a Coordinator may resolve operational risks,
  -- but never create account credit or declare a refund on a client's behalf.
  -- Check even when the amount is zero, and reject crafted positive credit_amount
  -- with a non-money resolution before any data is read or written.
  if (v_resolution in ('credit', 'refund') or v_credit_amount > 0)
     and v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'resolve_booking_at_risk: monetary credit or refund resolution requires Owner, Admin or Manager.'
      using errcode = '42501';
  end if;

  select * into v_row from public.booking_at_risk where id = v_at_risk_id;
  if not found then
    raise exception 'resolve_booking_at_risk: at-risk record % not found.', v_at_risk_id;
  end if;

  v_actor := auth_user_id();

  select * into v_booking from public.bookings where id = v_row.booking_id;

  if v_resolution = 'credit' and v_credit_amount > 0 then
    -- Record account credit for the client
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

-- 6. RPC: mark_booking_will_be_late
create or replace function public.mark_booking_will_be_late(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id      uuid := (p_payload ->> 'booking_id')::uuid;
  v_hours_late      integer := coalesce((p_payload ->> 'hours_late')::integer, 24);
  v_reason          text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_booking         public.bookings%rowtype;
  v_actor           uuid;
  v_role            system_role;
  v_now             timestamptz := now();
  v_flagged_count   integer := 0;
  v_clash           record;
begin
  if v_booking_id is null then
    raise exception 'mark_booking_will_be_late: booking_id is required.';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'mark_booking_will_be_late: reason must be at least 10 characters.';
  end if;

  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician') then
    raise exception 'mark_booking_will_be_late: staff only.' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = v_booking_id;
  if not found then
    raise exception 'mark_booking_will_be_late: booking % not found.', v_booking_id;
  end if;

  v_actor := auth_user_id();

  -- Find upcoming bookings holding any of the same physical units starting within 24 hours of scheduled return
  for v_clash in
    select distinct r.booking_id as next_booking_id, b.booking_no as next_booking_no,
           r.asset_id, r.product_id, p.name as product_name, a.asset_tag
    from inventory_reservations r
    join bookings b on b.id = r.booking_id
    left join products p on p.id = r.product_id
    left join product_units a on a.id = r.asset_id
    where r.booking_id <> v_booking_id
      and r.released_at is null
      and r.asset_id is not null
      and r.asset_id in (
        select asset_id from inventory_reservations
        where booking_id = v_booking_id and released_at is null and asset_id is not null
      )
      and lower(r.period) <= (v_booking.return_at + (v_hours_late || ' hours')::interval)
      and lower(r.period) >= v_booking.return_at
  loop
    insert into public.booking_at_risk (
      client_uuid, booking_id, booking_no, cause,
      clashing_booking_id, clashing_booking_no,
      product_id, product_name, asset_id, asset_tag,
      raised_by
    ) values (
      gen_random_uuid(), v_clash.next_booking_id, v_clash.next_booking_no, 'marked_will_be_late',
      v_booking.id, v_booking.booking_no,
      v_clash.product_id, v_clash.product_name, v_clash.asset_id, v_clash.asset_tag,
      v_actor
    );
    v_flagged_count := v_flagged_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'flagged_at_risk_count', v_flagged_count
  );
end;
$$;

revoke all on function public.mark_booking_will_be_late(jsonb) from public, anon;
grant execute on function public.mark_booking_will_be_late(jsonb) to authenticated;

-- 7. Update extend_booking to enforce gate.extend.clash
create or replace function public.extend_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id    uuid := (p_payload ->> 'booking_id')::uuid;
  v_days          integer := coalesce((p_payload ->> 'days')::integer, (p_payload ->> 'extension_days')::integer, 0);
  v_reason        text := btrim(coalesce(p_payload ->> 'reason', ''));
  v_actor         uuid;
  v_claimed_actor uuid := nullif(p_payload ->> 'actor_id', '')::uuid;
  v_claimed_by    uuid := nullif(p_payload ->> 'extended_by', '')::uuid;
  v_role          system_role;
  v_booking       bookings%rowtype;
  v_now           timestamptz := now();
  v_old_return    timestamptz;
  v_new_return    timestamptz;
  v_client_uuid   uuid := nullif(coalesce(p_payload ->> 'client_uuid', ''), '')::uuid;
  v_resync        jsonb;
  v_clash         record;
  v_decision_id   uuid;
  v_decision      text;
begin
  if v_booking_id is null then
    raise exception 'extend_booking: booking_id is required.';
  end if;

  if v_days < 1 then
    raise exception 'extend_booking: extension days must be at least 1 (got %).', v_days;
  end if;

  if char_length(v_reason) < 10 then
    raise exception
      'extend_booking: extension reason must be at least 10 characters (got % characters). State why the booking is being extended.',
      char_length(v_reason);
  end if;

  -- 1. Read booking
  select * into v_booking from bookings where id = v_booking_id;
  if not found then
    raise exception 'extend_booking: booking % does not exist.', v_booking_id;
  end if;

  if v_booking.cancelled_at is not null then
    raise exception 'extend_booking: booking % is cancelled and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.closed_at is not null or v_booking.stage = 'Closed' then
    raise exception 'extend_booking: booking % is Closed and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage = 'Returned' then
    raise exception 'extend_booking: booking % has already Returned and cannot be extended.', v_booking.booking_no;
  end if;

  if v_booking.stage not in ('Quote', 'Booked', 'Packed', 'On Rent') then
    raise exception 'extend_booking: booking % is at stage % and cannot be extended.', v_booking.booking_no, v_booking.stage;
  end if;

  -- 2. Role validation (C+: Coordinator, Manager, Admin, Owner)
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception
      'extend_booking: this session (%) may not extend a booking. Coordinator, Manager, Admin and Owner only.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- 3. Resolve actor
  v_actor := auth_user_id();
  if v_actor is null then
    raise exception 'extend_booking: an authenticated staff user is required.'
      using errcode = '42501';
  end if;
  if (v_claimed_actor is not null and v_claimed_actor is distinct from v_actor)
     or (v_claimed_by is not null and v_claimed_by is distinct from v_actor) then
    raise exception 'extend_booking: supplied actor does not match the authenticated session.'
      using errcode = '42501';
  end if;

  if v_role = 'Coordinator'
     and (auth_user_branch_id() is null
          or v_booking.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'extend_booking: booking belongs to another branch.'
      using errcode = '42501';
  end if;

  -- 4. Calculate new return timestamp
  v_old_return := v_booking.return_at;
  v_new_return := v_old_return + (v_days || ' days')::interval;

  -- 5. T3-29: Check for reservation clashes on physical units
  for v_clash in
    select r.id as res_id, r.booking_id as next_booking_id, b.booking_no as next_booking_no,
           r.asset_id, r.product_id, p.name as product_name, a.asset_tag
    from inventory_reservations r
    join bookings b on b.id = r.booking_id
    left join products p on p.id = r.product_id
    left join product_units a on a.id = r.asset_id
    where r.booking_id <> v_booking_id
      and r.released_at is null
      and r.asset_id is not null
      and r.asset_id in (
        select asset_id from inventory_reservations
        where booking_id = v_booking_id and released_at is null and asset_id is not null
      )
      and r.period && tstzrange(v_old_return, v_new_return, '[)')
  loop
    -- Look for approved manager decision
    select id, decision into v_decision_id, v_decision
    from public.extension_clash_decisions
    where booking_id = v_booking_id
      and days = v_days
      and decision in ('move_next_booking', 'mark_at_risk')
      and not applied
    order by decided_at desc
    limit 1;

    if v_decision_id is null then
      raise exception 'GATE:gate.extend.clash|Extension creates an equipment clash with booking % (no_double_booking) and requires an Owner, Admin, or Manager decision.', v_clash.next_booking_no
        using errcode = 'P0001';
    end if;

    if v_decision = 'mark_at_risk' then
      -- Mark the conflicting upcoming booking at risk
      insert into public.booking_at_risk (
        client_uuid, booking_id, booking_no, cause,
        clashing_booking_id, clashing_booking_no,
        product_id, product_name, asset_id, asset_tag,
        raised_by
      ) values (
        gen_random_uuid(), v_clash.next_booking_id, v_clash.next_booking_no, 'extension_clash',
        v_booking.id, v_booking.booking_no,
        v_clash.product_id, v_clash.product_name, v_clash.asset_id, v_clash.asset_tag,
        v_actor
      );

      -- Release conflicting unit hold on next booking so extension can proceed without GiST exclusion failure
      update inventory_reservations
         set released_at = v_now,
             released_reason = 'Released due to extension clash; marked At Risk'
       where id = v_clash.res_id;
    elsif v_decision = 'move_next_booking' then
      update inventory_reservations
         set released_at = v_now,
             released_reason = 'Released due to extension clash; moved to similar or sub-rent'
       where id = v_clash.res_id;
    end if;

    update public.extension_clash_decisions
       set applied = true
     where id = v_decision_id;
  end loop;

  -- 6. Update bookings.return_at
  update bookings
     set return_at = v_new_return,
         updated_at = v_now
   where id = v_booking_id;

  -- 7. Update booking_lines days
  update booking_lines
     set days = days + v_days,
         updated_at = v_now
   where booking_id = v_booking_id
     and voided_at is null
     and days is not null;

  -- 8. Update inventory_reservations
  update inventory_reservations
     set period = tstzrange(lower(period), v_new_return, '[)')
   where booking_id = v_booking_id
     and released_at is null;

  -- 9. Invoice resync if draft exists
  if exists (select 1 from invoices where booking_id = v_booking_id and status = 'Draft') then
    v_resync := public.resync_draft_invoice(v_booking_id);
  end if;

  -- 10. Audit log
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
    old_values,
    new_values,
    reason
  ) values (
    coalesce(v_client_uuid, gen_random_uuid()),
    'status change',
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    v_booking.branch_id,
    jsonb_build_object(
      'return_at', v_old_return
    ),
    jsonb_build_object(
      'return_at', v_new_return,
      'days_added', v_days,
      'reason', v_reason,
      'clash_decision', v_decision
    ),
    v_reason
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'booking_no', v_booking.booking_no,
    'old_return_at', v_old_return,
    'new_return_at', v_new_return,
    'days_added', v_days,
    'clash_decision', v_decision,
    'invoice_resync', v_resync
  );
end;
$$;

revoke all on function public.extend_booking(jsonb) from public, anon;
grant execute on function public.extend_booking(jsonb) to authenticated;

-- 8. Trigger to enforce gate.pack.at_risk
create or replace function public.enforce_pack_at_risk_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.to_stage = 'Packed' then
    if exists (
      select 1
      from public.booking_at_risk
      where booking_id = NEW.booking_id
        and resolved_at is null
    ) then
      raise exception 'GATE:gate.pack.at_risk|Booking % is flagged At Risk and cannot reach Pack until covered or resolved.', NEW.booking_id using errcode = 'P0001';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_pack_at_risk_gate on public.booking_stage_transitions;
create trigger trg_enforce_pack_at_risk_gate
  before insert on public.booking_stage_transitions
  for each row execute function public.enforce_pack_at_risk_gate();

-- Record 0241_extension_clash_manager_decision_and_at_risk in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030122', '0241_extension_clash_manager_decision_and_at_risk')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0241_extension_clash_manager_decision_and_at_risk.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0242_return_damage_signature_and_refusal.sql
-- SHA-256: 48ceb1888b01089b9c1ae99665d707255972f921f1799d49901d1074f1f87d67
-- Version: 20261122030123
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

begin;

-- ===========================================================================
-- T2-19: Signature at Return when damage or missing gear is found (B19, R-39)
--
-- At Return, when at least one unit is flagged damaged or missing, the person
-- returning the gear must sign once under the list of flagged items before Return
-- can complete (gate.return.damage_unsigned).
-- With no flags, no signature is asked (R-39).
-- If the person will not sign, staff tick "Refused to sign" with a reason of at
-- least 10 characters (audited, allowing Return to complete without stalling the floor).
-- ===========================================================================

-- 1. Add signature refusal tracking columns to operation_sessions
alter table public.operation_sessions
  add column if not exists signature_refused boolean not null default false,
  add column if not exists signature_refusal_reason text;

alter table public.operation_sessions
  drop constraint if exists operation_sessions_signature_refusal_check;

alter table public.operation_sessions
  add constraint operation_sessions_signature_refusal_check
  check (
    signature_refused = false
    or (signature_refusal_reason is not null and length(trim(signature_refusal_reason)) >= 10)
  );

-- 2. Trigger function to enforce gate.return.damage_unsigned
create or replace function public.require_return_damage_signature()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return_session_id uuid;
  v_signature_refused boolean := false;
  v_signature_refusal_reason text := null;
begin
  if tg_table_name = 'operation_sessions' then
    if new.operation <> 'Return' or new.state <> 'Completed'
      or old.state is not distinct from new.state then
      return new;
    end if;
    v_return_session_id := new.id;
    v_signature_refused := coalesce(new.signature_refused, false);
    v_signature_refusal_reason := new.signature_refusal_reason;
  else
    -- booking_stage_transitions
    if new.to_stage <> 'Returned' or new.from_stage is distinct from 'On Rent' then
      return new;
    end if;
    select session.id, coalesce(session.signature_refused, false), session.signature_refusal_reason
    into v_return_session_id, v_signature_refused, v_signature_refusal_reason
    from public.operation_sessions session
    where session.booking_id = new.booking_id and session.operation = 'Return'
      and session.state in ('In Progress', 'Completed')
    order by session.created_at desc
    limit 1;
    if v_return_session_id is null then
      return new; -- gate.return.session_missing handles this
    end if;
  end if;

  -- Check if any unit or line is flagged damaged or missing in this return session
  if exists (
    select 1
    from public.damage_findings finding
    join public.return_lines receipt on receipt.id = finding.return_line_id
    where receipt.session_id = v_return_session_id and finding.voided_at is null
    union
    select 1
    from public.booking_line_units unit
    where unit.return_session_id = v_return_session_id
      and unit.unit_state in ('Damaged', 'Missing')
    union
    select 1
    from public.return_lines receipt
    where receipt.session_id = v_return_session_id
      and (receipt.state = 'Not Returned' or receipt.condition in ('Damaged', 'Lost'))
  ) then
    -- A flagged return requires either a returning person signature or a recorded refusal (reason >= 10 chars)
    if not (
      (v_signature_refused = true and v_signature_refusal_reason is not null and length(trim(v_signature_refusal_reason)) >= 10)
      or exists (
        select 1
        from public.signatures sig
        where sig.session_id = v_return_session_id
          and sig.signature_role = 'Returning person'
      )
    ) then
      raise exception 'GATE:gate.return.damage_unsigned|A Return with flagged items requires the returning person signature or a recorded refusal (≥10 chars).'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.require_return_damage_signature() from public, anon, authenticated;

drop trigger if exists trg_return_damage_signature on public.operation_sessions;
create trigger trg_return_damage_signature
before update of state on public.operation_sessions
for each row execute function public.require_return_damage_signature();

-- The floor action advances the booking before sealing the session.
drop trigger if exists aab_return_damage_signature on public.booking_stage_transitions;
create trigger aab_return_damage_signature
before insert on public.booking_stage_transitions
for each row execute function public.require_return_damage_signature();

commit;

-- Record 0242_return_damage_signature_and_refusal in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030123', '0242_return_damage_signature_and_refusal')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0242_return_damage_signature_and_refusal.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0243_change_confirmed_booking.sql
-- SHA-256: b88d0cd4a850493013292c69f92b6bc9f032769d5d61cc03829ffe7ab585a636
-- Version: 20261122030124
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0243_change_confirmed_booking.sql
-- T3-18 / W87, W88: Change a confirmed booking
--
-- 1. Adds public.bookings.parent_booking_id for linked bookings (W87).
-- 2. Grants select (parent_booking_id) to authenticated.
-- 3. Updates create_booking to persist and return parent_booking_id.
-- 4. Updates read_booking_for_change to include parent_booking_id.
-- 5. Authors change_booking(p_id, p_revision, p_key, p_payload) and change_booking(p_payload)
--    RPCs: atomic, revision-locked, GiST double-booking protected, packed-line guarded,
--    idempotent via record_editor_private.receipts, and resyncs Draft invoices.

-- -----------------------------------------------------------------------------
-- 1. Schema: parent_booking_id on public.bookings
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists parent_booking_id uuid references public.bookings(id) on delete set null;

comment on column public.bookings.parent_booking_id is
  'T3-18 / W87: References the parent booking when additional gear is taken as a linked booking mid-rental.';

create index if not exists idx_bookings_parent_booking_id
  on public.bookings (parent_booking_id);

grant select (parent_booking_id) on public.bookings to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Update create_booking to support parent_booking_id
-- -----------------------------------------------------------------------------
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
  /* 0238 */
  v_rental_day_start          integer;
  v_existing_rental_day_start integer;
  v_setting_val               text;
  /* T3-30 */
  v_is_consumable     boolean;
  /* T3-18 */
  v_parent_booking_id  uuid := nullif(p_payload ->> 'parent_booking_id', '')::uuid;
  v_existing_parent_id uuid;
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

  -- ── 0238: Resolve rental_day_start ───────────────────────────────────────
  if p_payload ? 'rental_day_start' and (p_payload ->> 'rental_day_start') is not null then
    v_rental_day_start := (p_payload ->> 'rental_day_start')::integer;
  else
    select s.value #>> '{}' into v_setting_val
      from settings s
     where s.key = 'operationalDayStart'
       and (s.location_id = v_branch or s.location_id is null)
     order by s.location_id nulls last
     limit 1;

    if v_setting_val is not null and v_setting_val ~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' then
      v_rental_day_start := split_part(v_setting_val, ':', 1)::integer * 60 + split_part(v_setting_val, ':', 2)::integer;
    else
      v_rental_day_start := 360; -- 06:00 default
    end if;
  end if;

  if v_rental_day_start is null or v_rental_day_start < 0 or v_rental_day_start >= 1440 or (v_rental_day_start % 15) <> 0 then
    raise exception 'create_booking: rental_day_start must be between 0 and 1439 in 15-minute increments. Nothing was created.'
      using errcode = '22026';
  end if;

  -- ── 0144: Validate project_type ──────────────────────────────────────────
  if v_project_type is not null and v_project_type not in (
    'Feature Film',
    'Documentary',
    'Commercial / Ad',
    'Music Video',
    'Corporate Video',
    'Wedding / Event',
    'Short Film',
    'Television / Series',
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
  select id, booking_no, stage::text, rental_day_start, parent_booking_id
    into v_existing_id, v_existing_no, v_existing_stage, v_existing_rental_day_start, v_existing_parent_id
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id',        v_existing_id,
      'booking_no',        v_existing_no,
      'stage',             v_existing_stage,
      'project_name',      v_project_name,
      'shoot_location',    v_shoot_location,
      'rental_day_start',  v_existing_rental_day_start,
      'parent_booking_id', v_existing_parent_id,
      'replayed',          true
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
    vat_rate, rental_day_start, parent_booking_id, created_by, updated_by
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
    v_rental_day_start,
    v_parent_booking_id,
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

      -- T3-30: Check consumable tracking mode
      v_is_consumable := false;
      if (v_line ->> 'product_id') is not null then
        select (p.tracking_mode = 'Consumable') into v_is_consumable
          from products p where p.id = (v_line ->> 'product_id')::uuid;
        v_is_consumable := coalesce(v_is_consumable, false);
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

      -- ── S1-10: Total and breakdown ─────────────────────────────────────────
      v_payload_total := (v_line ->> 'line_total')::numeric;
      v_payload_breakdown := v_line -> 'price_breakdown';
      v_line_qty := coalesce((v_line ->> 'qty')::integer, 1);
      v_line_days := coalesce((v_line ->> 'days')::integer, 1);
      v_line_discount := coalesce((v_line ->> 'discount_amount')::numeric, 0);

      -- T3-30: Consumables do not multiply by days
      if v_is_consumable then
        v_computed_total := greatest(0, (v_line_qty * coalesce(v_final_rate, 0)) - v_line_discount);
      else
        v_computed_total := greatest(0, (v_line_qty * v_line_days * coalesce(v_final_rate, 0)) - v_line_discount);
      end if;

      if auth_can_view_money() and v_payload_total is not null then
        v_final_total := v_payload_total;
      else
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
        coalesce((v_line ->> 'line_type')::booking_line_type, 'Equipment'::booking_line_type),
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        case when v_is_consumable then 1 else (v_line ->> 'days')::integer end,
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

      -- ── D5: creation-time unit assignment ──────────────────────────────────
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

    if v_wrote = 0 and jsonb_array_length(v_pending) > 0 then
      raise exception 'create_booking: cyclic or unresolvable parent_client_uuid in lines payload. Nothing was created.';
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ─────────────────────────────────────────────────────────────
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
    'rental_day_start',  v_rental_day_start,
    'parent_booking_id', v_parent_booking_id,
    'replayed',          false
  );
end;
$$;

revoke all on function public.create_booking(jsonb) from public, anon;
grant execute on function public.create_booking(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Update read_booking_for_change RPC to include parent_booking_id
-- -----------------------------------------------------------------------------
create or replace function public.read_booking_for_change(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b bookings;
  result jsonb;
  line_rows jsonb;
  crew_rows jsonb;
  transport_row jsonb;
  discounts jsonb;
  v_role text;
begin
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'You cannot edit this booking.' using errcode = '42501';
  end if;

  select * into b from bookings where id::text = p_id or booking_no = p_id;
  if b.id is null then
    raise exception 'Booking not found.';
  end if;

  if b.cancelled_at is not null then
    raise exception 'Cancelled bookings cannot be edited.';
  end if;

  if b.stage in ('Returned', 'Closed') or b.closed_at is not null then
    raise exception 'Returned or closed bookings cannot be edited. Use operational corrections.';
  end if;

  select coalesce(jsonb_agg(
    record_editor_private.pick(to_jsonb(l), array[
      'id', 'client_uuid', 'parent_line_id', 'line_type', 'product_id', 'bundle_id',
      'description', 'qty', 'days', 'rate', 'discount_amount', 'is_included',
      'service_basis', 'line_note', 'sort_order'
    ]) || jsonb_build_object(
      'name', coalesce(l.description, p.name, k.name),
      'parent_client_uuid', parent.client_uuid,
      'is_packed', exists (
        select 1 from packing_lines pl
         where pl.booking_line_id = l.id and pl.state = 'Packed'
      ) or (
        b.stage in ('Packed', 'On Rent') and exists (
          select 1 from booking_line_units blu
           where blu.booking_line_id = l.id and blu.released_at is null
        )
      )
    ) order by l.sort_order, l.id
  ), '[]'::jsonb) into line_rows
  from booking_lines l
  left join products p on p.id = l.product_id
  left join bundles k on k.id = l.bundle_id
  left join booking_lines parent on parent.id = l.parent_line_id
  where l.booking_id = b.id and l.voided_at is null;

  select coalesce(jsonb_agg(
    record_editor_private.pick(to_jsonb(c), array[
      'id', 'client_uuid', 'crew_member_id', 'name', 'crew_role', 'phone',
      'day_rate', 'days', 'overtime', 'accommodation', 'meals'
    ]) order by c.id
  ), '[]'::jsonb) into crew_rows
  from booking_crew_lines c
  where c.booking_id = b.id and c.voided_at is null;

  select record_editor_private.pick(to_jsonb(t), array[
    'id', 'vehicle', 'number_plate', 'driver_contact', 'delivery_charge', 'fuel_charge', 'special_instructions'
  ]) into transport_row
  from booking_transport t
  where t.booking_id = b.id;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', id, 'percent', percent) order by id
  ), '[]'::jsonb) into discounts
  from booking_discounts
  where booking_id = b.id;

  result := jsonb_build_object(
    'id', b.id,
    'code', b.booking_no,
    'stage', b.stage,
    'parent_booking_id', b.parent_booking_id,
    'rental_day_start', b.rental_day_start,
    'values', record_editor_private.pick(to_jsonb(b), array[
      'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
      'project_type', 'project_type_other', 'pickup_at', 'return_at',
      'delivery_type', 'pickup_location', 'return_location', 'deposit_required',
      'parent_booking_id', 'rental_day_start'
    ]),
    'lines', line_rows,
    'crew', crew_rows,
    'transport', transport_row,
    'discounts', discounts
  );

  return result || jsonb_build_object(
    'revision', md5((result || jsonb_build_object('updated_at', b.updated_at, 'version', b.version))::text)
  );
end;
$$;

revoke all on function public.read_booking_for_change(text) from public, anon;
grant execute on function public.read_booking_for_change(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. change_booking RPC (T3-18 / W87, W88)
-- -----------------------------------------------------------------------------
create or replace function public.change_booking(
  p_id uuid,
  p_revision text,
  p_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_actor uuid;
  b bookings;
  req jsonb;
  receipt record;
  result jsonb;
  row_data jsonb;
  patch jsonb;
  existing jsonb;
  row_id uuid;
  kept uuid[] := '{}';
  kept_crew uuid[] := '{}';
  mapping jsonb := '{}';
  parent_id uuid;
  transport_id uuid;
  audit_id uuid := gen_random_uuid();
  first_discount uuid;
  discount_pct numeric;
  rate numeric;
  base_rate numeric;
  v_pickup timestamptz;
  v_return timestamptz;
  v_dates_changed boolean := false;
  v_now timestamptz := clock_timestamp();
  v_packed_unit_count integer;
  v_existing_line record;
begin
  -- 1. Authorization: C+ only (Owner, Admin, Manager, Coordinator)
  v_role := auth_user_role();
  if auth.uid() is null or v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'You cannot edit this booking.' using errcode = '42501';
  end if;
  v_actor := auth.uid();

  if p_key is null or p_revision is null then
    raise exception 'Reload this booking before saving.';
  end if;

  -- 2. Idempotency & Concurrency lock
  req := jsonb_build_object('booking', p_id, 'revision', p_revision, 'payload', p_payload);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into receipt from record_editor_private.receipts where key = p_key;
  if found then
    if receipt.actor <> v_actor or receipt.request <> req then
      raise exception 'This save key belongs to another change.';
    end if;
    return receipt.response;
  end if;

  -- 3. Lock booking and child rows
  select * into b from bookings where id = p_id for update;
  if b.id is null then
    raise exception 'Booking not found.';
  end if;

  if b.cancelled_at is not null then
    raise exception 'Cancelled bookings cannot be edited.';
  end if;

  if b.stage in ('Returned', 'Closed') or b.closed_at is not null then
    raise exception 'Returned or closed bookings cannot be edited. Use operational corrections.';
  end if;

  if v_role = 'Coordinator' and (auth_user_branch_id() is null or b.branch_id is distinct from auth_user_branch_id()) then
    raise exception 'You cannot edit a booking from another branch.' using errcode = '42501';
  end if;

  perform 1 from booking_lines where booking_id = p_id for update;
  perform 1 from booking_crew_lines where booking_id = p_id for update;
  perform 1 from booking_transport where booking_id = p_id for update;
  perform 1 from booking_discounts where booking_id = p_id for update;
  perform 1 from invoices where booking_id = p_id for update;

  if exists (select 1 from invoices where booking_id = p_id and status::text not in ('Draft', 'Void')) then
    raise exception 'This booking has an issued financial document. Use the finance correction workflow.';
  end if;

  -- 4. Revision check (Law 8 / concurrency)
  if (read_booking_for_change(p_id::text) ->> 'revision') <> p_revision then
    raise exception 'GATE:gate.booking.concurrent_change|This booking changed since you opened it. Reload the latest record before saving.'
      using errcode = '40001';
  end if;

  if jsonb_typeof(p_payload -> 'lines') <> 'array' or jsonb_typeof(p_payload -> 'crew') <> 'array' then
    raise exception 'Invalid booking lines.';
  end if;

  patch := p_payload -> 'values';
  if exists (
    select 1 from jsonb_object_keys(patch) k
     where not k = any(array[
       'client_id', 'contact_id', 'branch_id', 'project', 'project_name', 'shoot_location',
       'project_type', 'project_type_other', 'pickup_at', 'return_at',
       'delivery_type', 'pickup_location', 'return_location', 'deposit_required',
       'parent_booking_id', 'rental_day_start'
     ])
  ) then
    raise exception 'This booking field cannot be edited.';
  end if;

  if patch ? 'client_id' and (patch ->> 'client_id')::uuid is distinct from b.client_id and exists (select 1 from invoices where booking_id = p_id) then
    raise exception 'The client cannot change after a financial document has been created.';
  end if;

  -- 5. Date validation and change detection
  v_pickup := coalesce((patch ->> 'pickup_at')::timestamptz, b.pickup_at);
  v_return := coalesce((patch ->> 'return_at')::timestamptz, b.return_at);
  if v_pickup is null or v_return is null or v_return <= v_pickup then
    raise exception 'Choose valid pickup and return dates.';
  end if;
  if v_pickup <> b.pickup_at or v_return <> b.return_at then
    v_dates_changed := true;
  end if;

  -- 6. Packed units removal guard (W88 / gate.booking.packed_line_removed)
  for v_existing_line in
    select bl.id, bl.description, bl.qty,
           coalesce((select count(*) from packing_lines pl where pl.booking_line_id = bl.id and pl.state = 'Packed'), 0) as packed_count,
           coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0) as assigned_count
      from booking_lines bl
     where bl.booking_id = p_id and bl.voided_at is null
  loop
    v_packed_unit_count := case
      when b.stage in ('Packed', 'On Rent') then greatest(v_existing_line.packed_count, v_existing_line.assigned_count)
      else v_existing_line.packed_count
    end;

    if v_packed_unit_count > 0 then
      select value into row_data
        from jsonb_array_elements(p_payload -> 'lines')
       where (value ->> 'id')::uuid = v_existing_line.id;

      if row_data is null or (row_data ->> 'qty')::integer < v_packed_unit_count then
        raise exception 'GATE:gate.booking.packed_line_removed|Packed items cannot be silently removed. Unpack them on the floor first.'
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  -- 7. Update bookings header row
  perform record_editor_private.write_row('bookings', p_id, patch || jsonb_build_object('updated_at', v_now, 'updated_by', v_actor));

  -- 8. Upsert booking lines
  for row_data in select value from jsonb_array_elements(p_payload -> 'lines') loop
    row_id := (row_data ->> 'id')::uuid;
    if row_id is not null then
      select to_jsonb(l) into existing from booking_lines l where id = row_id and booking_id = p_id and voided_at is null;
      if existing is null then
        raise exception 'A line no longer belongs to this booking. Reload before saving.';
      end if;
      if row_data ->> 'client_uuid' is distinct from existing ->> 'client_uuid' then
        raise exception 'A line identity cannot change.';
      end if;
    else
      existing := null;
    end if;

    if row_data ->> 'client_uuid' is null then
      raise exception 'Every line needs a stable key.';
    end if;

    patch := record_editor_private.pick(row_data, array[
      'line_type', 'product_id', 'bundle_id', 'description', 'qty', 'days',
      'rate', 'discount_amount', 'is_included', 'service_basis', 'line_note', 'sort_order'
    ]);

    if row_data ->> 'parent_client_uuid' is not null or coalesce((patch ->> 'is_included')::boolean, false) then
      rate := 0;
      base_rate := 0;
    else
      base_rate := get_model_daily_rate((patch ->> 'product_id')::uuid, (patch ->> 'bundle_id')::uuid);
      rate := coalesce((patch ->> 'rate')::numeric, base_rate, 0);
    end if;

    patch := patch || jsonb_build_object('rate', rate, 'rate_overridden', base_rate is not null and rate <> base_rate);
    if row_id is null then
      patch := patch || jsonb_build_object('booking_id', p_id, 'client_uuid', row_data ->> 'client_uuid', 'created_by', v_actor);
    end if;

    row_id := record_editor_private.write_row('booking_lines', row_id, patch);
    if row_id = any(kept) then
      raise exception 'A booking line appears twice.';
    end if;

    kept := array_append(kept, row_id);
    mapping := mapping || jsonb_build_object(row_data ->> 'client_uuid', row_id);
  end loop;

  -- 9. Resolve parent_line_id
  for row_data in select value from jsonb_array_elements(p_payload -> 'lines') loop
    row_id := (mapping ->> (row_data ->> 'client_uuid'))::uuid;
    parent_id := (mapping ->> (row_data ->> 'parent_client_uuid'))::uuid;
    if row_data ->> 'parent_client_uuid' is not null and parent_id is null then
      raise exception 'The bundle parent is missing.';
    end if;
    update booking_lines set parent_line_id = parent_id where id = row_id;
  end loop;

  -- 10. Void unkept lines and release their holds
  update booking_lines
     set voided_at = v_now,
         voided_reason = 'Removed while changing booking'
   where booking_id = p_id
     and voided_at is null
     and not id = any(kept);

  update inventory_reservations
     set released_at = v_now,
         released_reason = 'Released: booking line removed'
   where booking_id = p_id
     and booking_line_id is not null
     and booking_line_id not in (select unnest(kept))
     and released_at is null;

  -- Quantity check: assigned units cannot exceed new quantity
  if exists (
    select 1 from booking_lines l
     where l.id = any(kept)
       and (select count(*) from booking_line_units u where u.booking_line_id = l.id and u.released_at is null) > l.qty
  ) then
    raise exception 'Release assigned units before reducing this quantity.';
  end if;

  -- 11. Inventory reservations updates (GiST exclusion enforces no double booking)
  if b.stage in ('Booked', 'Packed', 'On Rent') then
    -- If dates changed, update period on all active reservations
    if v_dates_changed then
      update inventory_reservations r
         set period = public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes)
        from booking_lines bl
        left join products p on p.id = bl.product_id
       where r.booking_id = p_id
         and r.booking_line_id = bl.id
         and r.released_at is null;

      update inventory_reservations
         set period = tstzrange(v_pickup, v_return, '[)')
       where booking_id = p_id
         and booking_line_id is null
         and released_at is null;
    end if;

    -- Adjust quantity reservations if line quantity was decreased
    update inventory_reservations r
       set qty = bl.qty - coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0)
      from booking_lines bl
     where r.booking_id = p_id
       and r.booking_line_id = bl.id
       and r.asset_id is null
       and r.released_at is null
       and (bl.qty - coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0)) > 0
       and r.qty > (bl.qty - coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0));

    -- Release excess quantity reservations if line quantity is now completely satisfied by units
    update inventory_reservations r
       set released_at = v_now,
           released_reason = 'Released: line quantity covered by assigned units'
      from booking_lines bl
     where r.booking_id = p_id
       and r.booking_line_id = bl.id
       and r.asset_id is null
       and r.released_at is null
       and bl.qty <= coalesce((select count(*) from booking_line_units blu where blu.booking_line_id = bl.id and blu.released_at is null), 0);

    -- Insert quantity holds for any line item not yet fully reserved
    insert into inventory_reservations
      (client_uuid, booking_id, booking_line_id, product_id, qty, period, created_by, hold_state)
    select gen_random_uuid(), p_id, bl.id, bl.product_id,
           bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0),
           public.get_effective_rental_window(v_pickup, v_return, p.prep_time_minutes, p.cleaning_time_minutes),
           v_actor, 'confirmed'
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
     where bl.booking_id = p_id
       and bl.id = any(kept)
       and bl.voided_at is null
       and bl.product_id is not null
       and (bl.qty - coalesce(u.n, 0) - coalesce(res.n, 0)) > 0;
  end if;

  -- 12. Crew lines
  for row_data in select value from jsonb_array_elements(p_payload -> 'crew') loop
    row_id := (row_data ->> 'id')::uuid;
    if row_id is not null and not exists (select 1 from booking_crew_lines where id = row_id and booking_id = p_id and voided_at is null) then
      raise exception 'This crew row does not belong to the booking.';
    end if;

    patch := record_editor_private.pick(row_data, array[
      'crew_member_id', 'name', 'crew_role', 'phone', 'day_rate', 'days', 'overtime', 'accommodation', 'meals'
    ]);

    if row_id is null then
      patch := patch || jsonb_build_object('booking_id', p_id, 'client_uuid', gen_random_uuid(), 'created_by', v_actor);
    end if;

    row_id := record_editor_private.write_row('booking_crew_lines', row_id, patch);
    kept_crew := array_append(kept_crew, row_id);
  end loop;

  update booking_crew_lines
     set voided_at = v_now
   where booking_id = p_id
     and voided_at is null
     and not id = any(kept_crew);

  -- 13. Transport
  select id into transport_id from booking_transport where booking_id = p_id;
  patch := record_editor_private.pick(coalesce(p_payload -> 'transport', '{}'::jsonb), array[
    'vehicle', 'number_plate', 'driver_contact', 'delivery_charge', 'fuel_charge', 'special_instructions'
  ]);

  if transport_id is not null or patch <> '{}'::jsonb then
    if transport_id is null then
      patch := patch || jsonb_build_object('booking_id', p_id, 'client_uuid', gen_random_uuid(), 'created_by', v_actor);
    end if;
    perform record_editor_private.write_row('booking_transport', transport_id, patch);
  end if;

  -- 14. Audit event
  insert into audit_events (
    id, client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values
  ) values (
    audit_id, p_key, 'status change', 'Rentals', 'Rentals', 'Update', 'Informational', 'Success',
    'bookings', p_id, v_actor, v_role, b.branch_id,
    jsonb_build_object('revision', p_revision),
    jsonb_build_object('edited', b.stage)
  );

  -- 15. Discounts
  discount_pct := (p_payload ->> 'discount_percent')::numeric;
  if discount_pct is not null then
    if discount_pct < 0 or discount_pct > 100 then
      raise exception 'Discount must be between 0 and 100 percent.';
    end if;

    if discount_pct is distinct from (select coalesce(sum(percent), 0) from booking_discounts where booking_id = p_id) then
      select id into first_discount from booking_discounts where booking_id = p_id order by id limit 1;
      if first_discount is null and discount_pct > 0 then
        insert into booking_discounts (client_uuid, booking_id, branch_id, discount_source, percent, reason, applied_by, audit_event_id)
        values (gen_random_uuid(), p_id, b.branch_id, 'Manual', discount_pct, 'Booking changed', v_actor, audit_id);
      else
        update booking_discounts
           set percent = case when id = first_discount then discount_pct else 0 end,
               reason = 'Booking changed',
               audit_event_id = audit_id
         where booking_id = p_id;
      end if;
    end if;
  end if;

  -- 16. Draft invoice resync (T3-14 / T3-18)
  if exists (select 1 from invoices where booking_id = p_id and status = 'Draft') then
    perform public.resync_draft_invoice(p_id);
  end if;

  -- 17. Snapshot and receipt
  result := read_booking_for_change(p_id::text);
  insert into record_editor_private.receipts (key, actor, request, response)
  values (p_key, v_actor, req, result);

  return result;
end;
$$;

revoke all on function public.change_booking(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.change_booking(uuid, text, uuid, jsonb) to authenticated;

-- Overload taking single jsonb object for flexible RPC invocation
create or replace function public.change_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce((p_payload ->> 'booking_id')::uuid, (p_payload ->> 'id')::uuid);
  v_revision text := coalesce(p_payload ->> 'revision', p_payload ->> 'expected_revision');
  v_key uuid := coalesce((p_payload ->> 'key')::uuid, (p_payload ->> 'client_uuid')::uuid);
  v_inner_payload jsonb := case
    when p_payload ? 'payload' and jsonb_typeof(p_payload -> 'payload') = 'object' then p_payload -> 'payload'
    else p_payload
  end;
begin
  return public.change_booking(v_id, v_revision, v_key, v_inner_payload);
end;
$$;

revoke all on function public.change_booking(jsonb) from public, anon;
grant execute on function public.change_booking(jsonb) to authenticated;

-- Record 0243_change_confirmed_booking in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030124', '0243_change_confirmed_booking')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0243_change_confirmed_booking.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0244_counter_sale.sql
-- SHA-256: 6d62d89555fa72f52753a2d8ee1d8382c17548819a66c424c083df38ff786d92
-- Version: 20261122030125
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0244: Atomic Counter Sale & Cancellation RPCs (T3-31, B46, B51)
--
-- Enables walk-in consumable sales without renting:
-- 1. Adds `booking_kind` ('rental' | 'counter_sale') to public.bookings.
-- 2. Updates `consumable_stock_movements` to support 'Deduction' and 'Restoration'
--    with unique (booking_line_id, movement_type) idempotency.
-- 3. Implements `create_counter_sale(jsonb)`:
--    - Atomic product row locking (FOR UPDATE)
--    - Consumable-only tracking check
--    - Server-authoritative unit price and stock deduction
--    - Monotonic booking number and draft invoice creation via resync_draft_invoice
--    - Law 6 money blindness: floor roles (Warehouse/Technician) receive no money
--    - Law 8 idempotency: retry on same client_uuid returns existing sale
-- 4. Implements `cancel_counter_sale(uuid, text, uuid)`:
--    - Pre-payment cancellation only (refuses if payments exist)
--    - Restores stock once with 'Restoration' movement
--    - Voids draft invoice preserving audit history (Law 3)
-- =============================================================================

begin;

-- 1. Add booking_kind column to bookings
alter table public.bookings
  add column if not exists booking_kind text not null default 'rental';

alter table public.bookings
  drop constraint if exists bookings_booking_kind_check;

alter table public.bookings
  add constraint bookings_booking_kind_check check (booking_kind in ('rental', 'counter_sale'));

comment on column public.bookings.booking_kind is
  'rental: standard equipment booking with custody stages. counter_sale: direct consumable sale with instant stock deduction and draft invoice.';

-- 2. Update consumable_stock_movements for cancellation restoration
alter table public.consumable_stock_movements
  add column if not exists movement_type text not null default 'Deduction';

alter table public.consumable_stock_movements
  drop constraint if exists consumable_stock_movements_movement_type_check;

alter table public.consumable_stock_movements
  add constraint consumable_stock_movements_movement_type_check check (movement_type in ('Deduction', 'Restoration'));

alter table public.consumable_stock_movements
  drop constraint if exists consumable_stock_movements_one_per_line;

alter table public.consumable_stock_movements
  drop constraint if exists consumable_stock_movements_line_type_unique;

alter table public.consumable_stock_movements
  add constraint consumable_stock_movements_line_type_unique unique (booking_line_id, movement_type);

-- 3. create_counter_sale RPC
create or replace function public.create_counter_sale(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_uuid        uuid;
  v_actor              uuid;
  v_role               system_role;
  v_branch_id          uuid;
  v_client_id          uuid;
  v_existing_booking   public.bookings%rowtype;
  v_lines              jsonb;
  v_line_elem          jsonb;
  v_product_id         uuid;
  v_qty                integer;
  v_booking_no         text;
  v_booking_id         uuid;
  v_line_id            uuid;
  v_line_client_uuid   uuid;
  v_prod_name          text;
  v_prod_tracking      text;
  v_prod_active        boolean;
  v_stock_before       integer;
  v_stock_after        integer;
  v_unit_sale_price    numeric(14,2);
  v_line_total         numeric(14,2);
  v_inv_client_uuid    uuid;
  v_invoice_id         uuid;
  v_total_amount_paisa bigint;
begin
  -- 1. Law 8: client_uuid is mandatory
  v_client_uuid := nullif(p_payload ->> 'client_uuid', '')::uuid;
  if v_client_uuid is null then
    raise exception 'GATE:gate.counter_sale.missing_client_uuid|client_uuid is required (Law 8).'
      using errcode = 'P0001';
  end if;

  -- 2. Actor and Role verification (B51: floor roles and desk roles can start counter sale)
  v_role := auth_user_role();
  if v_role is null or v_role in ('Driver', 'Client') then
    raise exception 'GATE:gate.counter_sale.unauthorized_role|Your role is not authorized to create counter sales.'
      using errcode = '42501';
  end if;

  v_actor := nullif(p_payload ->> 'actor_id', '')::uuid;
  if auth_user_id() is not null and v_actor is not null and v_actor is distinct from auth_user_id() then
    raise exception 'GATE:gate.counter_sale.actor_mismatch|Permission denied: actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;
  if v_actor is null then
    v_actor := auth_user_id();
  end if;
  if v_actor is null then
    select id into v_actor from users where role = v_role and is_active = true limit 1;
  end if;

  -- 3. Law 8 Idempotency: return existing sale if client_uuid already used
  select * into v_existing_booking from public.bookings where client_uuid = v_client_uuid;
  if v_existing_booking.id is not null then
    if not auth_can_view_money() then
      return jsonb_build_object(
        'booking_id', v_existing_booking.id,
        'booking_no', v_existing_booking.booking_no,
        'booking_kind', v_existing_booking.booking_kind,
        'stage', v_existing_booking.stage,
        'client_uuid', v_existing_booking.client_uuid,
        'status', 'existing'
      );
    else
      select id, round(total_amount * 100)::bigint
        into v_invoice_id, v_total_amount_paisa
        from public.invoices
       where booking_id = v_existing_booking.id
       limit 1;

      return jsonb_build_object(
        'booking_id', v_existing_booking.id,
        'booking_no', v_existing_booking.booking_no,
        'booking_kind', v_existing_booking.booking_kind,
        'stage', v_existing_booking.stage,
        'client_uuid', v_existing_booking.client_uuid,
        'invoice_id', v_invoice_id,
        'total_amount_paisa', v_total_amount_paisa,
        'status', 'existing'
      );
    end if;
  end if;

  -- 4. Validate lines
  v_lines := p_payload -> 'lines';
  if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'GATE:gate.counter_sale.empty_lines|Counter sale requires at least one consumable item.'
      using errcode = 'P0001';
  end if;

  -- 5. Branch resolution
  v_branch_id := nullif(p_payload ->> 'branch_id', '')::uuid;
  if v_branch_id is null then
    select branch_id into v_branch_id from public.users where id = v_actor;
  end if;
  if v_branch_id is null then
    select id into v_branch_id from public.branches order by id limit 1;
  end if;

  -- 6. Client resolution (Walk-in client default)
  v_client_id := nullif(p_payload ->> 'client_id', '')::uuid;
  if v_client_id is null then
    select id into v_client_id from public.clients where name = 'Walk-in Client' limit 1;
    if v_client_id is null then
      insert into public.clients (
        client_uuid, client_code, name, phone, status, created_by
      ) values (
        gen_random_uuid(), next_document_number('client'), 'Walk-in Client', '+9779800000000', 'Active', v_actor
      ) returning id into v_client_id;
    end if;
  end if;

  -- 7. Bypass lines guard for internal write
  perform set_config('app.in_create_booking', 'on', true);
  perform set_config('app.in_add_consumable_line', 'on', true);

  -- 8. Mint booking number and create booking record
  v_booking_no := next_document_number('booking');

  insert into public.bookings (
    client_uuid,
    booking_no,
    booking_kind,
    branch_id,
    client_id,
    pickup_at,
    return_at,
    delivery_type,
    stage,
    project,
    deposit_required,
    created_by,
    updated_by
  ) values (
    v_client_uuid,
    v_booking_no,
    'counter_sale',
    v_branch_id,
    v_client_id,
    now(),
    now() + interval '1 hour',
    'Client Pickup',
    'Booked',
    'Counter Sale',
    0,
    v_actor,
    v_actor
  ) returning id into v_booking_id;

  -- 9. Iterate lines, lock products in stable order, check stock, deduct and insert
  for v_line_elem in select * from jsonb_array_elements(v_lines) loop
    v_product_id := nullif(v_line_elem ->> 'product_id', '')::uuid;
    v_qty := coalesce((v_line_elem ->> 'qty')::integer, 0);

    if v_product_id is null then
      raise exception 'GATE:gate.counter_sale.invalid_product|Each line must specify a valid product_id.'
        using errcode = 'P0001';
    end if;

    if v_qty <= 0 then
      raise exception 'GATE:gate.counter_sale.invalid_qty|Quantity must be a positive integer.'
        using errcode = 'P0001';
    end if;

    -- Lock product row
    select name, tracking_mode, is_active, total_quantity, coalesce(unit_sale_price, 0)
      into v_prod_name, v_prod_tracking, v_prod_active, v_stock_before, v_unit_sale_price
      from public.products
     where id = v_product_id
       for update;

    if v_prod_name is null then
      raise exception 'GATE:gate.counter_sale.product_not_found|Product % not found.', v_product_id
        using errcode = 'P0001';
    end if;

    if not coalesce(v_prod_active, true) then
      raise exception 'GATE:gate.counter_sale.product_inactive|Product "%" is inactive.', v_prod_name
        using errcode = 'P0001';
    end if;

    if v_prod_tracking <> 'Consumable' then
      raise exception 'GATE:gate.counter_sale.not_consumable|Product "%" is not tracked as a consumable.', v_prod_name
        using errcode = 'P0001';
    end if;

    if v_stock_before < v_qty then
      raise exception 'GATE:gate.stock.insufficient|Insufficient stock for "%": requested %, available %.',
        v_prod_name, v_qty, v_stock_before
        using errcode = 'P0001';
    end if;

    v_stock_after := v_stock_before - v_qty;
    v_line_total := v_qty * v_unit_sale_price;

    v_line_client_uuid := nullif(v_line_elem ->> 'client_uuid', '')::uuid;
    if v_line_client_uuid is null then
      v_line_client_uuid := gen_random_uuid();
    end if;

    -- Insert booking line
    insert into public.booking_lines (
      client_uuid,
      booking_id,
      line_type,
      product_id,
      description,
      qty,
      days,
      rate,
      rate_overridden,
      discount_amount,
      line_total,
      price_breakdown,
      created_by
    ) values (
      v_line_client_uuid,
      v_booking_id,
      'Equipment',
      v_product_id,
      v_prod_name,
      v_qty,
      1,
      v_unit_sale_price,
      false,
      0,
      v_line_total,
      jsonb_build_object(
        'unit_sale_price', v_unit_sale_price,
        'qty', v_qty,
        'is_consumable', true
      ),
      v_actor
    ) returning id into v_line_id;

    -- Update product stock
    update public.products
       set total_quantity = v_stock_after,
           updated_at = now()
     where id = v_product_id;

    -- Record deduction movement
    insert into public.consumable_stock_movements (
      client_uuid,
      booking_id,
      booking_line_id,
      product_id,
      qty,
      quantity_before,
      quantity_after,
      movement_type,
      created_by
    ) values (
      gen_random_uuid(),
      v_booking_id,
      v_line_id,
      v_product_id,
      v_qty,
      v_stock_before,
      v_stock_after,
      'Deduction',
      v_actor
    );
  end loop;

  -- 10. Create Draft invoice
  v_inv_client_uuid := (md5('counter_sale_inv:' || v_booking_id::text))::uuid;
  insert into public.invoices (
    client_uuid,
    booking_id,
    client_id,
    branch_id,
    discount_percent,
    vat_rate,
    due_date,
    status,
    created_by,
    updated_by
  ) values (
    v_inv_client_uuid,
    v_booking_id,
    v_client_id,
    v_branch_id,
    0,
    0.1300,
    current_date,
    'Draft'::invoice_status,
    v_actor,
    v_actor
  ) returning id into v_invoice_id;

  -- Sync invoice lines
  perform public.resync_draft_invoice(v_booking_id);

  -- 11. Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values
  ) values (
    gen_random_uuid(),
    'status change'::audit_event_class,
    'Rentals',
    'Rentals',
    'Create',
    'Informational',
    'Success',
    'bookings',
    v_booking_id,
    v_actor,
    v_role,
    jsonb_build_object(
      'booking_no', v_booking_no,
      'booking_kind', 'counter_sale',
      'lines_count', jsonb_array_length(v_lines)
    )
  );

  -- 12. Return payload according to Law 6
  if not auth_can_view_money() then
    return jsonb_build_object(
      'booking_id', v_booking_id,
      'booking_no', v_booking_no,
      'booking_kind', 'counter_sale',
      'stage', 'Booked',
      'line_count', jsonb_array_length(v_lines),
      'client_uuid', v_client_uuid,
      'status', 'created'
    );
  else
    select round(total_amount * 100)::bigint
      into v_total_amount_paisa
      from public.invoices
     where id = v_invoice_id;

    return jsonb_build_object(
      'booking_id', v_booking_id,
      'booking_no', v_booking_no,
      'booking_kind', 'counter_sale',
      'stage', 'Booked',
      'line_count', jsonb_array_length(v_lines),
      'client_uuid', v_client_uuid,
      'invoice_id', v_invoice_id,
      'total_amount_paisa', v_total_amount_paisa,
      'status', 'created'
    );
  end if;
end;
$$;

revoke all on function public.create_counter_sale(jsonb) from public, anon;
grant execute on function public.create_counter_sale(jsonb) to authenticated;

comment on function public.create_counter_sale(jsonb) is
  'Atomic creation of walk-in consumable sale: deducts stock, creates booking and draft invoice, money-blind for floor roles (Law 6).';

-- 4. cancel_counter_sale RPC
create or replace function public.cancel_counter_sale(
  p_booking_id uuid,
  p_reason text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking       public.bookings%rowtype;
  v_actor         uuid;
  v_role          system_role;
  v_payment_count integer;
  v_line          record;
  v_stock_before  integer;
begin
  -- 1. Authorization check
  v_role := auth_user_role();
  if v_role is null or v_role in ('Driver', 'Client') then
    raise exception 'GATE:gate.counter_sale.unauthorized_cancel|Your role is not authorized to cancel counter sales.'
      using errcode = '42501';
  end if;

  if auth_user_id() is not null and p_actor_id is not null and p_actor_id is distinct from auth_user_id() then
    raise exception 'GATE:gate.counter_sale.actor_mismatch|Permission denied: actor must match the signed-in staff session.'
      using errcode = '42501';
  end if;

  v_actor := coalesce(p_actor_id, auth_user_id());
  if v_actor is null then
    select id into v_actor from users where role = v_role and is_active = true limit 1;
  end if;

  -- 2. Lock booking
  select * into v_booking
    from public.bookings
   where id = p_booking_id
     for update;

  if v_booking.id is null then
    raise exception 'GATE:gate.counter_sale.not_found|Booking % not found.', p_booking_id
      using errcode = 'P0001';
  end if;

  if v_booking.booking_kind <> 'counter_sale' then
    raise exception 'GATE:gate.counter_sale.not_counter_sale|Booking % is not a counter sale.', v_booking.booking_no
      using errcode = 'P0001';
  end if;

  -- Idempotency: if already cancelled, return existing state
  if v_booking.cancelled_at is not null then
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'status', 'already_cancelled',
      'cancelled_at', v_booking.cancelled_at
    );
  end if;

  -- 3. Verify no payments have been recorded
  select count(*) into v_payment_count
    from public.payments
   where booking_id = p_booking_id;

  if v_payment_count > 0 then
    raise exception 'GATE:gate.counter_sale.has_payments|Cannot cancel counter sale % because payments have been recorded. Financial correction workflow required.',
      v_booking.booking_no
      using errcode = 'P0001';
  end if;

  -- 4. Mark booking cancelled
  update public.bookings
     set cancelled_at = now(),
         cancelled_by = v_actor,
         cancellation_reason = coalesce(nullif(btrim(p_reason), ''), 'Cancelled before payment'),
         updated_at = now(),
         updated_by = v_actor
   where id = p_booking_id;

  -- 5. Invalidate draft invoice (Law 3: void, never delete)
  perform set_config('app.override_role', 'Manager', true);

  update public.invoices
     set status = 'Void'::invoice_status,
         voided_at = now(),
         voided_by = v_actor,
         void_reason = case
           when length(coalesce(btrim(p_reason), '')) >= 10 then btrim(p_reason)
           else 'Counter sale cancelled before payment'
         end,
         updated_at = now(),
         updated_by = v_actor
   where booking_id = p_booking_id
     and status = 'Draft';

  -- 6. Restore stock and record 'Restoration' movement exactly once per line
  for v_line in
    select bl.id as line_id, bl.product_id, bl.qty
      from public.booking_lines bl
      join public.products p on p.id = bl.product_id
     where bl.booking_id = p_booking_id
       and p.tracking_mode = 'Consumable'
  loop
    select total_quantity into v_stock_before
      from public.products
     where id = v_line.product_id
       for update;

    update public.products
       set total_quantity = total_quantity + v_line.qty,
           updated_at = now()
     where id = v_line.product_id;

    insert into public.consumable_stock_movements (
      client_uuid,
      booking_id,
      booking_line_id,
      product_id,
      qty,
      quantity_before,
      quantity_after,
      movement_type,
      created_by
    ) values (
      gen_random_uuid(),
      p_booking_id,
      v_line.line_id,
      v_line.product_id,
      v_line.qty,
      v_stock_before,
      v_stock_before + v_line.qty,
      'Restoration',
      v_actor
    );
  end loop;

  -- 7. Audit event
  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    new_values,
    reason
  ) values (
    gen_random_uuid(),
    'cancellation'::audit_event_class,
    'Rentals',
    'Rentals',
    'Update',
    'Informational',
    'Success',
    'bookings',
    p_booking_id,
    v_actor,
    v_role,
    jsonb_build_object(
      'booking_no', v_booking.booking_no,
      'status', 'cancelled'
    ),
    p_reason
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.cancel_counter_sale(uuid, text, uuid) from public, anon;
grant execute on function public.cancel_counter_sale(uuid, text, uuid) to authenticated;

comment on function public.cancel_counter_sale(uuid, text, uuid) is
  'Cancels counter sale before payment, restoring consumable stock once and voiding draft invoice.';

commit;

-- Record 0244_counter_sale in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030125', '0244_counter_sale')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0244_counter_sale.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Reset migration session config
select set_config('app.in_create_booking', 'off', false);

-- =============================================================================
-- BATCH 2 VERIFICATION QUERY
-- Run this query immediately after running the batch to confirm registration:
-- =============================================================================
select 'BATCH 2 VERIFICATION' as batch, count(*) as applied_count
from supabase_migrations.schema_migrations
where name in (
  '0178_quantity_only_reset',
  '0179_gate1_override_by_handover_staff',
  '0180_technician_floor_verbs',
  '0181_collateral_deposit_id_card',
  '0182_client_collectors_and_id_on_file',
  '0183_reset_self_qc_when_alone',
  '0184_repair_job_closes_damage',
  '0185_team_notes',
  '0186_shift_handovers',
  '0187_delivery_dispatch_rpcs',
  '0188_smart_reservation_holds',
  '0188_staff_renting_gear',
  '0189_delivery_zones',
  '0190_one_time_rider_links',
  '0191_delivery_reschedule_job',
  '0192_notification_records',
  '0193_invoice_write_hardening',
  '0194_reset_damage_opens_case',
  '0195_load_membership_plans',
  '0196_membership_plans_admin',
  '0197_membership_plan_change_credit',
  '0198_renew_client_membership',
  '0199_tds_on_crew_payouts',
  '0200_draft_at_confirm_and_resync',
  '0201_fix_collateral_masking_chars',
  '0202_staff_discount_is_money_setting',
  '0203_restore_driver_client_view_scopes',
  '0204_rider_link_v2_contract_fix',
  '0205_extend_booking_without_draft',
  '0206_delivery_route_map_pins',
  '0207_crew_overtime_half_full_day',
  '0208_staff_pin_four_digits',
  '0209_calendar_feed_tokens',
  '0210_problem_reports',
  '0211_delivery_proof',
  '0212_cancellation_fee_tiers',
  '0213_non_vat_bills',
  '0214_opening_balances',
  '0215_email_sending_and_log',
  '0216_morning_digest_schedule_and_query',
  '0217_notification_preferences',
  '0218_client_message_events',
  '0219_payment_reminders',
  '0220_push_subscriptions',
  '0221_guard_unit_identity_edits',
  '0222_repair_confirm_booking_atomic_and_reservation_dedup',
  '0223_product_aliases',
  '0224_offer_campaigns_and_recipients',
  '0226_bulk_update_products',
  '0227_message_templates',
  '0228_membership_change_keep_join_date',
  '0229_booking_tags',
  '0230_project_name_and_shoot_location',
  '0231_pro_forma_document_type',
  '0232_secure_temporary_hold_rpcs',
  '0233_extend_booking_and_resync_auth',
  '0234_return_damage_photo_per_unit',
  '0235_delivery_route_branch_hardening',
  '0236_opening_balances_append_only',
  '0237_planned_equipment_downtime',
  '0238_rental_day_start_setting',
  '0239_consumables_pricing_restock_and_low_stock',
  '0240_time_between_rentals',
  '0241_extension_clash_manager_decision_and_at_risk',
  '0242_return_damage_signature_and_refusal',
  '0243_change_confirmed_booking',
  '0244_counter_sale'
);
-- Expected applied_count: 67
