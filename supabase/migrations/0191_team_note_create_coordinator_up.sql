-- Migration 0191: team notes can be created by Coordinator and above only
-- =============================================================================
-- RULING 2026-11-01 (Babin, chat): "Coordinator and up" may create team notes.
-- Owner, Admin, Manager and Coordinator create; Warehouse, Technician, Driver
-- and Accounts do not. Reading, acknowledging, pinning, archiving and resolving
-- are unchanged by this migration.
--
-- Why a migration and not only rbac.ts: rbac.canCreateTeamNote already said
-- Coordinator+, but 0185 let every staff role insert, directly or through
-- create_team_note(). A rule held only by the UI is not a rule (P2, P3, B-1).
-- Database first: this file makes the database agree with rbac.ts.
--
-- Revert: restore the 0185 policy `team_notes_insert_staff` (auth_is_staff()) and
-- the 0185 body of create_team_note() (drop the role check in step 1b).
-- =============================================================================

begin;

-- 1. Direct-insert policy: Coordinator+ and own authorship.
drop policy if exists team_notes_insert_staff on public.team_notes;
create policy team_notes_insert_staff on public.team_notes
    for insert to authenticated
    with check (
        public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator')
        and author_id = coalesce(auth.uid(), public.auth_user_id())
    );

-- 2. RPC: same body as 0185 with the Coordinator+ gate added (step 1b).
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

    -- 1b. Coordinator and above (RULING 2026-11-01)
    if public.auth_user_role() not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
        raise insufficient_privilege using message = 'Only Coordinator and above can create team notes';
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

comment on function public.create_team_note(text, uuid, text, text, text, text[], boolean) is
    'Create a team note (Coordinator and above, idempotent via client_uuid). Returns note ID. RULING 2026-11-01.';

revoke execute on function public.create_team_note(text, uuid, text, text, text, text[], boolean) from public, anon;
grant execute on function public.create_team_note(text, uuid, text, text, text, text[], boolean) to authenticated;

-- 3. Verification: the policy and the function agree with rbac.canCreateTeamNote.
do $verify$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'team_notes'
          and policyname = 'team_notes_insert_staff'
          and with_check like '%Coordinator%'
    ) then
        raise exception '0191: team_notes_insert_staff must restrict inserts to Coordinator and above';
    end if;
    if has_function_privilege('anon', 'public.create_team_note(text, uuid, text, text, text, text[], boolean)', 'EXECUTE') then
        raise exception '0191: create_team_note must not be executable by anon';
    end if;
end;
$verify$;

commit;
