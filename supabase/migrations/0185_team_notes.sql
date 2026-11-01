-- 0185_team_notes.sql
-- Team notes for shared operational communication across shifts (T4-04)
-- Law 3: archive, never delete. Law 8: client_uuid idempotency.
-- Staff-only access (Client denied). Direct UPDATE/DELETE revoked for security.

create table if not exists public.team_notes (
    id uuid primary key default gen_random_uuid(),
    client_uuid uuid unique,
    body text not null check (length(trim(body)) > 0 and length(body) <= 10000),
    author_id uuid not null references public.users(id),
    author_name text not null default 'Staff Member',
    author_role text not null default 'Staff',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    category text not null default 'General' check (category in ('General', 'Equipment Alert', 'Gear Alert', 'Shift Handover', 'Client Remark', 'Logistics & Transport')),
    priority text not null default 'normal' check (priority in ('urgent', 'high', 'normal', 'low')),
    status text not null default 'open' check (status in ('open', 'resolved')),
    resolved_at timestamptz,
    resolved_by uuid references public.users(id),
    pinned boolean not null default false,
    pinned_at timestamptz,
    pinned_by uuid references public.users(id),
    is_archived boolean not null default false,
    archived_at timestamptz,
    archived_by uuid references public.users(id),
    reference_id text,
    reference_ids text[] not null default '{}'::text[],
    acknowledged_by uuid[] not null default '{}'::uuid[]
);

comment on table public.team_notes is 'Shared team notes for shift handover and operational communication across staff (T4-04)';
comment on column public.team_notes.body is 'Note content (markdown supported, max 10k chars)';
comment on column public.team_notes.author_id is 'Auth user ID who created the note';
comment on column public.team_notes.author_name is 'Author display name snapshot';
comment on column public.team_notes.author_role is 'Author system role snapshot';
comment on column public.team_notes.is_archived is 'Archived flag (Law 3: archive, never delete)';
comment on column public.team_notes.acknowledged_by is 'Array of user IDs who have acknowledged this note';

-- Indexes
create index if not exists team_notes_created_at_desc_idx on public.team_notes (created_at desc);
create index if not exists team_notes_pinned_idx on public.team_notes (pinned, created_at desc) where not is_archived;
create index if not exists team_notes_author_idx on public.team_notes (author_id);
create index if not exists team_notes_ref_idx on public.team_notes (reference_id) where reference_id is not null;
create index if not exists team_notes_client_uuid_idx on public.team_notes (client_uuid) where client_uuid is not null;

-- RLS
alter table public.team_notes enable row level security;

-- Read policy: authenticated staff (all non-client roles) can read
create policy team_notes_select_staff on public.team_notes
    for select to authenticated
    using (public.auth_is_staff());

-- Direct insert policy: authenticated staff can insert with matching author_id
create policy team_notes_insert_staff on public.team_notes
    for insert to authenticated
    with check (
        public.auth_is_staff()
        and author_id = coalesce(auth.uid(), public.auth_user_id())
    );

-- Direct UPDATE and DELETE are revoked for security.
-- Controlled mutations (acknowledge, pin, archive, resolve) occur via audited RPCs.
revoke update, delete on public.team_notes from public, anon, authenticated;

-- Audit trigger (0157 audit of record)
drop trigger if exists trg_audit_team_notes on public.team_notes;
create trigger trg_audit_team_notes after insert or update on public.team_notes
    for each row execute function public.log_audit_event_actor();

