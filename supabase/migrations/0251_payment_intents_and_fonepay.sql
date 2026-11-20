-- =============================================================================
-- 0251_payment_intents_and_fonepay.sql
-- T7-05: Online payment intents, Fonepay integration, server-calculated amounts,
-- idempotent allocation to immutable payments, and staff queue confirmation integration.
--
-- Rules:
-- - Server computes amount; client-submitted figures are ignored (D30).
-- - Security deposits strictly excluded; online payment covers rental advance or invoice balance only (O-3).
-- - Law 4: payments rows are immutable.
-- - Law 6: floor roles (Warehouse, Technician, Driver) receive zero rows/figures.
-- - Idempotent allocation: replayed callbacks change nothing.
-- =============================================================================

begin;

-- 1. Table: public.payment_intents
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  client_uuid text not null unique,
  booking_id uuid references public.bookings(id) on delete set null,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  requester_auth_uid uuid,
  provider text not null check (provider in ('fonepay', 'esewa', 'khalti')),
  amount_paisa bigint not null check (amount_paisa > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'allocated', 'failed', 'expired')),
  provider_ref text,
  provider_response jsonb,
  payment_id uuid references public.payments(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  paid_at timestamptz,
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_intents_target check (
    booking_id is not null or booking_request_id is not null
  )
);

create index if not exists idx_payment_intents_booking on public.payment_intents(booking_id);
create index if not exists idx_payment_intents_request on public.payment_intents(booking_request_id);
create index if not exists idx_payment_intents_requester on public.payment_intents(requester_auth_uid);
create index if not exists idx_payment_intents_status on public.payment_intents(status);
create index if not exists idx_payment_intents_provider_ref on public.payment_intents(provider_ref) where provider_ref is not null;

-- 2. RLS on public.payment_intents
alter table public.payment_intents enable row level security;

-- Staff with money view permission can view all intents
create policy payment_intents_staff_select on public.payment_intents
  for select
  to authenticated
  using (
    auth_can_view_money()
  );

-- Clients can view intents belonging to their account or requests
create policy payment_intents_client_select on public.payment_intents
  for select
  to authenticated
  using (
    requester_auth_uid = auth.uid()
    or exists (
      select 1 from public.booking_requests br
      where br.id = payment_intents.booking_request_id
        and br.requester_auth_uid = auth.uid()
    )
  );

-- Revoke direct writes from public, anon, and authenticated
revoke insert, update, delete on public.payment_intents from public, anon, authenticated;
grant select on public.payment_intents to authenticated;

-- 3. SQL mirror of calculateAdvanceRequired()
create or replace function public.calculate_advance_required(p_total_paisa bigint)
returns bigint
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_five_thousand constant bigint := 500000;
  v_ten_thousand constant bigint := 1000000;
begin
  if p_total_paisa is null or p_total_paisa <= 0 then
    return 0;
  end if;
  if p_total_paisa <= v_five_thousand then
    return p_total_paisa;
  end if;
  if p_total_paisa <= v_ten_thousand then
    return v_five_thousand;
  end if;
  return (round((p_total_paisa::numeric * 0.5) / 100.0) * 100)::bigint;
end;
$$;

revoke all on function public.calculate_advance_required(bigint) from public, anon;
grant execute on function public.calculate_advance_required(bigint) to authenticated;

