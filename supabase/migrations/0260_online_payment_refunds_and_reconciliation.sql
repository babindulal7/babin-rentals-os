-- Migration 0260: Online payment refunds and reconciliation (T7-07, D30, D31, B39, O-2, Law 4, Law 6)
-- 1. Adds refund metadata and status to payment_intents.
-- 2. Creates record_online_payment_refund RPC (records immutable reversal or client account credit, never edits payments).
-- 3. Creates reconciliation reporting RPCs flagging paid intents unallocated or unrefunded after 3 days.

-- 1. Alter payment_intents check constraint and add refund columns
alter table public.payment_intents
  drop constraint if exists payment_intents_status_check;

alter table public.payment_intents
  add constraint payment_intents_status_check check (
    status in ('pending', 'paid', 'allocated', 'failed', 'expired', 'refunded')
  );

alter table public.payment_intents add column if not exists refunded_at timestamptz;
alter table public.payment_intents add column if not exists refund_ref text;
alter table public.payment_intents add column if not exists refund_reason text;
alter table public.payment_intents add column if not exists refund_type text check (refund_type is null or refund_type in ('wallet_refund', 'account_credit'));
alter table public.payment_intents add column if not exists refunded_by uuid references public.users(id);

create index if not exists idx_payment_intents_refunded_at on public.payment_intents(refunded_at) where refunded_at is not null;

