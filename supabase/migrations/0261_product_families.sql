-- 0261_product_families.sql
-- T7-13 · Products with options on one page — data layer (lane C).
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0261.
--
-- A family groups products that differ only by an option (lens mount, cable length, size).
-- Each option stays its own product with its own stock, rate and serials. Grouping never
-- pools stock. A product belongs to at most one family (product_family_members.product_id unique).
--
-- Writes are NOT granted here. Grouping and ungrouping go through a later RPC, restricted to
-- Owner/Admin/Manager (canManageProductFamilies in src/lib/productFamilies.ts). Until then
-- RLS permits reads only.
--
-- REVERT: drop table if exists public.product_family_members;
--         drop table if exists public.product_families;

begin;

create table if not exists public.product_families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean not null default true,
  client_uuid uuid not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint product_families_name_length check (char_length(btrim(name)) between 1 and 160)
);

create table if not exists public.product_family_members (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.product_families (id) on delete restrict,
  product_id   uuid not null unique references public.products (id) on delete restrict,
  option_label text not null,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  client_uuid  uuid not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint product_family_members_label_length check (char_length(btrim(option_label)) between 1 and 80),
  constraint product_family_members_one_label_per_family unique (family_id, option_label)
);

comment on table public.product_families is
  'Option groups for products that differ only by an option (T7-13). Presentation only; stock stays per product.';
comment on table public.product_family_members is
  'Links one product to one family under an option label. A product is in at most one family. Retired with is_active = false (Law 3).';

create index if not exists product_family_members_family_idx
  on public.product_family_members (family_id);

alter table public.product_families enable row level security;
alter table public.product_family_members enable row level security;

drop policy if exists product_families_select on public.product_families;
create policy product_families_select on public.product_families
for select to authenticated
using (public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

drop policy if exists product_family_members_select on public.product_family_members;
create policy product_family_members_select on public.product_family_members
for select to authenticated
using (public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

revoke all on public.product_families from anon;
revoke all on public.product_family_members from anon;
revoke delete on public.product_families from authenticated;
revoke delete on public.product_family_members from authenticated;


-- Grouping RPC (T7-13). Owner, Admin and Manager only (canManageProductFamilies).
-- Idempotent on p_client_uuid (Law 8). Products must be active and not already in a family.
create or replace function public.group_products_into_family(
  p_client_uuid uuid,
  p_family_name text,
  p_members jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_member jsonb;
begin
  if public.auth_user_role() not in ('Owner', 'Admin', 'Manager') then
    raise exception 'permission denied: only Owner, Admin or Manager can group products'
      using errcode = '42501';
  end if;

  select id into v_family_id from public.product_families where client_uuid = p_client_uuid;
  if v_family_id is not null then
    return v_family_id;
  end if;

  if p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) < 2 then
    raise exception 'a family needs at least two options';
  end if;

  insert into public.product_families (name, client_uuid)
  values (btrim(p_family_name), p_client_uuid)
  returning id into v_family_id;

  for v_member in select * from jsonb_array_elements(p_members) loop
    if not exists (
      select 1 from public.products p
      where p.id = (v_member->>'product_id')::uuid and p.is_active and p.status = 'Active'
    ) then
      raise exception 'product % is not an active product', v_member->>'product_id';
    end if;
    insert into public.product_family_members
      (family_id, product_id, option_label, sort_order, client_uuid)
    values (
      v_family_id,
      (v_member->>'product_id')::uuid,
      btrim(v_member->>'option_label'),
      coalesce((v_member->>'sort_order')::int, 0),
      (v_member->>'client_uuid')::uuid
    );
  end loop;

  return v_family_id;
end;
$$;

revoke all on function public.group_products_into_family(uuid, text, jsonb) from public, anon;
grant execute on function public.group_products_into_family(uuid, text, jsonb) to authenticated;

commit;
