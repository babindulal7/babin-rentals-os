-- Migration 0250: Products with options and families (T7-13)
-- Allows products differing only in an option (lens mount, cable length, size)
-- to be grouped into a parent product family with an option picker, while each
-- option preserves its own product ID, stock, reservations, and rates.

-- 1. Create table product_families
create table if not exists public.product_families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references public.inventory_categories(id) on delete set null,
  option_dimension text not null default 'Mount',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.product_families enable row level security;

-- 2. Policies on product_families
create policy "product_families_read_public"
  on public.product_families
  for select
  to anon, authenticated
  using (true);

create policy "product_families_insert_staff"
  on public.product_families
  for insert
  to authenticated
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

create policy "product_families_update_staff"
  on public.product_families
  for update
  to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

create policy "product_families_delete_staff"
  on public.product_families
  for delete
  to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- 3. Add family_id and option_label to products
alter table public.products
  add column if not exists family_id uuid references public.product_families(id) on delete set null,
  add column if not exists option_label text;

create index if not exists idx_products_family_id on public.products(family_id);

-- 4. Update public_catalogue_v to expose family_id, option_label, and family metadata
create or replace view public.public_catalogue_v as
select
  p.id,
  'product'::text as kind,
  p.slug,
  p.name,
  c.name::text as category_name,
  coalesce(p.description, '') as description,
  p.photos as photo_paths,
  round(p.daily_rate * 100)::bigint as daily_rate_paisa,
  case when p.weekly_rate is not null and p.weekly_rate > 0 then round(p.weekly_rate * 100)::bigint else null end as weekly_rate_paisa,
  case when p.monthly_rate is not null and p.monthly_rate > 0 then round(p.monthly_rate * 100)::bigint else null end as monthly_rate_paisa,
  '[]'::jsonb as bundle_contents,
  p.family_id,
  p.option_label,
  pf.name as family_name,
  pf.option_dimension
from public.products p
left join public.inventory_categories c on c.id = p.category_id
left join public.product_families pf on pf.id = p.family_id
where p.show_online = true
  and p.online_bundle_only = false
  and p.is_active = true
  and p.daily_rate is not null
  and p.daily_rate > 0

union all

select
  b.id,
  'bundle'::text as kind,
  b.slug,
  b.name,
  coalesce(c.name::text, 'Bundle Deals') as category_name,
  coalesce(b.description, '') as description,
  b.photos as photo_paths,
  round(b.daily_rate * 100)::bigint as daily_rate_paisa,
  case when b.weekly_rate is not null and b.weekly_rate > 0 then round(b.weekly_rate * 100)::bigint else null end as weekly_rate_paisa,
  null::bigint as monthly_rate_paisa,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', ip.name,
          'qty', bi.quantity
        ) order by bi.sort_order, ip.name
      )
      from public.bundle_items bi
      join public.products ip on ip.id = bi.product_id
      where bi.bundle_id = b.id
    ),
    '[]'::jsonb
  ) as bundle_contents,
  null::uuid as family_id,
  null::text as option_label,
  null::text as family_name,
  null::text as option_dimension
from public.bundles b
left join public.inventory_categories c on c.id = b.category_id
where b.show_online = true
  and b.is_active = true
  and b.daily_rate is not null
  and b.daily_rate > 0;

revoke all on public.public_catalogue_v from public, anon, authenticated;
grant select on public.public_catalogue_v to anon, authenticated;

-- 5. Helper RPCs for family grouping and ungrouping
create or replace function public.group_products_into_family(
  p_family_name text,
  p_category_id uuid default null,
  p_option_dimension text default 'Mount',
  p_product_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_family_id uuid;
  v_item jsonb;
  v_prod_id uuid;
  v_opt_label text;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:ONLY_MANAGEMENT_CAN_MANAGE_FAMILIES (attempted by %)', coalesce(v_role, 'anon');
  end if;

  if trim(coalesce(p_family_name, '')) = '' then
    raise exception 'Family name is required';
  end if;

  insert into public.product_families (name, category_id, option_dimension)
  values (trim(p_family_name), p_category_id, coalesce(nullif(trim(p_option_dimension), ''), 'Mount'))
  returning id into v_family_id;

  for v_item in select * from jsonb_array_elements(p_product_options)
  loop
    v_prod_id := (v_item->>'product_id')::uuid;
    v_opt_label := trim(coalesce(v_item->>'option_label', ''));
    if v_prod_id is not null then
      update public.products
      set family_id = v_family_id,
          option_label = nullif(v_opt_label, '')
      where id = v_prod_id;
    end if;
  end loop;

  return v_family_id;
end;
$$;

revoke all on function public.group_products_into_family(text, uuid, text, jsonb) from public, anon;
grant execute on function public.group_products_into_family(text, uuid, text, jsonb) to authenticated;

create or replace function public.ungroup_product_family(
  p_family_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:ONLY_MANAGEMENT_CAN_MANAGE_FAMILIES (attempted by %)', coalesce(v_role, 'anon');
  end if;

  -- Disassociate products first (never delete products!)
  update public.products
  set family_id = null,
      option_label = null
  where family_id = p_family_id;

  delete from public.product_families
  where id = p_family_id;

  return true;
end;
$$;

revoke all on function public.ungroup_product_family(uuid) from public, anon;
grant execute on function public.ungroup_product_family(uuid) to authenticated;
