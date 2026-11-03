-- =============================================================================
-- 0210_problem_reports.sql — Report a Problem (T4-11)
--
-- Staff can submit problem reports from any page with automatic context attachment.
-- Owner/Admin can review all reports; staff see only their own.
-- Status lifecycle: Open → Seen → Fixed → Won't fix (Law 3: archive, never delete).
-- Photos stored in private 'problem-reports' bucket.
-- Law 8: client_uuid idempotency. Law 6: no money in reports.
-- =============================================================================

begin;

-- 1. Ensure private storage bucket for problem report photos
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
        insert into storage.buckets (id, name, public)
        values ('problem-reports', 'problem-reports', false)
        on conflict (id) do update set public = false;
    end if;
end $$;

-- 2. Storage policies for problem-reports bucket (private, staff-only)
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
        -- Enable RLS on storage.objects (idempotent)
        begin
            alter table storage.objects enable row level security;
        exception when insufficient_privilege then
            null;
        end;

        -- SELECT: staff can read their own uploads, Owner/Admin can read all
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname = 'problem_reports_select_policy'
        ) then
            create policy "problem_reports_select_policy"
                on storage.objects for select
                to authenticated
                using (
                    bucket_id = 'problem-reports'
                    and (
                        owner = auth.uid()
                        or public.auth_user_role() in ('Owner', 'Admin')
                    )
                );
        end if;

        -- INSERT: authenticated staff can upload to their own folder
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname = 'problem_reports_insert_policy'
        ) then
            create policy "problem_reports_insert_policy"
                on storage.objects for insert
                to authenticated
                with check (
                    bucket_id = 'problem-reports'
                    and public.auth_is_staff()
                    and (storage.foldername(name))[1] = auth.uid()::text
                );
        end if;

        -- DELETE: Owner/Admin only (Law 3: archive, never delete — but allow cleanup by Owner/Admin)
        if not exists (
            select 1 from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname = 'problem_reports_delete_policy'
        ) then
            create policy "problem_reports_delete_policy"
                on storage.objects for delete
                to authenticated
                using (
                    bucket_id = 'problem-reports'
                    and public.auth_user_role() in ('Owner', 'Admin')
                );
        end if;
    end if;
end $$;

-- 3. problem_reports table
create table if not exists public.problem_reports (
    id uuid primary key default gen_random_uuid(),
    client_uuid uuid unique,                              -- Law 8: idempotency key
    description text not null check (length(trim(description)) > 0 and length(description) <= 10000),
    photo_path text,                                      -- Storage object path in problem-reports bucket
    author_id uuid not null references public.users(id),
    author_name text not null default 'Staff Member',
    author_role text not null default 'Staff',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    status text not null default 'open' check (status in ('open', 'seen', 'fixed', 'wont_fix')),
    status_changed_at timestamptz,
    status_changed_by uuid references public.users(id),
    status_change_reason text check (length(trim(status_change_reason)) >= 10 or status_change_reason is null),
    -- Auto-attached context
    route_path text,                                      -- Current route without query string
    app_version text,                                     -- APP_VERSION from client
    user_role text,                                       -- Author's system role
    device_category text check (device_category in ('phone', 'tablet', 'desktop')),
    viewport_width int,
    viewport_height int,
    error_reference text,                                 -- Last error reference from T1-08 monitoring
    -- Constraints: no sensitive data
    constraint no_query_strings check (route_path is null or route_path not like '%?%'),
    constraint no_tokens_in_route check (route_path is null or route_path not like '%token%')
);

comment on table public.problem_reports is 'Problem reports submitted by staff from any page (T4-11). Auto-attaches route, version, role, device, viewport, error reference. Status lifecycle: Open → Seen → Fixed → Won''t fix.';
comment on column public.problem_reports.description is 'Problem description (max 10k chars)';
comment on column public.problem_reports.photo_path is 'Storage object path in private problem-reports bucket';
comment on column public.problem_reports.author_id is 'Auth user ID who submitted the report';
comment on column public.problem_reports.author_name is 'Author display name snapshot';
comment on column public.problem_reports.author_role is 'Author system role snapshot';
comment on column public.problem_reports.route_path is 'Current route without query string (auto-attached)';
comment on column public.problem_reports.app_version is 'Application version (auto-attached)';
comment on column public.problem_reports.user_role is 'Author role at submission time (auto-attached)';
comment on column public.problem_reports.device_category is 'Device category: phone/tablet/desktop (auto-attached)';
comment on column public.problem_reports.viewport_width is 'Viewport width in pixels (auto-attached)';
comment on column public.problem_reports.viewport_height is 'Viewport height in pixels (auto-attached)';
comment on column public.problem_reports.error_reference is 'Last error reference from monitoring (auto-attached, T1-08)';
comment on column public.problem_reports.status is 'Lifecycle status: open, seen, fixed, wont_fix (Law 3: archive, never delete)';
comment on column public.problem_reports.status_change_reason is 'Reason for status change (min 10 chars when provided)';

