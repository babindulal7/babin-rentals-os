-- T2-19 / B19: one session-scoped acknowledgement, only for flagged returns.
-- Signature upload opens the Return session before the floor action. Claim
-- its action key before receipts, so a lost completion response replays it.
alter table public.operation_sessions add column return_action_uuid uuid unique;
create function public.claim_return_session(p_session_id uuid,p_action_uuid uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s operation_sessions;
begin
  if auth_user_id() is null or not coalesce(auth_user_role() in ('Owner','Admin','Manager','Warehouse','Technician'),false) then
    raise exception 'Permission denied to claim a Return session.' using errcode='42501';
  end if;
  select * into s from operation_sessions where id=p_session_id for update;
  if not found or s.operation<>'Return' or s.state<>'In Progress' or p_action_uuid is null then
    raise exception 'An open Return and a request identity are required.' using errcode='22023';
  end if;
  perform assert_operation_branch_grant('return',s.booking_id);
  if s.return_action_uuid is not null and s.return_action_uuid<>p_action_uuid then
    raise exception 'GATE:return.session.claimed|This Return is already being recorded. Retry its original completion request.';
  end if;
  if s.client_uuid<>p_action_uuid and (
    exists(select 1 from session_line_movements where session_id=s.id)
    or exists(select 1 from return_lines where session_id=s.id)
  ) then
    raise exception 'GATE:return.session.claimed|This Return already has receipt facts. Retry its original completion request.';
  end if;
  update operation_sessions set client_uuid=p_action_uuid,return_action_uuid=p_action_uuid where id=s.id;
  return s.id;
end;
$$;
revoke all on function public.claim_return_session(uuid,uuid) from public,anon;
grant execute on function public.claim_return_session(uuid,uuid) to authenticated;

create function public.guard_return_session_claim() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.return_action_uuid is distinct from old.return_action_uuid or
     (old.return_action_uuid is not null and new.client_uuid is distinct from old.client_uuid) then
    if current_user='authenticated' or old.return_action_uuid is not null then
      raise exception 'Return completion request identities are immutable.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_return_session_claim() from public,anon,authenticated;
create trigger return_session_claim_immutable before update of return_action_uuid,client_uuid on public.operation_sessions
for each row execute function public.guard_return_session_claim();

-- return_lines is reused across partial sessions. A finding must keep its own
-- captured session rather than follow that mutable per-booking-line pointer.
alter table public.damage_findings add column return_session_id uuid references public.operation_sessions(id);
create function public.capture_return_finding_session() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then
    if (old.source='Return inspection' or new.source='Return inspection') and
       row(new.source,new.return_line_id,new.return_session_id) is distinct from row(old.source,old.return_line_id,old.return_session_id) then
      raise exception 'A Return finding cannot be reassigned to another session.' using errcode='42501';
    end if;
    return new;
  end if;
  if new.source='Return inspection' then
    select s.id into new.return_session_id from return_lines r
      join booking_lines l on l.id=r.booking_line_id
      join operation_sessions s on s.id=r.session_id and s.booking_id=l.booking_id
    where r.id=new.return_line_id and s.operation='Return' and s.state='In Progress';
    if new.return_session_id is null then
      raise exception 'GATE:gate.return.damage_unsigned|A Return finding requires this booking''s open Return session.';
    end if;
  else
    new.return_session_id:=null;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_return_finding_session() from public,anon,authenticated;
create trigger return_finding_session_capture before insert or update on public.damage_findings
for each row execute function public.capture_return_finding_session();

create function public.guard_return_line_session() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare flagged boolean:=coalesce(new.condition in ('Damaged','Lost'),false) or new.state='Not Returned';
begin
  if new.session_id is null then
    if flagged or (tg_op='UPDATE' and old.session_id is not null) then
      raise exception 'GATE:gate.return.damage_unsigned|A Return inspection cannot be detached from its session.';
    end if;
  elsif flagged or tg_op='INSERT' or new.session_id is distinct from old.session_id then
    if not exists(select 1 from operation_sessions s join booking_lines l on l.id=new.booking_line_id
       where s.id=new.session_id and s.booking_id=l.booking_id and s.operation='Return' and s.state='In Progress') then
      if exists(select 1 from operation_sessions where id=new.session_id and operation='Return' and state='Completed') then
        raise exception 'GATE:return.session.sealed|A completed Return inspection cannot be changed.';
      end if;
      raise exception 'GATE:gate.return.damage_unsigned|Flagged items must belong to this booking''s open Return session.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_return_line_session() from public,anon,authenticated;
create trigger return_inspection_session_required before insert or update on public.return_lines
for each row execute function public.guard_return_line_session();

create table public.return_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  session_id uuid not null unique references public.operation_sessions(id),
  signature_id uuid references public.signatures(id),
  returning_name text not null check (length(btrim(returning_name)) > 0),
  refusal_reason text,
  flagged_items jsonb not null,
  recorded_by uuid not null references public.users(id),
  recorded_at timestamptz not null default now(),
  constraint return_acknowledgement_signed_or_refused check (
    (signature_id is not null and refusal_reason is null) or
    (signature_id is null and refusal_reason is not null and length(btrim(refusal_reason)) >= 10)
  )
);
alter table public.return_acknowledgements enable row level security;
revoke all on public.return_acknowledgements from public, anon, authenticated;
grant select on public.return_acknowledgements to authenticated;
create policy return_acknowledgements_read on public.return_acknowledgements
for select to authenticated using (
  auth_user_role() in ('Owner','Admin','Manager','Warehouse','Technician')
  and exists (select 1 from public.operation_sessions s join public.bookings b on b.id=s.booking_id
    where s.id=session_id and auth_may_perform_operation('return', b.branch_id))
);

