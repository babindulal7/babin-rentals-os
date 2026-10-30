-- ASTRA Phase 0 - Minimal compatible subset for HEAD.
-- SEC-02, SEC-03, SEC-04, SEC-05(partial) require functions not in HEAD.
-- This migration only includes SEC-01 (storage).
begin;

-- SEC-01: scoped storage access, without creating or deleting any business data.
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
        and (
          (coalesce(v_active,false) and v_role in ('Owner','Admin','Manager','Coordinator','Accounts'))
          or (v_role = 'Client' and d.document_type in ('Quotation','Rental Agreement','Tax Invoice','Receipt','Delivery Note')
            and (d.client_id = auth_client_id() or exists (
              select 1 from bookings b where b.id = d.booking_id and b.client_id = auth_client_id()
            )))
        )
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

commit;