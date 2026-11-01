-- 0188_staff_renting_gear.sql
-- Staff renting gear (Ruling W68, Task T8-09)
-- 1. A client can be marked Staff (`is_staff: boolean`), linked to the staff member's user (`staff_user_id: uuid`).
-- 2. Staff client's bookings get a 20% staff discount line automatically (W68), shown and removable like any other discount (Law 10 — no approval gate).
-- 3. Everything else is a normal client booking: deposit, ID on file, invoice, payments.
-- 4. Add 'Staff' to public.discount_source enum.
-- 5. Expose `is_staff` and `staff_user_id` on `clients_v` and `client_directory_v`. Neither is monetary, so neither is masked by auth_can_view_money().

begin;

-- 1. Add 'Staff' to discount_source enum
alter type public.discount_source add value if not exists 'Staff';

-- 2. Add is_staff and staff_user_id to clients
alter table public.clients
  add column if not exists is_staff boolean not null default false,
  add column if not exists staff_user_id uuid references public.users(id);

create index if not exists clients_is_staff_idx on public.clients(is_staff) where is_staff is true;
create index if not exists clients_staff_user_id_idx on public.clients(staff_user_id) where staff_user_id is not null;

-- 3. Column-level permissions on clients (Law 6 / 0130):
-- authenticated already has insert/update on clients; grant select on the two new operational columns.
grant select (is_staff, staff_user_id) on public.clients to authenticated;

-- 4. Recreate clients_v with is_staff and staff_user_id appended
create or replace view public.clients_v as
 select id,
    client_uuid,
    client_code,
    type_parent,
    org_subtype,
    name,
    phone,
    email,
    pan_vat,
    business_registration,
    website,
    government_id_kind,
    government_id_number,
    address_line,
    city,
    district,
    postal_code,
    country,
    billing_address,
        case
            when auth_can_view_money() then approved_credit_limit
            else null::numeric
        end as approved_credit_limit,
        case
            when auth_can_view_money() then payment_terms
            else null::payment_terms
        end as payment_terms,
    client_since,
    professions,
    segments,
    source,
    referred_by_client_id,
    tags,
    preferred_contact_channels,
    marketing_photo_consent,
    notes,
    assigned_staff_id,
    status,
    deactivated_at,
    deactivated_by,
    deactivation_reason,
    merged_into_client_id,
    portal_default_language,
    created_at,
    created_by,
    updated_at,
    is_staff,
    staff_user_id
   from public.clients
  where auth_is_staff();

grant select on public.clients_v to authenticated;
revoke all on public.clients_v from anon;

-- 5. Recreate client_directory_v with is_staff and staff_user_id appended
create or replace view public.client_directory_v as
select
  c.id,
  c.client_code,
  c.name,
  c.phone,
  c.email,
  c.address_line,
  c.city,
  c.district,
  c.country,
  c.status,
  c.client_since,
  c.type_parent,
  c.org_subtype,
  c.pan_vat,
  c.deactivated_at,
  c.created_at,
  c.approved_credit_limit,
  c.payment_terms,

  case when auth_can_view_money() then coalesce(inv.outstanding_total, 0) else null end
    as outstanding_amount,
  case when auth_can_view_money() then coalesce(dep.held_total, 0) else null end
    as deposit_held_amount,
  case when auth_can_view_money() then coalesce(pay.paid_total, 0) else null end
    as total_paid_amount,

  coalesce(bk.active_count, 0)  as active_bookings_count,
  coalesce(bk.total_count, 0)   as total_bookings_count,
  bk.last_pickup_at,

  ct.full_name    as contact_name,
  ct.designation  as contact_designation,
  ct.phone        as contact_phone,

  mem.level       as membership_level,

  coalesce(doc.total_count, 0)    as kyc_docs_count,
  coalesce(doc.verified_count, 0) as kyc_verified_count,

  exists (
    select 1
    from client_flags f
    where f.client_id = c.id
      and f.flag_type = 'Blocked'
      and f.removed_at is null
  ) as is_blocked,

  c.is_staff,
  c.staff_user_id
