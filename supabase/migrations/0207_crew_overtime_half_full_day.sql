-- 0207_crew_overtime_half_full_day.sql
-- Crew overtime: half or full day (Ruling D24, Task T8-06)
-- 1. Add overtime_days column to crew_assignments (numeric, allows 0.5 increments)
-- 2. Add overtime_approved_by column to track who approved the overtime
-- 3. Add overtime_fraction to crew_shoot_days
-- 4. Grant column permissions to authenticated role and update crew_assignments_v
-- 5. The overtime is calculated at the day rate for both client bill and crew payout

begin;

-- 1. Add overtime_days to crew_assignments
alter table public.crew_assignments
  add column if not exists overtime_days numeric(3,1) not null default 0
    check (overtime_days >= 0 and overtime_days % 0.5 = 0),
  add column if not exists overtime_approved_by uuid references public.users(id);

-- 2. Add overtime_fraction to crew_shoot_days
alter table public.crew_shoot_days
  add column if not exists overtime_fraction numeric(3,1) not null default 0
    check (overtime_fraction in (0, 0.5, 1.0));

-- 3. Grant INSERT and column SELECT on crew_assignments to authenticated role
grant insert on public.crew_assignments to authenticated;
grant select (overtime_days, overtime_approved_by) on public.crew_assignments to authenticated;

-- Ensure RLS is enabled on crew_assignments
alter table public.crew_assignments enable row level security;

-- 4. Update crew_assignments_v to include overtime_days and overtime_approved_by
-- (renumbered 0186 -> 0207 on 2 Nov 2026: 0199_tds_on_crew_payouts now runs first and already
-- extended this view with the payout/TDS columns, so they are kept here and the two overtime
-- columns are appended after them. create or replace view cannot drop columns.)
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
  paid_by,
  overtime_days,
  overtime_approved_by
from public.crew_assignments
where auth_is_staff();

grant select on public.crew_assignments_v to authenticated;

-- 5. Add index for overtime_approved_by
create index if not exists idx_crew_assignments_overtime_approved_by
  on public.crew_assignments (overtime_approved_by) where overtime_approved_by is not null;

-- 6. Add comments
comment on column public.crew_assignments.overtime_days is
  'Overtime in days (0.5 or 1.0 increments). Calculated at day_rate for both client bill and crew payout. D24.';
comment on column public.crew_assignments.overtime_approved_by is
  'User who approved the overtime. Required when overtime_days > 0.';
comment on column public.crew_shoot_days.overtime_fraction is
  'Overtime fraction per shoot day (0, 0.5, or 1.0 day). Billed to client and paid to crew member. D24.';

commit;
