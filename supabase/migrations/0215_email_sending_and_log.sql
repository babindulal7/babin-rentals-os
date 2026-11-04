-- =============================================================================
-- 0215_email_sending_and_log.sql — Email sending service & audit log (T5-03)
--
-- Implements email audit logging and server-side payload building:
--   - Logs every sent/attempted email (template, recipient, entity, status).
--   - Privacy & security: strictly NO email body stored in email_log (W21, S13).
--   - Law 3: Hard delete forbidden (immutable log).
--   - Law 4: Records are immutable once dispatched.
--   - Law 6: Zero money in payloads for money-blind roles (Warehouse, Technician, Driver, Client).
--   - W80: Client templates are English only.
--   - RLS: Privileged staff (Owner, Admin, Manager, Accounts) view all; others view own rows only.
-- =============================================================================

begin;

-- 1. Create email_log table
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid unique default gen_random_uuid(),
  template_id text not null,
  recipient_email text not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id text,
  language text not null default 'en',
  status text not null check (status in ('pending', 'sent', 'failed', 'mock_sent')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.email_log is
  'Audit log of all transactional email dispatches. By design, no email body is retained.';

create index if not exists idx_email_log_recipient_user on public.email_log(recipient_user_id);
create index if not exists idx_email_log_created_at on public.email_log(created_at desc);
create index if not exists idx_email_log_entity on public.email_log(entity_type, entity_id);
create index if not exists idx_email_log_template on public.email_log(template_id);

-- 2. Law 3: Hard delete forbidden
create or replace function public.trg_email_log_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): email_log entries cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_email_log_prevent_delete on public.email_log;
create trigger trg_email_log_prevent_delete
  before delete on public.email_log
  for each row execute function public.trg_email_log_prevent_delete_fn();

revoke all on function public.trg_email_log_prevent_delete_fn() from public, anon;
grant execute on function public.trg_email_log_prevent_delete_fn() to authenticated;

