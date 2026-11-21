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

commit;
