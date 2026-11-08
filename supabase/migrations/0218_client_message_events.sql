-- =============================================================================
-- 0218_client_message_events.sql — Automatic client emails & message events (T5-07)
--
-- Implements automatic client messages (W21, W22, W23, W37, W38, W80):
--   1. Pickup reminder — 2 hours before pickup (W37)
--   2. Pickup receipt — when Handover completes (On Rent transition)
--   3. Return reminder — 2 hours before return time (W37)
--   4. Late return — at 30 minutes late, when free grace ends (W38)
--   5. Return receipt — when Return completes (Returned transition)
--   6. Damage / loss notice — when damage case opens, strictly NO amount (W23, Law 6);
--      second email with approved charge only after Manager (< Rs 25,000) or Owner approval.
--
-- Client with NO email gets a WhatsApp draft task for staff (W22).
-- Each message is sent once (idempotent on booking + event).
-- Cancelled booking stops its pending reminders.
--
-- Law 3: Hard delete forbidden.
-- Law 4: Records immutable once dispatched or cancelled.
-- Law 6: Zero money in damage notices for money-blind roles & clients.
-- Law 8: client_uuid on all writes.
-- RLS: Staff read all; clients read own rows only; no client write.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Table: client_message_events
-- -----------------------------------------------------------------------------
create table if not exists public.client_message_events (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  event_type text not null check (event_type in (
    'pickup_reminder',
    'pickup_receipt',
    'return_reminder',
    'late_return',
    'return_receipt',
    'damage_notice',
    'damage_charge'
  )),
  channel text not null check (channel in ('email', 'whatsapp_draft')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'draft_ready', 'cancelled', 'failed')),
  due_at timestamptz not null,
  sent_at timestamptz,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  finding_id uuid references public.damage_findings(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  email_log_id uuid references public.email_log(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_message_events is
  'Automatic client communications scheduled and dispatched by the server (T5-07, W21).';

-- Idempotency unique index: strictly one event per booking and event_type (or finding)
create unique index if not exists uq_client_message_events_idempotent
  on public.client_message_events (
    booking_id,
    event_type,
    coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_client_message_events_due_pending
  on public.client_message_events (due_at)
  where status = 'pending';

create index if not exists idx_client_message_events_booking
  on public.client_message_events (booking_id);

create index if not exists idx_client_message_events_status
  on public.client_message_events (status);

-- -----------------------------------------------------------------------------
-- 2. Law 3: Hard delete forbidden
-- -----------------------------------------------------------------------------
create or replace function public.trg_client_message_events_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): client_message_events entries cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_client_message_events_prevent_delete on public.client_message_events;
create trigger trg_client_message_events_prevent_delete
  before delete on public.client_message_events
  for each statement execute function public.trg_client_message_events_prevent_delete_fn();

revoke all on function public.trg_client_message_events_prevent_delete_fn() from public, anon;
grant execute on function public.trg_client_message_events_prevent_delete_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Law 4: Immutability guard on terminal states
-- -----------------------------------------------------------------------------
create or replace function public.trg_client_message_events_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.status in ('sent', 'cancelled') then
    if NEW.id <> OLD.id
       or NEW.client_uuid <> OLD.client_uuid
       or NEW.booking_id <> OLD.booking_id
       or NEW.event_type <> OLD.event_type
       or NEW.due_at <> OLD.due_at
       or NEW.channel <> OLD.channel then
      raise exception 'IMMUTABLE (Law 4): completed or cancelled client_message_events cannot be altered.'
        using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_client_message_events_update_guard on public.client_message_events;
create trigger trg_client_message_events_update_guard
  before update on public.client_message_events
  for each row execute function public.trg_client_message_events_update_guard_fn();

revoke all on function public.trg_client_message_events_update_guard_fn() from public, anon;
grant execute on function public.trg_client_message_events_update_guard_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security policies
-- -----------------------------------------------------------------------------
alter table public.client_message_events enable row level security;

drop policy if exists client_message_events_select on public.client_message_events;
create policy client_message_events_select on public.client_message_events
  for select
  to authenticated
  using (
    public.auth_is_staff()
    or exists (
      select 1 from public.bookings b
      join public.clients c on c.id = b.client_id
      join public.users u on u.email = c.email
      where b.id = client_message_events.booking_id
        and u.id = public.auth_user_id()
    )
  );

drop policy if exists client_message_events_staff_insert on public.client_message_events;
create policy client_message_events_staff_insert on public.client_message_events
  for insert
  to authenticated
  with check (public.auth_is_staff());

drop policy if exists client_message_events_staff_update on public.client_message_events;
create policy client_message_events_staff_update on public.client_message_events
  for update
  to authenticated
  using (public.auth_is_staff())
  with check (public.auth_is_staff());

drop policy if exists client_message_events_delete on public.client_message_events;
create policy client_message_events_delete on public.client_message_events
  for delete
  to authenticated
  using (public.auth_is_staff());

grant select, insert, update, delete on public.client_message_events to authenticated;
revoke all on public.client_message_events from anon;

-- -----------------------------------------------------------------------------
-- 5. Trigger: Booking stage and reminder scheduling
-- -----------------------------------------------------------------------------
create or replace function public.trg_booking_client_message_events_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_channel text;
begin
  select id, name, email, phone
  into v_client
  from public.clients
  where id = NEW.client_id;

  if v_client.id is not null and v_client.email is not null and trim(v_client.email) <> '' then
    v_channel := 'email';
  else
    v_channel := 'whatsapp_draft';
  end if;

  -- 1. When booking is Booked or Packed and not cancelled
  if NEW.stage in ('Booked', 'Packed') and NEW.cancelled_at is null then
    -- Pickup reminder: 2 hours before pickup (W37)
    if NEW.pickup_at is not null then
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, payload
      ) values (
        gen_random_uuid(), NEW.id, 'pickup_reminder', v_channel, 'pending',
        NEW.pickup_at - interval '2 hours',
        v_client.name, v_client.email, v_client.phone,
        jsonb_build_object('booking_no', NEW.booking_no, 'pickup_at', NEW.pickup_at, 'return_at', NEW.return_at)
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set
        due_at = excluded.due_at,
        channel = excluded.channel,
        recipient_name = excluded.recipient_name,
        recipient_email = excluded.recipient_email,
        recipient_phone = excluded.recipient_phone,
        updated_at = now()
      where client_message_events.status = 'pending';
    end if;

    -- Return reminder: 2 hours before return (W37)
    if NEW.return_at is not null then
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, payload
      ) values (
        gen_random_uuid(), NEW.id, 'return_reminder', v_channel, 'pending',
        NEW.return_at - interval '2 hours',
        v_client.name, v_client.email, v_client.phone,
        jsonb_build_object('booking_no', NEW.booking_no, 'return_at', NEW.return_at)
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set
        due_at = excluded.due_at,
        channel = excluded.channel,
        recipient_name = excluded.recipient_name,
        recipient_email = excluded.recipient_email,
        recipient_phone = excluded.recipient_phone,
        updated_at = now()
      where client_message_events.status = 'pending';

      -- Late return: 30 minutes after return_at (W38, free grace period ends)
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, payload
      ) values (
        gen_random_uuid(), NEW.id, 'late_return', v_channel, 'pending',
        NEW.return_at + interval '30 minutes',
        v_client.name, v_client.email, v_client.phone,
        jsonb_build_object('booking_no', NEW.booking_no, 'return_at', NEW.return_at)
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do update set
        due_at = excluded.due_at,
        channel = excluded.channel,
        recipient_name = excluded.recipient_name,
        recipient_email = excluded.recipient_email,
        recipient_phone = excluded.recipient_phone,
        updated_at = now()
      where client_message_events.status = 'pending';
    end if;
  end if;

  -- 2. Handover completes -> stage becomes 'On Rent'
  if NEW.stage = 'On Rent' and (TG_OP = 'INSERT' or OLD.stage is distinct from 'On Rent') then
    insert into public.client_message_events (
      client_uuid, booking_id, event_type, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, payload
    ) values (
      gen_random_uuid(), NEW.id, 'pickup_receipt', v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone,
      jsonb_build_object('booking_no', NEW.booking_no, 'pickup_at', NEW.pickup_at, 'return_at', NEW.return_at)
    )
    on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;
  end if;

  -- 3. Return completes -> stage becomes 'Returned'
  if NEW.stage = 'Returned' and (TG_OP = 'INSERT' or OLD.stage is distinct from 'Returned') then
    insert into public.client_message_events (
      client_uuid, booking_id, event_type, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, payload
    ) values (
      gen_random_uuid(), NEW.id, 'return_receipt', v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone,
      jsonb_build_object('booking_no', NEW.booking_no, 'returned_at', now())
    )
    on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;

    -- Cancel pending return_reminder and late_return
    update public.client_message_events
    set status = 'cancelled', updated_at = now()
    where booking_id = NEW.id
      and event_type in ('return_reminder', 'late_return')
      and status = 'pending';
  end if;

  -- 4. Cancelled or Closed
  if NEW.cancelled_at is not null or NEW.stage = 'Closed' then
    update public.client_message_events
    set status = 'cancelled', updated_at = now()
    where booking_id = NEW.id
      and status = 'pending';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_booking_client_message_events on public.bookings;
create trigger trg_booking_client_message_events
  after insert or update on public.bookings
  for each row execute function public.trg_booking_client_message_events_fn();

revoke all on function public.trg_booking_client_message_events_fn() from public, anon;
grant execute on function public.trg_booking_client_message_events_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Trigger: Damage finding client notices
-- -----------------------------------------------------------------------------
create or replace function public.trg_damage_finding_client_message_events_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_booking record;
  v_client record;
  v_channel text;
begin
  if NEW.return_line_id is not null then
    select bl.booking_id
    into v_booking_id
    from public.return_lines rl
    join public.booking_lines bl on bl.id = rl.booking_line_id
    where rl.id = NEW.return_line_id;
  elsif NEW.cleaning_queue_entry_id is not null then
    select cqe.booking_id
    into v_booking_id
    from public.cleaning_queue_entries cqe
    where cqe.id = NEW.cleaning_queue_entry_id;
  end if;

  if v_booking_id is null then
    return NEW;
  end if;

  select id, booking_no, client_id
  into v_booking
  from public.bookings
  where id = v_booking_id;

  select id, name, email, phone
  into v_client
  from public.clients
  where id = v_booking.client_id;

  if v_client.email is not null and trim(v_client.email) <> '' then
    v_channel := 'email';
  else
    v_channel := 'whatsapp_draft';
  end if;

  -- 1. On INSERT: damage_notice with strictly NO money amount (W23, Law 6)
  if TG_OP = 'INSERT' then
    insert into public.client_message_events (
      client_uuid, booking_id, event_type, channel, status, due_at,
      recipient_name, recipient_email, recipient_phone, finding_id, payload
    ) values (
      gen_random_uuid(), v_booking_id, 'damage_notice', v_channel, 'pending',
      now(),
      v_client.name, v_client.email, v_client.phone, NEW.id,
      jsonb_build_object(
        'booking_no', v_booking.booking_no,
        'damage_type', NEW.damage_type,
        'description', NEW.description,
        'severity', NEW.severity,
        'status', 'Under Technical Review'
      )
    )
    on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;
  end if;

  -- 2. On UPDATE: damage_charge after approval
  if TG_OP = 'UPDATE' and NEW.approval_state = 'Approved' and (OLD.approval_state is distinct from 'Approved') then
    if coalesce(NEW.estimated_cost, 0) > 0 then
      insert into public.client_message_events (
        client_uuid, booking_id, event_type, channel, status, due_at,
        recipient_name, recipient_email, recipient_phone, finding_id, payload
      ) values (
        gen_random_uuid(), v_booking_id, 'damage_charge', v_channel, 'pending',
        now(),
        v_client.name, v_client.email, v_client.phone, NEW.id,
        jsonb_build_object(
          'booking_no', v_booking.booking_no,
          'damage_type', NEW.damage_type,
          'description', NEW.description,
          'approved_amount', NEW.estimated_cost
        )
      )
      on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
      do nothing;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_damage_finding_client_message_events on public.damage_findings;
create trigger trg_damage_finding_client_message_events
  after insert or update on public.damage_findings
  for each row execute function public.trg_damage_finding_client_message_events_fn();

revoke all on function public.trg_damage_finding_client_message_events_fn() from public, anon;
grant execute on function public.trg_damage_finding_client_message_events_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. RPC: process_due_client_message_events
-- -----------------------------------------------------------------------------
create or replace function public.process_due_client_message_events(
  p_limit int default 50
)
returns table (
  event_id uuid,
  booking_id uuid,
  event_type text,
  channel text,
  status text,
  recipient_email text,
  recipient_phone text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_email_log_id uuid;
begin
  for r in
    select e.*, b.booking_no
    from public.client_message_events e
    join public.bookings b on b.id = e.booking_id
    where e.status = 'pending'
      and e.due_at <= now()
    order by e.due_at asc
    limit p_limit
    for update skip locked
  loop
    if r.channel = 'whatsapp_draft' then
      update public.client_message_events
      set status = 'draft_ready',
          sent_at = now(),
          updated_at = now()
      where id = r.id;

      perform public.notify_staff(
        'general',
        'WhatsApp Draft Ready: ' || r.event_type,
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        'Client ' || coalesce(r.recipient_name, 'Client') || ' for booking ' || r.booking_no || ' has no email. WhatsApp draft ready to send.',
        '/rentals/' || r.booking_id,
        'booking',
        r.booking_no
      );

      event_id := r.id;
      booking_id := r.booking_id;
      event_type := r.event_type;
      channel := r.channel;
      status := 'draft_ready';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;

    elsif r.channel = 'email' then
      -- Record send into email_log (strictly NO email body stored per S13 / W21)
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
        r.event_type,
        r.recipient_email,
        'booking',
        r.booking_id::text,
        'en',
        'mock_sent',
        jsonb_build_object('source', 'automatic_client_emails', 'booking_no', r.booking_no, 'event_id', r.id),
        now()
      )
      returning id into v_email_log_id;

      update public.client_message_events
      set status = 'sent',
          sent_at = now(),
          email_log_id = v_email_log_id,
          updated_at = now()
      where id = r.id;

      event_id := r.id;
      booking_id := r.booking_id;
      event_type := r.event_type;
      channel := r.channel;
      status := 'sent';
      recipient_email := r.recipient_email;
      recipient_phone := r.recipient_phone;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.process_due_client_message_events(int) from public, anon;
grant execute on function public.process_due_client_message_events(int) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. RPC: mark_client_message_event_sent
-- -----------------------------------------------------------------------------
create or replace function public.mark_client_message_event_sent(
  p_client_uuid uuid,
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated boolean := false;
begin
  if not public.auth_is_staff() then
    raise exception 'Permission denied: only staff may mark client message events sent'
      using errcode = '42501';
  end if;

  update public.client_message_events
  set status = 'sent',
      sent_at = coalesce(sent_at, now()),
      updated_at = now()
  where id = p_event_id
    and status in ('draft_ready', 'pending');

  if found then
    v_updated := true;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.mark_client_message_event_sent(uuid, uuid) from public, anon;
grant execute on function public.mark_client_message_event_sent(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. RPC: get_pending_whatsapp_draft_tasks
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
  order by e.due_at desc;
end;
$$;

revoke all on function public.get_pending_whatsapp_draft_tasks() from public, anon;
grant execute on function public.get_pending_whatsapp_draft_tasks() to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Register cron job in cron_schedules
-- -----------------------------------------------------------------------------
insert into public.cron_schedules (job_name, schedule, command, description)
values (
  'automatic-client-emails',
  '*/10 * * * *',
  'select process_due_client_message_events()',
  'Process due client emails and WhatsApp drafts every 10 minutes (T5-07, W21)'
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command,
    description = excluded.description,
    updated_at = now();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('automatic-client-emails') where exists (
        select 1 from cron.job where jobname = 'automatic-client-emails'
      );
      perform cron.schedule(
        'automatic-client-emails',
        '*/10 * * * *',
        $cmd$select process_due_client_message_events()$cmd$
      );
    exception when others then
      null;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Idempotent backfill for existing active bookings
-- -----------------------------------------------------------------------------
insert into public.client_message_events (
  client_uuid, booking_id, event_type, channel, status, due_at,
  recipient_name, recipient_email, recipient_phone, payload
)
select
  gen_random_uuid(),
  b.id,
  'pickup_reminder',
  case when c.email is not null and trim(c.email) <> '' then 'email' else 'whatsapp_draft' end,
  'pending',
  b.pickup_at - interval '2 hours',
  c.name, c.email, c.phone,
  jsonb_build_object('booking_no', b.booking_no, 'pickup_at', b.pickup_at, 'return_at', b.return_at)
from public.bookings b
join public.clients c on c.id = b.client_id
where b.stage in ('Booked', 'Packed')
  and b.pickup_at is not null
  and b.cancelled_at is null
on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

insert into public.client_message_events (
  client_uuid, booking_id, event_type, channel, status, due_at,
  recipient_name, recipient_email, recipient_phone, payload
)
select
  gen_random_uuid(),
  b.id,
  'return_reminder',
  case when c.email is not null and trim(c.email) <> '' then 'email' else 'whatsapp_draft' end,
  'pending',
  b.return_at - interval '2 hours',
  c.name, c.email, c.phone,
  jsonb_build_object('booking_no', b.booking_no, 'return_at', b.return_at)
from public.bookings b
join public.clients c on c.id = b.client_id
where b.stage in ('Booked', 'Packed')
  and b.return_at is not null
  and b.cancelled_at is null
on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

insert into public.client_message_events (
  client_uuid, booking_id, event_type, channel, status, due_at,
  recipient_name, recipient_email, recipient_phone, payload
)
select
  gen_random_uuid(),
  b.id,
  'late_return',
  case when c.email is not null and trim(c.email) <> '' then 'email' else 'whatsapp_draft' end,
  'pending',
  b.return_at + interval '30 minutes',
  c.name, c.email, c.phone,
  jsonb_build_object('booking_no', b.booking_no, 'return_at', b.return_at)
from public.bookings b
join public.clients c on c.id = b.client_id
where b.stage in ('Booked', 'Packed')
  and b.return_at is not null
  and b.cancelled_at is null
on conflict (booking_id, event_type, coalesce(finding_id, '00000000-0000-0000-0000-000000000000'::uuid))
do nothing;

commit;
