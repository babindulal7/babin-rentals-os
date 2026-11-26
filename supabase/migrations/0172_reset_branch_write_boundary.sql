-- RULING 2026-10-23: an unbooked Reset item follows its unit's CURRENT
-- warehouse branch (not product_units.branch_id or the actor's home branch).
-- Candidate follow-up to 0171; WRITTEN locally only, never applied remotely.
-- Existing role policies remain necessary: these RESTRICTIVE policies can
-- narrow them, never authorize another role. Both old and new scopes must pass.
begin;

create function public.auth_may_reset_entry(p_booking_id uuid, p_unit_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select public.auth_user_id() is not null and coalesce((
    select scope.branch_id is not null
      and public.auth_may_perform_operation('reset', scope.branch_id)
    from (
      select b.branch_id from public.bookings b
      where p_booking_id is not null and b.id = p_booking_id
      union all
      select w.branch_id from public.product_units u
      join public.warehouses w on w.id = u.warehouse_id
      where p_booking_id is null and u.id = p_unit_id
    ) scope
  ), false);
$$;
revoke all on function public.auth_may_reset_entry(uuid, uuid) from public, anon;
grant execute on function public.auth_may_reset_entry(uuid, uuid) to authenticated, service_role;
comment on function public.auth_may_reset_entry(uuid, uuid) is
  '0172 Reset write scope: booking branch when linked; otherwise current warehouse branch. '
  'Unknown identity/site denies. Invoker lookup preserves RLS; grants only narrow existing roles.';

create policy reset_queue_insert_boundary on public.cleaning_queue_entries
as restrictive for insert to authenticated
with check (public.auth_may_reset_entry(booking_id, unit_id));
create policy reset_queue_update_boundary on public.cleaning_queue_entries
as restrictive for update to authenticated
using (public.auth_may_reset_entry(booking_id, unit_id))
with check (public.auth_may_reset_entry(booking_id, unit_id));
create policy reset_queue_delete_boundary on public.cleaning_queue_entries
as restrictive for delete to authenticated
using (public.auth_may_reset_entry(booking_id, unit_id));

create policy reset_tasks_insert_boundary on public.cleaning_task_results
as restrictive for insert to authenticated
with check (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
));
create policy reset_tasks_update_boundary on public.cleaning_task_results
as restrictive for update to authenticated
using (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
))
with check (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
));
create policy reset_tasks_delete_boundary on public.cleaning_task_results
as restrictive for delete to authenticated
using (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
));

-- Supersedes 0171's action-only Reset claim: direct queue/task writes are now
-- checked in Postgres too. The RPC remains early feedback, not the authority.
comment on function public.assert_operation_branch_grant(text, uuid) is
  'Early booking-branch assertion before floor writes. 0172 additionally enforces '
  'Reset queue/task writes through restrictive RLS (old and new scope).';

commit;
