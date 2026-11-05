-- T3-03: one active fee per notice threshold. Retired rows keep their history.
-- Existing duplicate active thresholds must be reconciled before applying this
-- migration so that no fee is selected arbitrarily.
begin;

create unique index cancellation_fee_tiers_active_notice_key
  on public.cancellation_fee_tiers (notice_hours)
  where retired_at is null;

drop index public.idx_cancellation_fee_tiers_notice;

commit;
