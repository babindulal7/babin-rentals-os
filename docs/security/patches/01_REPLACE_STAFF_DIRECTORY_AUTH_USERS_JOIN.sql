-- =============================================================================
-- BABIN RENTALS OS — STAGING SECURITY PATCH PROPOSAL (SEC-PATCH-01)
-- Target: Remediate Supabase Linter 0002_auth_users_exposed on staff_directory_v
--
-- STATUS: STAGING PROPOSAL ONLY — OWNER APPROVAL REQUIRED BEFORE EXECUTION
-- NO AUTOMATIC EXECUTION AGAINST PRODUCTION OR HOSTED STAGING
-- =============================================================================

begin;

-- Step 1: Create a secure, restricted helper RPC to check auth account presence and timestamps
-- Only Owner and Admin can execute this function.
create or replace function public.get_staff_auth_account_status(p_user_id uuid)
returns table (
  has_auth_account boolean,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
begin
  -- Enforce Owner / Admin role check
  if not (auth_user_role() in ('Owner', 'Admin')) then
    return query select false, null::timestamptz, null::timestamptz;
    return;
  end if;

  return query
  select
    (au.id is not null) as has_auth_account,
    au.last_sign_in_at,
    au.email_confirmed_at
  from auth.users au
  where au.id = p_user_id;
end;
$$;

revoke all on function public.get_staff_auth_account_status(uuid) from public, anon;
grant execute on function public.get_staff_auth_account_status(uuid) to authenticated, service_role;

-- Step 2: Recreate staff_directory_v without joining auth.users in the FROM clause
create or replace view public.staff_directory_v as
select
  u.id,
  u.full_name,
  u.employee_code,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.email
    else null
  end as email,
  u.primary_role,
  u.department,
  case
    when auth_user_role() in ('Owner', 'Admin') then u.mobile
    else null
  end as mobile,
  u.branch_id,
  b.branch_code,
  b.name as branch_name,
  u.is_active,

  -- Credential state (Owner/Admin only)
  case
    when auth_user_role() in ('Owner', 'Admin') then (p.id is not null)
    else false
  end as has_pin,
  case
    when auth_user_role() in ('Owner', 'Admin') and p.locked_until > now() then p.locked_until
    else null
  end as pin_locked_until,
  case
    when auth_user_role() in ('Owner', 'Admin') then coalesce(p.rotated_at, p.set_at)
    else null
  end as pin_set_at,

  -- Auth metadata: derived via secure RPC for Owner/Admin, null for all other roles
  case
    when auth_user_role() in ('Owner', 'Admin') then (st.has_auth_account is true)
    else false
  end as has_auth_account,
  case
    when auth_user_role() in ('Owner', 'Admin') then st.last_sign_in_at
    else null
  end as last_sign_in_at,
  case
    when auth_user_role() in ('Owner', 'Admin') then st.email_confirmed_at
    else null
  end as email_confirmed_at

from users u
left join branches b
  on b.id = u.branch_id
left join staff_auth_pins p
  on p.user_id = u.id
 and p.revoked_at is null
left join lateral public.get_staff_auth_account_status(u.id) st
  on (auth_user_role() in ('Owner', 'Admin'))
where u.deactivated_at is null
  and u.is_active = true
  and auth_is_staff();

revoke all on public.staff_directory_v from public, anon;
grant select on public.staff_directory_v to authenticated, service_role;

commit;
