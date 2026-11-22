-- =============================================================================
-- BABIN RENTALS OS — PRODUCTION MIGRATION BUNDLE 1 OF 3
-- File: 01_PRODUCTION_BATCH_1_0157_TO_0177.sql
-- Range: Migrations 0157 through 0177
-- Total Migrations in Batch: 19
-- Target: Production Project sxguwvgoserhdolewibb
-- Description: Audit triggers, system settings table, saved views, pricing structures, operation grants, section saves, return reservations.
--
-- INSTRUCTIONS FOR BABIN:
-- 1. Open Supabase Dashboard -> Project sxguwvgoserhdolewibb -> SQL Editor.
-- 2. Create a new query, paste this entire file, and click 'RUN'.
-- 3. Verify 'Success. No rows returned' or query execution completed.
-- 4. Execute the verification query at the bottom to verify migration registration.
-- =============================================================================

-- Ensure migration session config can bypass money line triggers during setup
select set_config('app.in_create_booking', 'on', false);

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0157_audit_triggers_for_trigger_less_tables.sql
-- SHA-256: dd4cd632c4833c3554e11d495285167871b1e90808234e9d2e5b6ab6d4023d52
-- Version: 20261122030000
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0157_audit_triggers_for_trigger_less_tables.sql — written 06 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- PLAN.md §4.36 (ruled 06 Oct 2026): the DATABASE trigger is the audit of record and the app-side
-- `logAuditEvent` row is supplementary — a failure there proceeds. That is only safe where a trigger
-- exists. Four tables had none, so their app-side row was the ONLY record:
--   cleaning_queue_entries (Warehouse reset), purchase_requests, stock_transfers, products.
--
-- WHAT
-- ----
-- One small generic trigger function and four bindings (INSERT and UPDATE; there is no DELETE path,
-- nothing is deleted). Unlike `log_audit_event()` it does not leave the actor empty: actor is
--   auth_user_id()  ->  app.current_user_id  ->  updated_by  ->  created_by   (read through to_jsonb(NEW),
-- so a table without the column yields NULL instead of an error, the trap 0010 documents).
-- Module/category by table: cleaning_queue_entries = Operations / session; the other three = Inventory.
-- The app-side rows are untouched, so each change may now show two rows (trigger = who/what/before-after,
-- app = reason and device context). That duplication is intended, not a bug.
--
-- WHAT THIS DOES NOT DO: it does not make any app write fail on an audit error beyond what a trigger
-- already does (a failed audit insert fails the statement). No policy, enum or column changes.
--
-- RULING 2026-10-06: stricter and additive (B-1), one-statement revert per table (B-6).
-- REVERT: drop trigger trg_audit_<table> on <table>;  (x4), then drop function log_audit_event_actor();
-- Verified by scripts/test-audit-trigger-coverage.mjs (fails 6 checks without this file).
-- ============================================================================

begin;

create or replace function log_audit_event_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_row jsonb := to_jsonb(NEW);
  v_module audit_module;
  v_category audit_category;
  v_class audit_event_class;
begin
  begin
    v_actor := auth_user_id();
  exception when others then
    v_actor := null;
  end;
  if v_actor is null then
    begin
      v_actor := nullif(current_setting('app.current_user_id', true), '')::uuid;
    exception when others then
      v_actor := null;
    end;
  end if;
  v_actor := coalesce(
    v_actor,
    nullif(v_row ->> 'updated_by', '')::uuid,
    nullif(v_row ->> 'created_by', '')::uuid
  );

  if TG_TABLE_NAME = 'cleaning_queue_entries' then
    v_module := 'Operations'; v_category := 'Rentals'; v_class := 'session';
  else
    v_module := 'Inventory'; v_category := 'Inventory'; v_class := 'status change';
  end if;

  insert into audit_events (
    client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, old_values, new_values
  ) values (
    gen_random_uuid(), v_class, v_category, v_module,
    case when TG_OP = 'INSERT' then 'Create'::audit_action else 'Update'::audit_action end,
    'Informational', 'Success',
    TG_TABLE_NAME, NEW.id, v_actor,
    case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end,
    v_row
  );
  return NEW;
end;
$$;

revoke all on function log_audit_event_actor() from public;

drop trigger if exists trg_audit_cleaning_queue_entries on cleaning_queue_entries;
create trigger trg_audit_cleaning_queue_entries after insert or update on cleaning_queue_entries
  for each row execute function log_audit_event_actor();

drop trigger if exists trg_audit_purchase_requests on purchase_requests;
create trigger trg_audit_purchase_requests after insert or update on purchase_requests
  for each row execute function log_audit_event_actor();

drop trigger if exists trg_audit_stock_transfers on stock_transfers;
create trigger trg_audit_stock_transfers after insert or update on stock_transfers
  for each row execute function log_audit_event_actor();

drop trigger if exists trg_audit_products on products;
create trigger trg_audit_products after insert or update on products
  for each row execute function log_audit_event_actor();

commit;

-- Record 0157_audit_triggers_for_trigger_less_tables in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030000', '0157_audit_triggers_for_trigger_less_tables')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0157_audit_triggers_for_trigger_less_tables.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0158_settings_table.sql
-- SHA-256: ea4127cd52526059bc392133dbb3a357bc041749eb811018b51f7959848aa7cc
-- Version: 20261122030001
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0158_settings_table.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Booqable adoption spec G1. `lib/settingsStore.ts` kept every setting in `localStorage`, so two
-- devices could run different 06:00 cuts, deposit-skip toggles and VAT rates. PERMISSIONS.md §4.10
-- records "there is no `settings` table in `public`" — this is that table.
--
-- WHAT
-- ----
--   settings          one row per (key, scope, location). scope 'org' = the whole business,
--                     'location' = an override for one branch. Never deleted (Law 3).
--   settings_history  append-only: every change keeps old value, new value, actor, time (Law 3).
--                     Written by a trigger, so no path — RPC, service_role or table owner — skips it.
--   set_setting()     the ONLY write path for `authenticated`. Owner only, carries a client_uuid
--                     (a retry returns the first result, a reused uuid on a different change is refused).
--
-- RLS / WHO SEES WHAT
-- -------------------
--   read   any staff, EXCEPT money keys (is_money) which need auth_can_view_money() — Law 6.
--          Warehouse therefore never receives VAT / payment-terms / late-fee / deposit-rule values.
--   write  Owner only. The spec proposed Owner/Admin; PERMISSIONS.md §4.10 and rbac.canManageSettings
--          are Owner-only and B-1 (stricter wins) settles it. Revert = add 'Admin' to
--          set_setting()'s role list AND canManageSettings, together (B-3).
--   A setting never opens a DB gate on its own (0155): this table stores a preference, the gate
--   functions still decide.
--
-- LOCATION OVERRIDE (D-1, proposal adopted): only `operationalDayStart` may be overridden per
-- location; settings_location_overridable() is the one-line list to widen later.
--
-- RULING 2026-10-07: settings live in the database; localStorage keeps device UI preferences only.
-- REVERT: drop function set_setting; drop table settings_history; drop table settings; (nothing
-- else references them).
-- ============================================================================

begin;

create table if not exists settings (
  id               uuid         not null default gen_random_uuid() primary key,
  key              text         not null,
  value            jsonb        not null,
  scope            text         not null default 'org',
  location_id      uuid         references branches (id),
  is_money         boolean      not null default false,
  last_client_uuid uuid,
  updated_by       uuid         references users (id),
  updated_at       timestamptz  not null default now(),
  created_at       timestamptz  not null default now(),

  constraint settings_key_shape check (key ~ '^[A-Za-z][A-Za-z0-9]{0,63}$'),
  constraint settings_scope_valid check (scope in ('org', 'location')),
  constraint settings_scope_location check (
    (scope = 'org' and location_id is null) or (scope = 'location' and location_id is not null)
  ),
  constraint settings_value_scalar check (jsonb_typeof(value) in ('string', 'number', 'boolean'))
);

