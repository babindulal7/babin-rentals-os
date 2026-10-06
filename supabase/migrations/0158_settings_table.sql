-- ============================================================================
-- 0158_settings_table.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
-- (0157 is taken on branch step1-foundation; this is numbered after it.)
--
-- WHY
-- ---
-- settingsStore.ts kept every setting in localStorage, so two devices could run
-- different 06:00 day cuts, deposit-skip toggles and VAT rates. Booqable adoption
-- spec G1; RULING 2026-10-07 R-07-03 (only `operationalDayStart` is overridable
-- per location).
--
-- WHAT
-- ----
-- · settings          one row per (key, scope, location). scope 'org' | 'location'.
-- · settings_history  append-only: every change keeps old value, new value, actor, time (Law 3).
-- · RLS: read = staff (money-gated keys need auth_can_view_money, Law 6);
--        write = Owner only. PERMISSIONS.md §4.10 says `settings.manage` is Owner
--        only in code; the spec said "Owner/Admin" — stricter wins (B-1).
-- · A setting never opens a DB gate on its own (see 0155): no function here reads it.
--
-- REVERT: drop table settings_history, settings; drop function settings_key_is_money(text);
-- ============================================================================
begin;

-- Keys that carry money (Settings ▸ Financial is a money-gated tab, PERMISSIONS §5).
create or replace function settings_key_is_money(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key in (
    'vatNumber', 'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays',
    'overdueStopDays', 'latePaymentPercentPerMonth', 'allowDepositSkipOnClose'
  );
$$;

revoke all on function settings_key_is_money(text) from public;
grant execute on function settings_key_is_money(text) to authenticated;

create table settings (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null default gen_random_uuid(),
  key          text         not null,
  value        jsonb        not null,
  scope        text         not null default 'org',
  location_id  uuid         references branches (id),
  updated_by   uuid,
  updated_at   timestamptz  not null default now(),

  constraint settings_client_uuid_key unique (client_uuid),
  constraint settings_scope_valid check (scope in ('org', 'location')),
  constraint settings_key_nonblank check (length(btrim(key)) > 0),
  -- 'org' rows have no location; 'location' rows name one.
  constraint settings_location_matches_scope check (
    (scope = 'org' and location_id is null) or (scope = 'location' and location_id is not null)
  ),
  -- R-07-03: only the operational day cut may differ per location.
  constraint settings_location_override_allowed check (
    scope = 'org' or key = 'operationalDayStart'
  )
);

create unique index settings_key_scope_location_uq
  on settings (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table settings_history (
  id           uuid         not null default gen_random_uuid() primary key,
  setting_id   uuid         not null,
  key          text         not null,
  scope        text         not null,
  location_id  uuid,
  old_value    jsonb,
  new_value    jsonb        not null,
  changed_by   uuid,
  changed_at   timestamptz  not null default now()
);

create index settings_history_key_idx on settings_history (key, changed_at desc);

-- Every INSERT/UPDATE of settings leaves a history row, written by the database.
create or replace function log_settings_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
begin
  begin
    v_actor := auth_user_id();
  exception when others then
    v_actor := null;
  end;
  v_actor := coalesce(v_actor, NEW.updated_by);

  if TG_OP = 'UPDATE' and OLD.value is not distinct from NEW.value then
    return NEW;  -- no change, nothing to record
  end if;

  insert into settings_history (setting_id, key, scope, location_id, old_value, new_value, changed_by)
  values (NEW.id, NEW.key, NEW.scope, NEW.location_id,
          case when TG_OP = 'UPDATE' then OLD.value else null end, NEW.value, v_actor);
  return NEW;
end;
$$;

revoke all on function log_settings_history() from public;

create trigger trg_settings_history after insert or update on settings
  for each row execute function log_settings_history();

-- Stamp the actor and time; the client cannot claim someone else made the change.
create or replace function stamp_settings_actor()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  begin
    NEW.updated_by := coalesce(auth_user_id(), NEW.updated_by);
  exception when others then
    null;
  end;
  NEW.updated_at := now();
  return NEW;
end;
$$;

create trigger trg_settings_stamp before insert or update on settings
  for each row execute function stamp_settings_actor();

-- Nothing is deleted (Law 3): a setting is overwritten (history keeps the old value), never removed.
create trigger trg_settings_reject_delete before delete on settings
  for each row execute function reject_delete_nothing_is_deleted('overwrite the value; settings_history keeps the old one');
create trigger trg_settings_history_reject_update before update on settings_history
  for each row execute function reject_update_append_only('insert a new settings row change');
create trigger trg_settings_history_reject_delete before delete on settings_history
  for each row execute function reject_delete_nothing_is_deleted('settings_history is append-only');

alter table settings enable row level security;
alter table settings_history enable row level security;

create policy settings_select on settings
  for select to authenticated
  using (auth_is_staff() and (not settings_key_is_money(key) or auth_can_view_money()));

create policy settings_insert on settings
  for insert to authenticated
  with check (auth_is_owner());

create policy settings_update on settings
  for update to authenticated
  using (auth_is_owner())
  with check (auth_is_owner());

-- History is read by the people who may change settings, and by nobody else.
create policy settings_history_select on settings_history
  for select to authenticated
  using (auth_is_owner());

revoke all on settings, settings_history from anon;
revoke delete, truncate on settings, settings_history from authenticated;
revoke update, insert on settings_history from authenticated;

-- Universal audit trail as well (same as 0154).
drop trigger if exists trg_audit_settings on settings;
create trigger trg_audit_settings after insert or update on settings
  for each row execute function log_audit_event();

commit;
