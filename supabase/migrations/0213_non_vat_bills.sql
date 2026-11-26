-- ============================================================================
-- 0213_non_vat_bills.sql — written 31 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- T3-04 (D13): Each invoice carries a VAT treatment — Standard 13% or
-- Non-VAT bill. A zero VAT amount alone is not a tax status (OPEN_DECISIONS §15);
-- Babin has ruled that non-VAT bills are a distinct category.
--
-- WHAT
-- ----
--   1. Add `vat_treatment` enum ('standard', 'non_vat') to invoices.
--   2. Add `vat_treatment` column to invoices (default 'standard').
--   3. Backfill existing zero-VAT invoices as 'non_vat' with an audit note.
--   4. Create index for filtering by treatment.
--
-- REVERT: drop column vat_treatment from invoices; drop type vat_treatment;
-- ============================================================================

begin;

-- 1. Create the VAT treatment enum if not exists
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vat_treatment') then
    create type vat_treatment as enum (
      'standard',
      'non_vat'
    );
  end if;
end $$;

-- 2. Add the column to invoices
alter table invoices
  add column if not exists vat_treatment vat_treatment not null default 'standard';

-- 3. Backfill: existing zero-VAT invoices are labelled Non-VAT bill.
--    Records how each was classified via an audit note in the invoice notes.
update invoices
  set vat_treatment = 'non_vat',
      notes = coalesce(notes, '') || case when notes is not null and notes != '' then E'\n' else '' end || '[Backfilled: classified as Non-VAT bill — zero VAT amount at issuance]'
  where vat_amount = 0
    and vat_rate = 0
    and vat_treatment = 'standard';

-- 4. Index for filtering
create index if not exists idx_invoices_vat_treatment on invoices (vat_treatment);

-- 5. Trigger: auto-set vat_treatment based on vat_rate on insert/update.
--    A zero VAT rate means a non-VAT bill; anything else is standard.
create or replace function set_invoice_vat_treatment()
returns trigger language plpgsql as $$
begin
  if new.vat_rate = 0 then
    new.vat_treatment := 'non_vat';
  else
    new.vat_treatment := 'standard';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_vat_treatment_trigger on invoices;
create trigger invoices_vat_treatment_trigger
  before insert or update of vat_rate on invoices
  for each row execute function set_invoice_vat_treatment();

commit;
