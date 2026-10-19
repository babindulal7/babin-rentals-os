-- ASTRA Phase 0. WRITTEN locally; never apply remotely without N-5 cutover.
-- Existing bytes/records are retained. Unregistered legacy objects fail closed
-- pending the explicit legacy-path mapping decision in OPEN_DECISIONS.md.
begin;

-- SEC-02: estimate is an internal payment-trigger helper, not an API endpoint.
revoke execute on function public.booking_estimate_total(uuid) from public, anon, authenticated;
grant execute on function public.booking_estimate_total(uuid) to service_role;
-- create_booking is SECURITY INVOKER and already marks its pricing transaction.
-- Preserve server pricing for money-blind floor creation without exposing a
-- scalar RPC outside that trusted transaction. No API action sets arbitrary GUCs.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('public.get_model_daily_rate(uuid,uuid)'::regprocedure) into definition;
  definition := replace(definition, E'\r\n', E'\n');
  definition := replace(definition, E'begin\n', E'begin\n  if not auth_can_view_money() and (auth_user_role() not in (''Warehouse'') or current_setting(''app.in_create_booking'', true) is distinct from ''on'') then\n    raise exception ''Financial rate access is not permitted'' using errcode = ''42501'';\n  end if;\n');
  execute definition;
end $migration$;

-- SEC-03: direct client writes cannot claim another human/role. Definer-written
-- server receipts retain their actor (including legitimately attested floor PINs).
create function public.bind_direct_audit_actor() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' then
    if not auth_is_staff() then
      raise exception 'Direct audit submission requires active staff' using errcode = '42501';
    end if;
    new.actor_id := auth_user_id();
    new.actor_role := auth_user_role();
    new.created_at := now();
  end if;
  return new;
end $$;
revoke all on function public.bind_direct_audit_actor() from public, anon, authenticated;
create trigger bind_direct_audit_actor before insert on public.audit_events
for each row execute function public.bind_direct_audit_actor();

-- SEC-04: retain existing last-Owner/self-deactivation invariants while checking
-- the OLD target as well as the NEW privilege level.
create function public.guard_admin_superior_target() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id is distinct from old.id then
    raise exception 'User identity cannot be changed' using errcode = '42501';
  end if;
  if auth_user_role() = 'Admin' and (old.primary_role = 'Owner' or (old.primary_role = 'Admin' and (
    old.id <> auth_user_id() or new.primary_role is distinct from old.primary_role
    or new.is_active is distinct from old.is_active or new.deactivated_at is distinct from old.deactivated_at
    or new.branch_id is distinct from old.branch_id
  ))) then
    raise exception 'Admin cannot modify Owner or Admin accounts' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_admin_superior_target() from public, anon, authenticated;
create trigger guard_admin_superior_target before update on public.users
for each row execute function public.guard_admin_superior_target();

-- SEC-05: no recursion through bookings/client RLS when testing driver scope.
create function public.auth_driver_has_open_booking(p_booking uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select auth_user_role() = 'Driver' and exists (
    select 1 from public.delivery_jobs j join public.bookings b on b.id=j.booking_id
    where b.cancelled_at is null and b.archived_at is null and b.stage <> 'Closed' and j.booking_id = p_booking and j.assigned_driver_id = auth_user_id()
      and j.status in ('Scheduled','Ready','In Transit')
  );
$$;
revoke all on function public.auth_driver_has_open_booking(uuid) from public, anon;
grant execute on function public.auth_driver_has_open_booking(uuid) to authenticated;
drop policy clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  (auth_is_staff() and auth_user_role() <> 'Driver')
  or (auth_user_role() = 'Client' and id = auth_client_id())
);
drop policy bookings_select on public.bookings;
create policy bookings_select on public.bookings for select to authenticated using (
  (auth_is_staff() and auth_user_role() <> 'Driver')
  or (auth_user_role() = 'Client' and client_id = auth_client_id())
  or auth_driver_has_open_booking(id)
);
drop policy booking_lines_select on public.booking_lines;
create policy booking_lines_select on public.booking_lines for select to authenticated using (
  (auth_is_staff() and auth_user_role() <> 'Driver')
  or auth_driver_has_open_booking(booking_id)
  or (auth_user_role() = 'Client' and exists (
    select 1 from public.bookings b where b.id = booking_id and b.client_id = auth_client_id()
  ))
);

-- Driver contact details belong inside a trip, not the client-directory row
-- (which also contains identity/tax/billing fields). Provide a narrow DTO.
create function public.driver_trip_context(p_booking uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not auth_driver_has_open_booking(p_booking) then
    raise exception 'An assigned open trip is required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'bookingId',b.id,'bookingNo',b.booking_no,'pickupAt',b.pickup_at,'returnAt',b.return_at,
    'clientName',c.name,'clientPhone',c.phone,'clientAddress',c.address_line,
    'pickupLocation',b.pickup_location,'returnLocation',b.return_location,
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'description',l.description,'quantity',l.qty))
      from booking_lines l where l.booking_id=b.id and l.voided_at is null),'[]'::jsonb)
  ) into result from bookings b join clients c on c.id=b.client_id where b.id=p_booking;
  return result;
end $$;
revoke all on function public.driver_trip_context(uuid) from public, anon;
grant execute on function public.driver_trip_context(uuid) to authenticated;

-- Definer masking views intentionally bypass base-table column grants/RLS.
-- Their old broad staff predicates must not reopen the Driver directory.
-- Keep the staff-roster exception explicitly required by PERMISSIONS P9.
do $views$
declare v record; definition text;
begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v' and c.relname <> 'staff_directory_v'
  loop
    select regexp_replace(pg_get_viewdef(format('public.%I',v.relname)::regclass,true),';[[:space:]]*$','') into definition;
    execute format('create or replace view public.%I as select scoped.* from (%s) scoped where public.auth_user_role() <> ''Driver''',v.relname,definition);
  end loop;
