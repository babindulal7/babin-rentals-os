-- RULING 2026-10-16: Manager+ may revert only before handover; archive only
-- Closed/Cancelled rentals. No custody undo and no invoice/payment changes.
begin;
alter table public.bookings add column archived_at timestamptz;
alter table public.bookings add column archived_by uuid references public.users(id);
alter table public.bookings add constraint booking_archive_terminal check (
  (archived_at is null and archived_by is null) or
  (archived_at is not null and archived_by is not null and (stage='Closed' or cancelled_at is not null))
);
grant select (archived_at, archived_by) on public.bookings to authenticated;

create function public.guard_booking_archive() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('authenticated','anon') and
    ((TG_OP='INSERT' and (NEW.archived_at is not null or NEW.archived_by is not null)) or
     (TG_OP='UPDATE' and (NEW.archived_at is distinct from OLD.archived_at or NEW.archived_by is distinct from OLD.archived_by))) then
    raise exception 'Use the audited rental lifecycle action to archive a booking.' using errcode='42501';
  end if;
  return NEW;
end $$;
create trigger trg_guard_booking_archive before insert or update on public.bookings
for each row execute function public.guard_booking_archive();

-- Ordinary staff cannot bypass the named correction RPC by forging approval fields.
-- The separately ruled Closed -> Returned reopen path is unchanged.
create function public.guard_rental_reversal_writer() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if NEW.is_reversal and NEW.from_stage<>'Closed' and current_user in ('authenticated','anon') then
    raise exception 'Use the audited pre-handover rental lifecycle action.' using errcode='42501';
  end if;
  return NEW;
end $$;
create trigger trg_guard_rental_reversal_writer before insert on public.booking_stage_transitions
for each row execute function public.guard_rental_reversal_writer();

create function public.manage_rental_lifecycle(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_role public.system_role;
  v_booking public.bookings%rowtype;
  v_receipt public.audit_events%rowtype;
  v_id uuid := (p_payload->>'booking_id')::uuid;
  v_key uuid := (p_payload->>'client_uuid')::uuid;
  v_action text := p_payload->>'action';
  v_reason text := btrim(p_payload->>'reason');
  v_target public.booking_stage;
  v_audit uuid;
  v_result jsonb;
begin
  select primary_role into v_role from public.users where id=v_actor and is_active;
  if v_actor is null or v_role is null or v_role not in ('Owner','Admin','Manager') then
    raise exception 'Only Manager or above can manage rental lifecycle.' using errcode='42501';
  end if;
  if v_id is null or v_key is null or v_reason is null or length(v_reason)<10 or
     v_action is null or v_action not in ('revert','archive') then
    raise exception 'Booking, request key, action and a reason of at least ten characters are required.';
  end if;
  -- Serialize retries even when their booking IDs differ. A key never changes meaning.
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));
  select * into v_booking from public.bookings where id=v_id for update;
  if not found then raise exception 'Booking was not found.'; end if;
  if v_role='Manager' and not exists(select 1 from public.users where id=v_actor and branch_id=v_booking.branch_id) then
    raise exception 'Rental branch access denied.' using errcode='42501';
  end if;
  select * into v_receipt from public.audit_events where client_uuid=v_key;
  if found then
    if v_receipt.actor_id=v_actor and v_receipt.record_id=v_id
       and v_receipt.reason=v_reason
       and v_receipt.new_values->>'lifecycle_action'=v_action
       and coalesce(v_receipt.new_values->>'target_stage','')=coalesce(p_payload->>'target_stage','') then
      return v_receipt.new_values;
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;
  if v_action='archive' then
    if v_booking.stage<>'Closed' and v_booking.cancelled_at is null then
      raise exception 'Only Closed or Cancelled bookings can be archived.';
    end if;
    if v_booking.archived_at is not null then raise exception 'This booking is already archived.'; end if;
    update public.bookings set archived_at=clock_timestamp(), archived_by=v_actor where id=v_id;
  else
    v_target := (p_payload->>'target_stage')::public.booking_stage;
    if v_target is null or v_target not in ('Quote','Booked') or
       v_booking.stage not in ('Booked','Packed') or v_target>=v_booking.stage or
       v_booking.cancelled_at is not null or v_booking.closed_at is not null or v_booking.archived_at is not null then
      raise exception 'Revert is only available to an earlier Quote/Booked stage before handover.';
    end if;
    if exists(select 1 from public.booking_line_units u join public.booking_lines l on l.id=u.booking_line_id
              where l.booking_id=v_id and u.unit_state::text in ('Picked Up','Returned')) or
       exists(select 1 from public.operation_sessions where booking_id=v_id and operation='Handover' and (state='Completed' or completed_at is not null)) then
      raise exception 'Handover has already occurred; custody cannot be reverted.';
    end if;
  end if;
  v_result := jsonb_build_object('booking_id',v_id,'lifecycle_action',v_action,'target_stage',p_payload->>'target_stage',
    'stage',coalesce(v_target,v_booking.stage),
    'archived_at',(select archived_at from public.bookings where id=v_id));
  insert into public.audit_events(client_uuid,event_class,category,module,action,severity,status,
    table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values,reason)
  values(v_key,'status change','Rentals','Rentals','Update','Informational','Success',
    'bookings',v_id,v_actor,v_role,v_booking.branch_id,
    jsonb_build_object('stage',v_booking.stage,'archived_at',v_booking.archived_at),v_result,v_reason)
  returning id into v_audit;
  if v_action='revert' then
    -- The existing transition trigger mints holds whenever to_stage=Booked.
    -- Refresh rather than duplicate the Packed holds; rollback restores them on any failure.
    if v_target='Booked' then
      update public.inventory_reservations
        set released_at=clock_timestamp(), released_reason='Pre-handover stage correction: ' || v_reason
        where booking_id=v_id and released_at is null;
    end if;
    insert into public.booking_stage_transitions(client_uuid,booking_id,branch_id,from_stage,to_stage,
      is_reversal,approved_by,reason,audit_event_id,actor_id,actor_role,source,occurred_at)
    values(v_key,v_id,v_booking.branch_id,v_booking.stage,v_target,true,v_actor,v_reason,v_audit,v_actor,v_role::text,
      'manage_rental_lifecycle',greatest(clock_timestamp(),(select max(occurred_at) from public.booking_stage_transitions where booking_id=v_id)));
  end if;
  return v_result;
end $$;
revoke all on function public.manage_rental_lifecycle(jsonb) from public, anon;
grant execute on function public.manage_rental_lifecycle(jsonb) to authenticated;
commit;
