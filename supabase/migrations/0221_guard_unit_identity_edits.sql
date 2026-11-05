-- T2-17: preserve Technician floor updates without granting Technician unit-identity edits.
-- Forward-only, isolated-branch migration. Do NOT apply to live Supabase without
-- the independent permission/audit preflight and owner release approval.
--
-- 0180 broadens product_units_update RLS to Technician for floor operations.
-- RLS controls rows, not individual changed columns. A Technician with API access
-- could otherwise change asset_tag/serial_no/rack/shelf/bin despite UI gates.
-- The narrow trigger below protects ONLY changes to these five values; it does
-- not change product_units_update or block legitimate status/maintenance writes.
-- The trigger name sorts AFTER trg_product_units_set_updated_at (0097), so
-- its revision check observes the final server-assigned timestamp.

begin;

create or replace function public.guard_unit_identity_edits()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.asset_tag is distinct from old.asset_tag
     or new.serial_no is distinct from old.serial_no
     or new.rack is distinct from old.rack
     or new.shelf is distinct from old.shelf
     or new.bin is distinct from old.bin
  then
    if auth.uid() is null
       or coalesce(auth_user_role()::text, '') not in ('Owner', 'Admin', 'Manager', 'Warehouse')
    then
      raise exception 'GATE:unit.identity.role_denied|Only Owner, Admin, Manager or Warehouse may change unit identity or shelf location.'
        using errcode = '42501';
    end if;

    -- The universal audit trigger records NEW.updated_by as its actor.
    -- Legacy save_record_editor writes a unit patch without updated_by.
    -- Stamp that unchanged/omitted field from the JWT, never the prior actor;
    -- reject an explicit attempt to select a different new actor.
    if new.updated_by is distinct from auth.uid() then
      if new.updated_by is not distinct from old.updated_by then
        new.updated_by := auth.uid();
      else
        raise exception 'GATE:unit.identity.actor_mismatch|Unit identity changes cannot name a different actor.'
          using errcode = '42501';
      end if;
    end if;

    -- Unit editor uses a revision-matched UPDATE. The new revision must advance
    -- for a second tab to detect the write; never allow a timestamp downgrade.
    if new.updated_at is null or old.updated_at is null
       or new.updated_at <= old.updated_at
    then
      raise exception 'GATE:unit.identity.revision|Unit identity updates must advance the unit revision.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_unit_identity_edits on public.product_units;
drop trigger if exists trg_z_guard_unit_identity_edits on public.product_units;
create trigger trg_z_guard_unit_identity_edits
  before update on public.product_units
  for each row execute function public.guard_unit_identity_edits();

commit;
