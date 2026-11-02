-- =============================================================================
-- Migration 0202: staffDiscountPercent is a money setting (Law 6)
--
-- T8-09 (staff renting gear, W68 / Law 10) reads a "Staff rental discount" percentage from Settings ▸
-- Financial (`staffDiscountPercent`, default 20). It was not on the list of money keys in 0158, so the
-- settings read policy would have handed it to Warehouse, Technician and Driver — a discount rate is a
-- money figure and those roles see no money (Law 6).
--
-- RULING 2026-11-01 (R-4): Babin — "2 yes": it is a money setting. Adding a key is a migration, exactly
-- like a permission cell (0158). Only the list changes; the key's value, its default (20, in the app),
-- who may write it (Owner, via set_setting) and every other money key are untouched.
--
-- Rows already saved under this key (none expected — the key was not registered until 1 Nov) are marked
-- is_money so the read policy applies to them too.
--
-- REVERT: re-create settings_is_money_key() without 'staffDiscountPercent' (the list in 0158) and set
-- is_money = false on any rows for that key.
--
-- N-5: written, numbered, tested locally under PGlite. Babin applies after the backup.
-- =============================================================================

begin;

create or replace function settings_is_money_key(p_key text)
returns boolean language sql immutable as $$
  select p_key in (
    'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays', 'overdueStopDays',
    'latePaymentPercentPerMonth', 'allowDepositSkipOnClose',
    'staffDiscountPercent'
  );
$$;

update public.settings
   set is_money = true
 where key = 'staffDiscountPercent'
   and is_money = false;

commit;