create unique index if not exists settings_key_scope_location_key
  on settings (key, scope, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists settings_history (
  id            uuid         not null default gen_random_uuid() primary key,
  client_uuid   uuid         not null,
  setting_id    uuid         not null references settings (id),
  key           text         not null,
  scope         text         not null,
  location_id   uuid,
  old_value     jsonb,
  new_value     jsonb        not null,
  changed_by    uuid,
  changed_at    timestamptz  not null default now(),

  constraint settings_history_client_uuid_key unique (client_uuid)
);

create index if not exists idx_settings_history_setting on settings_history (setting_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Which keys are money (Law 6) and which may be overridden per location. Immutable lists in code,
-- so adding a key is a migration, exactly like a permission cell.
-- ---------------------------------------------------------------------------
create or replace function settings_is_money_key(p_key text)
returns boolean language sql immutable as $$
  select p_key in (
    'vatRatePercent', 'crewCoordinationFeeRupees', 'paymentTermsDays', 'overdueStopDays',
    'latePaymentPercentPerMonth', 'allowDepositSkipOnClose'
  );
$$;

create or replace function settings_location_overridable(p_key text)
returns boolean language sql immutable as $$
  select p_key in ('operationalDayStart');
$$;

revoke all on function settings_is_money_key(text), settings_location_overridable(text) from public, anon;
grant execute on function settings_is_money_key(text), settings_location_overridable(text) to authenticated;

-- ---------------------------------------------------------------------------
-- History is written by a trigger so no write path can skip it.
-- ---------------------------------------------------------------------------
create or replace function settings_write_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into settings_history (client_uuid, setting_id, key, scope, location_id, old_value, new_value, changed_by)
  values (
    coalesce(NEW.last_client_uuid, gen_random_uuid()), NEW.id, NEW.key, NEW.scope, NEW.location_id,
    case when TG_OP = 'UPDATE' then OLD.value else null end,
    NEW.value, NEW.updated_by
  );
  return NEW;
end;
$$;

revoke all on function settings_write_history() from public, anon, authenticated;

create trigger trg_settings_history after insert or update on settings
  for each row execute function settings_write_history();

create trigger trg_settings_reject_delete before delete on settings
  for each row execute function reject_delete_nothing_is_deleted('set a new value; the old one stays in settings_history');
create trigger trg_settings_history_reject_update before update on settings_history
  for each row execute function reject_update_append_only('none — a later change is its own history row');
create trigger trg_settings_history_reject_delete before delete on settings_history
  for each row execute function reject_delete_nothing_is_deleted('none — history is never removed');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table settings enable row level security;
alter table settings_history enable row level security;

drop policy if exists settings_select on settings;
create policy settings_select on settings for select to authenticated
  using (auth_is_staff() and (not is_money or auth_can_view_money()));

drop policy if exists settings_history_select on settings_history;
create policy settings_history_select on settings_history for select to authenticated
  using (auth_user_role() in ('Owner', 'Admin', 'Manager') and (not settings_is_money_key(key) or auth_can_view_money()));

revoke all on settings, settings_history from public, anon, authenticated;
grant select on settings, settings_history to authenticated;

-- ---------------------------------------------------------------------------
-- The write path.
-- ---------------------------------------------------------------------------
create or replace function public.set_setting(
  p_client_uuid uuid,
  p_key text,
  p_value jsonb,
  p_scope text default 'org',
  p_location_id uuid default null
) returns table (setting_id uuid, value jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_hist settings_history%rowtype;
  v_row settings%rowtype;
  v_scope text := coalesce(p_scope, 'org');
begin
  if auth_user_role() is distinct from 'Owner' then
    raise exception 'GATE:gate.settings.role|Only the Owner may change settings.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.settings.idempotency|A settings change requires a client UUID.' using errcode = 'P0001';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z][A-Za-z0-9]{0,63}$' then
    raise exception 'GATE:gate.settings.key|Not a valid setting key.' using errcode = 'P0001';
  end if;
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number', 'boolean') then
    raise exception 'GATE:gate.settings.value|A setting is a single text, number or yes/no value.' using errcode = 'P0001';
  end if;
  if v_scope not in ('org', 'location') then
    raise exception 'GATE:gate.settings.scope|Scope must be org or location.' using errcode = 'P0001';
  end if;
  if v_scope = 'location' and (p_location_id is null or not settings_location_overridable(p_key)) then
    raise exception 'GATE:gate.settings.not_overridable|This setting applies to the whole business and has no per-location override.' using errcode = 'P0001';
  end if;
  if v_scope = 'org' and p_location_id is not null then
    raise exception 'GATE:gate.settings.scope|An org setting carries no location.' using errcode = 'P0001';
  end if;

  select * into v_existing_hist from settings_history h where h.client_uuid = p_client_uuid;
  if found then
    if v_existing_hist.key <> p_key or v_existing_hist.new_value <> p_value
       or v_existing_hist.scope <> v_scope or v_existing_hist.location_id is distinct from p_location_id then
      raise exception 'GATE:gate.settings.idempotency_conflict|Client UUID already belongs to a different change.' using errcode = 'P0001';
    end if;
    return query select v_existing_hist.setting_id, v_existing_hist.new_value;
    return;
  end if;

  select * into v_row from settings s
   where s.key = p_key and s.scope = v_scope
     and coalesce(s.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = coalesce(p_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
   for update;

  if found then
    if v_row.value = p_value then
      return query select v_row.id, v_row.value;   -- no change, no history row
      return;
    end if;
    update settings
       set value = p_value, last_client_uuid = p_client_uuid, updated_by = auth_user_id(), updated_at = now()
     where id = v_row.id;
    return query select v_row.id, p_value;
  else
    insert into settings (key, value, scope, location_id, is_money, last_client_uuid, updated_by)
    values (p_key, p_value, v_scope, p_location_id, settings_is_money_key(p_key), p_client_uuid, auth_user_id())
    returning id into v_row.id;
    return query select v_row.id, p_value;
  end if;
end;
$$;

revoke all on function public.set_setting(uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function public.set_setting(uuid, text, jsonb, text, uuid) to authenticated;

commit;

-- Record 0158_settings_table in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030001', '0158_settings_table')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0158_settings_table.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0159_saved_views.sql
-- SHA-256: fc5aaf31c3d4e849514e1c6631451f4d3d08fbec144f62055acc8790d90c8e05
-- Version: 20261122030002
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0159_saved_views.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Booqable adoption spec G2. Saved views lived in `localStorage` (SavedViewsMenu): per device, not
-- shareable, no built-ins. Floor staff reuse the same handful of views daily.
--
-- WHAT
-- ----
--   saved_views   one row per view: list_key (which screen), query (the URL filter string, already
--                 normalised by the client), hidden_columns, owner, visibility private | team.
--                 Five SYSTEM views are seeded for the Rentals list (is_system, owner null,
--                 not retirable): Pickups today · Returns today · Overdue · Awaiting inspection · Drafts.
--                 They carry a relative filter (`quick=Pickups Today`), never a date literal, so they
--                 resolve through the operational day (settings.operationalDayStart) when opened.
--   save_view()   create / update (staff may make private views; publishing a TEAM view is Manager+ — D-3).
--   retire_view() the only way a view goes away (Law 3): retired_at is set, the row stays.
--
-- LAW 6: `touches_money` is computed in the database from the query (never trusted from the client). A
-- view whose filter touches money is invisible to Warehouse · Technician · Driver · Client, and one of
-- those roles cannot save such a view either.
--
-- RULING 2026-10-07: D-3 proposal adopted (⭐ B-5) — Manager and above may publish a team view; anyone
-- staff may make a private one. REVERT: change v_can_publish in save_view() (one line).
-- REVERT ALL: drop function save_view, retire_view, saved_view_query_touches_money; drop table saved_views.
-- ============================================================================

begin;

create table if not exists saved_views (
  id             uuid         not null default gen_random_uuid() primary key,
  client_uuid    uuid         not null,
  list_key       text         not null,
  name           text         not null,
  query          text         not null default '',
  hidden_columns text[]       not null default '{}',
  sort           text,
  owner_id       uuid         references users (id),
  visibility     text         not null default 'private',
  is_system      boolean      not null default false,
  system_key     text,
  touches_money  boolean      not null default false,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),
  retired_at     timestamptz,
  retired_by     uuid         references users (id),

  constraint saved_views_client_uuid_key unique (client_uuid),
  constraint saved_views_list_key_shape check (list_key ~ '^[a-z][a-z0-9_-]{0,39}$'),
  constraint saved_views_name_len check (char_length(btrim(name)) between 1 and 60),
  constraint saved_views_visibility_valid check (visibility in ('private', 'team')),
  constraint saved_views_system_shape check (
    (is_system and owner_id is null and visibility = 'team' and system_key is not null)
    or (not is_system and owner_id is not null and system_key is null)
  )
);

create unique index if not exists saved_views_system_key_key on saved_views (system_key) where system_key is not null;
create unique index if not exists saved_views_team_name_key
  on saved_views (list_key, lower(btrim(name))) where visibility = 'team' and retired_at is null;
create unique index if not exists saved_views_private_name_key
  on saved_views (list_key, owner_id, lower(btrim(name))) where visibility = 'private' and retired_at is null;

-- Which queries touch money. Stricter wins (B-1): a key on this list, or the Payment Due chip.
create or replace function saved_view_query_touches_money(p_query text)
returns boolean language sql immutable as $$
  select coalesce(p_query, '') ~* '(^|&)(total|rental_total|outstanding|balance|paid|deposit|amount|price|rate|revenue|payment_status|min_total|max_total|payment)[^=&]*='
      or coalesce(p_query, '') ~* '=(Payment(\+|%20| )Due)(&|$)';
$$;

-- ---------------------------------------------------------------------------
-- Law 3 backstops. A system view is fixed; nothing is deleted.
-- ---------------------------------------------------------------------------
create or replace function saved_views_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if OLD.is_system and (
       NEW.is_system is distinct from OLD.is_system or NEW.retired_at is distinct from OLD.retired_at
       or NEW.query is distinct from OLD.query or NEW.name is distinct from OLD.name
       or NEW.hidden_columns is distinct from OLD.hidden_columns or NEW.system_key is distinct from OLD.system_key
     ) then
    raise exception 'GATE:gate.saved_view.system_fixed|System views cannot be changed or retired.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

create trigger trg_saved_views_guard before update on saved_views
  for each row execute function saved_views_guard();
create trigger trg_saved_views_reject_delete before delete on saved_views
  for each row execute function reject_delete_nothing_is_deleted('retire the view; the row stays');

-- ---------------------------------------------------------------------------
-- RLS — read only; every write goes through the two RPCs below.
-- ---------------------------------------------------------------------------
alter table saved_views enable row level security;

drop policy if exists saved_views_select on saved_views;
create policy saved_views_select on saved_views for select to authenticated
  using (
    auth_is_staff()
    and retired_at is null
    and (is_system or visibility = 'team' or owner_id = auth_user_id())
    and (not touches_money or auth_can_view_money())
  );

revoke all on saved_views from public, anon, authenticated;
grant select on saved_views to authenticated;

revoke all on function saved_view_query_touches_money(text) from public, anon;
grant execute on function saved_view_query_touches_money(text) to authenticated;
revoke all on function saved_views_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_view — create (p_id null) or update one the caller may edit.
-- ---------------------------------------------------------------------------
create or replace function public.save_view(
  p_client_uuid uuid,
  p_list_key text,
  p_name text,
  p_query text,
  p_hidden_columns text[],
  p_visibility text,
  p_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth_user_id();
  v_can_publish boolean := auth_user_role() in ('Owner', 'Admin', 'Manager');
  v_money boolean := saved_view_query_touches_money(p_query);
  v_name text := btrim(coalesce(p_name, ''));
  v_existing saved_views%rowtype;
  v_row saved_views%rowtype;
begin
  if not auth_is_staff() or v_me is null then
    raise exception 'GATE:gate.saved_view.role|Only staff may save views.' using errcode = 'P0001';
  end if;
  if p_client_uuid is null then
    raise exception 'GATE:gate.saved_view.idempotency|A saved view requires a client UUID.' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'GATE:gate.saved_view.name|A view name is 1 to 60 characters.' using errcode = 'P0001';
  end if;
  if coalesce(p_visibility, 'private') not in ('private', 'team') then
    raise exception 'GATE:gate.saved_view.visibility|Visibility is private or team.' using errcode = 'P0001';
  end if;
  if p_visibility = 'team' and not v_can_publish then
    raise exception 'GATE:gate.saved_view.publish|Only a Manager or above may publish a team view.' using errcode = 'P0001';
  end if;
  if v_money and not auth_can_view_money() then
    raise exception 'GATE:gate.saved_view.money|This role cannot save a view that filters on money.' using errcode = 'P0001';
  end if;

  select * into v_existing from saved_views where client_uuid = p_client_uuid;
  if found then
    return v_existing.id;           -- retried request
  end if;

  if p_id is null then
    insert into saved_views (client_uuid, list_key, name, query, hidden_columns, owner_id, visibility, touches_money)
    values (p_client_uuid, p_list_key, v_name, coalesce(p_query, ''), coalesce(p_hidden_columns, '{}'),
            v_me, coalesce(p_visibility, 'private'), v_money)
    returning * into v_row;
    return v_row.id;
  end if;

  select * into v_row from saved_views where id = p_id for update;
  if not found or v_row.retired_at is not null then
    raise exception 'GATE:gate.saved_view.not_found|That view no longer exists.' using errcode = 'P0001';
  end if;
  if v_row.is_system then
    raise exception 'GATE:gate.saved_view.system_fixed|System views cannot be changed or retired.' using errcode = 'P0001';
  end if;
  if not (v_row.owner_id = v_me or (v_row.visibility = 'team' and v_can_publish)) then
    raise exception 'GATE:gate.saved_view.not_yours|Only the owner may change this view.' using errcode = 'P0001';
  end if;
  update saved_views
     set name = v_name, query = coalesce(p_query, ''), hidden_columns = coalesce(p_hidden_columns, '{}'),
         visibility = coalesce(p_visibility, v_row.visibility), touches_money = v_money, updated_at = now()
   where id = p_id;
  return p_id;
end;
$$;

revoke all on function public.save_view(uuid, text, text, text, text[], text, uuid) from public, anon;
grant execute on function public.save_view(uuid, text, text, text, text[], text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- retire_view — the terminal action. Owner for a private view, Manager+ for a team one.
-- ---------------------------------------------------------------------------
create or replace function public.retire_view(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth_user_id();
  v_row saved_views%rowtype;
begin
  if not auth_is_staff() or v_me is null then
    raise exception 'GATE:gate.saved_view.role|Only staff may retire views.' using errcode = 'P0001';
  end if;
  select * into v_row from saved_views where id = p_id for update;
  if not found or v_row.retired_at is not null then
    return;                         -- already gone: retiring twice is not an error
  end if;
  if v_row.is_system then
    raise exception 'GATE:gate.saved_view.system_fixed|System views cannot be changed or retired.' using errcode = 'P0001';
  end if;
  if not (v_row.owner_id = v_me or (v_row.visibility = 'team' and auth_user_role() in ('Owner', 'Admin', 'Manager'))) then
    raise exception 'GATE:gate.saved_view.not_yours|Only the owner may retire this view.' using errcode = 'P0001';
  end if;
  update saved_views set retired_at = now(), retired_by = v_me, updated_at = now() where id = p_id;
end;
$$;

revoke all on function public.retire_view(uuid) from public, anon;
grant execute on function public.retire_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The five system views. Relative filters only — see header.
-- ---------------------------------------------------------------------------
insert into saved_views (client_uuid, list_key, name, query, owner_id, visibility, is_system, system_key) values
  (gen_random_uuid(), 'rentals', 'Pickups today',       'quick=Pickups+Today', null, 'team', true, 'rentals.pickups_today'),
  (gen_random_uuid(), 'rentals', 'Returns today',       'quick=Returns+Today', null, 'team', true, 'rentals.returns_today'),
  (gen_random_uuid(), 'rentals', 'Overdue',             'quick=Overdue',       null, 'team', true, 'rentals.overdue'),
  (gen_random_uuid(), 'rentals', 'Awaiting inspection', 'quick=Inspection',    null, 'team', true, 'rentals.awaiting_inspection'),
  (gen_random_uuid(), 'rentals', 'Drafts',              'stage=Draft',         null, 'team', true, 'rentals.drafts');

commit;

-- Record 0159_saved_views in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030002', '0159_saved_views')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0159_saved_views.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0160_pricing_structures.sql
-- SHA-256: 39128c0bb5da0e3e9e2d4cea225893a564952c5377c7204c3c6f336c20c80693
-- Version: 20261122030003
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0160_pricing_structures.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Booqable adoption spec G3. Live Booqable prices products with 9 pricing structures ("Babin Daily",
-- "Days wise discount", "Rental Rate Card" …) and 4 seasonal rulesets. `lib/pricingPipeline.ts` only has a
-- flat duration %, so a client's price would change on cutover day unless the same structures exist here.
--
-- WHAT
-- ----
--   pricing_structures       a named set of duration tiles + an optional fee per extra day.
--   pricing_structure_tiles  "up to N days costs P". Prices round UP to the next tile.
--   pricing_rulesets         a named, ordered list of rules; one ruleset per product.
--   pricing_rules            kind 'charge' (free pickup / return day) or 'price' (a signed % by weekday
--                            and/or date range). Charge rules run first, then price rules, top to bottom;
--                            each price rule's `stack` says whether it compounds on the adjusted price.
--   products.pricing_structure_id / pricing_ruleset_id   which structure / ruleset a product uses.
--
-- The arithmetic is `src/lib/pricingStructures.ts` (fixture: Booqable's documented 7-day example).
--
-- NOT IN THIS FILE — and why it matters: a booking line stores ONE per-day rate, and `create_booking`
-- takes the caller's rate. A structure price does not divide into a per-day rate without a paisa
-- discrepancy against the quote, so wiring these into an invoice amount needs `create_booking` to accept a
-- line total plus a `price_breakdown` snapshot. That is a separate, larger migration (create_booking has
-- been rewritten eight times) and is deliberately NOT done here. Until then these tables and the engine
-- are the quote model and the import target.
--
-- LAW 6: every column in these tables is a price rule. Whole-row RLS — read needs auth_can_view_money(),
-- write is Owner · Admin · Manager (same tier as coupons, 0037). The two product link columns hold ids,
-- not figures, so a money-blind role may read them; changing them is a price change and is refused to a
-- money-blind role by trigger (the Warehouse can UPDATE products — 0092).
-- LAW 3: nothing is deleted. A tile, rule, structure or ruleset is retired (`retired_at`).
-- AUDIT: every insert/update is audited by the database (log_audit_event_actor, 0157).
--
-- RULING 2026-10-07: weekday numbering is 0 = Sunday … 6 = Saturday (Nepal's weekend day is Saturday).
-- REVERT: alter table products drop column pricing_structure_id, drop column pricing_ruleset_id;
--         drop table pricing_rules, pricing_rulesets, pricing_structure_tiles, pricing_structures;
-- ============================================================================

begin;

create table if not exists pricing_structures (
  id                uuid          not null default gen_random_uuid() primary key,
  client_uuid       uuid          not null,
  name              text          not null,
  extra_day_amount  numeric(14,2) check (extra_day_amount is null or extra_day_amount >= 0),
  source_ref        text,
  retired_at        timestamptz,
  created_at        timestamptz   not null default now(),
  created_by        uuid          references users (id),
  updated_at        timestamptz   not null default now(),
  updated_by        uuid          references users (id),
  constraint pricing_structures_client_uuid_key unique (client_uuid),
  constraint pricing_structures_name_len check (char_length(btrim(name)) between 1 and 120)
);
create unique index if not exists pricing_structures_name_key on pricing_structures (lower(btrim(name))) where retired_at is null;

create table if not exists pricing_structure_tiles (
  id              uuid          not null default gen_random_uuid() primary key,
  client_uuid     uuid          not null,
  structure_id    uuid          not null references pricing_structures (id),
  duration_days   integer       not null check (duration_days >= 1),
  amount          numeric(14,2) not null check (amount >= 0),
  retired_at      timestamptz,
  created_at      timestamptz   not null default now(),
  created_by      uuid          references users (id),
  updated_at      timestamptz   not null default now(),
  updated_by      uuid          references users (id),
  constraint pricing_structure_tiles_client_uuid_key unique (client_uuid)
);
create unique index if not exists pricing_structure_tiles_duration_key
  on pricing_structure_tiles (structure_id, duration_days) where retired_at is null;

create table if not exists pricing_rulesets (
  id           uuid         not null default gen_random_uuid() primary key,
  client_uuid  uuid         not null,
  name         text         not null,
  source_ref   text,
  valid_until  date,
  retired_at   timestamptz,
  created_at   timestamptz  not null default now(),
  created_by   uuid         references users (id),
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references users (id),
  constraint pricing_rulesets_client_uuid_key unique (client_uuid),
  constraint pricing_rulesets_name_len check (char_length(btrim(name)) between 1 and 120)
);
create unique index if not exists pricing_rulesets_name_key on pricing_rulesets (lower(btrim(name))) where retired_at is null;

create table if not exists pricing_rules (
  id             uuid         not null default gen_random_uuid() primary key,
  client_uuid    uuid         not null,
  ruleset_id     uuid         not null references pricing_rulesets (id),
  sort_order     integer      not null default 0,
  kind           text         not null,
  name           text         not null,
  charge_action  text,
  pickup_after   time,
  return_before  time,
  percent        numeric(6,2),
  weekdays       smallint[],
  valid_from     date,
  valid_to       date,
  apply_when     text         not null default 'overlaps',
  stack          boolean      not null default false,
  retired_at     timestamptz,
  created_at     timestamptz  not null default now(),
  created_by     uuid         references users (id),
  updated_at     timestamptz  not null default now(),
  updated_by     uuid         references users (id),
  constraint pricing_rules_client_uuid_key unique (client_uuid),
  constraint pricing_rules_kind_valid check (kind in ('charge', 'price')),
  constraint pricing_rules_apply_when_valid check (apply_when in ('overlaps', 'fits_within', 'spans')),
  constraint pricing_rules_weekdays_valid check (weekdays is null or weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint pricing_rules_dates_ordered check (valid_from is null or valid_to is null or valid_from <= valid_to),
  constraint pricing_rules_shape check (
    (kind = 'charge' and charge_action in ('skip_pickup_day', 'skip_return_day') and percent is null)
    or (kind = 'price' and charge_action is null and percent is not null and percent between -100 and 1000)
  )
);
create index if not exists idx_pricing_rules_ruleset on pricing_rules (ruleset_id, sort_order);

-- ---------------------------------------------------------------------------
-- Law 3 — nothing is deleted.
-- ---------------------------------------------------------------------------
create trigger trg_pricing_structures_reject_delete before delete on pricing_structures
  for each row execute function reject_delete_nothing_is_deleted('retire it (retired_at)');
create trigger trg_pricing_structure_tiles_reject_delete before delete on pricing_structure_tiles
  for each row execute function reject_delete_nothing_is_deleted('retire the tile (retired_at)');
create trigger trg_pricing_rulesets_reject_delete before delete on pricing_rulesets
  for each row execute function reject_delete_nothing_is_deleted('retire it (retired_at)');
create trigger trg_pricing_rules_reject_delete before delete on pricing_rules
  for each row execute function reject_delete_nothing_is_deleted('retire the rule (retired_at)');

-- Audit of record (PLAN §4.36): the database audits every change to a price rule.
create trigger trg_audit_pricing_structures after insert or update on pricing_structures
  for each row execute function log_audit_event_actor();
create trigger trg_audit_pricing_structure_tiles after insert or update on pricing_structure_tiles
  for each row execute function log_audit_event_actor();
create trigger trg_audit_pricing_rulesets after insert or update on pricing_rulesets
  for each row execute function log_audit_event_actor();
create trigger trg_audit_pricing_rules after insert or update on pricing_rules
  for each row execute function log_audit_event_actor();

-- ---------------------------------------------------------------------------
-- RLS — whole-row, money-gated (Law 6); write is Owner · Admin · Manager.
-- ---------------------------------------------------------------------------
alter table pricing_structures enable row level security;
alter table pricing_structure_tiles enable row level security;
alter table pricing_rulesets enable row level security;
alter table pricing_rules enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pricing_structures', 'pricing_structure_tiles', 'pricing_rulesets', 'pricing_rules'] loop
    execute format('create policy %I on %I for select to authenticated using (auth_is_staff() and auth_can_view_money())', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (auth_user_role() in (''Owner'', ''Admin'', ''Manager''))', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (auth_user_role() in (''Owner'', ''Admin'', ''Manager'')) with check (auth_user_role() in (''Owner'', ''Admin'', ''Manager''))', t || '_update', t);
    execute format('revoke all on %I from public, anon, authenticated', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Products point at one structure and one ruleset.
-- ---------------------------------------------------------------------------
alter table products add column if not exists pricing_structure_id uuid references pricing_structures (id);
alter table products add column if not exists pricing_ruleset_id uuid references pricing_rulesets (id);
create index if not exists idx_products_pricing_structure on products (pricing_structure_id) where pricing_structure_id is not null;
create index if not exists idx_products_pricing_ruleset on products (pricing_ruleset_id) where pricing_ruleset_id is not null;

-- products carries column-level grants (0062); a new column is not readable until it is named.
grant select (pricing_structure_id, pricing_ruleset_id) on products to authenticated;

create or replace function guard_product_pricing_link()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and not auth_can_view_money()
     and (NEW.pricing_structure_id is distinct from OLD.pricing_structure_id
          or NEW.pricing_ruleset_id is distinct from OLD.pricing_ruleset_id) then
    raise exception 'GATE:gate.pricing.money_blind_link|Only a role that can see money may change how a product is priced.' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;
revoke all on function guard_product_pricing_link() from public, anon, authenticated;

create trigger trg_products_pricing_link_guard
  before update of pricing_structure_id, pricing_ruleset_id on products
  for each row execute function guard_product_pricing_link();

commit;

-- Record 0160_pricing_structures in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030003', '0160_pricing_structures')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0160_pricing_structures.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0161_grant_booking_project_type.sql
-- SHA-256: d8ab988099b21514cb95c40974afba2bce0f5b85b4c0bba5332dc2e9a843cbd5
-- Version: 20261122030004
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0161_grant_booking_project_type.sql — written 07 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- Found by driving the app against live, signed in as Owner: the Today screen and the Rentals list
-- both failed with "listBookings failed: permission denied for table bookings". Probing column by
-- column, every booking column read fine except `project_type` and `project_type_other`.
--
-- `bookings` carries COLUMN-level grants since 0062 (the table grant was dropped and the non-money
-- columns handed back by name, Law 6). 0144 added the two columns and granted nothing, so live —
-- where 0144 is applied — refuses any select that names them. PGlite did not catch it because the
-- lifecycle runs as the table owner.
--
-- WHAT
-- ----
-- Grant SELECT on the two columns to `authenticated`. Neither is a money figure (a production
-- category and its free-text description), so money-blind roles may read them.
--
-- The app already falls back to the pre-0144 projection on this error (bookings.ts,
-- `missingProjectTypeColumn`), so the screens work before this is applied — minus Project Type.
--
-- RULING 2026-10-07: stricter-neutral (no money column, no new role), one-statement revert (B-6).
-- REVERT: revoke select (project_type, project_type_other) on bookings from authenticated;
-- ============================================================================

begin;

grant select (project_type, project_type_other) on bookings to authenticated;

-- Post-condition: proven by the catalogue, the same check 0091 uses for its grant.
do $$
begin
  if not has_column_privilege('authenticated', 'public.bookings', 'project_type', 'SELECT')
     or not has_column_privilege('authenticated', 'public.bookings', 'project_type_other', 'SELECT') then
    raise exception 'POST-CONDITION FAILED: authenticated cannot select bookings.project_type / project_type_other.';
  end if;
end $$;

commit;

-- Record 0161_grant_booking_project_type in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030004', '0161_grant_booking_project_type')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0161_grant_booking_project_type.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0162_grant_non_money_columns.sql
-- SHA-256: af285b87d93b43d72499dcd8ffdde4dd4118f82b1fe25c98b3960e4684679025
-- Version: 20261122030005
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0162_grant_non_money_columns.sql
--
-- Renumbered from an uncommitted 0159 on 8 Oct 2026 (0159 is saved views). The
-- bookings line repeats 0161 and is harmless; the other three tables are new here.
--
-- Law 6 (0062, 0077, 0130) armed column-level masking by revoking table-level
-- SELECT on tables carrying money columns from `authenticated` and granting
-- column-level SELECT on non-money columns only.
--
-- Subsequent migrations added new non-money columns to several tables without
-- extending the column-level SELECT grants for `authenticated`. This caused
-- any authenticated query selecting those columns (e.g. `confirmRental`'s
-- `readBooking` selecting `project_type`) to fail with:
--   "permission denied for table bookings"
--
-- This migration grants SELECT on all missing non-money columns to `authenticated`:
-- 1. `bookings`: project_type, project_type_other (0144)
-- 2. `booking_lines`: updated_at, rate_overridden, subrental_return_by (0138)
-- 3. `products`: service_interval_days, service_interval_rental_days, service_interval_meter_hours, service_grace_days
-- 4. `product_units`: meter_hours_recorded_at, service_meter_baseline
-- ============================================================================

begin;

grant select (project_type, project_type_other) on bookings to authenticated;
grant select (updated_at, rate_overridden, subrental_return_by) on booking_lines to authenticated;
grant select (service_interval_days, service_interval_rental_days, service_interval_meter_hours, service_grace_days) on products to authenticated;
grant select (meter_hours_recorded_at, service_meter_baseline) on product_units to authenticated;

commit;

-- Record 0162_grant_non_money_columns in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030005', '0162_grant_non_money_columns')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0162_grant_non_money_columns.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0163_close_six_anon_business_rpcs.sql
-- SHA-256: b7da7f49782717fed0ec498eac521de1868c859a33bff963d8f9062348c16072
-- Version: 20261122030006
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0163_close_six_anon_business_rpcs.sql
--
-- 2026-10-14 production privilege drift remediation (source-control proposal).
--
-- Live read-only audit found six SECURITY DEFINER business functions with
-- EXECUTE granted to anon, despite authenticated-only app workflows. This is
-- NOT proof of successful unauthorized mutation: each function has its own
-- guards, but the unwanted PostgREST RPC entry point should be closed.
--
-- The explicitly enumerated functions were observed in the active live project:
--   adjust_stock(uuid, integer, text, uuid, uuid)
--   portal_claim_by_verified_email()
--   read_quote_editor(text)
--   set_staff_active(uuid, boolean)
--   set_staff_role(uuid, system_role)
--   update_rental_quote(uuid, text, uuid, jsonb)
--
-- This migration changes NO data, row policies, table grants, trigger bodies,
-- authenticated-function grants, view definitions, or business logic.
-- Do not apply this or any other migration to production automatically.
-- N-5 requires current backup + checked live ledger + owner-reviewed cutover.
--
-- NOTE: Other Supabase advisor findings involve auth helper functions used by
-- RLS and trigger-returning functions. Blindly revoking those is NOT safe:
-- they require separate classification and behavioural tests.
-- =============================================================================

begin;

revoke execute on function public.adjust_stock(uuid, integer, text, uuid, uuid)
  from public, anon;
revoke execute on function public.portal_claim_by_verified_email()
  from public, anon;
revoke execute on function public.read_quote_editor(text)
  from public, anon;
revoke execute on function public.set_staff_active(uuid, boolean)
  from public, anon;
revoke execute on function public.set_staff_role(uuid, public.system_role)
  from public, anon;
revoke execute on function public.update_rental_quote(uuid, text, uuid, jsonb)
  from public, anon;

-- Gate every overload, not just the known signatures: new anonymous overloads
-- of these six business RPCs must not silently evade the closure.
do $verify$
declare
  v_unexpected text;
  v_auth_missing text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_unexpected
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'adjust_stock',
       'portal_claim_by_verified_email',
       'read_quote_editor',
       'set_staff_active',
       'set_staff_role',
       'update_rental_quote'
     )
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_unexpected is not null then
    raise exception '0163: business RPCs still callable by anon: %', v_unexpected;
  end if;

  -- Preserve signed-in workflows; do not solve anon access by breaking staff.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_auth_missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'adjust_stock',
       'portal_claim_by_verified_email',
       'read_quote_editor',
       'set_staff_active',
       'set_staff_role',
       'update_rental_quote'
     )
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');

  if v_auth_missing is not null then
    raise exception '0163: authenticated RPC permissions missing: %', v_auth_missing;
  end if;
end
$verify$;

commit;

-- Record 0163_close_six_anon_business_rpcs in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030006', '0163_close_six_anon_business_rpcs')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0163_close_six_anon_business_rpcs.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0165_delivery_jobs_and_event_rpc.sql
-- SHA-256: d6fc26a4a661908e912d9836c9551f85966bf8e82a232ff25f4a0fbe37b823a6
-- Version: 20261122030007
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0164_delivery_jobs_and_event_rpc.sql
-- SOURCE PROPOSAL ONLY. DO NOT APPLY TO LIVE SUPABASE.
-- Requires migration-ledger reconciliation (including separate proposed 0163),
-- staging restore rehearsal and Owner approval under DEPLOYMENT.md N-5.
-- A delivery event does not advance a booking stage, prove a signed contract,
-- receive a payment, or waive the existing handover/return gates.
begin;

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  client_uuid uuid not null unique,
  booking_id uuid not null references public.bookings(id),
  branch_id uuid not null references public.branches(id),
  leg text not null check (leg in ('Outbound', 'Return')),
  scheduled_at timestamptz not null,
  status text not null default 'Scheduled'
    check (status in ('Scheduled', 'Ready', 'In Transit', 'Delivered', 'Failed')),
  assigned_driver_id uuid references public.users(id),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  received_by text,
  last_note text,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.users(id),
  updated_at timestamptz not null default now(),
  constraint delivery_job_one_leg_per_booking unique (booking_id, leg),
  constraint delivery_job_delivered_requires_receipt
    check (status <> 'Delivered' or (delivered_at is not null and nullif(btrim(received_by), '') is not null)),
  constraint delivery_job_dispatched_requires_clock
    check (status <> 'In Transit' or dispatched_at is not null)
);
create index if not exists delivery_jobs_driver_status_idx on public.delivery_jobs(assigned_driver_id,status);
create index if not exists delivery_jobs_branch_schedule_idx on public.delivery_jobs(branch_id,scheduled_at);

-- Durable action receipt. The request key identifies ONE operation and actor.
-- Never store a contact number or other client PII in event metadata.
create table if not exists public.delivery_job_events (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  job_id uuid not null references public.delivery_jobs(id),
  event_kind text not null check (event_kind in ('Created', 'Assigned', 'Transition')),
  previous_status text,
  next_status text not null,
  actor_id uuid not null references public.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists delivery_events_job_created_idx on public.delivery_job_events(job_id, created_at);

alter table public.delivery_jobs enable row level security;
alter table public.delivery_job_events enable row level security;

-- Only the explicit RPCs may mutate. A browser cannot directly create,
-- forge a driver assignment or back-date/audit-delete a transition.
revoke all on public.delivery_jobs from public, anon, authenticated;
revoke all on public.delivery_job_events from public, anon, authenticated;
grant select on public.delivery_jobs to authenticated;
grant select on public.delivery_job_events to authenticated;

-- Direct staff-role reads below bind role to auth.uid() *and* active staff row.
-- No client-supplied role, claim override or app.current_user_id fallback is trusted.
drop policy if exists delivery_jobs_authenticated_read on public.delivery_jobs;
create policy delivery_jobs_authenticated_read on public.delivery_jobs
  for select to authenticated using (
    auth.uid() is not null and exists (
      select 1 from public.users u where u.id = auth.uid() and u.is_active and (
        u.primary_role in ('Owner','Admin')
        or (u.primary_role in ('Manager','Coordinator','Warehouse')
            and u.branch_id = delivery_jobs.branch_id)
        or (u.primary_role = 'Driver' and delivery_jobs.assigned_driver_id = u.id)
      )
    )
  );

drop policy if exists delivery_job_events_authenticated_read on public.delivery_job_events;
create policy delivery_job_events_authenticated_read on public.delivery_job_events
  for select to authenticated using (
    auth.uid() is not null
    and exists (select 1 from public.delivery_jobs j where j.id = delivery_job_events.job_id)
  );

create or replace function public.delivery_create_job(
  p_booking_id uuid, p_leg text, p_scheduled_at timestamptz, p_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_booking public.bookings%rowtype;
  v_job public.delivery_jobs%rowtype;
begin
  if v_actor is null or v_role not in ('Owner','Admin','Manager','Coordinator')
     or not exists (select 1 from public.users u where u.id=v_actor and u.is_active)
     or p_key is null or p_leg not in ('Outbound','Return') or p_scheduled_at is null then
    raise exception 'Delivery creation is not authorized or required fields are missing' using errcode='42501';
  end if;
  select * into v_booking from public.bookings where id=p_booking_id for share;
  if not found or v_booking.cancelled_at is not null or v_booking.stage='Quote'
     or (p_leg='Outbound' and v_booking.delivery_type='Client Pickup') then
    raise exception 'No active booked delivery is eligible for this leg';
  end if;
  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u
    where u.id=v_actor and u.branch_id=v_booking.branch_id
  ) then raise exception 'Delivery branch access denied' using errcode='42501'; end if;

  select * into v_job from public.delivery_jobs where client_uuid=p_key;
  if found then
    if v_job.booking_id=p_booking_id and v_job.leg=p_leg
       and v_job.scheduled_at=p_scheduled_at and v_job.created_by=v_actor then
      return v_job.id;
    end if;
    raise exception 'Delivery creation key was already used for different data';
  end if;

  insert into public.delivery_jobs
    (client_uuid, booking_id, branch_id, leg, scheduled_at, created_by, updated_by)
  values (p_key,p_booking_id,v_booking.branch_id,p_leg,p_scheduled_at,v_actor,v_actor)
  returning * into v_job;

  insert into public.delivery_job_events
    (request_key,job_id,event_kind,next_status,actor_id)
  values (p_key,v_job.id,'Created','Scheduled',v_actor);
  return v_job.id;
end;
$$;

create or replace function public.delivery_assign_driver(
  p_job_id uuid, p_driver_id uuid, p_request_key uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_receipt public.delivery_job_events%rowtype;
begin
  if v_actor is null or v_role not in ('Owner','Admin','Manager','Coordinator')
     or not exists (select 1 from public.users u where u.id=v_actor and u.is_active)
     or p_job_id is null or p_driver_id is null or p_request_key is null then
    raise exception 'Driver assignment not authorized' using errcode='42501';
  end if;
  select * into v_job from public.delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  if v_role not in ('Owner','Admin') and not exists (
    select 1 from public.users u where u.id=v_actor and u.branch_id=v_job.branch_id
  ) then raise exception 'Branch access denied' using errcode='42501'; end if;

  select * into v_receipt from public.delivery_job_events where request_key=p_request_key;
  if found then
    if v_receipt.job_id=p_job_id and v_receipt.actor_id=v_actor
       and v_receipt.event_kind='Assigned'
       and v_receipt.metadata->>'driver_id'=p_driver_id::text then
      return p_job_id;
    end if;
    raise exception 'Assignment key belongs to a different request';
  end if;
  if not exists (select 1 from public.bookings b where b.id=v_job.booking_id and b.cancelled_at is null) then
    raise exception 'Cancelled booking cannot receive a driver assignment';
  end if;
  if v_job.status not in ('Scheduled','Ready') then
    raise exception 'Driver cannot be reassigned during or after dispatch';
  end if;
  if not exists (
    select 1 from public.users u
    where u.id=p_driver_id and u.primary_role='Driver'
      and u.is_active and u.branch_id=v_job.branch_id
  ) then raise exception 'The driver is not active in this branch'; end if;

  update public.delivery_jobs
     set assigned_driver_id=p_driver_id, version=version+1,updated_at=now(),updated_by=v_actor
   where id=p_job_id;
  insert into public.delivery_job_events
    (request_key,job_id,event_kind,previous_status,next_status,actor_id,metadata)
  values (p_request_key,p_job_id,'Assigned',v_job.status,v_job.status,v_actor,
          jsonb_build_object('driver_id',p_driver_id));
  return p_job_id;
end;
$$;

create or replace function public.delivery_transition_job(
  p_job_id uuid, p_expected_status text, p_next_status text,
  p_request_key uuid, p_recipient text default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := (
    select u.primary_role::text from public.users u
    where u.id = auth.uid() and u.is_active
  );
  v_job public.delivery_jobs%rowtype;
  v_booking public.bookings%rowtype;
  v_receipt public.delivery_job_events%rowtype;
  v_manager boolean;
  v_warehouse boolean;
  v_assigned_driver boolean;
begin
  if v_actor is null or p_job_id is null or p_request_key is null
     or not exists (select 1 from public.users u where u.id=v_actor and u.is_active) then
    raise exception 'Delivery transition requires an authenticated actor' using errcode='42501';
  end if;
  select * into v_job from public.delivery_jobs where id=p_job_id for update;
  if not found then raise exception 'Delivery job not found'; end if;
  v_manager := v_role in ('Owner','Admin') or (
    v_role in ('Manager','Coordinator') and exists (
      select 1 from public.users u where u.id=v_actor and u.branch_id=v_job.branch_id
    )
  );
  v_warehouse := v_role='Warehouse' and exists (
    select 1 from public.users u where u.id=v_actor and u.branch_id=v_job.branch_id
  );
  v_assigned_driver := v_role='Driver' and v_job.assigned_driver_id=v_actor;
  if not (v_manager or v_warehouse or v_assigned_driver) then
    raise exception 'Delivery transition role or assignment denied' using errcode='42501';
  end if;

  select * into v_receipt from public.delivery_job_events where request_key=p_request_key;
  if found then
    if v_receipt.job_id=p_job_id and v_receipt.actor_id=v_actor
       and v_receipt.event_kind='Transition'
       and v_receipt.previous_status=p_expected_status
       and v_receipt.next_status=p_next_status
       and v_receipt.metadata->>'request_fingerprint' = md5(
         jsonb_build_array(p_request_key::text, coalesce(btrim(p_recipient),''),
                           coalesce(btrim(p_note),''))::text
       ) then
      return p_job_id;
    end if;
    raise exception 'Transition key belongs to a different request';
  end if;

  if v_job.status is distinct from p_expected_status then
    raise exception 'Delivery status changed. Reload before saving.' using errcode='40001';
  end if;
  if not (
      (p_expected_status='Scheduled' and p_next_status='Ready' and (v_manager or v_warehouse))
   or (p_expected_status='Ready' and p_next_status='In Transit' and (v_manager or v_assigned_driver))
   or (p_expected_status='In Transit' and p_next_status='Delivered' and (v_manager or v_assigned_driver))
   or (p_expected_status in ('Scheduled','Ready','In Transit') and p_next_status='Failed' and v_manager)
  ) then raise exception 'This delivery transition is not permitted'; end if;

  select * into v_booking from public.bookings where id=v_job.booking_id for share;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'Cancelled or missing booking cannot be dispatched'; end if;
  if p_next_status in ('Ready','In Transit') and v_job.leg='Outbound'
     and v_booking.stage not in ('Packed','On Rent') then
    raise exception 'Packing must finish before outbound dispatch';
  end if;
  if p_next_status='In Transit' and (
    v_job.assigned_driver_id is null or not exists (
      select 1 from public.users u
      where u.id=v_job.assigned_driver_id and u.primary_role='Driver'
        and u.is_active and u.branch_id=v_job.branch_id
    )
  ) then raise exception 'An active assigned driver is required before dispatch'; end if;
  if p_next_status='Delivered' and length(btrim(coalesce(p_recipient,'')))<2 then
    raise exception 'Delivery receipt requires the recipient name';
  end if;
  if p_next_status='Failed' and length(btrim(coalesce(p_note,'')))<10 then
    raise exception 'Failed dispatch requires an explanatory note';
  end if;

  update public.delivery_jobs
  set status=p_next_status,
      dispatched_at=case when p_next_status='In Transit' then now() else dispatched_at end,
      delivered_at=case when p_next_status='Delivered' then now() else delivered_at end,
      received_by=case when p_next_status='Delivered' then btrim(p_recipient) else received_by end,
      last_note=nullif(btrim(coalesce(p_note,'')),''),
      version=version+1, updated_at=now(),updated_by=v_actor
  where id=p_job_id;

  insert into public.delivery_job_events
    (request_key,job_id,event_kind,previous_status,next_status,actor_id,metadata)
  values (p_request_key,p_job_id,'Transition',p_expected_status,p_next_status,v_actor,
          jsonb_build_object('request_fingerprint',md5(
            jsonb_build_array(p_request_key::text, coalesce(btrim(p_recipient),''),
                              coalesce(btrim(p_note),''))::text
          )));
  return p_job_id;
end;
$$;

-- No anonymous callable business RPCs. No direct updates/deletes at all.
revoke all on function public.delivery_create_job(uuid,text,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.delivery_assign_driver(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.delivery_transition_job(uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.delivery_create_job(uuid,text,timestamptz,uuid) to authenticated;
grant execute on function public.delivery_assign_driver(uuid,uuid,uuid) to authenticated;
grant execute on function public.delivery_transition_job(uuid,text,text,uuid,text,text) to authenticated;

-- Contract assertions: the API role must not get a bypass write surface.
do $verify$
begin
 if has_table_privilege('authenticated','public.delivery_jobs','INSERT')
   or has_table_privilege('authenticated','public.delivery_jobs','UPDATE')
   or has_table_privilege('authenticated','public.delivery_job_events','INSERT')
   or has_table_privilege('anon','public.delivery_jobs','SELECT')
   or has_function_privilege('anon','public.delivery_create_job(uuid,text,timestamptz,uuid)','EXECUTE')
   or has_function_privilege('anon','public.delivery_assign_driver(uuid,uuid,uuid)','EXECUTE')
   or has_function_privilege('anon','public.delivery_transition_job(uuid,text,text,uuid,text,text)','EXECUTE')
 then raise exception '0164: delivery API exposure must fail closed'; end if;
end;
$verify$;
commit;

-- Record 0165_delivery_jobs_and_event_rpc in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030007', '0165_delivery_jobs_and_event_rpc')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0165_delivery_jobs_and_event_rpc.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0166_booking_transport_dispatch.sql
-- SHA-256: 9480f0efeb39b369a53329c0cfc362e9875dc699718f3e293dae4d9053420bda
-- Version: 20261122030008
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- RULING 2026-10-16: one dispatch per booking_transport; Driver remains read-only. WRITTEN, NOT APPLIED (N-5).
begin;

alter table public.booking_transport
  add column if not exists delivery_status text not null default 'Scheduled' check (delivery_status in ('Scheduled','Ready','In Transit','Delivered','Failed')),
  add column if not exists scheduled_at timestamptz,
  add column if not exists dispatched_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists recipient_name text,
  add column if not exists delivery_note text,
  add column if not exists delivery_revision integer not null default 1 check (delivery_revision>0),
  add column if not exists delivery_updated_at timestamptz not null default now();
alter table public.booking_transport add constraint booking_transport_delivery_receipt
  check (delivery_status<>'Delivered' or (delivered_at is not null and dispatched_at is not null and length(btrim(recipient_name))>=2));
create index if not exists booking_transport_driver_delivery_idx on public.booking_transport(driver_id,delivery_status);
grant select (delivery_status,scheduled_at,dispatched_at,delivered_at,recipient_name,delivery_revision,delivery_updated_at) on public.booking_transport to authenticated;

create view public.delivery_transport_v with (security_barrier=true) as
select t.id,t.booking_id,b.booking_no,b.stage::text as booking_stage,b.branch_id,
  c.name as client_name,
  case when auth_user_role()::text in ('Owner','Admin','Coordinator','Warehouse')
      or (auth_user_role()::text='Driver' and t.driver_id=auth_user_id() and t.delivery_status in ('Scheduled','Ready','In Transit'))
    then c.phone end as client_phone,
  case when auth_user_role()::text in ('Owner','Admin','Coordinator','Warehouse')
      or (auth_user_role()::text='Driver' and t.delivery_status in ('Scheduled','Ready','In Transit'))
    then b.pickup_location end as destination,
  b.delivery_type::text,t.driver_id,u.full_name as driver_name,t.vehicle,t.number_plate,
  t.delivery_status,coalesce(t.scheduled_at,b.pickup_at) as scheduled_at,
  t.dispatched_at,t.delivered_at,t.recipient_name,t.delivery_revision,t.delivery_updated_at,
  case when auth_can_view_money() then t.delivery_note end as delivery_note,
  case when auth_can_view_money() then (t.delivery_charge*100)::bigint end as delivery_charge_paisa
from public.booking_transport t join public.bookings b on b.id=t.booking_id
join public.clients c on c.id=b.client_id left join public.users u on u.id=t.driver_id
where auth_user_id() is not null and b.cancelled_at is null and b.stage<>'Quote'
  and b.delivery_type<>'Client Pickup'
  and (auth_user_role()::text in ('Owner','Admin')
    or (auth_user_role()::text in ('Coordinator','Warehouse') and b.branch_id=auth_user_branch_id())
    or (auth_user_role()::text='Driver' and t.driver_id=auth_user_id()));
revoke all on public.delivery_transport_v from public,anon;
grant select on public.delivery_transport_v to authenticated;

create or replace function public.mutate_booking_transport(
  p_id uuid,p_revision integer,p_key uuid,p_action text,
  p_driver uuid default null,p_recipient text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); actor_role text; trip booking_transport; booking bookings;
  request jsonb; receipt record; response jsonb; next_status text;
begin
  select primary_role::text into actor_role from users where id=actor and is_active;
  if actor is null or actor_role is null or actor_role not in ('Owner','Admin') then
    raise exception 'Only authorized transport administrators may change dispatches.' using errcode='42501';
  end if;
  if p_key is null or p_id is null or p_revision is null or p_action is null then raise exception 'A stable request key and revision are required.'; end if;
  request:=jsonb_build_object('transport',p_id,'revision',p_revision,'action',p_action,'driver',p_driver,'recipient',p_recipient,'note',p_note);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
  select * into receipt from record_editor_private.receipts where key=p_key;
  if found then
    if receipt.actor<>actor or receipt.request<>request then raise exception 'This request key belongs to another change.'; end if;
    return receipt.response;
  end if;
  select * into trip from booking_transport where id=p_id for update;
  if not found then raise exception 'Transport plan not found.'; end if;
  select * into booking from bookings where id=trip.booking_id for share;
  if booking.cancelled_at is not null or booking.stage in ('Quote','Closed') or booking.delivery_type='Client Pickup' then raise exception 'This booking cannot be dispatched.'; end if;
  if trip.delivery_revision<>p_revision then raise exception 'Dispatch changed. Refresh before saving.' using errcode='40001'; end if;
  next_status:=trip.delivery_status;
  if p_action='assign' then
    if trip.delivery_status not in ('Scheduled','Ready') then raise exception 'Driver assignment is locked after dispatch.'; end if;
    if not exists(select 1 from users where id=p_driver and primary_role='Driver' and is_active and branch_id=booking.branch_id) then raise exception 'Choose an active driver from this branch.'; end if;
    next_status:='Ready';
  elsif p_action='dispatch' then
    if trip.delivery_status<>'Ready' or booking.stage<>'On Rent' then raise exception 'Complete the handover gates and assign a driver before dispatch.'; end if;
    if not exists(select 1 from users where id=trip.driver_id and primary_role='Driver' and is_active and branch_id=booking.branch_id) then raise exception 'Assigned driver is no longer active.'; end if;
    next_status:='In Transit';
  elsif p_action='deliver' then
    if trip.delivery_status<>'In Transit' or length(btrim(coalesce(p_recipient,'')))<2 then raise exception 'An in-transit trip and receiver name are required.'; end if;
    next_status:='Delivered';
  elsif p_action='fail' then
    if trip.delivery_status not in ('Scheduled','Ready','In Transit') or length(btrim(coalesce(p_note,'')))<10 then raise exception 'Explain the failed active trip using at least ten characters.'; end if;
    next_status:='Failed';
  else raise exception 'Unknown delivery action.'; end if;
  if length(coalesce(p_note,''))>2000 or length(coalesce(p_recipient,''))>200 then raise exception 'Delivery text is too long.'; end if;
  update booking_transport set delivery_status=next_status,
    driver_id=case when p_action='assign' then p_driver else driver_id end,
    dispatched_at=case when p_action='dispatch' then now() else dispatched_at end,
    delivered_at=case when p_action='deliver' then now() else delivered_at end,
    recipient_name=case when p_action='deliver' then btrim(p_recipient) else recipient_name end,
    delivery_note=coalesce(nullif(btrim(p_note),''),delivery_note),
    delivery_revision=delivery_revision+1,delivery_updated_at=clock_timestamp()
    where id=p_id;
  insert into audit_events(client_uuid,event_class,category,module,action,severity,status,table_name,record_id,actor_id,actor_role,branch_id,old_values,new_values)
  values(p_key,'status change','Operations','Operations','Update','Informational','Success','booking_transport',p_id,actor,actor_role::system_role,booking.branch_id,
    jsonb_build_object('delivery_status',trip.delivery_status,'revision',trip.delivery_revision),
    jsonb_build_object('delivery_status',next_status,'revision',trip.delivery_revision+1,'operation',p_action));
  response:=jsonb_build_object('id',p_id,'revision',trip.delivery_revision+1);
  insert into record_editor_private.receipts(key,actor,request,response) values(p_key,actor,request,response);
  return response;
end; $$;
revoke all on function public.mutate_booking_transport(uuid,integer,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.mutate_booking_transport(uuid,integer,uuid,text,uuid,text,text) to authenticated;

-- The unused 0165 proposal allowed Driver writes, contrary to PERMISSIONS D2; keep its history but close execution.
revoke all on function public.delivery_create_job(uuid,text,timestamptz,uuid) from authenticated;
revoke all on function public.delivery_assign_driver(uuid,uuid,uuid) from authenticated;
revoke all on function public.delivery_transition_job(uuid,text,text,uuid,text,text) from authenticated;
commit;

-- Record 0166_booking_transport_dispatch in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030008', '0166_booking_transport_dispatch')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0166_booking_transport_dispatch.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0167_rental_revert_archive.sql
-- SHA-256: 2da4f843629481778b7f2cbf3729e257f061e2d1057c31ea26f430064e483f94
-- Version: 20261122030009
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- RULING 2026-10-16: Manager+ may revert only before handover; archive only
-- Closed/Cancelled rentals. No custody undo and no invoice/payment changes.
begin;
alter table public.bookings add column if not exists archived_at timestamptz;
alter table public.bookings add column if not exists archived_by uuid references public.users(id);
alter table public.bookings add constraint booking_archive_terminal check (
  (archived_at is null and archived_by is null) or
  (archived_at is not null and archived_by is not null and (stage='Closed' or cancelled_at is not null))
);
grant select (archived_at, archived_by) on public.bookings to authenticated;

-- Private shared custody predicate: never expose other bookings' evidence as an RPC.
create or replace function public.rental_has_pickup_evidence(p_booking_id uuid) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.booking_line_units u join public.booking_lines l on l.id=u.booking_line_id
                where l.booking_id=p_booking_id and u.unit_state::text in ('Picked Up','Returned'))
    or exists(select 1 from public.handover_lines h join public.booking_lines l on l.id=h.booking_line_id
              where l.booking_id=p_booking_id and h.state='Picked Up')
    or exists(select 1 from public.session_line_movements m join public.operation_sessions s on s.id=m.session_id
              where s.booking_id=p_booking_id and s.operation='Handover' and m.resulting_item_state='Picked Up')
    or exists(select 1 from public.operation_sessions where booking_id=p_booking_id and operation='Handover'
              and (state='Completed' or completed_at is not null));
$$;
revoke all on function public.rental_has_pickup_evidence(uuid) from public, anon, authenticated;

-- Cancellation has always been pre-custody; include unit-less partial pickups.
create or replace function public.guard_rental_cancel_custody() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if OLD.cancelled_at is null and NEW.cancelled_at is not null and public.rental_has_pickup_evidence(OLD.id) then
    raise exception 'Cancellation blocked: pickup has already occurred. Use the Return workflow to resolve custody.';
  end if;
  return NEW;
end $$;
create trigger trg_guard_rental_cancel_custody before update of cancelled_at on public.bookings
for each row execute function public.guard_rental_cancel_custody();

create or replace function public.guard_booking_archive() returns trigger
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
create or replace function public.guard_rental_reversal_writer() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if NEW.is_reversal and NEW.from_stage<>'Closed' and current_user in ('authenticated','anon') then
    raise exception 'Use the audited pre-handover rental lifecycle action.' using errcode='42501';
  end if;
  return NEW;
end $$;
create trigger trg_guard_rental_reversal_writer before insert on public.booking_stage_transitions
for each row execute function public.guard_rental_reversal_writer();

-- Serialize physical pickup evidence with the correction's booking lock. A
-- concurrent floor writer must see the new stage before recording custody.
create or replace function public.guard_rental_outbound_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_booking public.bookings%rowtype;
begin
  if current_setting('role',true) in ('authenticated','anon') and
     coalesce(public.auth_user_role()::text,'') not in ('Owner','Admin','Manager','Warehouse','Technician') then
    raise exception 'Only floor staff can record pickup evidence.' using errcode='42501';
  end if;
  if TG_TABLE_NAME='session_line_movements' then
    if NEW.resulting_item_state is distinct from 'Picked Up'::public.item_quantity_state then return NEW; end if;
    select b.* into v_booking from public.bookings b join public.operation_sessions s on s.booking_id=b.id
      where s.id=NEW.session_id for update of b;
  else
    if NEW.state::text<>'Picked Up' then return NEW; end if;
    if TG_OP='UPDATE' and OLD.state=NEW.state then return NEW; end if;
    select b.* into v_booking from public.bookings b join public.booking_lines l on l.booking_id=b.id
      where l.id=NEW.booking_line_id for update of b;
  end if;
  -- Existing outbound receipts may finish after the On Rent stage commits.
  if v_booking.id is null or v_booking.stage not in ('Packed','On Rent') or v_booking.cancelled_at is not null or v_booking.archived_at is not null then
    raise exception 'Handover cannot continue: this rental is no longer ready for pickup. Refresh the booking.';
  end if;
  return NEW;
end $$;
create trigger trg_guard_rental_pickup_movement before insert on public.session_line_movements
for each row execute function public.guard_rental_outbound_write();
create trigger trg_guard_rental_pickup_line before insert or update of state on public.handover_lines
for each row execute function public.guard_rental_outbound_write();

create or replace function public.manage_rental_lifecycle(p_payload jsonb) returns jsonb
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
    if v_booking.stage<>'Closed' and public.rental_has_pickup_evidence(v_id) then
      raise exception 'Archive blocked: this cancelled booking has pickup evidence. Resolve custody before archiving.';
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
    if public.rental_has_pickup_evidence(v_id) then
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

-- Record 0167_rental_revert_archive in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030009', '0167_rental_revert_archive')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0167_rental_revert_archive.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0168_booking_line_totals_and_breakdown.sql
-- SHA-256: f567f95d108a5917b5b960cfd7c229f2d5f865c441ac3232d6e816d340c0ea73
-- Version: 20261122030010
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- 0168_booking_line_totals_and_breakdown.sql — written 16 Oct 2026. NOT APPLIED to live (N-5).
--
-- WHY
-- ---
-- OPEN_DECISIONS §11 G3: pricing structures (0160) price a QUOTE, but a booking
-- line stores ONE per-day rate and create_booking takes the caller's rate. A
-- structure/fixed price does not divide into a per-day rate without a paisa
-- discrepancy against the quote, so an invoice cannot reproduce it. Until now a
-- structure-priced product had to be keyed with a flat rate on the booking.
--
-- WHAT
-- ----
--   booking_lines.line_total numeric(14,2)   the line's NET figure (stored, not derived)
--   booking_lines.price_breakdown jsonb     the quote snapshot (structure/ruleset
--                                           ids, charged days, adjustments) or NULL
--                                           for flat-rate history
--   invoice_lines.price_breakdown jsonb     carried from the booking line
--   create_booking accepts an optional per-line line_total + price_breakdown,
--   validated (non-negative, whole paisa, breakdown is an object, never one
--   without the other). Money-blind callers may not state money: the server
--   figures win and supplied figures are ignored (Law 6, same precedent as the
--   0119 rate handling). Absent a stated total the historic formula applies.
--   create_invoice prefers the stored line_total and copies the breakdown.
--
-- LAW 6: both new columns are money. No base-table grant is added (mirroring
-- rate/discount_amount); reads go through booking_lines_v with the same
-- auth_can_view_money() masking, and the lines guard refuses direct inserts by
-- money-blind callers outside create_booking.
-- LAW 3: nullable-add only; history backfills from the exact invoice formula.
-- A NULL breakdown on old rows is the honest flat-rate marker, not a gap.
--
-- RULING 2026-10-16 (G3 engineering close-out, no product call): structure
-- pricing still quotes through src/lib/pricingStructures.ts; this migration is
-- the persistence half. Client quote-to-booking wiring follows separately.
-- REVERT: re-apply the 0164 bodies of create_booking/create_invoice and
-- booking_lines_v (git history), then drop the three columns.
-- ============================================================================

begin;

alter table booking_lines add column if not exists line_total numeric(14,2);
alter table booking_lines add column if not exists price_breakdown jsonb;
alter table invoice_lines add column if not exists price_breakdown jsonb;

-- Backfill BEFORE the coherence constraints: every historic line carries the
-- exact figure its invoice would have computed.
update booking_lines
   set line_total = greatest(0,
     greatest(1, coalesce(qty, 1)) * greatest(1, coalesce(days, 1)) * coalesce(rate, 0)
     - coalesce(discount_amount, 0))
 where line_total is null;

alter table booking_lines add constraint booking_lines_line_total_nonnegative
  check (line_total is null or line_total >= 0);
alter table booking_lines add constraint booking_lines_breakdown_needs_total
  check (price_breakdown is null or line_total is not null);
alter table booking_lines add constraint booking_lines_breakdown_is_object
  check (price_breakdown is null or jsonb_typeof(price_breakdown) = 'object');
alter table invoice_lines add constraint invoice_lines_breakdown_is_object
  check (price_breakdown is null or jsonb_typeof(price_breakdown) = 'object');

-- ---------------------------------------------------------------------------
-- Law 6 guard: money-blind callers cannot insert money figures directly.
-- Mirrors 0119; the create_booking transaction bypass (app.in_create_booking)
-- is unchanged.
-- ---------------------------------------------------------------------------
create or replace function guard_booking_lines_money_blind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.in_create_booking', true) = 'on' then
    return NEW;
  end if;

  if not auth_can_view_money() then
    if (NEW.rate is not null and NEW.rate <> 0)
       or (NEW.discount_amount is not null and NEW.discount_amount <> 0)
       or NEW.supplier_cost is not null
       or NEW.markup_amount is not null
       or NEW.line_total is not null
       or NEW.price_breakdown is not null then
      raise exception 'GATE:gate.booking_lines.money_blind_insert|Money-blind callers cannot insert money figures into booking_lines outside create_booking'
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_booking_lines_money_insert on booking_lines;
create trigger trg_guard_booking_lines_money_insert
  before insert on booking_lines
  for each row execute function guard_booking_lines_money_blind();

-- ---------------------------------------------------------------------------
-- booking_lines_v: the masked read surface (mirrors 0048). Money columns are
-- NULL for money-blind roles; nothing is granted on the base table.
-- ---------------------------------------------------------------------------
create or replace view public.booking_lines_v as
 SELECT id,
    client_uuid,
    booking_id,
    line_type,
    parent_line_id,
    product_id,
    bundle_id,
    description,
    qty,
    days,
        CASE
            WHEN auth_can_view_money() THEN rate
            ELSE NULL::numeric
        END AS rate,
        CASE
            WHEN auth_can_view_money() THEN discount_amount
            ELSE NULL::numeric
        END AS discount_amount,
    is_included,
    service_basis,
    supplier_id,
        CASE
            WHEN auth_can_view_money() THEN supplier_cost
            ELSE NULL::numeric
        END AS supplier_cost,
        CASE
            WHEN auth_can_view_money() THEN markup_amount
            ELSE NULL::numeric
        END AS markup_amount,
    line_note,
    sort_order,
    voided_at,
    voided_reason,
    created_at,
    created_by,
        CASE
            WHEN auth_can_view_money() THEN line_total
            ELSE NULL::numeric
        END AS line_total,
        CASE
            WHEN auth_can_view_money() THEN price_breakdown
            ELSE NULL::jsonb
        END AS price_breakdown
   FROM booking_lines
  where auth_is_staff();

CREATE OR REPLACE FUNCTION public.create_booking(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_client_uuid     uuid := (p_payload ->> 'client_uuid')::uuid;
  v_existing_id     uuid;
  v_existing_no     text;
  v_existing_stage  text;
  v_booking_id      uuid;
  v_booking_no      text;
  v_actor           uuid := (p_payload ->> 'created_by')::uuid;
  v_branch          uuid := (p_payload ->> 'branch_id')::uuid;
  v_lines           jsonb;
  v_line            jsonb;
  v_discount        jsonb;
  v_audit_id        uuid;
  v_line_count      integer := 0;
  v_unit_count      integer := 0;
  v_pending         jsonb;
  v_next            jsonb;
  v_parent_key      uuid;
  v_parent_id       uuid;
  v_wrote           integer;
  v_line_id         uuid;
  v_unit            jsonb;
  v_asset_product   uuid;
  v_dupe_assets     integer;
  v_base_rate       numeric;
  v_payload_rate    numeric;
  v_final_rate      numeric;
  v_rate_overridden boolean;
  /* 0168 */
  v_payload_total     numeric;
  v_payload_breakdown jsonb;
  v_final_total       numeric;
  v_line_qty          integer;
  v_line_days         integer;
  v_line_discount     numeric;
  v_computed_total    numeric;
  /* 0132 */
  v_crew            jsonb;
  v_transport       jsonb;
  v_crew_count      integer := 0;
  v_transport_written boolean := false;
  /* 0144 */
  v_project_type       text := nullif(btrim(p_payload ->> 'project_type'), '');
  v_project_type_other text := nullif(btrim(p_payload ->> 'project_type_other'), '');
begin
  if v_client_uuid is null then
    raise exception 'create_booking: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_booking: created_by is required; there is no system actor';
  end if;

  -- ── 0144 project-type validation, BEFORE anything is written ──────────────
  if v_project_type is not null and v_project_type not in (
    'Feature Film',
    'Short Film',
    'Documentary',
    'Commercial / Advertisement',
    'Music Video',
    'Corporate',
    'Wedding',
    'Event',
    'TV / Broadcast',
    'Web / Digital Content',
    'Photography',
    'Student Project',
    'Personal / Test Shoot',
    'Rental House / Sub-rental',
    'Other'
  ) then
    raise exception 'create_booking: project_type "%" is not an allowed value. Nothing was created.', v_project_type;
  end if;
  if v_project_type_other is not null and v_project_type <> 'Other' then
    raise exception 'create_booking: project_type_other is only used with project_type Other. Nothing was created.';
  end if;
  if v_project_type = 'Other' and v_project_type_other is null then
    raise exception 'create_booking: project_type Other requires project_type_other. Nothing was created.';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written or any counter moves ──
  select id, booking_no, stage::text
    into v_existing_id, v_existing_no, v_existing_stage
    from bookings
   where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'booking_id', v_existing_id,
      'booking_no', v_existing_no,
      'stage',      v_existing_stage,
      'replayed',   true
    );
  end if;

  -- Mark transaction as inside create_booking so the lines guard admits our writes
  perform set_config('app.in_create_booking', 'on', true);

  -- Never let money-blind callers override VAT (including selecting 0%).
  if p_payload ? 'vat_rate' and not coalesce(auth_can_view_money(),false) then
    raise exception 'GATE:gate.vat.money_blind|Only authorized money-visible staff can select a booking VAT rate'
      using errcode='42501';
  end if;

  -- ── Discount gate for money-blind callers (Law 6) ─────────────────────────
  if jsonb_array_length(coalesce(p_payload -> 'discounts', '[]'::jsonb)) > 0 and not auth_can_view_money() then
    raise exception 'GATE:gate.discount.money_blind|Money-blind callers may not apply discounts (Law 6)'
      using errcode = 'P0001';
  end if;

  v_booking_no := next_document_number('booking');

  insert into bookings (
    client_uuid, booking_no, branch_id, client_id, contact_id,
    project, project_type, project_type_other, pickup_at, return_at, delivery_type,
    pickup_location, return_location, quote_expires_at, deposit_required,
    vat_rate, created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_no,
    v_branch,
    (p_payload ->> 'client_id')::uuid,
    (p_payload ->> 'contact_id')::uuid,
    p_payload ->> 'project',
    v_project_type,
    v_project_type_other,
    (p_payload ->> 'pickup_at')::timestamptz,
    (p_payload ->> 'return_at')::timestamptz,
    (p_payload ->> 'delivery_type')::delivery_type,
    p_payload ->> 'pickup_location',
    p_payload ->> 'return_location',
    (p_payload ->> 'quote_expires_at')::timestamptz,
    coalesce((p_payload ->> 'deposit_required')::numeric, 0),
    case when p_payload ? 'vat_rate' then (p_payload ->> 'vat_rate')::numeric else null end,
    v_actor,
    v_actor
  )
  returning id into v_booking_id;

  -- ── Lines, in dependency order ────────────────────────────────────────────
  v_lines := coalesce(p_payload -> 'lines', '[]'::jsonb);

  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    if v_line ->> 'client_uuid' is null then
      raise exception 'create_booking: every line needs its own client_uuid (one per ROW, not per action)';
    end if;
    if v_line ->> 'days' is null then
      raise exception 'create_booking: line % has no days; Law 9 requires it stated, not defaulted', v_line ->> 'client_uuid';
    end if;

    if jsonb_array_length(coalesce(v_line -> 'units', '[]'::jsonb))
         > coalesce((v_line ->> 'qty')::integer, 1) then
      raise exception
        'create_booking: line % carries more units (%) than its qty (%). Nothing was created.',
        v_line ->> 'client_uuid',
        jsonb_array_length(v_line -> 'units'),
        coalesce((v_line ->> 'qty')::integer, 1);
    end if;
    for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
    loop
      if v_unit ->> 'client_uuid' is null then
        raise exception 'create_booking: every unit needs its own client_uuid (Law 8, one per ROW)';
      end if;
      if v_unit ->> 'asset_id' is null then
        raise exception 'create_booking: a unit entry on line % names no asset_id', v_line ->> 'client_uuid';
      end if;
    end loop;
  end loop;

  select count(*) - count(distinct u ->> 'asset_id')
    into v_dupe_assets
    from jsonb_array_elements(v_lines) as l,
         jsonb_array_elements(coalesce(l -> 'units', '[]'::jsonb)) as u;
  if v_dupe_assets > 0 then
    raise exception
      'create_booking: the same physical unit appears % extra time(s) across this booking''s units. Nothing was created.',
      v_dupe_assets;
  end if;

  v_pending := v_lines;

  while jsonb_array_length(v_pending) > 0 loop
    v_wrote := 0;
    v_next := '[]'::jsonb;

    for v_line in select * from jsonb_array_elements(v_pending)
    loop
      v_parent_key := (v_line ->> 'parent_client_uuid')::uuid;
      v_parent_id  := (v_line ->> 'parent_line_id')::uuid;

      if v_parent_key is not null then
        select id into v_parent_id
          from booking_lines
         where client_uuid = v_parent_key
           and booking_id = v_booking_id;

        if v_parent_id is null then
          v_next := v_next || jsonb_build_array(v_line);
          continue;
        end if;
      end if;

      -- ── S1-7: Line pricing calculation ─────────────────────────────────────
      if v_parent_id is not null or coalesce((v_line ->> 'is_included')::boolean, false) then
        v_base_rate := 0;
      elsif (v_line ->> 'product_id') is not null or (v_line ->> 'bundle_id') is not null then
        v_base_rate := get_model_daily_rate((v_line ->> 'product_id')::uuid, (v_line ->> 'bundle_id')::uuid);
      else
        v_base_rate := coalesce((v_line ->> 'rate')::numeric, 0);
      end if;

      v_payload_rate := (v_line ->> 'rate')::numeric;
      v_rate_overridden := false;

      if auth_can_view_money() then
        if v_payload_rate is not null then
          v_final_rate := v_payload_rate;
          if v_base_rate is not null and v_final_rate <> v_base_rate then
            v_rate_overridden := true;
          end if;
        else
          v_final_rate := coalesce(v_base_rate, 0);
        end if;
      else
        -- Money-blind caller: silently use server price
        v_final_rate := coalesce(v_base_rate, 0);
        v_rate_overridden := false;

        if v_payload_rate is not null and v_payload_rate <> v_final_rate then
          insert into audit_events (
            id, client_uuid, event_class, category, module, action, severity, status,
            table_name, record_id, actor_id, branch_id, reason, new_values
          )
          values (
            gen_random_uuid(),
            gen_random_uuid(),
            'override',
            'Rentals',
            'Rentals',
            'price.server_applied',
            'Informational',
            'Success',
            'booking_lines',
            v_booking_id,
            v_actor,
            v_branch,
            'Server-side price applied for money-blind caller (Law 6)',
            jsonb_build_object(
              'booking_no',   v_booking_no,
              'product_id',   v_line ->> 'product_id',
              'payload_rate', v_payload_rate,
              'applied_rate', v_final_rate
            )
          );
        end if;
      end if;

      -- ── 0168: Line total + price breakdown (G3) ──────────────────────────
      -- A structure/fixed price does not divide into a per-day rate without a
      -- paisa discrepancy, so the caller may state the line total with its
      -- breakdown snapshot. Money-blind callers never state money: the server
      -- figures win and any supplied figures are ignored (Law 6).
      v_line_qty      := greatest(1, coalesce((v_line ->> 'qty')::integer, 1));
      v_line_days     := greatest(1, (v_line ->> 'days')::integer);
      v_line_discount := case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end;
      v_computed_total := greatest(0, v_line_qty * v_line_days * v_final_rate - v_line_discount);

      v_payload_total := (v_line ->> 'line_total')::numeric;
      v_payload_breakdown := v_line -> 'price_breakdown';

      if not auth_can_view_money() then
        v_final_total := v_computed_total;
        v_payload_breakdown := null;
      elsif v_payload_total is not null then
        if v_payload_total < 0 then
          raise exception 'create_booking: line % carries a negative line_total %. Nothing was created.', v_line ->> 'client_uuid', v_payload_total;
        end if;
        if v_payload_total <> round(v_payload_total, 2) then
          raise exception 'create_booking: line % line_total % is not a whole-paisa figure. Nothing was created.', v_line ->> 'client_uuid', v_payload_total;
        end if;
        if v_payload_breakdown is not null and jsonb_typeof(v_payload_breakdown) <> 'object' then
          raise exception 'create_booking: line % price_breakdown must be a JSON object. Nothing was created.', v_line ->> 'client_uuid';
        end if;
        v_final_total := v_payload_total;
      else
        if v_payload_breakdown is not null then
          raise exception 'create_booking: line % carries a price_breakdown with no line_total. Nothing was created.', v_line ->> 'client_uuid';
        end if;
        v_final_total := v_computed_total;
      end if;

      insert into booking_lines (
        client_uuid, booking_id, line_type, parent_line_id, product_id, bundle_id,
        description, qty, days, rate, discount_amount, is_included, service_basis,
        supplier_id, supplier_cost, markup_amount, line_note, sort_order, created_by,
        rate_overridden, line_total, price_breakdown
      )
      values (
        (v_line ->> 'client_uuid')::uuid,
        v_booking_id,
        (v_line ->> 'line_type')::booking_line_type,
        v_parent_id,
        (v_line ->> 'product_id')::uuid,
        (v_line ->> 'bundle_id')::uuid,
        v_line ->> 'description',
        coalesce((v_line ->> 'qty')::integer, 1),
        (v_line ->> 'days')::integer,
        v_final_rate,
        case when auth_can_view_money() then coalesce((v_line ->> 'discount_amount')::numeric, 0) else 0 end,
        coalesce((v_line ->> 'is_included')::boolean, false),
        (v_line ->> 'service_basis')::service_basis,
        (v_line ->> 'supplier_id')::uuid,
        case when auth_can_view_money() then (v_line ->> 'supplier_cost')::numeric else null end,
        case when auth_can_view_money() then (v_line ->> 'markup_amount')::numeric else null end,
        v_line ->> 'line_note',
        coalesce((v_line ->> 'sort_order')::integer, v_line_count),
        v_actor,
        v_rate_overridden,
        v_final_total,
        v_payload_breakdown
      )
      returning id into v_line_id;

      -- ── D5: creation-time unit assignment ───────────────────────────────
      for v_unit in select * from jsonb_array_elements(coalesce(v_line -> 'units', '[]'::jsonb))
      loop
        if v_line ->> 'product_id' is not null then
          select product_id into v_asset_product
            from product_units
           where id = (v_unit ->> 'asset_id')::uuid;
          if v_asset_product is null then
            raise exception 'create_booking: unit % on line % names no known product_unit',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
          if v_asset_product <> (v_line ->> 'product_id')::uuid then
            raise exception
              'create_booking: unit % belongs to a different product than line %. Nothing was created.',
              v_unit ->> 'asset_id', v_line ->> 'client_uuid';
          end if;
        end if;

        insert into booking_line_units (client_uuid, booking_line_id, asset_id, qty, created_by)
        values (
          (v_unit ->> 'client_uuid')::uuid,
          v_line_id,
          (v_unit ->> 'asset_id')::uuid,
          1,
          v_actor
        );
        v_unit_count := v_unit_count + 1;
      end loop;

      v_line_count := v_line_count + 1;
      v_wrote := v_wrote + 1;
    end loop;

    if v_wrote = 0 then
      raise exception
        'create_booking: % line(s) name a parent_client_uuid that is not on this booking (or the parents form a cycle). Nothing was created.',
        jsonb_array_length(v_next);
    end if;

    v_pending := v_next;
  end loop;

  -- ── Discounts ────────────────────────────────────────────────────────────
  for v_discount in select * from jsonb_array_elements(coalesce(p_payload -> 'discounts', '[]'::jsonb))
  loop
    v_audit_id := gen_random_uuid();

    insert into audit_events (
      id, client_uuid, event_class, category, module, action, severity, status,
      table_name, record_id, actor_id, branch_id, reason, new_values
    )
    values (
      v_audit_id,
      coalesce((v_discount ->> 'audit_client_uuid')::uuid, gen_random_uuid()),
      'discount',
      'Rentals',
      'Rentals',
      'Create',
      'Informational',
      'Success',
      'booking_discounts',
      v_booking_id,
      v_actor,
      v_branch,
      v_discount ->> 'reason',
      jsonb_build_object(
        'discount_source', v_discount ->> 'discount_source',
        'percent',         v_discount ->> 'percent',
        'booking_no',      v_booking_no
      )
    );

    insert into booking_discounts (
      client_uuid, booking_id, branch_id, discount_source, percent,
      reason, approver_id, applied_by, coupon_id, audit_event_id
    )
    values (
      (v_discount ->> 'client_uuid')::uuid,
      v_booking_id,
      v_branch,
      (v_discount ->> 'discount_source')::discount_source,
      (v_discount ->> 'percent')::numeric,
      v_discount ->> 'reason',
      (v_discount ->> 'approver_id')::uuid,
      v_actor,
      (v_discount ->> 'coupon_id')::uuid,
      v_audit_id
    );
  end loop;

  -- ── Crew (0132) — inside the transaction, or the booking does not exist ──
  for v_crew in select * from jsonb_array_elements(coalesce(p_payload -> 'crew', '[]'::jsonb))
  loop
    if v_crew ->> 'client_uuid' is null then
      raise exception 'create_booking: every crew row needs its own client_uuid (Law 8, one per ROW)';
    end if;

    insert into booking_crew_lines (
      client_uuid, booking_id, crew_member_id, name, crew_role, phone,
      day_rate, days, overtime, accommodation, meals, created_by
    )
    values (
      (v_crew ->> 'client_uuid')::uuid,
      v_booking_id,
      (v_crew ->> 'crew_member_id')::uuid,
      v_crew ->> 'name',
      (v_crew ->> 'crew_role')::crew_role,
      v_crew ->> 'phone',
      coalesce((v_crew ->> 'day_rate')::numeric, 0),
      (v_crew ->> 'days')::integer,
      coalesce((v_crew ->> 'overtime')::numeric, 0),
      coalesce((v_crew ->> 'accommodation')::numeric, 0),
      coalesce((v_crew ->> 'meals')::numeric, 0),
      v_actor
    );
    v_crew_count := v_crew_count + 1;
  end loop;

  -- ── Transport (0132) — the one row `booking_transport_booking_id_key` allows ──
  if jsonb_typeof(p_payload -> 'transport') = 'object' then
    v_transport := p_payload -> 'transport';
    if v_transport ->> 'client_uuid' is null then
      raise exception 'create_booking: the transport row needs its own client_uuid (Law 8)';
    end if;

    insert into booking_transport (
      client_uuid, booking_id, delivery_charge, fuel_charge,
      vehicle, number_plate, driver_contact, special_instructions, created_by
    )
    values (
      (v_transport ->> 'client_uuid')::uuid,
      v_booking_id,
      coalesce((v_transport ->> 'delivery_charge')::numeric, 0),
      coalesce((v_transport ->> 'fuel_charge')::numeric, 0),
      v_transport ->> 'vehicle',
      v_transport ->> 'number_plate',
      v_transport ->> 'driver_contact',
      v_transport ->> 'special_instructions',
      v_actor
    );
    v_transport_written := true;
  end if;

  return jsonb_build_object(
    'booking_id',        v_booking_id,
    'booking_no',        v_booking_no,
    'stage',             'Quote',
    'line_count',        v_line_count,
    'unit_count',        v_unit_count,
    'crew_lines',        v_crew_count,
    'transport_written', v_transport_written,
    'replayed',          false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_invoice(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_client_uuid  uuid    := (p_payload ->> 'client_uuid')::uuid;
  v_actor        uuid    := (p_payload ->> 'created_by')::uuid;
  v_booking_no   text    := nullif(btrim(coalesce(p_payload ->> 'booking_no', '')), '');
  v_booking_key  uuid    := (p_payload ->> 'booking_id')::uuid;
  v_vat_rate     numeric := (p_payload ->> 'vat_rate')::numeric;
  v_notes        text    := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_role         system_role;
  v_existing     invoices%rowtype;
  v_booking_id   uuid;
  v_resolved_no  text;
  v_client_id    uuid;
  v_branch_id    uuid;
  v_cancelled    timestamptz;
  v_terms        text;
  v_term_days    integer;
  v_due_date     date;
  v_discounts    integer;
  v_booking_vat_rate numeric(5,4);
  v_percent      numeric := 0;
  v_prior        record;
  v_invoice_id   uuid;
  v_line_count   integer := 0;
  v_written      integer;
  v_totals       invoices%rowtype;
begin
  -- ── Rights, first, before anything is read ────────────────────────────────
  -- R-05: Owner · Admin · Manager · Accounts may raise an invoice. This is the
  -- gate, because definer rights mean RLS will not be. It repeats 0086's four
  -- policies on purpose; the post-conditions below prove the two agree by
  -- calling this function as a Coordinator and as Warehouse.
  v_role := auth_user_role();
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception
      'create_invoice: this session (%) may not raise an invoice. R-05 gives that to Owner, Admin, Manager and Accounts. Nothing was created.',
      coalesce(v_role::text, 'unidentified')
      using errcode = '42501';
  end if;

  -- Law 6. Redundant while auth_can_view_money() excludes exactly the roles
  -- R-05 omits, and kept so that it stays true if either definition moves. A
  -- money-blind caller is refused by name rather than billing zero.
  if not auth_can_view_money() then
    raise exception
      'create_invoice: this session cannot read money (Law 6), so the invoice it raised would bill nothing. Nothing was created.'
      using errcode = '42501';
  end if;

  if v_client_uuid is null then
    raise exception 'create_invoice: client_uuid is required (Law 8 — every write carries one)';
  end if;
  if v_actor is null then
    raise exception 'create_invoice: created_by is required; there is no system actor';
  end if;

  -- ── Law 8 replay check, BEFORE anything is written ────────────────────────
  select * into v_existing from invoices where client_uuid = v_client_uuid;
  if found then
    return jsonb_build_object(
      'invoice_id',      v_existing.id,
      'invoice_no',      v_existing.invoice_no,
      'status',          v_existing.status,
      'booking_id',      v_existing.booking_id,
      'booking_no',      (select booking_no from bookings where id = v_existing.booking_id),
      'client_id',       v_existing.client_id,
      'due_date',        v_existing.due_date,
      'line_count',      (select count(*) from invoice_lines where invoice_id = v_existing.id),
      'subtotal',        v_existing.subtotal,
      'discount_amount', v_existing.discount_amount,
      'taxable_amount',  v_existing.taxable_amount,
      'vat_amount',      v_existing.vat_amount,
      'total',           v_existing.total_amount,
      'replayed',        true
    );
  end if;

  -- ── The booking this bills ────────────────────────────────────────────────
  -- Either key is accepted; `booking_no` is what the operator saw on screen and
  -- what the action holds, `booking_id` is what a server-side caller holds.
  if v_booking_key is null and v_booking_no is null then
    raise exception 'create_invoice: an invoice must name the booking it bills (booking_id or booking_no).';
  end if;

  select b.id, b.booking_no, b.client_id, b.branch_id, b.cancelled_at
    into v_booking_id, v_resolved_no, v_client_id, v_branch_id, v_cancelled
    from bookings b
   where (v_booking_key is not null and b.id = v_booking_key)
      or (v_booking_key is null and b.booking_no = v_booking_no);

  if not found then
    raise exception
      'create_invoice: no booking % exists, so there is nothing to invoice and nothing was created.',
      coalesce(v_booking_key::text, v_booking_no);
  end if;

  -- A cancelled booking is not invoiced from here. Whether a cancellation
  -- carries a fee is explicitly unruled (PLAN.md §4.16), so this refuses rather
  -- than deciding it — the same position `createInvoice.ts` took.
  if v_cancelled is not null then
    raise exception
      'create_invoice: booking % was cancelled on %. Whether a cancellation carries a fee is an open ruling (PLAN.md §4.16), so nothing was created.',
      v_resolved_no, v_cancelled::date;
  end if;

  -- ── R-03 · one invoice per rental ─────────────────────────────────────────
  -- Checked after the replay check, so a genuine retry of the same press is a
  -- replay and only a SECOND intent is refused. Refuses on ANY existing
  -- invoice including a voided one, which is stricter than SPEC-P0-1 §3.1's
  -- "no non-Void invoice": the line keys are the booking rows' own client_uuids
  -- (see the header), so a second invoice over the same booking would collide
  -- on invoice_lines_client_uuid_key partway through. Re-invoicing after a void
  -- needs its own key strategy and its own ruling; refusing is the honest
  -- interim. TODO(decision) — re-invoicing a booking whose only invoice was
  -- voided (MONEY-07).
  -- Aliased so the record's field names are unmistakable; an unaliased
  -- `status::text` is still called `status`, which reads like the column and is
  -- not one.
  select invoice_no as prior_no, status::text as prior_status into v_prior
    from invoices where booking_id = v_booking_id limit 1;
  if found then
    raise exception
      'create_invoice: booking % already has an invoice (%, %). One invoice per rental — damage and late fees append as lines to the existing Draft, and corrections after issue are Void + Credit Note. Nothing was created.',
      v_resolved_no, coalesce(v_prior.prior_no, 'a Draft'), v_prior.prior_status;
  end if;

  -- ── The due date, from the client's payment terms ─────────────────────────
  -- `clients.payment_terms` is an enum whose labels ARE the rule; this is not a
  -- policy decision restated in SQL. NOT NULL DEFAULT 'Immediate', so the
  -- coalesce is a belt, and Immediate (due today) is the safe direction: it is
  -- visible and correctable, where a wrong 30 grants credit nobody agreed to.
  select payment_terms::text into v_terms from clients where id = v_client_id;
  v_term_days := case coalesce(v_terms, 'Immediate')
                   when '7 days'  then 7
                   when '15 days' then 15
                   when '30 days' then 30
                   else 0
                 end;
  v_due_date := current_date + v_term_days;

  -- Several audited discount rows add into one invoice discount percentage.
  select count(*), coalesce(sum(percent),0)
    into v_discounts, v_percent
    from public.booking_discounts where booking_id=v_booking_id;
  if v_percent < 0 or v_percent > 100 then
    raise exception 'Invalid booking discount %', v_percent using errcode='23514';
  end if;
  -- New bookings pin a VAT fraction; legacy bookings retain supplied invoice VAT.
  select b.vat_rate into v_booking_vat_rate from public.bookings b where b.id=v_booking_id;
  -- The booking's pinned tax mode is authoritative, including zero VAT.
  -- The caller's current Settings value might have changed since the Quote;
  -- do not let the later device setting reprice the client's agreed booking.
  if v_booking_vat_rate is not null then
    v_vat_rate:=v_booking_vat_rate;
  end if;
  -- ── The header ────────────────────────────────────────────────────────────
  -- `invoice_no` and `issue_date` are OMITTED, not set to null: the column list
  -- is what documents the intent (R-15). 0086 makes both nullable and adds
  -- `invoices_issued_together` so a half-issued row cannot exist.
  -- The money columns keep their zero defaults; the trigger owns them.
  insert into invoices (
    client_uuid, booking_id, client_id, branch_id, status,
    due_date, currency, discount_percent, vat_rate, notes,
    created_by, updated_by
  )
  values (
    v_client_uuid,
    v_booking_id,
    v_client_id,
    v_branch_id,
    'Draft',
    v_due_date,
    'NPR',
    coalesce(v_percent, 0),
    -- numeric(5,4) — a FRACTION, not a percentage. 13% arrives as 0.1300.
    coalesce(v_vat_rate, 0.1300),
    v_notes,
    v_actor,
    v_actor
  )
  returning id into v_invoice_id;

  -- ── The lines: a snapshot, not a join ─────────────────────────────────────
  -- SPEC-P0-1 §3.1: the rate card is pinned per booking, so the figures are
  -- COPIED here and never re-derived from `products` afterwards.
  --
  -- `line_total` carries each line's NET figure, because
  -- `recalculate_invoice_totals` derives the subtotal as `sum(line_total)`. The
  -- booking-level percentage is applied on top by the trigger from the header's
  -- `discount_percent`; `invoice_lines.discount_percent` stays 0, because the
  -- line's own discount is already inside its total and counting it twice would
  -- discount twice.

  -- (1) Equipment and bundles, from `booking_lines`.
  -- The mapping is `LINE_KIND_BY_TYPE` from createInvoice.ts, moved next to the
  -- enums it maps. Every member of `booking_line_type` is named and the CASE
  -- has **no ELSE on purpose**: if `booking_line_type` ever grows a member,
  -- this yields NULL, `invoice_lines.line_kind` is NOT NULL, and the whole
  -- transaction aborts with nothing written. That is the safe direction. The
  -- TypeScript it replaces fell through a `?? 'Equipment Rental'`, so an
  -- accessory or an ad-hoc line was billed as equipment rental with nothing
  -- said about it.
  -- ⚠ `line_kind` has no `Damage` and no `Missing` member, so a damage charge
  -- cannot become an invoice line at all. That is MONEY-08; widening the enum
  -- is a ruling (it decides deposit-versus-invoice precedence too) and is NOT
  -- done here.
  -- Law 3 keeps a voided booking line in its table; a voided line is not
  -- billable, so it is kept off the bill.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order,
    price_breakdown
  )
  select
    bl.client_uuid,
    v_invoice_id,
    (case bl.line_type
       when 'Equipment'   then 'Equipment Rental'
       when 'Bundle'      then 'Equipment Rental'
       when 'Accessory'   then 'Equipment Rental'
       when 'Manual item' then 'Equipment Rental'
       when 'Service'     then 'Services'
       when 'Sub-rental'  then 'Sub-Rental'
     end)::line_kind,
    -- `booking_lines.description` is nullable and `invoice_lines.description`
    -- is NOT NULL. The line type is the honest fallback: it says what the
    -- charge is for without inventing a product name nobody typed.
    coalesce(nullif(btrim(bl.description), ''), bl.line_type::text),
    greatest(1, bl.qty),
    greatest(1, bl.days),
    bl.rate,
    coalesce(bl.line_total, greatest(0, greatest(1, bl.qty) * greatest(1, bl.days) * bl.rate - coalesce(bl.discount_amount, 0))),
    0,
    coalesce(bl.sort_order, 0),
    bl.price_breakdown
  from booking_lines bl
  where bl.booking_id = v_booking_id
    and bl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (2) Crew, from `booking_crew_lines` — a different table, which is why it
  -- was billed to nobody until 4 Sep. Overtime, accommodation and meals are
  -- per-engagement totals, not per day; folding them into the unit rate keeps
  -- quantity × days × rate equal to the crew member's true cost, which is the
  -- arithmetic the recalc trigger applies to every line without exception.
  --
  -- `line_total` is computed EXACTLY (day_rate × days + extras) rather than
  -- from the divided unit rate, and that distinction earns its keep:
  -- `unit_rate` is `numeric(14,2)`, so a gaffer at 8000 × 3 days plus 4000 of
  -- extras stores a unit rate of 9333.33 whose product with days is 27,999.99
  -- — a rupee short of the 28,000 owed. `line_total` is what
  -- `recalculate_invoice_totals` sums, so the bill is exact and only the
  -- displayed per-day rate carries the rounding. Verified against the same
  -- reference figures the TypeScript suite used to pin (28,000 / 18,000 /
  -- 4,200), so this snapshot bills what its predecessor billed.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    cl.client_uuid,
    v_invoice_id,
    'Crew Charges'::line_kind,
    coalesce(
      nullif(btrim(concat_ws(' - ', nullif(btrim(cl.name), ''), cl.crew_role::text)), ''),
      'Crew'
    ),
    1,
    greatest(1, cl.days),
    cl.day_rate
      + (coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0))
        / greatest(1, cl.days),
    cl.day_rate * greatest(1, cl.days)
      + coalesce(cl.overtime, 0) + coalesce(cl.accommodation, 0) + coalesce(cl.meals, 0),
    0,
    1000 + (row_number() over (order by cl.created_at, cl.id))::integer - 1
  from booking_crew_lines cl
  where cl.booking_id = v_booking_id
    and cl.voided_at is null;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- (3) Transport, from `booking_transport`. A row carrying no charge is a
  -- logistics record, not a bill line, so it is skipped rather than billed at
  -- zero. `booking_transport` has no `voided_at` column — there is nothing to
  -- exclude on.
  insert into invoice_lines (
    client_uuid, invoice_id, line_kind, description,
    quantity, days, unit_rate, line_total, discount_percent, sort_order
  )
  select
    bt.client_uuid,
    v_invoice_id,
    'Transport'::line_kind,
    case
      when nullif(btrim(coalesce(bt.vehicle, '')), '') is not null
        then 'Transport - ' || btrim(bt.vehicle)
      else 'Transport'
    end,
    1,
    1,
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0),
    0,
    2000 + (row_number() over (order by bt.created_at, bt.id))::integer - 1
  from booking_transport bt
  where bt.booking_id = v_booking_id
    and coalesce(bt.delivery_charge, 0) + coalesce(bt.fuel_charge, 0) > 0;
  get diagnostics v_written = row_count;
  v_line_count := v_line_count + v_written;

  -- ── The totals, as POSTGRES computed them ─────────────────────────────────
  -- Re-read, never derived here. A caller rendering its own figure is showing
  -- an estimate; this is the row.
  select * into v_totals from invoices where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id',      v_totals.id,
    -- R-15 — stated rather than omitted, so a caller cannot mistake a missing
    -- field for a number it failed to read.
    'invoice_no',      v_totals.invoice_no,
    'status',          v_totals.status,
    'booking_id',      v_booking_id,
    'booking_no',      v_resolved_no,
    'client_id',       v_client_id,
    'due_date',        v_totals.due_date,
    'line_count',      v_line_count,
    'subtotal',        v_totals.subtotal,
    'discount_amount', v_totals.discount_amount,
    'taxable_amount',  v_totals.taxable_amount,
    'vat_amount',      v_totals.vat_amount,
    'total',           v_totals.total_amount,
    'replayed',        false
  );
end;
$function$;
-- ---------------------------------------------------------------------------
-- Post-conditions (fail the migration, not the data).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from booking_lines where line_total is null) then
    raise exception 'POST-CONDITION FAILED: booking_lines.line_total backfill incomplete.';
  end if;
  if exists (select 1 from booking_lines where price_breakdown is not null and jsonb_typeof(price_breakdown) <> 'object') then
    raise exception 'POST-CONDITION FAILED: booking_lines.price_breakdown holds a non-object.';
  end if;
  if has_column_privilege('authenticated', 'public.booking_lines', 'line_total', 'SELECT') then
    raise exception 'POST-CONDITION FAILED: booking_lines.line_total is directly selectable (Law 6).';
  end if;
  if not has_column_privilege('authenticated', 'public.booking_lines_v', 'line_total', 'SELECT') then
    raise exception 'POST-CONDITION FAILED: booking_lines_v.line_total is not selectable.';
  end if;
end $$;

commit;

-- Record 0168_booking_line_totals_and_breakdown in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030010', '0168_booking_line_totals_and_breakdown')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0168_booking_line_totals_and_breakdown.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0169_pin_intel_and_guard_search_paths.sql
-- SHA-256: 4996d8ffd028c7259e7a07112a79da5ad78e011436fb21b9cac170fbdcca85a0
-- Version: 20261122030011
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Pin application-owned invoker helpers and guard triggers found by the live
-- read-only audit. No role, data, grants, function bodies or extension objects change.
-- N-5: write and verify locally only; Babin applies after backup/staging review.
begin;

alter function public.booking_intel_note_archive_only() set search_path to public, pg_temp;
alter function public.intel_entity_note_archive_only() set search_path to public, pg_temp;
alter function public.intel_field_allowed(text) set search_path to public, pg_temp;
alter function public.intel_field_definition_archive_only() set search_path to public, pg_temp;
alter function public.reject_delete_nothing_is_deleted() set search_path to public, pg_temp;
alter function public.reject_direct_booking_stage_write() set search_path to public, pg_temp;
alter function public.reject_money_column_write_by_money_blind_role() set search_path to public, pg_temp;
alter function public.reject_update_append_only() set search_path to public, pg_temp;
alter function public.reject_update_daily_closing() set search_path to public, pg_temp;
alter function public.reject_update_released_unit() set search_path to public, pg_temp;
alter function public.reject_users_delete() set search_path to public, pg_temp;
alter function record_editor_private.fields(text) set search_path to public, pg_temp;
alter function record_editor_private.pick(jsonb, text[]) set search_path to public, pg_temp;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public'
      and p.proname in (
        'booking_intel_note_archive_only', 'intel_entity_note_archive_only',
        'intel_field_allowed', 'intel_field_definition_archive_only',
        'reject_delete_nothing_is_deleted', 'reject_direct_booking_stage_write',
        'reject_money_column_write_by_money_blind_role', 'reject_update_append_only',
        'reject_update_daily_closing', 'reject_update_released_unit', 'reject_users_delete'
      )) or (n.nspname = 'record_editor_private' and p.proname in ('fields', 'pick')))
      and not ('search_path=public, pg_temp' = any(coalesce(p.proconfig, array[]::text[])))
  ) then raise exception 'Application guard search-path pinning failed'; end if;
end $$;

commit;

-- Record 0169_pin_intel_and_guard_search_paths in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030011', '0169_pin_intel_and_guard_search_paths')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0169_pin_intel_and_guard_search_paths.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0170_astra_phase0_authorization.sql
-- SHA-256: 7479ccfb022fd9b2bcbd6e61c36a1ba272aee6e1bb886232098277925335e29d
-- Version: 20261122030012
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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
create or replace function public.bind_direct_audit_actor() returns trigger
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
create or replace function public.guard_admin_superior_target() returns trigger
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
create or replace function public.auth_driver_has_open_booking(p_booking uuid) returns boolean
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
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  (auth_is_staff() and auth_user_role() <> 'Driver')
  or (auth_user_role() = 'Client' and id = auth_client_id())
);
drop policy bookings_select on public.bookings;
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select to authenticated using (
  (auth_is_staff() and auth_user_role() <> 'Driver')
  or (auth_user_role() = 'Client' and client_id = auth_client_id())
  or auth_driver_has_open_booking(id)
);
drop policy booking_lines_select on public.booking_lines;
drop policy if exists booking_lines_select on public.booking_lines;
create policy booking_lines_select on public.booking_lines for select to authenticated using (
  (auth_is_staff() and auth_user_role() <> 'Driver')
  or auth_driver_has_open_booking(booking_id)
  or (auth_user_role() = 'Client' and exists (
    select 1 from public.bookings b where b.id = booking_id and b.client_id = auth_client_id()
  ))
);

-- Driver contact details belong inside a trip, not the client-directory row
-- (which also contains identity/tax/billing fields). Provide a narrow DTO.
create or replace function public.driver_trip_context(p_booking uuid) returns jsonb
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

create or replace function public.document_file_location(p_document uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare location text;
begin
  if auth_can_view_money() is not true or not exists (
    select 1 from public.users u where u.id = auth_user_id()
      and u.is_active and u.deactivated_at is null
  ) then
    raise exception 'Original document access requires monetary authorization' using errcode = '42501';
  end if;
  select d.file_url into location from public.document_registry d where d.id = p_document;
  return location;
end $$;
revoke all on function public.document_file_location(uuid) from public, anon;
grant execute on function public.document_file_location(uuid) to authenticated;

-- Document upload ownership is encoded before metadata registration. Shared
-- financial-staff reads require a registry/invoice link; orphan paths fail closed.
create or replace function public.auth_storage_object_allowed(p_bucket text, p_name text, p_upload boolean)
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
    if not coalesce(v_active,false) or v_role not in ('Owner','Admin','Manager','Coordinator','Accounts') then
      return false;
    end if;
    return exists (
      select 1 from document_registry d where
        (d.file_url = p_name or split_part(split_part(d.file_url,'/object/sign/documents/',2),'?',1) = p_name)
        -- P4 / N-1: ownership alone cannot authorize an unredacted PDF for a
        -- money-blind role, including Client. Redacted artifacts need their own
        -- verified publication path before any such access can be allowed.
    ) or exists (
      select 1 from public.invoices i where i.pdf_url = p_name
        or split_part(split_part(i.pdf_url,'/object/sign/documents/',2),'?',1) = p_name
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
drop policy if exists documents_evidence_select_policy on storage.objects;
create policy documents_evidence_select_policy on storage.objects for select to authenticated
using (bucket_id in ('documents','evidence') and public.auth_storage_object_allowed(bucket_id,name,false));
drop policy if exists documents_evidence_insert_policy on storage.objects;
create policy documents_evidence_insert_policy on storage.objects for insert to authenticated
with check (bucket_id in ('documents','evidence') and public.auth_storage_object_allowed(bucket_id,name,true));
-- Restrictive policies prevent a permissive legacy policy from reopening either bucket.
drop policy if exists astra_storage_read_boundary on storage.objects;
create policy astra_storage_read_boundary on storage.objects as restrictive for select to authenticated
using (bucket_id not in ('documents','evidence') or public.auth_storage_object_allowed(bucket_id,name,false));
drop policy if exists astra_storage_insert_boundary on storage.objects;
create policy astra_storage_insert_boundary on storage.objects as restrictive for insert to authenticated
with check (bucket_id not in ('documents','evidence') or public.auth_storage_object_allowed(bucket_id,name,true));
drop policy if exists astra_storage_immutable_update on storage.objects;
create policy astra_storage_immutable_update on storage.objects as restrictive for update to authenticated
using (bucket_id not in ('documents','evidence')) with check (bucket_id not in ('documents','evidence'));
drop policy if exists astra_storage_immutable_delete on storage.objects;
create policy astra_storage_immutable_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id not in ('documents','evidence'));

-- Public buckets bypass object SELECT policies for downloads. Keep business
-- buckets private as well as denying anonymous access through permissive policies.
drop policy if exists astra_storage_anon_boundary on storage.objects;
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

-- Record 0170_astra_phase0_authorization in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030012', '0170_astra_phase0_authorization')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0170_astra_phase0_authorization.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0171_operations_branch_grants.sql
-- SHA-256: 92a1d889e064c94904bf9d9b7ac19de96ad4dba9a142d42ed62ef8d1820698a7
-- Version: 20261122030013
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- RULING 2026-10-23 (P0-B, second half): a grant is meaningless without a site.
-- =============================================================================
-- Migration 0171: operations branch grants — per-operation, per-branch scoping
-- for the four floor verbs (pack / handover / return / reset).
--
-- OPEN_DECISIONS 20 Oct 2026 held this as "Still open (the other half of P0-B):
-- location scoping — a grant is meaningless without a site."
--
-- DESIGN (three decisions, all logged in RULINGS-2026-10-23.md):
--
-- 1. NARROWING-ONLY. An empty table changes nothing: a staff member with NO
--    grant rows — active or revoked — keeps today's role-based permission at
--    every branch (rbac.ts's matrix, unchanged). Grant rows can only REMOVE
--    branches, never add roles (B-1: stricter wins). This makes the migration
--    deploy-safe: Babin applies it and the floor keeps working; scoping is
--    opted into per user by issuing grants.
--
-- 2. REVOKE MEANS SCOPED-TO-NOTHING, NOT BACK-TO-GLOBAL. The helper is
--    three-state: pristine (no rows) = legacy global; any history (active or
--    revoked rows for this user+operation) = scoped, and then only an ACTIVE
--    grant for THIS branch passes. Without this, revoking someone's last grant
--    would silently re-widen them to every branch — the opposite of what the
--    admin meant. Re-issue after revoke re-grants (the partial unique index
--    covers active rows only). Law 3: revoke is a state (revoked_at/revoked_by),
--    never a delete.
--
-- 3. THE BOOKING'S branch_id (0002:25, not null) is the site of the work, and
--    the actor is auth_user_id() — the same identity every other auth_* helper
--    resolves. Gates live in TWO places, fail-closed where custody moves:
--      - apply_booking_stage_transition() gates pack/handover/return — the
--        stage cannot move cross-branch even if the application forgot to ask;
--      - assert_operation_branch_grant() is the early, truthful refusal the
--        action layer calls (floorVerb step 1b) — and the ONLY branch gate for
--        Reset, which changes no stage (completeReset.ts) and has no session
--        (0003:855).
--    Reset therefore depends on the action-layer assert; that trust level is
--    the same as today's client-side role checks and is stated here rather
--    than hidden.
--
-- The grants table carries its own immutable actor record (granted_by/at,
-- revoked_by/at); audit_events is not written by the issue/revoke RPCs because
-- its action column is an enum (0155's CloseOverride lesson) and grant changes
-- are already fully attributed here. Revert = drop table + functions + restore
-- the 0155 body of apply_booking_stage_transition (the three gate blocks are
-- the only edit).
-- =============================================================================

begin;

-- ── 1. The table ──────────────────────────────────────────────────────────

create table if not exists operations_grants (
  id          uuid        not null default gen_random_uuid() primary key,
  client_uuid uuid        not null unique,               -- Law 8: retry returns the same row
  user_id     uuid        not null references users (id),
  branch_id   uuid        not null references branches (id),
  operation   text        not null,
  granted_by  uuid        not null references users (id),
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid        references users (id),

  constraint operations_grants_operation_check
    check (operation in ('pack', 'handover', 'return', 'reset'))
);

comment on table operations_grants is
  'P0-B second half (0171): per-operation, per-branch grants. NARROWING-ONLY — a user with no rows '
  'keeps the role-based global permission; any row history scopes them, and then only an ACTIVE grant '
  'for the booking''s branch passes. Revoke is a state, never a delete (Law 3). The booking''s '
  'branch_id is the site; the actor is auth_user_id().';

comment on column operations_grants.operation is
  'The floor verb slug: pack | handover | return | reset — matching operations.pack|handover|return|reset '
  'in actions/core.ts and the JOBS keys in floorVerb.ts.';

create unique index if not exists operations_grants_active_unique
  on operations_grants (user_id, branch_id, operation)
  where revoked_at is null;

create index if not exists operations_grants_user_operation_idx
  on operations_grants (user_id, operation);

revoke all on operations_grants from public, anon;
grant select on operations_grants to authenticated;
/* Defense in depth: the prelude's default privileges hand authenticated ALL on
   new tables, and RLS's no-write-policy default is the only barrier. Revoke the
   write privileges outright — a future RLS loosening must not silently expose
   direct writes beside the RPCs. */
revoke insert, update, delete on operations_grants from authenticated;

alter table operations_grants enable row level security;

drop policy if exists operations_grants_read on operations_grants;
create policy operations_grants_read on operations_grants
  for select to authenticated
  using (
    user_id = auth_user_id()
    or auth_user_role() in ('Owner', 'Admin', 'Manager')
  );

-- ── 2. The authority: may this actor run this operation at this branch? ────

create or replace function auth_may_perform_operation(p_operation text, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_operation in ('pack', 'handover', 'return', 'reset')
    and auth_user_id() is not null
    and (
      -- Pristine: no grant rows at all (active or revoked) = legacy global permission.
      not exists (
        select 1 from operations_grants g
        where g.user_id = auth_user_id()
          and g.operation = p_operation
      )
      -- Scoped: an ACTIVE grant for exactly this branch.
      or exists (
        select 1 from operations_grants g
        where g.user_id = auth_user_id()
          and g.operation = p_operation
          and g.revoked_at is null
          and g.branch_id = p_branch_id
      )
    )
$$;

comment on function auth_may_perform_operation is
  'P0-B location scoping (0171). Three-state, narrowing-only: pristine users (no rows) pass everywhere; '
  'users with any grant history pass ONLY on branches holding an active grant. Revoking the last grant '
  'therefore scopes a user to nothing — it must never re-widen them. Unknown operations and missing '
  'actor identity are denials.';

revoke all on function auth_may_perform_operation(text, uuid) from public;
grant execute on function auth_may_perform_operation(text, uuid) to authenticated, service_role;

-- ── 3. The action-layer assert (Reset's only branch gate) ─────────────────

create or replace function assert_operation_branch_grant(p_operation text, p_booking_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch_id uuid;
begin
  select b.branch_id into v_branch_id
  from bookings b
  where b.id = p_booking_id;

  if v_branch_id is null then
    raise exception 'GATE:operations.grant|That booking does not exist.' using errcode = 'P0001';
  end if;

  if not auth_may_perform_operation(p_operation, v_branch_id) then
    raise exception 'GATE:operations.grant|This staff member''s % grant does not cover the branch of that booking.', p_operation
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function assert_operation_branch_grant is
  'Action-layer branch-grant refusal (0171). floorVerb calls it for all four verbs before any write — '
  'for pack/handover/return it is early feedback ahead of the fail-closed trigger gate; for Reset, which '
  'changes no stage and has no session, it is the only branch gate.';

revoke all on function assert_operation_branch_grant(text, uuid) from public;
grant execute on function assert_operation_branch_grant(text, uuid) to authenticated, service_role;

-- ── 4. Issue / revoke (Owner · Admin only — B-1 stricter; Babin may widen) ──

create or replace function issue_operations_grant(
  p_client_uuid uuid,
  p_user_id uuid,
  p_branch_id uuid,
  p_operation text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_target_role text;
begin
  if auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'GATE:operations.grant.issue_role|Only Owner or Admin can issue an operations grant.' using errcode = 'P0001';
  end if;

  -- RULING 2026-10-24: integrate the guarded pair. Admin cannot restrict
  -- Owner/Admin, including self. Hold the target role stable until commit.
  if auth_user_role() = 'Admin' then
    select u.primary_role::text into v_target_role
    from users u where u.id = p_user_id
    for share of u;
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'Admin cannot modify Owner or Admin operation grants' using errcode = '42501';
    end if;
  end if;

  if p_operation not in ('pack', 'handover', 'return', 'reset') then
    raise exception 'GATE:operations.grant.bad_operation|Unknown operation %.', p_operation using errcode = 'P0001';
  end if;

  -- Law 8: the same receipt key returns the same row, on retry.
  select id into v_id from operations_grants where client_uuid = p_client_uuid;
  if v_id is not null then return v_id; end if;

  -- Re-issuing an identical active grant is the same grant.
  select id into v_id from operations_grants
  where user_id = p_user_id
    and branch_id = p_branch_id
    and operation = p_operation
    and revoked_at is null;
  if v_id is not null then return v_id; end if;

  insert into operations_grants (client_uuid, user_id, branch_id, operation, granted_by)
  values (p_client_uuid, p_user_id, p_branch_id, p_operation, auth_user_id())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function issue_operations_grant is
  'Issue one per-operation, per-branch grant (0171). Owner/Admin only. Idempotent by client_uuid and by '
  'identical active cell. The first grant ever issued to a user for an operation SCOPES them — every '
  'branch without an active grant is refused from that moment.';

revoke all on function issue_operations_grant(uuid, uuid, uuid, text) from public;
grant execute on function issue_operations_grant(uuid, uuid, uuid, text) to authenticated, service_role;

create or replace function revoke_operations_grant(
  p_client_uuid uuid,
  p_grant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_role text;
begin
  if auth_user_role() not in ('Owner', 'Admin') then
    raise exception 'GATE:operations.grant.revoke_role|Only Owner or Admin can revoke an operations grant.' using errcode = 'P0001';
  end if;

  -- Same superior/self-target boundary on revocation, before any write.
  if auth_user_role() = 'Admin' then
    select u.primary_role::text into v_target_role
    from operations_grants g join users u on u.id = g.user_id
    where g.id = p_grant_id
    for share of u;
    if v_target_role in ('Owner', 'Admin') then
      raise exception 'Admin cannot modify Owner or Admin operation grants' using errcode = '42501';
    end if;
  end if;

  update operations_grants
  set revoked_at = now(),
      revoked_by = auth_user_id()
  where id = p_grant_id
    and revoked_at is null;

  if not found then
    -- Idempotent for an already-revoked grant; a receipt against an unknown id is refused.
    if not exists (select 1 from operations_grants where id = p_grant_id) then
      raise exception 'GATE:operations.grant.not_found|No operations grant with that id exists.' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

comment on function revoke_operations_grant is
  'Revoke one grant (0171). Idempotent for already-revoked rows. Revoking a user''s last ACTIVE grant for '
  'an operation scopes them to NOTHING for that operation — the three-state helper guarantees it never '
  're-widens them to the global default.';

revoke all on function revoke_operations_grant(uuid, uuid) from public;
grant execute on function revoke_operations_grant(uuid, uuid) to authenticated, service_role;

-- ── 5. The fail-closed gate where custody moves ────────────────────────────
-- apply_booking_stage_transition, re-created from 0155 with exactly four
-- edits: the declare adds v_branch_id; the opening select reads branch_id;
-- the three operational blocks each open with the branch-grant check; the
-- comment is extended. Nothing else in the body is touched.

create or replace function apply_booking_stage_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_stage       booking_stage;
  v_closed_at           timestamptz;
  v_prev_occurred_at    timestamptz;
  v_deposit_required    numeric(14,2) := 0;
  v_deposit_pending     numeric(14,2) := 0;
  v_rental_outstanding  numeric(14,2) := 0;
  v_reason              text;
  v_pack_session_id     uuid;
  v_handover_session_id uuid;
  v_return_session_id   uuid;
  v_has_physical_lines  boolean := false;
  v_branch_id           uuid;
begin
  select stage, closed_at, coalesce(deposit_required, 0), branch_id
    into v_current_stage, v_closed_at, v_deposit_required, v_branch_id
  from bookings
  where id = NEW.booking_id
  for update;

  if not found then
    raise exception 'Stage transition rejected: booking % does not exist.', NEW.booking_id;
  end if;

  -- Check if booking has any physical equipment lines
  select exists (
    select 1
    from booking_lines bl
    where bl.booking_id = NEW.booking_id
      and bl.voided_at is null
      and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
  ) into v_has_physical_lines;

  -- ── Genesis ──
  if NEW.from_stage is null then
    if v_current_stage <> 'Quote' then
      raise exception 'Genesis transition rejected: booking % is not at Quote (currently %).', NEW.booking_id, v_current_stage;
    end if;
    if NEW.to_stage <> 'Quote' then
      raise exception 'Genesis transition must target Quote, got %.', NEW.to_stage;
    end if;
  else
    if NEW.from_stage <> v_current_stage then
      raise exception 'Stage transition rejected: from_stage (%) does not match booking %''s actual current stage (%). Stale read or concurrent write.',
        NEW.from_stage, NEW.booking_id, v_current_stage;
    end if;

    -- ── Closed reopen or immutability ──
    if v_current_stage = 'Closed' then
      if NEW.to_stage = 'Returned' then
        -- R-05 Reopen gate
        if not (auth_is_manager_or_above() or coalesce(NEW.actor_role, '') in ('Owner', 'Admin', 'Manager')) then
          raise exception 'GATE:gate.reopen.role|Only Manager or above can reopen a closed booking.' using errcode = 'P0001';
        end if;
        if NEW.reason is null or length(btrim(NEW.reason)) < 10 then
          raise exception 'GATE:gate.reopen.reason_missing|Reopening a closed booking requires a reason of at least 10 characters.' using errcode = 'P0001';
        end if;
      else
        raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
      end if;
    elsif v_closed_at is not null then
      raise exception 'Gate Check Failure: booking % is Closed; no further stage transition is accepted.', NEW.booking_id;
    else
      -- ── Normal forward or reversal transition ──
      if NEW.is_reversal then
        if NEW.to_stage >= NEW.from_stage then
          raise exception 'Reversal rejected: to_stage (%) does not precede from_stage (%).', NEW.to_stage, NEW.from_stage;
        end if;
      else
        if NEW.to_stage <> next_booking_stage(NEW.from_stage) then
          raise exception 'Stage transition rejected: % does not immediately follow % -- skipping a stage is only legal as an approved reversal.',
            NEW.to_stage, NEW.from_stage;
        end if;
      end if;
    end if;
  end if;

  select max(occurred_at) into v_prev_occurred_at
  from booking_stage_transitions
  where booking_id = NEW.booking_id
    and id <> NEW.id;

  if v_prev_occurred_at is not null and NEW.occurred_at < v_prev_occurred_at then
    raise exception 'Stage transition rejected: occurred_at (%) precedes booking %''s previous transition (%).',
      NEW.occurred_at, NEW.booking_id, v_prev_occurred_at;
  end if;

  -- ── STAGE GATES ENFORCEMENT ──

  -- 1. Quote -> Booked
  if NEW.to_stage = 'Booked' and (NEW.from_stage is null or NEW.from_stage = 'Quote') then
    if exists (
      select 1 from bookings b
      join client_flags cf on cf.client_id = b.client_id
      where b.id = NEW.booking_id
        and cf.flag_type = 'Blocked'
        and cf.removed_at is null
    ) then
      raise exception 'GATE:gate.booking.client_blocked|Client is blocked from making bookings.' using errcode = 'P0001';
    end if;

    if not exists (
      select 1 from booking_lines
      where booking_id = NEW.booking_id
        and voided_at is null
    ) then
      raise exception 'GATE:gate.booking.no_lines|Booking must have at least one line.' using errcode = 'P0001';
    end if;
  end if;

  -- 2. Booked -> Packed
  if NEW.to_stage = 'Packed' and NEW.from_stage = 'Booked' then
    -- P0-B location scoping (0171): custody cannot move to a branch the actor
    -- is not granted for, whatever the application asked for.
    if not auth_may_perform_operation('pack', v_branch_id) then
      raise exception 'GATE:operations.grant|This staff member''s pack grant does not cover the branch of booking %.', NEW.booking_id using errcode = 'P0001';
    end if;

    if v_has_physical_lines then
      select id into v_pack_session_id
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Packing'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_pack_session_id is null then
        raise exception 'GATE:gate.pack.session_missing|Booking requires an active or completed packing session.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        join products p on p.id = bl.product_id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and p.tracking_mode = 'Serialised'
          and (
            select count(*)
            from booking_line_units blu
            where blu.booking_line_id = bl.id
              and blu.asset_id is not null
          ) <> bl.qty
      ) then
        raise exception 'GATE:gate.pack.units_unassigned|Every serialised line must have all units assigned.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        join booking_line_units blu on blu.booking_line_id = bl.id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and blu.asset_id is not null
          and not exists (
            select 1
            from session_line_movements slm
            where slm.session_id = v_pack_session_id
              and slm.unit_id = blu.asset_id
          )
      ) then
        raise exception 'GATE:gate.pack.units_unpacked|Every unit must have a movement in the packing session.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 3. Packed -> On Rent
  if NEW.to_stage = 'On Rent' and NEW.from_stage = 'Packed' then
    -- P0-B location scoping (0171)
    if not auth_may_perform_operation('handover', v_branch_id) then
      raise exception 'GATE:operations.grant|This staff member''s handover grant does not cover the branch of booking %.', NEW.booking_id using errcode = 'P0001';
    end if;

    if v_has_physical_lines then
      select id into v_handover_session_id
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Handover'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_handover_session_id is null then
        raise exception 'GATE:gate.handover.session_missing|Booking requires an active or completed handover session.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
          and not exists (
            select 1
            from handover_lines hl
            where hl.booking_line_id = bl.id
          )
      ) then
        raise exception 'GATE:gate.handover.units_unhanded|Every booking line must have a handover line recorded.' using errcode = 'P0001';
      end if;

      if not exists (
        select 1
        from signatures s
        where s.session_id = v_handover_session_id
      ) then
        raise exception 'GATE:gate.handover.agreement_unsigned|Rental agreement must be signed before handover.' using errcode = 'P0001';
      end if;
    end if;

    -- R-06 WARN on money (Enforced for ALL bookings, physical and service-only)
    select coalesce(pending_amount, 0) into v_deposit_pending
    from security_deposits
    where booking_id = NEW.booking_id;

    select coalesce(sum(outstanding_amount), 0) into v_rental_outstanding
    from invoices
    where booking_id = NEW.booking_id and status not in ('Void');

    v_deposit_pending    := coalesce(v_deposit_pending, 0);
    v_rental_outstanding := coalesce(v_rental_outstanding, 0);

    if v_deposit_pending > 0 or v_rental_outstanding > 0 then
      v_reason := nullif(btrim(coalesce(NEW.reason, current_setting('app.stage_override_reason', true), '')), '');

      if v_reason is null then
        raise exception
          'Gate Check Failure: handover of this booking carries an outstanding rental balance of Rs. % and a pending deposit of Rs. %. R-06 allows it to proceed with a named override reason, which is recorded against the person who gave it. Supply booking_stage_transitions.reason and try again.',
          v_rental_outstanding, v_deposit_pending;
      end if;

      insert into audit_events (
        client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
      )
      values (
        gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, v_reason,
        jsonb_build_object(
          'gate',                 'handover_money',
          'ruling',               'R-06',
          'rental_outstanding',   v_rental_outstanding,
          'deposit_pending',      v_deposit_pending,
          'from_stage',           NEW.from_stage,
          'to_stage',             NEW.to_stage
        )
      );
    end if;
  end if;

  -- 4. On Rent -> Returned
  if NEW.to_stage = 'Returned' and NEW.from_stage = 'On Rent' then
    -- P0-B location scoping (0171)
    if not auth_may_perform_operation('return', v_branch_id) then
      raise exception 'GATE:operations.grant|This staff member''s return grant does not cover the branch of booking %.', NEW.booking_id using errcode = 'P0001';
    end if;

    if v_has_physical_lines then
      select id into v_return_session_id
      from operation_sessions
      where booking_id = NEW.booking_id
        and operation = 'Return'
        and state in ('In Progress', 'Completed')
      order by created_at desc
      limit 1;

      if v_return_session_id is null then
        raise exception 'GATE:gate.return.session_missing|Booking requires an active or completed return session.' using errcode = 'P0001';
      end if;

      if exists (
        select 1
        from booking_lines bl
        left join products p on p.id = bl.product_id
        where bl.booking_id = NEW.booking_id
          and bl.voided_at is null
          and bl.line_type not in ('Service', 'Sub-rental', 'Manual item')
          and coalesce(p.tracking_mode, 'Serialised') <> 'Consumable'
          and not exists (
            select 1
            from return_lines rl
            where rl.booking_line_id = bl.id
          )
      ) then
        raise exception 'GATE:gate.return.units_unaccounted|Every physical booking line must have a return line recorded.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- 5. Returned -> Closed (S1-2 Close Gate, extended 0131, 0135, 0141, 0149, 0155)
  if NEW.to_stage = 'Closed' and NEW.from_stage = 'Returned' then
    -- (a) At least one non-void invoice OR Owner/Admin Zero-Value Override (§4.51)
    if not exists (
      select 1 from invoices
      where booking_id = NEW.booking_id and status not in ('Void')
    ) then
      if (
        (auth_user_role() in ('Owner', 'Admin') or coalesce(NEW.actor_role, '') in ('Owner', 'Admin'))
        and NEW.reason is not null
        and length(btrim(NEW.reason)) >= 10
      ) then
        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, btrim(NEW.reason),
          jsonb_build_object(
            'gate', 'close_no_invoice',
            'ruling', '§4.51',
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.no_invoice|Cannot close booking with no invoice.' using errcode = 'P0001';
      end if;
    end if;

    -- (b) All non-void invoices settled
    if exists (
      select 1 from invoices
      where booking_id = NEW.booking_id
        and status not in ('Void')
        and outstanding_amount > 0
    ) then
      raise exception 'GATE:gate.close.invoice_unsettled|Cannot close booking with unsettled invoices.' using errcode = 'P0001';
    end if;

    -- (c) Deposit resolved, or skipped with a named reason (0155, RULING 2026-10-06).
    -- A skip is Manager-or-above and needs a reason of at least 10 characters. It
    -- records the amounts still held in the audit log and moves NO money: the
    -- deposit stays a liability on security_deposits (Law 5).
    if (v_deposit_required > 0 and not exists (select 1 from security_deposits where booking_id = NEW.booking_id))
       or exists (
        select 1 from security_deposits
        where booking_id = NEW.booking_id
          and (pending_amount > 0 or (received_amount - refunded_amount - applied_amount) > 0)
      ) then
      if NEW.deposit_skip_reason is not null and length(btrim(NEW.deposit_skip_reason)) >= 10 then
        if not (auth_is_manager_or_above() or coalesce(NEW.actor_role, '') in ('Owner', 'Admin', 'Manager')) then
          raise exception 'GATE:gate.close.deposit_skip_role|Only Manager or above can close a rental without settling its deposit.' using errcode = 'P0001';
        end if;

        insert into audit_events (
          client_uuid, table_name, record_id, action, actor_id, branch_id, reason, new_values
        )
        values (
          gen_random_uuid(), 'bookings', NEW.booking_id, 'Approve', NEW.actor_id, NEW.branch_id, btrim(NEW.deposit_skip_reason),
          jsonb_build_object(
            'gate', 'close_deposit_skipped',
            'ruling', '2026-10-06',
            'deposit_required', v_deposit_required,
            'deposit_held', (
              select coalesce(sum(received_amount - refunded_amount - applied_amount), 0)
              from security_deposits where booking_id = NEW.booking_id
            ),
            'deposit_pending', (
              select coalesce(sum(pending_amount), 0)
              from security_deposits where booking_id = NEW.booking_id
            ),
            'from_stage', NEW.from_stage,
            'to_stage', NEW.to_stage
          )
        );
      else
        raise exception 'GATE:gate.close.deposit_unresolved|Cannot close booking with unresolved security deposit.' using errcode = 'P0001';
      end if;
    end if;

    -- (d) No open cases
    if exists (
      select 1
      from cases
      where linked_booking_id = NEW.booking_id
        and status not in ('Resolved', 'Closed', 'Cancelled')
    ) then
      raise exception 'GATE:gate.close.open_case|Cannot close booking with open cases.' using errcode = 'P0001';
    end if;

    -- (e) No live reservations
    if exists (
      select 1
      from inventory_reservations
      where booking_id = NEW.booking_id
        and released_at is null
    ) then
      raise exception 'GATE:gate.close.reservation_live|Cannot close booking with live reservations.' using errcode = 'P0001';
    end if;

    -- (f) No damage finding awaiting approval (RL-06)
    if exists (
      select 1
      from damage_findings df
      left join return_lines rl on rl.id = df.return_line_id
      left join booking_lines bl on bl.id = rl.booking_line_id
      left join cleaning_queue_entries cqe on cqe.id = df.cleaning_queue_entry_id
      where df.approval_state = 'Pending Approval'
        and df.voided_at is null
        and (bl.booking_id = NEW.booking_id or cqe.booking_id = NEW.booking_id)
    ) then
      raise exception 'GATE:gate.close.damage_pending|Cannot close booking with damage findings still pending approval.' using errcode = 'P0001';
    end if;
  end if;

  -- Publish GUCs for downstream triggers if needed
  perform set_config('app.stage_override_reason', coalesce(NEW.reason, ''), true);
  perform set_config('app.stage_actor_id',        coalesce(NEW.actor_id::text, ''), true);
  perform set_config('app.stage_branch_id',      coalesce(NEW.branch_id::text, ''), true);

  -- Perform the booking stage update
  update bookings
  set stage      = NEW.to_stage,
      closed_at  = case
                     when NEW.to_stage = 'Closed' then NEW.occurred_at
                     when NEW.from_stage = 'Closed' and NEW.to_stage = 'Returned' then null
                     else closed_at
                   end,
      updated_at = now(),
      updated_by = NEW.actor_id
  where id = NEW.booking_id;

  return NEW;
end;
$$;

comment on function apply_booking_stage_transition is
  'Stage 1 (0116, extended 0131, 0135, 0139, 0141, 0149, 0155): close gate — invoice exists (or Owner/Admin zero-value '
  'override), invoices settled, deposit resolved OR skipped by Manager+ with a reason >= 10 chars (audited, no money moved), '
  'no open cases, no live reservations, no damage finding pending approval. '
  '0171 adds P0-B branch grants: Booked->Packed, Packed->On Rent and On Rent->Returned each refuse unless '
  'auth_may_perform_operation passes for the booking''s branch — narrowing-only, so an empty operations_grants '
  'table leaves the role matrix exactly as it was.';

commit;

-- Record 0171_operations_branch_grants in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030013', '0171_operations_branch_grants')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0171_operations_branch_grants.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0172_reset_branch_write_boundary.sql
-- SHA-256: 03bb4638133678beb473f1d127d73df28db1f4702339e48d782679536429d849
-- Version: 20261122030014
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- RULING 2026-10-23: an unbooked Reset item follows its unit's CURRENT
-- warehouse branch (not product_units.branch_id or the actor's home branch).
-- Candidate follow-up to 0171; WRITTEN locally only, never applied remotely.
-- Existing role policies remain necessary: these RESTRICTIVE policies can
-- narrow them, never authorize another role. Both old and new scopes must pass.
begin;

create or replace function public.auth_may_reset_entry(p_booking_id uuid, p_unit_id uuid)
returns boolean
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select public.auth_user_id() is not null and coalesce((
    select scope.branch_id is not null
      and public.auth_may_perform_operation('reset', scope.branch_id)
    from (
      select b.branch_id from public.bookings b
      where p_booking_id is not null and b.id = p_booking_id
      union all
      select w.branch_id from public.product_units u
      join public.warehouses w on w.id = u.warehouse_id
      where p_booking_id is null and u.id = p_unit_id
    ) scope
  ), false);
$$;
revoke all on function public.auth_may_reset_entry(uuid, uuid) from public, anon;
grant execute on function public.auth_may_reset_entry(uuid, uuid) to authenticated, service_role;
comment on function public.auth_may_reset_entry(uuid, uuid) is
  '0172 Reset write scope: booking branch when linked; otherwise current warehouse branch. '
  'Unknown identity/site denies. Invoker lookup preserves RLS; grants only narrow existing roles.';

drop policy if exists reset_queue_insert_boundary on public.cleaning_queue_entries;
create policy reset_queue_insert_boundary on public.cleaning_queue_entries
as restrictive for insert to authenticated
with check (public.auth_may_reset_entry(booking_id, unit_id));
drop policy if exists reset_queue_update_boundary on public.cleaning_queue_entries;
create policy reset_queue_update_boundary on public.cleaning_queue_entries
as restrictive for update to authenticated
using (public.auth_may_reset_entry(booking_id, unit_id))
with check (public.auth_may_reset_entry(booking_id, unit_id));
drop policy if exists reset_queue_delete_boundary on public.cleaning_queue_entries;
create policy reset_queue_delete_boundary on public.cleaning_queue_entries
as restrictive for delete to authenticated
using (public.auth_may_reset_entry(booking_id, unit_id));

drop policy if exists reset_tasks_insert_boundary on public.cleaning_task_results;
create policy reset_tasks_insert_boundary on public.cleaning_task_results
as restrictive for insert to authenticated
with check (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
));
drop policy if exists reset_tasks_update_boundary on public.cleaning_task_results;
create policy reset_tasks_update_boundary on public.cleaning_task_results
as restrictive for update to authenticated
using (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
))
with check (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
));
drop policy if exists reset_tasks_delete_boundary on public.cleaning_task_results;
create policy reset_tasks_delete_boundary on public.cleaning_task_results
as restrictive for delete to authenticated
using (exists (
  select 1 from public.cleaning_queue_entries q
  where q.id = cleaning_queue_entry_id and public.auth_may_reset_entry(q.booking_id, q.unit_id)
));

-- Supersedes 0171's action-only Reset claim: direct queue/task writes are now
-- checked in Postgres too. The RPC remains early feedback, not the authority.
comment on function public.assert_operation_branch_grant(text, uuid) is
  'Early booking-branch assertion before floor writes. 0172 additionally enforces '
  'Reset queue/task writes through restrictive RLS (old and new scope).';

commit;

-- Record 0172_reset_branch_write_boundary in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030014', '0172_reset_branch_write_boundary')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0172_reset_branch_write_boundary.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0173_section_saves_and_unit_lifecycle.sql
-- SHA-256: ff62ef2775e44d50e29b5249a1c0e3ccf33f0c423bb96d17ba3ece2997db53ef
-- Version: 20261122030015
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Migration 0173: Unified Section Saves, Equipment Unit Lifecycle (Intake & Retirement),
-- and Client Membership Enrollment / Tier Supersession
-- =============================================================================
-- 1. save_record_section: transactional, allowlisted per-section save for clients,
--    equipment, and bundles, with optimistic concurrency (revision check), advisory locks,
--    and idempotency.
-- 2. add_equipment_units: post-creation serialized unit intake with automatic asset tag
--    generation, unique serial check, warehouse validation, and products.total_quantity sync.
-- 3. retire_equipment_unit: audited unit retirement enforcing reasons (>= 10 chars),
--    refusing retirement on active rentals/reservations/maintenance, and syncing total_quantity.
-- 4. enroll_client_membership: transactional membership enrollment and tier changes,
--    superseding previous active memberships to enforce exactly one live membership per client.
-- =============================================================================

begin;

-- Helper function: Returns allowlisted fields for a specific record section.
create or replace function record_editor_private.section_fields(p_kind text, p_section text)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
select case p_kind
  when 'client' then
    case p_section
      when 'identity' then array['type_parent', 'org_subtype', 'name', 'pan_vat', 'business_registration', 'website']
      when 'contact' then array['phone', 'email', 'website']
      when 'address' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'addresses' then array['address_line', 'city', 'district', 'postal_code', 'country', 'billing_address']
      when 'notes' then array['notes']
      when 'commercial' then array[]::text[]
      else null
    end
  when 'equipment' then
    case p_section
      when 'identity' then array['name', 'short_name', 'category_id', 'brand', 'model', 'manufacturer', 'description']
      when 'location' then array[]::text[]
      when 'stock' then array['quantity_unit', 'reorder_level']
      when 'relationships' then array[]::text[]
      when 'purchase' then array['purchase_date', 'purchase_price', 'replacement_value']
      when 'pricing' then array['daily_rate', 'weekly_rate', 'monthly_rate', 'hourly_rate', 'weekend_rate', 'deposit_percent', 'deposit_fixed', 'min_rental_days', 'rental_enabled']
      when 'maintenance' then array['prep_time_minutes', 'cleaning_time_minutes', 'inspection_required', 'packing_required', 'notes_internal', 'notes_warehouse']
      else null
    end
  when 'bundle' then
    case p_section
      when 'identity' then array['name', 'description', 'category_id', 'is_active']
      when 'rates' then array['daily_rate', 'weekly_rate']
      when 'components' then array[]::text[]
      else null
    end
  else null
end;
$$;
revoke all on function record_editor_private.section_fields(text, text) from public, anon;
grant execute on function record_editor_private.section_fields(text, text) to authenticated;

-- The existing bundle action already edits is_active; expose the same field to
-- the editor snapshot without widening the bundle.manage role boundary.
create or replace function record_editor_private.fields(kind text) returns text[] language sql immutable as $$
select case kind
when 'client' then array['type_parent','org_subtype','name','phone','email','pan_vat','business_registration','website','address_line','city','district','postal_code','country','billing_address','notes']
when 'equipment' then array['name','short_name','category_id','brand','model','manufacturer','description','reorder_level','quantity_unit','purchase_date','purchase_price','replacement_value','daily_rate','weekly_rate','monthly_rate','hourly_rate','weekend_rate','deposit_percent','deposit_fixed','min_rental_days','rental_enabled','prep_time_minutes','cleaning_time_minutes','inspection_required','packing_required','notes_internal','notes_warehouse']
when 'bundle' then array['name','description','category_id','daily_rate','weekly_rate','is_active'] end;
$$;

-- 1. save_record_section RPC
create or replace function public.save_record_section(
  p_kind text,
  p_id uuid,
  p_section text,
  p_revision text,
  p_key uuid,
  p_values jsonb,
  p_rows jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  tab text;
  allowed text[];
  child_allowed text[];
  existing jsonb;
  request jsonb;
  saved record;
  current_snapshot jsonb;
  patch jsonb;
  response jsonb;
  row_data jsonb;
  merged_rows jsonb;
  known_row jsonb;
  editor_key uuid;
begin
  -- Role authorization
  if auth.uid() is null or not coalesce(
    auth_user_role()::text = any(
      case when p_kind = 'client' then array['Owner', 'Admin', 'Manager', 'Coordinator']
      else array['Owner', 'Admin', 'Manager'] end
    ), false
  ) then
    raise exception 'Permission denied for this record.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A save key is required.'; end if;
  if p_id is null then raise exception 'Record ID is required for section saving.'; end if;
  if p_revision is null then raise exception 'Expected revision is required for section saving.'; end if;
  if jsonb_typeof(p_values) is distinct from 'object' or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Invalid section payload.';
  end if;

  request := jsonb_build_object('kind', p_kind, 'id', p_id, 'section', p_section, 'revision', p_revision, 'values', p_values, 'rows', p_rows);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into saved from record_editor_private.receipts where key = p_key;
  if found then
    if saved.actor <> auth.uid() or saved.request <> request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return saved.response;
  end if;

  allowed := record_editor_private.section_fields(p_kind, p_section);
  if allowed is null then
    raise exception 'Unknown section % for record kind %.', p_section, p_kind;
  end if;

  tab := case p_kind when 'client' then 'clients' when 'equipment' then 'products' else 'bundles' end;

  -- Validate field allowlist
  if exists (select 1 from jsonb_object_keys(p_values) k where not (k = any(allowed))) then
    raise exception 'One or more fields cannot be edited in section %.', p_section;
  end if;

  -- Lock parent record and verify optimistic concurrency revision
  execute format('select to_jsonb(t) from public.%I t where id = $1 for update', tab) into existing using p_id;
  if existing is null then raise exception 'Record not found.'; end if;

  current_snapshot := record_editor_private.read_snapshot(p_kind, p_id::text);
  if p_revision is distinct from (current_snapshot->>'revision') then
    raise exception 'This record changed since you opened it. Reload the latest record before saving. Your changes have not been saved.' using errcode = '40001';
  end if;

  -- RULING 2026-10-24: a section changes only its own allowlisted fields/rows.
  -- Reuse the existing transactional editor for location/custody validation,
  -- contact deactivation and bundle component history, retaining all other rows.
  merged_rows := current_snapshot->'rows';
  if (p_kind = 'client' and p_section = 'contact') or
     (p_kind = 'bundle' and p_section = 'components') then
    merged_rows := p_rows;
  elsif p_kind = 'equipment' and p_section = 'location' then
    child_allowed := array['id', 'warehouse_id', 'rack', 'shelf', 'bin'];
    if exists (
      select 1 from jsonb_array_elements(p_rows) row_value
      where jsonb_typeof(row_value) is distinct from 'object'
         or nullif(row_value->>'id', '') is null
    ) then raise exception 'Location changes require existing unit IDs.'; end if;
    if (select count(*) from jsonb_array_elements(p_rows)) <>
       (select count(distinct row_value->>'id') from jsonb_array_elements(p_rows) row_value) then
      raise exception 'A unit may appear only once in a location change.';
    end if;
    for row_data in select value from jsonb_array_elements(p_rows) loop
      if exists (select 1 from jsonb_object_keys(row_data) k where not (k = any(child_allowed))) then
        raise exception 'Only unit location fields may be edited in this section.';
      end if;
      select value into known_row from jsonb_array_elements(merged_rows)
        where value->>'id' = row_data->>'id';
      if known_row is null then raise exception 'This unit does not belong to the equipment record.'; end if;
      select jsonb_agg(case when value->>'id' = row_data->>'id' then value || row_data else value end order by ordinal)
        into merged_rows from jsonb_array_elements(merged_rows) with ordinality as units(value, ordinal);
    end loop;
  elsif jsonb_array_length(p_rows) <> 0 then
    raise exception 'Child rows cannot be edited in section %.', p_section;
  end if;

  -- The inner key is deterministic, so even ambiguous-response retries cannot
  -- duplicate a write. Both receipts and the section audit commit atomically.
  editor_key := md5(p_key::text || ':record-section-editor')::uuid;
  response := public.save_record_editor(p_kind, p_id, p_revision, editor_key, p_values, merged_rows);
  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', (case when p_kind = 'client' then 'Administration' else 'Inventory' end)::audit_category, (case when p_kind = 'client' then 'Clients' else 'Inventory' end)::audit_module, 'Update', 'Informational', 'Success', tab, p_id, auth.uid(), auth_user_role(), jsonb_build_object('section', p_section, 'revision', response->>'revision'));

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), request, response);
  return response;
end;
$$;
revoke all on function public.save_record_section(text, uuid, text, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_record_section(text, uuid, text, text, uuid, jsonb, jsonb) to authenticated;

-- 2. add_equipment_units RPC
create or replace function public.add_equipment_units(
  p_product_id uuid,
  p_units jsonb,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prod record;
  v_unit_data jsonb;
  v_serial text;
  v_wh uuid;
  v_branch uuid;
  v_cond unit_condition;
  v_tag text;
  v_unit_seq int;
  v_unit_id uuid;
  v_inserted_ids uuid[] := '{}';
  v_total int;
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager'), false) then
    raise exception 'Permission denied to add equipment units.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then
    raise exception 'At least one unit is required.';
  end if;

  v_request := jsonb_build_object('product_id', p_product_id, 'units', p_units);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_prod from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.'; end if;
  if v_prod.tracking_mode <> 'Serialised' then
    raise exception 'Units can only be added to Serialised products. For quantity products, use Adjust Stock.';
  end if;

  -- Current total unit count for numbering
  select count(*) into v_unit_seq from public.product_units where product_id = p_product_id;

  for v_unit_data in select value from jsonb_array_elements(p_units) loop
    v_serial := nullif(btrim(v_unit_data->>'serial_no'), '');
    v_wh := (v_unit_data->>'warehouse_id')::uuid;

    if v_wh is null then raise exception 'Warehouse is required for every unit.'; end if;
    select branch_id into v_branch from public.warehouses where id = v_wh;
    if v_branch is null then raise exception 'Invalid warehouse specified.'; end if;

    if v_serial is not null and exists (select 1 from public.product_units where serial_no = v_serial) then
      raise exception 'Serial number % is already in use by another unit.', v_serial;
    end if;

    v_unit_seq := v_unit_seq + 1;
    v_tag := coalesce(v_prod.asset_code, 'EQ') || '-' || lpad(v_unit_seq::text, 2, '0');
    v_cond := coalesce((v_unit_data->>'condition')::unit_condition, 'Good'::unit_condition);

    insert into public.product_units (
      client_uuid,
      product_id,
      serial_no,
      asset_tag,
      status,
      condition,
      branch_id,
      warehouse_id,
      rack,
      shelf,
      bin,
      purchase_date,
      created_by
    ) values (
      gen_random_uuid(),
      p_product_id,
      v_serial,
      v_tag,
      'In Stock',
      v_cond,
      v_branch,
      v_wh,
      nullif(btrim(v_unit_data->>'rack'), ''),
      nullif(btrim(v_unit_data->>'shelf'), ''),
      nullif(btrim(v_unit_data->>'bin'), ''),
      nullif(v_unit_data->>'purchase_date', '')::date,
      auth.uid()
    ) returning id into v_unit_id;

    v_inserted_ids := array_append(v_inserted_ids, v_unit_id);
  end loop;

  -- Synchronize total_quantity
  select count(*) into v_total from public.product_units where product_id = p_product_id and status <> 'Retired';
  update public.products set total_quantity = v_total, updated_at = clock_timestamp() where id = p_product_id;

  v_response := jsonb_build_object(
    'product_id', p_product_id,
    'added_count', jsonb_array_length(p_units),
    'total_quantity', v_total,
    'unit_ids', to_jsonb(v_inserted_ids)
  );

  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', 'Inventory'::audit_category, 'Inventory'::audit_module, 'Create', 'Informational', 'Success', 'product_units', p_product_id, auth.uid(), auth_user_role(), v_response);

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), v_request, v_response);
  return v_response;
end;
$$;
revoke all on function public.add_equipment_units(uuid, jsonb, uuid) from public, anon;
grant execute on function public.add_equipment_units(uuid, jsonb, uuid) to authenticated;

-- 3. retire_equipment_unit RPC
create or replace function public.retire_equipment_unit(
  p_unit_id uuid,
  p_reason text,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit record;
  v_total int;
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager'), false) then
    raise exception 'Permission denied to retire equipment units.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'Retirement requires an explanation of at least 10 characters.';
  end if;

  v_request := jsonb_build_object('unit_id', p_unit_id, 'reason', btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_unit from public.product_units where id = p_unit_id for update;
  if not found then raise exception 'Unit not found.'; end if;
  if v_unit.status = 'Retired' then raise exception 'This unit is already retired.'; end if;

  -- Safety Refusals
  if v_unit.status in ('On Rent', 'Reserved', 'Packed', 'Returning', 'Inspection', 'Cleaning', 'Maintenance') then
    raise exception 'GATE:unit.retire.active_status|Unit % is currently in % state and cannot be retired safely. Resolve active operational holds first.', v_unit.asset_tag, v_unit.status;
  end if;

  if exists (select 1 from public.inventory_reservations where asset_id = p_unit_id and released_at is null) then
    raise exception 'GATE:unit.retire.active_reservation|Unit % has an active booking reservation and cannot be retired.', v_unit.asset_tag;
  end if;

  if exists (
    select 1 from public.booking_line_units blu
    join public.booking_lines bl on bl.id = blu.booking_line_id
    join public.bookings b on b.id = bl.booking_id
    where blu.asset_id = p_unit_id
      and blu.released_at is null
      and b.stage in ('Booked', 'Packed', 'On Rent')
  ) then
    raise exception 'GATE:unit.retire.active_booking|Unit % is assigned to an active booking and cannot be retired.', v_unit.asset_tag;
  end if;

  -- Apply soft retirement
  update public.product_units
     set retired_at = clock_timestamp(),
         retired_by = auth.uid(),
         retirement_reason = btrim(p_reason),
         updated_at = clock_timestamp()
   where id = p_unit_id;

  perform public.recompute_unit_status(p_unit_id);

  -- Synchronize total_quantity
  select count(*) into v_total from public.product_units where product_id = v_unit.product_id and status <> 'Retired';
  update public.products set total_quantity = v_total, updated_at = clock_timestamp() where id = v_unit.product_id;

  v_response := jsonb_build_object(
    'unit_id', p_unit_id,
    'asset_tag', v_unit.asset_tag,
    'product_id', v_unit.product_id,
    'status', 'Retired',
    'total_quantity', v_total,
    'retired_at', clock_timestamp()
  );

  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', 'Inventory'::audit_category, 'Inventory'::audit_module, 'Update', 'Medium', 'Success', 'product_units', p_unit_id, auth.uid(), auth_user_role(), v_response);

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), v_request, v_response);
  return v_response;
end;
$$;
revoke all on function public.retire_equipment_unit(uuid, text, uuid) from public, anon;
grant execute on function public.retire_equipment_unit(uuid, text, uuid) to authenticated;

-- 4. enroll_client_membership RPC
create or replace function public.enroll_client_membership(
  p_client_id uuid,
  p_plan_id uuid,
  p_join_date date,
  p_fee_paid numeric,
  p_notes text,
  p_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client record;
  v_plan record;
  v_existing_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_receipt record;
  v_request jsonb;
  v_response jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner', 'Admin', 'Manager', 'Coordinator'), false) then
    raise exception 'Permission denied to enroll membership.' using errcode = '42501';
  end if;

  if p_key is null then raise exception 'A client key is required.'; end if;
  if p_client_id is null then raise exception 'Client is required.'; end if;
  if p_plan_id is null then raise exception 'Plan is required.'; end if;

  v_request := jsonb_build_object('client_id', p_client_id, 'plan_id', p_plan_id, 'join_date', p_join_date, 'fee_paid', p_fee_paid, 'notes', p_notes);
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));

  select * into v_receipt from record_editor_private.receipts where key = p_key;
  if found then
    if v_receipt.actor <> auth.uid() or v_receipt.request <> v_request then
      raise exception 'This save key belongs to a different change.';
    end if;
    return v_receipt.response;
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if not found then raise exception 'Client not found.'; end if;

  select * into v_plan from public.membership_plans where id = p_plan_id;
  if not found then raise exception 'Membership plan not found.'; end if;

  -- Lock and supersede any active live membership for this client
  select id into v_existing_id
    from public.client_memberships
   where client_id = p_client_id and superseded_at is null
     for update;

  if v_existing_id is not null then
    update public.client_memberships
       set superseded_at = clock_timestamp()
     where id = v_existing_id;
  end if;

  insert into public.client_memberships (
    id,
    client_uuid,
    client_id,
    plan_id,
    join_date,
    fee_paid,
    created_by
  ) values (
    v_new_id,
    p_key,
    p_client_id,
    p_plan_id,
    coalesce(p_join_date, current_date),
    p_fee_paid,
    auth.uid()
  );

  if v_existing_id is not null then
    update public.client_memberships
       set superseded_by_id = v_new_id
     where id = v_existing_id;
  end if;

  v_response := jsonb_build_object(
    'id', v_new_id,
    'client_id', p_client_id,
    'plan_id', p_plan_id,
    'level', v_plan.level,
    'plan_label', v_plan.label,
    'join_date', coalesce(p_join_date, current_date),
    'fee_paid', p_fee_paid,
    'superseded_membership_id', v_existing_id
  );

  insert into audit_events(client_uuid, event_class, category, module, action, severity, status, table_name, record_id, actor_id, actor_role, new_values)
  values(p_key, 'status change', 'Administration'::audit_category, 'Clients'::audit_module, 'Create', 'Informational', 'Success', 'client_memberships', v_new_id, auth.uid(), auth_user_role(), v_response);

  insert into record_editor_private.receipts(key, actor, request, response) values(p_key, auth.uid(), v_request, v_response);
  return v_response;
end;
$$;
revoke all on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) from public, anon;
grant execute on function public.enroll_client_membership(uuid, uuid, date, numeric, text, uuid) to authenticated;

commit;

-- Record 0173_section_saves_and_unit_lifecycle in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030015', '0173_section_saves_and_unit_lifecycle')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0173_section_saves_and_unit_lifecycle.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0174_change_client_membership.sql
-- SHA-256: cf61f2ad61b5b1e7faeb6e5ea53a65eaadc86bfcffe2a7bb36727aa81c6adb5c
-- Version: 20261122030016
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- 0174 — change_client_membership: put a client on a membership plan, or move them to another.
--
-- RULING 2026-10-22 (Babin: "activate membership" = make the tier change real; fee left blank).
-- WRITTEN locally; never apply to the live project without Babin's go-ahead and the backup step
-- (CLAUDE.md N-5). Verified by `check:pglite` (it applies) and `check:lifecycle` step L32.
--
-- Why a function and not two writes from the browser
--   0005 allows exactly one LIVE membership per client (`client_memberships_one_live_per_client`,
--   unique on client_id where superseded_at is null) and says a level change "writes a NEW row and
--   supersedes the previous one; the old row is retained". Doing that from the client would be
--   three statements (close the old row, insert the new, point the old at the new); a failure
--   between them strands a client with NO membership, which reads as Lapsed and zeroes their credit.
--   One transaction cannot be interrupted halfway.
--
-- There is no "None" plan (0001: "no membership is the absence of a live client_memberships row"),
-- so "activate" (client has no live row) and "change tier" (client has one) are the same write.
--
-- What this function decides, and what it deliberately does not
--   · WHO: Owner, Admin, Manager, Coordinator — exactly `client_memberships_all` (0037) and
--     PERMISSIONS C5. Accounts and Warehouse are refused (A5: "no membership edits"). The role is
--     checked here because SECURITY DEFINER bypasses RLS; it must match the policy, never widen it.
--   · fee_paid is always NULL. No fee is recorded or implied; payments stay on the invoice flow.
--   · join_date is today's Kathmandu business day (the database's clock, Law 7). 0005 derives the
--     renewal date from join_date + the plan's term_months, so a change restarts the term.
--     ⭐ TODO(decision) — OPEN_DECISIONS §19: restart the term, or carry the original join date over?
--   · A request for the plan the client is already on is refused, not recorded as churn. Renewing a
--     lapsed membership is a different action and is NOT built here.
--   · A retired plan cannot be assigned (0005: retired plans keep their history, never new members).
--   · A deactivated client cannot take a membership.
--   · Idempotent on client_uuid: the audit row is the receipt, exactly as manage_rental_lifecycle
--     (0167). The same key with the same request returns the first answer; a different request
--     under a used key is refused.

begin;

create or replace function public.change_client_membership(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_role public.system_role;
  v_client_id uuid := (p_payload->>'client_id')::uuid;
  v_key uuid := (p_payload->>'client_uuid')::uuid;
  v_level text := btrim(p_payload->>'plan_level');
  v_note text := nullif(btrim(p_payload->>'note'), '');
  v_client public.clients%rowtype;
  v_plan public.membership_plans%rowtype;
  v_old public.client_memberships%rowtype;
  v_receipt public.audit_events%rowtype;
  v_old_level text;
  v_new uuid;
  v_today date := (clock_timestamp() at time zone 'Asia/Kathmandu')::date;
  v_result jsonb;
begin
  select primary_role into v_role from public.users where id = v_actor and is_active;
  if v_actor is null or v_role is null or v_role not in ('Owner','Admin','Manager','Coordinator') then
    raise exception 'Only Coordinator or above can change a client membership.' using errcode = '42501';
  end if;
  if v_client_id is null or v_key is null or v_level is null or v_level = '' then
    raise exception 'Client, request key and membership plan are required.';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'A note can be at most 500 characters.';
  end if;

  -- Serialize retries even when their client IDs differ. A key never changes meaning.
  perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));

  select * into v_client from public.clients where id = v_client_id for update;
  if not found then raise exception 'Client was not found.'; end if;

  select * into v_receipt from public.audit_events where client_uuid = v_key;
  if found then
    if v_receipt.actor_id = v_actor
       and v_receipt.new_values->>'client_id' = v_client_id::text
       and v_receipt.new_values->>'plan_level' = v_level
       and v_receipt.reason is not distinct from v_note then
      return v_receipt.new_values;
    end if;
    raise exception 'Request key already belongs to another action.';
  end if;

  if v_client.status::text = 'Deactivated' then
    raise exception 'A deactivated client cannot take a membership.';
  end if;

  select * into v_plan from public.membership_plans where level::text = v_level;
  if not found then raise exception 'That membership plan does not exist.'; end if;
  if v_plan.status::text <> 'Active' then
    raise exception 'That membership plan is retired and cannot be assigned.';
  end if;

  select * into v_old from public.client_memberships
    where client_id = v_client_id and superseded_at is null for update;
  if found then
    select level::text into v_old_level from public.membership_plans where id = v_old.plan_id;
    if v_old.plan_id = v_plan.id then
      raise exception 'This client is already on the % plan.', v_level;
    end if;
  end if;

  v_new := gen_random_uuid();
  if v_old.id is not null then
    -- Free the one-live-per-client slot first; the new row does not exist yet, so the pointer comes last.
    update public.client_memberships set superseded_at = clock_timestamp() where id = v_old.id;
  end if;
  insert into public.client_memberships(id, client_uuid, client_id, plan_id, join_date, fee_paid, created_by)
  values (v_new, v_key, v_client_id, v_plan.id, v_today, null, v_actor);
  if v_old.id is not null then
    update public.client_memberships set superseded_by_id = v_new where id = v_old.id;
  end if;

  v_result := jsonb_build_object(
    'client_id', v_client_id,
    'plan_level', v_level,
    'previous_level', v_old_level,
    'membership_id', v_new,
    'superseded_membership_id', v_old.id,
    'joined_on', v_today);

  insert into public.audit_events(client_uuid, event_class, category, module, action, severity, status,
    table_name, record_id, actor_id, actor_role, old_values, new_values, reason)
  values (v_key, 'status change', 'Administration', 'Clients', 'Update', 'Informational', 'Success',
    'client_memberships', v_new, v_actor, v_role,
    jsonb_build_object('plan_level', v_old_level, 'membership_id', v_old.id, 'joined_on', v_old.join_date),
    v_result, v_note);

  return v_result;
end $$;

revoke all on function public.change_client_membership(jsonb) from public, anon;
grant execute on function public.change_client_membership(jsonb) to authenticated;

commit;

-- Record 0174_change_client_membership in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030016', '0174_change_client_membership')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0174_change_client_membership.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0176_partial_return_reservation_release.sql
-- SHA-256: 4f2930d8b73d30ce4ec8cac9cb2da52f9cba8653d470e3fc4fce8aafa6793985
-- Version: 20261122030017
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 0176 — RULING 2026-10-24: Release reservations on verified physical return.
-- Renumbered from branch-local 0174 during merge; never applied live.
--
-- ## What was wrong
--
-- Prior to this migration, `inventory_reservations` were released exclusively
-- when a whole booking transitioned stage (`to_stage in ('Returned','Closed','Quote')`
-- in `0100_reservations_written_by_transition.sql`).
--
-- In a partial return where Unit A is physically returned and verified usable
-- while Unit B remains on location, the parent booking correctly remains in
-- stage `'On Rent'`. However:
--
--   1. The original reservation hold for Unit A in `inventory_reservations`
--      retained `released_at IS NULL`.
--   2. The GiST exclusion constraint:
--        `exclude using gist (asset_id with =, period with &&) where (released_at is null and asset_id is not null)`
--      rejected any subsequent overlapping booking attempting to reserve Unit A
--      (`23P01`), even though Unit A was physically present and in usable condition.
--   3. In `recompute_unit_status(p_asset_id)` (0114), Rule 4 classified any unit
--      on an `'On Rent'` booking as `'On Rent'` without checking `blu.returned_at IS NULL`,
--      preventing the unit's inventory status from reflecting its return.
--
-- ## The rule (Ruling 2026-10-24, Brief v1.1)
--
--   - An individually verified, physically received usable unit becomes bookable
--     immediately after a persisted Return, even while Cleaning, QC or Reset tasks
--     are pending.
--   - Partial Return leaves the parent booking On Rent.
--   - Unreturned units remain held under the booking's original reservation.
--   - Units marked Damaged/Lost, under active Maintenance, Retired, or carrying
--     unresolved QC defects or un-voided Damage Findings remain strictly blocked.
--   - Reset completion or payment never silently clears a QC or damage finding.
--
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1 ▸ Release unit reservation on physical return or assignment release.
-- ---------------------------------------------------------------------------
create or replace function release_unit_reservation_on_unit_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Physical return: unit returned_at was set or changed
  if NEW.returned_at is not null and (OLD.returned_at is null or OLD.returned_at is distinct from NEW.returned_at) then
    update public.inventory_reservations
       set released_at = coalesce(NEW.returned_at, clock_timestamp()),
           released_reason = case
             when NEW.unit_state = 'Damaged' or NEW.damaged = true then 'Released on Return: unit physically returned damaged.'
             when NEW.unit_state = 'Missing' then 'Released on Return: unit reported missing on return.'
             else 'Released on Return: unit physically returned.'
           end
     where booking_line_id = NEW.booking_line_id
       and asset_id = NEW.asset_id
       and released_at is null;
  end if;

  -- Assignment release: booking_line_units assignment ended before rental (§4.39a / 0076)
  if NEW.released_at is not null and (OLD.released_at is null or OLD.released_at is distinct from NEW.released_at) then
    update public.inventory_reservations
       set released_at = coalesce(NEW.released_at, clock_timestamp()),
           released_reason = 'Released on Assignment Release: unit unassigned from booking line.'
     where booking_line_id = NEW.booking_line_id
       and asset_id = NEW.asset_id
       and released_at is null;
  end if;

  return NEW;
end;
$$;

comment on function release_unit_reservation_on_unit_change() is
  'RULING 2026-10-24: Releases the active inventory_reservations row for a physical '
  'unit when its booking_line_units row records a physical return (returned_at) or '
  'an assignment release (released_at). Unreturned units on the same booking line '
  'or parent booking remain held.';

drop trigger if exists trg_booking_line_units_release_reservation on booking_line_units;
create trigger trg_booking_line_units_release_reservation
  after update of returned_at, released_at on booking_line_units
  for each row
  execute function release_unit_reservation_on_unit_change();


-- ---------------------------------------------------------------------------
-- 2 ▸ Guard against reserving units that are damaged, defective, or in maintenance.
-- ---------------------------------------------------------------------------
create or replace function validate_unit_reservability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit_status public.inventory_state;
  v_unit_condition public.unit_condition;
  v_retired_at timestamptz;
begin
  -- Only validate active serialised reservations
  if NEW.asset_id is null or NEW.released_at is not null then
    return NEW;
  end if;

  select status, condition, retired_at
    into v_unit_status, v_unit_condition, v_retired_at
    from public.product_units
   where id = NEW.asset_id;

  if not found then
    raise exception 'GATE:unit.reserve.not_found|Unit % does not exist in inventory.', NEW.asset_id;
  end if;

  if v_retired_at is not null or v_unit_status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit % is retired and cannot be reserved.', NEW.asset_id;
  end if;

  if v_unit_status = 'Maintenance' or exists (
    select 1 from public.maintenance_records mr
     where mr.product_unit_id = NEW.asset_id
       and mr.completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.maintenance|Unit % is in maintenance and cannot be reserved.', NEW.asset_id;
  end if;

  if v_unit_condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit % is in % condition and cannot be reserved.', NEW.asset_id, v_unit_condition;
  end if;

  if exists (
    select 1 from public.damage_findings df
     where df.unit_id = NEW.asset_id
       and df.voided_at is null
  ) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit % has an unresolved damage finding and cannot be reserved.', NEW.asset_id;
  end if;

  if exists (
    select 1 from public.cleaning_queue_entries cqe
     where cqe.unit_id = NEW.asset_id
       and (cqe.qc_fail_reason is not null or cqe.problem_state not in ('No Problems'))
       and cqe.reset_completed_at is null
  ) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit % has an unresolved QC defect and cannot be reserved.', NEW.asset_id;
  end if;

  return NEW;
end;
$$;

comment on function validate_unit_reservability() is
  'RULING 2026-10-24: Ensures units with active damage findings, QC defects, uncompleted '
  'maintenance, or retired status cannot receive new active reservations in inventory_reservations.';

drop trigger if exists trg_validate_unit_reservability on inventory_reservations;
create trigger trg_validate_unit_reservability
  before insert or update of asset_id, released_at on inventory_reservations
  for each row
  execute function validate_unit_reservability();


-- ---------------------------------------------------------------------------
-- 3 ▸ Update recompute_unit_status to respect partial return.
-- ---------------------------------------------------------------------------
create or replace function recompute_unit_status(p_asset_id uuid)
returns inventory_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_status inventory_state;
  v_old_status inventory_state;
  v_retired_at timestamptz;
begin
  select status, retired_at into v_old_status, v_retired_at
  from product_units
  where id = p_asset_id;

  if not found then
    return null;
  end if;

  -- 1. Retired if product_units.retired_at is not null
  if v_retired_at is not null then
    v_new_status := 'Retired';

  -- 2. Missing if an open case links to this unit
  elsif exists (
    select 1 from cases c
    where c.type = 'Missing'
      and c.status not in ('Resolved', 'Closed', 'Cancelled')
      and (
        exists (select 1 from damage_findings df where df.case_id = c.id and df.unit_id = p_asset_id and df.voided_at is null)
        or
        (c.linked_booking_id is not null and exists (
          select 1 from booking_line_units blu
          join booking_lines bl on bl.id = blu.booking_line_id
          where bl.booking_id = c.linked_booking_id
            and blu.asset_id = p_asset_id
            and blu.unit_state = 'Missing'
        ))
      )
  ) then
    v_new_status := 'Missing';

  -- 3. Maintenance if an unfinished maintenance row exists
  elsif exists (
    select 1 from maintenance_records mr
    where mr.product_unit_id = p_asset_id
      and mr.completed_at is null
  ) then
    v_new_status := 'Maintenance';

  -- 4. On Rent if on a booking currently in On Rent stage AND not yet returned or released
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'On Rent'
      and b.cancelled_at is null
      and blu.returned_at is null
      and blu.released_at is null
  ) then
    v_new_status := 'On Rent';

  -- 5. Returning if an unfinished Return session has accepted the unit but not completed
  elsif exists (
    select 1 from operation_sessions os
    where os.operation = 'Return'
      and os.state != 'Completed'
      and (
        exists (select 1 from session_line_movements slm where slm.session_id = os.id and slm.unit_id = p_asset_id)
        or exists (select 1 from booking_line_units blu where blu.return_session_id = os.id and blu.asset_id = p_asset_id)
      )
  ) then
    v_new_status := 'Returning';

  -- 6. Inspection if on a Returned booking with no completed inspection
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Returned'
      and b.cancelled_at is null
      and (
        blu.condition is null
        or exists (
          select 1 from return_lines rl
          where rl.booking_line_id = bl.id
            and (rl.inspection_state != 'Inspected' or rl.inspected_at is null)
        )
      )
  ) then
    v_new_status := 'Inspection';

  -- 7. Cleaning if in the cleaning queue and unfinished (cleaning_queue_entries.completed_at is null)
  elsif exists (
    select 1 from cleaning_queue_entries cqe
    where cqe.unit_id = p_asset_id
      and cqe.completed_at is null
  ) then
    v_new_status := 'Cleaning';

  -- 8. Packed if packed on a booking currently in Packed stage
  elsif exists (
    select 1 from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
    join bookings b on b.id = bl.booking_id
    where blu.asset_id = p_asset_id
      and b.stage = 'Packed'
      and b.cancelled_at is null
      and blu.packed = true
      and blu.released_at is null
  ) then
    v_new_status := 'Packed';

  -- 9. Reserved if a live inventory_reservations row covers now()
  elsif exists (
    select 1 from inventory_reservations ir
    where ir.asset_id = p_asset_id
      and ir.released_at is null
      and ir.period @> now()
  ) then
    v_new_status := 'Reserved';

  -- 10. Default: In Stock
  else
    v_new_status := 'In Stock';
  end if;

  -- Writes the result into product_units.status using transaction-scoped GUC
  if v_old_status is distinct from v_new_status then
    perform set_config('app.unit_status_recompute', 'on', true);
    update product_units
    set status = v_new_status,
        updated_at = now()
    where id = p_asset_id;
    perform set_config('app.unit_status_recompute', 'off', true);
  end if;

  return v_new_status;
end;
$$;

comment on function recompute_unit_status(uuid) is
  'RULING 2026-10-24: Updates unit status engine with partial return support. Units on an '
  'On Rent booking that have already been physically returned (returned_at is not null) are '
  'no longer classified as On Rent.';

commit;

-- Record 0176_partial_return_reservation_release in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030017', '0176_partial_return_reservation_release')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0176_partial_return_reservation_release.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START MIGRATION: 0177_verified_return_reservations.sql
-- SHA-256: a8a176dea2f25aea122ee50e206ab254d213dbaae661995f38d6624048166262
-- Version: 20261122030018
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- RULING 2026-10-24: only a verified, persisted usable Return releases stock.
-- 0177: Extend 0176 to quantity receipts and keep genuine QC defects independent of
-- Reset completion. WRITTEN locally; never apply to hosted Supabase (N-5).
-- Renumbered from branch-local 0175 during merge; never applied live.
begin;

-- Only verified new receipts enter this private ledger. Historical movements
-- without inspection proof are never reclassified as usable inventory.
create table if not exists record_editor_private.verified_return_quantities (
  movement_id uuid primary key references session_line_movements(id),
  booking_line_id uuid not null references booking_lines(id),
  quantity_delta integer not null check (quantity_delta <> 0),
  inspected_at timestamptz not null,
  verified_by uuid not null references users(id)
);
alter table record_editor_private.verified_return_quantities enable row level security;
revoke all on record_editor_private.verified_return_quantities from public, anon, authenticated;

create or replace function record_editor_private.release_verified_return_holds(p_line uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  line_row booking_lines;
  original_quantity integer;
  received_quantity bigint;
  verified_quantity bigint;
  remaining_quantity integer;
  hold_row inventory_reservations;
  received_serials integer;
begin
  select * into line_row from booking_lines where id = p_line for update;
  if not found or line_row.product_id is null or line_row.voided_at is not null then return; end if;
  if not exists (select 1 from bookings where id = line_row.booking_id and stage = 'On Rent' and cancelled_at is null) then return; end if;
  -- RULING 2026-10-24: branch grants constrain every custody write, including
  -- partial receipts which deliberately leave the parent stage unchanged.
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician'),false) then
    raise exception 'Permission denied to release Return reservations.' using errcode = '42501';
  end if;
  perform public.assert_operation_branch_grant('return', line_row.booking_id);

  -- Uninspected records and missing/damaged outcomes cannot release a usable
  -- stock commitment. Match the actual Return session to the booking and line.
  update inventory_reservations ir
     set released_at = clock_timestamp(),
         released_reason = 'Released on Return: unit physically returned and inspected usable.'
    from booking_line_units blu, return_lines rl, operation_sessions os
   where blu.booking_line_id = p_line and blu.asset_id = ir.asset_id
     and ir.booking_line_id = p_line and ir.released_at is null
     and blu.returned_at is not null and blu.unit_state = 'Returned'
     and blu.condition in ('Excellent', 'Good', 'Fair')
     and rl.booking_line_id = p_line and rl.session_id = blu.return_session_id
     and rl.inspection_state = 'Inspected' and rl.inspected_at is not null
     and rl.condition in ('Excellent', 'Good', 'Fair')
     and os.id = rl.session_id and os.booking_id = line_row.booking_id
     and os.operation = 'Return' and os.state = 'Completed'
     and rl.inspected_at >= coalesce(os.started_at, os.created_at);

  original_quantity := greatest(0, line_row.qty - (
    select count(*)::integer from booking_line_units
     where booking_line_id = p_line and asset_id is not null and released_at is null
  ));
  -- Quantity movements contain the amount received in each pass, not an
  -- accumulated UI count. Replayed client_uuid inserts cannot be counted twice.
  select coalesce(sum(vq.quantity_delta), 0)
    into verified_quantity
    from record_editor_private.verified_return_quantities vq
   where vq.booking_line_id = p_line;
  select coalesce(sum(vq.quantity_delta),0) into received_quantity
    from record_editor_private.verified_return_quantities vq
    join session_line_movements sm on sm.id=vq.movement_id
    join operation_sessions os on os.id=sm.session_id
   where vq.booking_line_id=p_line and os.state='Completed';
  select count(*)::integer into received_serials from booking_line_units blu
    join operation_sessions os on os.id=blu.return_session_id
   where blu.booking_line_id=p_line and blu.asset_id is not null and blu.released_at is null
     and blu.returned_at is not null and blu.unit_state in ('Returned','Damaged')
     and os.operation='Return' and os.booking_id=line_row.booking_id;
  if received_serials + verified_quantity >= line_row.qty then
    update return_lines set state='Returned', returned_at=coalesce(returned_at,clock_timestamp()),
      not_returned_reason=null,not_returned_decision=null
     where booking_line_id=p_line and state <> 'Returned';
  elsif exists (select 1 from record_editor_private.verified_return_quantities
    where booking_line_id=p_line and quantity_delta<0) then
    update return_lines set state='Outstanding', returned_at=null
     where booking_line_id=p_line and state='Returned';
  end if;
  if original_quantity = 0 then return; end if;
  remaining_quantity := greatest(0, original_quantity - least(original_quantity, greatest(0, received_quantity))::integer);
  -- Never manufacture a replacement hold or revive an override/cancellation.
  -- The existing reservation rows, exclusion and product-capacity guard remain
  -- authoritative, and the adjustment commits with the receipt write.
  for hold_row in select * from inventory_reservations where booking_line_id = p_line
    and product_id = line_row.product_id and asset_id is null and released_at is null
    order by created_at, id for update
  loop
    if remaining_quantity = 0 then
      update inventory_reservations set released_at = clock_timestamp(),
        released_reason = 'Released on verified quantity Return.' where id = hold_row.id;
    elsif hold_row.qty > remaining_quantity then
      update inventory_reservations set qty = remaining_quantity where id = hold_row.id;
      remaining_quantity := 0;
    else
      remaining_quantity := remaining_quantity - hold_row.qty;
    end if;
  end loop;
  -- An append-only compensating movement can undo a quantity receipt. Restore
  -- only this return's own existing hold, with the capacity guard still active;
  -- never revive a hold released by cancellation or an overbooking override.
  if remaining_quantity > 0 and exists (
    select 1 from record_editor_private.verified_return_quantities
     where booking_line_id = p_line and quantity_delta < 0
  ) then
    select * into hold_row from inventory_reservations
     where booking_line_id = p_line and product_id = line_row.product_id and asset_id is null
       and (released_at is null or released_reason = 'Released on verified quantity Return.')
     order by (released_at is null) desc, created_at desc, id limit 1 for update;
    if found then
      update inventory_reservations
         set qty = case when hold_row.released_at is null then hold_row.qty + remaining_quantity else remaining_quantity end,
             released_at = null, released_reason = null
       where id = hold_row.id;
    end if;
  end if;
end; $$;
revoke all on function record_editor_private.release_verified_return_holds(uuid) from public, anon, authenticated;

create or replace function release_unit_reservation_on_unit_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform record_editor_private.release_verified_return_holds(new.booking_line_id);
  if new.released_at is not null and old.released_at is distinct from new.released_at then
    update inventory_reservations set released_at = new.released_at,
      released_reason = 'Released on Assignment Release: unit unassigned from booking line.'
     where booking_line_id = new.booking_line_id and asset_id = new.asset_id and released_at is null;
  end if;
  return new;
end; $$;
drop trigger if exists trg_booking_line_units_release_reservation on booking_line_units;
create trigger trg_booking_line_units_release_reservation
  after update of returned_at, released_at, return_session_id, condition, unit_state on booking_line_units
  for each row execute function release_unit_reservation_on_unit_change();

create or replace function release_reservations_on_verified_return_receipt()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  session_row operation_sessions;
  inspection return_lines;
  original_receipt record;
  reversed_quantity bigint;
  maximum_quantity integer;
  current_quantity bigint;
  v_delta integer;
begin
  if tg_table_name = 'session_line_movements' then
    select * into session_row from operation_sessions where id = new.session_id;
    if session_row.operation='Return' and session_row.state <> 'In Progress' then
      raise exception 'GATE:return.session.sealed|A completed Return cannot accept another receipt.';
    end if;
    if session_row.operation = 'Return' and new.unit_id is null and new.resulting_item_state = 'Returned' then
      if not exists(select 1 from bookings where id=session_row.booking_id and stage='On Rent' and cancelled_at is null) then
        raise exception 'GATE:return.quantity.stage|Quantity receipts require an active On Rent booking.';
      end if;
      perform 1 from booking_lines where id = new.booking_line_id and booking_id = session_row.booking_id for update;
      if not found then raise exception 'GATE:return.quantity.line|Receipt does not belong to this Return booking.'; end if;
      select * into inspection from return_lines where booking_line_id = new.booking_line_id
        and session_id = new.session_id and inspection_state = 'Inspected'
        and inspected_at >= coalesce(session_row.started_at, session_row.created_at)
        and condition in ('Excellent', 'Good', 'Fair');
      if not found then raise exception 'GATE:return.quantity.inspection|Inspect the received quantity before recording its usable Return.'; end if;
      if new.reverses_movement_id is not null then
        select * into original_receipt from record_editor_private.verified_return_quantities vq
         where vq.movement_id = new.reverses_movement_id and vq.booking_line_id = new.booking_line_id and vq.quantity_delta > 0;
        if not found then raise exception 'GATE:return.quantity.reversal|Only a verified receipt on the same line may be reversed.'; end if;
        select coalesce(sum(sm.qty),0) into reversed_quantity from session_line_movements sm
         where sm.reverses_movement_id = new.reverses_movement_id;
        if reversed_quantity > original_receipt.quantity_delta then
          raise exception 'GATE:return.quantity.reversal|A correction cannot exceed its original receipt.';
        end if;
      end if;
      select greatest(0, bl.qty - (select count(*)::integer from booking_line_units blu
        where blu.booking_line_id=bl.id and blu.asset_id is not null and blu.released_at is null))
        into maximum_quantity from booking_lines bl where bl.id=new.booking_line_id;
      select coalesce(sum(vq.quantity_delta),0) into current_quantity
        from record_editor_private.verified_return_quantities vq where vq.booking_line_id=new.booking_line_id;
      v_delta := case when new.reverses_movement_id is null then new.qty else -new.qty end;
      if current_quantity + v_delta < 0 or current_quantity + v_delta > maximum_quantity then
        raise exception 'GATE:return.quantity.bounds|Verified receipts cannot exceed the line quantity or reverse more than was received.';
      end if;
      insert into record_editor_private.verified_return_quantities(movement_id,booking_line_id,quantity_delta,inspected_at,verified_by)
        values(new.id,new.booking_line_id,v_delta,
          inspection.inspected_at,inspection.inspected_by);
    end if;
  end if;
  perform record_editor_private.release_verified_return_holds(new.booking_line_id);
  return new;
end; $$;
revoke all on function release_reservations_on_verified_return_receipt() from public, anon, authenticated;
create trigger trg_return_movement_releases_verified_quantity
  after insert on session_line_movements for each row
  execute function release_reservations_on_verified_return_receipt();
create trigger trg_return_inspection_releases_verified_stock
  after insert or update of inspection_state, inspected_at, condition on return_lines
  for each row execute function release_reservations_on_verified_return_receipt();

-- Seals are immutable. Exact idempotency conflicts do not insert another row;
-- changed facts must belong to a fresh, open Return pass.
create or replace function guard_verified_return_facts()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s operation_sessions;
begin
  if tg_table_name='operation_sessions' then
    if old.operation='Return' and old.state='Completed' and new.state is distinct from old.state then
      raise exception 'GATE:return.session.sealed|A completed Return cannot be reopened.';
    end if;
  elsif tg_table_name='booking_line_units' then
    if row(new.returned_at,new.return_session_id,new.condition,new.unit_state)
      is not distinct from row(old.returned_at,old.return_session_id,old.condition,old.unit_state) then return new; end if;
    if exists(select 1 from operation_sessions where id=old.return_session_id and operation='Return' and state='Completed') then
      raise exception 'GATE:return.session.sealed|A completed Return receipt cannot be changed.';
    end if;
    if new.return_session_id is not null then
      select * into s from operation_sessions where id=new.return_session_id;
      if s.operation is distinct from 'Return' or s.state is distinct from 'In Progress'
        or not exists(select 1 from booking_lines where id=new.booking_line_id and booking_id=s.booking_id) then
        raise exception 'GATE:return.session.sealed|New Return facts require this booking''s open Return session.';
      end if;
    end if;
  else
    select * into s from operation_sessions where id=new.session_id;
    if s.operation='Return' and s.state <> 'In Progress' then
      raise exception 'GATE:return.session.sealed|Inspection facts require an open Return session.';
    end if;
    if exists(select 1 from record_editor_private.verified_return_quantities vq
      join session_line_movements sm on sm.id=vq.movement_id
      where sm.session_id=new.session_id and vq.booking_line_id=new.booking_line_id)
      and (new.inspection_state is distinct from 'Inspected' or new.inspected_at is null
        or not coalesce(new.condition in ('Excellent','Good','Fair'),false)) then
      raise exception 'GATE:return.quantity.retry|A persisted usable receipt cannot be changed on retry.';
    end if;
  end if;
  return new;
end; $$;
revoke all on function guard_verified_return_facts() from public,anon,authenticated;
create trigger trg_return_session_seal_immutable before update of state on operation_sessions
  for each row execute function guard_verified_return_facts();
create trigger trg_return_serial_facts_immutable before update of returned_at,return_session_id,condition,unit_state on booking_line_units
  for each row execute function guard_verified_return_facts();
create trigger trg_return_inspection_facts_open before insert or update of session_id,inspection_state,inspected_at,condition on return_lines
  for each row execute function guard_verified_return_facts();

-- Partial Return remains On Rent, so its commit point is the persisted session
-- seal. A failed seal rolls back its availability change; an interrupted open
-- session keeps its holds and can retry the original receipt safely.
create or replace function release_reservations_on_return_session_commit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare line_id uuid;
begin
  if new.operation='Return' and new.state='Completed' and old.state is distinct from new.state then
    for line_id in select distinct booking_line_id from session_line_movements where session_id=new.id
      union select booking_line_id from booking_line_units where return_session_id=new.id
    loop
      perform record_editor_private.release_verified_return_holds(line_id);
    end loop;
  end if;
  return new;
end; $$;
revoke all on function release_reservations_on_return_session_commit() from public,anon,authenticated;
create trigger trg_return_session_commit_releases_reservations
  after update of state on operation_sessions for each row
  execute function release_reservations_on_return_session_commit();

-- A completed Reset stamp is task progress, never proof that a recorded QC
-- failure disappeared. The defect fields must themselves be cleared by QC.
create or replace function validate_unit_reservability()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare unit_row product_units;
begin
  if new.asset_id is null or new.released_at is not null then return new; end if;
  select * into unit_row from product_units where id = new.asset_id;
  if not found then raise exception 'GATE:unit.reserve.not_found|Unit does not exist in inventory.'; end if;
  if unit_row.retired_at is not null or unit_row.status = 'Retired' then
    raise exception 'GATE:unit.reserve.retired|Unit is retired and cannot be reserved.';
  end if;
  if unit_row.status = 'Maintenance' or exists (select 1 from maintenance_records where product_unit_id = new.asset_id and completed_at is null) then
    raise exception 'GATE:unit.reserve.maintenance|Unit is in maintenance and cannot be reserved.';
  end if;
  if unit_row.condition in ('Damaged', 'Lost') then
    raise exception 'GATE:unit.reserve.damaged_condition|Unit is damaged or lost and cannot be reserved.';
  end if;
  if exists (select 1 from damage_findings where unit_id = new.asset_id and voided_at is null) then
    raise exception 'GATE:unit.reserve.damage_finding|Unit has an unresolved damage finding.';
  end if;
  if exists (select 1 from cleaning_queue_entries where unit_id = new.asset_id
    and (nullif(btrim(qc_fail_reason), '') is not null or problem_state <> 'No Problems')) then
    raise exception 'GATE:unit.reserve.qc_defect|Unit has an unresolved QC defect.';
  end if;
  return new;
end; $$;

create or replace function public.read_verified_return_quantities(p_booking_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(auth_user_role()::text in ('Owner','Admin','Manager','Coordinator','Warehouse','Technician'),false) then
    raise exception 'Permission denied to read Return quantities.' using errcode='42501';
  end if;
  perform public.assert_operation_branch_grant('return',p_booking_id);
  select coalesce(jsonb_agg(jsonb_build_object('booking_line_id',bl.id,'returned_qty',
    coalesce((select sum(vq.quantity_delta) from record_editor_private.verified_return_quantities vq
      join session_line_movements sm on sm.id=vq.movement_id join operation_sessions os on os.id=sm.session_id
      where vq.booking_line_id=bl.id and os.state='Completed'),0)) order by bl.id),'[]'::jsonb)
    into result from booking_lines bl join products p on p.id=bl.product_id
   where bl.booking_id=p_booking_id and bl.voided_at is null and p.tracking_mode <> 'Consumable'
     and bl.line_type::text not in ('Service','Sub-rental','Manual item','service','sub_rental','sub-rental','manual_item','manual item');
  return result;
end; $$;
revoke all on function public.read_verified_return_quantities(uuid) from public,anon;
grant execute on function public.read_verified_return_quantities(uuid) to authenticated;
commit;

-- Record 0177_verified_return_reservations in schema_migrations
insert into supabase_migrations.schema_migrations (version, name)
values ('20261122030018', '0177_verified_return_reservations')
on conflict (version) do update set name = excluded.name;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END MIGRATION: 0177_verified_return_reservations.sql
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

-- Reset migration session config
select set_config('app.in_create_booking', 'off', false);

-- =============================================================================
-- BATCH 1 VERIFICATION QUERY
-- Run this query immediately after running the batch to confirm registration:
-- =============================================================================
select 'BATCH 1 VERIFICATION' as batch, count(*) as applied_count
from supabase_migrations.schema_migrations
where name in (
  '0157_audit_triggers_for_trigger_less_tables',
  '0158_settings_table',
  '0159_saved_views',
  '0160_pricing_structures',
  '0161_grant_booking_project_type',
  '0162_grant_non_money_columns',
  '0163_close_six_anon_business_rpcs',
  '0165_delivery_jobs_and_event_rpc',
  '0166_booking_transport_dispatch',
  '0167_rental_revert_archive',
  '0168_booking_line_totals_and_breakdown',
  '0169_pin_intel_and_guard_search_paths',
  '0170_astra_phase0_authorization',
  '0171_operations_branch_grants',
  '0172_reset_branch_write_boundary',
  '0173_section_saves_and_unit_lifecycle',
  '0174_change_client_membership',
  '0176_partial_return_reservation_release',
  '0177_verified_return_reservations'
);
-- Expected applied_count: 19
