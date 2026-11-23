-- Migration 0268: Server-side sign-in audit and new-device alert engine (T1-18 / B22 / B23 / B54)
--
-- Security card:
-- 1. Persistent append-only sign_in_events table tracking sign-ins, failed attempts, PIN switches, and new devices.
-- 2. Strictly role-gated RLS: readable by Owner and Admin only (B22). Manager, Coordinator, and Floor get 0 rows.
-- 3. Direct client writes (INSERT/UPDATE/DELETE) blocked; written exclusively via SECURITY DEFINER RPC.
-- 4. New-device alert logic: Owner and Admin accounts signing in from an unseen device_hash emit a new_device
--    event and trigger alert metadata (B23). Coordinator and floor accounts never trigger email alerts.
-- 5. No secrets, passwords, tokens, or PINs are ever persisted (N-8).

begin;

-- 1. Table for sign-in audit events
create table if not exists public.sign_in_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  device_hash text not null,
  user_agent text,
  ip_address text,
  kind text not null check (kind in ('sign-in', 'failed', 'pin_switch', 'new_device')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for device lookup and user timeline
create index if not exists idx_sign_in_events_user_device on public.sign_in_events (user_id, device_hash);
create index if not exists idx_sign_in_events_created_at on public.sign_in_events (created_at desc);

-- Enable RLS
alter table public.sign_in_events enable row level security;

-- Policy: Only Owner and Admin can read sign-in events (B22)
drop policy if exists sign_in_events_owner_admin_select on public.sign_in_events;
create policy sign_in_events_owner_admin_select on public.sign_in_events
  for select to authenticated
  using (public.auth_user_role() in ('Owner', 'Admin'));

-- Direct write immutability trigger
create or replace function public.prevent_direct_sign_in_events_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.allow_sign_in_events_write', true) is distinct from 'true' then
    raise exception 'GATE:gate.audit.immutable|Direct insert into sign_in_events is forbidden; use record_sign_in_event().' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_direct_sign_in_events_write on public.sign_in_events;
create trigger trg_prevent_direct_sign_in_events_write
before insert on public.sign_in_events
for each row execute function public.prevent_direct_sign_in_events_write();

-- No direct client writes permitted (Law 3, Law 8, immutable audit trail)
revoke all on public.sign_in_events from public, anon;
grant select on public.sign_in_events to authenticated;

-- 2. SECURITY DEFINER RPC: record_sign_in_event (Full signature)
create or replace function public.record_sign_in_event(
  p_device_hash text,
  p_user_agent text,
  p_ip_address text,
  p_kind text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_id uuid;
  v_caller_role text;
  v_device_known boolean := false;
  v_is_new_device boolean := false;
  v_should_alert boolean := false;
  v_new_event_id uuid;
begin
  v_caller_id := public.auth_user_id();
  v_caller_role := public.auth_user_role();

  if v_caller_id is null then
    raise exception 'GATE:gate.auth.unauthenticated|Authentication required to log sign-in event.' using errcode = '42501';
  end if;

  if p_kind not in ('sign-in', 'failed', 'pin_switch', 'new_device') then
    raise exception 'GATE:gate.audit.invalid_kind|Invalid sign-in event kind.' using errcode = '22023';
  end if;

  -- Allow write through trigger for this transaction
  perform set_config('app.allow_sign_in_events_write', 'true', true);

  -- New device evaluation for Owner and Admin (B23)
  if v_caller_role in ('Owner', 'Admin') and p_kind = 'sign-in' then
    select exists (
      select 1
      from public.sign_in_events
      where user_id = v_caller_id
        and device_hash = p_device_hash
        and kind in ('sign-in', 'new_device')
    ) into v_device_known;

    if not v_device_known then
      v_is_new_device := true;
      v_should_alert := true;
    end if;
  end if;

  -- Insert primary event row
  insert into public.sign_in_events (user_id, device_hash, user_agent, ip_address, kind, metadata)
  values (v_caller_id, p_device_hash, p_user_agent, p_ip_address, p_kind, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_new_event_id;

  -- If this is a newly observed device for Owner or Admin, record the dedicated new_device event
  if v_is_new_device then
    insert into public.sign_in_events (user_id, device_hash, user_agent, ip_address, kind, metadata)
    values (
      v_caller_id,
      p_device_hash,
      p_user_agent,
      p_ip_address,
      'new_device',
      jsonb_build_object(
        'triggered_by_event_id', v_new_event_id,
        'alert_dispatched', true,
        'role', v_caller_role
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', v_new_event_id,
    'is_new_device', v_is_new_device,
    'should_alert', v_should_alert,
    'user_role', v_caller_role
  );
end;
$$;

-- Convenience 3-argument overload
create or replace function public.record_sign_in_event(
  p_device_hash text,
  p_user_agent text,
  p_ip_address text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.record_sign_in_event(p_device_hash, p_user_agent, p_ip_address, 'sign-in'::text, '{}'::jsonb);
$$;

revoke all on function public.record_sign_in_event(text, text, text, text, jsonb) from public, anon;
grant execute on function public.record_sign_in_event(text, text, text, text, jsonb) to authenticated;

revoke all on function public.record_sign_in_event(text, text, text) from public, anon;
grant execute on function public.record_sign_in_event(text, text, text) to authenticated;

-- 3. Query RPC: get_recent_sign_in_events (Owner and Admin only, B22)
create or replace function public.get_recent_sign_in_events(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role text;
  v_result jsonb;
  v_clamped_limit int;
begin
  v_caller_role := public.auth_user_role();
  if v_caller_role not in ('Owner', 'Admin') then
    raise exception 'GATE:gate.settings.role|Only Owner or Admin can view sign-in audit history.' using errcode = '42501';
  end if;

  v_clamped_limit := least(greatest(coalesce(p_limit, 50), 1), 200);

  select jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'user_id', e.user_id,
      'full_name', u.full_name,
      'role', u.primary_role,
      'device_hash', e.device_hash,
      'user_agent', e.user_agent,
      'ip_address', e.ip_address,
      'kind', e.kind,
      'metadata', e.metadata,
      'created_at', e.created_at
    ) order by e.created_at desc
  ) into v_result
  from (
    select *
    from public.sign_in_events
    order by created_at desc
    limit v_clamped_limit
  ) e
  join public.users u on u.id = e.user_id;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_recent_sign_in_events(int) from public, anon;
grant execute on function public.get_recent_sign_in_events(int) to authenticated;

commit;
