-- =============================================================================
-- 0255_payment_link_from_any_booking.sql
-- T7-15: Payment link from any booking (Fonepay, eSewa, Khalti)
--
-- Rules:
-- - Server computes amount; client-submitted figures are strictly ignored (D30).
-- - Security deposits strictly excluded; online payment covers rental advance or invoice balance only (O-3, B38).
-- - Links expire after 48 hours; a new link replaces the old; a paid link cannot be paid twice.
-- - Law 4: payments rows are immutable.
-- - Law 6: floor roles (Warehouse, Technician, Driver) denied from creating links.
-- - Functions revoked from public/anon to honor function-leak gate.
-- =============================================================================

begin;

-- 1. Extend public.payment_intents with payment link columns
alter table public.payment_intents
  add column if not exists token_hash text unique,
  add column if not exists is_payment_link boolean not null default false,
  add column if not exists created_by uuid references public.users(id) on delete set null;

create index if not exists idx_payment_intents_token_hash
  on public.payment_intents(token_hash)
  where token_hash is not null;

create index if not exists idx_payment_intents_link_booking
  on public.payment_intents(booking_id, is_payment_link)
  where is_payment_link = true;

-- 2. Stored Procedure: create_booking_payment_link
create or replace function public.create_booking_payment_link(
  p_client_uuid text,
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bk record;
  v_inv record;
  v_amount_paisa bigint := 0;
  v_est_rupees numeric(14,2) := 0;
  v_prior_payments numeric(14,2) := 0;
  v_raw_token text;
  v_token_hash text;
  v_intent_id uuid;
  v_expires_at timestamptz;
begin
  -- Permission check: caller must have authority to view/manage money (Law 6)
  if not public.auth_can_view_money() then
    raise exception 'GATE:gate.rbac.money_denied|Forbidden: You do not have permission to generate payment links.';
  end if;

  if p_client_uuid is null or trim(p_client_uuid) = '' then
    raise exception 'GATE:gate.payment.missing_client_uuid|A client UUID is required.';
  end if;

  if p_booking_id is null then
    raise exception 'GATE:gate.payment.missing_booking_id|A booking ID is required.';
  end if;

  -- Validate booking existence and stage
  select id, client_id, branch_id, stage, booking_no
    into v_bk
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'GATE:gate.booking.not_found|Booking not found.';
  end if;

  if v_bk.stage::text in ('Cancelled', 'Closed') then
    raise exception 'GATE:gate.payment.booking_inactive|Cannot create payment link for an inactive or closed booking.';
  end if;

  -- Calculate authoritative amount due (server-computed, Law 1)
  -- 1) Latest non-void invoice with outstanding balance
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
    -- 2) Pre-invoice booking estimate and advance required minus prior advance payments
    v_est_rupees := public.booking_estimate_total(p_booking_id);
    select coalesce(sum(amount), 0)
      into v_prior_payments
      from public.payments
     where booking_id = p_booking_id
       and status = 'Received'
       and payment_type = 'Advance Payment';

    v_amount_paisa := public.calculate_advance_required((round(v_est_rupees * 100))::bigint) - (round(v_prior_payments * 100))::bigint;
  end if;

  if v_amount_paisa <= 0 then
    raise exception 'GATE:gate.payment.nothing_due|No payment or advance is due on this booking.';
  end if;

  -- "A new link replaces the old" — expire any prior active pending links for this booking
  update public.payment_intents
     set status = 'expired',
         updated_at = now()
   where booking_id = p_booking_id
     and is_payment_link = true
     and status = 'pending';

  -- High-entropy 64-character token
  v_raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');
  v_expires_at := now() + interval '48 hours';

  insert into public.payment_intents (
    client_uuid,
    booking_id,
    client_id,
    requester_auth_uid,
    provider,
    amount_paisa,
    status,
    token_hash,
    is_payment_link,
    created_by,
    expires_at
  ) values (
    p_client_uuid,
    p_booking_id,
    v_bk.client_id,
    auth.uid(),
    'fonepay',
    v_amount_paisa,
    'pending',
    v_token_hash,
    true,
    auth.uid(),
    v_expires_at
  )
  returning id into v_intent_id;

  -- Audit creation
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
    branch_id,
    new_values
  ) values (
    gen_random_uuid(),
    'money movement',
    'Finance',
    'Finance',
    'Create',
    'Informational',
    'Success',
    'payment_intents',
    v_intent_id,
    auth.uid(),
    public.auth_user_role(),
    v_bk.branch_id,
    jsonb_build_object(
      'booking_id', p_booking_id,
      'amount_paisa', v_amount_paisa,
      'expires_at', v_expires_at
    )
  );

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent_id,
    'token', v_raw_token,
    'amount_paisa', v_amount_paisa,
    'expires_at', v_expires_at,
    'booking_id', p_booking_id,
    'booking_no', coalesce(v_bk.booking_no, '')
  );
