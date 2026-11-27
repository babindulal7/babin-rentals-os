import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('BSEC-01 (P0 Batch 1): Authentication, PIN Lockout, Session Freshness & Revocation', () => {
  let db: PGlite

  const ROLES = [
    'Owner',
    'Admin',
    'Manager',
    'Coordinator',
    'Accounts',
    'Warehouse',
    'Technician',
    'Driver',
  ] as const

  const staffUsers: Record<string, { id: string; role: string; mobile: string }> = {}
  const clientUser = { id: 'b0000000-0000-4000-8000-000000000099' }
  let branchId: string

  async function setJwtContext(
    userId: string | null,
    opts: {
      role?: 'authenticated' | 'anon'
      aal?: 'aal1' | 'aal2'
      amrPasswordAgeSeconds?: number | null
    } = {}
  ) {
    await db.exec('reset role;')
    if (!userId) {
      await db.exec(`
        select set_config('app.current_user_id', '', false);
        select set_config('request.jwt.claim.sub', '', false);
        select set_config('request.jwt.claim.role', 'anon', false);
        select set_config('request.jwt.claims', '{}', false);
        set role anon;
      `)
      return
    }

    const nowEpoch = Math.floor(Date.now() / 1000)
    const amr =
      opts.amrPasswordAgeSeconds === null || opts.amrPasswordAgeSeconds === undefined
        ? []
        : [{ method: 'password', timestamp: nowEpoch - opts.amrPasswordAgeSeconds }]

    const claims = JSON.stringify({
      sub: userId,
      role: opts.role ?? 'authenticated',
      aal: opts.aal ?? 'aal1',
      amr,
    })

    await db.query(
      `
      select set_config('app.current_user_id', $1, false),
             set_config('request.jwt.claim.sub', $1, false),
             set_config('request.jwt.claim.role', $2, false),
             set_config('request.jwt.claims', $3, false);
      `,
      [userId, opts.role ?? 'authenticated', claims]
    )
    await db.exec('set role authenticated;')
  }

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

    const preludePath = path.resolve(process.cwd(), 'supabase/pglite-prelude.sql')
    await db.exec(fs.readFileSync(preludePath, 'utf8'))

    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      await db.exec(sql)
    }

    await db.exec('reset role;')
    const branchRes = await db.query<{ id: string }>('select id from public.branches order by created_at limit 1;')
    branchId = branchRes.rows[0]!.id

    let idx = 10
    for (const role of ROLES) {
      const uid = `b0000000-0000-4000-8000-0000000000${idx++}`
      const mobile = `+977-98000043${idx}`
      staffUsers[role] = { id: uid, role, mobile }

      await db.query(
        `insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing;`,
        [uid, `bsec-${role.toLowerCase()}@babinrentals.test`]
      )
      await db.query(
        `insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
         values ($1, gen_random_uuid(), $2, $3, $4, $5, $6, $7, true)
         on conflict (id) do update set primary_role = $7, is_active = true, mobile = $5;`,
        [uid, `BSEC ${role}`, `bsec-${role.toLowerCase()}@babinrentals.test`, `EMP-BSEC-${idx}`, mobile, branchId, role]
      )
    }

    await db.query(
      `insert into auth.users (id, email) values ($1, 'bsec-client@babinrentals.test') on conflict (id) do nothing;`,
      [clientUser.id]
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-01-01: resolves exact role and staff status for all 9 roles and denies anon', async () => {
    await setJwtContext(null)
    const anonRes = await db.query<{ uid: string | null; role: string | null; staff: boolean }>(
      `select public.auth_user_id() as uid, public.auth_user_role() as role, public.auth_is_staff() as staff;`
    )
    expect(anonRes.rows[0]!.uid).toBeNull()
    expect(anonRes.rows[0]!.staff).toBe(false)

    for (const role of ROLES) {
      await setJwtContext(staffUsers[role]!.id)
      const res = await db.query<{ uid: string; role: string; staff: boolean }>(
        `select public.auth_user_id() as uid, public.auth_user_role() as role, public.auth_is_staff() as staff;`
      )
      expect(res.rows[0]!.uid).toBe(staffUsers[role]!.id)
      expect(res.rows[0]!.role).toBe(role)
      expect(res.rows[0]!.staff).toBe(true)
    }

    await setJwtContext(clientUser.id)
    const clientRes = await db.query<{ uid: string; role: string; staff: boolean }>(
      `select public.auth_user_id() as uid, public.auth_user_role() as role, public.auth_is_staff() as staff;`
    )
    expect(clientRes.rows[0]!.uid).toBe(clientUser.id)
    expect(clientRes.rows[0]!.role).toBe('Client')
    expect(clientRes.rows[0]!.staff).toBe(false)
  })

  it('BSEC-01-02: enforces PIN strength, malformed rejection, 5-try lockout, and active-user check', async () => {
    const wh = staffUsers['Warehouse']!
    await setJwtContext(wh.id, { amrPasswordAgeSeconds: 60 })

    // No PIN enrolled yet
    const noPin = await db.query<{ res: { ok: boolean; reason: string } }>(
      `select public.verify_staff_pin('2580') as res;`
    )
    expect(noPin.rows[0]!.res).toEqual({ ok: false, reason: 'no_pin' })

    // Weak PINs and invalid formats rejected
    await expect(db.query(`select public.set_staff_pin('123')`)).rejects.toThrow(/4 digits/i)
    await expect(db.query(`select public.set_staff_pin('123456')`)).rejects.toThrow(/4 digits/i)
    await expect(db.query(`select public.set_staff_pin('7777')`)).rejects.toThrow(/identical/i)
    await expect(db.query(`select public.set_staff_pin('1234')`)).rejects.toThrow(/sequential/i)
    await expect(db.query(`select public.set_staff_pin('0987')`)).rejects.toThrow(/sequential/i)
    const last4 = wh.mobile.replace(/\D/g, '').slice(-4)
    await expect(db.query(`select public.set_staff_pin($1)`, [last4])).rejects.toThrow(/mobile/i)

    // Enroll strong 4-digit PIN
    await db.query(`select public.set_staff_pin('2580')`)

    // Malformed attempt does not consume attempts
    const malformed = await db.query<{ res: { ok: boolean; reason: string } }>(
      `select public.verify_staff_pin('abcd') as res;`
    )
    expect(malformed.rows[0]!.res).toEqual({ ok: false, reason: 'malformed' })

    // 4 wrong attempts decrement attempts_left 4 -> 1 without locking
    for (let attempt = 1; attempt <= 4; attempt++) {
      const wrong = await db.query<{
        res: { ok: boolean; reason: string; attempts_left: number; locked_until: string | null }
      }>(`select public.verify_staff_pin('9042') as res;`)
      expect(wrong.rows[0]!.res.ok).toBe(false)
      expect(wrong.rows[0]!.res.reason).toBe('wrong_pin')
      expect(wrong.rows[0]!.res.attempts_left).toBe(5 - attempt)
      expect(wrong.rows[0]!.res.locked_until).toBeNull()
    }

    // 5th wrong attempt triggers 15-minute lockout
    const fifth = await db.query<{
      res: { ok: boolean; reason: string; attempts_left: number; locked_until: string | null }
    }>(`select public.verify_staff_pin('9042') as res;`)
    expect(fifth.rows[0]!.res.ok).toBe(false)
    expect(fifth.rows[0]!.res.reason).toBe('wrong_pin')
    expect(fifth.rows[0]!.res.attempts_left).toBe(0)
    expect(fifth.rows[0]!.res.locked_until).toBeTruthy()

    // Even the CORRECT PIN is refused while locked
    const lockedAttempt = await db.query<{ res: { ok: boolean; reason: string; locked_until: string } }>(
      `select public.verify_staff_pin('2580') as res;`
    )
    expect(lockedAttempt.rows[0]!.res.ok).toBe(false)
    expect(lockedAttempt.rows[0]!.res.reason).toBe('locked')
    expect(lockedAttempt.rows[0]!.res.locked_until).toBeTruthy()

    // Simulate lockout expiry and verify valid PIN resets attempt_count
    await db.exec('reset role;')
    await db.query(
      `update public.staff_auth_pins set locked_until = now() - interval '1 second' where user_id = $1 and revoked_at is null;`,
      [wh.id]
    )
    await setJwtContext(wh.id)
    const okRes = await db.query<{ res: { ok: boolean } }>(`select public.verify_staff_pin('2580') as res;`)
    expect(okRes.rows[0]!.res).toEqual({ ok: true })

    // Deactivated staff user is refused even with valid PIN (Owner deactivates Warehouse)
    await setJwtContext(staffUsers['Owner']!.id)
    await db.exec('reset role;')
    await db.query(`update public.users set is_active = false where id = $1;`, [wh.id])
    await setJwtContext(wh.id)
    const inactiveRes = await db.query<{ res: { ok: boolean; reason: string } }>(
      `select public.verify_staff_pin('2580') as res;`
    )
    expect(inactiveRes.rows[0]!.res).toEqual({ ok: false, reason: 'inactive' })

    // Restore active status for remaining tests
    await setJwtContext(staffUsers['Owner']!.id)
    await db.exec('reset role;')
    await db.query(`update public.users set is_active = true, deactivated_at = null where id = $1;`, [wh.id])
  })

  it('BSEC-01-03: fails closed on unauthenticated/expired sessions and stale amr password age', async () => {
    // Anon / unauthenticated / expired session
    await setJwtContext(null)
    await expect(db.query(`select public.set_staff_pin('2580')`)).rejects.toThrow(
      /permission denied|signed-in staff session/i
    )
    await expect(db.query(`select public.record_staff_mfa_enrolment()`)).rejects.toThrow(
      /permission denied|42501|Authentication required/i
    )
    await expect(db.query(`select public.reset_staff_mfa($1)`, [staffUsers['Coordinator']!.id])).rejects.toThrow(
      /permission denied|42501|Authentication required/i
    )

    // Authenticated role with missing/expired sub claim (auth_user_id() IS NULL)
    await db.exec(`
      reset role;
      select set_config('app.current_user_id', '', false),
             set_config('request.jwt.claim.sub', '', false),
             set_config('request.jwt.claim.role', 'authenticated', false),
             set_config('request.jwt.claims', '{}', false);
      set role authenticated;
    `)
    await expect(db.query(`select public.set_staff_pin('2580')`)).rejects.toThrow(/signed-in staff session/i)
    const expiredVerify = await db.query<{ res: { ok: boolean; reason: string } }>(
      `select public.verify_staff_pin('2580') as res;`
    )
    expect(expiredVerify.rows[0]!.res).toEqual({ ok: false, reason: 'no_session' })

    // Missing amr claim refused by set_staff_pin
    const coord = staffUsers['Coordinator']!
    await setJwtContext(coord.id, { amrPasswordAgeSeconds: null })
    await expect(db.query(`select public.set_staff_pin('2580')`)).rejects.toThrow(/within 15 minutes/i)

    // Stale password sign-in (16 minutes ago) refused by set_staff_pin
    await setJwtContext(coord.id, { amrPasswordAgeSeconds: 16 * 60 })
    await expect(db.query(`select public.set_staff_pin('2580')`)).rejects.toThrow(/within 15 minutes/i)

    // Fresh password sign-in (2 minutes ago) succeeds
    await setJwtContext(coord.id, { amrPasswordAgeSeconds: 120 })
    await db.query(`select public.set_staff_pin('4829')`)
    const okRes = await db.query<{ res: { ok: boolean } }>(`select public.verify_staff_pin('4829') as res;`)
    expect(okRes.rows[0]!.res).toEqual({ ok: true })
  })

  it('BSEC-01-04: isolates staff_auth_pins from direct table access and enforces cross-user PIN isolation', async () => {
    const owner = staffUsers['Owner']!
    const coord = staffUsers['Coordinator']!
    const wh = staffUsers['Warehouse']!

    // Even Owner cannot directly SELECT/INSERT/UPDATE/DELETE staff_auth_pins
    await setJwtContext(owner.id)
    await expect(db.query(`select * from public.staff_auth_pins`)).rejects.toThrow(/permission denied|42501/i)
    await expect(
      db.query(`update public.staff_auth_pins set attempt_count = 0 where user_id = $1`, [coord.id])
    ).rejects.toThrow(/permission denied|42501/i)
    await expect(db.query(`delete from public.staff_auth_pins where user_id = $1`, [coord.id])).rejects.toThrow(
      /permission denied|42501/i
    )

    // Cross-user PIN isolation: Warehouse's PIN ('2580') does NOT verify Coordinator ('4829')
    await setJwtContext(coord.id)
    const crossTry = await db.query<{ res: { ok: boolean; reason: string } }>(
      `select public.verify_staff_pin('2580') as res;`
    )
    expect(crossTry.rows[0]!.res.ok).toBe(false)
    expect(crossTry.rows[0]!.res.reason).toBe('wrong_pin')

    // staff_directory_v masks has_pin & pin_locked_until for non-Owner/Admin
    await setJwtContext(wh.id)
    const maskedDir = await db.query<{ has_pin: boolean; pin_locked_until: string | null }>(
      `select has_pin, pin_locked_until from public.staff_directory_v where id = $1;`,
      [coord.id]
    )
    expect(maskedDir.rows[0]!.has_pin).toBe(false)
    expect(maskedDir.rows[0]!.pin_locked_until).toBeNull()
  })

  it('BSEC-01-05: preserves Law 3 history on PIN rotation and enforces MFA reset hierarchy + audit', async () => {
    const owner = staffUsers['Owner']!
    const admin = staffUsers['Admin']!
    const coord = staffUsers['Coordinator']!

    // Rotate Coordinator's PIN from 4829 -> 6193
    await setJwtContext(coord.id, { amrPasswordAgeSeconds: 60 })
    await db.query(`select public.set_staff_pin('6193')`)

    // Old PIN fails, new PIN succeeds
    const oldTry = await db.query<{ res: { ok: boolean; reason: string } }>(
      `select public.verify_staff_pin('4829') as res;`
    )
    expect(oldTry.rows[0]!.res.ok).toBe(false)
    const newTry = await db.query<{ res: { ok: boolean } }>(`select public.verify_staff_pin('6193') as res;`)
    expect(newTry.rows[0]!.res).toEqual({ ok: true })

    // Verify Law 3: 2 rows exist for Coordinator (1 revoked, 1 active)
    await db.exec('reset role;')
    const pinHistory = await db.query<{ total: number; active: number; revoked: number }>(
      `select count(*)::int as total,
              count(*) filter (where revoked_at is null)::int as active,
              count(*) filter (where revoked_at is not null)::int as revoked
         from public.staff_auth_pins where user_id = $1;`,
      [coord.id]
    )
    expect(pinHistory.rows[0]).toEqual({ total: 2, active: 1, revoked: 1 })

    // Coordinator cannot enrol MFA without a verified auth.mfa_factors provider row
    await setJwtContext(coord.id, { aal: 'aal2' })
    await expect(db.query(`select public.record_staff_mfa_enrolment()`)).rejects.toThrow(/mfa_factor_unverified/i)

    // Seed verified TOTP factor, active session, and refresh token in auth schema, then enrol & test reset
    await db.exec('reset role;')
    const sessionId = 'c0000000-0000-4000-8000-000000000001'
    await db.query(
      `insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified');`,
      [coord.id]
    )
    await db.query(`insert into auth.sessions (id, user_id) values ($1, $2);`, [sessionId, coord.id])
    await db.query(
      `insert into auth.refresh_tokens (user_id, session_id, token) values ($1, $2, 'tok-bsec-1');`,
      [coord.id, sessionId]
    )

    await setJwtContext(coord.id, { aal: 'aal2' })
    await db.query(`select public.record_staff_mfa_enrolment()`)
    await expect(db.query(`select public.reset_staff_mfa($1)`, [coord.id])).rejects.toThrow(
      /mfa_self_reset_forbidden/i
    )

    // Admin cannot reset Owner MFA
    await setJwtContext(admin.id, { aal: 'aal2' })
    await expect(db.query(`select public.reset_staff_mfa($1)`, [owner.id])).rejects.toThrow(
      /mfa_reset_forbidden/i
    )

    // Owner resets Coordinator MFA: removes factors, invalidates sessions/refresh tokens, writes audit
    await setJwtContext(owner.id, { aal: 'aal2' })
    const resetRes = await db.query<{ res: { success: boolean; reset_user_id: string } }>(
      `select public.reset_staff_mfa($1) as res;`,
      [coord.id]
    )
    expect(resetRes.rows[0]!.res.success).toBe(true)
    expect(resetRes.rows[0]!.res.reset_user_id).toBe(coord.id)

    await db.exec('reset role;')
    const mfaRow = await db.query(`select * from public.staff_mfa_factors where user_id = $1;`, [coord.id])
    expect(mfaRow.rows.length).toBe(0)
    const authFactors = await db.query(`select * from auth.mfa_factors where user_id = $1;`, [coord.id])
    expect(authFactors.rows.length).toBe(0)
    const authSessions = await db.query(`select * from auth.sessions where user_id = $1;`, [coord.id])
    expect(authSessions.rows.length).toBe(0)
    const authRefresh = await db.query(`select * from auth.refresh_tokens where user_id = $1;`, [coord.id])
    expect(authRefresh.rows.length).toBe(0)
    const auditRows = await db.query<{ action: string; actor_id: string }>(
      `select action, actor_id from public.staff_mfa_audit where user_id = $1 order by created_at desc limit 1;`,
      [coord.id]
    )
    expect(auditRows.rows[0]).toEqual({ action: 'reset_by_admin', actor_id: owner.id })
  })
})
