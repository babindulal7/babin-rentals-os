-- Migration 0186: Shift handover on the database (T4-05, Ruling S6, Ruling W32, Law 6 Money Isolation)
-- =============================================================================
-- Ruling S6 (26 Oct 2026): Shift handover reads and writes the database instead
-- of one browser's localStorage. Staff across devices stay in sync.
-- Ruling W32: Three shifts:
--   Shift A: 06:00–15:00 (Morning)
--   Shift B: 14:00–23:00 (Day/Evening)
--   Shift C: 22:00–07:00 (Night)
--   Overlap hours: 14:00–15:00, 22:00–23:00, 06:00–07:00
-- Law 3: Archive, never delete (archived_at is not null, status = 'archived').
-- Law 5: Integer paisa for cash counted & variance (cash_counted_paisa, cash_variance_paisa).
-- Law 6: Money blindness: Warehouse, Technician, Driver and Client never receive cash figures.
--        Financial columns isolated in shift_handover_finances table with auth_can_view_money() RLS.
-- Law 8: Every write carries a client_uuid idempotency key and audits to audit_events.
-- =============================================================================

begin;

-- 1. Create shift_handovers table (operational details only, zero cash columns)
create table public.shift_handovers (
  id                     uuid        not null default gen_random_uuid() primary key,
  client_uuid            uuid        not null unique,
  shift_code             text        not null default 'A' check (shift_code in ('A', 'B', 'C', 'Morning', 'Day/Evening', 'Night')),
  shift_date             date        not null default current_date,
  from_user_id           uuid        not null references public.users (id) on delete restrict,
  from_user_name         text        not null,
  from_user_role         text        not null,
  to_user_id             uuid        references public.users (id) on delete set null,
  to_user_name           text,
  notes                  text        default '',
  open_items             jsonb       not null default '[]'::jsonb,
  checklist              jsonb       not null default '[]'::jsonb,
  status                 text        not null default 'pending' check (status in ('pending', 'acknowledged', 'archived')),
  acknowledged_at        timestamptz,
  acknowledged_by        uuid        references public.users (id) on delete set null,
  acknowledged_by_name   text,
  acknowledgement_note   text,
  archived_at            timestamptz,
  archived_by            uuid        references public.users (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.shift_handovers is
  'Shared staff shift handovers across the three operational shifts (W32). Staff-only (auth_is_staff). Operational details only; zero cash columns (Law 6). Archive, never delete (Law 3).';

-- 2. Create shift_handover_finances table (strictly isolated financial records under Law 6)
create table public.shift_handover_finances (
  id                     uuid        not null default gen_random_uuid() primary key,
  handover_id            uuid        not null unique references public.shift_handovers (id) on delete cascade,
  cash_counted_paisa     bigint      default 0 check (cash_counted_paisa >= 0),
  cash_status            text        not null default 'matched' check (cash_status in ('matched', 'short', 'over')),
  cash_variance_paisa    bigint      default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.shift_handover_finances is
  'Isolated shift handover cash count and till variance (Law 5, Law 6). Restricted to financial roles via auth_can_view_money().';

-- 3. Indexes
create index if not exists idx_shift_handovers_created_at on public.shift_handovers (created_at desc);
create index if not exists idx_shift_handovers_active on public.shift_handovers (created_at desc) where archived_at is null;
create index if not exists idx_shift_handovers_pending on public.shift_handovers (shift_date desc) where status = 'pending' and archived_at is null;
create index if not exists idx_shift_handovers_from_user on public.shift_handovers (from_user_id);
create index if not exists idx_shift_handovers_to_user on public.shift_handovers (to_user_id) where to_user_id is not null;
create index if not exists idx_shift_handover_finances_handover on public.shift_handover_finances (handover_id);

-- 4. Grants and permissions for shift_handovers
revoke all on public.shift_handovers from public, anon;
grant select, insert on public.shift_handovers to authenticated;
revoke update, delete on public.shift_handovers from public, anon, authenticated;

-- RLS: shift_handovers
alter table public.shift_handovers enable row level security;

create policy shift_handovers_select on public.shift_handovers
  for select
  using (public.auth_is_staff());

create policy shift_handovers_insert on public.shift_handovers
  for insert
  with check (public.auth_is_staff() and from_user_id = public.auth_user_id());

-- 5. Grants and permissions for shift_handover_finances (Money-authorized roles only)
revoke all on public.shift_handover_finances from public, anon;
grant select, insert on public.shift_handover_finances to authenticated;
revoke update, delete on public.shift_handover_finances from public, anon, authenticated;

-- RLS: shift_handover_finances
alter table public.shift_handover_finances enable row level security;

create policy shift_handover_finances_select on public.shift_handover_finances
  for select
  using (public.auth_can_view_money());

create policy shift_handover_finances_insert on public.shift_handover_finances
  for insert
  with check (public.auth_can_view_money());

-- 6. Views: shift_handovers_v (Law 6 cash figures masked to NULL for money-blind roles)
create or replace view public.shift_handovers_v as
select
  h.id,
  h.client_uuid,
  h.shift_code,
  h.shift_date,
  h.from_user_id,
  h.from_user_name,
  h.from_user_role,
  h.to_user_id,
  h.to_user_name,
  case
    when public.auth_can_view_money() then f.cash_counted_paisa
    else null
  end as cash_counted_paisa,
  case
    when public.auth_can_view_money() then coalesce(f.cash_status, 'matched')
    else null
  end as cash_status,
  case
    when public.auth_can_view_money() then f.cash_variance_paisa
    else null
  end as cash_variance_paisa,
  h.notes,
  h.open_items,
  h.checklist,
  h.status,
  h.acknowledged_at,
  h.acknowledged_by,
  h.acknowledged_by_name,
  h.acknowledgement_note,
  h.archived_at,
  h.archived_by,
  h.created_at,
  h.updated_at
from public.shift_handovers h
left join public.shift_handover_finances f on f.handover_id = h.id
where public.auth_is_staff();

comment on view public.shift_handovers_v is
  'Staff shift handovers with cash figures masked for money-blind roles (Warehouse, Technician, Driver, Client) per Law 6.';

revoke all on public.shift_handovers_v from public, anon;
grant select on public.shift_handovers_v to authenticated;

-- 7. Delete prevention trigger (Law 3)
create or replace function public.trg_shift_handovers_prevent_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'HARD DELETE FORBIDDEN (Law 3): Shift handovers must be archived, not deleted';
end;
$$;

revoke all on function public.trg_shift_handovers_prevent_delete() from public, anon;
grant execute on function public.trg_shift_handovers_prevent_delete() to authenticated;

drop trigger if exists trg_prevent_delete_shift_handovers on public.shift_handovers;
create trigger trg_prevent_delete_shift_handovers
  before delete on public.shift_handovers
  for each row execute function public.trg_shift_handovers_prevent_delete();

-- 8. Immutable field protection trigger
create or replace function public.trg_shift_handovers_protect_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.id <> OLD.id then
    raise exception 'id is immutable';
  end if;
  if NEW.client_uuid <> OLD.client_uuid then
    raise exception 'client_uuid is immutable';
  end if;
  if NEW.from_user_id <> OLD.from_user_id then
    raise exception 'from_user_id is immutable';
  end if;
  if NEW.created_at <> OLD.created_at then
    raise exception 'created_at is immutable';
  end if;
  if OLD.status = 'archived' and NEW.status <> 'archived' then
    raise exception 'Cannot un-archive a shift handover';
  end if;
  if OLD.status = 'acknowledged' and NEW.status = 'pending' then
    raise exception 'Cannot un-acknowledge a shift handover';
  end if;
  if OLD.acknowledged_by is not null and NEW.acknowledged_by <> OLD.acknowledged_by then
    raise exception 'acknowledged_by is immutable once set';
  end if;
  if OLD.archived_by is not null and NEW.archived_by <> OLD.archived_by then
    raise exception 'archived_by is immutable once set';
  end if;
  return NEW;
end;
$$;

revoke all on function public.trg_shift_handovers_protect_fields() from public, anon;
grant execute on function public.trg_shift_handovers_protect_fields() to authenticated;

drop trigger if exists trg_protect_shift_handovers_fields on public.shift_handovers;
create trigger trg_protect_shift_handovers_fields
  before update on public.shift_handovers
  for each row execute function public.trg_shift_handovers_protect_fields();

-- 9. Audit triggers (Law 8)
drop trigger if exists trg_audit_shift_handovers on public.shift_handovers;
create trigger trg_audit_shift_handovers
  after insert or update on public.shift_handovers
  for each row execute function public.log_audit_event_actor();

drop trigger if exists trg_audit_shift_handover_finances on public.shift_handover_finances;
create trigger trg_audit_shift_handover_finances
  after insert or update on public.shift_handover_finances
  for each row execute function public.log_audit_event_actor();

-- 10. Atomic stored procedures returning role-safe view projections
create or replace function public.create_shift_handover(
  p_client_uuid            uuid,
  p_shift_code             text default 'A',
  p_from_user_name         text default 'Staff Member',
  p_from_user_role         text default 'Operations',
  p_to_user_id             uuid default null,
  p_to_user_name           text default null,
  p_cash_counted_paisa     bigint default null,
  p_cash_status            text default null,
  p_cash_variance_paisa    bigint default null,
  p_notes                  text default '',
  p_open_items             jsonb default '[]'::jsonb,
  p_checklist              jsonb default '[]'::jsonb
) returns public.shift_handovers_v
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handover public.shift_handovers;
  v_result public.shift_handovers_v;
  v_actor uuid;
  v_actor_role text;
  v_existing_id uuid;
begin
  if not public.auth_is_staff() then
    raise exception 'FORBIDDEN: Staff only';
  end if;

  if p_client_uuid is null then
    raise exception 'client_uuid is required (Law 8)';
  end if;

  -- Idempotency check (Law 8)
  select id into v_existing_id from public.shift_handovers where client_uuid = p_client_uuid;
  if v_existing_id is not null then
    select * into v_result from public.shift_handovers_v where id = v_existing_id;
    if not public.auth_can_view_money() then
      v_result.cash_counted_paisa := null;
      v_result.cash_status := null;
      v_result.cash_variance_paisa := null;
    end if;
    return v_result;
  end if;

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

  if v_actor is null then
    raise exception 'A signed-in staff session is required to record a shift handover';
  end if;

  select primary_role::text into v_actor_role from public.users where id = v_actor;

  -- Law 6: Money-blind roles cannot record cash values
  if not public.auth_can_view_money() then
    if (p_cash_counted_paisa is not null and p_cash_counted_paisa > 0)
       or (p_cash_variance_paisa is not null and p_cash_variance_paisa <> 0)
       or (p_cash_status is not null and p_cash_status not in ('matched', '')) then
      raise exception 'FORBIDDEN (Law 6): Money-blind role (%) cannot record cash values', coalesce(v_actor_role, 'Unknown');
    end if;
  end if;

  insert into public.shift_handovers (
    client_uuid,
    shift_code,
    shift_date,
    from_user_id,
    from_user_name,
    from_user_role,
    to_user_id,
    to_user_name,
    notes,
    open_items,
    checklist,
    status,
    created_at,
    updated_at
  ) values (
    p_client_uuid,
    coalesce(nullif(btrim(p_shift_code), ''), 'A'),
    current_date,
    v_actor,
    coalesce(nullif(btrim(p_from_user_name), ''), 'Staff Member'),
    coalesce(nullif(btrim(v_actor_role), ''), coalesce(nullif(btrim(p_from_user_role), ''), 'Operations')),
    p_to_user_id,
    p_to_user_name,
    coalesce(p_notes, ''),
    coalesce(p_open_items, '[]'::jsonb),
    coalesce(p_checklist, '[]'::jsonb),
    'pending',
    now(),
    now()
  )
  returning * into v_handover;

  -- If financial role provided cash figures, record in isolated shift_handover_finances
  if public.auth_can_view_money() and (p_cash_counted_paisa is not null or p_cash_variance_paisa is not null or p_cash_status is not null) then
    insert into public.shift_handover_finances (
      handover_id,
      cash_counted_paisa,
      cash_status,
      cash_variance_paisa,
      created_at,
      updated_at
    ) values (
      v_handover.id,
      coalesce(p_cash_counted_paisa, 0),
      coalesce(nullif(btrim(p_cash_status), ''), 'matched'),
      coalesce(p_cash_variance_paisa, 0),
      now(),
      now()
    );
  end if;

  select * into v_result from public.shift_handovers_v where id = v_handover.id;
  if not public.auth_can_view_money() then
    v_result.cash_counted_paisa := null;
    v_result.cash_status := null;
    v_result.cash_variance_paisa := null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_shift_handover(uuid, text, text, text, uuid, text, bigint, text, bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_shift_handover(uuid, text, text, text, uuid, text, bigint, text, bigint, text, jsonb, jsonb) to authenticated;

create or replace function public.acknowledge_shift_handover(
  p_handover_id            uuid,
  p_acknowledgement_note   text default null,
  p_operator_name          text default null
) returns public.shift_handovers_v
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handover public.shift_handovers;
  v_result public.shift_handovers_v;
  v_actor uuid;
  v_actor_name text;
begin
  if not public.auth_is_staff() then
    raise exception 'FORBIDDEN: Staff only';
  end if;

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

  if v_actor is null then
    raise exception 'A signed-in staff session is required to acknowledge a shift handover';
  end if;

  select * into v_handover from public.shift_handovers where id = p_handover_id;
  if v_handover.id is null then
    raise exception 'Shift handover record not found';
  end if;

  if v_handover.status = 'acknowledged' then
    select * into v_result from public.shift_handovers_v where id = v_handover.id;
    if not public.auth_can_view_money() then
      v_result.cash_counted_paisa := null;
      v_result.cash_status := null;
      v_result.cash_variance_paisa := null;
    end if;
    return v_result;
  end if;

  if v_handover.status = 'archived' then
    raise exception 'Invalid transition: Shift handover is archived';
  end if;

  -- Staff cannot acknowledge their own shift handover
  if v_handover.from_user_id = v_actor then
    raise exception 'FORBIDDEN: Staff cannot acknowledge their own shift handover';
  end if;

  select coalesce(p_operator_name, full_name, 'Staff Member') into v_actor_name
  from public.users where id = v_actor;

  update public.shift_handovers
  set
    status = 'acknowledged',
    acknowledged_at = now(),
    acknowledged_by = v_actor,
    acknowledged_by_name = coalesce(v_actor_name, coalesce(p_operator_name, 'Staff Member')),
    acknowledgement_note = p_acknowledgement_note,
    updated_at = now()
  where id = p_handover_id;

  select * into v_result from public.shift_handovers_v where id = p_handover_id;
  if not public.auth_can_view_money() then
    v_result.cash_counted_paisa := null;
    v_result.cash_status := null;
    v_result.cash_variance_paisa := null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.acknowledge_shift_handover(uuid, text, text) from public, anon;
grant execute on function public.acknowledge_shift_handover(uuid, text, text) to authenticated;

create or replace function public.archive_shift_handover(
  p_handover_id uuid
) returns public.shift_handovers_v
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_handover public.shift_handovers;
  v_result public.shift_handovers_v;
  v_actor uuid;
begin
  if not public.auth_is_staff() then
    raise exception 'FORBIDDEN: Staff only';
  end if;

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

  if v_actor is null then
    raise exception 'A signed-in staff session is required to archive a shift handover';
  end if;

  select * into v_handover from public.shift_handovers where id = p_handover_id;
  if v_handover.id is null then
    raise exception 'Shift handover record not found';
  end if;

  if v_handover.status = 'archived' then
    select * into v_result from public.shift_handovers_v where id = p_handover_id;
    if not public.auth_can_view_money() then
      v_result.cash_counted_paisa := null;
      v_result.cash_status := null;
      v_result.cash_variance_paisa := null;
    end if;
    return v_result;
  end if;

  update public.shift_handovers
  set
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    archived_by = v_actor,
    updated_at = now()
  where id = p_handover_id;

  select * into v_result from public.shift_handovers_v where id = p_handover_id;
  if not public.auth_can_view_money() then
    v_result.cash_counted_paisa := null;
    v_result.cash_status := null;
    v_result.cash_variance_paisa := null;
  end if;

  return v_result;
end;
$$;

revoke all on function public.archive_shift_handover(uuid) from public, anon;
grant execute on function public.archive_shift_handover(uuid) to authenticated;

commit;
