-- 0223_product_aliases.sql
-- T3-12 Â· Paste a WhatsApp gear list â€” the spellings staff teach us (W1, W9, lane C)
-- Ledger: docs/plans/MIGRATION_LEDGER.md row 0223, status verified (renumbered from 0222 after main took that number).
--
-- The paste-list matcher matches plain text over product names, aliases and asset codes â€”
-- no AI service anywhere (Law 16). When staff correct a match, the spelling they typed is
-- stored here, so the next paste with the same shorthand matches without a correction.
--
-- Design notes, because these are decisions rather than defaults:
--
--   * `alias_normalised` is STORED, not derived on read. It must be the exact string
--     `normaliseGearText()` in `src/lib/gearListParser.ts` produces, or a saved alias
--     would never match the paste that created it and the whole promise â€” "the next paste
--     matches better" â€” would be a lie. `src/lib/__tests__/gearListParser.test.ts` pins
--     both sides of that contract; `product_aliases_normalised_is_lower` catches a client
--     that sends an unfolded string.
--   * One spelling points at exactly ONE product (`product_aliases_one_spelling`). If two
--     products could hold "fx3", every future paste would resolve to two exact hits and
--     the matcher would have to ask forever. A correction therefore MOVES the spelling
--     (the RPC upserts on `alias_normalised`), which is also what "latest correction
--     wins" means to the person who made it.
--   * **There is no delete.** A wrong alias is retired with `is_active = false` (Law 3);
--     `delete` is revoked from every role below.
--   * Roles are exactly `rental.create`'s set â€” Owner Â· Admin Â· Manager Â· Coordinator Â·
--     Warehouse (PERMISSIONS Â§4.1). The people who build bookings are the people who
--     correct matches; nothing here is wider than the booking write those five already
--     hold (N-3, B-1 â€” stricter wins).
--   * **No money column, by construction.** An alias is text on a product name, so no
--     Law 6 mask is needed and a money-blind role cannot be leaked a figure through it.
--   * Every write carries `client_uuid` (Law 8) and the table carries the audit trigger,
--     so the database row is the audit of record (PLAN Â§4.36).
--
-- REVERT: drop trigger if exists trg_audit_product_aliases on public.product_aliases;
--         drop function if exists public.remember_product_alias(uuid, text, text, uuid);
--         drop table if exists public.product_aliases;

begin;

create table if not exists public.product_aliases (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete restrict,
  -- The spelling exactly as staff typed it â€” shown back to them, never matched on.
  alias            text not null,
  -- The comparison key. See the header: this is `normaliseGearText(alias)`.
  alias_normalised text not null,
  -- Law 3: a wrong alias is retired, never deleted.
  is_active        boolean not null default true,
  -- Law 8: idempotency key, so a retried save cannot create a second row.
  client_uuid      uuid not null unique,
  created_by       uuid references public.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint product_aliases_alias_length
    check (char_length(btrim(alias)) between 1 and 120),
  constraint product_aliases_normalised_length
    check (char_length(btrim(alias_normalised)) between 1 and 120),
  constraint product_aliases_normalised_is_lower
    check (alias_normalised = lower(alias_normalised)),
  constraint product_aliases_one_spelling
    unique (alias_normalised)
);

comment on table public.product_aliases is
  'Spellings staff taught the paste-list matcher (T3-12). One spelling maps to one product; a correction moves it. Retired with is_active = false, never deleted (Law 3). No money column (Law 6).';
comment on column public.product_aliases.alias is
  'The alias as the staff member typed it, for display. Not used for matching.';
comment on column public.product_aliases.alias_normalised is
  'normaliseGearText(alias) from src/lib/gearListParser.ts. The matcher compares against this, so the two implementations must not drift.';
comment on column public.product_aliases.is_active is
  'False retires the alias from matching without deleting it (Law 3).';

create index if not exists product_aliases_product_idx
  on public.product_aliases (product_id);
