-- 0190_one_time_rider_links.sql
-- T4-08 / W49: One-time rider link for hired delivery riders
-- Ephemeral, job-scoped, non-login access path without money figures.
begin;

-- Table: delivery_job_links
create table public.delivery_job_links (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  job_id uuid not null references public.delivery_jobs(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  rider_name text not null check (length(btrim(rider_name)) >= 2),
  rider_phone text not null check (length(btrim(rider_phone)) >= 7),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id),
  completed_at timestamptz,
  created_by uuid not null references public.users(id),
  constraint delivery_job_links_expires_after_created check (expires_at > created_at)
);

create index delivery_job_links_token_hash_idx on public.delivery_job_links(token_hash)
  where revoked_at is null and completed_at is null;
create index delivery_job_links_job_id_idx on public.delivery_job_links(job_id);
create index delivery_job_links_client_uuid_idx on public.delivery_job_links(client_uuid);

alter table public.delivery_job_links enable row level security;

-- Revoke direct permissions
revoke all on public.delivery_job_links from public, anon, authenticated;

-- Staff read policy: staff can see links for jobs in their branch (or Owner/Admin global)
-- Column-level SELECT grant strictly excludes token_hash (R1)
grant select (
  id,
  client_uuid,
  job_id,
  rider_name,
  rider_phone,
  created_at,
  expires_at,
  revoked_at,
  revoked_by,
  completed_at,
  created_by
) on public.delivery_job_links to authenticated;

create policy delivery_job_links_staff_read on public.delivery_job_links
  for select to authenticated using (
    auth.uid() is not null and exists (
      select 1 from public.delivery_jobs j
      join public.users u on u.id = auth.uid() and u.is_active
      where j.id = delivery_job_links.job_id
        and (
          u.primary_role in ('Owner', 'Admin')
          or (u.primary_role in ('Manager', 'Coordinator', 'Warehouse') and u.branch_id = j.branch_id)
        )
    )
  );

-- Staff RPC: create_rider_link
create or replace function public.create_rider_link(
  p_client_uuid uuid,
  p_job_id uuid,
  p_rider_name text,
  p_rider_phone text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_link_id uuid;
  v_raw_token text;
  v_token_hash text;
begin
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to create rider links' using errcode = '42501';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid is required' using errcode = '22023';
  end if;

  -- Idempotency replay check (Law 8)
  select id into v_link_id from public.delivery_job_links where client_uuid = p_client_uuid;
  if found then
    return jsonb_build_object(
      'link_id', v_link_id,
      'raw_token', null,
      'already_issued', true
    );
  end if;

  select * into v_job from public.delivery_jobs where id = p_job_id;
  if not found then
    raise exception 'Delivery job not found';
  end if;

  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Cannot create a rider link for a finished delivery job';
  end if;

  if length(btrim(coalesce(p_rider_name, ''))) < 2 then
    raise exception 'Rider name is required (minimum 2 characters)';
  end if;

  if length(btrim(coalesce(p_rider_phone, ''))) < 7 then
    raise exception 'Rider phone is required (minimum 7 characters)';
  end if;

  -- Server generates token and SHA-256 hash (R3)
  v_raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_token_hash := encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex');

  insert into public.delivery_job_links (
    client_uuid, job_id, token_hash, rider_name, rider_phone, created_by
  ) values (
    p_client_uuid, p_job_id, v_token_hash, btrim(p_rider_name), btrim(p_rider_phone), v_actor
  ) returning id into v_link_id;

  -- Audit creation (NEVER record raw token)
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Create',
    'Informational',
    'Success',
    'delivery_job_links',
    v_link_id,
    v_actor,
    v_role::system_role,
    v_job.branch_id,
    jsonb_build_object(
      'job_id', p_job_id,
      'rider_name', btrim(p_rider_name),
      'rider_phone', btrim(p_rider_phone)
    )
  );

  return jsonb_build_object(
    'link_id', v_link_id,
    'raw_token', v_raw_token,
    'already_issued', false
  );
end;
$$;

-- Staff RPC: revoke_rider_link
create or replace function public.revoke_rider_link(
  p_link_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if v_actor is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise exception 'Unauthorized to revoke rider links' using errcode = '42501';
  end if;

  select * into v_link from public.delivery_job_links where id = p_link_id;
  if not found then
    raise exception 'Rider link not found';
  end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id;
  if v_role not in ('Owner', 'Admin') and not exists (
    select 1 from public.users u where u.id = v_actor and u.branch_id = v_job.branch_id
  ) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  update public.delivery_job_links
     set revoked_at = now(), revoked_by = v_actor
   where id = p_link_id;

  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, old_values, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Update',
    'Informational',
    'Success',
    'delivery_job_links',
    p_link_id,
    v_actor,
    v_role::system_role,
    v_job.branch_id,
    jsonb_build_object('revoked', false),
    jsonb_build_object('revoked', true, 'job_id', v_link.job_id, 'rider_name', v_link.rider_name)
  );

  return true;
end;
$$;