-- 2. RPC to record an online payment refund (wallet refund or client account credit)
create or replace function public.record_online_payment_refund(
  p_intent_id uuid,
  p_refund_type text default 'wallet_refund',
  p_refund_ref text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_user_id uuid;
  v_intent record;
  v_payment record;
  v_reversal_id uuid;
  v_reversal_no text;
  v_reason text;
  v_client_id uuid;
  v_amount_numeric numeric(14,2);
begin
  -- Role check: money-viewing management/finance roles only
  v_role := auth_user_role();
  if not auth_can_view_money() or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception 'GATE:MONEY_ROLE_REQUIRED (attempted by %)', coalesce(v_role, 'anon');
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    -- Fallback to system actor if executing within lifecycle/tests
    select id into v_user_id from public.users where role in ('Owner', 'Admin') limit 1;
  end if;

  select * into v_intent
  from public.payment_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'Payment intent not found: %', p_intent_id;
  end if;

  -- Idempotency: if already refunded, return success
  if v_intent.status = 'refunded' then
    return jsonb_build_object(
      'success', true,
      'intent_id', v_intent.id,
      'status', 'refunded',
      'already_refunded', true,
      'amount_paisa', v_intent.amount_paisa
    );
  end if;

  if v_intent.status not in ('paid', 'allocated') then
    raise exception 'Cannot refund payment intent with status % (must be paid or allocated)', v_intent.status;
  end if;

  v_reason := coalesce(nullif(trim(p_reason), ''), 'Online payment refund: ' || coalesce(p_refund_ref, 'Staff processed'));
  if length(v_reason) < 10 then
    v_reason := v_reason || ' (processed by staff)';
  end if;

  v_amount_numeric := round(v_intent.amount_paisa::numeric / 100.0, 2);

  -- Determine client ID
  v_client_id := v_intent.client_id;
  if v_client_id is null and v_intent.booking_id is not null then
    select client_id into v_client_id from public.bookings where id = v_intent.booking_id;
  end if;
  if v_client_id is null and v_intent.booking_request_id is not null then
    select client_id into v_client_id from public.booking_requests where id = v_intent.booking_request_id;
  end if;

  -- Case A: Intent was allocated to a physical payments row -> MUST mint an immutable payment_reversals row (Law 4)
  if v_intent.payment_id is not null then
    select * into v_payment from public.payments where id = v_intent.payment_id;

    if found then
      -- Generate reversal document number
      begin
        v_reversal_no := public.next_document_number('reversal');
      exception when others then
        v_reversal_no := 'REV-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 6);
      end;

      insert into public.payment_reversals (
        client_uuid,
        reversal_no,
        original_payment_id,
        amount,
        reason,
        reversed_by,
        approved_by,
        reversed_at
      ) values (
        gen_random_uuid(),
        v_reversal_no,
        v_payment.id,
        v_amount_numeric,
        v_reason,
        v_user_id,
        v_user_id,
        now()
      )
      returning id into v_reversal_id;
    end if;
  end if;

  -- Case B: Client chose account credit (B39, O-2) -> Record client account credit
  if p_refund_type = 'account_credit' and v_client_id is not null then
    insert into public.client_account_credits (
      client_uuid,
      client_id,
      booking_id,
      amount,
      amount_paisa,
      reason,
      created_by
    ) values (
      gen_random_uuid(),
      v_client_id,
      v_intent.booking_id,
      v_amount_numeric,
      v_intent.amount_paisa,
      v_reason,
      v_user_id
    );

    update public.clients
    set account_credit = account_credit + v_amount_numeric,
        account_credit_paisa = account_credit_paisa + v_intent.amount_paisa,
        updated_at = now()
    where id = v_client_id;
  end if;

  -- Update payment intent status to refunded
  update public.payment_intents
  set status = 'refunded',
      refunded_at = now(),
      refund_ref = coalesce(p_refund_ref, 'MERCHANT-REFUND'),
      refund_reason = v_reason,
      refund_type = coalesce(p_refund_type, 'wallet_refund'),
      refunded_by = v_user_id,
      updated_at = now()
  where id = v_intent.id;

  return jsonb_build_object(
    'success', true,
    'intent_id', v_intent.id,
    'status', 'refunded',
    'refund_type', coalesce(p_refund_type, 'wallet_refund'),
    'amount_paisa', v_intent.amount_paisa,
    'reversal_id', v_reversal_id
  );
end;
$$;

revoke all on function public.record_online_payment_refund(uuid, text, text, text) from public, anon;
grant execute on function public.record_online_payment_refund(uuid, text, text, text) to authenticated;

-- 3. RPC: get_online_payment_reconciliation
-- Summarizes online payments by provider and date, counting unallocated/unrefunded intents > 3 days
create or replace function public.get_online_payment_reconciliation(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  provider text,
  txn_date date,
  total_intents bigint,
  total_paisa bigint,
  paid_intents bigint,
  paid_paisa bigint,
  allocated_intents bigint,
  allocated_paisa bigint,
  refunded_intents bigint,
  refunded_paisa bigint,
  flagged_unreconciled_intents bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Strictly enforce Law 6 money blindness
  if not auth_can_view_money() then
    return;
  end if;

  return query
  select
    pi.provider,
    cast(pi.created_at at time zone 'Asia/Kathmandu' as date) as txn_date,
    count(*)::bigint as total_intents,
    coalesce(sum(pi.amount_paisa), 0)::bigint as total_paisa,
    count(*) filter (where pi.status in ('paid', 'allocated'))::bigint as paid_intents,
    coalesce(sum(pi.amount_paisa) filter (where pi.status in ('paid', 'allocated')), 0)::bigint as paid_paisa,
    count(*) filter (where pi.status = 'allocated')::bigint as allocated_intents,
    coalesce(sum(pi.amount_paisa) filter (where pi.status = 'allocated'), 0)::bigint as allocated_paisa,
    count(*) filter (where pi.status = 'refunded')::bigint as refunded_intents,
    coalesce(sum(pi.amount_paisa) filter (where pi.status = 'refunded'), 0)::bigint as refunded_paisa,
    count(*) filter (
      where pi.status = 'paid'
        and pi.allocated_at is null
        and pi.refunded_at is null
        and pi.created_at < (now() - interval '3 days')
    )::bigint as flagged_unreconciled_intents
  from public.payment_intents pi
  where (p_start_date is null or cast(pi.created_at at time zone 'Asia/Kathmandu' as date) >= p_start_date)
    and (p_end_date is null or cast(pi.created_at at time zone 'Asia/Kathmandu' as date) <= p_end_date)
  group by pi.provider, cast(pi.created_at at time zone 'Asia/Kathmandu' as date)
  order by txn_date desc, pi.provider asc;
end;
$$;

revoke all on function public.get_online_payment_reconciliation(date, date) from public, anon;
grant execute on function public.get_online_payment_reconciliation(date, date) to authenticated;