-- The matcher's only read: every active spelling. Partial, so retired rows cost nothing.
create index if not exists product_aliases_active_idx
  on public.product_aliases (alias_normalised) where is_active;
create index if not exists product_aliases_client_uuid_idx
  on public.product_aliases (client_uuid);

alter table public.product_aliases enable row level security;

-- 3. Policies â€” the five booking-building roles, and nobody else.
drop policy if exists product_aliases_select on public.product_aliases;
create policy product_aliases_select on public.product_aliases
for select to authenticated
using (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
);

drop policy if exists product_aliases_insert on public.product_aliases;
create policy product_aliases_insert on public.product_aliases
for insert to authenticated
with check (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
  and created_by = public.auth_user_id()
);

-- Updating is how a spelling is corrected or retired; the row is never removed.
drop policy if exists product_aliases_update on public.product_aliases;
create policy product_aliases_update on public.product_aliases
for update to authenticated
using (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
)
with check (
  public.auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')
);

-- 4. Grants. RLS above narrows the rows; these narrow the verbs. No delete, ever.
revoke all on public.product_aliases from anon;
revoke delete on public.product_aliases from public, anon, authenticated;
grant select, insert, update on public.product_aliases to authenticated;

-- 5. The audit trigger. The database row is the audit of record (PLAN Â§4.36).
drop trigger if exists trg_audit_product_aliases on public.product_aliases;
create trigger trg_audit_product_aliases
after insert or update on public.product_aliases
for each row execute function public.log_audit_event_actor();

-- 6. The one write path. Doing this client-side would need a read-then-write that two
--    tabs could interleave, and it would leave the role check to the UI.
create or replace function public.remember_product_alias(
  p_product_id       uuid,
  p_alias            text,
  p_alias_normalised text,
  p_client_uuid      uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := public.auth_user_id();
  v_role   text := public.auth_user_role();
  v_alias  text := btrim(coalesce(p_alias, ''));
  v_norm   text := btrim(coalesce(p_alias_normalised, ''));
  v_id     uuid;
begin
  -- Fail closed, in the database rather than only in the UI (N-3, B-1).
  if v_actor is null then
    raise insufficient_privilege using message = 'Authenticated session required';
  end if;
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse') then
    raise insufficient_privilege using message = 'Your role cannot save a gear-list alias';
  end if;

  if v_alias = '' or v_norm = '' then
    raise exception 'An alias cannot be blank' using errcode = '22000';
  end if;
  if char_length(v_alias) > 120 or char_length(v_norm) > 120 then
    raise exception 'An alias cannot exceed 120 characters' using errcode = '22000';
  end if;
  -- The stored key must already be normalised; a caller that skips normaliseGearText()
  -- would otherwise store a spelling the matcher can never produce.
  if v_norm <> lower(v_norm) then
    raise exception 'The alias key must be lower-case (pass normaliseGearText(alias))'
      using errcode = '22000';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'That product does not exist' using errcode = '23503';
  end if;

  -- Law 8: the same client_uuid is the same write, whatever happened to the response.
  select id into v_id from public.product_aliases where client_uuid = p_client_uuid;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.product_aliases (product_id, alias, alias_normalised, client_uuid, created_by)
  values (p_product_id, v_alias, v_norm, p_client_uuid, v_actor)
  on conflict (alias_normalised) do update
    set product_id = excluded.product_id,
        alias      = excluded.alias,
        is_active  = true,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.remember_product_alias(uuid, text, text, uuid) is
  'Remember a spelling staff corrected a paste-list match to (T3-12). Upserts on the normalised key so a correction moves the spelling; idempotent on client_uuid (Law 8). Owner/Admin/Manager/Coordinator/Warehouse only.';

revoke all on function public.remember_product_alias(uuid, text, text, uuid) from public, anon;
grant execute on function public.remember_product_alias(uuid, text, text, uuid) to authenticated;

commit;