-- Indexes
create index if not exists problem_reports_created_at_desc_idx on public.problem_reports (created_at desc);
create index if not exists problem_reports_author_idx on public.problem_reports (author_id);
create index if not exists problem_reports_status_idx on public.problem_reports (status);
create index if not exists problem_reports_client_uuid_idx on public.problem_reports (client_uuid) where client_uuid is not null;
create index if not exists problem_reports_route_idx on public.problem_reports (route_path) where route_path is not null;

-- 4. Row Level Security
alter table public.problem_reports enable row level security;

-- SELECT: Staff can read their own reports; Owner/Admin can read all
drop policy if exists problem_reports_select on public.problem_reports;
create policy problem_reports_select on public.problem_reports
    for select to authenticated
    using (
        public.auth_is_staff()
        and (
            author_id = public.auth_user_id()
            or public.auth_user_role() in ('Owner', 'Admin')
        )
    );

-- INSERT: Any authenticated staff can insert with matching author_id and client_uuid idempotency
drop policy if exists problem_reports_insert on public.problem_reports;
create policy problem_reports_insert on public.problem_reports
    for insert to authenticated
    with check (
        public.auth_is_staff()
        and author_id = public.auth_user_id()
    );

-- UPDATE: Only status changes allowed, by Owner/Admin or author (for viewing own)
-- Status changes go through RPC for audit; direct UPDATE revoked
revoke update, delete on public.problem_reports from public, anon, authenticated;

-- 5. Audit trigger (uses existing log_audit_event_actor from 0157)
drop trigger if exists trg_audit_problem_reports on public.problem_reports;
create trigger trg_audit_problem_reports
    after insert or update on public.problem_reports
    for each row execute function public.log_audit_event_actor();

-- 6. RPC: create_problem_report
create or replace function public.create_problem_report(
    p_description text,
    p_client_uuid uuid default null,
    p_photo_path text default null,
    p_route_path text default null,
    p_app_version text default null,
    p_user_role text default null,
    p_device_category text default null,
    p_viewport_width int default null,
    p_viewport_height int default null,
    p_error_reference text default null
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
    v_report_id uuid;
begin
    -- 1. Must be authenticated staff
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can submit problem reports';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    -- 2. Validate description
    if p_description is null or length(trim(p_description)) = 0 then
        raise exception 'Problem description cannot be empty' using errcode = '22000';
    end if;
    if length(p_description) > 10000 then
        raise exception 'Problem description exceeds maximum length (10,000 characters)' using errcode = '22000';
    end if;

    -- 3. Validate device_category if provided
    if p_device_category is not null and p_device_category not in ('phone', 'tablet', 'desktop') then
        raise exception 'Invalid device category: %', p_device_category using errcode = '22000';
    end if;

    -- 4. Validate route_path: no query strings, no sensitive params
    if p_route_path is not null then
        if p_route_path like '%?%' then
            raise exception 'Route path must not contain query string' using errcode = '22000';
        end if;
        if p_route_path like '%token%' or p_route_path like '%password%' or p_route_path like '%secret%' then
            raise exception 'Route path must not contain sensitive parameters' using errcode = '22000';
        end if;
    end if;

    -- 5. Idempotency on client_uuid (Law 8)
    if p_client_uuid is not null then
        select id into v_report_id from public.problem_reports where client_uuid = p_client_uuid;
        if v_report_id is not null then
            return v_report_id; -- Already exists, return existing (idempotent)
        end if;
    end if;

    -- 6. Lookup author metadata
    select coalesce(full_name, 'Staff Member'), coalesce(primary_role::text, 'Staff')
    into v_author_name, v_author_role
    from public.users
    where id = v_actor_id;

    v_author_name := coalesce(v_author_name, 'Staff Member');
    v_author_role := coalesce(v_author_role, 'Staff');

    -- 7. Insert report
    insert into public.problem_reports (
        client_uuid,
        description,
        photo_path,
        author_id,
        author_name,
        author_role,
        route_path,
        app_version,
        user_role,
        device_category,
        viewport_width,
        viewport_height,
        error_reference
    ) values (
        p_client_uuid,
        trim(p_description),
        nullif(trim(p_photo_path), ''),
        v_actor_id,
        v_author_name,
        v_author_role,
        nullif(trim(p_route_path), ''),
        nullif(trim(p_app_version), ''),
        nullif(trim(p_user_role), ''),
        nullif(trim(p_device_category), ''),
        p_viewport_width,
        p_viewport_height,
        nullif(trim(p_error_reference), '')
    )
    returning id into v_report_id;

    return v_report_id;
end;
$$;

comment on function public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text) is 'Create a problem report (Staff only, idempotent via client_uuid). Returns report ID.';

