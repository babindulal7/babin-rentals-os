-- 0226_membership_change_keep_join_date.sql
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
