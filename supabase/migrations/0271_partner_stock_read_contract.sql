-- Read projection for Partner Stock: no PostgREST relationship inference or
-- nonexistent columns. The definer view explicitly applies the temporary_stock
-- SELECT policy's role set and the established Law 6 cost mask.
-- Review and verify on disposable Supabase before applying to any hosted project.
begin;
create view public.partner_stock_read_v with (security_barrier = true) as
select
  t.id,
  s.name as partner_name,
  t.product_id,
  t.tracking_mode,
  t.quantity,
  t.available_from,
  t.available_until,
  case when public.auth_can_view_money() then t.cost_kind else null end as cost_kind,
  case when public.auth_can_view_money() then t.cost_paisa else null end as cost_paisa,
  t.status,
  t.notes,
  t.returned_at,
  t.created_at,
  jsonb_build_object('name', p.name, 'brand', p.brand, 'model', p.model) as products,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'asset_code', u.asset_tag, 'serial_number', u.serial_no, 'status', u.status
    ) order by u.asset_tag, u.id)
    from public.product_units u
    where u.temporary_stock_id = t.id and u.is_partner_unit is true
  ), '[]'::jsonb) as product_units
from public.temporary_stock t
join public.suppliers s on s.id = t.supplier_id
join public.products p on p.id = t.product_id
where public.auth_user_role()::text in
  ('Owner','Admin','Manager','Coordinator','Warehouse','Technician','Accounts');

revoke all on public.partner_stock_read_v from public, anon, authenticated;
grant select on public.partner_stock_read_v to authenticated;
comment on view public.partner_stock_read_v is
  'Role-scoped partner stock listing, with Law 6 cost masking and nonfinancial unit identity only.';

do $$
begin
  if has_table_privilege('anon','public.partner_stock_read_v','SELECT')
    or has_any_column_privilege('anon','public.partner_stock_read_v','SELECT')
    or not has_table_privilege('authenticated','public.partner_stock_read_v','SELECT')
    or has_table_privilege('authenticated','public.partner_stock_read_v','INSERT,UPDATE,DELETE') then
    raise exception 'Partner stock read projection ACL invariant failed';
  end if;
end $$;
commit;
