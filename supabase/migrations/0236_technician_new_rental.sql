-- ============================================================================
-- 0236_technician_new_rental.sql
--
-- RULING 2026-11-10: G-10, G-18 (Card 6 — Technician New Rental, W1 scope)
--
-- Grants Technician INSERT-only permission to create a booking via
-- create_booking(jsonb) (bookings, booking_lines, booking_line_units) and
-- confirm it to Booked (booking_stage_transitions_insert already admits
-- Technician since 0180).
--
-- Deliberately DOES NOT grant:
--   * bookings_update / booking_lines_update / booking_lines_delete (no cancel,
--     no extend, no edit of existing bookings)
--   * booking_discounts (create_booking rejects discounts when
--     not auth_can_view_money() — Law 6)
--
-- Revert:
--   Restore bookings_insert, booking_lines_all, and booking_line_units_all
--   to ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'), and restore
--   get_model_daily_rate(uuid,uuid) guard to auth_user_role() not in ('Warehouse').
-- ============================================================================

begin;

-- 1. bookings: Technician may INSERT new bookings; UPDATE stays BOOKING_DESK only.
drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert on public.bookings
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

-- 2. booking_lines: split FOR ALL into INSERT (includes Technician) vs UPDATE/DELETE (BOOKING_DESK only).
drop policy if exists booking_lines_all on public.booking_lines;

drop policy if exists booking_lines_insert on public.booking_lines;
create policy booking_lines_insert on public.booking_lines
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

drop policy if exists booking_lines_update on public.booking_lines;
create policy booking_lines_update on public.booking_lines
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

drop policy if exists booking_lines_delete on public.booking_lines;
create policy booking_lines_delete on public.booking_lines
  for delete
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

-- 3. booking_line_units: split FOR ALL into INSERT (includes Technician) vs UPDATE/DELETE (BOOKING_DESK only).
drop policy if exists booking_line_units_all on public.booking_line_units;

drop policy if exists booking_line_units_insert on public.booking_line_units;
create policy booking_line_units_insert on public.booking_line_units
  for insert
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse', 'Technician')
  );

drop policy if exists booking_line_units_update on public.booking_line_units;
create policy booking_line_units_update on public.booking_line_units
  for update
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  )
  with check (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

drop policy if exists booking_line_units_delete on public.booking_line_units;
create policy booking_line_units_delete on public.booking_line_units
  for delete
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  );

-- 4. get_model_daily_rate: preserve server-side pricing inside create_booking
--    (app.in_create_booking = 'on') for Technician as well as Warehouse (0170).
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.get_model_daily_rate(uuid,uuid)'::regprocedure) into definition;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(
    definition,
    E'auth_user_role() not in (''Warehouse'')',
    E'auth_user_role() not in (''Warehouse'', ''Technician'')'
  );
  execute definition;
end $migration$;

commit;
