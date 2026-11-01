-- =============================================================================
-- 0192_notification_records.sql — Notification records (T5-01)
--
-- Implements in-app notifications per 21 Jul lock:
--   - Role-based notifications (Coordinator -> bookings, Warehouse -> queues, Accounts -> payments).
--   - Law 6: Zero money in payloads or text for money-blind roles (Warehouse, Technician, Driver, Client).
--   - Law 3: Archive / mark-read, never delete.
--   - Law 8: client_uuid idempotency keys.
--   - RLS: Users can only read and mark-read their own notifications.
-- =============================================================================

begin;

-- 1. Extend notifications table
alter table public.notifications
  add column if not exists type text not null default 'general',
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists recipient_role text;

alter table public.notifications
  alter column notification_no set default ('NOTIF-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8));

update public.notifications n
set recipient_role = u.primary_role::text
from public.users u
where n.user_id = u.id and n.recipient_role is null;

create index if not exists idx_notifications_type on public.notifications(type);
create index if not exists idx_notifications_entity on public.notifications(entity_type, entity_id);

-- 2. Law 3: Hard delete forbidden
create or replace function public.trg_notifications_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): notifications cannot be deleted.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_notifications_prevent_delete on public.notifications;
create trigger trg_notifications_prevent_delete
  before delete on public.notifications
  for each row execute function public.trg_notifications_prevent_delete_fn();

revoke all on function public.trg_notifications_prevent_delete_fn() from public, anon;
grant execute on function public.trg_notifications_prevent_delete_fn() to authenticated;

-- 3. Immutability guard trigger: only is_read and read_at can be modified
create or replace function public.trg_notifications_update_guard_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if NEW.id <> OLD.id
     or NEW.client_uuid <> OLD.client_uuid
     or NEW.user_id <> OLD.user_id
     or NEW.title <> OLD.title
     or NEW.message <> OLD.message
     or NEW.type <> OLD.type
     or coalesce(NEW.entity_type, '') <> coalesce(OLD.entity_type, '')
     or coalesce(NEW.entity_id, '') <> coalesce(OLD.entity_id, '')
     or coalesce(NEW.link_url, '') <> coalesce(OLD.link_url, '') then
    raise exception 'IMMUTABLE: only read status (is_read, read_at) may be updated on notifications'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notifications_update_guard on public.notifications;
create trigger trg_notifications_update_guard
  before update on public.notifications
  for each row execute function public.trg_notifications_update_guard_fn();

revoke all on function public.trg_notifications_update_guard_fn() from public, anon;
grant execute on function public.trg_notifications_update_guard_fn() to authenticated;

-- 4. Row Level Security policies
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select
  to authenticated
  using (
    (
      user_id = public.auth_user_id()
      or public.auth_user_role() in ('Owner', 'Admin')
    )
    and public.auth_is_staff()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update
  to authenticated
  using (
    (
      user_id = public.auth_user_id()
      or public.auth_user_role() in ('Owner', 'Admin')
    )
    and public.auth_is_staff()
  )
  with check (
    (
      user_id = public.auth_user_id()
      or public.auth_user_role() in ('Owner', 'Admin')
    )
    and public.auth_is_staff()
  );

-- Delete policy to trigger Law 3 guard
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete
  to authenticated
  using (public.auth_is_staff());

grant select, update, delete on public.notifications to authenticated;

-- 5. View for active notifications
create or replace view public.notifications_v with (security_barrier = true) as
select
  n.id,
  n.client_uuid,
  n.notification_no,
  n.user_id,
  n.recipient_role,
  n.type,
  n.title,
  n.message,
  n.message as body,
  n.channel,
  n.severity,
  n.entity_type,
  n.entity_id,
  n.link_url,
  n.is_read,
  n.read_at,
  n.created_at
from public.notifications n
where (
    n.user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  )
  and public.auth_is_staff()
order by n.created_at desc;

revoke all on public.notifications_v from public, anon;
grant select on public.notifications_v to authenticated;

-- 6. RPC: Create notification
create or replace function public.create_notification(
  p_client_uuid uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_link_url text default null,
  p_severity alert_severity default 'Information'::alert_severity
)
returns public.notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_notification public.notifications;
  v_existing public.notifications;
  v_notif_no text;
begin
  if p_client_uuid is null then
    raise exception 'client_uuid is required (Law 8)';
  end if;

  select * into v_existing from public.notifications where client_uuid = p_client_uuid;
  if v_existing.id is not null then
    return v_existing;
  end if;

  select primary_role::text into v_role from public.users where id = p_user_id;
  if v_role is null then
    raise exception 'Recipient user not found';
  end if;

  -- Law 6 Enforcement Check: If recipient is money-blind, forbid currency symbols or amounts
  if v_role in ('Warehouse', 'Technician', 'Driver', 'Client') then
    if p_message ~* '(Rs\.?|paisa|NPR|[0-9]+,[0-9]{3}|[0-9]+\.[0-9]{2})' or p_title ~* '(Rs\.?|paisa|NPR)' then
      raise exception 'LAW 6 VIOLATION: Notification text for money-blind role % cannot contain monetary amounts', v_role
        using errcode = '42501';
    end if;
  end if;

  v_notif_no := 'NOTIF-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.notifications (
    client_uuid,
    notification_no,
    user_id,
    recipient_role,
    type,
    title,
    message,
    channel,
    severity,
    entity_type,
    entity_id,
    link_url,
    is_read,
    created_at
  ) values (
    p_client_uuid,
    v_notif_no,
    p_user_id,
    v_role,
    coalesce(nullif(btrim(p_type), ''), 'general'),
    btrim(p_title),
    btrim(p_message),
    'In-App'::channel_code,
    coalesce(p_severity, 'Information'::alert_severity),
    p_entity_type,
    p_entity_id,
    p_link_url,
    false,
    now()
  )
  returning * into v_notification;

  return v_notification;
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, text, text, text, text, text, alert_severity) from public, anon;
grant execute on function public.create_notification(uuid, uuid, text, text, text, text, text, text, alert_severity) to authenticated;