from public.clients_v c
left join lateral (
  select sum(i.outstanding_amount) as outstanding_total
  from invoices i
  where i.client_id = c.id
) inv on true
left join lateral (
  select sum(greatest(s.received_amount - s.refunded_amount - s.applied_amount, 0)) as held_total
  from security_deposits s
  where s.client_id = c.id
) dep on true
left join lateral (
  select sum(p.amount) as paid_total
  from payments p
  where p.client_id = c.id and p.status = 'Received'
) pay on true
left join lateral (
  select
    count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null) as active_count,
    count(*)                                                              as total_count,
    max(b.pickup_at)                                                      as last_pickup_at
  from bookings b
  where b.client_id = c.id
) bk on true
left join lateral (
  select k.full_name, k.designation, k.phone
  from client_contacts k
  where k.client_id = c.id and k.deactivated_at is null
  order by k.is_primary desc, k.created_at
  limit 1
) ct on true
left join lateral (
  select p.level
  from client_memberships m
  join membership_plans p on p.id = m.plan_id
  where m.client_id = c.id and m.superseded_at is null
  order by m.join_date desc
  limit 1
) mem on true
left join lateral (
  select
    count(*)                                        as total_count,
    count(*) filter (where d.status = 'Verified')   as verified_count
  from client_documents d
  where d.client_id = c.id and d.archived_at is null
) doc on true
where auth_is_staff();

grant select on public.client_directory_v to authenticated;
revoke all on public.client_directory_v from anon;

-- 6. Add is_staff and staff_user_id to record editor private allowed fields
create or replace function record_editor_private.fields(kind text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
select case kind
when 'client' then array['type_parent','org_subtype','name','phone','email','pan_vat','business_registration','website','address_line','city','district','postal_code','country','billing_address','notes','is_staff','staff_user_id']
when 'equipment' then array['name','short_name','category_id','brand','model','manufacturer','description','reorder_level','quantity_unit','purchase_date','purchase_price','replacement_value','daily_rate','weekly_rate','monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed','min_rental_days','rental_enabled','prep_time_minutes','cleaning_time_minutes','inspection_required','packing_required','notes_internal','notes_warehouse']
when 'bundle' then array['name','description','category_id','daily_rate','weekly_rate','is_active'] end;
$$;

revoke all on function record_editor_private.fields(text) from public, anon;
grant execute on function record_editor_private.fields(text) to authenticated;

create or replace function record_editor_private.section_fields(p_kind text, p_section text)
returns text[]
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
select case p_kind
  when 'client' then
    case p_section
      when 'identity' then array['type_parent', 'org_subtype', 'name', 'pan_vat', 'business_registration', 'website', 'is_staff', 'staff_user_id']
      when 'contact' then array['phone', 'email', 'website']
      when 'address' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'addresses' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'notes' then array['notes']
      when 'commercial' then array[]::text[]
      else null
    end
  when 'equipment' then
    case p_section
      when 'identity' then array['name', 'short_name', 'category_id', 'brand', 'model', 'manufacturer', 'description']
      when 'location' then array[]::text[]
      when 'stock' then array['quantity_unit', 'reorder_level']
      when 'relationships' then array[]::text[]
      when 'purchase' then array['purchase_date', 'purchase_price', 'replacement_value']
      when 'pricing' then array['daily_rate', 'weekly_rate', 'monthly_rate', 'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed', 'min_rental_days', 'rental_enabled']
      when 'maintenance' then array['prep_time_minutes', 'cleaning_time_minutes', 'inspection_required', 'packing_required', 'notes_internal', 'notes_warehouse']
      else null
    end
  when 'bundle' then
    case p_section
      when 'identity' then array['name', 'description', 'category_id', 'is_active']
      when 'rates' then array['daily_rate', 'weekly_rate']
      when 'components' then array[]::text[]
      else null
    end
  else null
end;
$$;

revoke all on function record_editor_private.section_fields(text, text) from public, anon;
grant execute on function record_editor_private.section_fields(text, text) to authenticated;

commit;
