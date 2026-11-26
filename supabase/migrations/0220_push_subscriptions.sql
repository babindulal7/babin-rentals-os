-- =============================================================================
-- 0220_push_subscriptions.sql — Phone Pop-ups & Web Push Subscriptions (T5-09)
--
-- Rulings:
--   - W62: Pop-up alerts on phones and iPad for four events:
--       1. late return (at 30 min, to all staff on shift at once — W38, W39)
--       2. new online booking request
--       3. online payment received
--       4. damage found
--   - Law 6: Zero figures for money-blind roles (Warehouse, Technician, Driver, Client).
--       Money roles see amounts; floor roles receive the identical alert without figures.
--   - Law 3: Hard delete forbidden. Deactivate via is_active = false.
--   - Law 4: Subscription updates maintain audit and activity tracking.
--   - Law 8: client_uuid on all records.
--   - RLS: Own rows only for non-admin users.
-- =============================================================================

begin;

-- 1. Create push_subscriptions table
create table if not exists public.push_subscriptions (
  id                  uuid        not null default gen_random_uuid() primary key,
  client_uuid         uuid        not null default gen_random_uuid(),
  user_id             uuid        not null references public.users(id) on delete cascade,
  endpoint            text        not null,
  p256dh              text        not null,
  auth                text        not null,
  device_label        text,
  user_agent          text,
  is_active           boolean     not null default true,
  last_seen_at        timestamptz not null default clock_timestamp(),
  created_at          timestamptz not null default clock_timestamp(),
  updated_at          timestamptz not null default clock_timestamp(),

  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_client_uuid_key unique (client_uuid)
);

comment on table public.push_subscriptions is
  'Web Push subscriptions for staff devices (phones, iPad, desktop) (W62, T5-09). Own rows only (RLS). Soft deactivation only (Law 3).';

comment on column public.push_subscriptions.endpoint is
  'Unique Web Push subscription endpoint URL issued by browser push service.';

comment on column public.push_subscriptions.device_label is
  'Human-friendly label of client device, e.g. iPhone 17 Pro, M4 iPad, Chrome Desktop.';

-- Indexes
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists idx_push_subscriptions_active on public.push_subscriptions (user_id) where is_active = true;
create index if not exists idx_push_subscriptions_endpoint on public.push_subscriptions (endpoint);

-- Grants
revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- 2. Law 3: Prevent hard deletes
create or replace function public.trg_push_subscriptions_prevent_delete_fn()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): push_subscriptions cannot be deleted. Set is_active = false.'
    using errcode = '55000';
end;
$$;

drop trigger if exists trg_push_subscriptions_prevent_delete on public.push_subscriptions;
create trigger trg_push_subscriptions_prevent_delete
  before delete on public.push_subscriptions
  for each statement execute function public.trg_push_subscriptions_prevent_delete_fn();

revoke all on function public.trg_push_subscriptions_prevent_delete_fn() from public, anon;
grant execute on function public.trg_push_subscriptions_prevent_delete_fn() to authenticated;

-- 3. Row Level Security: Own rows only
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (
    user_id = public.auth_user_id()
  );

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  )
  with check (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  );

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (
    user_id = public.auth_user_id() or
    public.auth_user_role() in ('Owner', 'Admin')
  );

-- 4. View: push_subscriptions_v (masked keys for display / inspection)
create or replace view public.push_subscriptions_v as
select
  s.id,
  s.client_uuid,
  s.user_id,
  u.full_name as user_name,
  u.primary_role as user_role,
  s.endpoint,
  s.device_label,
  s.user_agent,
  s.is_active,
  s.last_seen_at,
  s.created_at,
  s.updated_at
from public.push_subscriptions s
join public.users u on u.id = s.user_id
where
  s.user_id = public.auth_user_id() or
  public.auth_user_role() in ('Owner', 'Admin');

comment on view public.push_subscriptions_v is
  'Staff push subscriptions view for settings and device management. Secret crypto keys (p256dh, auth) are excluded.';

revoke all on public.push_subscriptions_v from public, anon;
grant select on public.push_subscriptions_v to authenticated;

