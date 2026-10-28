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

  select * into v_old from public.client_memberships
   where client_id = v_client_id and superseded_at is null
   for update;

  if found then
    select * into v_old_plan from public.membership_plans where id = v_old.plan_id;
    v_old_level := v_old_plan.level::text;

    if v_old.plan_id = v_plan.id then
      raise exception 'GATE:membership.same_plan: This client is already on the % plan.', v_plan.level using errcode = '23514';
    end if;

    -- D22: credit = old fee * days left / days in old term (integer paisa, half-up)
    v_old_fee_paisa := round(coalesce(v_old.fee_paid, v_old_plan.annual_fee, 0) * 100);
    v_term_start := v_old.join_date;
    v_term_months := coalesce(v_old_plan.term_months, 12);
    v_term_end := (v_term_start + make_interval(months => v_term_months))::date;
    v_total_days := v_term_end - v_term_start;
    v_days_left := greatest(0, v_term_end - v_effective_date);

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

  -- New plan economics
  v_new_fee_paisa := round(coalesce(v_plan.annual_fee, 0) * 100);
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
