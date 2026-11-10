-- =============================================================================
-- 0229_booking_tags.sql
--
-- T3-25 · Tags on bookings (B16, B55)
-- Free tags on a booking: type a new one or pick one already used ("wedding",
-- "repeat", "festival"); several per booking.
-- Booking-desk roles add and remove tags; floor roles see them (a tag carries no money).
-- Tags are trimmed, case-insensitive, up to 30 characters.
-- Tags never change a booking's stage or money.
-- =============================================================================

begin;

-- 1. Add tags column to public.bookings
alter table public.bookings
  add column if not exists tags text[] not null default '{}';

-- 2. GIN index for fast tag containment/overlap search
create index if not exists idx_bookings_tags
  on public.bookings using gin (tags);

-- 3. Law 6 column-level masking compatibility (0062, 0162)
-- Non-money column must be explicitly granted to authenticated so all roles can read it
grant select (tags) on public.bookings to authenticated;

-- 4. RPC: set_booking_tags
create or replace function public.set_booking_tags(
  p_client_uuid uuid,
  p_booking_id uuid,
  p_tags text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role system_role;
  v_actor_id uuid;
  v_existing_event record;
  v_booking record;
  v_cleaned_tags text[] := '{}'::text[];
  v_raw_tag text;
  v_trimmed text;
  v_tag_lower text;
  v_found boolean;
  v_existing text;
  v_updated_booking public.bookings%rowtype;
begin
  -- 1. Authorization: Booking-desk roles only (Owner, Admin, Manager, Coordinator)
  v_role := auth_user_role();
  if v_role::text not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise exception 'Only booking-desk roles (Owner, Admin, Manager, Coordinator) may modify booking tags'
      using errcode = '42501';
  end if;

  -- 2. Idempotency validation (Law 8)
  if p_client_uuid is null then
    raise exception 'client_uuid is required for idempotency (Law 8)'
      using errcode = '23502';
  end if;

  -- 3. Check for idempotent replay
  select id, new_values into v_existing_event
  from public.audit_events
  where client_uuid = p_client_uuid
    and record_id = p_booking_id
    and table_name = 'bookings'
    and action = 'Update'
    and reason = 'Booking tags updated (T3-25)';

  if found then
    select * into v_updated_booking from public.bookings where id = p_booking_id;
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'tags', coalesce(v_updated_booking.tags, '{}'::text[]),
      'idempotent', true
    );
  end if;

  -- 4. Check booking exists
  select id, tags, stage, deposit_required
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking % not found', p_booking_id
      using errcode = 'P0002';
  end if;

  -- 5. Tag sanitization: trimmed, up to 30 characters, case-insensitive deduplication
  if p_tags is not null then
    foreach v_raw_tag in array p_tags loop
      v_trimmed := trim(v_raw_tag);
      if length(v_trimmed) > 0 then
        if char_length(v_trimmed) > 30 then
          raise exception 'Tag "%" exceeds 30 characters limit', v_trimmed
            using errcode = '22023';
        end if;
        v_tag_lower := lower(v_trimmed);
        v_found := false;
        if array_length(v_cleaned_tags, 1) > 0 then
          foreach v_existing in array v_cleaned_tags loop
            if lower(v_existing) = v_tag_lower then
              v_found := true;
              exit;
            end if;
          end loop;
        end if;
        if not v_found then
          v_cleaned_tags := array_append(v_cleaned_tags, v_trimmed);
        end if;
      end if;
    end loop;
  end if;

  -- 6. Update booking (only tags are modified; stage and money are untouched)
  update public.bookings
  set tags = v_cleaned_tags
  where id = p_booking_id
  returning * into v_updated_booking;

  -- 7. Log explicit audit event for the tag change
  v_actor_id := auth.uid();
  if v_actor_id is null then
    select id into v_actor_id from public.users where primary_role::text = 'Owner' limit 1;
  end if;

  insert into public.audit_events (
    client_uuid,
    event_class,
    category,
    module,
    action,
    severity,
    status,
    table_name,
    record_id,
    actor_id,
    actor_role,
    old_values,
    new_values,
    diff,
    reason
  ) values (
    p_client_uuid,
    'status change',
    'Rentals'::audit_category,
    'Rentals'::audit_module,
    'Update'::audit_action,
    'Informational'::audit_severity,
    'Success'::audit_status,
    'bookings',
    p_booking_id,
    v_actor_id,
    v_role,
    jsonb_build_object('tags', coalesce(v_booking.tags, '{}'::text[])),
    jsonb_build_object('tags', v_cleaned_tags),
    jsonb_build_object('tags', v_cleaned_tags),
    'Booking tags updated (T3-25)'
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'tags', v_cleaned_tags,
    'idempotent', false
  );
end;
$$;

comment on function public.set_booking_tags is
  'Set tags on a booking with role gate, audit trail, and sanitization (T3-25, B16, B55)';

revoke all on function public.set_booking_tags(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_booking_tags(uuid, uuid, text[]) to authenticated;

commit;
