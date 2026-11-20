-- =============================================================================
-- Migration 0255: Booking site and public catalogue (T7-02, S9, D34, W64, B3, B7, B45)
--
-- 1. Adds public online flags and photo fields to products & bundles:
--    - products: show_online (boolean, default false),
--                online_bundle_only (boolean, default false),
--                photos (text[], default '{}'),
--                slug (text)
--    - bundles: show_online (boolean, default false),
--               photos (text[], default '{}'),
--               slug (text)
-- 2. Creates public_catalogue_v view:
--    - Deliberately public catalogue view (security_invoker = false)
--    - Exposes id, kind, slug, name, category_name, description, photo_paths,
--      daily_rate_paisa, weekly_rate_paisa, monthly_rate_paisa, bundle_contents
--    - NEVER exposes purchase_price, replacement_value, serial numbers, stock counts,
--      supplier or internal notes
--    - Enforces W64 filter: show_online = true, online_bundle_only = false (or inside bundle),
--      positive daily rate, and is_active = true
--    - Revokes insert/update/delete from anon and authenticated (prevents 0095 vulnerability)
-- 3. Creates public_availability(p_product_ids uuid[], p_from date, p_to date) RPC:
--    - SECURITY DEFINER, STABLE, search_path = public, pg_temp, statement_timeout = 2s
--    - Bounds: <= 30 IDs, <= 60 days, p_from >= current_date - 1
--    - Returns (product_id uuid, day date, available boolean)
--    - NEVER leaks stock counts, booking numbers, client names, or reservations
-- 4. Ensures public 'catalogue' storage bucket exists with public read and
--    Owner/Admin/Manager upload policy.
-- =============================================================================

begin;

-- 1. Extend products and bundles with online catalogue attributes
alter table public.products
  add column if not exists show_online boolean not null default false,
  add column if not exists online_bundle_only boolean not null default false,
  add column if not exists photos text[] not null default '{}',
  add column if not exists slug text;

alter table public.bundles
  add column if not exists show_online boolean not null default false,
  add column if not exists photos text[] not null default '{}',
  add column if not exists slug text;

-- Helper to generate url-friendly slugs if missing
create or replace function public.generate_catalogue_slug()
returns trigger
language plpgsql
as $$
begin
  if NEW.slug is null or trim(NEW.slug) = '' then
    NEW.slug := lower(regexp_replace(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || substring(NEW.id::text, 1, 8);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_products_catalogue_slug on public.products;
create trigger trg_products_catalogue_slug
  before insert or update of name, slug on public.products
  for each row execute function public.generate_catalogue_slug();

drop trigger if exists trg_bundles_catalogue_slug on public.bundles;
create trigger trg_bundles_catalogue_slug
  before insert or update of name, slug on public.bundles
  for each row execute function public.generate_catalogue_slug();

-- Populate existing rows with slugs
update public.products
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || substring(id::text, 1, 8)
where slug is null or trim(slug) = '';

update public.bundles
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) || '-' || substring(id::text, 1, 8)
where slug is null or trim(slug) = '';

create index if not exists idx_products_online_slug on public.products (slug);
create index if not exists idx_bundles_online_slug on public.bundles (slug);


-- 2. Create public_catalogue_v (view)
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
  '[]'::jsonb as bundle_contents
from public.products p
left join public.inventory_categories c on c.id = p.category_id
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
  ) as bundle_contents
from public.bundles b
left join public.inventory_categories c on c.id = b.category_id
where b.show_online = true
  and b.is_active = true
  and b.daily_rate is not null
  and b.daily_rate > 0;

-- Ensure view is closed for mutation and explicitly granted for select
revoke all on public.public_catalogue_v from public, anon, authenticated;
grant select on public.public_catalogue_v to anon, authenticated;


