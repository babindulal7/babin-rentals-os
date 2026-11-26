-- RULING 2026-10-26: local Cadra rescheduling may replace a signed agreement
-- only with a retained, signed date amendment. WRITTEN; never apply hosted.
begin;
create table record_editor_private.reschedule_agreements (
 id uuid primary key, actor uuid not null references public.users(id),
 booking_id uuid not null references public.bookings(id),
 booking_revision timestamptz not null, original_document uuid not null references public.document_registry(id),
 original_hash text, pickup_at timestamptz not null, return_at timestamptz not null,
 method text check(method in ('upload','draw')), signer_name text, signer_role text,
 signed_at timestamptz, pdf_path text, pdf_hash text, signature_path text,
 state text not null default 'Draft' check(state in ('Draft','Ready','Cancelled','Committed')),
 document_id uuid references public.document_registry(id), created_at timestamptz not null default now(),
 check(pickup_at<return_at)
);
create table record_editor_private.agreement_revision_counters(booking_id uuid primary key references public.bookings(id), revision integer not null check(revision>0));
revoke all on record_editor_private.agreement_revision_counters from public,anon,authenticated;
alter table record_editor_private.agreement_revision_counters enable row level security;
create table record_editor_private.agreement_versions (
 previous_document uuid primary key references public.document_registry(id),
 document_id uuid not null unique references public.document_registry(id),
 booking_id uuid not null references public.bookings(id),
 proposal_id uuid not null unique references record_editor_private.reschedule_agreements(id),
 actor uuid not null references public.users(id), created_at timestamptz not null default now()
);
revoke all on record_editor_private.reschedule_agreements, record_editor_private.agreement_versions from public,anon,authenticated;
alter table record_editor_private.reschedule_agreements enable row level security;
alter table record_editor_private.agreement_versions enable row level security;

-- A signed document that anchors an amendment chain may be voided through the
-- existing terminal action, but its identity, bytes reference and signature
-- evidence cannot be rewritten after it has been reviewed or linked.
create function record_editor_private.seal_reschedule_agreement_document()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare sealed boolean;
begin
 sealed:=(exists(select 1 from record_editor_private.reschedule_agreements p where p.original_document=old.id)
     or exists(select 1 from record_editor_private.agreement_versions v where v.previous_document=old.id or v.document_id=old.id));
 if sealed and (new.document_no is distinct from old.document_no
     or new.document_type is distinct from old.document_type
     or new.booking_id is distinct from old.booking_id
     or new.client_id is distinct from old.client_id
     or new.file_url is distinct from old.file_url
     or new.file_size_bytes is distinct from old.file_size_bytes
     or new.signed_at is distinct from old.signed_at
     or new.signed_by_name is distinct from old.signed_by_name
     or new.signature_url is distinct from old.signature_url)
 then raise exception 'Signed agreement content and identity are immutable after amendment review.';
 end if;
 if sealed and old.signed_at is not null then
  -- A status label cannot hide a binding signature during amendment review.
  -- Void retains the registry's timestamp/reason discipline; Expired is the
  -- other terminal enum value. Neither terminal record may become active again.
  if old.lifecycle_status='Expired' or old.voided_at is not null then
   if new.lifecycle_status is distinct from old.lifecycle_status
     or new.voided_at is distinct from old.voided_at
     or new.void_reason is distinct from old.void_reason
   then raise exception 'A terminal signed agreement cannot be reactivated or rewritten.'; end if;
  elsif new.lifecycle_status is distinct from old.lifecycle_status
    and new.lifecycle_status not in ('Void','Expired')
  then raise exception 'Signed agreement lifecycle may only move to a terminal state after amendment review.';
  end if;
  if new.lifecycle_status='Void' and (new.voided_at is null or length(trim(coalesce(new.void_reason,'')))<10)
  then raise exception 'Voiding a signed agreement requires a void timestamp and a reason of at least 10 characters.'; end if;
  if new.voided_at is not null and new.lifecycle_status<>'Void'
  then raise exception 'Signed agreement void metadata must use the Void lifecycle.'; end if;
 end if;
 return new;
end $$;
revoke all on function record_editor_private.seal_reschedule_agreement_document() from public,anon,authenticated;
create trigger trg_seal_reschedule_agreement_document before update on public.document_registry
 for each row execute function record_editor_private.seal_reschedule_agreement_document();

