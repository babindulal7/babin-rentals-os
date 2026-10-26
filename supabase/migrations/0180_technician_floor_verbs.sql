-- Migration 0180: Technician can do every floor verb (T2-05, Ruling D3)
-- =============================================================================
-- Ruling D3 (26 Oct 2026): Technician may Pack, Hand over, Return and Reset.
-- Technician stays money-blind (Law 6, auth_can_view_money() unchanged).
--
-- Updates RLS write policies on floor tables to admit Technician alongside
-- ('Owner', 'Admin', 'Manager', 'Warehouse'):
--   - operation_sessions
--   - session_line_movements
--   - packing_lines
--   - handover_lines
--   - return_lines
--   - signatures
--   - cleaning_queue_entries
--   - cleaning_task_results
--   - evidence_files
--   - evidence_references
--   - product_units (update)
-- =============================================================================

begin;

-- 1. operation_sessions
drop policy if exists operation_sessions_all on public.operation_sessions;
create policy operation_sessions_all on public.operation_sessions
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 2. session_line_movements
drop policy if exists session_line_movements_all on public.session_line_movements;
create policy session_line_movements_all on public.session_line_movements
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 3. packing_lines
drop policy if exists packing_lines_all on public.packing_lines;
create policy packing_lines_all on public.packing_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 4. handover_lines
drop policy if exists handover_lines_all on public.handover_lines;
create policy handover_lines_all on public.handover_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 5. return_lines
drop policy if exists return_lines_all on public.return_lines;
create policy return_lines_all on public.return_lines
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 6. signatures
drop policy if exists signatures_all on public.signatures;
create policy signatures_all on public.signatures
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 7. cleaning_queue_entries
drop policy if exists cleaning_queue_entries_all on public.cleaning_queue_entries;
create policy cleaning_queue_entries_all on public.cleaning_queue_entries
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 8. cleaning_task_results
drop policy if exists cleaning_task_results_all on public.cleaning_task_results;
create policy cleaning_task_results_all on public.cleaning_task_results
  for all
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 9. evidence_files
drop policy if exists evidence_files_all on public.evidence_files;
create policy evidence_files_all on public.evidence_files
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  );

-- 10. evidence_references
drop policy if exists evidence_references_all on public.evidence_references;
create policy evidence_references_all on public.evidence_references
  for all
  using (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  )
  with check (
    auth_user_role() = any (array['Owner','Admin','Manager','Warehouse','Technician']::system_role[])
  );

-- 11. product_units (update during movements and status transitions)
drop policy if exists product_units_update on public.product_units;
create policy product_units_update on public.product_units
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Warehouse', 'Technician')
  );

-- 12. booking_stage_transitions (transitions to Packed, On Rent, Returned)
drop policy if exists booking_stage_transitions_insert on public.booking_stage_transitions;
create policy booking_stage_transitions_insert on public.booking_stage_transitions
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
    and actor_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

commit;
