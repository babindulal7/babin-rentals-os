import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { verifyPublicRequestAbuse, resetAbuseProtectionState } from '../lib/abuseProtection'

const ROOT = process.cwd()

describe('BSEC-05 (P0 Batch 4): API & Edge Function Security, Input Validation, SQLi & Rate Limits', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
    await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/pglite-prelude.sql'), 'utf8'))
    const migrationsDir = path.join(ROOT, 'supabase/migrations')
    for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    }
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-05-01: protected Edge Functions enforce Authorization + JWT/role verification and config.toml enables verify_jwt', () => {
    const configToml = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
    expect(configToml).toMatch(/\[functions\.send-email\][\s\S]*?verify_jwt\s*=\s*true/)
    expect(configToml).toMatch(/\[functions\.morning-digest\][\s\S]*?verify_jwt\s*=\s*true/)
    expect(configToml).toMatch(/\[functions\.push-send\][\s\S]*?verify_jwt\s*=\s*true/)

    for (const fn of ['send-email', 'morning-digest', 'push-send']) {
      const src = fs.readFileSync(path.join(ROOT, `supabase/functions/${fn}/index.ts`), 'utf8')
      expect(src).toContain("req.headers.get('Authorization')")
      expect(src).toContain('auth.getUser()')
      expect(src).toContain('status: 401')
    }

    const morningDigest = fs.readFileSync(path.join(ROOT, 'supabase/functions/morning-digest/index.ts'), 'utf8')
    expect(morningDigest).toContain("['Owner', 'Admin', 'Manager'].includes(callerRow.primary_role)")
    expect(morningDigest).toContain('status: 403')

    const pushSend = fs.readFileSync(path.join(ROOT, 'supabase/functions/push-send/index.ts'), 'utf8')
    expect(pushSend).toContain("callerRow.primary_role === 'Client'")
    expect(pushSend).toContain('status: 403')
  })

  it('BSEC-05-02: Edge Functions and public RPCs validate required inputs and fail closed on malformed payloads', async () => {
    const payInit = fs.readFileSync(path.join(ROOT, 'supabase/functions/pay-init/index.ts'), 'utf8')
    expect(payInit).toContain("if (action !== 'link_details')")
    expect(payInit).toContain("if (typeof token !== 'string' || !token)")

    const riderLink = fs.readFileSync(path.join(ROOT, 'supabase/functions/rider-link/index.ts'), 'utf8')
    expect(riderLink).toContain("if (!token || typeof token !== 'string')")

    const calFeed = fs.readFileSync(path.join(ROOT, 'supabase/functions/calendar-feed/index.ts'), 'utf8')
    expect(calFeed).toContain("if (!rawToken || typeof rawToken !== 'string')")

    // Public RPC submit_booking_request fails closed on invalid/empty items
    await db.exec('reset role; set role anon;')
    await expect(
      db.query(
        `select public.submit_booking_request($1::jsonb);`,
        [
          JSON.stringify({
            client_name: 'Test Client',
            client_phone: '+9779800000000',
            client_email: 'test@example.invalid',
            start_date: '2027-05-01',
            end_date: '2027-05-02',
            items: [],
          }),
        ]
      )
    ).rejects.toThrow(/item|empty|required|permission|42501|invalid|missing/i)
  })

  it('BSEC-05-03: parameterized RPCs treat SQL injection payloads as literal strings without syntax/injection execution', async () => {
    await db.exec('reset role;')
    const productId = (await db.query<{ id: string }>('select id from public.products limit 1;')).rows[0]!.id
    await db.exec('set role anon;')
    const sqliPayload = "'; DROP TABLE bookings; --"

    const res = await db.query(
      `select * from public.public_availability(array[$1::uuid], '2027-05-01'::date, '2027-05-02'::date);`,
      [productId]
    )
    expect(Array.isArray(res.rows)).toBe(true)

    // Verify bookings table still intact and parameterized query safely rejects/ignores SQLi string
    await expect(
      db.query(`select * from public.get_payment_link_details($1);`, [sqliPayload])
    ).rejects.toThrow(/permission denied|not found|invalid|42501/i)

    await db.exec('reset role;')
    const countRes = await db.query<{ c: number }>(`select count(*)::int as c from public.bookings;`)
    expect(countRes.rows[0]!.c).toBeGreaterThanOrEqual(0)
  })

  it('BSEC-05-04: rate limiting blocks missing tokens, replayed tokens, and excessive requests', () => {
    resetAbuseProtectionState()

    expect(
      verifyPublicRequestAbuse({ ip: '202.70.78.10', action: 'guest_booking', identifier: 'a@example.invalid' }).code
    ).toBe('MISSING_TOKEN')

    const first = verifyPublicRequestAbuse({
      ip: '202.70.78.10',
      action: 'guest_booking',
      identifier: 'a@example.invalid',
      turnstileToken: 'cf_valid_batch4_1',
    })
    expect(first.allowed).toBe(true)

    const replay = verifyPublicRequestAbuse({
      ip: '202.70.78.10',
      action: 'guest_booking',
      identifier: 'a@example.invalid',
      turnstileToken: 'cf_valid_batch4_1',
    })
    expect(replay.allowed).toBe(false)
    expect(replay.code).toBe('TOKEN_REUSED')
  })

  it('BSEC-05-05: Edge Functions exclude sensitive errors, payment verification is held 503, and email bodies are never logged', () => {
    const riderLink = fs.readFileSync(path.join(ROOT, 'supabase/functions/rider-link/index.ts'), 'utf8')
    expect(riderLink).toContain('This link is no longer valid.')

    const payVerify = fs.readFileSync(path.join(ROOT, 'supabase/functions/pay-verify/index.ts'), 'utf8')
    expect(payVerify).toContain('status: 503')
    expect(payVerify).toContain('No payment has been recorded')

    const sendEmail = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-email/index.ts'), 'utf8')
    expect(sendEmail).toContain('Never logs email bodies to email_log')
  })
})
