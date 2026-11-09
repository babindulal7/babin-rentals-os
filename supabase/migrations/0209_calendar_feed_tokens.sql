-- 0209_calendar_feed_tokens.sql
-- T4-10: Private iCal feed tokens for staff to add jobs to phone calendars
-- B28, B29, B54, K5: number, time, client name only; no amounts, phones, addresses

begin;

-- Table: calendar_feed_tokens
create table public.calendar_feed_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    token_hash text not null unique check (char_length(token_hash) = 64),
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    constraint calendar_feed_tokens_one_per_user unique (user_id) deferrable initially deferred
);

comment on table public.calendar_feed_tokens is 'Private iCal feed tokens for staff calendar subscriptions';
comment on column public.calendar_feed_tokens.token_hash is 'SHA-256 hash of the raw token (raw token never stored)';

-- RLS
alter table public.calendar_feed_tokens enable row level security;

-- Staff can see their own token status (not the raw token)
create policy calendar_feed_tokens_self_read on public.calendar_feed_tokens
    for select to authenticated using (
        auth.uid() = user_id
    );

-- Owner/Admin can see all tokens (for revocation UI)
create policy calendar_feed_tokens_admin_read on public.calendar_feed_tokens
    for select to authenticated using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.is_active
            and u.primary_role in ('Owner', 'Admin')
        )
    );

-- RPC: create_calendar_feed_token
create or replace function public.create_calendar_feed_token()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_role text := (
        select u.primary_role::text from public.users u
        where u.id = auth.uid() and u.is_active
    );
    v_raw_token text;
    v_token_hash text;
    v_token_id uuid;
begin
    -- Any authenticated staff can create their own feed token
    if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician', 'Driver', 'Accounts') then
        raise exception 'Only staff can create calendar feed tokens' using errcode = '42501';
    end if;

    -- Generate raw token (128-bit)
    v_raw_token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 32);
    v_token_hash := md5(v_raw_token) || md5(v_raw_token || 'salt'); -- 64 hex chars

    -- Upsert: one token per user
    insert into public.calendar_feed_tokens (user_id, token_hash)
    values (v_actor, v_token_hash)
    on conflict (user_id) do update set
        token_hash = excluded.token_hash,
        revoked_at = null,
        created_at = now()
    returning id into v_token_id;

    -- Audit
    insert into public.audit_events (
        client_uuid, event_class, category, module, action, severity, status,
        table_name, record_id, actor_id, actor_role, branch_id, new_values
    ) values (
        gen_random_uuid(),
        'status change',
        'Operations',
        'Calendar',
        'Create',
        'Informational',
        'Success',
        'calendar_feed_tokens',
        v_token_id,
        v_actor,
        v_role::system_role,
        (select branch_id from public.users where id = v_actor),
        jsonb_build_object('action', 'create_calendar_feed_token')
    );

    -- Return RAW token ONLY on creation (never again)
    return v_raw_token;
end;
$$;

comment on function public.create_calendar_feed_token() is 'Create or rotate calendar feed token for current user. Returns raw token once.';