end;
$$;

-- 3. Stored Procedure: get_payment_link_details
create or replace function public.get_payment_link_details(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token_hash text;
  v_intent public.payment_intents;
  v_bk record;
  v_client_name text := '';
  v_masked_name text := '';
  v_items_count integer := 0;
begin
  if p_token is null or trim(p_token) = '' then
    return jsonb_build_object('valid', false, 'reason', 'missing_token');
  end if;

  v_token_hash := encode(sha256(convert_to(trim(p_token), 'UTF8')), 'hex');

  select * into v_intent
    from public.payment_intents
   where token_hash = v_token_hash
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_intent.status = 'expired' or now() > v_intent.expires_at then
    return jsonb_build_object(
      'valid', false,
      'reason', 'expired',
      'expires_at', v_intent.expires_at,
      'intent_id', v_intent.id
    );
  end if;

  if v_intent.status in ('paid', 'allocated') then
    return jsonb_build_object(
      'valid', false,
      'reason', 'already_paid',
      'paid_at', v_intent.paid_at,
      'amount_paisa', v_intent.amount_paisa,
      'intent_id', v_intent.id
    );
  end if;

  if v_intent.status <> 'pending' then
    return jsonb_build_object(
      'valid', false,
      'reason', 'inactive',
      'status', v_intent.status,
      'intent_id', v_intent.id
    );
  end if;

  -- Load booking info if present
  if v_intent.booking_id is not null then
    select b.id, b.booking_no, coalesce(b.project_name, b.project, '') as project_name, b.pickup_at, b.return_at, c.name as client_name
      into v_bk
      from public.bookings b
      left join public.clients c on c.id = b.client_id
     where b.id = v_intent.booking_id;

    if found then
      v_client_name := coalesce(v_bk.client_name, '');
      if length(v_client_name) > 3 then
        v_masked_name := substring(v_client_name from 1 for 1) || '*** ' || substring(v_client_name from length(v_client_name) for 1);
      else
        v_masked_name := 'Client';
      end if;

      select coalesce(count(*), 0)::integer
        into v_items_count
        from public.booking_lines
       where booking_id = v_intent.booking_id;
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'intent_id', v_intent.id,
    'amount_paisa', v_intent.amount_paisa,
    'booking_id', v_intent.booking_id,
    'booking_no', coalesce(v_bk.booking_no, ''),
    'project_name', coalesce(v_bk.project_name, ''),
    'pickup_at', v_bk.pickup_at,
    'return_at', v_bk.return_at,
    'client_name_masked', v_masked_name,
    'items_count', v_items_count,
    'expires_at', v_intent.expires_at,
    'provider', v_intent.provider
  );
end;
$$;

-- 4. Re-declare allocate_payment_intent to validate active status and safe stage enum comparison
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

  -- Inactive check: refuse expired or failed intents
  if v_intent.status not in ('pending', 'paid') then
    raise exception 'GATE:gate.payment.intent_inactive|Payment intent is %.', v_intent.status;
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

    if found and v_booking.stage::text not in ('Cancelled', 'Closed') then
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

-- 5. Permissions: Function-leak gate protection
revoke all on function public.create_booking_payment_link(text, uuid) from public, anon;
grant execute on function public.create_booking_payment_link(text, uuid) to authenticated;

revoke all on function public.get_payment_link_details(text) from public, anon;
grant execute on function public.get_payment_link_details(text) to authenticated;

revoke all on function public.allocate_payment_intent(uuid, text, jsonb) from public, anon;
grant execute on function public.allocate_payment_intent(uuid, text, jsonb) to authenticated;

commit;