-- 4. RPC: create_payment_intent
-- Computes the amount ON THE SERVER (advance required or invoice balance).
-- Client submitted amount is completely omitted from the signature.
create or replace function public.create_payment_intent(
  p_client_uuid text,
  p_booking_id uuid default null,
  p_booking_request_id uuid default null,
  p_provider text default 'fonepay'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.payment_intents;
  v_amount_paisa bigint := 0;
  v_client_id uuid;
  v_requester_auth_uid uuid;
  v_clean_provider text;
  v_req record;
  v_inv record;
  v_bk record;
  v_prior_payments numeric(14,2) := 0;
  v_est_rupees numeric(14,2) := 0;
  v_intent_id uuid;
begin
  if p_client_uuid is null or trim(p_client_uuid) = '' then
    raise exception 'GATE:gate.payment.missing_client_uuid|A client UUID is required.';
  end if;

  v_clean_provider := lower(trim(coalesce(p_provider, 'fonepay')));
  if v_clean_provider not in ('fonepay', 'esewa', 'khalti') then
    raise exception 'GATE:gate.payment.invalid_provider|Provider % is not supported.', p_provider;
  end if;

  -- Idempotency check: if intent already exists for this client_uuid, return it
  select * into v_existing from public.payment_intents where client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_existing.id,
      'client_uuid', v_existing.client_uuid,
      'amount_paisa', v_existing.amount_paisa,
      'provider', v_existing.provider,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at,
      'is_existing', true
    );
  end if;

  v_requester_auth_uid := auth.uid();

  if p_booking_request_id is not null then
    select id, client_id, requester_auth_uid, total_paisa, vat_paisa, advance_due_paisa, status
      into v_req
      from public.booking_requests
     where id = p_booking_request_id;

    if not found then
      raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
    end if;

    if v_req.status in ('declined', 'cancelled') then
      raise exception 'GATE:gate.payment.request_inactive|Cannot create payment for a % request.', v_req.status;
    end if;

    v_client_id := v_req.client_id;
    v_requester_auth_uid := coalesce(v_requester_auth_uid, v_req.requester_auth_uid);
    if v_req.advance_due_paisa > 0 then
      v_amount_paisa := v_req.advance_due_paisa;
    else
      v_amount_paisa := public.calculate_advance_required(v_req.total_paisa + v_req.vat_paisa);
    end if;

  elsif p_booking_id is not null then
    select id, client_id, branch_id, stage
      into v_bk
      from public.bookings
     where id = p_booking_id;

    if not found then
      raise exception 'GATE:gate.booking.not_found|Booking not found.';
    end if;

    if v_bk.stage = 'Cancelled' then
      raise exception 'GATE:gate.payment.booking_cancelled|Cannot create payment for a cancelled booking.';
    end if;

    v_client_id := v_bk.client_id;

    -- Look up latest non-void invoice for the booking if any
    select id, outstanding_amount, status
      into v_inv
      from public.invoices
     where booking_id = p_booking_id
       and status <> 'Void'
     order by created_at desc
     limit 1;

    if found and v_inv.outstanding_amount > 0 then
      v_amount_paisa := (round(v_inv.outstanding_amount * 100))::bigint;
    else
      -- Compute booking estimate and advance required minus prior payments
      v_est_rupees := public.booking_estimate_total(p_booking_id);
      select coalesce(sum(amount), 0)
        into v_prior_payments
        from public.payments
       where booking_id = p_booking_id
         and status = 'Received'
         and payment_type = 'Advance Payment';

      v_amount_paisa := public.calculate_advance_required((round(v_est_rupees * 100))::bigint) - (round(v_prior_payments * 100))::bigint;
    end if;

  else
    raise exception 'GATE:gate.payment.target_required|Either booking_id or booking_request_id must be provided.';
  end if;

  if v_amount_paisa <= 0 then
    raise exception 'GATE:gate.payment.nothing_due|No payment or advance is due.';
  end if;

  insert into public.payment_intents (
    client_uuid,
    booking_id,
    booking_request_id,
    client_id,
    requester_auth_uid,
    provider,
    amount_paisa,
    status
  ) values (
    p_client_uuid,
    p_booking_id,
    p_booking_request_id,
    v_client_id,
    v_requester_auth_uid,
    v_clean_provider,
    v_amount_paisa,
    'pending'
  )
  returning id into v_intent_id;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent_id,
    'client_uuid', p_client_uuid,
    'amount_paisa', v_amount_paisa,
    'provider', v_clean_provider,
    'status', 'pending',
    'expires_at', (now() + interval '48 hours'),
    'is_existing', false
  );
end;
$$;

