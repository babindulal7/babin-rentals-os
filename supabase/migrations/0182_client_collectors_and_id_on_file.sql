-- 0182_client_collectors_and_id_on_file.sql
-- Client collectors and ID on file (Rulings W28, W34, W50, W51, Task T2-12)
-- 1. W50: Client needs one ID document on file before first rental.
-- 2. W51: Stored once and reused. Citizenship card does not expire; expiry recorded only when document has one.
-- 3. W28, W34: Client collectors list (name, phone, role/relation, ID photo, ID number).
-- 4. Privacy: ID numbers masked except to Manager+; photos visible to Manager+ and Client portal account only.
-- 5. RLS & column-level permissions enforce that Warehouse cannot read an ID number.

begin;

-- 1. client_id_documents table
create table if not exists public.client_id_documents (
  id                  uuid not null default gen_random_uuid() primary key,
  client_uuid         uuid not null unique,
  client_id           uuid not null references public.clients(id) on delete cascade,
  id_type             text not null check (id_type in ('citizenship_card', 'passport', 'driving_licence', 'pan_card', 'voter_id', 'other')),
  id_number           text not null,
  evidence_file_id    uuid references public.evidence_files(id) on delete set null,
  expiry_date         date,
  verified_at         timestamptz not null default now(),
  verified_by         uuid references public.users(id),
  notes               text,
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id)
);

create index if not exists idx_client_id_documents_client on public.client_id_documents(client_id);
create index if not exists idx_client_id_documents_client_expiry on public.client_id_documents(client_id, expiry_date);

-- 2. client_collectors table
create table if not exists public.client_collectors (
  id                  uuid not null default gen_random_uuid() primary key,
  client_uuid         uuid not null unique,
  client_id           uuid not null references public.clients(id) on delete cascade,
  name                text not null,
  phone               text not null,
  role_title          text,
  id_type             text check (id_type is null or id_type in ('citizenship_card', 'passport', 'driving_licence', 'pan_card', 'voter_id', 'other')),
  id_number           text,
  evidence_file_id    uuid references public.evidence_files(id) on delete set null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid not null references public.users(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.users(id)
);

create index if not exists idx_client_collectors_client on public.client_collectors(client_id);
create index if not exists idx_client_collectors_active on public.client_collectors(client_id) where is_active is true;

-- 3. RLS policies on client_id_documents
alter table public.client_id_documents enable row level security;

drop policy if exists client_id_documents_select on public.client_id_documents;
create policy client_id_documents_select on public.client_id_documents
  for select
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Driver' and exists (
      select 1 from public.bookings b
      where b.client_id = client_id_documents.client_id
        and public.auth_driver_has_open_booking(b.id)
    ))
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  );

drop policy if exists client_id_documents_insert on public.client_id_documents;
create policy client_id_documents_insert on public.client_id_documents
  for insert
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  );

drop policy if exists client_id_documents_update on public.client_id_documents;
create policy client_id_documents_update on public.client_id_documents
  for update
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  )
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_id_documents.client_id = public.auth_client_id())
  );

-- 4. RLS policies on client_collectors
alter table public.client_collectors enable row level security;

drop policy if exists client_collectors_select on public.client_collectors;
create policy client_collectors_select on public.client_collectors
  for select
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Driver' and exists (
      select 1 from public.bookings b
      where b.client_id = client_collectors.client_id
        and public.auth_driver_has_open_booking(b.id)
    ))
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  );

drop policy if exists client_collectors_insert on public.client_collectors;
create policy client_collectors_insert on public.client_collectors
  for insert
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  );

drop policy if exists client_collectors_update on public.client_collectors;
create policy client_collectors_update on public.client_collectors
  for update
  using (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  )
  with check (
    (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
    or (public.auth_user_role() = 'Client' and client_collectors.client_id = public.auth_client_id())
  );

-- 5. Column-level permissions: revoke select on base tables, grant non-sensitive columns
revoke select on public.client_id_documents from authenticated;
grant select (
  id, client_uuid, client_id, id_type, expiry_date,
  verified_at, verified_by, notes,
  created_at, created_by, updated_at, updated_by
) on public.client_id_documents to authenticated;
grant insert, update on public.client_id_documents to authenticated;

revoke select on public.client_collectors from authenticated;
grant select (
  id, client_uuid, client_id, name, phone, role_title, id_type,
  is_active, created_at, created_by, updated_at, updated_by
) on public.client_collectors to authenticated;
grant insert, update on public.client_collectors to authenticated;

-- 6. Masking views for client_id_documents and client_collectors
create or replace view public.client_id_documents_v as
select
  cid.id,
  cid.client_uuid,
  cid.client_id,
  cid.id_type,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cid.client_id = public.auth_client_id())
    then cid.id_number
    else '••••-••••-' || right(cid.id_number, 4)
  end as id_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cid.client_id = public.auth_client_id())
    then cid.evidence_file_id
    else null
  end as evidence_file_id,
  cid.expiry_date,
  cid.verified_at,
  cid.verified_by,
  cid.notes,
  cid.created_at,
  cid.created_by,
  cid.updated_at,
  cid.updated_by
from public.client_id_documents cid
where (
  (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
  or (public.auth_user_role() = 'Driver' and exists (
    select 1 from public.bookings b
    where b.client_id = cid.client_id
      and public.auth_driver_has_open_booking(b.id)
  ))
  or (public.auth_user_role() = 'Client' and cid.client_id = public.auth_client_id())
);

create or replace view public.client_collectors_v as
select
  cc.id,
  cc.client_uuid,
  cc.client_id,
  cc.name,
  cc.phone,
  cc.role_title,
  cc.id_type,
  case
    when cc.id_number is null then null
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cc.client_id = public.auth_client_id())
    then cc.id_number
    else '••••-••••-' || right(cc.id_number, 4)
  end as id_number,
  case
    when public.auth_user_role() in ('Owner', 'Admin', 'Manager')
      or (public.auth_user_role() = 'Client' and cc.client_id = public.auth_client_id())
    then cc.evidence_file_id
    else null
  end as evidence_file_id,
  cc.is_active,
  cc.created_at,
  cc.created_by,
  cc.updated_at,
  cc.updated_by
from public.client_collectors cc
where (
  (public.auth_is_staff() and public.auth_user_role() <> 'Driver')
  or (public.auth_user_role() = 'Driver' and exists (
    select 1 from public.bookings b
    where b.client_id = cc.client_id
      and public.auth_driver_has_open_booking(b.id)
  ))
  or (public.auth_user_role() = 'Client' and cc.client_id = public.auth_client_id())
);

grant select on public.client_id_documents_v to authenticated;
grant select on public.client_collectors_v to authenticated;
revoke select on public.client_id_documents_v from anon;
revoke select on public.client_collectors_v from anon;
revoke all on public.client_id_documents from anon;
revoke all on public.client_collectors from anon;

-- 7. Helper function to check if client has valid ID on file (W50, W51)
create or replace function public.client_has_id_on_file(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.client_id_documents
    where client_id = p_client_id
      and (expiry_date is null or expiry_date >= current_date)
  );
$$;

revoke all on function public.client_has_id_on_file(uuid) from public, anon;
grant execute on function public.client_has_id_on_file(uuid) to authenticated;

commit;
