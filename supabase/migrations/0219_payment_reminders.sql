-- =============================================================================
-- 0219_payment_reminders.sql — Automatic payment reminders & client pause (T5-08)
--
-- Implements automatic payment reminders (W14, W18, W18b, W22, W80):
--   1. When a booking is completed (returned) with money still owed, automatic
--      reminder emails go out at completion, day 5, day 10, then every 5 days (W18) until paid.
--   2. Staff can pause a client (W18b) with a reason; paused clients get nothing.
--   3. Reminders stop the moment the balance is 0.
--   4. Client with NO email gets a WhatsApp draft task for staff (W22).
--   5. Sent in English from no-reply@babinrentals.com (W80).
--
-- Law 3: Hard delete forbidden.
-- Law 4: Sent reminder records immutable.
-- Law 6: Money blindness enforced for floor roles.
-- Law 8: client_uuid on all writes.
-- RLS: Staff manage reminders; clients cannot pause/resume.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Alter public.clients: pause fields (W18b)
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists reminders_paused boolean not null default false,
  add column if not exists reminders_paused_reason text,
  add column if not exists reminders_paused_by uuid references public.users(id),
  add column if not exists reminders_paused_at timestamptz;

comment on column public.clients.reminders_paused is
  'When true, automatic payment reminders are suppressed for this client (W18b).';
comment on column public.clients.reminders_paused_reason is
  'Required reason given by staff when pausing payment reminders (W18b).';
comment on column public.clients.reminders_paused_by is
  'Staff user who paused payment reminders (W18b).';
comment on column public.clients.reminders_paused_at is
  'Timestamp when payment reminders were paused (W18b).';

grant select (reminders_paused, reminders_paused_reason, reminders_paused_by, reminders_paused_at)
  on public.clients to authenticated;

create or replace view public.clients_v as
 SELECT id,
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
        CASE
            WHEN auth_can_view_money() THEN approved_credit_limit
            ELSE NULL::numeric
        END AS approved_credit_limit,
        CASE
            WHEN auth_can_view_money() THEN payment_terms
            ELSE NULL::payment_terms
        END AS payment_terms,
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
    is_staff,
    staff_user_id,
        CASE
            WHEN auth_can_view_money() THEN account_credit
            ELSE NULL::numeric
        END AS account_credit,
    reminders_paused,
    reminders_paused_reason,
    reminders_paused_by,
    reminders_paused_at
   FROM public.clients
  where auth_is_staff() and auth_user_role() <> 'Driver';

revoke all on public.clients_v from anon;
grant select on public.clients_v to authenticated;

create or replace view client_directory_v as
select
  c.id,
  c.client_code,
  c.name,
  c.phone,
  c.email,
  c.address_line,
  c.city,
  c.district,
  c.country,
  c.status,
  c.client_since,
  c.type_parent,
  c.org_subtype,
  c.pan_vat,
  c.deactivated_at,
  c.created_at,
  c.approved_credit_limit,
  c.payment_terms,
  case when auth_can_view_money() then coalesce(inv.outstanding_total, 0) else null end
    as outstanding_amount,
  case when auth_can_view_money() then coalesce(dep.held_total, 0) else null end
    as deposit_held_amount,
  case when auth_can_view_money() then coalesce(pay.paid_total, 0) else null end
    as total_paid_amount,
  coalesce(bk.active_count, 0)  as active_bookings_count,
  coalesce(bk.total_count, 0)   as total_bookings_count,
  bk.last_pickup_at,
  ct.full_name    as contact_name,
  ct.designation  as contact_designation,
  ct.phone        as contact_phone,
  mem.level       as membership_level,
  coalesce(doc.total_count, 0)    as kyc_docs_count,
  coalesce(doc.verified_count, 0) as kyc_verified_count,
  exists (
    select 1
    from client_flags f
    where f.client_id = c.id
      and f.flag_type = 'Blocked'
      and f.removed_at is null
  ) as is_blocked,
  c.is_staff,
  c.staff_user_id,
  c.reminders_paused,
  c.reminders_paused_reason,
  c.reminders_paused_by,
  c.reminders_paused_at