-- Create intents through the trusted pay-init service, never a browser RPC.
revoke all on function public.create_payment_intent(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_payment_intent(text, uuid, uuid, text) to service_role;

-- 5. RPC: allocate_payment_intent
-- Transitions payment intent to 'paid' and, if booking_id is present, records an immutable
-- payment ledger entry in public.payments.
create or replace function public.allocate_payment_intent(
  p_intent_id uuid,
  p_provider_ref text,
  p_provider_response jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent public.payment_intents;
  v_booking public.bookings;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_payment_no text;
  v_received_by uuid;
  v_duplicate_ref record;
begin
  if p_intent_id is null then
    raise exception 'GATE:gate.payment.missing_intent_id|Payment intent ID is required.';
  end if;

  select * into v_intent
    from public.payment_intents
   where id = p_intent_id
     for update;

  if not found then
    raise exception 'GATE:gate.payment.intent_not_found|Payment intent not found.';
  end if;

  -- Reversed and failed intents are terminal. A provider callback replay must never
  -- recreate a Received payment after a refund or reactivate a closed intent.
  if v_intent.status in ('refunded', 'expired', 'failed') then
    raise exception 'GATE:gate.payment.intent_terminal|Payment intent status % cannot be allocated.', v_intent.status;
  end if;

  -- Replay guard 1: if already allocated, return idempotent success
  if v_intent.status = 'allocated' and v_intent.payment_id is not null then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'payment_id', v_intent.payment_id,
      'status', 'allocated',
      'already_allocated', true
    );
  end if;

  -- Replay guard 2: if already paid (e.g. unconfirmed request), return idempotent state
  if v_intent.status = 'paid' and v_intent.booking_id is null then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'payment_id', null,
      'status', 'paid',
      'already_paid', true
    );
  end if;

  -- Expiry check
  if now() > v_intent.expires_at then
    update public.payment_intents set status = 'expired', updated_at = now() where id = v_intent.id;
    raise exception 'GATE:gate.payment.intent_expired|Payment intent has expired.';
  end if;

  -- Guard against reused provider_ref across different intents
  if p_provider_ref is not null and trim(p_provider_ref) <> '' then
    select id into v_duplicate_ref
      from public.payment_intents
     where provider = v_intent.provider
       and provider_ref = trim(p_provider_ref)
       and id <> v_intent.id
     limit 1;

    if found then
      raise exception 'GATE:gate.payment.provider_ref_reused|Provider reference has already been used for another intent.';
    end if;
  end if;

  -- Mark intent paid
  update public.payment_intents set
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    provider_ref = trim(p_provider_ref),
    provider_response = p_provider_response,
    updated_at = now()
  where id = v_intent.id;

  -- If linked to a confirmed booking, allocate to immutable payments row immediately
  if v_intent.booking_id is not null then
    select * into v_booking
      from public.bookings
     where id = v_intent.booking_id;

    if found and v_booking.stage <> 'Cancelled' then
      -- Pick latest non-void invoice if any
      select id into v_invoice_id
        from public.invoices
       where booking_id = v_intent.booking_id
         and status <> 'Void'
       order by created_at desc
       limit 1;

      -- Resolve received_by user
      select id into v_received_by
        from public.users
       where primary_role in ('Owner', 'Admin', 'Manager')
       order by created_at asc
       limit 1;

      if v_received_by is null then
        select id into v_received_by from public.users order by created_at asc limit 1;
      end if;

      v_payment_id := gen_random_uuid();
      v_payment_no := public.next_document_number('payment');

      insert into public.payments (
        id,
        client_uuid,
        payment_no,
        booking_id,
        invoice_id,
        client_id,
        branch_id,
        amount,
        payment_type,
        status,
        payment_date,
        transaction_ref,
        notes,
        received_by
      ) values (
        v_payment_id,
        gen_random_uuid(),
        v_payment_no,
        v_intent.booking_id,
        v_invoice_id,
        v_booking.client_id,
        v_booking.branch_id,
        (v_intent.amount_paisa::numeric / 100.0),
        'Advance Payment',
        'Received',
        now(),
        trim(p_provider_ref),
        'Online payment via ' || initcap(v_intent.provider) || ' (ref: ' || coalesce(p_provider_ref, '') || ')',
        v_received_by
      );

      update public.payment_intents set
        status = 'allocated',
        allocated_at = now(),
        payment_id = v_payment_id,
        updated_at = now()
      where id = v_intent.id;

      return jsonb_build_object(
        'success', true,
        'intent_id', v_intent.id,
        'payment_id', v_payment_id,
        'payment_no', v_payment_no,
        'amount_paisa', v_intent.amount_paisa,
        'status', 'allocated'
      );
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'payment_id', null,
    'amount_paisa', v_intent.amount_paisa,
    'status', 'paid'
  );
end;
$$;