create function record_editor_private.assert_reschedule_agreement_access(p_booking uuid)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users u join bookings b on b.id=p_booking
   where u.id=auth.uid() and u.is_active and u.deactivated_at is null
   and u.primary_role in ('Owner','Admin','Manager','Coordinator')
   and (u.primary_role in ('Owner','Admin') or u.branch_id=b.branch_id)
   and b.stage in ('Quote','Booked') and b.cancelled_at is null and b.archived_at is null)
 then raise exception 'This rental cannot be rescheduled by this session.' using errcode='42501'; end if;
end $$;
revoke all on function record_editor_private.assert_reschedule_agreement_access(uuid) from public,anon,authenticated;

create function record_editor_private.current_reschedule_agreement(p_booking uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select d.id from document_registry d
 where d.booking_id=p_booking and d.document_type='Rental Agreement'
 -- Signature evidence remains binding across nonterminal status labels.
 -- A Void label without its required timestamp is not a valid terminal act.
 and d.signed_at is not null and d.voided_at is null and d.lifecycle_status<>'Expired'
 and not exists(select 1 from record_editor_private.agreement_versions v where v.previous_document=d.id)
 order by d.created_at desc,d.id desc limit 1
$$;
revoke all on function record_editor_private.current_reschedule_agreement(uuid) from public,anon,authenticated;

create function public.prepare_reschedule_agreement(p_booking uuid,p_revision text,p_pickup timestamptz,p_return timestamptz,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; original uuid; proposal record_editor_private.reschedule_agreements;
begin
 perform record_editor_private.assert_reschedule_agreement_access(p_booking);
 select * into b from bookings where id=p_booking for share;
 if p_key is null or p_revision is null or p_pickup is null or p_return is null
  or b.updated_at<>p_revision::timestamptz or p_return-p_pickup<>b.return_at-b.pickup_at
  or mod(extract(epoch from p_pickup-b.pickup_at),86400)<>0 or p_pickup=b.pickup_at
 then raise exception 'Reload the rental and choose a date move with the same duration.' using errcode='40001'; end if;
 original:=record_editor_private.current_reschedule_agreement(p_booking);
 if original is null then return jsonb_build_object('required',false); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select * into proposal from record_editor_private.reschedule_agreements where id=p_key;
 if found then
  if proposal.actor<>auth.uid() or proposal.booking_id<>p_booking or proposal.booking_revision<>p_revision::timestamptz
    or proposal.pickup_at<>p_pickup or proposal.return_at<>p_return or proposal.original_document<>original
  then raise exception 'This proposal key belongs to another change.'; end if;
 else
  insert into record_editor_private.reschedule_agreements(id,actor,booking_id,booking_revision,original_document,pickup_at,return_at)
  values(p_key,auth.uid(),p_booking,b.updated_at,original,p_pickup,p_return);
 end if;
 return jsonb_build_object('required',true,'proposalId',p_key,'originalDocumentId',original,
  'originalDocumentNo',(select document_no from document_registry where id=original),'pickupAt',p_pickup,'returnAt',p_return);
end $$;

create function public.ready_reschedule_agreement(p_proposal uuid,p_method text,p_name text,p_role text,
 p_original_hash text,p_pdf_path text,p_pdf_hash text,p_signature_path text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare proposal record_editor_private.reschedule_agreements; object_path text;
begin
 select * into proposal from record_editor_private.reschedule_agreements where id=p_proposal for update;
 if not found or proposal.actor<>auth.uid() then raise exception 'Agreement proposal not found.' using errcode='42501'; end if;
 perform record_editor_private.assert_reschedule_agreement_access(proposal.booking_id);
 if proposal.state not in ('Draft','Ready') then raise exception 'This agreement proposal is closed.'; end if;
 if p_method is null or p_original_hash is null or p_pdf_hash is null or p_method not in ('upload','draw') or length(btrim(coalesce(p_name,'')))<2
 or length(btrim(coalesce(p_role,'')))<2 or length(p_name)>200 or length(p_role)>200
 or p_original_hash !~ '^[0-9a-f]{64}$' or p_pdf_hash !~ '^[0-9a-f]{64}$'
 or p_pdf_path is distinct from ('staff/'||auth.uid()::text||'/'||p_proposal::text||'-agreement.pdf')
 or (p_signature_path is not null and p_signature_path<>('staff/'||auth.uid()::text||'/'||p_proposal::text||'-signature.png'))
 or (p_method='draw' and p_signature_path is null)
 then raise exception 'A signer, original document hash and signed replacement are required.'; end if;
 foreach object_path in array array[p_pdf_path,p_signature_path] loop
  if object_path is not null and (
   split_part(object_path,'/',1)<>'staff' or split_part(object_path,'/',2)<>auth.uid()::text
   or array_length(string_to_array(object_path,'/'),1)<>3
   or not exists(select 1 from storage.objects o where o.bucket_id='documents' and o.name=object_path)
  ) then raise exception 'The private agreement upload was not confirmed.'; end if;
 end loop;
 if proposal.state='Ready' then
  if proposal.method is distinct from p_method or proposal.signer_name<>btrim(p_name)
   or proposal.signer_role<>btrim(p_role) or proposal.original_hash is distinct from p_original_hash
   or proposal.pdf_path is distinct from p_pdf_path or proposal.pdf_hash is distinct from p_pdf_hash
   or proposal.signature_path is distinct from p_signature_path
  then raise exception 'Ready agreement evidence is immutable. Start a new proposal.'; end if;
 else
  update record_editor_private.reschedule_agreements set state='Ready',method=p_method,
   signer_name=btrim(p_name),signer_role=btrim(p_role),signed_at=clock_timestamp(),
   original_hash=p_original_hash,pdf_path=p_pdf_path,pdf_hash=p_pdf_hash,signature_path=p_signature_path where id=p_proposal;
 end if;
 return jsonb_build_object('proposalId',p_proposal,'ready',true);
end $$;

create function public.cancel_reschedule_agreement(p_proposal uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare proposal record_editor_private.reschedule_agreements;
begin
 select * into proposal from record_editor_private.reschedule_agreements where id=p_proposal and actor=auth.uid();
 if not found then raise exception 'No pending proposal belongs to this session.' using errcode='42501'; end if;
 perform record_editor_private.assert_reschedule_agreement_access(proposal.booking_id);
 if proposal.state='Cancelled' then return; end if;
 update record_editor_private.reschedule_agreements set state='Cancelled'
 where id=p_proposal and actor=auth.uid() and state in ('Draft','Ready');
 if not found then raise exception 'No pending agreement proposal belongs to this session.' using errcode='42501'; end if;
end $$;

create or replace function record_editor_private.finalize_reschedule_agreement(
 p_booking_id uuid,p_expected_pickup timestamptz,p_expected_return timestamptz,p_proposal uuid,p_key uuid,p_expected_revision text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare original uuid; proposal record_editor_private.reschedule_agreements; b bookings; doc uuid; docno text; version_no integer;
begin
 perform record_editor_private.assert_reschedule_agreement_access(p_booking_id);
 original:=record_editor_private.current_reschedule_agreement(p_booking_id);
 if original is null and p_proposal is null then return; end if;
 select * into proposal from record_editor_private.reschedule_agreements where id=p_proposal for update;
 if not found or proposal.actor<>auth.uid() or proposal.booking_id<>p_booking_id or proposal.state<>'Ready'
   or proposal.booking_revision is distinct from p_expected_revision::timestamptz
   or proposal.original_document is distinct from original
   or proposal.pickup_at is distinct from p_expected_pickup or proposal.return_at is distinct from p_expected_return
 then raise exception 'The current signed agreement needs a ready replacement for these exact dates.'; end if;
 select * into b from bookings where id=p_booking_id;
 if b.pickup_at is distinct from p_expected_pickup or b.return_at is distinct from p_expected_return
 then raise exception 'Agreement dates do not match the rental.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='documents' and name=proposal.pdf_path)
 then raise exception 'Signed agreement file is unavailable.'; end if;
 if proposal.signature_path is not null and not exists(select 1 from storage.objects where bucket_id='documents' and name=proposal.signature_path)
 then raise exception 'Drawn signature evidence is unavailable.'; end if;
 -- A per-booking immutable revision number is allocated under the booking lock.
 -- No count-based global document numbering and no mutation of the original PDF.
 insert into record_editor_private.agreement_revision_counters(booking_id,revision) values(p_booking_id,1)
 on conflict(booking_id) do update set revision=agreement_revision_counters.revision+1 returning revision into version_no;
 docno:=b.booking_no||'-AGR-'||version_no::text;
 insert into document_registry(client_uuid,document_no,document_type,booking_id,client_id,lifecycle_status,
  file_url,generated_by,signed_at,signed_by_name,signature_url,created_by)
 values(p_proposal,docno,'Rental Agreement',p_booking_id,b.client_id,'Signed',
  proposal.pdf_path,auth.uid(),proposal.signed_at,proposal.signer_name,proposal.signature_path,auth.uid()) returning id into doc;
 insert into booking_documents(client_uuid,booking_id,document_id,doc_type,origin,created_by)
 values(md5(p_proposal::text||':agreement-link')::uuid,p_booking_id,doc,'Rental Agreement',
  (case when proposal.method='upload' then 'Uploaded' else 'Generated' end)::document_origin,auth.uid());
 insert into record_editor_private.agreement_versions(previous_document,document_id,booking_id,proposal_id,actor)
 values(original,doc,p_booking_id,p_proposal,auth.uid());
 update record_editor_private.reschedule_agreements set state='Committed',document_id=doc where id=p_proposal;
 insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values)
 values(md5(p_key::text||':agreement')::uuid,'status change','Rentals','Rentals','Update','Informational','Success',
 'document_registry',doc,auth.uid(),auth_user_role(),b.branch_id,
 jsonb_build_object('original_document',original),
 jsonb_build_object('replacement_document',doc,'proposal',p_proposal,'original_hash',proposal.original_hash,
 'replacement_hash',proposal.pdf_hash,'pickup_at',p_expected_pickup,'return_at',p_expected_return,'method',proposal.method));
end $$;
revoke all on function record_editor_private.finalize_reschedule_agreement(uuid,timestamptz,timestamptz,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.prepare_reschedule_agreement(uuid,text,timestamptz,timestamptz,uuid),
 public.ready_reschedule_agreement(uuid,text,text,text,text,text,text,text), public.cancel_reschedule_agreement(uuid) from public,anon;
grant execute on function public.prepare_reschedule_agreement(uuid,text,timestamptz,timestamptz,uuid),
 public.ready_reschedule_agreement(uuid,text,text,text,text,text,text,text), public.cancel_reschedule_agreement(uuid) to authenticated;

-- Money-free version metadata is separate from original document access.
create function public.rental_agreement_version_history()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor_role text; actor_branch uuid; result jsonb;
begin
 select primary_role::text,branch_id into actor_role,actor_branch from users
 where id=auth.uid() and is_active and deactivated_at is null;
 if actor_role is null or actor_role not in ('Owner','Admin','Manager','Coordinator','Accounts','Warehouse','Technician')
 then raise exception 'Agreement history is unavailable to this session.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('previous_document',v.previous_document,
  'document_id',v.document_id,'replacement_no',d.document_no)),'[]') into result
 from record_editor_private.agreement_versions v join bookings b on b.id=v.booking_id
 join document_registry d on d.id=v.document_id
 where actor_role in ('Owner','Admin') or b.branch_id=actor_branch;
 return result;
end $$;
revoke all on function public.rental_agreement_version_history() from public,anon;
grant execute on function public.rental_agreement_version_history() to authenticated;

create function record_editor_private.require_current_reschedule_agreement()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.stage='On Rent' and old.stage is distinct from new.stage
  and exists(select 1 from record_editor_private.agreement_versions where booking_id=new.id)
  and not exists(select 1 from record_editor_private.agreement_versions v
    join record_editor_private.reschedule_agreements p on p.id=v.proposal_id
    join document_registry d on d.id=v.document_id
    where v.booking_id=new.id and p.state='Committed'
    and p.pickup_at=new.pickup_at and p.return_at=new.return_at
    and d.lifecycle_status='Signed' and d.signed_at is not null and d.voided_at is null
    and not exists(select 1 from record_editor_private.agreement_versions newer where newer.previous_document=d.id))
 then raise exception 'The current rental dates require their signed agreement amendment.'; end if;
 return new;
end $$;
revoke all on function record_editor_private.require_current_reschedule_agreement() from public,anon,authenticated;
create trigger trg_current_reschedule_agreement before update of stage on public.bookings
 for each row execute function record_editor_private.require_current_reschedule_agreement();

commit;
