-- Migration 0217: Notification preferences (T5-05)
-- =============================================================================
-- Ruling / Prompt T5-05:
-- Settings ▸ My preferences: per type, in-app on/off and email on/off;
-- the morning digest on by default.
-- Turning a type off stops new rows of that type for that user only.
--
-- Law 3: Hard delete forbidden.
-- Law 8: client_uuid on every row.
-- RLS: Own rows only (Owner / Admin can read).
-- Search paths pinned, anon execution revoked (check:pglite compliance).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Table: public.notification_preferences
-- -----------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  id                  uuid primary key default gen_random_uuid(),
  client_uuid         uuid unique default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  notification_type   text not null,
  in_app_enabled      boolean not null default true,
  email_enabled       boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_notification_preferences_user_type unique (user_id, notification_type)
);

comment on table public.notification_preferences is
  'Per-user notification delivery preferences (in-app & email) across notification categories (T5-05).';

create index if not exists idx_notification_preferences_user
  on public.notification_preferences(user_id);
create index if not exists idx_notification_preferences_lookup
  on public.notification_preferences(user_id, notification_type);

-- -----------------------------------------------------------------------------
-- 2. Law 3: Hard delete forbidden
-- -----------------------------------------------------------------------------
create or replace function public.trg_notification_preferences_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): notification preferences cannot be deleted, only updated.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_notification_preferences_prevent_delete on public.notification_preferences;
create trigger trg_notification_preferences_prevent_delete
  before delete on public.notification_preferences
  for each statement execute function public.trg_notification_preferences_prevent_delete_fn();

revoke all on function public.trg_notification_preferences_prevent_delete_fn() from public, anon;
grant execute on function public.trg_notification_preferences_prevent_delete_fn() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select
  to authenticated
  using (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
  for insert
  to authenticated
  with check (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
  for update
  to authenticated
  using (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  )
  with check (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists notification_preferences_delete on public.notification_preferences;
create policy notification_preferences_delete on public.notification_preferences
  for delete
  to authenticated
  using (
    user_id = public.auth_user_id()
    or public.auth_user_role() in ('Owner', 'Admin')
  );

revoke all on public.notification_preferences from public, anon;
grant select, insert, update, delete on public.notification_preferences to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Security barrier view: public.notification_preferences_v
-- -----------------------------------------------------------------------------
create or replace view public.notification_preferences_v with (security_barrier = true) as
select
  p.id,
  p.client_uuid,
  p.user_id,
  p.notification_type,
  p.in_app_enabled,
  p.email_enabled,
  p.created_at,
  p.updated_at
from public.notification_preferences p
where (
  p.user_id = public.auth_user_id()
  or public.auth_user_role() in ('Owner', 'Admin')
);

revoke all on public.notification_preferences_v from public, anon;
grant select on public.notification_preferences_v to authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC: set_notification_preference (explicit user_id + client_uuid)
-- -----------------------------------------------------------------------------
create or replace function public.set_notification_preference(
  p_client_uuid uuid,
  p_user_id uuid,
  p_notification_type text,
  p_in_app boolean,
  p_email boolean
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid;
  v_pref public.notification_preferences;
  v_type text;
begin
  v_caller := public.auth_user_id();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'user_id cannot be null' using errcode = '23502';
  end if;

  if p_user_id <> v_caller and public.auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'Access denied: cannot modify preferences for other users' using errcode = '42501';
  end if;

  v_type := lower(btrim(p_notification_type));
  if v_type = '' then
    raise exception 'notification_type cannot be blank' using errcode = '22023';
  end if;

  insert into public.notification_preferences (
    client_uuid,
    user_id,
    notification_type,
    in_app_enabled,
    email_enabled,
    updated_at
  ) values (
    coalesce(p_client_uuid, gen_random_uuid()),
    p_user_id,
    v_type,
    p_in_app,
    p_email,
    now()
  )
  on conflict (user_id, notification_type) do update
  set in_app_enabled = excluded.in_app_enabled,
      email_enabled  = excluded.email_enabled,
      updated_at     = now()
  returning * into v_pref;

  return v_pref;
end;
$$;

revoke all on function public.set_notification_preference(uuid, uuid, text, boolean, boolean) from public, anon;
grant execute on function public.set_notification_preference(uuid, uuid, text, boolean, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC: get_user_notification_preferences
-- Returns configured preferences or role defaults for all 7 categories.
-- -----------------------------------------------------------------------------
create or replace function public.get_user_notification_preferences(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid;
  v_role text;
  v_categories text[] := array['payment', 'handover', 'damage', 'delivery', 'booking', 'digest', 'general'];
  v_cat text;
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_in_app boolean;
  v_email boolean;
begin
  v_caller := public.auth_user_id();
  if v_caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'p_user_id cannot be null' using errcode = '23502';
  end if;

  if p_user_id <> v_caller and public.auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'Access denied: cannot view preferences for other users' using errcode = '42501';
  end if;

  select primary_role::text into v_role from public.users where id = p_user_id;

  foreach v_cat in array v_categories loop
    select in_app_enabled, email_enabled
    into v_row
    from public.notification_preferences
    where user_id = p_user_id
      and notification_type = v_cat;

    if found then
      v_in_app := v_row.in_app_enabled;
      v_email  := v_row.email_enabled;
    else
      -- 21 Jul lock defaults:
      -- In-app on for all categories
      v_in_app := true;
      -- Email: digest is true by default (O-4); other categories default false for staff
      v_email := (v_cat = 'digest');
    end if;

    v_result := v_result || jsonb_build_object(
      'category', v_cat,
      'notification_type', v_cat,
      'in_app_enabled', v_in_app,
      'email_enabled', v_email,
      'is_default', not found
    );
  end loop;

  return jsonb_build_object(
    'user_id', p_user_id,
    'preferences', v_result
  );
end;
$$;

revoke all on function public.get_user_notification_preferences(uuid) from public, anon;
grant execute on function public.get_user_notification_preferences(uuid) to authenticated;

-- Overload for current user
create or replace function public.get_my_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.get_user_notification_preferences(public.auth_user_id());
end;
$$;

revoke all on function public.get_my_notification_preferences() from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Update create_notification to respect notification_preferences (T5-05)
-- Turning a type off stops new rows of that type for that user only.
-- -----------------------------------------------------------------------------
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
  v_notification public.notifications;
  v_role text;
  v_notif_no text;
  v_type text;
begin
  if p_user_id is null then
    raise exception 'Notification recipient (user_id) cannot be null'
      using errcode = '23502';
  end if;

  v_type := coalesce(nullif(btrim(p_type), ''), 'general');

  -- T5-05 Gate: check if user has muted in-app notifications for this type
  if exists (
    select 1
    from public.notification_preferences np
    where np.user_id = p_user_id
      and np.notification_type = v_type
      and np.in_app_enabled = false
  ) then
    -- User opted out of in-app notifications for this category; do not create row
    return null;
  end if;

  select primary_role::text into v_role from public.users where id = p_user_id;

  if public.auth_is_staff() = false then
    if p_user_id <> public.auth_user_id() then
      raise exception 'Access denied: cannot create notifications for other users'
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
    coalesce(p_client_uuid, gen_random_uuid()),
    v_notif_no,
    p_user_id,
    v_role,
    v_type,
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

commit;