-- 3. Law 4: Update guard (only transition from pending -> sent/failed permitted; immutable once complete)
create or replace function public.trg_email_log_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.status in ('sent', 'failed', 'mock_sent') then
    raise exception 'IMMUTABLE (Law 4): completed email_log rows cannot be modified.'
      using errcode = '42501';
  end if;

  if NEW.id <> OLD.id
     or NEW.client_uuid <> OLD.client_uuid
     or NEW.template_id <> OLD.template_id
     or NEW.recipient_email <> OLD.recipient_email
     or coalesce(NEW.recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(OLD.recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
     or coalesce(NEW.entity_type, '') <> coalesce(OLD.entity_type, '')
     or coalesce(NEW.entity_id, '') <> coalesce(OLD.entity_id, '')
     or NEW.created_at <> OLD.created_at then
    raise exception 'IMMUTABLE: only status, sent_at, error_message, and metadata may be updated on pending email_log rows'
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_email_log_update_guard on public.email_log;
create trigger trg_email_log_update_guard
  before update on public.email_log
  for each row execute function public.trg_email_log_update_guard_fn();

revoke all on function public.trg_email_log_update_guard_fn() from public, anon;
grant execute on function public.trg_email_log_update_guard_fn() to authenticated;

-- 4. Row Level Security policies
alter table public.email_log enable row level security;

drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select
  to authenticated
  using (
    (
      public.auth_is_staff()
      and public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts')
    )
    or (
      recipient_user_id = public.auth_user_id()
    )
  );

drop policy if exists email_log_insert on public.email_log;
create policy email_log_insert on public.email_log
  for insert
  to authenticated
  with check (
    public.auth_is_staff()
    or recipient_user_id = public.auth_user_id()
  );

drop policy if exists email_log_update on public.email_log;
create policy email_log_update on public.email_log
  for update
  to authenticated
  using (public.auth_is_staff())
  with check (public.auth_is_staff());

drop policy if exists email_log_delete on public.email_log;
create policy email_log_delete on public.email_log
  for delete
  to authenticated
  using (public.auth_is_staff());

revoke all on public.email_log from public, anon;
grant select, insert, update, delete on public.email_log to authenticated;

-- 5. View for active email log entries
create or replace view public.email_log_v with (security_barrier = true) as
select
  l.id,
  l.client_uuid,
  l.template_id,
  l.recipient_email,
  l.recipient_user_id,
  l.entity_type,
  l.entity_id,
  l.language,
  l.status,
  l.error_message,
  l.metadata,
  l.sent_at,
  l.created_at
from public.email_log l
where (
  (
    public.auth_is_staff()
    and public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts')
  )
  or l.recipient_user_id = public.auth_user_id()
);

revoke all on public.email_log_v from public, anon;
grant select on public.email_log_v to authenticated;

-- 6. RPC: record_email_send
create or replace function public.record_email_send(
  p_template_id text,
  p_recipient_email text,
  p_recipient_user_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_status text default 'sent',
  p_error text default null,
  p_language text default 'en',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_status not in ('pending', 'sent', 'failed', 'mock_sent') then
    raise exception 'Invalid status: %', p_status using errcode = '22023';
  end if;

  insert into public.email_log (
    template_id,
    recipient_email,
    recipient_user_id,
    entity_type,
    entity_id,
    language,
    status,
    error_message,
    metadata,
    sent_at
  ) values (
    p_template_id,
    p_recipient_email,
    p_recipient_user_id,
    p_entity_type,
    p_entity_id,
    coalesce(p_language, 'en'),
    p_status,
    p_error,
    coalesce(p_metadata, '{}'::jsonb),
    case when p_status in ('sent', 'mock_sent') then now() else null end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_email_send(text, text, uuid, text, text, text, text, text, jsonb) to authenticated;

-- 7. RPC: build_email_payload
-- Server-side rendering payload builder to stop client forgery and enforce Law 6.
create or replace function public.build_email_payload(
  p_template_id text,
  p_recipient_user_id uuid default null,
  p_entity_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_user_email text;
  v_user_name text;
  v_booking record;
  v_client record;
  v_payload jsonb;
begin
  -- Resolve recipient user details if provided
  if p_recipient_user_id is not null then
    select
      u.email,
      u.full_name,
      u.primary_role::text
    into v_user_email, v_user_name, v_role
    from public.users u
    where u.id = p_recipient_user_id;
  end if;

  -- Default recipient details from client if booking entity
  if (v_user_email is null or v_user_email = '') and p_entity_id is not null then
    select
      b.id,
      b.booking_no,
      b.stage,
      b.pickup_at,
      b.return_at,
      b.client_id
    into v_booking
    from public.bookings b
    where b.id::text = p_entity_id or b.booking_no = p_entity_id
    limit 1;

    if v_booking.client_id is not null then
      select
        c.id,
        c.name,
        c.email,
        c.phone
      into v_client
      from public.clients c
      where c.id = v_booking.client_id;

      if v_user_email is null or v_user_email = '' then
        v_user_email := v_client.email;
        v_user_name := v_client.name;
        v_role := 'Client';
      end if;
    end if;
  end if;

  -- Build payload according to template and role
  case p_template_id
    when 'pickup_reminder' then
      v_payload := jsonb_build_object(
        'template_id', 'pickup_reminder',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Pickup Reminder — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'start_date', coalesce(v_booking.pickup_at::text, ''),
          'end_date', coalesce(v_booking.return_at::text, '')
        )
      );

    when 'pickup_receipt' then
      v_payload := jsonb_build_object(
        'template_id', 'pickup_receipt',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Pickup Receipt — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'start_date', coalesce(v_booking.pickup_at::text, ''),
          'end_date', coalesce(v_booking.return_at::text, '')
        )
      );

    when 'return_reminder' then
      v_payload := jsonb_build_object(
        'template_id', 'return_reminder',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Return Reminder — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'end_date', coalesce(v_booking.return_at::text, '')
        )
      );

    when 'late_return' then
      v_payload := jsonb_build_object(
        'template_id', 'late_return',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Important: Overdue Return — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, '')
        )
      );

    when 'damage_notice' then
      -- W23: Notice of damage case opened — NEVER include amount for client or money-blind roles
      v_payload := jsonb_build_object(
        'template_id', 'damage_notice',
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'Client'),
        'subject', 'Equipment Condition Notice — ' || coalesce(v_booking.booking_no, 'Booking'),
        'data', jsonb_build_object(
          'booking_no', coalesce(v_booking.booking_no, ''),
          'status', 'Under Review'
        )
      );

    when 'test_template' then
      v_payload := jsonb_build_object(
        'template_id', 'test_template',
        'recipient_email', coalesce(v_user_email, 'test@example.com'),
        'recipient_name', coalesce(v_user_name, 'Test Recipient'),
        'subject', 'Babin Rentals — Test Email',
        'data', jsonb_build_object(
          'greeting', 'System verification test successful.'
        )
      );

    else
      v_payload := jsonb_build_object(
        'template_id', p_template_id,
        'recipient_email', coalesce(v_user_email, ''),
        'recipient_name', coalesce(v_user_name, 'User'),
        'subject', 'Babin Rentals Notification',
        'data', jsonb_build_object(
          'entity_id', coalesce(p_entity_id, '')
        )
      );
  end case;

  return v_payload;
end;
$$;

revoke all on function public.build_email_payload(text, uuid, text) from public, anon;
grant execute on function public.build_email_payload(text, uuid, text) to authenticated;

commit;
