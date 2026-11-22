-- 0264_manager_approvals_to_owner.sql
-- R-22.8 (22 Nov 2026): Manager-level approvals route to the Owner while the Settings choice
-- "managerApprovalsToOwner" is on. Default ON (owner answer O-33, 22 Nov 2026).
--
-- RULING 2026-11-22: Manager-level approvals go to the Owner by setting (R-22.8, RULINGS-2026-11-22.md).
--
-- Stricter only: while the setting is on, a Manager loses approval rights that the threshold
-- rule would have given them. The Owner's rights do not change. With the setting off, the
-- existing rules (0057 damage threshold, 0058 late-fee waiver) apply unchanged.
--
-- Scope: the damage approval rank (auth_can_approve_damage) and the late-fee waiver rank
-- (auth_can_approve_late_fee_waiver). Extension clashes (T3-29) and the approvals inbox
-- (T5-10) are not covered here; their enforcement is traced separately before they change.
--
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0264. Claimed after 0263 because 0261 to 0263
-- sit on unmerged branches.
--
-- REVERT: restore the 0057 body of auth_can_approve_damage and the 0058 body of
--         auth_can_approve_late_fee_waiver; drop function if exists auth_manager_approvals_to_owner();
--         delete from settings where key = 'managerApprovalsToOwner' and scope = 'org';

begin;

insert into settings (key, value, scope, is_money)
select 'managerApprovalsToOwner', 'true'::jsonb, 'org', false
where not exists (
  select 1 from settings
  where key = 'managerApprovalsToOwner' and scope = 'org' and location_id is null
);

-- True unless the org setting says false. A missing row means the default, which is on.
create or replace function auth_manager_approvals_to_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.value = 'true'::jsonb
      from settings s
      where s.key = 'managerApprovalsToOwner'
        and s.scope = 'org'
        and s.location_id is null
      limit 1
    ),
    true
  );
$$;

revoke all on function auth_manager_approvals_to_owner() from public, anon;
grant execute on function auth_manager_approvals_to_owner() to authenticated;

comment on function auth_manager_approvals_to_owner is
  'R-22.8: true (default) when Manager-level approvals go to the Owner. Read from settings key managerApprovalsToOwner.';

-- Damage: the 0057 rank, with the Manager removed while the setting is on.
create or replace function auth_can_approve_damage(charge numeric)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_manager_approvals_to_owner() then auth_user_role() = 'Owner'
    when charge is null or charge >= 25000.00 then auth_user_role() = 'Owner'
    else auth_user_role() in ('Owner', 'Manager')
  end;
$$;

-- Late-fee waiver: the 0058 rank, with the Manager removed while the setting is on.
create or replace function auth_can_approve_late_fee_waiver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth_manager_approvals_to_owner() then auth_user_role() = 'Owner'
    else auth_user_role() in ('Owner', 'Manager')
  end;
$$;

comment on function auth_can_approve_late_fee_waiver is
  'Late-fee waiver rank (0058, R-22.8): Owner or Manager with no threshold; Owner only while managerApprovalsToOwner is on.';

commit;
