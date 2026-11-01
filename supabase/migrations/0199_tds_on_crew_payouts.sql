-- 0199_tds_on_crew_payouts.sql
-- TDS on crew payouts (Ruling D25, Task T8-08)
-- 1. Add TDS and payout tracking columns to public.crew_bookings and public.crew_assignments:
--    tds_rate_percent (0..100), tds_amount (>=0), net_payout (>=0), paid_at, paid_by, payout_notes
-- 2. Store TDS figures on payouts immutably so later rate changes never alter past payouts.
-- 3. Law 6: column-level money masking in views (crew_bookings_v, crew_assignments_v) via auth_can_view_money().
-- 4. RPC record_crew_payout(...) gated to money roles: Owner, Admin, Manager, Accounts (PERMISSIONS §5).
-- 5. Attach audit triggers to crew_bookings and crew_assignments.

begin;

-- 1. Add columns to public.crew_bookings
alter table public.crew_bookings
  add column if not exists payout_client_uuid uuid,
  add column if not exists tds_rate_percent numeric(5,2) check (tds_rate_percent is null or (tds_rate_percent >= 0 and tds_rate_percent <= 100)),
  add column if not exists tds_amount numeric(14,2) check (tds_amount is null or tds_amount >= 0),
  add column if not exists net_payout numeric(14,2) check (net_payout is null or net_payout >= 0),
  add column if not exists payout_notes text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.users(id);

-- 2. Add columns to public.crew_assignments
alter table public.crew_assignments
  add column if not exists payout_client_uuid uuid,
  add column if not exists tds_rate_percent numeric(5,2) check (tds_rate_percent is null or (tds_rate_percent >= 0 and tds_rate_percent <= 100)),
  add column if not exists tds_amount numeric(14,2) check (tds_amount is null or tds_amount >= 0),
  add column if not exists net_payout numeric(14,2) check (net_payout is null or net_payout >= 0),
  add column if not exists payout_status text not null default 'Not due' check (payout_status in ('Not due', 'Due', 'Paid')),
  add column if not exists payout_notes text,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.users(id);

-- 3. Column permissions: authenticated role needs select on non-money and money columns
grant select (payout_client_uuid, tds_rate_percent, tds_amount, net_payout, payout_notes, paid_at, paid_by) on public.crew_bookings to authenticated;
grant select (payout_client_uuid, tds_rate_percent, tds_amount, net_payout, payout_status, payout_notes, paid_at, paid_by) on public.crew_assignments to authenticated;

-- 4. Update crew_bookings_v with Law 6 masking (new columns appended at end to preserve column positions)
create or replace view public.crew_bookings_v as
select
  id,
  client_uuid,
  crew_booking_no,
  production_id,
  booking_id,
  crew_member_id,
  "position",
  case when auth_can_view_money() then day_rate else null::numeric end as day_rate,
  days,
  start_date,
  end_date,
  location,
  state,
  payout_state,
  conflict_override_by,
  conflict_override_reason,
  conflict_override_at,
  travel_warning_acknowledged_by,
  travel_warning_acknowledged_at,
  cancelled_at,
  cancel_reason,
  created_by,
  created_at,
  updated_at,
  case when auth_can_view_money() then tds_rate_percent else null::numeric end as tds_rate_percent,
  case when auth_can_view_money() then tds_amount else null::numeric end as tds_amount,
  case when auth_can_view_money() then net_payout else null::numeric end as net_payout,
  case when auth_can_view_money() then payout_notes else null::text end as payout_notes,
  paid_at,
  paid_by
from public.crew_bookings
where auth_is_staff();

grant select on public.crew_bookings_v to authenticated;

-- 5. Update crew_assignments_v with Law 6 masking (new columns appended at end to preserve column positions)
create or replace view public.crew_assignments_v as
select
  id,
  client_uuid,
  booking_id,
  crew_id,
  role_on_shoot,
  call_time,
  wrap_time,
  case when auth_can_view_money() then daily_rate else null::numeric end as daily_rate,
  days,
  case when auth_can_view_money() then line_total else null::numeric end as line_total,
  notes,
  created_at,
  created_by,
  updated_at,
  updated_by,
  payout_status,
  case when auth_can_view_money() then tds_rate_percent else null::numeric end as tds_rate_percent,
  case when auth_can_view_money() then tds_amount else null::numeric end as tds_amount,
  case when auth_can_view_money() then net_payout else null::numeric end as net_payout,
  case when auth_can_view_money() then payout_notes else null::text end as payout_notes,
  paid_at,
  paid_by
