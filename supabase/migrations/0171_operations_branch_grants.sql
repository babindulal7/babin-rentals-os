-- RULING 2026-10-23 (P0-B, second half): a grant is meaningless without a site.
-- =============================================================================
-- Migration 0171: operations branch grants — per-operation, per-branch scoping
-- for the four floor verbs (pack / handover / return / reset).
--
-- OPEN_DECISIONS 20 Oct 2026 held this as "Still open (the other half of P0-B):
-- location scoping — a grant is meaningless without a site."
--
-- DESIGN (three decisions, all logged in RULINGS-2026-10-23.md):
--
-- 1. NARROWING-ONLY. An empty table changes nothing: a staff member with NO
--    grant rows — active or revoked — keeps today's role-based permission at
--    every branch (rbac.ts's matrix, unchanged). Grant rows can only REMOVE
--    branches, never add roles (B-1: stricter wins). This makes the migration
--    deploy-safe: Babin applies it and the floor keeps working; scoping is
--    opted into per user by issuing grants.
--
-- 2. REVOKE MEANS SCOPED-TO-NOTHING, NOT BACK-TO-GLOBAL. The helper is
--    three-state: pristine (no rows) = legacy global; any history (active or
--    revoked rows for this user+operation) = scoped, and then only an ACTIVE
--    grant for THIS branch passes. Without this, revoking someone's last grant
--    would silently re-widen them to every branch — the opposite of what the
--    admin meant. Re-issue after revoke re-grants (the partial unique index
--    covers active rows only). Law 3: revoke is a state (revoked_at/revoked_by),
--    never a delete.
--
-- 3. THE BOOKING'S branch_id (0002:25, not null) is the site of the work, and
--    the actor is auth_user_id() — the same identity every other auth_* helper
--    resolves. Gates live in TWO places, fail-closed where custody moves:
--      - apply_booking_stage_transition() gates pack/handover/return — the
--        stage cannot move cross-branch even if the application forgot to ask;
--      - assert_operation_branch_grant() is the early, truthful refusal the
--        action layer calls (floorVerb step 1b) — and the ONLY branch gate for
--        Reset, which changes no stage (completeReset.ts) and has no session
--        (0003:855).
--    Reset therefore depends on the action-layer assert; that trust level is
--    the same as today's client-side role checks and is stated here rather
--    than hidden.
--
-- The grants table carries its own immutable actor record (granted_by/at,
-- revoked_by/at); audit_events is not written by the issue/revoke RPCs because
-- its action column is an enum (0155's CloseOverride lesson) and grant changes
-- are already fully attributed here. Revert = drop table + functions + restore
-- the 0155 body of apply_booking_stage_transition (the three gate blocks are
-- the only edit).
-- =============================================================================

begin;

-- ── 1. The table ──────────────────────────────────────────────────────────

create table operations_grants (
  id          uuid        not null default gen_random_uuid() primary key,
  client_uuid uuid        not null unique,               -- Law 8: retry returns the same row
  user_id     uuid        not null references users (id),
  branch_id   uuid        not null references branches (id),
  operation   text        not null,
  granted_by  uuid        not null references users (id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid        references users (id),

  constraint operations_grants_operation_check
    check (operation in ('pack', 'handover', 'return', 'reset'))
);

comment on table operations_grants is
  'P0-B second half (0171): per-operation, per-branch grants. NARROWING-ONLY — a user with no rows '
  'keeps the role-based global permission; any row history scopes them, and then only an ACTIVE grant '
  'for the booking''s branch passes. Revoke is a state, never a delete (Law 3). The booking''s '
  'branch_id is the site; the actor is auth_user_id().';

comment on column operations_grants.operation is
  'The floor verb slug: pack | handover | return | reset — matching operations.pack|handover|return|reset '
  'in actions/core.ts and the JOBS keys in floorVerb.ts.';

create unique index operations_grants_active_unique
  on operations_grants (user_id, branch_id, operation)
  where revoked_at is null;

create index operations_grants_user_operation_idx
  on operations_grants (user_id, operation);

revoke all on operations_grants from public, anon;
grant select on operations_grants to authenticated;
/* Defense in depth: the prelude's default privileges hand authenticated ALL on
   new tables, and RLS's no-write-policy default is the only barrier. Revoke the
   write privileges outright — a future RLS loosening must not silently expose
   direct writes beside the RPCs. */
revoke insert, update, delete on operations_grants from authenticated;

alter table operations_grants enable row level security;

create policy operations_grants_read on operations_grants
  for select to authenticated
  using (
    user_id = auth_user_id()
    or auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

-- ── 2. The authority: may this actor run this operation at this branch? ────

create or replace function auth_may_perform_operation(p_operation text, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_operation in ('pack', 'handover', 'return', 'reset')
    and auth_user_id() is not null
    and (
      -- Pristine: no grant rows at all (active or revoked) = legacy global permission.
      not exists (
        select 1 from operations_grants g
        where g.user_id = auth_user_id()
          and g.operation = p_operation
      )
      -- Scoped: an ACTIVE grant for exactly this branch.
      or exists (
        select 1 from operations_grants g
        where g.user_id = auth_user_id()
          and g.operation = p_operation
          and g.revoked_at is null
          and g.branch_id = p_branch_id
      )
    )
$$;

comment on function auth_may_perform_operation is
  'P0-B location scoping (0171). Three-state, narrowing-only: pristine users (no rows) pass everywhere; '
  'users with any grant history pass ONLY on branches holding an active grant. Revoking the last grant '
  'therefore scopes a user to nothing — it must never re-widen them. Unknown operations and missing '
  'actor identity are denials.';

revoke all on function auth_may_perform_operation(text, uuid) from public;
grant execute on function auth_may_perform_operation(text, uuid) to authenticated, service_role;

-- ── 3. The action-layer assert (Reset's only branch gate) ─────────────────

create or replace function assert_operation_branch_grant(p_operation text, p_booking_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch_id uuid;
begin
  select b.branch_id into v_branch_id
  from bookings b
  where b.id = p_booking_id;

  if v_branch_id is null then
    raise exception 'GATE:operations.grant|That booking does not exist.' using errcode = 'P0001';
  end if;

  if not auth_may_perform_operation(p_operation, v_branch_id) then
    raise exception 'GATE:operations.grant|This staff member''s % grant does not cover the branch of that booking.', p_operation
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function assert_operation_branch_grant is
  'Action-layer branch-grant refusal (0171). floorVerb calls it for all four verbs before any write — '
  'for pack/handover/return it is early feedback ahead of the fail-closed trigger gate; for Reset, which '
  'changes no stage and has no session, it is the only branch gate.';

revoke all on function assert_operation_branch_grant(text, uuid) from public;
grant execute on function assert_operation_branch_grant(text, uuid) to authenticated, service_role;

-- ── 4. Issue / revoke (Owner · Admin only — B-1 stricter; Babin may widen) ──

create or replace function issue_operations_grant(
  p_client_uuid uuid,
  p_user_id uuid,
  p_branch_id uuid,
  p_operation text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_target_role text;
begin
  if auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'GATE:operations.grant.issue_role|Only Owner or Admin can issue an operations grant.' using errcode = 'P0001';
  end if;

  -- RULING 2026-10-24: integrate the guarded pair. Admin cannot restrict
  -- Owner/Admin, including self. Hold the target role stable until commit.
  if auth_user_role() = 'Admin' then
    select u.primary_role::text into v_target_role
    from users u where u.id = p_user_id
    for share of u;
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'Admin cannot modify Owner or Admin operation grants' using errcode = '42501';
    end if;
  end if;

  if p_operation not in ('pack', 'handover', 'return', 'reset') then
    raise exception 'GATE:operations.grant.bad_operation|Unknown operation %.', p_operation using errcode = 'P0001';
  end if;

  -- Law 8: the same receipt key returns the same row, on retry.
  select id into v_id from operations_grants where client_uuid = p_client_uuid;
  if v_id is not null then return v_id; end if;

  -- Re-issuing an identical active grant is the same grant.
  select id into v_id from operations_grants
  where user_id = p_user_id
    and branch_id = p_branch_id
    and operation = p_operation
    and revoked_at is null;
  if v_id is not null then return v_id; end if;

  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by)
  values (p_client_uuid, p_user_id, p_branch_id, p_operation, auth_user_id())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function issue_operations_grant is
  'Issue one per-operation, per-branch grant (0171). Owner/Admin only. Idempotent by client_uuid and by '
  'identical active cell. The first grant ever issued to a user for an operation SCOPES them — every '
  'branch without an active grant is refused from that moment.';

revoke all on function issue_operations_grant(uuid, uuid, uuid, text) from public;
grant execute on function issue_operations_grant(uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function revoke_operations_grant(
  p_client_uuid uuid,
  p_grant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_role text;
begin
  if auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'GATE:operations.grant.revoke_role|Only Owner or Admin can revoke an operations grant.' using errcode = 'P0001';
  end if;

  -- Same superior/self-target boundary on revocation, before any write.
  if auth_user_role() = 'Admin' then
    select u.primary_role::text into v_target_role
    from operations_grants g join users u on u.id = g.user_id
    where g.id = p_grant_id
    for share of u;
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'Admin cannot modify Owner or Admin operation grants' using errcode = '42501';
    end if;
  end if;

  update operations_grants
  set revoked_at = now(),
      revoked_by = auth_user_id()
  where id = p_grant_id
    and revoked_at is null;

  if not found then
    -- Idempotent for an already-revoked grant; a receipt against an unknown id is refused.
    if not exists (select 1 from operations_grants where id = p_grant_id) then
      raise exception 'GATE:operations.grant.not_found|No operations grant with that id exists.' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function revoke_operations_grant is
  'Revoke one grant (0171). Idempotent for already-revoked rows. Revoking a user''s last ACTIVE grant for '
  'an operation scopes them to NOTHING for that operation — the three-state helper guarantees it never '
  're-widens them to the global default.';

revoke all on function revoke_operations_grant(uuid, uuid) from public;
grant execute on function revoke_operations_grant(uuid, uuid) to authenticated, service_role;

-- ── 5. The fail-closed gate where custody moves ────────────────────────────
-- apply_booking_stage_transition, re-created from 0155 with exactly four
-- edits: the declare adds v_branch_id; the opening select reads branch_id;
-- the three operational blocks each open with the branch-grant check; the
-- comment is extended. Nothing else in the body is touched.

create or replace function apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_stage       booking_stage;
  v_closed_at           timestamptz;
  v_prev_occurred_at    timestamptz;
  v_deposit_required    numeric(14,2) := 0;
  v_deposit_pending     numeric(14,2) := 0;
  v_rental_outstanding  numeric(14,2) := 0;
  v_reason              text;
  v_pack_session_id     uuid;
  v_handover_session_id uuid;
  v_return_session_id   uuid;
  v_has_physical_lines  boolean := false;
  v_branch_id           uuid;
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
          raise exception 'Stage transition rejected: % does not immediately follow % -- skipping a stage is only legal as an approved reversal.',
            NEW.to_stage, NEW.from_stage;
        end if;
      end if;
    end if;
  end if;

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
    -- P0-B location scoping (0171): custody cannot move to a branch the actor
    -- is not granted for, whatever the application asked for.
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
      select id into v_handover_session_id
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Handover'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_handover_session_id is null then
        raise exception 'GATE:gate.handover.session_missing|Booking requires an active or completed handover session.' using errcode = 'P0001';
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

comment on function apply_booking_stage_transition is
  'Stage 1 (0116, extended 0131, 0135, 0139, 0141, 0149, 0155): close gate — invoice exists (or Owner/Admin zero-value '
  'override), invoices settled, deposit resolved OR skipped by Manager+ with a reason >= 10 chars (audited, no money moved), '
  'no open cases, no live reservations, no damage finding pending approval. '
  '0171 adds P0-B branch grants: Booked->Packed, Packed->On Rent and On Rent->Returned each refuse unless '
  'auth_may_perform_operation passes for the booking''s branch — narrowing-only, so an empty operations_grants '
  'table leaves the role matrix exactly as it was.';

commit;