-- This SECURITY DEFINER RPC records real money. Only the Edge verifier's
-- service-role connection may allocate; browsers and staff sessions cannot.
revoke all on function public.allocate_payment_intent(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.allocate_payment_intent(uuid, text, jsonb) to service_role;

-- 6. Update confirm_booking_request to allocate any paid payment intents linked to the request
create or replace function public.confirm_booking_request(p_request_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.booking_requests;
  v_intent record;
  v_booking public.bookings;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_payment_no text;
  v_received_by uuid;
  v_allocated_count int := 0;
begin
  if auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'GATE:gate.auth.unauthorized|Only coordinator or higher can confirm online requests.';
  end if;

  select * into v_req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'GATE:gate.booking_request.not_found|Booking request not found.';
  end if;

  -- Idempotency: if already confirmed with the same booking_id, return success
  if v_req.status = 'confirmed' then
    if v_req.booking_id is distinct from p_booking_id then
      raise exception 'GATE:gate.booking_request.already_confirmed|Request belongs to another booking.';
    end if;
    return jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'booking_id', v_req.booking_id,
      'already_confirmed', true
    );
  end if;

  if v_req.status in ('declined', 'cancelled') then
    raise exception 'GATE:gate.booking_request.invalid_status|Cannot confirm a request that has been %.', v_req.status;
  end if;

  -- Match the client and staff checkout lock ordering: request, booking,
  -- then payment intents, to close the confirm-during-checkout race.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'GATE:gate.booking.not_found|Target booking % does not exist.', p_booking_id;
  end if;

  -- Do not attach a live client payment attempt to a booking which already
  -- has another independently collectible staff payment link.
  if exists (
    select 1 from public.payment_intents pi
     where pi.booking_request_id = p_request_id
       and (pi.status = 'paid'
         or (pi.status = 'pending' and pi.expires_at > now()))
  ) and exists (
    select 1 from public.payment_intents pi
     where pi.booking_id = p_booking_id
       and pi.booking_request_id is distinct from p_request_id
       and (pi.status = 'paid'
         or (pi.status = 'pending' and pi.expires_at > now()))
  ) then
    raise exception 'GATE:gate.payment.attempt_in_progress|Resolve another active payment checkout before confirming this request.';
  end if;

  update public.booking_requests set
    status = 'confirmed',
    booking_id = p_booking_id,
    updated_at = now()
  where id = p_request_id;

  -- Serialize all pending/paid intents while this request is locked.
  -- Pending intents must be linked now, BEFORE their callback arrives;
  -- paid intents must receive exactly one immutable payment row.
  -- The callback allocator takes the same lock order: request, then intent.
  select id into v_received_by
    from public.users
   where primary_role in ('Owner', 'Admin', 'Manager')
   order by created_at asc
   limit 1;
  if v_received_by is null then
    select id into v_received_by from public.users order by created_at asc limit 1;
  end if;

  select id into v_invoice_id
    from public.invoices
   where booking_id = p_booking_id
     and status <> 'Void'
   order by created_at desc
   limit 1;

  for v_intent in
    select * from public.payment_intents
     where booking_request_id = p_request_id
       and status in ('pending', 'paid')
       and allocated_at is null
     for update
  loop
    if v_intent.booking_id is not null and v_intent.booking_id <> p_booking_id then
      raise exception 'GATE:gate.payment.booking_mismatch|Intent linked to different booking.';
    end if;

    if v_intent.status = 'pending' then
      update public.payment_intents
         set booking_id = p_booking_id, updated_at = now()
       where id = v_intent.id;
      continue;
    end if;

    -- Only verified paid intents produce Received ledger entries.
    if v_intent.provider_ref is null or btrim(v_intent.provider_ref) = '' then
      raise exception 'GATE:gate.payment.provider_ref_missing|A verified provider reference is required.';
    end if;

    v_payment_id := gen_random_uuid();
    v_payment_no := public.next_document_number('payment');

    insert into public.payments (
      id,
      client_uuid,
      payment_no,
      booking_id,
      invoice_id,
      client_id,
      branch_id,
      amount,
      payment_type,
      status,
      payment_date,
      transaction_ref,
      notes,
      received_by
    ) values (
      v_payment_id,
      gen_random_uuid(),
      v_payment_no,
      p_booking_id,
      v_invoice_id,
      v_booking.client_id,
      v_booking.branch_id,
      (v_intent.amount_paisa::numeric / 100.0),
      'Advance Payment',
      'Received',
      now(),
      v_intent.provider_ref,
      'Online advance via ' || initcap(v_intent.provider) || ' for Request ' || v_req.request_number || ' (ref: ' || coalesce(v_intent.provider_ref, '') || ')',
      v_received_by
    );

    update public.payment_intents set
      booking_id = p_booking_id,
      status = 'allocated',
      allocated_at = now(),
      payment_id = v_payment_id,
      updated_at = now()
    where id = v_intent.id;

    v_allocated_count := v_allocated_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'booking_id', p_booking_id,
    'allocated_payments', v_allocated_count
  );
end;
$$;

-- 7. Verification assertions
do $$
begin
  assert exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'payment_intents'
  ), 'payment_intents table must exist';

  assert exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payment_intents' and c.relrowsecurity = true
  ), 'payment_intents must have RLS enabled';

  assert (select public.calculate_advance_required(0)) = 0, 'calculate_advance_required(0) = 0';
  assert (select public.calculate_advance_required(350000)) = 350000, 'calculate_advance_required(350000) = 350000';
  assert (select public.calculate_advance_required(750000)) = 500000, 'calculate_advance_required(750000) = 500000';
  assert (select public.calculate_advance_required(2000000)) = 1000000, 'calculate_advance_required(2000000) = 1000000';
end;
$$;

commit;