-- 7. RPC: list_problem_reports (for Owner/Admin review)
create or replace function public.list_problem_reports(
    p_limit int default 50,
    p_offset int default 0,
    p_status text default null,
    p_author_id uuid default null,
    p_search text default null
)
returns setof public.problem_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.auth_is_staff() then
        raise insufficient_privilege using message = 'Only staff can list problem reports';
    end if;

    p_limit := greatest(1, least(coalesce(p_limit, 50), 100));
    p_offset := greatest(0, coalesce(p_offset, 0));

    return query
    select pr.*
    from public.problem_reports pr
    where (public.auth_user_role() in ('Owner', 'Admin') or pr.author_id = public.auth_user_id())
      and (p_status is null or pr.status = p_status)
      and (p_author_id is null or pr.author_id = p_author_id)
      and (p_search is null or pr.description ilike '%' || p_search || '%')
    order by pr.created_at desc
    limit p_limit offset p_offset;
end;
$$;

comment on function public.list_problem_reports(int, int, text, uuid, text) is 'List problem reports (staff see own; Owner/Admin see all). Filterable by status, author, search.';

-- 8. RPC: update_problem_report_status (Owner/Admin only, audited)
create or replace function public.update_problem_report_status(
    p_report_id uuid,
    p_status text,
    p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor_id uuid;
    v_actor_role text;
    v_updated boolean := false;
    v_old_status text;
begin
    -- 1. Must be Owner or Admin
    if not public.auth_user_role() in ('Owner', 'Admin') then
        raise insufficient_privilege using message = 'Only Owner or Admin can change problem report status';
    end if;

    v_actor_id := coalesce(auth.uid(), public.auth_user_id());
    if v_actor_id is null then
        raise insufficient_privilege using message = 'Authenticated session required';
    end if;

    -- 2. Validate status
    if p_status not in ('open', 'seen', 'fixed', 'wont_fix') then
        raise exception 'Invalid status: %', p_status using errcode = '22000';
    end if;

    -- 3. Validate reason (min 10 chars if provided)
    if p_reason is not null and length(trim(p_reason)) < 10 then
        raise exception 'Status change reason must be at least 10 characters' using errcode = '22000';
    end if;

    -- 4. Get current status for audit
    select status into v_old_status from public.problem_reports where id = p_report_id;
    if v_old_status is null then
        raise exception 'Problem report not found' using errcode = 'P0001';
    end if;

    -- 5. No-op if same status
    if v_old_status = p_status then
        return false;
    end if;

    -- 6. Update status with audit fields
    update public.problem_reports
    set status = p_status,
        status_changed_at = now(),
        status_changed_by = v_actor_id,
        status_change_reason = nullif(trim(p_reason), ''),
        updated_at = now()
    where id = p_report_id;

    get diagnostics v_updated = row_count;
    return v_updated;
end;
$$;

comment on function public.update_problem_report_status(uuid, text, text) is 'Update problem report status (Owner/Admin only, min 10 char reason). Audited via trigger.';

-- 9. View for convenient querying (security barrier)
create or replace view public.problem_reports_v with (security_barrier = true) as
select
    pr.id,
    pr.client_uuid,
    pr.description,
    pr.photo_path,
    pr.author_id,
    pr.author_name,
    pr.author_role,
    pr.created_at,
    pr.updated_at,
    pr.status,
    pr.status_changed_at,
    pr.status_changed_by,
    pr.status_change_reason,
    pr.route_path,
    pr.app_version,
    pr.user_role,
    pr.device_category,
    pr.viewport_width,
    pr.viewport_height,
    pr.error_reference
from public.problem_reports pr
where public.auth_is_staff()
  and (pr.author_id = public.auth_user_id() or public.auth_user_role() in ('Owner', 'Admin'))
order by pr.created_at desc;

revoke all on public.problem_reports_v from public, anon;
grant select on public.problem_reports_v to authenticated;

-- 10. Revoke public/anon execution, grant authenticated execution
revoke execute on function public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text) from public, anon;
grant execute on function public.create_problem_report(text, uuid, text, text, text, text, text, int, int, text) to authenticated;

revoke execute on function public.list_problem_reports(int, int, text, uuid, text) from public, anon;
grant execute on function public.list_problem_reports(int, int, text, uuid, text) to authenticated;

revoke execute on function public.update_problem_report_status(uuid, text, text) from public, anon;
grant execute on function public.update_problem_report_status(uuid, text, text) to authenticated;

commit;