-- 7. RPC: Mark single notification read
create or replace function public.mark_notification_read(p_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_notification public.notifications;
begin
  update public.notifications
  set
    is_read = true,
    read_at = coalesce(read_at, now())
  where id = p_notification_id
    and (user_id = public.auth_user_id() or public.auth_user_role() in ('Owner', 'Admin'))
  returning * into v_notification;

  if v_notification.id is null then
    raise exception 'Notification not found or access denied';
  end if;

  return v_notification;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- 8. RPC: Mark all notifications read
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.notifications
    set
      is_read = true,
      read_at = coalesce(read_at, now())
    where user_id = public.auth_user_id()
      and is_read = false
    returning id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- 9. RPC: Notify staff (broadcast to staff members)
-- Builds separate messages for money roles and money-blind roles under Law 6.
create or replace function public.notify_staff(
  p_type text,
  p_title text,
  p_message_money text,
  p_message_money_blind text,
  p_link_url text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_severity alert_severity default 'Information'::alert_severity
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_count integer := 0;
  v_msg text;
begin
  for v_user in
    select id, primary_role::text as role
    from public.users
    where coalesce(is_active, true) = true
      and primary_role is not null
      and primary_role::text <> 'Client'
  loop
    if v_user.role in ('Warehouse', 'Technician', 'Driver', 'Client') then
      v_msg := coalesce(p_message_money_blind, 'Update: ' || p_title);
    else
      v_msg := coalesce(p_message_money, p_message_money_blind);
    end if;

    perform public.create_notification(
      gen_random_uuid(),
      v_user.id,
      p_type,
      p_title,
      v_msg,
      p_entity_type,
      p_entity_id,
      p_link_url,
      p_severity
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_staff(text, text, text, text, text, text, text, alert_severity) from public, anon;
grant execute on function public.notify_staff(text, text, text, text, text, text, text, alert_severity) to authenticated;

-- 10. Event triggers: Shift handover waiting & Damage case opened
create or replace function public.trg_shift_handover_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status = 'pending' then
    perform public.notify_staff(
      'shift_handover',
      'Shift Handover Waiting',
      'Shift ' || NEW.shift_code || ' handover by ' || NEW.from_user_name || ' waiting for review',
      'Shift ' || NEW.shift_code || ' handover by ' || NEW.from_user_name || ' waiting for review',
      '/notes',
      'shift_handover',
      NEW.id::text,
      'Information'::alert_severity
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_shift_handover_notify on public.shift_handovers;
create trigger trg_shift_handover_notify
  after insert on public.shift_handovers
  for each row execute function public.trg_shift_handover_notify_fn();

revoke all on function public.trg_shift_handover_notify_fn() from public, anon;
grant execute on function public.trg_shift_handover_notify_fn() to authenticated;

create or replace function public.trg_case_damage_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.type = 'Damage' then
    perform public.notify_staff(
      'damage_case',
      'Damage Case Opened',
      'Damage case ' || NEW.case_no || ' opened: ' || NEW.title,
      'Damage case ' || NEW.case_no || ' opened: ' || NEW.title,
      '/inventory',
      'case',
      NEW.id::text,
      'Warning'::alert_severity
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_case_damage_notify on public.cases;
create trigger trg_case_damage_notify
  after insert on public.cases
  for each row execute function public.trg_case_damage_notify_fn();

revoke all on function public.trg_case_damage_notify_fn() from public, anon;
grant execute on function public.trg_case_damage_notify_fn() to authenticated;

commit;
