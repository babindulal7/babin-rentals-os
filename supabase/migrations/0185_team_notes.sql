-- 0185_team_notes.sql
-- Team notes for shared operational communication across shifts
-- T4-04: team_notes table + RPCs

create table if not exists public.team_notes (
    id uuid primary key default gen_random_uuid(),
    body text not null,
    author_id uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    acknowledged_by uuid[] not null default '{}'::uuid[]
);

comment on table public.team_notes is 'Shared team notes for shift handover and operational communication';
comment on column public.team_notes.body is 'Note content (markdown supported)';
comment on column public.team_notes.author_id is 'User who created the note';
comment on column public.team_notes.created_at is 'When the note was created (UTC)';
comment on column public.team_notes.acknowledged_by is 'Array of user IDs who have acknowledged this note';

-- Indexes
create index if not exists team_notes_created_at_desc_idx on public.team_notes (created_at desc);
create index if not exists team_notes_author_idx on public.team_notes (author_id);

-- RLS
alter table public.team_notes enable row level security;

-- Read policy: authenticated staff (non-client roles) can read
create policy team_notes_read_staff on public.team_notes
    for select to authenticated
    using (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Driver','Accounts')
        )
    );

-- Write policy: Coordinator and above can create notes
create policy team_notes_write_coordinator_plus on public.team_notes
    for insert to authenticated
    with check (
        exists (
            select 1 from public.users u
            where u.id = auth.uid()
            and u.primary_role in ('Owner','Admin','Manager','Coordinator')
        )
    );

-- Acknowledge policy: any authenticated staff can acknowledge (add their ID to array)
create policy team_notes_acknowledge_staff on public.team_notes
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
    );

-- RPC: create_team_note
create or replace function public.create_team_note(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_note_id uuid;
begin
    -- Verify caller is Coordinator or above
    if not public.auth_is_coordinator_or_above() then
        raise insufficient_privilege using message = 'Only Coordinator+ can create team notes';
    end if;

    insert into public.team_notes (body, author_id)
    values (p_body, auth.uid())
    returning id into v_note_id;

    return v_note_id;
end;
$$;

comment on function public.create_team_note(text) is 'Create a team note (Coordinator+ only). Returns note ID.';

-- RPC: acknowledge_team_note
create or replace function public.acknowledge_team_note(p_note_id uuid)
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
        raise insufficient_privilege using message = 'Only staff can acknowledge team notes';
    end if;

    update public.team_notes
    set acknowledged_by = acknowledged_by || array[auth.uid()]::uuid[]
    where id = p_note_id
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

comment on function public.acknowledge_team_note(uuid) is 'Acknowledge a team note (adds caller to acknowledged_by). Returns true if newly acknowledged.';

-- RPC: list_team_notes (paginated, most recent first)
create or replace function public.list_team_notes(p_limit int default 50, p_offset int default 0)
returns setof public.team_notes
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Verify caller is authenticated staff (not client)
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list team notes';
    end if;

    return query
    select tn.*
    from public.team_notes tn
    order by tn.created_at desc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_team_notes(int, int) is 'List team notes (staff only), most recent first. Paginated.';

-- Grant execute on RPCs
grant execute on function public.create_team_note(text) to authenticated;
grant execute on function public.acknowledge_team_note(uuid) to authenticated;
grant execute on function public.list_team_notes(int, int) to authenticated;

-- Revoke execute from anon and public (security: mutating and sensitive RPCs must not be reachable without a session)
revoke all on function public.create_team_note(text) from anon, public;
revoke all on function public.acknowledge_team_note(uuid) from anon, public;
revoke all on function public.list_team_notes(int, int) from anon, public;