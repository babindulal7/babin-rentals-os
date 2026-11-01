-- Migration 0194 — W68 staff discount Financial setting; Law 6 money boundary.
-- The 20% setting is registered in settingsStore.ts and used by New Rental.
-- Existing 0158 sets is_money using settings_is_money_key; the new key must
-- be money-gated before an Owner can persist it. No live change until deployed.
begin;

create or replace function public.settings_is_money_key(p_key text)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select p_key in (
    'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays', 'overdueStopDays',
    'latePaymentPercentPerMonth', 'allowDepositSkipOnClose', 'staffDiscountPercent'
  );
$$;

-- Defense in depth for a pre-existing value: backfill the RLS classification.
-- Rotate the idempotency UUID so the append-only history trigger can record
-- this classification change without colliding with an earlier settings event.
update public.settings
set is_money = true, last_client_uuid = gen_random_uuid()
where key = 'staffDiscountPercent' and is_money is distinct from true;

commit;
