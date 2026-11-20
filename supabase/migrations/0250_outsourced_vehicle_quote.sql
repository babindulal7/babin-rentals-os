-- =============================================================================
-- 0250 — Outsourced vehicle: manual quote with an approval note (S2 row 8).
--
-- RULING 2026-11-19 (Babin, interview): an outsourced vehicle is handled by a MANUAL QUOTE WITH AN
-- APPROVAL NOTE. Staff type the quoted charge and mark the vehicle outsourced; the booking records who
-- approved it, and it goes in the audit log. RULINGS-2026-11-19 S2 row 8.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; routine engineering, flagged in PROGRESS):
--   · The approver is the signed-in person who records the quote (auth.uid()), never a value the
--     caller supplies. The approval note is their own words.
--   · Own table, append-only (Law 3): a changed quote is a NEW row, the latest is the live one. Nothing
--     is edited or deleted, even by a privileged role (trigger).
--   · Writers are Owner, Admin, Manager, Coordinator (the set that may choose a delivery zone, 0246),
--     and the caller must be able to see money (Law 6: a quote is a money figure). Branch-limited
--     for everyone except Owner and Admin, like 0246.
--   · Read by money-visible roles only. Warehouse, Technician, Driver and Client never see it.
--   · Audit: the existing log_audit_event() trigger (0010) on insert, so the record, the amount, the
--     approver and the time are in audit_events with no extra code.
--   · Idempotent: unique (booking_id, client_uuid), so a retried submit repeats safely.
--   · No amount, vendor or note is invented here; the quote is whatever staff typed.
-- =============================================================================

create table if not exists public.booking_outsourced_vehicle_quotes (
  id            uuid        not null primary key default gen_random_uuid(),
  client_uuid   uuid        not null,
  booking_id    uuid        not null references public.bookings (id),
  vendor        text        not null
                constraint booking_outsourced_vehicle_quotes_vendor_len
                check (char_length(btrim(vendor)) between 1 and 120),
  quote_paisa   bigint      not null
                constraint booking_outsourced_vehicle_quotes_quote_pos check (quote_paisa > 0),
  approval_note text        not null
                constraint booking_outsourced_vehicle_quotes_note_len
                check (char_length(btrim(approval_note)) between 1 and 500),
  approved_by   uuid        not null references public.users (id),
  approved_at   timestamptz not null default now(),
  constraint booking_outsourced_vehicle_quotes_idem unique (booking_id, client_uuid)
);

comment on table public.booking_outsourced_vehicle_quotes is
  'RULING 2026-11-19 (S2 row 8): a manual quote for an outsourced vehicle, with the approver''s note. '
  'Append-only (Law 3); the latest row for a booking is the live quote. Written only through '
  'record_outsourced_vehicle_quote(). Read by money-visible roles.';

create index if not exists booking_outsourced_vehicle_quotes_booking_idx
  on public.booking_outsourced_vehicle_quotes (booking_id, approved_at desc);

alter table public.booking_outsourced_vehicle_quotes enable row level security;

drop policy if exists booking_outsourced_vehicle_quotes_read on public.booking_outsourced_vehicle_quotes;
create policy booking_outsourced_vehicle_quotes_read on public.booking_outsourced_vehicle_quotes
  for select
  to authenticated
  using (auth_can_view_money());

revoke insert, update, delete on public.booking_outsourced_vehicle_quotes from anon, authenticated;

-- Law 3: never edited, never deleted, even by a privileged role.
create or replace function public.forbid_outsourced_vehicle_quote_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Law 3: an outsourced vehicle quote is never edited or deleted; record a new quote instead'
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function public.forbid_outsourced_vehicle_quote_change() from public, anon, authenticated;

drop trigger if exists trg_outsourced_vehicle_quote_immutable on public.booking_outsourced_vehicle_quotes;
create trigger trg_outsourced_vehicle_quote_immutable
  before update or delete on public.booking_outsourced_vehicle_quotes
  for each row execute function public.forbid_outsourced_vehicle_quote_change();

drop trigger if exists trg_audit_booking_outsourced_vehicle_quotes on public.booking_outsourced_vehicle_quotes;
create trigger trg_audit_booking_outsourced_vehicle_quotes
  after insert on public.booking_outsourced_vehicle_quotes
  for each row execute function log_audit_event();

create or replace function public.record_outsourced_vehicle_quote(
  p_client_uuid   uuid,
  p_booking_id    uuid,
  p_vendor        text,
  p_quote_paisa   bigint,
  p_approval_note text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    text := auth_user_role();
  v_branch  uuid;
  v_booking public.bookings%rowtype;
begin
  if v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise insufficient_privilege using message = 'Only Owner, Admin, Manager or Coordinator may record an outsourced vehicle quote';
  end if;
  if not auth_can_view_money() then
    raise insufficient_privilege using message = 'An outsourced vehicle quote is a money figure; this role cannot see money (Law 6)';
  end if;
  if p_client_uuid is null then
    raise exception 'A client_uuid is required' using errcode = 'null_value_not_allowed';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.cancelled_at is not null then
    raise exception 'No active booking to record an outsourced vehicle quote on' using errcode = 'P0002';
  end if;

  if v_role not in ('Owner', 'Admin') then
    select u.branch_id into v_branch from public.users u where u.id = auth.uid() and u.is_active;
    if v_branch is distinct from v_booking.branch_id then
      raise insufficient_privilege using message = 'Outsourced vehicle quote branch access denied';
    end if;
  end if;

  if p_vendor is null or char_length(btrim(p_vendor)) not between 1 and 120 then
    raise exception 'Enter the vendor (1 to 120 characters)' using errcode = 'check_violation';
  end if;
  if p_quote_paisa is null or p_quote_paisa <= 0 then
    raise exception 'The quote must be more than 0' using errcode = 'check_violation';
  end if;
  if p_approval_note is null or char_length(btrim(p_approval_note)) not between 1 and 500 then
    raise exception 'Enter the approval note (1 to 500 characters)' using errcode = 'check_violation';
  end if;

  insert into public.booking_outsourced_vehicle_quotes
    (client_uuid, booking_id, vendor, quote_paisa, approval_note, approved_by, approved_at)
  values
    (p_client_uuid, p_booking_id, btrim(p_vendor), p_quote_paisa, btrim(p_approval_note), auth.uid(), now())
  on conflict (booking_id, client_uuid) do nothing;

  return true;
end;
$$;

comment on function public.record_outsourced_vehicle_quote(uuid, uuid, text, bigint, text) is
  'RULING 2026-11-19 (S2 row 8): record a manual outsourced-vehicle quote with an approval note. The approver '
  'is the caller. Owner, Admin, Manager, Coordinator who can see money; branch-limited except Owner and Admin. '
  'Idempotent on (booking, client_uuid). Returns true.';

revoke all on function public.record_outsourced_vehicle_quote(uuid, uuid, text, bigint, text) from public, anon;
grant execute on function public.record_outsourced_vehicle_quote(uuid, uuid, text, bigint, text) to authenticated;

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_class c where c.relname = 'booking_outsourced_vehicle_quotes' and c.relrowsecurity) then
    raise exception '0250 post-condition failed: RLS not enabled on booking_outsourced_vehicle_quotes';
  end if;
  if not exists (select 1 from pg_proc where proname = 'record_outsourced_vehicle_quote') then
    raise exception '0250 post-condition failed: record_outsourced_vehicle_quote missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_booking_outsourced_vehicle_quotes') then
    raise exception '0250 post-condition failed: audit trigger missing';
  end if;
end
$$;