from public.clients_v c
left join lateral (
  select sum(i.outstanding_amount) as outstanding_total
  from invoices i
  where i.client_id = c.id
) inv on true
left join lateral (
  select sum(greatest(s.received_amount - s.refunded_amount - s.applied_amount, 0)) as held_total
  from security_deposits s
  where s.client_id = c.id
) dep on true
left join lateral (
  select sum(p.amount) as paid_total
  from payments p
  where p.client_id = c.id and p.status = 'Received'
) pay on true
left join lateral (
  select
    count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null) as active_count,
    count(*)                                                              as total_count,
    max(b.pickup_at)                                                      as last_pickup_at
  from bookings b
  where b.client_id = c.id
) bk on true
left join lateral (
  select k.full_name, k.designation, k.phone
  from client_contacts k
  where k.client_id = c.id and k.deactivated_at is null
  order by k.is_primary desc, k.created_at
  limit 1
) ct on true
left join lateral (
  select p.level
  from client_memberships m
  join membership_plans p on p.id = m.plan_id
  where m.client_id = c.id and m.superseded_at is null
  order by m.join_date desc
  limit 1
) mem on true
left join lateral (
  select
    count(*)                                        as total_count,
    count(*) filter (where d.status = 'Verified')   as verified_count
  from client_documents d
  where d.client_id = c.id and d.archived_at is null
) doc on true
where auth_is_staff();

revoke all on client_directory_v from anon;
grant select on client_directory_v to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Table: payment_reminders (Schedule rows for W18)
-- -----------------------------------------------------------------------------
create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  sequence int not null default 0,
  channel text not null check (channel in ('email', 'whatsapp_draft')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'draft_ready', 'cancelled', 'failed')),
  due_at timestamptz not null,
  sent_at timestamptz,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  outstanding_amount numeric(14,2) not null default 0,
  email_log_id uuid references public.email_log(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, sequence)
);

comment on table public.payment_reminders is
  'Automatic payment reminder schedule rows (completion, day 5, day 10, then every 5 days) per W18.';
comment on column public.payment_reminders.sequence is
  'Reminder sequence index: 0=completion, 1=day 5, 2=day 10, then every 5 days (W18).';
comment on column public.payment_reminders.outstanding_amount is
  'Snapshot of outstanding balance in paisa/rupees at schedule or send time.';

create index if not exists idx_payment_reminders_due_pending
  on public.payment_reminders (due_at)
  where status = 'pending';

create index if not exists idx_payment_reminders_booking
  on public.payment_reminders (booking_id);

create index if not exists idx_payment_reminders_client
  on public.payment_reminders (client_id);

-- -----------------------------------------------------------------------------
-- 3. Law 3: Hard delete forbidden
-- -----------------------------------------------------------------------------
create or replace function public.trg_payment_reminders_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): payment_reminders entries cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_payment_reminders_prevent_delete on public.payment_reminders;
create trigger trg_payment_reminders_prevent_delete
  before delete on public.payment_reminders
  for each statement execute function public.trg_payment_reminders_prevent_delete_fn();

revoke all on function public.trg_payment_reminders_prevent_delete_fn() from public, anon;
grant execute on function public.trg_payment_reminders_prevent_delete_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Law 4: Immutability guard on terminal states
-- -----------------------------------------------------------------------------
create or replace function public.trg_payment_reminders_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.status in ('sent', 'cancelled') then
    if NEW.id <> OLD.id
       or NEW.client_uuid <> OLD.client_uuid
       or NEW.booking_id <> OLD.booking_id
       or NEW.client_id <> OLD.client_id
       or NEW.sequence <> OLD.sequence
       or NEW.due_at <> OLD.due_at
       or NEW.channel <> OLD.channel then
      raise exception 'IMMUTABLE (Law 4): completed or cancelled payment_reminders cannot be altered.'
        using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_payment_reminders_update_guard on public.payment_reminders;
create trigger trg_payment_reminders_update_guard
  before update on public.payment_reminders
  for each row execute function public.trg_payment_reminders_update_guard_fn();

revoke all on function public.trg_payment_reminders_update_guard_fn() from public, anon;
grant execute on function public.trg_payment_reminders_update_guard_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security policies
-- -----------------------------------------------------------------------------
alter table public.payment_reminders enable row level security;

