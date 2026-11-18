-- =============================================================================
-- 0251 — Waiting charge added after the trip (S2 row 6).
--
-- RULING 2026-11-19 (Babin, interview): waiting beyond the included 10 minutes is NOT priced at booking.
-- Staff add it after the trip as its own line on the booking. Who may add it (same interview): Owner,
-- Admin, Manager, Coordinator.
--
-- Written and tested locally only. NOT APPLIED to the live project (N-5).
--
-- Decisions taken here (B-1 stricter; routine engineering, flagged in PROGRESS and OPEN_DECISIONS §23):
--   · The amount is typed by the person adding it. No rate, per-minute figure or block size is invented.
--   · It is an ordinary flat Service line on the booking (service_basis 'Flat', qty 1, days 1), so it
--     bills like any service line: create_invoice snapshots it when the Draft is created.
--   · If the booking already has a DRAFT invoice the line is appended to it (SPEC-P0-1 R-02/R-03: extra
--     charges append to the one Draft; the totals trigger recalculates). If it has none, the line waits
--     on the booking for create_invoice.
--   · If the booking's invoice is already ISSUED, this REFUSES, in words. R-03 is one invoice per rental
--     and "corrections after issue are Void + Credit Note". Babin answered (19 Nov) that an issued
--     invoice should get a separate invoice for the extra charge; that conflicts with R-03 and with the
--     close gates, which read one invoice's outstanding amount, so it is NOT built here. It is recorded
--     as TODO(decision) in OPEN_DECISIONS §23 for Babin to confirm, with the hazard named.
--   · The caller must see money (Law 6), is branch-limited unless Owner or Admin, and the booking must
--     be active (not cancelled, returned or closed), like add_consumable_line (0239).
--   · Audit: a conditional trigger runs the existing log_audit_event() (0010) for waiting-charge lines
--     only, so the amount, the minutes and the person are in audit_events without auditing every line.
--   · Idempotent on booking_lines.client_uuid (Law 8): a retry returns the same line.
-- =============================================================================

create or replace function public.add_waiting_charge_line(
  p_client_uuid  uuid,
  p_booking_id   uuid,
  p_minutes      integer,
  p_amount_paisa bigint,
  p_note         text default null
)
returns table (line_id uuid, invoice_id uuid, appended_to_draft boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := auth.uid();
  v_role     text := auth_user_role();
  v_branch   uuid;
  v_booking  public.bookings%rowtype;
  v_invoice  record;
  v_rupees   numeric(14, 2);
  v_desc     text;
  v_line_id  uuid;
  v_existing uuid;
  v_has_invoice boolean;
begin
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Coordinator') then
    raise insufficient_privilege using message = 'Only Owner, Admin, Manager or Coordinator may add a waiting charge';
  end if;
  if not auth_can_view_money() then
    raise insufficient_privilege using message = 'A waiting charge is a money figure; this role cannot see money (Law 6)';
  end if;
  if p_client_uuid is null then
    raise exception 'A client_uuid is required (Law 8)' using errcode = 'null_value_not_allowed';
  end if;
  if p_minutes is null or p_minutes <= 0 or p_minutes > 1440 then
    raise exception 'Enter the minutes waited (1 to 1440)' using errcode = 'check_violation';
  end if;
  if p_amount_paisa is null or p_amount_paisa <= 0 then
    raise exception 'The waiting charge must be more than 0' using errcode = 'check_violation';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'No booking to add a waiting charge to' using errcode = 'P0002';
  end if;
  if v_booking.cancelled_at is not null or v_booking.stage in ('Returned', 'Closed') then
    raise exception 'Cannot add a waiting charge to a cancelled, returned or closed booking' using errcode = 'P0002';
  end if;

  if v_role not in ('Owner', 'Admin') then
    select u.branch_id into v_branch from public.users u where u.id = v_actor and u.is_active;
    if v_branch is distinct from v_booking.branch_id then
      raise insufficient_privilege using message = 'Waiting charge branch access denied';
    end if;
  end if;

  -- Law 8: a retry of the same press returns the same line and writes nothing.
  select bl.id into v_existing from public.booking_lines bl where bl.client_uuid = p_client_uuid;
  if found then
    return query
      select v_existing,
             (select i.id from public.invoices i where i.booking_id = p_booking_id and i.status = 'Draft' limit 1),
             exists (select 1 from public.invoices i where i.booking_id = p_booking_id and i.status = 'Draft');
    return;
  end if;

  -- R-03: one invoice per rental. A Draft takes the line; an issued invoice is not edited.
  select i.id, i.status::text as status, i.invoice_no into v_invoice
    from public.invoices i
   where i.booking_id = p_booking_id and i.status <> 'Void'
   order by i.created_at desc
   limit 1;
  v_has_invoice := found;
  if v_has_invoice and v_invoice.status <> 'Draft' then
    raise exception
      'This booking''s invoice (%) is already issued (%). A waiting charge cannot be added to an issued invoice: corrections after issue are Void + Credit Note (R-03). Nothing was added.',
      coalesce(v_invoice.invoice_no, 'unnumbered'), v_invoice.status
      using errcode = 'P0001';
  end if;

  v_rupees := (p_amount_paisa / 100.0)::numeric(14, 2);
  v_desc   := 'Waiting charge (' || p_minutes || ' min)';

  insert into public.booking_lines (
    client_uuid, booking_id, line_type, description, qty, days, rate, discount_amount, line_total,
    service_basis, line_note, price_breakdown, created_by
  ) values (
    p_client_uuid, p_booking_id, 'Service', v_desc, 1, 1, v_rupees, 0, v_rupees,
    'Flat', nullif(btrim(p_note), ''),
    jsonb_build_object('kind', 'waiting_charge', 'minutes', p_minutes, 'amount_paisa', p_amount_paisa),
    v_actor
  ) returning id into v_line_id;

  if v_has_invoice and v_invoice.status = 'Draft' then
    insert into public.invoice_lines (
      client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total,
      discount_percent, sort_order
    ) values (
      gen_random_uuid(), v_invoice.id, 'Services'::line_kind, v_desc, 1, 1, v_rupees, v_rupees, 0, 100
    );
    return query select v_line_id, v_invoice.id, true;
  else
    return query select v_line_id, null::uuid, false;
  end if;
end;
$$;

comment on function public.add_waiting_charge_line(uuid, uuid, integer, bigint, text) is
  'RULING 2026-11-19 (S2 row 6): add a flat waiting-charge Service line to an active booking, typed by '
  'Owner, Admin, Manager or Coordinator who can see money (branch-limited except Owner and Admin). '
  'Appended to the booking''s Draft invoice if one exists; refused in words if the invoice is issued (R-03). '
  'Idempotent on client_uuid. Returns the line, the invoice appended to and whether it was appended.';

revoke all on function public.add_waiting_charge_line(uuid, uuid, integer, bigint, text) from public, anon;
grant execute on function public.add_waiting_charge_line(uuid, uuid, integer, bigint, text) to authenticated;

-- Audit: only waiting-charge lines, through the existing universal logger (0010).
drop trigger if exists trg_audit_booking_waiting_charge on public.booking_lines;
create trigger trg_audit_booking_waiting_charge
  after insert on public.booking_lines
  for each row
  when (new.price_breakdown ->> 'kind' = 'waiting_charge')
  execute function log_audit_event();

-- ---- Post-conditions ---------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'add_waiting_charge_line') then
    raise exception '0251 post-condition failed: add_waiting_charge_line missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_audit_booking_waiting_charge') then
    raise exception '0251 post-condition failed: audit trigger missing';
  end if;
end
$$;
