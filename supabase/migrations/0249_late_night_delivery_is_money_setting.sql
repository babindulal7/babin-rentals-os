-- =============================================================================
-- Migration 0249: lateNightDeliveryRupees is a money setting (Law 6)
--
-- RULING 2026-11-19 (Babin, interview S2 row 5): a late-night or emergency delivery carries a flat extra
-- charge, an amount Babin sets in Settings ▸ Financial (`lateNightDeliveryRupees`, 0 = not set; the app
-- invents no figure). It is a money figure, so the settings read policy must keep it from Warehouse,
-- Technician and Driver (Law 6). Adding a key is a migration, exactly like 0202.
--
-- Only the list changes. The key's value, its default (0, in the app), who may write it (Owner, via
-- set_setting) and every other money key are untouched. Rows already saved under this key (none
-- expected) are marked is_money so the read policy applies to them too.
--
-- REVERT: re-create settings_is_money_key() without 'lateNightDeliveryRupees' (the list in 0202) and set
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
    'staffDiscountPercent',
    'lateNightDeliveryRupees'
  );
$$;

update public.settings
   set is_money = true
 where key = 'lateNightDeliveryRupees'
   and is_money = false;

commit;