end $views$;

-- SEC-01: scoped storage access, without creating or deleting any business data.
-- A legacy signed URL is itself a bearer capability. Keep operational metadata
-- readable under 0145, but never return original-file/signature URLs to a
-- money-blind role. Column ACLs enforce this even through direct API queries.
revoke select on public.document_registry from public, anon, authenticated;
revoke select(file_url, signature_url) on public.document_registry from public, anon, authenticated;
grant select(id,client_uuid,document_no,document_type,booking_id,client_id,
  lifecycle_status,file_size_bytes,generated_by,signed_at,signed_by_name,
  voided_at,void_reason,created_at,created_by,updated_at,updated_by)
on public.document_registry to authenticated;

create function public.document_file_location(p_document uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare location text;
begin
  if auth_can_view_money() is not true then
    raise exception 'Original document access requires monetary authorization' using errcode = '42501';
  end if;
  select d.file_url into location from public.document_registry d where d.id = p_document;
  return location;
end $$;
revoke all on function public.document_file_location(uuid) from public, anon;
grant execute on function public.document_file_location(uuid) to authenticated;

-- Document upload ownership is encoded before metadata registration. Shared/portal
-- reads require an authoritative registry link; orphan legacy paths get no fallback.
create function public.auth_storage_object_allowed(p_bucket text, p_name text, p_upload boolean)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth_user_id();
  v_role system_role := auth_user_role();
  v_active boolean;
begin
  if v_actor is null then return false; end if;
  select is_active and deactivated_at is null into v_active from users where id = v_actor;
  if v_active is false then return false; end if;
  if p_bucket = 'documents' then
    if p_upload then
      return coalesce(v_active,false) and v_role in ('Owner','Admin','Manager','Coordinator','Accounts')
        and split_part(p_name,'/',1) = 'staff' and split_part(p_name,'/',2) = v_actor::text
        and array_length(string_to_array(p_name,'/'),1) = 3
        and split_part(p_name,'/',3) <> '';
    end if;
    if coalesce(v_active,false) and v_role in ('Owner','Admin','Manager','Coordinator','Accounts')
      and split_part(p_name,'/',1) = 'staff' and split_part(p_name,'/',2) = v_actor::text then
      return true;
    end if;
    return exists (
      select 1 from document_registry d where
        (d.file_url = p_name or split_part(split_part(d.file_url,'/object/sign/documents/',2),'?',1) = p_name)
        -- P4 / N-1: ownership alone cannot authorize an unredacted PDF for a
        -- money-blind role, including Client. Redacted artifacts need their own
        -- verified publication path before any such access can be allowed.
        and coalesce(v_active,false) and v_role in ('Owner','Admin','Manager','Coordinator','Accounts')
    );
  elsif p_bucket = 'evidence' then
    if not coalesce(v_active,false) or v_role not in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician') then
      return false;
    end if;
    -- Session ID/booking ID comparisons use text: malformed paths deny, never cast.
    return exists (
      select 1 from operation_sessions s join bookings b on b.id = s.booking_id
      where s.id::text = split_part(p_name,'/',2) and b.id::text = split_part(p_name,'/',1)
        and (v_role in ('Owner','Admin','Manager') or s.warehouse_staff_id = v_actor or s.started_by = v_actor)
        and (not p_upload or (s.state <> 'Completed' and s.cancelled_at is null and b.cancelled_at is null and b.archived_at is null))
        and array_length(string_to_array(p_name,'/'),1) = 3
    );
  end if;
  return false;
end $$;
revoke all on function public.auth_storage_object_allowed(text,text,boolean) from public, anon;
grant execute on function public.auth_storage_object_allowed(text,text,boolean) to authenticated;

drop policy if exists documents_evidence_select_policy on storage.objects;
drop policy if exists documents_evidence_insert_policy on storage.objects;
drop policy if exists documents_evidence_update_policy on storage.objects;
drop policy if exists documents_evidence_delete_policy on storage.objects;
create policy documents_evidence_select_policy on storage.objects for select to authenticated
using (bucket_id in ('documents','evidence') and public.auth_storage_object_allowed(bucket_id,name,false));
create policy documents_evidence_insert_policy on storage.objects for insert to authenticated
with check (bucket_id in ('documents','evidence') and public.auth_storage_object_allowed(bucket_id,name,true));
-- Restrictive policies prevent a permissive legacy policy from reopening either bucket.
create policy astra_storage_read_boundary on storage.objects as restrictive for select to authenticated
using (bucket_id not in ('documents','evidence') or public.auth_storage_object_allowed(bucket_id,name,false));
create policy astra_storage_insert_boundary on storage.objects as restrictive for insert to authenticated
with check (bucket_id not in ('documents','evidence') or public.auth_storage_object_allowed(bucket_id,name,true));
create policy astra_storage_immutable_update on storage.objects as restrictive for update to authenticated
using (bucket_id not in ('documents','evidence')) with check (bucket_id not in ('documents','evidence'));
create policy astra_storage_immutable_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id not in ('documents','evidence'));

-- Public buckets bypass object SELECT policies for downloads. Keep business
-- buckets private as well as denying anonymous access through permissive policies.
create policy astra_storage_anon_boundary on storage.objects as restrictive for all to anon
using (bucket_id not in ('documents','evidence'))
with check (bucket_id not in ('documents','evidence'));
do $buckets$
begin
  -- The lightweight local prelude does not define hosted Storage's public flag.
  if exists (select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public') then
    execute 'update storage.buckets set public = false where id in (''documents'',''evidence'')';
  end if;
end $buckets$;

commit;

