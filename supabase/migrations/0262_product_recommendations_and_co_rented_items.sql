-- Migration 0252: Product recommendations and co-rented items (T7-12, B1)
-- Provides "often rented with" (up to 6) recommendations for every product:
-- 1. Auto-fills from past 12-month co-occurrences on the same booking (own products only).
-- 2. Allows staff (Owner, Admin, Manager) to customize, pin, and reorder items without being overwritten by auto-fill.
-- 3. Public catalog / anon strictly filters out items where show_online = false.

-- 1. Create table product_recommendations
create table if not exists public.product_recommendations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  recommended_product_id uuid not null references public.products(id) on delete cascade,
  "position" integer not null check ("position" between 1 and 6),
  source text not null check (source in ('auto', 'staff')) default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_recommendations_no_self check (product_id <> recommended_product_id),
  constraint product_recommendations_product_rec_unique unique (product_id, recommended_product_id),
  constraint product_recommendations_product_pos_unique unique (product_id, "position")
);

create index if not exists idx_product_recommendations_prod on public.product_recommendations(product_id);
create index if not exists idx_product_recommendations_rec on public.product_recommendations(recommended_product_id);

-- Enable RLS
alter table public.product_recommendations enable row level security;

-- 2. RLS Policies
-- Authenticated staff can view all recommendations
create policy "product_recommendations_select_staff"
  on public.product_recommendations
  for select
  to authenticated
  using (true);

-- Public / anon can view recommendations ONLY if both parent and recommended product are active and shown online
create policy "product_recommendations_select_public"
  on public.product_recommendations
  for select
  to anon
  using (
    exists (
      select 1 from public.products p1
      where p1.id = product_recommendations.product_id
        and p1.show_online = true
        and p1.is_active = true
    )
    and exists (
      select 1 from public.products p2
      where p2.id = product_recommendations.recommended_product_id
        and p2.show_online = true
        and p2.is_active = true
        and p2.online_bundle_only = false
    )
  );

-- Staff modifications: Owner, Admin, Manager only
create policy "product_recommendations_write_staff"
  on public.product_recommendations
  for all
  to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager'));

