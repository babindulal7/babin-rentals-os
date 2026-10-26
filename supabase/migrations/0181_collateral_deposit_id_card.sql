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