drop policy if exists payment_reminders_select on public.payment_reminders;
create policy payment_reminders_select on public.payment_reminders
  for select
  to authenticated
  using (
    public.auth_is_staff()
    or exists (
      select 1 from public.clients c
      join public.users u on u.email = c.email
      where c.id = payment_reminders.client_id
        and u.id = public.auth_user_id()
    )
  );

drop policy if exists payment_reminders_staff_insert on public.payment_reminders;
create policy payment_reminders_staff_insert on public.payment_reminders
  for insert
  to authenticated
  with check (public.auth_is_staff());

drop policy if exists payment_reminders_staff_update on public.payment_reminders;
create policy payment_reminders_staff_update on public.payment_reminders
  for update
  to authenticated
  using (public.auth_is_staff())
  with check (public.auth_is_staff());

drop policy if exists payment_reminders_staff_delete on public.payment_reminders;
create policy payment_reminders_staff_delete on public.payment_reminders
  for delete
  to authenticated
  using (public.auth_is_staff());

grant select, insert, update, delete on public.payment_reminders to authenticated;
revoke all on public.payment_reminders from anon;

-- -----------------------------------------------------------------------------
-- 6. RPC: pause_client_payment_reminders (W18b)
-- -----------------------------------------------------------------------------
create or replace function public.pause_client_payment_reminders(
  p_client_uuid uuid,
  p_client_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staff_id uuid;
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may pause client payment reminders'
      using errcode = '42501';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required to pause payment reminders'
      using errcode = '22000';
  end if;

  v_staff_id := public.auth_user_id();

  update public.clients
  set reminders_paused = true,
      reminders_paused_reason = trim(p_reason),
      reminders_paused_by = v_staff_id,
      reminders_paused_at = now(),
      updated_at = now()
  where id = p_client_id;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  -- Cancel all pending or draft_ready payment reminders for this client
  update public.payment_reminders
  set status = 'cancelled',
      error_message = 'Reminders paused by staff: ' || trim(p_reason),
      updated_at = now()
  where client_id = p_client_id
    and status in ('pending', 'draft_ready');

  return true;
end;
$$;

revoke all on function public.pause_client_payment_reminders(uuid, uuid, text) from public, anon;
grant execute on function public.pause_client_payment_reminders(uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: resume_client_payment_reminders (W18b)
-- -----------------------------------------------------------------------------
create or replace function public.resume_client_payment_reminders(
  p_client_uuid uuid,
  p_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_client record;
  v_channel text;
  v_next_seq int;
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may resume client payment reminders'
      using errcode = '42501';
  end if;

  select id, name, email, phone
  into v_client
  from public.clients
  where id = p_client_id;

  if not found then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  update public.clients
  set reminders_paused = false,
      reminders_paused_reason = null,
      reminders_paused_by = null,
      reminders_paused_at = null,
      updated_at = now()
  where id = p_client_id;

  if v_client.email is not null and trim(v_client.email) <> '' then
    v_channel := 'email';
  else
    v_channel := 'whatsapp_draft';
  end if;

  -- Re-schedule next reminder for any completed booking with positive balance
  for r in
    select b.id as booking_id, b.booking_no, coalesce(sum(i.outstanding_amount), 0) as balance
    from public.bookings b
    join public.invoices i on i.booking_id = b.id
    where b.client_id = p_client_id
      and b.stage in ('Returned', 'Closed')
      and b.cancelled_at is null
      and i.status not in ('Void')
    group by b.id, b.booking_no
    having coalesce(sum(i.outstanding_amount), 0) > 0
  loop
    select coalesce(max(sequence), -1) + 1
    into v_next_seq
    from public.payment_reminders
    where booking_id = r.booking_id;

    insert into public.payment_reminders (
      client_uuid, booking_id, client_id, sequence, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, outstanding_amount
    ) values (
      gen_random_uuid(), r.booking_id, p_client_id, v_next_seq, v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone, r.balance
    )
    on conflict (booking_id, sequence)
    do nothing;
  end loop;

  return true;
end;
$$;

revoke all on function public.resume_client_payment_reminders(uuid, uuid) from public, anon;
grant execute on function public.resume_client_payment_reminders(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Trigger: Cancel payment reminders when balance reaches 0 ("reminders stop the moment the balance is 0")
-- -----------------------------------------------------------------------------
create or replace function public.trg_invoice_payment_reminder_settled_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total_outstanding numeric(14,2);
begin
  if NEW.booking_id is not null then
    select coalesce(sum(outstanding_amount), 0)
    into v_total_outstanding
    from public.invoices
    where booking_id = NEW.booking_id
      and status not in ('Void');

    if v_total_outstanding <= 0 then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Balance fully settled',
          updated_at = now()
      where booking_id = NEW.booking_id
        and status in ('pending', 'draft_ready');
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_invoice_payment_reminder_settled on public.invoices;
create trigger trg_invoice_payment_reminder_settled
  after insert or update on public.invoices
  for each row execute function public.trg_invoice_payment_reminder_settled_fn();

revoke all on function public.trg_invoice_payment_reminder_settled_fn() from public, anon;
grant execute on function public.trg_invoice_payment_reminder_settled_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Trigger on bookings: Schedule Day 0 payment reminder on Returned completion
-- -----------------------------------------------------------------------------
create or replace function public.trg_booking_payment_reminder_completion_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_channel text;
  v_outstanding numeric(14,2);
begin
  if NEW.stage in ('Returned', 'Closed') and (TG_OP = 'INSERT' or OLD.stage is distinct from NEW.stage) then
    select id, name, email, phone, reminders_paused
    into v_client
    from public.clients
    where id = NEW.client_id;

    if v_client.id is not null and not coalesce(v_client.reminders_paused, false) then
      select coalesce(sum(outstanding_amount), 0)
      into v_outstanding
      from public.invoices
      where booking_id = NEW.id
        and status not in ('Void');

      if coalesce(v_outstanding, 0) > 0 then
        if v_client.email is not null and trim(v_client.email) <> '' then
          v_channel := 'email';
        else
          v_channel := 'whatsapp_draft';
        end if;

        insert into public.payment_reminders (
          client_uuid, booking_id, client_id, sequence, channel, status, due_at,
          recipient_name, recipient_email, recipient_phone, outstanding_amount
        ) values (
          gen_random_uuid(), NEW.id, NEW.client_id, 0, v_channel, 'pending',
          now(),
          v_client.name, v_client.email, v_client.phone, v_outstanding
        )
        on conflict (booking_id, sequence)
        do nothing;
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_booking_payment_reminder_completion on public.bookings;
create trigger trg_booking_payment_reminder_completion
  after insert or update of stage on public.bookings
  for each row execute function public.trg_booking_payment_reminder_completion_fn();

revoke all on function public.trg_booking_payment_reminder_completion_fn() from public, anon;
grant execute on function public.trg_booking_payment_reminder_completion_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 10. RPC: process_due_payment_reminders (W18 cadence + pause & balance check)
-- -----------------------------------------------------------------------------
create or replace function public.process_due_payment_reminders(
  p_limit int default 50
)
returns table (
  reminder_id uuid,
  booking_id uuid,
  client_id uuid,
  sequence int,
  channel text,
  status text,
  recipient_email text,
  recipient_phone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  r record;
  v_email_log_id uuid;
  v_outstanding numeric(14,2);
  v_paused boolean;
  v_next_seq int;
  v_next_interval interval;
begin
  for r in
    select pr.*, b.booking_no
    from public.payment_reminders pr
    join public.bookings b on b.id = pr.booking_id
    where pr.status = 'pending'
      and pr.due_at <= now()
    order by pr.due_at asc
    limit p_limit
    for update skip locked
  loop
    -- 1. Check if client is paused
    select coalesce(c.reminders_paused, false)
    into v_paused
    from public.clients c
    where c.id = r.client_id;

    if v_paused then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Reminders paused by staff for client',
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- 2. Check if balance is settled
    select coalesce(sum(inv.outstanding_amount), 0)
    into v_outstanding
    from public.invoices inv
    where inv.booking_id = r.booking_id
      and inv.status not in ('Void');

    if v_outstanding <= 0 then
      update public.payment_reminders
      set status = 'cancelled',
          error_message = 'Balance fully settled',
          updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- 3. Dispatch
    if r.channel = 'whatsapp_draft' then
      update public.payment_reminders
      set status = 'draft_ready',
          sent_at = now(),
          outstanding_amount = v_outstanding,
          updated_at = now()
      where id = r.id;

      perform public.notify_staff(
        'general',
        'WhatsApp Draft Ready: payment_reminder',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        '/rentals/' || r.booking_id,
        'booking',
        r.booking_no
      );

      reminder_id := r.id;
      booking_id := r.booking_id;
      client_id := r.client_id;
      sequence := r.sequence;
      channel := r.channel;
      status := 'draft_ready';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;

    elsif r.channel = 'email' then
      insert into public.email_log (
        template_id,
        recipient_email,
        entity_type,
        entity_id,
        language,
        status,
        metadata,
        sent_at
      ) values (
        'payment_reminder',
        r.recipient_email,
        'booking',
        r.booking_id::text,
        'en',
        'mock_sent',
        jsonb_build_object(
          'source', 'automatic_payment_reminders',
          'booking_no', r.booking_no,
          'reminder_id', r.id,
          'sequence', r.sequence,
          'outstanding_amount', v_outstanding
        ),
        now()
      )
      returning id into v_email_log_id;

      update public.payment_reminders
      set status = 'sent',
          sent_at = now(),
          email_log_id = v_email_log_id,
          outstanding_amount = v_outstanding,
          updated_at = now()
      where id = r.id;

      reminder_id := r.id;
      booking_id := r.booking_id;
      client_id := r.client_id;
      sequence := r.sequence;
      channel := r.channel;
      status := 'sent';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;
    end if;

    -- 4. Schedule next reminder (W18: completion, day 5, day 10, then every 5 days)
    if v_outstanding > 0 and not v_paused then
      v_next_seq := r.sequence + 1;
      v_next_interval := interval '5 days';

      insert into public.payment_reminders (
        client_uuid, booking_id, client_id, sequence, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, outstanding_amount
      ) values (
        gen_random_uuid(), r.booking_id, r.client_id, v_next_seq, r.channel, 'pending',
        r.due_at + v_next_interval,
        r.recipient_name, r.recipient_email, r.recipient_phone, v_outstanding
      )
      on conflict (booking_id, sequence)
      do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.process_due_payment_reminders(int) from public, anon;
grant execute on function public.process_due_payment_reminders(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Integrate WhatsApp draft tasks from payment_reminders
-- -----------------------------------------------------------------------------
create or replace function public.get_pending_whatsapp_draft_tasks()
returns table (
  id uuid,
  client_uuid uuid,
  booking_id uuid,
  booking_no text,
  event_type text,
  recipient_name text,
  recipient_phone text,
  due_at timestamptz,
  status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may view WhatsApp draft tasks'
      using errcode = '42501';
  end if;

  return query
  select
    e.id,
    e.client_uuid,
    e.booking_id,
    b.booking_no,
    e.event_type,
    e.recipient_name,
    e.recipient_phone,
    e.due_at,
    e.status,
    e.payload
  from public.client_message_events e
  join public.bookings b on b.id = e.booking_id
  where e.channel = 'whatsapp_draft'
    and e.status = 'draft_ready'

  union all

  select
    pr.id,
    pr.client_uuid,
    pr.booking_id,
    b.booking_no,
    'payment_reminder'::text as event_type,
    pr.recipient_name,
    pr.recipient_phone,
    pr.due_at,
    pr.status,
    jsonb_build_object('outstanding_amount', pr.outstanding_amount, 'sequence', pr.sequence) as payload
  from public.payment_reminders pr
  join public.bookings b on b.id = pr.booking_id
  where pr.channel = 'whatsapp_draft'
    and pr.status = 'draft_ready'

  order by due_at desc;
end;
$$;

revoke all on function public.get_pending_whatsapp_draft_tasks() from public, anon;
grant execute on function public.get_pending_whatsapp_draft_tasks() to authenticated;

-- -----------------------------------------------------------------------------
-- 12. Register cron job in cron_schedules
-- -----------------------------------------------------------------------------
insert into public.cron_schedules (job_name, schedule, command, description)
values (
  'automatic-payment-reminders',
  '*/15 * * * *',
  'select process_due_payment_reminders()',
  'Process due automatic payment reminders (T5-08, W18)'
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command,
    description = excluded.description,
    updated_at = now();

commit;