create function public.return_flagged_items(p_session_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_id',r.id,'booking_line_id',r.booking_line_id,'description',(select description from booking_lines where id=r.booking_line_id),'condition',r.condition,
    'state',r.state,'reason',r.not_returned_reason,'decision',r.not_returned_decision,
    'note',r.inspector_note,
    'findings',(select coalesce(jsonb_agg(jsonb_build_object('unit_id',d.unit_id,'serial',(select serial_no from product_units where id=d.unit_id),
       'condition',d.damage_type,'description',d.description) order by d.id),'[]'::jsonb)
       from damage_findings d where d.return_line_id=r.id and d.return_session_id=p_session_id),
    'units',(select coalesce(jsonb_agg(jsonb_build_object('unit_id',u.asset_id,'serial',(select serial_no from product_units where id=u.asset_id),'condition',u.condition,'state',u.unit_state) order by u.id),'[]'::jsonb)
       from booking_line_units u where u.booking_line_id=r.booking_line_id and u.return_session_id=p_session_id
         and (u.condition in ('Damaged','Lost') or u.unit_state='Missing'))
  ) order by r.id),'[]'::jsonb)
  from return_lines r where
    ((r.session_id=p_session_id and (r.condition in ('Damaged','Lost') or r.state='Not Returned'))
     or exists(select 1 from damage_findings d where d.return_line_id=r.id and d.return_session_id=p_session_id)
     or exists(select 1 from booking_line_units u where u.booking_line_id=r.booking_line_id and u.return_session_id=p_session_id
       and (u.condition in ('Damaged','Lost') or u.unit_state='Missing')));
$$;
revoke all on function public.return_flagged_items(uuid) from public,anon,authenticated;

