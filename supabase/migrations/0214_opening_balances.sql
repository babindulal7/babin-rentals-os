-- ============================================================================
-- 0214_opening_balances.sql — written 31 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- T3-07 (D15): Accounts (or Owner) enters an opening balance once per cash
-- drawer and per bank account, with the date. Daily closing then shows
-- opening + money in − money out = closing per account and carries the closing
-- to the next day. Money in/out includes rental payments, payment reversals,
-- expenses paid, and deposit cash received and returned (deposits are cash
-- held in trust — they move the drawer, never revenue or Outstanding, Law 5).
--
-- WHAT
-- ----
--   opening_balances  one row per (account, date, scope). Append-only: a
--                     correction is a new row (Law 4 spirit). Never deleted
--                     (Law 3) — retired rows get retired_at set.
--
-- RLS / WHO SEES WHAT
-- -------------------
--   read   money roles only (Owner, Admin, Manager, Accounts).
--   write  Owner only (canManageSettings). Revert = widen the role list.
--
-- REVERT: drop table opening_balances;
-- ============================================================================

begin;

create table if not exists opening_balances (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  account_type  text         not null check (account_type in ('cash', 'bank')),
  account_id    uuid         references bank_accounts (id),
  opening_date  date         not null,
  amount        numeric(14,2) not null default 0,
  scope         text         not null default 'org',
  location_id   uuid         references branches (id),
  retired_at    timestamptz,
  created_by    uuid         references users (id),
  created_at    timestamptz  not null default now(),

  constraint opening_balances_client_uuid_key unique (client_uuid),
  constraint opening_balances_scope_location check (
    (scope = 'org' and location_id is null) or (scope = 'location' and location_id is not null)
  ),
  check (
    (account_type = 'cash' and account_id is null) or
    (account_type = 'bank' and account_id is not null)
  )
);

create index if not exists idx_opening_balances_account on opening_balances (account_type, account_id, opening_date desc)
  where retired_at is null;

-- RLS
alter table opening_balances enable row level security;

create policy opening_balances_read on opening_balances
  for select to authenticated
  using (auth_can_view_money() and auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts'));

create policy opening_balances_write on opening_balances
  for all to authenticated
  using (auth_user_role() = 'Owner')
  with check (auth_user_role() = 'Owner');

-- Never deleted (Law 3)
create trigger opening_balances_no_delete
  before delete on opening_balances
  for each row execute function reject_delete_nothing_is_deleted();

commit;