-- Rider Public RPC: get_rider_job_by_token
create or replace function public.get_rider_job_by_token(
  p_token_hash text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
  v_booking public.bookings%rowtype;
  v_branch public.branches%rowtype;
  v_client public.clients%rowtype;
  v_contact public.client_contacts%rowtype;
  v_items jsonb;
  v_total_qty integer := 0;
  v_pickup_addr text;
  v_delivery_addr text;
  v_contact_name text;
  v_contact_phone text;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  select * into v_link from public.delivery_job_links
   where token_hash = p_token_hash;

  if not found then
    raise exception 'Delivery link does not exist' using errcode = '42501';
  end if;

  if v_link.revoked_at is not null then
    raise exception 'Delivery link has been revoked' using errcode = '42501';
  end if;

  if v_link.expires_at <= now() then
    raise exception 'Delivery link has expired' using errcode = '42501';
  end if;

  if v_link.completed_at is not null then
    raise exception 'Delivery link has already been completed' using errcode = '42501';
  end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id;
  if not found or v_job.status in ('Delivered', 'Failed') then
    raise exception 'Delivery job is no longer active' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = v_job.booking_id;
  select * into v_branch from public.branches where id = v_job.branch_id;
  select * into v_client from public.clients where id = v_booking.client_id;
  if v_booking.contact_id is not null then
    select * into v_contact from public.client_contacts where id = v_booking.contact_id;
  end if;

  -- Pickup and delivery addresses depending on leg
  if v_job.leg = 'Outbound' then
    v_pickup_addr := coalesce(v_branch.name || ', ' || v_branch.address, 'Babin Rentals Main Branch');
    v_delivery_addr := coalesce(v_booking.pickup_location, v_client.address_line, 'Client Location');
  else
    v_pickup_addr := coalesce(v_booking.return_location, v_client.address_line, 'Client Location');
    v_delivery_addr := coalesce(v_branch.name || ', ' || v_branch.address, 'Babin Rentals Main Branch');
  end if;

  v_contact_name := coalesce(v_contact.full_name, v_client.name, 'Client');
  v_contact_phone := coalesce(v_contact.phone, v_client.phone, '');

  -- Aggregate lines / cases without exposing ANY money
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'product_name', coalesce(p.name, bl.description, 'Rental Item'),
      'quantity', bl.qty
    )), '[]'::jsonb),
    coalesce(sum(bl.qty), 0)
  into v_items, v_total_qty
  from public.booking_lines bl
  left join public.products p on p.id = bl.product_id
  where bl.booking_id = v_booking.id
    and bl.voided_at is null;

  -- Strictly money-blind JSON return (Law 6)
  return jsonb_build_object(
    'link_id', v_link.id,
    'job_id', v_job.id,
    'booking_no', v_booking.booking_no,
    'leg', v_job.leg,
    'status', v_job.status,
    'scheduled_at', v_job.scheduled_at,
    'dispatched_at', v_job.dispatched_at,
    'rider_name', v_link.rider_name,
    'rider_phone', v_link.rider_phone,
    'pickup_address', v_pickup_addr,
    'delivery_address', v_delivery_addr,
    'contact_name', v_contact_name,
    'contact_phone', v_contact_phone,
    'item_count', v_total_qty,
    'items', v_items,
    'last_note', v_job.last_note,
    'expires_at', v_link.expires_at
  );
end;
$$;

-- Rider Public RPC: rider_mark_picked_up
create or replace function public.rider_mark_picked_up(
  p_token_hash text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  select * into v_link from public.delivery_job_links where token_hash = p_token_hash for update;
  if not found then raise exception 'Delivery link does not exist' using errcode = '42501'; end if;
  if v_link.revoked_at is not null then raise exception 'Delivery link has been revoked' using errcode = '42501'; end if;
  if v_link.expires_at <= now() then raise exception 'Delivery link has expired' using errcode = '42501'; end if;
  if v_link.completed_at is not null then raise exception 'Delivery link has already been completed' using errcode = '42501'; end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_job.status in ('Delivered', 'Failed') then
    raise exception 'Delivery job is already in a terminal state';
  end if;

  if v_job.status = 'In Transit' then
    return jsonb_build_object('success', true, 'status', 'In Transit');
  end if;

  update public.delivery_jobs
     set status = 'In Transit',
         dispatched_at = coalesce(dispatched_at, now()),
         version = version + 1,
         updated_at = now()
   where id = v_job.id;

  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    gen_random_uuid(),
    v_job.id,
    'Transition',
    v_job.status,
    'In Transit',
    v_link.created_by,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'action', 'picked_up_from_shop'
    )
  );

  return jsonb_build_object('success', true, 'status', 'In Transit');
end;
$$;

