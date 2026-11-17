begin;

create function public.require_return_damage_photo_per_unit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return_session_id uuid;
begin
  if tg_table_name = 'operation_sessions' then
    if new.operation <> 'Return' or new.state <> 'Completed'
      or old.state is not distinct from new.state then
      return new;
    end if;
    v_return_session_id := new.id;
  else
    if new.to_stage <> 'Returned' or new.from_stage is distinct from 'On Rent' then
      return new;
    end if;
    select session.id into v_return_session_id
    from public.operation_sessions session
    where session.booking_id = new.booking_id and session.operation = 'Return'
      and session.state in ('In Progress', 'Completed')
    order by session.created_at desc
    limit 1;
  end if;

  if exists (
    select 1
    from (
      select finding.unit_id
      from public.damage_findings finding
      join public.return_lines receipt on receipt.id = finding.return_line_id
      where receipt.session_id = v_return_session_id and finding.voided_at is null
      union
      select unit.asset_id
      from public.booking_line_units unit
      where unit.return_session_id = v_return_session_id
        and unit.unit_state = 'Damaged'
    ) flagged
    where not exists (
      select 1
      from public.evidence_references reference
      join public.evidence_files file on file.id = reference.evidence_file_id
      where reference.booking_id = new.booking_id
        and reference.item_id = flagged.unit_id
        and reference.removed_at is null
        and file.removed_at is null
        and file.media_type = 'Image'
        and file.category = 'Damage'
    )
  ) then
    raise exception 'GATE:gate.return.damage_photo_per_unit|Save a damage photo for each flagged unit before completing Return.';
  end if;

  return new;
end;
$$;

revoke all on function public.require_return_damage_photo_per_unit() from public, anon, authenticated;

create trigger trg_return_damage_photo_per_unit
before update of state on public.operation_sessions
for each row execute function public.require_return_damage_photo_per_unit();

-- The floor action advances the booking before sealing the session.
create trigger aaa_return_damage_photo_per_unit
before insert on public.booking_stage_transitions
for each row execute function public.require_return_damage_photo_per_unit();

commit;
