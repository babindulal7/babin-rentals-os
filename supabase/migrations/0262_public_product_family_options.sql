-- 0262_public_product_family_options.sql
-- T7-13 · Products with options on one page — public read (lane C).
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0262.
--
-- One row per option that is publicly sold. The filters mirror public_catalogue_v (0255)
-- exactly, so a family option is never shown online unless the same product would be shown
-- as a standalone item: show_online, not bundle-only, active, Active status, and a positive
-- daily rate. Rates are the published online rates, in paisa, as public_catalogue_v publishes them.
--
-- The view carries no stock, serials, cost or staff fields. Availability is computed per
-- option by the booking flow, not here.
--
-- REVERT: drop view if exists public.public_product_family_options_v;

begin;

create or replace view public.public_product_family_options_v as
select
  f.id          as family_id,
  f.name        as family_name,
  m.product_id  as product_id,
  m.option_label,
  m.sort_order,
  p.name        as product_name,
  coalesce(p.description, '') as description,
  p.photos      as photo_paths,
  round(p.daily_rate * 100)::bigint as daily_rate_paisa
from public.product_family_members m
join public.product_families f on f.id = m.family_id
join public.products p on p.id = m.product_id
where f.is_active
  and m.is_active
  and p.show_online = true
  and p.online_bundle_only = false
  and p.is_active = true
  and p.status = 'Active'
  and p.daily_rate is not null
  and p.daily_rate > 0;

revoke all on public.public_product_family_options_v from public, anon, authenticated;
grant select on public.public_product_family_options_v to anon, authenticated;

commit;
