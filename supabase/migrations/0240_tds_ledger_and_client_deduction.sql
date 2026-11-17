-- ============================================================================
-- 0240_tds_ledger_and_client_deduction.sql — WRITTEN locally. NOT APPLIED to live (N-5).
--
-- RULING 2026-11-17: R-17.1, R-17.3, R-17.5 (RULINGS-2026-11-17.md). Build card:
-- docs/plans/TDS_BUILD_CARD.md, slices S1 and S2.
--
-- WHAT
-- ----
--   S1  tds_ledger — an append-only ledger of TDS. A correction is a Reversal row
--       (Law 4), nothing is deleted (Law 3). It holds both directions so the
--       supplier slice (S3) needs no new table, but this migration only WRITES
--       the client-deducted direction.
--   S2  record_client_tds / reverse_client_tds — a client deducts TDS from what
--       they pay us. The invoice SETTLES AT GROSS (R-17.1e): the TDS credit counts
--       toward invoices.paid_amount, so cash received (net) + TDS credit = gross.
--
-- THE RULES, FIXED IN SQL (not typed per invoice)
-- -----------------------------------------------
--   Rate    1.5%  (R-17.1b)
--   Base    invoices.taxable_amount — before VAT (R-17.1c)
--   Scope   booking invoices. Every invoice in this schema belongs to a booking,
--           so every invoice is a rental invoice (R-17.1d).
--   One active deduction per invoice. A reversed one can be recorded again.
--   The TDS can never exceed what is still outstanding (the client cannot have
--   paid cash for the same money).
--
-- WHERE THE CREDIT IS COUNTED (and why)
-- -------------------------------------
-- invoices.paid_amount is the ONE column both money paths read: the payment path
-- (recompute_invoice_payment_state) writes it, and the line/header triggers read it
-- so they never touch the money tables (0098). So the TDS credit goes INSIDE
-- paid_amount, via tds_client_credit(). Editing an invoice line later cannot undo
-- the credit. Cash takings are not affected: they come from the payments table.
--
-- NEPALI MONTH
-- ------------
-- Babin asked for a Nepali-month column (R-17.5c). BS is rendered, never stored
-- (CLAUDE.md). The ledger stores deducted_on (AD date, Kathmandu day); the Nepali
-- month is rendered from it with src/lib/bs.ts. The 25-day IRD deadline uses it.
--
-- WHO
-- ---
--   read      Owner, Admin, Manager, Accounts (money roles).
--   record    Owner, Coordinator, Accounts — as rbac canRecordPayment (stricter than the payments_insert RLS, B-1).
--   reverse   Owner, Admin, Manager — as payment_reversals_insert.
--   Warehouse, Technician, Driver, Client: nothing (Law 6, N-1).
--
-- REVERT: drop the two functions and the table; restore recompute_invoice_payment_state
-- and invoice_paid_net from 0087 / 0098 (remove the TDS term). Additive, so no payment
-- or invoice row is changed by installing or removing this.
-- ============================================================================

begin;

-- ── S1: the ledger ──────────────────────────────────────────────────────────

create table public.tds_ledger (
  id                 uuid          not null default gen_random_uuid() primary key,
  client_uuid        uuid          not null,
  entry_type         text          not null default 'Deduction'
                       check (entry_type in ('Deduction', 'Reversal')),
  direction          text          not null
                       check (direction in ('Client Deducted', 'Supplier Deducted')),
  amount             numeric(14,2) not null check (amount > 0),
  rate_percent       numeric(5,2)  not null check (rate_percent > 0),
  base_amount        numeric(14,2) not null check (base_amount >= 0),
  invoice_id         uuid          references public.invoices (id),
  payment_id         uuid          references public.payments (id),
  party_name         text,
  certificate_number text,
  deducted_on        date          not null,
  reverses_id        uuid          references public.tds_ledger (id),
  reason             text,
  created_by         uuid          references public.users (id),
  created_at         timestamptz   not null default now(),

  constraint tds_ledger_client_uuid_key unique (client_uuid),
  constraint tds_ledger_reverses_once unique (reverses_id),
  constraint tds_ledger_reversal_shape check (
    (entry_type = 'Deduction' and reverses_id is null)
    or (entry_type = 'Reversal' and reverses_id is not null and char_length(btrim(coalesce(reason, ''))) >= 10)
  ),
  constraint tds_ledger_client_needs_invoice check (
    direction <> 'Client Deducted' or invoice_id is not null
  ),
  constraint tds_ledger_supplier_needs_party check (
    direction <> 'Supplier Deducted' or char_length(btrim(coalesce(party_name, ''))) > 0
  )
);

