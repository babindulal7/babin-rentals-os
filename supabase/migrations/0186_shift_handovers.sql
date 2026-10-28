-- 0186_shift_handovers.sql
-- Shift handovers for three-shift operational communication
-- T4-05: shift_handovers table + RPCs

create table if not exists public.shift_handovers (
    id uuid primary key default gen_random_uuid(),
    from_shift text not null check (from_shift in ('Morning','Afternoon','Night')),
    to_shift text not null check (to_shift in ('Morning','Afternoon','Night')),
    body text not null,
    outgoing_user_id uuid not null references auth.users(id),
    incoming_user_id uuid references auth.users(id),
    created_at timestamptz not null default now(),
    acknowledged_by uuid[] not null default '{}'::uuid[]
);

comment on table public.shift_handovers is 'Shift handover notes for three-shift operational communication (Morning/Afternoon/Night)';
comment on column public.shift_handovers.from_shift is 'Outgoing shift (Morning/Afternoon/Night)';
comment on column public.shift_handovers.to_shift is 'Incoming shift (Morning/Afternoon/Night)';
comment on column public.shift_handovers.body is 'Handover content (markdown supported)';
comment on column public.shift_handovers.outgoing_user_id is 'User ending their shift';
comment on column public.shift_handovers.incoming_user_id is 'User starting the next shift (optional, set when acknowledged)';
comment on column public.shift_handovers.created_at is 'When the handover was created (UTC)';
comment on column public.shift_handovers.acknowledged_by is 'Array of user IDs who have acknowledged this handover';

-- Indexes
create index if not exists shift_handovers_created_at_desc_idx on public.shift_handovers (created_at desc);
create index if not exists shift_handovers_from_shift_idx on public.shift_handovers (from_shift);
create index if not exists shift_handovers_outgoing_user_idx on public.shift_handovers (outgoing_user_id);

-- RLS
alter table public.shift_handovers enable row level security;

-- Read policy: authenticated staff (non-client roles) can read
create policy shift_handovers_read_staff on public.shift_handovers
    for select to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
    );

-- Write policy: Coordinator and above can create handovers
create policy shift_handovers_write_coordinator_plus on public.shift_handovers
    for insert to authenticated
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator')
        )
    );

-- Acknowledge policy: any authenticated staff can acknowledge (add their ID to array, set incoming_user_id)
create policy shift_handovers_acknowledge_staff on public.shift_handovers
    for update to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
    )
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
        and acknowledged_by @> array[auth.uid()]::uuid[]
        and (incoming_user_id is null or incoming_user_id = auth.uid())
    );

-- RPC: create_shift_handover
create or replace function public.create_shift_handover(
    p_from_shift text,
    p_to_shift text,
    p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_handover_id uuid;
begin
    -- Verify caller is Coordinator or above
    if not public.auth_is_coordinator_or_above() then
        raise insufficient_privilege using message = 'Only Coordinator+ can create shift handovers';
    end if;

    -- Validate shift values
    if p_from_shift not in ('Morning','Afternoon','Night') then
        raise exception 'Invalid from_shift: %', p_from_shift using errcode = 'check_violation';
    end if;
    if p_to_shift not in ('Morning','Afternoon','Night') then
        raise exception 'Invalid to_shift: %', p_to_shift using errcode = 'check_violation';
    end if;

    insert into public.shift_handovers (from_shift, to_shift, body, outgoing_user_id)
    values (p_from_shift, p_to_shift, p_body, auth.uid())
    returning id into v_handover_id;

    return v_handover_id;
end;
$$;

comment on function public.create_shift_handover(text, text, text) is 'Create a shift handover (Coordinator+ only). Returns handover ID.';

-- RPC: acknowledge_shift_handover
create or replace function public.acknowledge_shift_handover(p_handover_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_updated boolean;
begin
    -- Verify caller is authenticated staff (not client)
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can acknowledge shift handovers';
    end if;

    update public.shift_handovers
    set acknowledged_by = acknowledged_by || array[auth.uid()]::uuid[],
        incoming_user_id = auth.uid()
    where id = p_handover_id
      and not acknowledged_by @> array[auth.uid()]::uuid[]
      and exists (
          select 1 from public.users u
          where u.id = auth.uid()
          and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
      );

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.acknowledge_shift_handover(uuid) is 'Acknowledge a shift handover (adds caller to acknowledged_by, sets incoming_user_id). Returns true if newly acknowledged.';

-- RPC: list_shift_handovers (paginated, most recent first, optional shift filter)
create or replace function public.list_shift_handovers(
    p_limit int default 50,
    p_offset int default 0,
    p_from_shift text default null,
    p_to_shift text default null
)
returns setof public.shift_handovers
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Verify caller is authenticated staff (not client)
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list shift handovers';
    end if;

    return query
    select sh.*
    from public.shift_handovers sh
    where (p_from_shift is null or sh.from_shift = p_from_shift)
      and (p_to_shift is null or sh.to_shift = p_to_shift)
    order by sh.created_at desc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_shift_handovers(int, int, text, text) is 'List shift handovers (staff only), most recent first. Paginated. Optional shift filters.';

-- Grant execute on RPCs
grant execute on function public.create_shift_handover(text, text, text) to authenticated;
grant execute on function public.acknowledge_shift_handover(uuid) to authenticated;
grant execute on function public.list_shift_handovers(int, int, text, text) to authenticated;

-- Revoke execute from anon and public (security: mutating and sensitive RPCs must not be reachable without a session)
revoke all on function public.create_shift_handover(text, text, text) from anon, public;
revoke all on function public.acknowledge_shift_handover(uuid) from anon, public;
revoke all on function public.list_shift_handovers(int, int, text, text) from anon, public;