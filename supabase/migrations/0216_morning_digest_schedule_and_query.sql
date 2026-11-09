-- Migration 0216: Morning digest schedule and query (T5-04, Ruling O-4)
-- =============================================================================
-- Ruling O-4 (21 Jul lock): Auto morning digest scheduled at 05:30 NPT before
-- the 06:00 operational day start.
-- Emails each active staff member their digest:
--   - Today's pickups and returns (06:00 -> 06:00 NPT operational day)
--   - Overdue returns (On Rent past return_at)
--   - Open damage cases (damage_findings with approval_state = 'Pending Approval')
--   - Unacknowledged shift handovers (shift_handovers with status = 'pending')
--   - Payments due today (for money roles only: Owner, Admin, Manager, Coordinator, Accounts)
--
-- Law 6: Money blindness. Warehouse, Technician, Driver, and Client receive NO amounts.
-- Law 3: Nothing is deleted.
-- Check:pglite & check:lifecycle compliant (definer search path pinned, anon revoked).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Scheduled cron jobs registry
-- -----------------------------------------------------------------------------
create table if not exists public.cron_schedules (
  job_name      text not null primary key,
  schedule      text not null,
  command       text not null,
  description   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.cron_schedules is
  'Registry of scheduled jobs for verification across test and local environments (T5-04).';

insert into public.cron_schedules (job_name, schedule, command, description)
values (
  'morning-digest',
  '45 23 * * *', -- 05:30 NPT is 23:45 UTC
  'invoke morning-digest edge function',
  'Daily morning digest sent to active staff at 05:30 NPT before the 06:00 operational day start (O-4)'
)
on conflict (job_name) do update
set schedule = excluded.schedule,
    command = excluded.command,
    description = excluded.description,
    updated_at = now();

revoke all on public.cron_schedules from public, anon;
grant select on public.cron_schedules to authenticated;
alter table public.cron_schedules enable row level security;

create policy cron_schedules_staff_select on public.cron_schedules
  for select to authenticated using (auth_is_staff());

-- -----------------------------------------------------------------------------
-- 2. Register with pg_cron if extension namespace exists on instance
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      perform cron.unschedule('morning-digest') where exists (
        select 1 from cron.job where jobname = 'morning-digest'
      );
      perform cron.schedule(
        'morning-digest',
        '45 23 * * *',
        $cmd$select net.http_post(
          url := coalesce(current_setting('app.settings.edge_function_url', true), 'http://localhost:54321/functions/v1') || '/morning-digest',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
          )
        )$cmd$
      );
    exception when others then
      -- Environment lacks pg_cron execution permissions or net extension; ignore cleanly
      null;
    end;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Morning digest query function: get_morning_digest
