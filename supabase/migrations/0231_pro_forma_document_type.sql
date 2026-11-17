-- 0231_pro_forma_document_type.sql
-- T3-27: Pro forma invoice from the draft (B18, B55, Law 6, Law 7, N-6)
--
-- 1. Add 'Pro Forma' to document_type and booking_document_type enums (adding value only - N-6).
-- 2. Update document_registry_role_read_scope so Technician and Warehouse remain strictly money-blind
--    and cannot view Pro Forma documents (Law 6).

alter type public.document_type add value if not exists 'Pro Forma';
alter type public.booking_document_type add value if not exists 'Pro Forma';

-- Keep registry reads within the Documents permissions matrix (Law 6 money-blindness).
-- Using document_type::text avoids Postgres 55P04 (unsafe use of new enum value in same transaction).
drop policy if exists document_registry_role_read_scope on public.document_registry;
create policy document_registry_role_read_scope on public.document_registry
  as restrictive for select to authenticated
  using (
    auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Accounts')
    or (
      auth_user_role() = 'Technician'
      and document_type::text not in ('Quotation', 'Tax Invoice', 'Receipt', 'Credit Note', 'Debit Note', 'Pro Forma')
    )
    or (
      auth_user_role() = 'Warehouse'
      and document_type::text in ('Rental Agreement', 'Packing List', 'Delivery Note')
    )
  );

comment on policy document_registry_role_read_scope on public.document_registry is
  'Documents matrix and Law 6: finance-capable staff read all types; Technician reads operational types (excluding Pro Forma, invoices, quotes, receipts); Warehouse reads agreement, packing list and delivery note only; Driver is excluded.';
