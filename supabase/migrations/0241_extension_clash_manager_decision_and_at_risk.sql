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
create policy extension_clash_decisions_select on public.extension_clash_decisions
  for select to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
  );

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
create policy booking_at_risk_select on public.booking_at_risk
  for select to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

create policy booking_at_risk_insert on public.booking_at_risk
  for insert to authenticated with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

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

create policy client_account_credits_select on public.client_account_credits
  for select to authenticated using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
  );

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
    alter table public.clients add column account_credit numeric(14,2) not null default 0 check (account_credit >= 0);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'account_credit_paisa') then
    alter table public.clients add column account_credit_paisa bigint not null default 0 check (account_credit_paisa >= 0);
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

