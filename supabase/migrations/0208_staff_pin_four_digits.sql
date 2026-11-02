-- =============================================================================
-- Migration 0208: staff PIN is FOUR digits — Babin's ruling, 28 October 2026.
--
-- The T1-15 card and ruling W53 say "tap name + 4-digit PIN". Migration 0066
-- shipped `^[0-9]{6}$`. This was logged as a TODO(decision) on 28 Oct
-- (OPEN_DECISIONS): keep 6 (stricter, B-1) or relax to 4. Babin answered
-- "4 pin" — an explicit owner instruction, which is exactly what relaxing a
-- shipped security parameter requires (CLAUDE.md §15.2).
--
-- The honest cost, stated rather than hidden: the space drops 100× (10^6 →
-- 10^4). The lockout carries the day: 5 consecutive wrong tries lock that
-- person for 15 minutes (0066), so a continuous attacker gets 5 tries per
-- quarter hour — an even-odds hit takes ~10.4 days of uninterrupted attempts
-- (5,000 tries × 3 min/try), and a guaranteed hit ~20.8 days. The weak-PIN
-- rules below (identical digits, sequential digits, last-4-of-mobile) remove
-- the guesses someone standing at a shared tablet actually makes first.
--
-- TRANSITION, tighten-on-write: `set_staff_pin` enforces exactly 4 from now
-- on; `verify_staff_pin` accepts 4 OR 6, because a hash already enrolled under
-- the old six-digit rule must keep verifying until its owner rotates it —
-- refusing it here would lock real staff out of their own sessions on a
-- format technicality. Follow-up (log it when the live roster has rotated):
-- a later migration tightens verify to 4-only.
--
-- No table or enum changes. Law 3 untouched: rotation is still revoke+insert.
-- Revert = drop this file's function definitions and restore 0066's bodies
-- (the two regexes and the weak-PIN literals are the only edits).
-- =============================================================================

begin;

-- ── set_staff_pin: enrol or rotate the CALLER'S OWN PIN — exactly 4 digits ──

create or replace function set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id  uuid := auth_user_id();
  v_mobile   text;
  v_rotating boolean;
  v_pw_at    bigint;
begin
  if v_user_id is null then
    raise exception 'A PIN can only be set by a signed-in staff session.';
  end if;

  /*
   * ── the freshness gate ────────────────────────────────────────────────────
   *
   * Minting a credential requires having proved identity RECENTLY, not merely
   * holding a session that proved it at some point.
   *
   * The attack this stops is mundane and is the likeliest one on this floor: an
   * unattended tablet with an hours-old session. Without this gate, anyone
   * walking past can silently add their OWN PIN to somebody else's account and
   * from then on re-open that session at will — a permanent credential minted
   * from a temporary opportunity, with the owner's name on every row it writes.
   *
   * ⚠ What this is NOT, and the spec for this feature got it wrong:
   *
   * The design asked that a PIN-unlocked session be forbidden from setting a
   * PIN. That is **not expressible here**, and the reason is structural: a PIN
   * unlock does not touch the JWT. `verify_staff_pin` returns a verdict, the
   * existing token is reused unchanged, and so a PIN-unlocked session presents
   * a token identical to the password sign-in that created it. The database
   * cannot tell them apart because there is nothing different to see.
   *
   * The freshness window is the honest approximation: it does not identify how
   * the curtain was opened, it bounds how long ago the password was typed. That
   * closes the unattended-tablet case, which is what the spec was reaching for.
   *
   * `amr` ("authentication methods references") is a GoTrue claim carrying one
   * entry per method used on this session with a unix timestamp — verified on
   * this project: {"aal":"aal1","amr":[{"method":"password","timestamp":...}]}.
   * Absent amr means this did not arrive as a GoTrue user request, so it is
   * refused rather than waved through: a service-role or psql caller is not a
   * staff member choosing their own PIN, and this function has no other purpose.
   */
  select max((entry ->> 'timestamp')::bigint)
    into v_pw_at
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
   where entry ->> 'method' = 'password';

  if v_pw_at is null or to_timestamp(v_pw_at) < now() - interval '15 minutes' then
    raise exception
      'For security, a PIN can only be set within 15 minutes of signing in with your password. Sign out and sign in again, then set the PIN.';
  end if;

  -- The staff row must exist and be active. An inactive identity does not get a
  -- fresh credential, and 0060's note is the reason this is checked here rather
  -- than assumed: an auth account can exist with no matching staff row at all.
  select mobile into v_mobile
    from users
   where id = v_user_id and is_active;

  if not found then
    raise exception 'No active staff row for this identity; a PIN cannot be set.';
  end if;

  -- Shape. Enforced here as well as in the UI because the RPC is reachable
  -- without the numpad. 0208 (Babin, 28 Oct): exactly FOUR digits.
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'A PIN must be exactly 4 digits.';
  end if;

  -- Weak-PIN rejection. Four identical digits, four sequential in either
  -- direction, and the last four of the mobile on the staff row — the three
  -- guesses someone standing at a shared tablet actually makes. With a 4-digit
  -- PIN the mobile rule compares the whole PIN.
  if p_pin ~ '^(.)\1{3}$' then
    raise exception 'That PIN is four identical digits. Choose another.';
  end if;

  -- The same cyclic strings 0066 used: they contain every 4-length run
  -- including the wraparound ones ('7890' ascending, '0987' descending).
  if strpos('01234567890', p_pin) > 0 or strpos('09876543210', p_pin) > 0 then
    raise exception 'That PIN is four sequential digits. Choose another.';
  end if;

  if v_mobile is not null
     and length(regexp_replace(v_mobile, '\D', '', 'g')) >= 4
     and right(regexp_replace(v_mobile, '\D', '', 'g'), 4) = right(p_pin, 4) then
    raise exception 'That PIN ends with the last four digits of your mobile number. Choose another.';
  end if;

  -- Rotation is a revoke plus an insert, never an UPDATE of pin_hash. Law 3:
  -- the fact that a different PIN was in force until now survives.
  update staff_auth_pins
     set revoked_at = now(),
         revoked_by = v_user_id
   where user_id = v_user_id
     and revoked_at is null;

  -- Captured explicitly rather than reading FOUND at the insert. FOUND would
  -- still be the UPDATE's result there and would work, but it is one statement
  -- away from silently meaning something else.
  v_rotating := found;

  insert into staff_auth_pins (user_id, pin_hash, rotated_at)
  values (
    v_user_id,
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    case when v_rotating then now() else null end
  );
