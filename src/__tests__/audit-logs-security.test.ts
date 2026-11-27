import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('BSEC-24 (P1 Batch 6): Audit Logs — Capture, Old/New Diffs, Reasons, Immutability & Secret Exclusion', () => {
  let db: PGlite
  let branchId: string
  let clientId: string
  let ownerId: string
  let coordinatorId: string
  let clientUserId: string
  let bookingId: string

  async function setActor(userId: string | null) {
    await db.exec('reset role;')
    if (!userId) {
      await db.exec(`
        select set_config('app.current_user_id', '', false),
               set_config('request.jwt.claim.sub', '', false),
               set_config('request.jwt.claim.role', 'anon', false),
               set_config('request.jwt.claims', '{}', false);
        set role anon;
      `)
      return
    }
    const claims = JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal1' })
    await db.query(
      `select set_config('app.current_user_id', $1, false),
              set_config('request.jwt.claim.sub', $1, false),
              set_config('request.jwt.claim.role', 'authenticated', false),
              set_config('request.jwt.claims', $2, false);`,
      [userId, claims]
    )
    await db.exec('set role authenticated;')
  }

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
    await db.exec(fs.readFileSync(path.resolve(process.cwd(), 'supabase/pglite-prelude.sql'), 'utf8'))

    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations')
    for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    }

    await db.exec('reset role;')
    branchId = (await db.query<{ id: string }>('select id from public.branches order by created_at limit 1;')).rows[0]!.id
    clientId = (await db.query<{ id: string }>('select id from public.clients order by created_at limit 1;')).rows[0]!.id
    ownerId = (
      await db.query<{ id: string }>(`select id from public.users where primary_role = 'Owner' limit 1;`)
    ).rows[0]!.id

    coordinatorId = 'a0000000-0000-4000-8000-000000002401'
    clientUserId = 'a0000000-0000-4000-8000-000000002402'
    await db.query(
      `insert into auth.users (id, email) values ($1, 'bsec24-coord@babinrentals.test'), ($2, 'bsec24-client@babinrentals.test') on conflict (id) do nothing;`,
      [coordinatorId, clientUserId]
    )
    await db.query(
      `insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
       values ($1, gen_random_uuid(), 'BSEC24 Coord', 'bsec24-coord@babinrentals.test', 'EMP-B24-CRD', '+977-9800002401', $2, 'Coordinator', true)
       on conflict (id) do update set primary_role = 'Coordinator', is_active = true;`,
      [coordinatorId, branchId]
    )

    await db.query(`select set_config('app.current_user_id', $1, false);`, [coordinatorId])
    const bRes = await db.query<{ id: string }>(
      `insert into public.bookings (
         client_uuid, booking_no, client_id, branch_id, stage,
         pickup_at, return_at, delivery_type, deposit_required, project, created_by, updated_by
       ) values (
         gen_random_uuid(), '240101', $1, $2, 'Quote',
         '2027-08-01 10:00:00+00', '2027-08-03 10:00:00+00', 'Client Pickup', 0, 'Initial Shoot', $3, $3
       ) returning id;`,
      [clientId, branchId, coordinatorId]
    )
    bookingId = bRes.rows[0]!.id
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-24-01: captures actor_id, actor_role, created_at, table_name, and record_id on mutations', async () => {
    await db.exec('reset role;')
    const res = await db.query<{
      actor_id: string
      actor_role: string | null
      table_name: string
      record_id: string
      created_at: string
    }>(
      `select actor_id, actor_role, table_name, record_id, created_at
         from public.audit_events
        where table_name = 'bookings' and record_id = $1
        order by created_at desc limit 1;`,
      [bookingId]
    )
    expect(res.rows.length).toBe(1)
    expect(res.rows[0]!.actor_id).toBe(coordinatorId)
    expect(res.rows[0]!.table_name).toBe('bookings')
    expect(res.rows[0]!.record_id).toBe(bookingId)
    expect(res.rows[0]!.created_at).toBeTruthy()
  })

  it('BSEC-24-02: records previous (old_values) and updated (new_values) on record updates', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])
    await db.query(`update public.bookings set project = 'Updated Feature Film', updated_by = $1 where id = $2;`, [
      ownerId,
      bookingId,
    ])

    const res = await db.query<{
      action: string
      actor_id: string
      old_values: Record<string, unknown> | null
      new_values: Record<string, unknown> | null
    }>(
      `select action, actor_id, old_values, new_values
         from public.audit_events
        where table_name = 'bookings' and record_id = $1 and action = 'Update'
        order by created_at desc limit 1;`,
      [bookingId]
    )
    expect(res.rows.length).toBe(1)
    expect(res.rows[0]!.actor_id).toBe(ownerId)
    expect(res.rows[0]!.old_values?.['project']).toBe('Initial Shoot')
    expect(res.rows[0]!.new_values?.['project']).toBe('Updated Feature Film')
  })

  it('BSEC-24-03: captures override reasons in audit_events and enforces server-bound actor identity', async () => {
    await setActor(coordinatorId)
    await db.query(
      `insert into public.audit_events (
         client_uuid, event_class, category, module, action, severity, status,
         table_name, record_id, actor_id, actor_role, branch_id, reason, new_values
       ) values (
         gen_random_uuid(), 'override', 'Rentals', 'Rentals', 'Create', 'Informational', 'Success',
         'bookings', $1, $2, 'Owner', $3, 'Director approved late pickup waiver', '{"waived":true}'::jsonb
       );`,
      [bookingId, ownerId, branchId]
    )

    await db.exec('reset role;')
    const row = await db.query<{ actor_id: string; actor_role: string; reason: string }>(
      `select actor_id, actor_role, reason
         from public.audit_events
        where record_id = $1 and reason = 'Director approved late pickup waiver'
        limit 1;`,
      [bookingId]
    )
    expect(row.rows[0]).toEqual({
      actor_id: coordinatorId,
      actor_role: 'Coordinator',
      reason: 'Director approved late pickup waiver',
    })
  })

  it('BSEC-24-04: prevents UPDATE and DELETE on audit_events and blocks anon/Client reads', async () => {
    await db.exec('reset role;')
    const existing = await db.query<{ id: string }>(`select id from public.audit_events limit 1;`)
    const auditId = existing.rows[0]!.id

    await expect(
      db.query(`update public.audit_events set reason = 'tampered' where id = $1;`, [auditId])
    ).rejects.toThrow(/append-only|never edited|cannot update|Law 3|Law 4/i)

    await expect(
      db.query(`delete from public.audit_events where id = $1;`, [auditId])
    ).rejects.toThrow(/never removed|cannot delete|Law 3|Law 4/i)

    // Anon and Client cannot read audit_events
    await setActor(null)
    let anonRows = 0
    try {
      const anonRead = await db.query(`select id from public.audit_events limit 1;`)
      anonRows = anonRead.rows.length
    } catch {
      anonRows = 0
    }
    expect(anonRows).toBe(0)

    await setActor(clientUserId)
    const clientRead = await db.query(`select id from public.audit_events limit 1;`)
    expect(clientRead.rows.length).toBe(0)
  })

  it('BSEC-24-05: excludes secrets, PIN hashes, and raw email bodies from audit/log tables', async () => {
    await db.exec('reset role;')
    const badAudit = await db.query<{ c: number }>(
      `select count(*)::int as c from public.audit_events
        where new_values::text ~* '(sb_secret_|pin_hash|encrypted_password)'
           or old_values::text ~* '(sb_secret_|pin_hash|encrypted_password)';`
    )
    expect(badAudit.rows[0]!.c).toBe(0)

    // email_log schema must not carry raw HTML/text body columns (Law / S13 / W21)
    const emailLogCols = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'email_log';`
    )
    const colNames = emailLogCols.rows.map((r) => r.column_name)
    expect(colNames).not.toContain('html')
    expect(colNames).not.toContain('body')
  })
})