-- RPC: create_team_note
create or replace function public.create_team_note(
    p_body text,
    p_client_uuid uuid default null,
    p_category text default 'General',
    p_priority text default 'normal',
    p_reference_id text default null,
    p_reference_ids text[] default '{}'::text[],
    p_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_author_name text;
    v_author_role text;
    v_note_id uuid;
begin
    -- 1. Must be authenticated staff
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can create team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    -- 2. Validate body length and non-empty
    if p_body is null or length(trim(p_body)) = 0 then
        raise exception 'Note body cannot be empty' using errcode = '22000';
    end if;
    if length(p_body) > 10000 then
        raise exception 'Note body exceeds maximum length (10,000 characters)' using errcode = '22000';
    end if;

    -- 3. Validate category
    if p_category not in ('General', 'Equipment Alert', 'Gear Alert', 'Shift Handover', 'Client Remark', 'Logistics & Transport') then
        raise exception 'Invalid note category: %', p_category using errcode = '22000';
    end if;

    -- 4. Validate priority
    if p_priority not in ('urgent', 'high', 'normal', 'low') then
        raise exception 'Invalid note priority: %', p_priority using errcode = '22000';
    end if;

    -- 5. Idempotency on client_uuid (Law 8)
    if p_client_uuid is not null then
        select id into v_note_id from public.team_notes where client_uuid = p_client_uuid;
        if v_note_id is not null then
            return v_note_id;
        end if;
    end if;

    -- 6. Lookup author metadata
    select coalesce(full_name, 'Staff Member'), coalesce(primary_role::text, 'Staff')
    into v_author_name, v_author_role
    from public.users
    where id = v_actor_id;

    v_author_name := coalesce(v_author_name, 'Staff Member');
    v_author_role := coalesce(v_author_role, 'Staff');

    -- 7. Insert note
    insert into public.team_notes (
        client_uuid,
        body,
        author_id,
        author_name,
        author_role,
        category,
        priority,
        reference_id,
        reference_ids,
        pinned,
        pinned_at,
        pinned_by,
        is_archived
    ) values (
        p_client_uuid,
        trim(p_body),
        v_actor_id,
        v_author_name,
        v_author_role,
        p_category,
        p_priority,
        nullif(trim(p_reference_id), ''),
        coalesce(p_reference_ids, '{}'::text[]),
        coalesce(p_pinned, false),
        case when coalesce(p_pinned, false) then now() else null end,
        case when coalesce(p_pinned, false) then v_actor_id else null end,
        false
    )
    returning id into v_note_id;

    return v_note_id;
end;
$$;

comment on function public.create_team_note(text, uuid, text, text, text, text[], boolean) is 'Create a team note (Staff only, idempotent via client_uuid). Returns note ID.';

-- RPC: acknowledge_team_note
create or replace function public.acknowledge_team_note(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can acknowledge team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set acknowledged_by = array_append(acknowledged_by, v_actor_id),
        updated_at = now()
    where id = p_note_id
      and not (acknowledged_by @> array[v_actor_id]::uuid[]);

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.acknowledge_team_note(uuid) is 'Acknowledge a team note (idempotently adds caller ID). Returns true if newly acknowledged.';

-- RPC: pin_team_note
create or replace function public.pin_team_note(p_note_id uuid, p_pinned boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can pin/unpin team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set pinned = coalesce(p_pinned, true),
        pinned_at = case when coalesce(p_pinned, true) then now() else null end,
        pinned_by = case when coalesce(p_pinned, true) then v_actor_id else null end,
        updated_at = now()
    where id = p_note_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.pin_team_note(uuid, boolean) is 'Pin or unpin a team note (Staff only).';

-- RPC: archive_team_note (Law 3: archive, never delete)
create or replace function public.archive_team_note(p_note_id uuid, p_archived boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can archive team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set is_archived = coalesce(p_archived, true),
        archived_at = case when coalesce(p_archived, true) then now() else null end,
        archived_by = case when coalesce(p_archived, true) then v_actor_id else null end,
        updated_at = now()
    where id = p_note_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.archive_team_note(uuid, boolean) is 'Archive a team note (Staff only, Law 3: archive, never delete).';

-- RPC: resolve_team_note
create or replace function public.resolve_team_note(p_note_id uuid, p_resolved boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_updated boolean := false;
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can resolve team notes';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    update public.team_notes
    set status = case when coalesce(p_resolved, true) then 'resolved' else 'open' end,
        resolved_at = case when coalesce(p_resolved, true) then now() else null end,
        resolved_by = case when coalesce(p_resolved, true) then v_actor_id else null end,
        updated_at = now()
    where id = p_note_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.resolve_team_note(uuid, boolean) is 'Mark a team note resolved or reopened (Staff only).';

-- RPC: list_team_notes (paginated, pinned first, then newest, excludes archived by default)
create or replace function public.list_team_notes(
    p_limit int default 50,
    p_offset int default 0,
    p_include_archived boolean default false,
    p_category text default null,
    p_reference_id text default null
)
returns setof public.team_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list team notes';
    end if;

    p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
    p_offset := greatest(0, coalesce(p_offset, 0));

    return query
    select tn.*
    from public.team_notes tn
    where (p_include_archived or not tn.is_archived)
      and (p_category is null or tn.category = p_category)
      and (p_reference_id is null or tn.reference_id = p_reference_id or tn.reference_ids @> array[p_reference_id]::text[])
    order by tn.pinned desc, tn.created_at desc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_team_notes(int, int, boolean, text, text) is 'List team notes (staff only, pinned first, paginated). Excludes archived by default.';

-- Revoke public & anon execution, grant authenticated execution
revoke execute on function public.create_team_note(text, uuid, text, text, text, text[], boolean) from public, anon;
grant execute on function public.create_team_note(text, uuid, text, text, text, text[], boolean) to authenticated;

revoke execute on function public.acknowledge_team_note(uuid) from public, anon;
grant execute on function public.acknowledge_team_note(uuid) to authenticated;

revoke execute on function public.pin_team_note(uuid, boolean) from public, anon;
grant execute on function public.pin_team_note(uuid, boolean) to authenticated;

revoke execute on function public.archive_team_note(uuid, boolean) from public, anon;
grant execute on function public.archive_team_note(uuid, boolean) to authenticated;

revoke execute on function public.resolve_team_note(uuid, boolean) from public, anon;
grant execute on function public.resolve_team_note(uuid, boolean) to authenticated;

revoke execute on function public.list_team_notes(int, int, boolean, text, text) from public, anon;
grant execute on function public.list_team_notes(int, int, boolean, text, text) to authenticated;