end;
$$;

comment on function set_staff_pin(text) is
  'Enrol or rotate the caller''s OWN staff PIN. 0208 (Babin, 28 Oct 2026): exactly 4 digits. '
  'Freshness gate: the password sign-in must be <= 15 minutes old (amr). Weak PINs refused: four '
  'identical, four sequential, last four of the caller''s mobile. Rotation is revoke + insert (Law 3).';

revoke all on function set_staff_pin(text) from public, anon;
grant execute on function set_staff_pin(text) to authenticated;

-- ── verify_staff_pin: accepts 4 OR 6 during the transition ────────────────

create or replace function verify_staff_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid := auth_user_id();
  v_row     staff_auth_pins;
  v_ok      boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select * into v_row
    from staff_auth_pins
   where user_id = v_user_id
     and revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_pin');
  end if;

  -- Locked. Refuse WITHOUT consulting the hash: a lockout that still compares
  -- is a lockout an attacker can time.
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'locked_until', v_row.locked_until
    );
  end if;

  -- The staff row can be deactivated while a device sits locked. Fail on the
  -- identity, before the credential.
  if not exists (select 1 from users where id = v_user_id and is_active) then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;

  -- 0208: 4 from now on, 6 kept so hashes enrolled before the ruling still
  -- verify until their owners rotate. Tighten to 4-only once the live roster
  -- has rotated (follow-up, logged in the 0208 header).
  if p_pin is null or p_pin !~ '^([0-9]{4}|[0-9]{6})$' then
    return jsonb_build_object('ok', false, 'reason', 'malformed');
  end if;

  v_ok := extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash;

  if v_ok then
    update staff_auth_pins
       set attempt_count = 0,
           locked_until  = null,
           last_used_at  = now()
     where id = v_row.id;

    return jsonb_build_object('ok', true);
  end if;

  -- Failure. The fifth consecutive one locks for 15 minutes, matching
  -- portal_auth_challenges. The count never exceeds 5 (CHECK).
  update staff_auth_pins
     set attempt_count = least(v_row.attempt_count + 1, 5),
         locked_until  = case
                           when v_row.attempt_count + 1 >= 5 then now() + interval '15 minutes'
                           else locked_until
                         end
   where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ok', false,
    'reason', 'wrong_pin',
    'attempts_left', greatest(5 - v_row.attempt_count, 0),
    'locked_until', v_row.locked_until
  );
end;
$$;

comment on function verify_staff_pin(text) is
  'Is this the caller''s PIN? Fails closed; 5 consecutive failures lock that person only, '
  '15 minutes. 0208: accepts 4 digits (the ruling) and keeps 6 so pre-ruling hashes verify '
  'until rotated — set_staff_pin enforces exactly 4 from now on.';

revoke all on function verify_staff_pin(text) from public, anon;
grant execute on function verify_staff_pin(text) to authenticated;

commit;
