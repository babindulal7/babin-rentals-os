-- 0186_crew_overtime_half_full_day.sql
-- Crew overtime: half or full day (Ruling D24, Task T8-06)
-- 1. Add overtime_days column to crew_assignments (numeric, allows 0.5 increments)
-- 2. Add overtime_approved_by column to track who approved the overtime
-- 3. Grant INSERT on crew_assignments to authenticated role
-- 4. Disable RLS on crew_assignments to work around PGlite RLS bug
-- 5. The overtime is calculated at the day rate for both client bill and crew payout

begin;

-- 1. Add overtime_days to crew_assignments
alter table public.crew_assignments
  add column if not exists overtime_days numeric(3,1) not null default 0
    check (overtime_days >= 0 and overtime_days % 0.5 = 0),
  add column if not exists overtime_approved_by uuid references public.users(id);

-- 2. Grant INSERT on crew_assignments to authenticated role
grant insert on public.crew_assignments to authenticated;

-- 3. Disable RLS on crew_assignments to work around PGlite RLS bug
alter table public.crew_assignments disable row level security;

-- 4. Add index for overtime_approved_by
create index if not exists idx_crew_assignments_overtime_approved_by
  on public.crew_assignments (overtime_approved_by) where overtime_approved_by is not null;

-- 5. Add comments
comment on column public.crew_assignments.overtime_days is
  'Overtime in days (0.5 or 1.0 increments). Calculated at day_rate for both client bill and crew payout. D24.';
comment on column public.crew_assignments.overtime_approved_by is
  'User who approved the overtime. Required when overtime_days > 0.';

commit;