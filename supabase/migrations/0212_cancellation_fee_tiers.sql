-- ============================================================================
-- 0212_cancellation_fee_tiers.sql — written 31 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- T3-03: Settings ▸ Financial ▸ "Cancellation fee tiers": rows of notice
-- before pickup → fee %. When a booking with a paid advance is cancelled,
-- the cancel sheet suggests the fee from the tiers; fee → invoice line
-- "Cancellation fee"; any advance above the fee → refund as a reversal row
-- (Law 4).
--
-- WHAT
-- ----
--   cancellation_fee_tiers  one row per (notice_hours, fee_percent). Owner-only
--                          writes (canManageSettings). Read by desk roles
--                          (canWriteBookingDesk) so the cancel sheet can suggest
--                          a fee. Never deleted (Law 3) — retired rows get
--                          retired_at set.
--
-- RLS / WHO SEES WHAT
-- -------------------
--   read   any desk role (Owner, Admin, Manager, Coordinator) — the cancel
--          sheet suggests a fee from these tiers.
--   write  Owner only (canManageSettings). Revert = widen the role list in
--          set_setting() AND canManageSettings, together (B-3).
--
-- REVERT: drop table cancellation_fee_tiers;
-- ============================================================================

begin;

create table if not exists cancellation_fee_tiers (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  notice_hours  integer      not null check (notice_hours >= 0),
  fee_percent   numeric(5,2) not null check (fee_percent >= 0 and fee_percent <= 100),
  retired_at    timestamptz,
  created_by    uuid         references users (id),
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),

  constraint cancellation_fee_tiers_client_uuid_key unique (client_uuid)
);

create index if not exists idx_cancellation_fee_tiers_notice on cancellation_fee_tiers (notice_hours)
  where retired_at is null;

-- RLS
alter table cancellation_fee_tiers enable row level security;

create policy cancellation_fee_tiers_read on cancellation_fee_tiers
  for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator'));

create policy cancellation_fee_tiers_write on cancellation_fee_tiers
  for all to authenticated
  using (auth_user_role() = 'Owner')
  with check (auth_user_role() = 'Owner');

-- Never deleted (Law 3) — retired rows get retired_at set.
create trigger cancellation_fee_tiers_no_delete
  before delete on cancellation_fee_tiers
  for each row execute function reject_delete_nothing_is_deleted();

commit;
