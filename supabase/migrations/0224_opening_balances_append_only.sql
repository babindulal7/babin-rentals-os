-- T3-07 requires append-only opening balances: a correction is a new row.
-- 0214 documented this rule but only installed the DELETE backstop. Its Owner
-- policy still permits UPDATE, allowing historical amounts and account scope
-- to be overwritten. Use the existing Law 3/4 trigger backstop for every role.
-- WRITTEN locally. Never applied to live by this migration's author (N-5).

begin;

create trigger opening_balances_no_update
  before update on public.opening_balances
  for each row execute function public.reject_update_append_only(
    'insert a new opening balance row with the corrected amount, account and date'
  );

comment on trigger opening_balances_no_update on public.opening_balances is
  'T3-07: opening balances are append-only, including their amount, scope and metadata. Corrections are new rows.';

commit;