-- 3. Function to refresh auto recommendations from 12-month booking history
create or replace function public.refresh_product_recommendations(p_target_product_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prod record;
  v_rec record;
  v_curr_pos integer;
  v_used_positions integer[];
  v_used_rec_ids uuid[];
  v_updated_count integer := 0;
begin
  -- Loop over all target products or a single target product
  for v_prod in
    select id from public.products
    where (p_target_product_id is null or id = p_target_product_id)
      and is_active = true
  loop
    -- Collect positions and product IDs reserved by staff
    v_used_positions := array(
      select pr."position" from public.product_recommendations pr
      where pr.product_id = v_prod.id and pr.source = 'staff'
    );
    v_used_rec_ids := array(
      select pr.recommended_product_id from public.product_recommendations pr
      where pr.product_id = v_prod.id and pr.source = 'staff'
    );

    -- Delete existing auto recommendations for this product
    delete from public.product_recommendations
    where product_id = v_prod.id and source = 'auto';

    -- Find top co-rented own products from the last 365 days
    v_curr_pos := 1;
    for v_rec in
      select
        bl2.product_id as co_product_id,
        count(distinct bl1.booking_id) as co_count
      from public.booking_lines bl1
      join public.booking_lines bl2 on bl1.booking_id = bl2.booking_id and bl1.product_id <> bl2.product_id
      join public.bookings b on b.id = bl1.booking_id
      join public.products p on p.id = bl2.product_id
      where bl1.product_id = v_prod.id
        and bl2.product_id is not null
        and (bl2.supplier_id is null) -- own products only (no sub-rents)
        and (p.is_subrental_only = false)
        and p.is_active = true
        and b.created_at >= now() - interval '365 days'
        and b.stage in ('Booked', 'Packed', 'On Rent', 'Returned', 'Closed')
        and not (bl2.product_id = any(v_used_rec_ids))
      group by bl2.product_id
      order by count(distinct bl1.booking_id) desc, min(bl2.created_at) asc
      limit 6
    loop
      -- Find next available position not occupied by staff
      while v_curr_pos <= 6 and v_curr_pos = any(v_used_positions) loop
        v_curr_pos := v_curr_pos + 1;
      end loop;

      if v_curr_pos <= 6 then
        insert into public.product_recommendations (
          product_id,
          recommended_product_id,
          "position",
          source
        ) values (
          v_prod.id,
          v_rec.co_product_id,
          v_curr_pos,
          'auto'
        )
        on conflict (product_id, "position") do nothing;

        v_used_positions := array_append(v_used_positions, v_curr_pos);
        v_used_rec_ids := array_append(v_used_rec_ids, v_rec.co_product_id);
        v_curr_pos := v_curr_pos + 1;
      end if;
    end loop;

    v_updated_count := v_updated_count + 1;
  end loop;

  return v_updated_count;
end;
$$;

revoke all on function public.refresh_product_recommendations(uuid) from public, anon;
grant execute on function public.refresh_product_recommendations(uuid) to authenticated;

-- 4. RPC for staff to set, reorder, or pin recommendations
create or replace function public.set_staff_product_recommendations(
  p_product_id uuid,
  p_recommendations jsonb default '[]'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_item jsonb;
  v_rec_id uuid;
  v_pos integer;
begin
  v_role := auth_user_role();
  if v_role not in ('Owner', 'Admin', 'Manager') then
    raise exception 'GATE:ONLY_MANAGEMENT_CAN_MANAGE_RECOMMENDATIONS (attempted by %)', coalesce(v_role, 'anon');
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found: %', p_product_id;
  end if;

  -- Delete existing staff rows for this product
  delete from public.product_recommendations
  where product_id = p_product_id and source = 'staff';

  -- Insert new staff rows
  for v_item in select * from jsonb_array_elements(p_recommendations)
  loop
    v_rec_id := (v_item->>'recommended_product_id')::uuid;
    v_pos := (v_item->>'position')::integer;

    if v_rec_id is not null and v_pos between 1 and 6 and v_rec_id <> p_product_id then
      -- Delete any auto row at this position or with this recommended_product_id
      delete from public.product_recommendations
      where product_id = p_product_id and ("position" = v_pos or recommended_product_id = v_rec_id);

      insert into public.product_recommendations (
        product_id,
        recommended_product_id,
        "position",
        source
      ) values (
        p_product_id,
        v_rec_id,
        v_pos,
        'staff'
      )
      on conflict (product_id, "position") do update
      set recommended_product_id = excluded.recommended_product_id,
          source = 'staff',
          updated_at = now();
    end if;
  end loop;

  -- Refresh auto fill for any remaining slots 1..6
  perform public.refresh_product_recommendations(p_product_id);

  return true;
end;
$$;

revoke all on function public.set_staff_product_recommendations(uuid, jsonb) from public, anon;
grant execute on function public.set_staff_product_recommendations(uuid, jsonb) to authenticated;

-- 5. Public helper RPC to fetch active online recommendations for a product
create or replace function public.get_public_product_recommendations(p_product_id uuid)
returns table (
  id uuid,
  name text,
  daily_rate_paisa bigint,
  photo_paths text[],
  category_name text,
  "position" integer,
  source text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Public query: both target product and recommended item must be active and show_online
  return query
  select
    p.id,
    p.name,
    round(p.daily_rate * 100)::bigint as daily_rate_paisa,
    p.photos as photo_paths,
    c.name::text as category_name,
    pr."position",
    pr.source
  from public.product_recommendations pr
  join public.products target on target.id = pr.product_id
  join public.products p on p.id = pr.recommended_product_id
  left join public.inventory_categories c on c.id = p.category_id
  where pr.product_id = p_product_id
    and target.show_online = true
    and target.is_active = true
    and p.show_online = true
    and p.is_active = true
    and p.online_bundle_only = false
    and p.daily_rate is not null
    and p.daily_rate > 0
  order by pr."position" asc
  limit 6;
end;
$$;

revoke all on function public.get_public_product_recommendations(uuid) from public, anon;
grant execute on function public.get_public_product_recommendations(uuid) to authenticated;