-- Rider Public RPC: rider_complete_delivery
create or replace function public.rider_complete_delivery(
  p_token_hash text,
  p_receiver_name text,
  p_signature_svg text default null,
  p_photo_url text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_link public.delivery_job_links%rowtype;
  v_job public.delivery_jobs%rowtype;
  v_clean_receiver text;
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'Invalid delivery token' using errcode = '42501';
  end if;

  v_clean_receiver := btrim(coalesce(p_receiver_name, ''));
  if length(v_clean_receiver) < 2 then
    raise exception 'Receiver name is required (minimum 2 characters)';
  end if;

  select * into v_link from public.delivery_job_links where token_hash = p_token_hash for update;
  if not found then raise exception 'Delivery link does not exist' using errcode = '42501'; end if;
  if v_link.revoked_at is not null then raise exception 'Delivery link has been revoked' using errcode = '42501'; end if;
  if v_link.expires_at <= now() then raise exception 'Delivery link has expired' using errcode = '42501'; end if;
  if v_link.completed_at is not null then raise exception 'Delivery link has already been completed' using errcode = '42501'; end if;

  select * into v_job from public.delivery_jobs where id = v_link.job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;

  if v_job.status = 'Delivered' then
    raise exception 'Delivery job is already marked as Delivered';
  end if;

  if v_job.status = 'Failed' then
    raise exception 'Delivery job is marked as Failed and cannot be completed';
  end if;

  -- Complete the link atomically
  update public.delivery_job_links
     set completed_at = now()
   where id = v_link.id;

  -- Complete the job
  update public.delivery_jobs
     set status = 'Delivered',
         delivered_at = now(),
         received_by = v_clean_receiver,
         version = version + 1,
         updated_at = now()
   where id = v_job.id;

  -- Record event
  insert into public.delivery_job_events (
    request_key, job_id, event_kind, previous_status, next_status, actor_id, metadata
  ) values (
    gen_random_uuid(),
    v_job.id,
    'Transition',
    v_job.status,
    'Delivered',
    v_link.created_by,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'receiver_name', v_clean_receiver,
      'has_signature', p_signature_svg is not null and length(p_signature_svg) > 10,
      'has_photo', p_photo_url is not null and length(p_photo_url) > 5,
      'signature_svg', p_signature_svg,
      'photo_url', p_photo_url
    )
  );

  -- Record audit event
  insert into public.audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, branch_id, new_values
  ) values (
    gen_random_uuid(),
    'status change',
    'Rentals',
    'Operations',
    'Update',
    'Informational',
    'Success',
    'delivery_jobs',
    v_job.id,
    v_link.created_by,
    'Coordinator'::system_role,
    v_job.branch_id,
    jsonb_build_object(
      'rider_name', v_link.rider_name,
      'rider_link_id', v_link.id,
      'receiver_name', v_clean_receiver
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'Delivered',
    'delivered_at', now(),
    'received_by', v_clean_receiver
  );
end;
$$;

-- Function grants:
-- Revoke all execution from public and anon (PG default grants execute on new functions to public)
revoke all on function public.get_rider_job_by_token(text) from public, anon, authenticated;
revoke all on function public.rider_mark_picked_up(text) from public, anon, authenticated;
revoke all on function public.rider_complete_delivery(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_rider_link(uuid, uuid, text, text) from public, anon;
revoke all on function public.revoke_rider_link(uuid) from public, anon;

-- Rider RPCs: service_role ONLY (R1) - mediated exclusively via Edge Function
grant execute on function public.get_rider_job_by_token(text) to service_role;
grant execute on function public.rider_mark_picked_up(text) to service_role;
grant execute on function public.rider_complete_delivery(text, text, text, text) to service_role;

-- Staff RPCs: authenticated staff and service_role
grant execute on function public.create_rider_link(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.revoke_rider_link(uuid) to authenticated, service_role;

-- Verification assertions
do $verify$
begin
  if has_table_privilege('anon', 'public.delivery_job_links', 'INSERT')
     or has_table_privilege('anon', 'public.delivery_job_links', 'UPDATE')
     or has_table_privilege('anon', 'public.delivery_job_links', 'DELETE')
     or has_table_privilege('anon', 'public.delivery_job_links', 'SELECT')
     or has_function_privilege('anon', 'public.create_rider_link(uuid, uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.revoke_rider_link(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0190: delivery_job_links must not expose table access or management to anon';
  end if;

  -- authenticated cannot execute the 3 rider RPCs (service_role only, R1)
  if has_function_privilege('authenticated', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0190: rider RPCs must NOT be executable by authenticated (service_role only)';
  end if;

  -- service_role CAN execute the 3 rider RPCs
  if not has_function_privilege('service_role', 'public.get_rider_job_by_token(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rider_mark_picked_up(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.rider_complete_delivery(text, text, text, text)', 'EXECUTE')
  then
    raise exception '0190: rider RPCs must be executable by service_role';
  end if;

  -- authenticated cannot select column token_hash on delivery_job_links (R1)
  if has_column_privilege('authenticated', 'public.delivery_job_links', 'token_hash', 'SELECT') then
    raise exception '0190: token_hash column must NOT be readable by authenticated';
  end if;

  -- authenticated CAN select id and client_uuid
  if not has_column_privilege('authenticated', 'public.delivery_job_links', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.delivery_job_links', 'client_uuid', 'SELECT')
  then
    raise exception '0190: id and client_uuid must be readable by authenticated';
  end if;
end;
$verify$;

commit;