from public.crew_assignments
where auth_is_staff();

grant select on public.crew_assignments_v to authenticated;

-- 6. Audit trigger on crew_bookings
drop trigger if exists trg_audit_crew_bookings on public.crew_bookings;
create trigger trg_audit_crew_bookings after insert or update on public.crew_bookings
  for each row execute function public.log_audit_event_actor();

-- 7. Audit trigger on crew_assignments
drop trigger if exists trg_audit_crew_assignments on public.crew_assignments;
create trigger trg_audit_crew_assignments after insert or update on public.crew_assignments
  for each row execute function public.log_audit_event_actor();

-- 8. RPC: record_crew_payout
create or replace function public.record_crew_payout(
  p_client_uuid uuid,
  p_crew_booking_id uuid,
  p_tds_rate_percent numeric default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_gross numeric;
  v_tds numeric;
  v_net numeric;
  v_actor uuid;
  v_role text;
begin
  -- Permissions check: Owner, Admin, Manager, Accounts only (PERMISSIONS §5)
  v_role := auth_user_role()::text;
  if v_role is null or v_role not in ('Owner', 'Admin', 'Manager', 'Accounts') then
    raise exception 'Access denied: crew payouts are restricted to money roles (Owner, Admin, Manager, Accounts)';
  end if;

  v_actor := auth_user_id();

  select * into v_booking
  from public.crew_bookings
  where id = p_crew_booking_id;

  if not found then
    raise exception 'Crew booking not found: %', p_crew_booking_id;
  end if;

  -- Idempotency check via payout_client_uuid
  if v_booking.payout_client_uuid = p_client_uuid and v_booking.payout_state = 'Paid' then
    return jsonb_build_object(
      'ok', true,
      'crew_booking_id', v_booking.id,
      'payout_state', v_booking.payout_state,
      'gross', v_booking.day_rate * v_booking.days,
      'tds_rate_percent', v_booking.tds_rate_percent,
      'tds_amount', v_booking.tds_amount,
      'net_payout', v_booking.net_payout,
      'idempotent_replay', true
    );
  end if;

  v_gross := round(coalesce(v_booking.day_rate, 0) * coalesce(v_booking.days, 1), 2);

  if p_tds_rate_percent is not null then
    if p_tds_rate_percent < 0 or p_tds_rate_percent > 100 then
      raise exception 'TDS rate must be between 0 and 100 percent, received: %', p_tds_rate_percent;
    end if;
    v_tds := round(v_gross * (p_tds_rate_percent / 100.0), 2);
    v_net := v_gross - v_tds;
  else
    v_tds := null;
    v_net := v_gross;
  end if;

  update public.crew_bookings
  set payout_state = 'Paid',
      payout_client_uuid = p_client_uuid,
      tds_rate_percent = p_tds_rate_percent,
      tds_amount = v_tds,
      net_payout = v_net,
      payout_notes = coalesce(p_notes, payout_notes),
      paid_at = now(),
      paid_by = v_actor,
      updated_at = now()
  where id = p_crew_booking_id;

  return jsonb_build_object(
    'ok', true,
    'crew_booking_id', v_booking.id,
    'payout_state', 'Paid',
    'gross', v_gross,
    'tds_rate_percent', p_tds_rate_percent,
    'tds_amount', v_tds,
    'net_payout', v_net
  );
end;
$$;

revoke all on function public.record_crew_payout(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_crew_payout(uuid, uuid, numeric, text) to authenticated;

-- Comments
comment on column public.crew_bookings.tds_rate_percent is 'TDS rate snapshot applied at payout. D25 / O-5.';
comment on column public.crew_bookings.tds_amount is 'Tax deducted at source amount in NPR (stored snapshot). D25.';
comment on column public.crew_bookings.net_payout is 'Net amount payable after TDS deduction. D25.';
comment on column public.crew_assignments.tds_rate_percent is 'TDS rate snapshot applied at payout. D25 / O-5.';
comment on column public.crew_assignments.tds_amount is 'Tax deducted at source amount in NPR (stored snapshot). D25.';
comment on column public.crew_assignments.net_payout is 'Net amount payable after TDS deduction. D25.';

commit;