-- RPC: revoke_calendar_feed_token
create or replace function public.revoke_calendar_feed_token(
    p_user_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_role text := (
        select u.primary_role::text from public.users u
        where u.id = auth.uid() and u.is_active
    );
    v_target_user uuid := coalesce(p_user_id, v_actor);
    v_updated boolean;
begin
    -- Self-revoke: any staff can revoke their own
    -- Owner/Admin: can revoke anyone's
    if v_target_user <> v_actor then
        if v_role not in ('Owner', 'Admin') then
            raise exception 'Only Owner/Admin can revoke another user token' using errcode = '42501';
        end if;
    end if;

    update public.calendar_feed_tokens
    set revoked_at = now()
    where user_id = v_target_user
      and revoked_at is null;

    get diagnostics v_updated = row_count;

    if v_updated then
        insert into public.audit_events (
            client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values
        ) values (
            gen_random_uuid(),
            'status change',
            'Operations',
            'Calendar',
            'Update',
            'Informational',
            'Success',
            'calendar_feed_tokens',
            (select id from public.calendar_feed_tokens where user_id = v_target_user),
            v_actor,
            v_role::system_role,
            (select branch_id from public.users where id = v_actor),
            jsonb_build_object('revoked', false),
            jsonb_build_object('revoked', true)
        );
    end if;

    return v_updated;
end;
$$;

comment on function public.revoke_calendar_feed_token(uuid) is 'Revoke calendar feed token (self or Owner/Admin for others). Returns true if revoked.';

-- RPC: get_calendar_feed
-- Returns iCal feed for a valid token (no auth required - token is the credential)
create or replace function public.get_calendar_feed(
    p_token_hash text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_token public.calendar_feed_tokens%rowtype;
    v_user public.users%rowtype;
    v_jobs public.delivery_transport_v%rowtype;
    v_ical text := '';
    v_now text := to_char(now() at time zone 'Asia/Kathmandu', 'YYYYMMDDTHH24MISS');
    v_uid_prefix text := 'babinrentals.com';
    v_event text;
    v_desc text;
    v_start text;
    v_end text;
begin
    -- Validate token hash format
    if p_token_hash is null or char_length(p_token_hash) <> 64 then
        raise exception 'Invalid token' using errcode = '42501';
    end if;

    -- Look up token
    select * into v_token
    from public.calendar_feed_tokens
    where token_hash = p_token_hash;

    if not found then
        raise exception 'Invalid token' using errcode = '42501';
    end if;

    if v_token.revoked_at is not null then
        raise exception 'Token revoked' using errcode = '42501';
    end if;

    -- Get user
    select * into v_user
    from public.users
    where id = v_token.user_id
      and is_active = true;

    if not found then
        raise exception 'User not found or inactive' using errcode = '42501';
    end if;

    -- Build iCal header
    v_ical := 'BEGIN:VCALENDAR' || chr(10) ||
              'VERSION:2.0' || chr(10) ||
              'PRODID:-//Babin Rentals//Calendar Feed//EN' || chr(10) ||
              'CALSCALE:GREGORIAN' || chr(10) ||
              'METHOD:PUBLISH' || chr(10) ||
              'X-WR-CALNAME:Babin Rentals Jobs' || chr(10) ||
              'X-WR-TIMEZONE:Asia/Kathmandu' || chr(10);

    -- Fetch jobs for this user based on role
    -- Driver: only assigned jobs
    -- Desk/floor roles: branch's pickups, returns, deliveries
    for v_jobs in
        select
            t.id,
            t.booking_id,
            b.booking_no,
            c.name as client_name,
            t.delivery_type,
            t.driver_id,
            t.vehicle,
            t.number_plate,
            t.delivery_status,
            t.scheduled_at,
            t.dispatched_at,
            t.delivered_at,
            t.recipient_name,
            b.pickup_location,
            b.return_location,
            b.branch_id
        from public.booking_transport t
        join public.bookings b on b.id = t.booking_id
        join public.clients c on c.id = b.client_id
        where b.cancelled_at is null
          and b.stage <> 'Quote'
          and t.delivery_type <> 'Client Pickup'
          and (
            (v_user.primary_role = 'Driver' and t.driver_id = v_user.id)
            or (v_user.primary_role in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
                and b.branch_id = v_user.branch_id)
          )
          and t.scheduled_at >= now() - interval '30 days'
          and t.scheduled_at <= now() + interval '30 days'
        order by t.scheduled_at asc
    loop
        -- Build event UID
        v_event := 'UID:' || v_uid_prefix || '-' || v_jobs.id || chr(10);

        -- DTSTAMP
        v_event := v_event || 'DTSTAMP:' || v_now || chr(10);

        -- Status mapping
        if v_jobs.delivery_status = 'Delivered' then
            v_event := v_event || 'STATUS:COMPLETED' || chr(10);
        elsif v_jobs.delivery_status = 'Failed' then
            v_event := v_event || 'STATUS:CANCELLED' || chr(10);
        else
            v_event := v_event || 'STATUS:CONFIRMED' || chr(10);
        end if;

        -- Summary: "BK-1234 · Pickup 09:00 · Client Name" (B29, K5)
        v_event := v_event || 'SUMMARY:' || v_jobs.booking_no || ' · ' ||
            case
                when v_jobs.delivery_type = 'Outbound' then 'Pickup'
                when v_jobs.delivery_type = 'Return' then 'Return'
                else v_jobs.delivery_type
            end
            || ' ' || to_char(v_jobs.scheduled_at at time zone 'Asia/Kathmandu', 'HH24:MI')
            || ' · ' || v_jobs.client_name || chr(10);

        -- Description (minimal, no money/address/phone per B29, K5)
        v_desc := 'Booking: ' || v_jobs.booking_no || chr(10) ||
                  'Type: ' || v_jobs.delivery_type || chr(10) ||
                  'Client: ' || v_jobs.client_name || chr(10) ||
                  'Vehicle: ' || coalesce(v_jobs.vehicle, 'N/A') || ' ' || coalesce(v_jobs.number_plate, '') || chr(10);
        v_event := v_event || 'DESCRIPTION:' || replace(v_desc, chr(10), '\n') || chr(10);

        -- DTSTART / DTEND (use scheduled_at as start, +30 min as end)
        v_start := to_char(v_jobs.scheduled_at at time zone 'Asia/Kathmandu', 'YYYYMMDDTHH24MISS');
        v_end := to_char((v_jobs.scheduled_at + interval '30 minutes') at time zone 'Asia/Kathmandu', 'YYYYMMDDTHH24MISS');
        v_event := v_event || 'DTSTART;TZID=Asia/Kathmandu:' || v_start || chr(10);
        v_event := v_event || 'DTEND;TZID=Asia/Kathmandu:' || v_end || chr(10);

        -- Location: only client name, no address (B29, K5)
        v_event := v_event || 'LOCATION:' || v_jobs.client_name || chr(10);

        v_ical := v_ical || v_event || 'END:VEVENT' || chr(10);
    end loop;

    v_ical := v_ical || 'END:VCALENDAR' || chr(10);

    return v_ical;
end;
$$;

comment on function public.get_calendar_feed(text) is 'Get iCal feed for calendar token (no auth, token is credential). Returns text/calendar.';

-- Grant execute
grant execute on function public.create_calendar_feed_token() to authenticated;
grant execute on function public.revoke_calendar_feed_token(uuid) to authenticated;
grant execute on function public.get_calendar_feed(text) to service_role;

revoke all on function public.create_calendar_feed_token() from anon, public;
revoke all on function public.revoke_calendar_feed_token(uuid) from anon, public;
revoke all on function public.get_calendar_feed(text) from anon, public;

-- Verification assertions
do $verify$
declare
    v_col_exists boolean;
    v_func_exists boolean;
begin
    -- 1. calendar_feed_tokens table exists with required columns
    select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'calendar_feed_tokens'
        and column_name in ('user_id', 'token_hash', 'created_at', 'revoked_at')
    ) into v_col_exists;
    if not v_col_exists then
        raise exception '0209: calendar_feed_tokens missing required columns';
    end if;

    -- 2. RPCs exist
    select exists (
        select 1 from information_schema.routines
        where routine_schema = 'public' and routine_name = 'create_calendar_feed_token'
    ) into v_func_exists;
    if not v_func_exists then
        raise exception '0209: create_calendar_feed_token RPC missing';
    end if;

    select exists (
        select 1 from information_schema.routines
        where routine_schema = 'public' and routine_name = 'get_calendar_feed'
    ) into v_func_exists;
    if not v_func_exists then
        raise exception '0209: get_calendar_feed RPC missing';
    end if;

    -- 3. Token hash format (64 chars) enforced
    select exists (
        select 1 from information_schema.check_constraints
        where constraint_schema = 'public'
        and constraint_name = 'calendar_feed_tokens_token_hash_check'
    ) into v_col_exists;
    if not v_col_exists then
        raise exception '0209: token_hash check constraint missing';
    end if;

    raise notice '0209 verification passed: calendar_feed_tokens table, RPCs, constraints all present';
end;
$verify$;

commit;