create index idx_tds_ledger_invoice on public.tds_ledger (invoice_id) where invoice_id is not null;
create index idx_tds_ledger_deducted_on on public.tds_ledger (deducted_on desc);

comment on table public.tds_ledger is
  'R-17.3: append-only TDS ledger. A correction is a Reversal row; nothing is updated or deleted. '
  'Client Deducted rows settle an invoice at gross (counted in invoices.paid_amount). '
  'deducted_on is AD; the Nepali month is rendered from it, never stored.';

create trigger tds_ledger_no_update
  before update on public.tds_ledger
  for each row execute function public.reject_update_append_only(
    'insert a Reversal row (reverse_client_tds) and record the corrected deduction'
  );

create trigger tds_ledger_no_delete
  before delete on public.tds_ledger
  for each row execute function public.reject_delete_nothing_is_deleted(
    'Reverse — insert a Reversal row referencing this deduction'
  );

alter table public.tds_ledger enable row level security;

create policy tds_ledger_read on public.tds_ledger
  for select to authenticated
  using (public.auth_can_view_money() and public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts'));

-- Writes go through the two definer RPCs below, never a direct statement.
revoke all on public.tds_ledger from public, anon, authenticated;
grant select on public.tds_ledger to authenticated;

-- ── The credit an invoice holds from client TDS ─────────────────────────────

create or replace function public.tds_client_credit(p_invoice_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  /* Definer so a Coordinator (who may write payments but cannot read this table)
     still gets the right figure when their payment triggers the recompute.
     Fail closed for a money-blind role: the amount is money (Law 6, N-1). A role
     with no session (the database owner) is allowed, as it is everywhere else. */
  if not coalesce(public.auth_can_view_money(), true) then
    raise exception 'TDS credit is not available to this role.' using errcode = '42501';
  end if;

  return coalesce((
    select sum(case when l.entry_type = 'Deduction' then l.amount else -l.amount end)
      from public.tds_ledger l
     where l.invoice_id = p_invoice_id
       and l.direction = 'Client Deducted'
  ), 0);
end;
$fn$;

revoke all on function public.tds_client_credit(uuid) from public, anon;
grant execute on function public.tds_client_credit(uuid) to authenticated;

-- ── The payment path counts the credit (settle at gross) ────────────────────
-- recompute_invoice_payment_state is 0087's body with ONE added term. Everything
-- else — Draft is sticky, voided is untouched, refunds and deposits are not
-- revenue, reversals are netted — is unchanged.

create or replace function public.recompute_invoice_payment_state(p_invoice_id uuid)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total_amount numeric(14,2);
  v_total_paid   numeric(14,2);
  v_reversed     numeric(14,2);
  v_tds_credit   numeric(14,2);
  v_outstanding  numeric(14,2);
  v_voided       timestamptz;
  v_status       invoice_status;
begin
  if p_invoice_id is null then
    return;
  end if;

  select total_amount, voided_at, status
    into v_total_amount, v_voided, v_status
    from invoices
   where id = p_invoice_id;

  if not found then
    return;
  end if;

  if v_voided is not null then
    return;
  end if;

  select coalesce(sum(p.amount), 0)
    into v_total_paid
    from payments p
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  select coalesce(sum(r.amount), 0)
    into v_reversed
    from payment_reversals r
    join payments p on p.id = r.original_payment_id
   where p.invoice_id = p_invoice_id
     and p.status = 'Received'
     and p.payment_type = 'Advance Payment';

  v_total_paid := greatest(0, v_total_paid - v_reversed);

  /* RULING 2026-11-17 (R-17.1e): TDS the client deducted counts as settled, so the
     invoice settles at gross. Cash received + this credit = what was paid. */
  v_tds_credit := public.tds_client_credit(p_invoice_id);
  v_total_paid := v_total_paid + v_tds_credit;

  v_outstanding := greatest(0, v_total_amount - v_total_paid);

  update invoices
     set paid_amount        = v_total_paid,
         outstanding_amount = v_outstanding,
         status = case
           when v_status = 'Draft'::invoice_status then v_status
           when v_outstanding = 0 and v_total_amount > 0 then 'Paid'::invoice_status
           when v_total_paid > 0 then 'Partially Paid'::invoice_status
           when v_status in ('Paid'::invoice_status, 'Partially Paid'::invoice_status)
             then 'Sent'::invoice_status
           else v_status
         end,
         updated_at = now()
   where id = p_invoice_id;
end;
$function$;

comment on function public.recompute_invoice_payment_state(uuid) is
  'P0-6 + R-17.1e. The one expression that derives invoices.paid_amount / outstanding_amount / status. '
  'Counts only payment_type = ''Advance Payment'', nets payment_reversals, adds the client TDS credit '
  '(settle at gross), and never touches a voided invoice.';

create or replace function public.invoice_paid_net(p_invoice_id uuid)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $fn$
  select greatest(
    coalesce((
      select sum(p.amount) from payments p
       where p.invoice_id = p_invoice_id
         and p.status = 'Received'
         and p.payment_type = 'Advance Payment'
    ), 0)
    -
    coalesce((
      select sum(r.amount)
        from payment_reversals r
        join payments p on p.id = r.original_payment_id
       where p.invoice_id = p_invoice_id
         and p.status = 'Received'
         and p.payment_type = 'Advance Payment'
    ), 0),
    0) + public.tds_client_credit(p_invoice_id);
$fn$;

-- ── S2: record the TDS a client deducted ────────────────────────────────────

create or replace function public.record_client_tds(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  /* RULING 2026-11-17: R-17.1b. The rate is fixed here, never typed per invoice.
     A change is a new ruling and a new migration. */
  c_rate constant numeric(5,2) := 1.50;

  v_actor      uuid := auth.uid();
  v_role       public.system_role;
  v_key        uuid := nullif(p_payload->>'client_uuid', '')::uuid;
  v_invoice_id uuid := nullif(p_payload->>'invoice_id', '')::uuid;
  v_payment_id uuid := nullif(p_payload->>'payment_id', '')::uuid;
  v_cert       text := nullif(btrim(p_payload->>'certificate_number'), '');
  v_on         date := coalesce(
                         nullif(p_payload->>'deducted_on', '')::date,
                         (clock_timestamp() at time zone 'Asia/Kathmandu')::date);

  v_inv        public.invoices%rowtype;
  v_pay        public.payments%rowtype;
  v_existing   public.tds_ledger%rowtype;
  v_party      text;
  v_amount     numeric(14,2);
  v_id         uuid;
  v_result     jsonb;
begin
  select primary_role into v_role from public.users where id = v_actor and is_active;
  if v_actor is null or v_role is null
     or v_role not in ('Owner', 'Coordinator', 'Accounts') then
    raise exception 'Only Owner, Coordinator or Accounts can record client TDS.'
      using errcode = '42501';
  end if;

  if v_key is null or v_invoice_id is null then
    raise exception 'An invoice and a request key are required.';
  end if;
  if v_cert is not null and length(v_cert) > 60 then
    raise exception 'A certificate number can be at most 60 characters.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));

  -- Idempotent replay (Law 8).
  select * into v_existing from public.tds_ledger where client_uuid = v_key;
  if found then
    if v_existing.created_by is not distinct from v_actor
       and v_existing.invoice_id is not distinct from v_invoice_id
       and v_existing.entry_type = 'Deduction' then
      select * into v_inv from public.invoices where id = v_invoice_id;
      return jsonb_build_object(
        'ledger_id', v_existing.id, 'invoice_id', v_existing.invoice_id,
        'amount', v_existing.amount, 'rate_percent', v_existing.rate_percent,
        'base_amount', v_existing.base_amount, 'paid_amount', v_inv.paid_amount,
        'outstanding_amount', v_inv.outstanding_amount, 'status', v_inv.status,
        'replayed', true);
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;

  select * into v_inv from public.invoices where id = v_invoice_id for update;
  if not found then
    raise exception 'Invoice was not found.';
  end if;
  if v_inv.voided_at is not null or v_inv.status = 'Void'::invoice_status then
    raise exception 'GATE:tds.invoice_void: A voided invoice cannot take TDS.' using errcode = '23514';
  end if;
  if coalesce(v_inv.taxable_amount, 0) <= 0 then
    raise exception 'GATE:tds.no_base: This invoice has no taxable amount to deduct TDS from.' using errcode = '23514';
  end if;

  if v_payment_id is not null then
    select * into v_pay from public.payments where id = v_payment_id;
    if not found or v_pay.invoice_id is distinct from v_inv.id then
      raise exception 'GATE:tds.payment_mismatch: That payment does not belong to this invoice.' using errcode = '23514';
    end if;
  end if;

  -- One ACTIVE deduction per invoice: a deduction with no reversal row against it.
  if exists (
    select 1 from public.tds_ledger d
     where d.invoice_id = v_inv.id and d.direction = 'Client Deducted' and d.entry_type = 'Deduction'
       and not exists (select 1 from public.tds_ledger r where r.reverses_id = d.id)
  ) then
    raise exception 'GATE:tds.already_recorded: TDS is already recorded for this invoice. Reverse it first to record it again.'
      using errcode = '23514';
  end if;

  -- TDS = 1.5% of the taxable value (before VAT), to the paisa, half-up.
  v_amount := round(v_inv.taxable_amount * c_rate / 100.0, 2);
  if v_amount <= 0 then
    raise exception 'GATE:tds.no_base: The TDS on this invoice rounds to zero.' using errcode = '23514';
  end if;

  -- The TDS and a cash payment cannot both settle the same money.
  if v_amount > v_inv.outstanding_amount then
    raise exception 'GATE:tds.exceeds_outstanding: TDS of % is more than the % still outstanding on this invoice.',
      v_amount, v_inv.outstanding_amount using errcode = '23514';
  end if;

  select c.name into v_party from public.clients c where c.id = v_inv.client_id;

  v_id := gen_random_uuid();
  insert into public.tds_ledger (
    id, client_uuid, entry_type, direction, amount, rate_percent, base_amount,
    invoice_id, payment_id, party_name, certificate_number, deducted_on, created_by
  ) values (
    v_id, v_key, 'Deduction', 'Client Deducted', v_amount, c_rate, v_inv.taxable_amount,
    v_inv.id, v_payment_id, v_party, v_cert, v_on, v_actor
  );

  perform public.recompute_invoice_payment_state(v_inv.id);
  select * into v_inv from public.invoices where id = v_inv.id;

  v_result := jsonb_build_object(
    'ledger_id', v_id, 'invoice_id', v_inv.id,
    'amount', v_amount, 'rate_percent', c_rate, 'base_amount', v_inv.taxable_amount,
    'paid_amount', v_inv.paid_amount, 'outstanding_amount', v_inv.outstanding_amount,
    'status', v_inv.status, 'replayed', false);

  insert into public.audit_events (
    id, client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, old_values, new_values, reason
  ) values (
    gen_random_uuid(), v_key, 'money movement', 'Finance', 'Finance', 'Create'::public.audit_action,
    'Informational', 'Success', 'tds_ledger', v_id, v_actor, v_role, null, v_result,
    'Client TDS recorded'
  );

  return v_result;
end;
$fn$;

revoke all on function public.record_client_tds(jsonb) from public, anon;
grant execute on function public.record_client_tds(jsonb) to authenticated;

-- ── S2: reverse a client TDS deduction (Law 4: a correction is a new row) ───

create or replace function public.reverse_client_tds(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor    uuid := auth.uid();
  v_role     public.system_role;
  v_key      uuid := nullif(p_payload->>'client_uuid', '')::uuid;
  v_ledger   uuid := nullif(p_payload->>'ledger_id', '')::uuid;
  v_reason   text := nullif(btrim(p_payload->>'reason'), '');
  v_orig     public.tds_ledger%rowtype;
  v_existing public.tds_ledger%rowtype;
  v_inv      public.invoices%rowtype;
  v_id       uuid;
  v_result   jsonb;
begin
  select primary_role into v_role from public.users where id = v_actor and is_active;
  if v_actor is null or v_role is null or v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'Only Owner, Admin or Manager can reverse client TDS.' using errcode = '42501';
  end if;

  if v_key is null or v_ledger is null then
    raise exception 'A ledger entry and a request key are required.';
  end if;
  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'A reason of at least 10 characters is required.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));

  select * into v_existing from public.tds_ledger where client_uuid = v_key;
  if found then
    if v_existing.reverses_id is not distinct from v_ledger and v_existing.created_by is not distinct from v_actor then
      select * into v_inv from public.invoices where id = v_existing.invoice_id;
      return jsonb_build_object(
        'ledger_id', v_existing.id, 'reverses_id', v_existing.reverses_id,
        'invoice_id', v_existing.invoice_id, 'amount', v_existing.amount,
        'paid_amount', v_inv.paid_amount, 'outstanding_amount', v_inv.outstanding_amount,
        'status', v_inv.status, 'replayed', true);
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;

  select * into v_orig from public.tds_ledger where id = v_ledger;
  if not found or v_orig.entry_type <> 'Deduction' or v_orig.direction <> 'Client Deducted' then
    raise exception 'GATE:tds.not_reversible: That entry is not a client TDS deduction.' using errcode = '23514';
  end if;
  if exists (select 1 from public.tds_ledger r where r.reverses_id = v_orig.id) then
    raise exception 'GATE:tds.already_reversed: That deduction has already been reversed.' using errcode = '23514';
  end if;

  select * into v_inv from public.invoices where id = v_orig.invoice_id for update;
  if v_inv.voided_at is not null then
    raise exception 'GATE:tds.invoice_void: A voided invoice cannot be changed.' using errcode = '23514';
  end if;

  v_id := gen_random_uuid();
  insert into public.tds_ledger (
    id, client_uuid, entry_type, direction, amount, rate_percent, base_amount,
    invoice_id, payment_id, party_name, certificate_number, deducted_on,
    reverses_id, reason, created_by
  ) values (
    v_id, v_key, 'Reversal', 'Client Deducted', v_orig.amount, v_orig.rate_percent, v_orig.base_amount,
    v_orig.invoice_id, v_orig.payment_id, v_orig.party_name, v_orig.certificate_number,
    (clock_timestamp() at time zone 'Asia/Kathmandu')::date,
    v_orig.id, v_reason, v_actor
  );

  perform public.recompute_invoice_payment_state(v_orig.invoice_id);
  select * into v_inv from public.invoices where id = v_orig.invoice_id;

  v_result := jsonb_build_object(
    'ledger_id', v_id, 'reverses_id', v_orig.id, 'invoice_id', v_orig.invoice_id,
    'amount', v_orig.amount, 'paid_amount', v_inv.paid_amount,
    'outstanding_amount', v_inv.outstanding_amount, 'status', v_inv.status, 'replayed', false);

  insert into public.audit_events (
    id, client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, old_values, new_values, reason
  ) values (
    gen_random_uuid(), v_key, 'money movement', 'Finance', 'Finance', 'Create'::public.audit_action,
    'Informational', 'Success', 'tds_ledger', v_id, v_actor, v_role, null, v_result, v_reason
  );

  return v_result;
end;
$fn$;

revoke all on function public.reverse_client_tds(jsonb) from public, anon;
grant execute on function public.reverse_client_tds(jsonb) to authenticated;

commit;