create function public.record_return_acknowledgement(
  p_session_id uuid, p_client_uuid uuid, p_returning_name text,
  p_evidence_file_id uuid default null, p_refusal_reason text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s operation_sessions; a return_acknowledgements; v_flags jsonb; v_sig uuid; v_id uuid;
begin
  if auth_user_id() is null or not coalesce(auth_user_role() in ('Owner','Admin','Manager','Warehouse','Technician'),false) then
    raise exception 'Permission denied to acknowledge a Return.' using errcode='42501';
  end if;
  p_returning_name:=regexp_replace(p_returning_name,'^\s+|\s+$','','g');
  p_refusal_reason:=regexp_replace(p_refusal_reason,'^\s+|\s+$','','g');
  select * into s from operation_sessions where id=p_session_id for update;
  if not found or s.operation <> 'Return' then
    raise exception 'A Return session is required.' using errcode='22023';
  end if;
  perform assert_operation_branch_grant('return',s.booking_id);
  select * into a from return_acknowledgements where session_id=s.id or client_uuid=p_client_uuid;
  if found then
    if a.session_id<>s.id or a.client_uuid<>p_client_uuid or a.returning_name<>btrim(p_returning_name)
       or a.refusal_reason is distinct from nullif(btrim(p_refusal_reason),'')
       or (select signature_evidence_file_id from signatures where id=a.signature_id) is distinct from p_evidence_file_id then
      raise exception 'This Return acknowledgement was already recorded with different details.' using errcode='22023';
    end if;
    return a.id;
  end if;
  if s.state<>'In Progress' or not exists(select 1 from bookings where id=s.booking_id and stage='On Rent') then
    raise exception 'An open Return on an On Rent booking is required.' using errcode='22023';
  end if;
  v_flags:=return_flagged_items(s.id);
  if v_flags='[]'::jsonb or nullif(btrim(p_returning_name),'') is null or p_client_uuid is null then
    raise exception 'Flagged items, returning person and request identity are required.' using errcode='22023';
  end if;
  if p_evidence_file_id is not null and nullif(btrim(p_refusal_reason),'') is null then
    if not exists(select 1 from evidence_files f join evidence_references e on e.evidence_file_id=f.id
       where f.id=p_evidence_file_id and f.removed_at is null and f.media_type='Image'
       and e.booking_id=s.booking_id and e.operation_stage='Return' and e.session_id=s.id and e.removed_at is null) then
      raise exception 'Store the signature image against this Return session first.' using errcode='22023';
    end if;
    insert into signatures(client_uuid,session_id,signature_role,signer_name,signed_at,device,
      signature_evidence_file_id,is_required,created_by)
    values(p_client_uuid,s.id,'Returning person',btrim(p_returning_name),now(),'Web',p_evidence_file_id,true,auth_user_id())
    returning id into v_sig;
  elsif p_evidence_file_id is null and length(btrim(p_refusal_reason))>=10 then
    null;
  else
    raise exception 'A stored signature or a refusal reason of at least 10 characters is required.' using errcode='22023';
  end if;
  insert into return_acknowledgements(client_uuid,session_id,signature_id,returning_name,refusal_reason,flagged_items,recorded_by)
    values(p_client_uuid,s.id,v_sig,btrim(p_returning_name),nullif(btrim(p_refusal_reason),''),v_flags,auth_user_id()) returning id into v_id;
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,reason)
    values(gen_random_uuid(),'session','Rentals','Rentals','Create','Informational','Success',
      'return_acknowledgements',v_id,auth_user_id(),auth_user_role(),
      case when v_sig is null then 'Return signature refused: '||btrim(p_refusal_reason) else 'Return flagged items acknowledged by '||btrim(p_returning_name) end);
  -- Damage notices are created on finding INSERT. Attach the later acknowledgement
  -- to pending notices before delivery; keep the payload money-blind (W23).
  update client_message_events set payload=payload||jsonb_build_object(
    'return_acknowledgement_id',v_id,'returned_by',btrim(p_returning_name),
    'signature_evidence_file_id',p_evidence_file_id,'signature_refusal_reason',nullif(btrim(p_refusal_reason),''))
  where status='pending' and event_type='damage_notice' and finding_id in
    (select d.id from damage_findings d join return_lines r on r.id=d.return_line_id where r.session_id=s.id);
  return v_id;
