begin;

-- ===========================================================================
-- T2-19: Signature at Return when damage or missing gear is found (B19, R-39)
--
-- At Return, when at least one unit is flagged damaged or missing, the person
-- returning the gear must sign once under the list of flagged items before Return
-- can complete (gate.return.damage_unsigned).
-- With no flags, no signature is asked (R-39).
-- If the person will not sign, staff tick "Refused to sign" with a reason of at
-- least 10 characters (audited, allowing Return to complete without stalling the floor).
-- ===========================================================================

-- 1. Add signature refusal tracking columns to operation_sessions
alter table public.operation_sessions
  add column if not exists signature_refused boolean not null default false,
  add column if not exists signature_refusal_reason text;

alter table public.operation_sessions
  drop constraint if exists operation_sessions_signature_refusal_check;

alter table public.operation_sessions
  add constraint operation_sessions_signature_refusal_check
  check (
    signature_refused = false
    or (signature_refusal_reason is not null and length(trim(signature_refusal_reason)) >= 10)
  );

-- 2. Trigger function to enforce gate.return.damage_unsigned
create or replace function public.require_return_damage_signature()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return_session_id uuid;
  v_signature_refused boolean := false;
  v_signature_refusal_reason text := null;
begin
  if tg_table_name = 'operation_sessions' then
    if new.operation <> 'Return' or new.state <> 'Completed'
      or old.state is not distinct from new.state then
      return new;
    end if;
    v_return_session_id := new.id;
    v_signature_refused := coalesce(new.signature_refused, false);
    v_signature_refusal_reason := new.signature_refusal_reason;
  else
    -- booking_stage_transitions
    if new.to_stage <> 'Returned' or new.from_stage is distinct from 'On Rent' then
      return new;
    end if;
    select session.id, coalesce(session.signature_refused, false), session.signature_refusal_reason
    into v_return_session_id, v_signature_refused, v_signature_refusal_reason
    from public.operation_sessions session
    where session.booking_id = new.booking_id and session.operation = 'Return'
      and session.state in ('In Progress', 'Completed')
    order by session.created_at desc
    limit 1;
    if v_return_session_id is null then
      return new; -- gate.return.session_missing handles this
    end if;
  end if;

  -- Check if any unit or line is flagged damaged or missing in this return session
  if exists (
    select 1
    from public.damage_findings finding
    join public.return_lines receipt on receipt.id = finding.return_line_id
    where receipt.session_id = v_return_session_id and finding.voided_at is null
    union
    select 1
    from public.booking_line_units unit
    where unit.return_session_id = v_return_session_id
      and unit.unit_state in ('Damaged', 'Missing')
    union
    select 1
    from public.return_lines receipt
    where receipt.session_id = v_return_session_id
      and (receipt.state = 'Not Returned' or receipt.condition in ('Damaged', 'Lost'))
  ) then
    -- A flagged return requires either a returning person signature or a recorded refusal (reason >= 10 chars)
    if not (
      (v_signature_refused = true and v_signature_refusal_reason is not null and length(trim(v_signature_refusal_reason)) >= 10)
      or exists (
        select 1
        from public.signatures sig
        where sig.session_id = v_return_session_id
          and sig.signature_role = 'Returning person'
      )
    ) then
      raise exception 'GATE:gate.return.damage_unsigned|A Return with flagged items requires the returning person signature or a recorded refusal (≥10 chars).'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.require_return_damage_signature() from public, anon, authenticated;

drop trigger if exists trg_return_damage_signature on public.operation_sessions;
create trigger trg_return_damage_signature
before update of state on public.operation_sessions
for each row execute function public.require_return_damage_signature();

-- The floor action advances the booking before sealing the session.
drop trigger if exists aab_return_damage_signature on public.booking_stage_transitions;
create trigger aab_return_damage_signature
before insert on public.booking_stage_transitions
for each row execute function public.require_return_damage_signature();

commit;
