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

create function public.change_client_membership(p_payload jsonb) returns jsonb
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