end;
$$;
revoke all on function public.record_return_acknowledgement(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.record_return_acknowledgement(uuid,uuid,text,uuid,text) to authenticated;

create function public.guard_return_acknowledgement() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session uuid; v_flags jsonb;
begin
  if tg_table_name='return_acknowledgements' then
    raise exception 'Return acknowledgements are immutable.' using errcode='42501';
  elsif tg_table_name='signatures' then
    if exists(select 1 from return_acknowledgements where signature_id=old.id) then
      raise exception 'An acknowledged Return signature is immutable.' using errcode='42501';
    end if;
    if tg_op='DELETE' then return old; end if;
    return new;
  elsif tg_table_name='operation_sessions' then
    if new.operation<>'Return' or new.state<>'Completed' or old.state='Completed' then return new; end if;
    v_session:=new.id;
  else
    if new.stage<>'Returned' or old.stage='Returned' then return new; end if;
    if exists(select 1 from return_lines r join booking_lines l on l.id=r.booking_line_id
      where l.booking_id=new.id and (r.condition in ('Damaged','Lost') or r.state='Not Returned'
        or exists(select 1 from damage_findings d where d.return_line_id=r.id and d.return_session_id=r.session_id))
      and not exists(select 1 from return_acknowledgements a join operation_sessions s on s.id=a.session_id
        where a.session_id=r.session_id and (s.state='Completed' or a.flagged_items=return_flagged_items(r.session_id)))) then
      raise exception 'GATE:gate.return.damage_unsigned|Every flagged Return inspection needs its session acknowledgement.';
    end if;
    select id into v_session from operation_sessions where booking_id=new.id and operation='Return'
      and state='In Progress' order by session_no desc limit 1;
  end if;
  v_flags:=return_flagged_items(v_session);
  if v_flags<>'[]'::jsonb and not exists(select 1 from return_acknowledgements a
      where a.session_id=v_session and a.flagged_items=v_flags) then
    raise exception 'GATE:gate.return.damage_unsigned|The flagged items need a signature or a recorded refusal before completing Return.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_return_acknowledgement() from public,anon,authenticated;
create trigger return_acknowledgements_immutable before update or delete on public.return_acknowledgements
for each row execute function public.guard_return_acknowledgement();

-- Keep the existing payload builder as the authority for recipient/money rules.
alter function public.build_email_payload(text,uuid,text) rename to build_email_payload_before_return_ack;
revoke all on function public.build_email_payload_before_return_ack(text,uuid,text) from public,anon,authenticated;
create function public.build_email_payload(p_template_id text,p_recipient_user_id uuid default null,p_entity_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; ack jsonb;
  is_service boolean:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')='service_role';
begin
  result:=build_email_payload_before_return_ack(p_template_id,p_recipient_user_id,p_entity_id);
  if p_template_id='damage_notice' and (
    coalesce(auth_user_role() in ('Owner','Admin','Manager','Warehouse','Technician'),false)
    or is_service) then
    select jsonb_build_object('returned_by',a.returning_name,'signature_refusal_reason',a.refusal_reason,
       'return_session_id',a.session_id,'signature_storage_path',f.storage_path,'signature_recorded_at',a.recorded_at)
    into ack from return_acknowledgements a join operation_sessions s on s.id=a.session_id
      join bookings b on b.id=s.booking_id left join signatures sig on sig.id=a.signature_id
      left join evidence_files f on f.id=sig.signature_evidence_file_id
    where (b.id::text=p_entity_id or b.booking_no=p_entity_id) and s.state='Completed'
      and (auth_may_perform_operation('return',b.branch_id) or is_service)
    order by a.recorded_at desc limit 1;
    if ack is not null then result:=jsonb_set(result,'{data}',(result->'data')||ack); end if;
  end if;
  return result;
end;
$$;
revoke all on function public.build_email_payload(text,uuid,text) from public,anon;
grant execute on function public.build_email_payload(text,uuid,text) to authenticated,service_role;
create trigger return_signature_immutable before update or delete on public.signatures
for each row execute function public.guard_return_acknowledgement();
create trigger zzz_return_damage_acknowledgement_seal before update of state on public.operation_sessions
for each row execute function public.guard_return_acknowledgement();
create trigger return_damage_acknowledgement_stage before update of stage on public.bookings
for each row execute function public.guard_return_acknowledgement();

create function public.guard_return_signature_image() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from signatures s join return_acknowledgements a on a.signature_id=s.id
      where s.signature_evidence_file_id=old.id) then
    if tg_op='DELETE' then raise exception 'Acknowledged Return signature images are immutable.' using errcode='42501'; end if;
    if row(new.storage_path,new.content_hash,new.removed_at) is distinct from row(old.storage_path,old.content_hash,old.removed_at) then
      raise exception 'Acknowledged Return signature images are immutable.' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_return_signature_image() from public,anon,authenticated;
create trigger return_signature_image_immutable before update or delete on public.evidence_files
for each row execute function public.guard_return_signature_image();

-- A clean sealed receipt cannot later be rewritten into a flagged receipt.
-- Reusing the per-line row for a later open session remains supported (0177).
create function public.guard_sealed_return_flags() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.session_id is not distinct from old.session_id
     and row(new.state,new.condition,new.not_returned_reason,new.not_returned_decision,new.inspector_note)
       is distinct from row(old.state,old.condition,old.not_returned_reason,old.not_returned_decision,old.inspector_note)
     and exists(select 1 from operation_sessions where id=old.session_id and operation='Return' and state='Completed') then
    raise exception 'GATE:return.session.sealed|A completed Return inspection cannot be changed.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_sealed_return_flags() from public,anon,authenticated;
create trigger return_sealed_flags_immutable before update on public.return_lines
for each row execute function public.guard_sealed_return_flags();

-- A worker must not consume a Return damage notice in the interval between
-- finding INSERT and session acknowledgement. Release it on the session seal.
create function public.hold_return_damage_notice() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.event_type='damage_notice' and new.status='pending' and exists(
    select 1 from damage_findings d join return_lines r on r.id=d.return_line_id
      join operation_sessions s on s.id=r.session_id
    where d.id=new.finding_id and s.operation='Return' and s.state<>'Completed'
  ) then new.due_at:='infinity'::timestamptz; end if;
  return new;
end;
$$;
revoke all on function public.hold_return_damage_notice() from public,anon,authenticated;
create trigger return_damage_notice_waits_for_ack before insert on public.client_message_events
for each row execute function public.hold_return_damage_notice();

create function public.release_return_damage_notice() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.operation='Return' and new.state='Completed' and old.state<>'Completed' then
    update client_message_events set due_at=now() where status='pending' and event_type='damage_notice'
      and due_at='infinity'::timestamptz and finding_id in
        (select d.id from damage_findings d join return_lines r on r.id=d.return_line_id where r.session_id=new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.release_return_damage_notice() from public,anon,authenticated;
create trigger return_damage_notice_release after update of state on public.operation_sessions
for each row execute function public.release_return_damage_notice();