-- -----------------------------------------------------------------------------
create or replace function public.get_morning_digest(
  p_user_id uuid,
  p_target_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user record;
  v_can_view_money boolean;
  v_npt_now timestamp;
  v_target_date date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pickups jsonb := '[]'::jsonb;
  v_returns jsonb := '[]'::jsonb;
  v_overdue jsonb := '[]'::jsonb;
  v_open_damage jsonb := '[]'::jsonb;
  v_shift_handovers jsonb := '[]'::jsonb;
  v_payments_due jsonb := '[]'::jsonb;
  v_total_items int := 0;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select
    u.id,
    u.full_name,
    u.email,
    u.primary_role::text
  into v_user
  from public.users u
  where u.id = p_user_id;

  if not found then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Law 6: Money blindness
  v_can_view_money := lower(coalesce(v_user.primary_role, '')) not in (
    'warehouse', 'technician', 'driver', 'client'
  );

  -- Determine operational day target date in Kathmandu timezone (+05:45)
  v_npt_now := (now() at time zone 'Asia/Kathmandu');
  v_target_date := coalesce(p_target_date, v_npt_now::date);

  -- Operational day window runs 06:00 NPT to 06:00 NPT next morning (D4, O-4)
  v_day_start := (v_target_date::text || ' 06:00:00+05:45')::timestamptz;
  v_day_end   := ((v_target_date + 1)::text || ' 05:59:59.999+05:45')::timestamptz;

  -- 1. Pickups scheduled today
  select coalesce(jsonb_agg(item order by (item->>'pickup_at')::timestamptz asc), '[]'::jsonb)
  into v_pickups
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'pickup_at', b.pickup_at,
      'pickup_time', to_char(b.pickup_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.pickup_at >= v_day_start
      and b.pickup_at <= v_day_end
      and b.stage in ('Booked', 'Packed')
      and b.cancelled_at is null
  ) q;

  -- 2. Returns scheduled today
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_returns
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'return_time', to_char(b.return_at at time zone 'Asia/Kathmandu', 'HH24:MI'),
      'delivery_type', b.delivery_type,
      'stage', b.stage
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at >= v_day_start
      and b.return_at <= v_day_end
      and b.stage in ('On Rent')
      and b.cancelled_at is null
      and b.actual_return_at is null
  ) q;

  -- 3. Overdue returns
  select coalesce(jsonb_agg(item order by (item->>'return_at')::timestamptz asc), '[]'::jsonb)
  into v_overdue
  from (
    select jsonb_build_object(
      'id', b.id,
      'booking_no', b.booking_no,
      'client_name', coalesce(c.name, 'Unknown Client'),
      'return_at', b.return_at,
      'days_overdue', greatest(1, extract(day from (v_day_start - b.return_at))::int),
      'delivery_type', b.delivery_type,
      'stage', b.stage
    ) as item
    from public.bookings b
    left join public.clients c on c.id = b.client_id
    where b.return_at < v_day_start
      and b.stage in ('On Rent')
      and b.cancelled_at is null
      and b.actual_return_at is null
  ) q;

  -- 4. Open damage findings
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_open_damage
  from (
    select jsonb_build_object(
      'id', df.id,
      'damage_type', df.damage_type,
      'severity', df.severity,
      'description', df.description,
      'approval_state', df.approval_state::text,
      'created_at', df.created_at,
      'estimated_cost_paisa', case when v_can_view_money then round(coalesce(df.estimated_cost, 0) * 100)::bigint else null end
    ) as item
    from public.damage_findings df
    where df.approval_state = 'Pending Approval'
      and df.voided_at is null
  ) q;

  -- 5. Pending shift handovers
  select coalesce(jsonb_agg(item order by (item->>'created_at')::timestamptz desc), '[]'::jsonb)
  into v_shift_handovers
  from (
    select jsonb_build_object(
      'id', sh.id,
      'shift_code', sh.shift_code,
      'shift_date', sh.shift_date,
      'from_user_name', sh.from_user_name,
      'notes', sh.notes,
      'status', sh.status,
      'created_at', sh.created_at
    ) as item
    from public.shift_handovers sh
    where sh.status = 'pending'
      and sh.archived_at is null
  ) q;

  -- 6. Payments due today (money roles only, Law 6)
  if v_can_view_money then
    select coalesce(jsonb_agg(item order by (item->>'due_date')::date asc), '[]'::jsonb)
    into v_payments_due
    from (
      select jsonb_build_object(
        'id', inv.id,
        'invoice_no', inv.invoice_no,
        'booking_id', inv.booking_id,
        'client_name', coalesce(c.name, 'Unknown Client'),
        'due_date', inv.due_date,
        'outstanding_paisa', round(coalesce(inv.outstanding_amount, 0) * 100)::bigint,
        'status', inv.status::text
      ) as item
      from public.invoices inv
      left join public.clients c on c.id = inv.client_id
      where inv.due_date = v_target_date
        and inv.status in ('Draft', 'Sent', 'Partially Paid')
        and inv.outstanding_amount > 0
        and inv.voided_at is null
    ) q;
  else
    v_payments_due := '[]'::jsonb;
  end if;

  v_total_items := jsonb_array_length(v_pickups) +
                   jsonb_array_length(v_returns) +
                   jsonb_array_length(v_overdue) +
                   jsonb_array_length(v_open_damage) +
                   jsonb_array_length(v_shift_handovers) +
                   jsonb_array_length(v_payments_due);

  return jsonb_build_object(
    'recipient', jsonb_build_object(
      'user_id', v_user.id,
      'full_name', v_user.full_name,
      'email', v_user.email,
      'role', v_user.primary_role
    ),
    'target_date', v_target_date,
    'operational_day_start', v_day_start,
    'operational_day_end', v_day_end,
    'can_view_money', v_can_view_money,
    'has_scheduled_items', (v_total_items > 0),
    'empty_message', case when v_total_items = 0 then 'Nothing scheduled today' else null end,
    'total_items_count', v_total_items,
    'pickups', v_pickups,
    'returns', v_returns,
    'overdue', v_overdue,
    'open_damage', v_open_damage,
    'shift_handovers', v_shift_handovers,
    'payments_due', v_payments_due
  );
end;
$$;

comment on function public.get_morning_digest(uuid, date) is
  'Aggregates daily operational movements, overdue returns, open damage cases, shift handovers, and payments due (O-4). Enforces Law 6 money blindness.';

revoke all on function public.get_morning_digest(uuid, date) from public, anon;
grant execute on function public.get_morning_digest(uuid, date) to authenticated;

commit;
