-- Migration 0254: eSewa and Khalti payment providers and activation switches (T7-06)
--
-- Authority:
--   - T7-06 · eSewa and Khalti
--   - Ruling D30: Server-to-server confirmation only. Browser redirect alone never counts.
--   - Card contract: "The same pattern as T7-05 for eSewa and for Khalti, each behind a switch that stays off until its merchant account and credentials exist. The pay screen shows only switched-on methods."
--   - Law 1: Server computes authoritative amount.
--   - Law 4: Immutability on created payment rows.
--   - Law 6: Money blindness on internal reporting.

begin;

-- 1. Ensure provider settings exist in settings table with scalar values (per 0158 settings_value_scalar check)
insert into public.settings (key, value, scope, is_money, updated_at)
values
  ('paymentProviderFonepayEnabled', to_jsonb(true), 'org', false, now()),
  ('paymentProviderFonepayEnv', to_jsonb('sandbox'::text), 'org', false, now()),
  ('paymentProviderEsewaEnabled', to_jsonb(false), 'org', false, now()),
  ('paymentProviderEsewaEnv', to_jsonb('sandbox'::text), 'org', false, now()),
  ('paymentProviderKhaltiEnabled', to_jsonb(false), 'org', false, now()),
  ('paymentProviderKhaltiEnv', to_jsonb('sandbox'::text), 'org', false, now())
on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update
set value = excluded.value, updated_at = now();

-- 2. Function to list active payment providers for public booking flow
create or replace function public.get_online_payment_providers()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fonepay_enabled boolean;
  v_fonepay_env text;
  v_esewa_enabled boolean;
  v_esewa_env text;
  v_khalti_enabled boolean;
  v_khalti_env text;
  v_val jsonb;
  v_res jsonb := '[]'::jsonb;
begin
  -- Fonepay
  select value into v_val from public.settings where scope = 'org' and key = 'paymentProviderFonepayEnabled';
  v_fonepay_enabled := coalesce((v_val)::boolean, true);
  select value #>> '{}' into v_fonepay_env from public.settings where scope = 'org' and key = 'paymentProviderFonepayEnv';
  v_fonepay_env := coalesce(v_fonepay_env, 'sandbox');

  v_res := v_res || jsonb_build_array(jsonb_build_object(
    'provider', 'fonepay',
    'name', 'Fonepay',
    'enabled', v_fonepay_enabled,
    'env', v_fonepay_env
  ));

  -- eSewa
  select value into v_val from public.settings where scope = 'org' and key = 'paymentProviderEsewaEnabled';
  v_esewa_enabled := coalesce((v_val)::boolean, false);
  select value #>> '{}' into v_esewa_env from public.settings where scope = 'org' and key = 'paymentProviderEsewaEnv';
  v_esewa_env := coalesce(v_esewa_env, 'sandbox');

  v_res := v_res || jsonb_build_array(jsonb_build_object(
    'provider', 'esewa',
    'name', 'eSewa',
    'enabled', v_esewa_enabled,
    'env', v_esewa_env
  ));

  -- Khalti
  select value into v_val from public.settings where scope = 'org' and key = 'paymentProviderKhaltiEnabled';
  v_khalti_enabled := coalesce((v_val)::boolean, false);
  select value #>> '{}' into v_khalti_env from public.settings where scope = 'org' and key = 'paymentProviderKhaltiEnv';
  v_khalti_env := coalesce(v_khalti_env, 'sandbox');

  v_res := v_res || jsonb_build_array(jsonb_build_object(
    'provider', 'khalti',
    'name', 'Khalti',
    'enabled', v_khalti_enabled,
    'env', v_khalti_env
  ));

  return v_res;
end;
$$;

revoke all on function public.get_online_payment_providers() from public, anon;
grant execute on function public.get_online_payment_providers() to authenticated;

-- 3. Function for staff management to toggle provider status
create or replace function public.set_online_payment_provider_status(
  p_provider text,
  p_enabled boolean,
  p_env text default 'sandbox'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_actor_id uuid;
  v_key_enabled text;
  v_key_env text;
  v_env text;
begin
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'gate.settings.role: Only Owner, Admin, or Manager can configure payment providers';
  end if;

  v_actor_id := auth.uid();

  if p_provider = 'fonepay' then
    v_key_enabled := 'paymentProviderFonepayEnabled';
    v_key_env := 'paymentProviderFonepayEnv';
  elsif p_provider = 'esewa' then
    v_key_enabled := 'paymentProviderEsewaEnabled';
    v_key_env := 'paymentProviderEsewaEnv';
  elsif p_provider = 'khalti' then
    v_key_enabled := 'paymentProviderKhaltiEnabled';
    v_key_env := 'paymentProviderKhaltiEnv';
  else
    raise exception 'INVALID_PROVIDER: Unknown payment provider %', p_provider;
  end if;

  v_env := coalesce(p_env, 'sandbox');
  if v_env not in ('sandbox', 'production') then
    raise exception 'INVALID_ENVIRONMENT: Environment must be sandbox or production.';
  end if;

  -- Upsert enabled
  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values (v_key_enabled, to_jsonb(p_enabled), 'org', false, v_actor_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    value = excluded.value,
    updated_by = v_actor_id,
    updated_at = now();

  -- Upsert env
  insert into public.settings (key, value, scope, is_money, updated_by, updated_at)
  values (v_key_env, to_jsonb(v_env), 'org', false, v_actor_id, now())
  on conflict (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    value = excluded.value,
    updated_by = v_actor_id,
    updated_at = now();

  return jsonb_build_object(
    'success', true,
    'provider', p_provider,
    'enabled', p_enabled,
    'env', v_env
  );
end;
$$;

revoke all on function public.set_online_payment_provider_status(text, boolean, text) from public, anon;
grant execute on function public.set_online_payment_provider_status(text, boolean, text) to authenticated;

-- 4. Re-declare create_payment_intent to validate provider enabled switch
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
  v_provider_val jsonb;
  v_is_enabled boolean;
  v_setting_key text;
begin
  if p_client_uuid is null or trim(p_client_uuid) = '' then
    raise exception 'GATE:gate.payment.missing_client_uuid|A client UUID is required.';
  end if;

  v_clean_provider := lower(trim(coalesce(p_provider, 'fonepay')));
  if v_clean_provider not in ('fonepay', 'esewa', 'khalti') then
    raise exception 'GATE:gate.payment.invalid_provider|Provider % is not supported.', p_provider;
  end if;

  -- Validate provider enabled switch (T7-06)
  if v_clean_provider = 'fonepay' then
    v_setting_key := 'paymentProviderFonepayEnabled';
  elsif v_clean_provider = 'esewa' then
    v_setting_key := 'paymentProviderEsewaEnabled';
  elsif v_clean_provider = 'khalti' then
    v_setting_key := 'paymentProviderKhaltiEnabled';
  end if;

  select value into v_provider_val from public.settings where scope = 'org' and key = v_setting_key;
  v_is_enabled := coalesce((v_provider_val)::boolean, v_clean_provider = 'fonepay');

  if not v_is_enabled then
    raise exception 'PAYMENT_PROVIDER_DISABLED: Provider % is currently disabled.', v_clean_provider;
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

-- No direct browser intent creation: the pay-init Edge Function holds the service key.
revoke all on function public.create_payment_intent(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_payment_intent(text, uuid, uuid, text) to service_role;

commit;