-- 3. Create public_availability RPC
create or replace function public.public_availability(
  p_product_ids uuid[],
  p_from date,
  p_to date
)
returns table (
  product_id uuid,
  day date,
  available boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
set statement_timeout = '2s'
as $$
declare
  v_count integer;
  v_span integer;
begin
  if p_product_ids is null then
    raise exception 'public_availability: product_ids array is required';
  end if;

  v_count := cardinality(p_product_ids);
  if v_count is null or v_count < 1 or v_count > 30 then
    raise exception 'public_availability: product_ids count must be between 1 and 30 (got %)', coalesce(v_count, 0);
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'public_availability: invalid date range';
  end if;

  v_span := p_to - p_from;
  if v_span > 60 then
    raise exception 'public_availability: date range cannot exceed 60 days (got %)', v_span;
  end if;

  if p_from < (current_date - 1) then
    raise exception 'public_availability: date range cannot start before yesterday';
  end if;

  return query
  with dates as (
    select d::date as day
    from generate_series(p_from::timestamp, p_to::timestamp, '1 day'::interval) as d
  ),
  queried_items as (
    select distinct unnest(p_product_ids) as pid
  ),
  -- Map requested IDs to products (either direct product or bundle components)
  product_expansion as (
    -- Direct products
    select
      qi.pid as requested_id,
      p.id as underlying_product_id,
      1 as required_qty,
      false as is_bundle
    from queried_items qi
    join public.products p on p.id = qi.pid
    union all
    -- Bundles expanded to components
    select
      qi.pid as requested_id,
      bi.product_id as underlying_product_id,
      bi.quantity as required_qty,
      true as is_bundle
    from queried_items qi
    join public.bundles b on b.id = qi.pid
    join public.bundle_items bi on bi.bundle_id = b.id
  ),
  -- Compute capacity of each underlying product
  product_capacity as (
    select
      p.id as product_id,
      case
        when p.tracking_mode = 'Serialised' then (
          select count(*)::integer
          from public.product_units pu
          where pu.product_id = p.id
            and pu.retired_at is null
            and pu.status not in ('Maintenance', 'Missing', 'Retired')
        )
        else coalesce(p.total_quantity, 0)
      end as capacity
    from public.products p
    where p.id in (select underlying_product_id from product_expansion)
  ),
  -- Check availability for each (requested_id, underlying_product_id, day)
  component_day_status as (
    select
      pe.requested_id,
      pe.underlying_product_id,
      d.day,
      pe.required_qty,
      pc.capacity,
      coalesce(
        (
          select sum(ir.qty)::integer
          from public.inventory_reservations ir
          where ir.released_at is null
            and (
              ir.product_id = pe.underlying_product_id
              or ir.asset_id in (
                select pu.id
                from public.product_units pu
                where pu.product_id = pe.underlying_product_id
              )
            )
            and ir.period && tstzrange(
              (d.day::text || ' 06:00:00+05:45')::timestamptz,
              ((d.day + 1)::text || ' 06:00:00+05:45')::timestamptz,
              '[)'
            )
        ),
        0
      ) as reserved_qty
    from product_expansion pe
    cross join dates d
    join product_capacity pc on pc.product_id = pe.underlying_product_id
  )
  select
    cds.requested_id as product_id,
    cds.day,
    -- Available if capacity minus reservations is at least required_qty
    bool_and((cds.capacity - cds.reserved_qty) >= cds.required_qty) as available
  from component_day_status cds
  group by cds.requested_id, cds.day
  order by cds.requested_id, cds.day;
end;
$$;

revoke all on function public.public_availability(uuid[], date, date) from public;
grant execute on function public.public_availability(uuid[], date, date) to anon, authenticated;


-- 4. Catalogue Storage Bucket and Policies
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name)
    values ('catalogue', 'catalogue')
    on conflict (id) do nothing;

    if exists (select 1 from information_schema.columns
      where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
      execute 'update storage.buckets set public = true where id = ''catalogue''';
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    begin
      alter table storage.objects enable row level security;
    exception when insufficient_privilege then
      null;
    end;

    -- Public SELECT for catalogue objects
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_public_read'
    ) then
      create policy "catalogue_public_read"
        on storage.objects for select
        to anon, authenticated
        using (bucket_id = 'catalogue');
    end if;

    -- Staff upload/management (Owner, Admin, Manager)
    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_staff_insert'
    ) then
      create policy "catalogue_staff_insert"
        on storage.objects for insert
        to authenticated
        with check (
          bucket_id = 'catalogue'
          and (
            exists (
              select 1 from public.users u
              where u.id = auth.uid()
                and u.primary_role in ('Owner', 'Admin', 'Manager')
                and u.is_active = true
            )
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_staff_update'
    ) then
      create policy "catalogue_staff_update"
        on storage.objects for update
        to authenticated
        using (
          bucket_id = 'catalogue'
          and (
            exists (
              select 1 from public.users u
              where u.id = auth.uid()
                and u.primary_role in ('Owner', 'Admin', 'Manager')
                and u.is_active = true
            )
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'catalogue_staff_delete'
    ) then
      create policy "catalogue_staff_delete"
        on storage.objects for delete
        to authenticated
        using (
          bucket_id = 'catalogue'
          and (
            exists (
              select 1 from public.users u
              where u.id = auth.uid()
                and u.primary_role in ('Owner', 'Admin', 'Manager')
                and u.is_active = true
            )
          )
        );
    end if;
  end if;
end $$;

commit;
