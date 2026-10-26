-- 0178_quantity_only_reset.sql
-- Allow recording quantity-only reset completion in cleaning_queue_entries.
-- Previously unit_id was NOT NULL, restricting Reset to serialised gear only.
-- Quantity items (cables, stands, accessories, consumables) are tracked at line level
-- and need truthful queue recording, completion timestamps, and QC attribution.

begin;

-- 1. Allow unit_id to be nullable for quantity-tracked items
alter table public.cleaning_queue_entries
  alter column unit_id drop not null;

-- 2. Add booking_line_id to link quantity items directly to their booking line
alter table public.cleaning_queue_entries
  add column if not exists booking_line_id uuid references public.booking_lines (id);

-- 3. Add quantity column for quantity-tracked lines
alter table public.cleaning_queue_entries
  add column if not exists qty int not null default 1;

-- 4. Ensure at least one target is specified (unit_id or booking_line_id) and qty is positive
alter table public.cleaning_queue_entries
  drop constraint if exists cleaning_queue_entries_unit_or_line;

alter table public.cleaning_queue_entries
  add constraint cleaning_queue_entries_unit_or_line
  check (unit_id is not null or booking_line_id is not null);

alter table public.cleaning_queue_entries
  drop constraint if exists cleaning_queue_entries_qty_positive;

alter table public.cleaning_queue_entries
  add constraint cleaning_queue_entries_qty_positive
  check (qty > 0);

-- 5. Index for booking_line_id lookups
create index if not exists idx_cleaning_queue_entries_booking_line_id
  on public.cleaning_queue_entries (booking_line_id);

-- 6. Update auth_may_reset_entry to handle null p_unit_id gracefully
create or replace function public.auth_may_reset_entry(p_booking_id uuid, p_unit_id uuid)
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
      where p_booking_id is null and p_unit_id is not null and u.id = p_unit_id
    ) scope
  ), false);
$$;

revoke all on function public.auth_may_reset_entry(uuid, uuid) from public, anon;
grant execute on function public.auth_may_reset_entry(uuid, uuid) to authenticated, service_role;

comment on column public.cleaning_queue_entries.booking_line_id is
  'For quantity-tracked items without physical serial units, points to the booking line.';
comment on column public.cleaning_queue_entries.qty is
  'Quantity of items represented by this queue entry (defaults to 1 for serialised units).';

commit;