-- 5. RPC: register_push_subscription
create or replace function public.register_push_subscription(
  p_client_uuid   uuid,
  p_endpoint      text,
  p_p256dh        text,
  p_auth          text,
  p_device_label  text default null,
  p_user_agent    text default null
) returns public.push_subscriptions language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_row public.push_subscriptions;
begin
  v_user_id := public.auth_user_id();
  if v_user_id is null then
    raise exception 'A signed-in user session is required to register a push subscription'
      using errcode = '42501';
  end if;

  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'Push endpoint cannot be blank'
      using errcode = '23502';
  end if;

  if p_p256dh is null or btrim(p_p256dh) = '' or p_auth is null or btrim(p_auth) = '' then
    raise exception 'Push subscription keys (p256dh and auth) cannot be blank'
      using errcode = '23502';
  end if;

  insert into public.push_subscriptions (
    client_uuid,
    user_id,
    endpoint,
    p256dh,
    auth,
    device_label,
    user_agent,
    is_active,
    last_seen_at,
    updated_at
  ) values (
    coalesce(p_client_uuid, gen_random_uuid()),
    v_user_id,
    btrim(p_endpoint),
    btrim(p_p256dh),
    btrim(p_auth),
    nullif(btrim(p_device_label), ''),
    nullif(btrim(p_user_agent), ''),
    true,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (endpoint) do update
  set
    user_id = v_user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    device_label = coalesce(excluded.device_label, push_subscriptions.device_label),
    user_agent = coalesce(excluded.user_agent, push_subscriptions.user_agent),
    is_active = true,
    last_seen_at = clock_timestamp(),
    updated_at = clock_timestamp()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.register_push_subscription(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(uuid, text, text, text, text, text) to authenticated;

-- 6. RPC: unregister_push_subscription (soft deactivate, Law 3)
create or replace function public.unregister_push_subscription(
  p_endpoint text
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_updated int := 0;
begin
  v_user_id := public.auth_user_id();
  if v_user_id is null then
    raise exception 'A signed-in user session is required to unregister a push subscription'
      using errcode = '42501';
  end if;

  update public.push_subscriptions
  set
    is_active = false,
    updated_at = clock_timestamp()
  where endpoint = btrim(p_endpoint)
    and (user_id = v_user_id or public.auth_user_role() in ('Owner', 'Admin'));

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- 7. RPC: get_push_notifications_for_event
-- Resolves active push subscriptions for targeted staff roles,
-- filtering by notification preferences and strictly enforcing Law 6 money blindness.
create or replace function public.get_push_notifications_for_event(
  p_event_type text,
  p_payload    jsonb
) returns table (
  subscription_id   uuid,
  user_id           uuid,
  user_role         text,
  endpoint          text,
  p256dh            text,
  auth              text,
  title             text,
  body              text,
  link_url          text,
  tag               text,
  severity          text
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pref_category text;
  v_amount_paisa bigint;
  v_amount_str text;
begin
  -- Validate event type (W62: four events)
  if p_event_type not in ('late_return', 'new_online_request', 'payment_received', 'damage_found') then
    raise exception 'Invalid push event type: %. Must be one of: late_return, new_online_request, payment_received, damage_found', p_event_type
      using errcode = '22023';
  end if;

  -- Map event type to notification preference category (T5-05)
  v_pref_category := case p_event_type
    when 'late_return' then 'overdue'
    when 'new_online_request' then 'bookings'
    when 'payment_received' then 'payments'
    when 'damage_found' then 'damage'
    else 'general'
  end;

  return query
  select
    s.id as subscription_id,
    s.user_id,
    u.primary_role::text as user_role,
    s.endpoint,
    s.p256dh,
    s.auth,
    -- Title per event
    case p_event_type
      when 'late_return' then
        'Late return: ' || coalesce(p_payload->>'booking_no', 'Booking')
      when 'new_online_request' then
        'New online booking request'
      when 'payment_received' then
        'Online payment received'
      when 'damage_found' then
        'Damage reported'
      else
        'Babin Rentals alert'
    end as title,
    -- Body per event + Law 6 money blindness
    case p_event_type
      when 'late_return' then
        -- Floor roles: zero money
        case when lower(u.primary_role::text) in ('warehouse', 'technician', 'driver', 'client') then
          'Booking ' || coalesce(p_payload->>'booking_no', 'BK') || ' is 30m overdue for return. Check counter.'
        else
          case when (p_payload->>'outstanding_paisa')::bigint > 0 then
            'Booking ' || coalesce(p_payload->>'booking_no', 'BK') || ' is 30m overdue for return. Balance owed: Rs ' || to_char(((p_payload->>'outstanding_paisa')::bigint / 100), 'FM999,999,990') || '.'
          else
            'Booking ' || coalesce(p_payload->>'booking_no', 'BK') || ' is 30m overdue for return. Check counter.'
          end
        end

      when 'new_online_request' then
        -- Floor roles: zero money
        case when lower(u.primary_role::text) in ('warehouse', 'technician', 'driver', 'client') then
          'New request from ' || coalesce(p_payload->>'client_name', 'Client') || ' for ' || coalesce(p_payload->>'item_count', 'gear') || ' items.'
        else
          case when (p_payload->>'total_paisa')::bigint > 0 then
            'New request from ' || coalesce(p_payload->>'client_name', 'Client') || ' (Rs ' || to_char(((p_payload->>'total_paisa')::bigint / 100), 'FM999,999,990') || ').'
          else
            'New request from ' || coalesce(p_payload->>'client_name', 'Client') || '.'
          end
        end

      when 'payment_received' then
        -- Floor roles: zero money (Law 6)
        case when lower(u.primary_role::text) in ('warehouse', 'technician', 'driver', 'client') then
          'Payment received for booking ' || coalesce(p_payload->>'booking_no', 'BK') || '.'
        else
          'Payment received: Rs ' || to_char((coalesce((p_payload->>'amount_paisa')::bigint, 0) / 100), 'FM999,999,990') || ' for ' || coalesce(p_payload->>'booking_no', 'booking') || '.'
        end

      when 'damage_found' then
        'Damage reported on ' || coalesce(p_payload->>'item_name', 'gear') || ': ' || coalesce(p_payload->>'description', 'Issue flagged for inspection') || '.'

      else
        'You have a new update in Babin Rentals.'
    end as body,

    -- Link URL to open the specific record
    case p_event_type
      when 'late_return' then
        '/rentals/' || coalesce(p_payload->>'booking_id', '')
      when 'new_online_request' then
        '/rentals/' || coalesce(p_payload->>'booking_id', '')
      when 'payment_received' then
        '/finance/payments'
      when 'damage_found' then
        '/inventory/damage/' || coalesce(p_payload->>'finding_id', '')
      else
        '/today'
    end as link_url,

    -- Notification Tag for grouping / deduplication
    p_event_type || '-' || coalesce(p_payload->>'entity_id', p_payload->>'booking_id', p_payload->>'finding_id', p_payload->>'payment_id', 'general') as tag,

    -- Severity
    case p_event_type
      when 'late_return' then 'Warning'
      when 'damage_found' then 'Warning'
      else 'Information'
    end as severity

  from public.push_subscriptions s
  join public.users u on u.id = s.user_id
  where s.is_active = true
    -- Target roles per event
    and (
      -- late_return goes to ALL staff on shift at once (W38, W39)
      (p_event_type = 'late_return' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'coordinator', 'warehouse', 'technician', 'driver', 'accounts'))
      -- new_online_request goes to booking & operations management
      or (p_event_type = 'new_online_request' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'coordinator'))
      -- payment_received goes to finance and management roles, plus operational floor roles
      or (p_event_type = 'payment_received' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'accounts', 'coordinator', 'warehouse'))
      -- damage_found goes to floor, maintenance and management roles
      or (p_event_type = 'damage_found' and lower(u.primary_role::text) in ('owner', 'admin', 'manager', 'coordinator', 'warehouse', 'technician'))
    )
    -- Check notification preferences (T5-05): if user disabled in-app / push for this category, skip
    and not exists (
      select 1 from public.notification_preferences np
      where np.user_id = s.user_id
        and np.notification_type = v_pref_category
        and np.in_app_enabled = false
    );
end;
$$;

revoke all on function public.get_push_notifications_for_event(text, jsonb) from public, anon;
grant execute on function public.get_push_notifications_for_event(text, jsonb) to authenticated;

commit;
