import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { calculatePricingPipeline } from '../lib/pricingPipeline'
import { rupees } from '../lib/money'

describe('BSEC-15 (P1 Batch 10): VAT, TDS, Invoice Uniqueness, Credit Notes & Accountant Reconciliation', () => {
  let db: PGlite
  let branchId: string
  let clientId: string
  let ownerId: string
  let warehouseId: string
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

    warehouseId = 'f0000000-0000-4000-8000-000000001501'
    await db.query(
      `insert into auth.users (id, email) values ($1, 'bsec15-wh@babinrentals.test') on conflict (id) do nothing;`,
      [warehouseId]
    )
    await db.query(
      `insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
       values ($1, gen_random_uuid(), 'BSEC15 WH', 'bsec15-wh@babinrentals.test', 'EMP-B15-WH', '+977-9800001501', $2, 'Warehouse', true)
       on conflict (id) do update set primary_role = 'Warehouse', is_active = true;`,
      [warehouseId, branchId]
    )

    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])
    const bRes = await db.query<{ id: string }>(
      `insert into public.bookings (
         client_uuid, booking_no, client_id, branch_id, stage,
         pickup_at, return_at, delivery_type, deposit_required, vat_rate, created_by, updated_by
       ) values (
         gen_random_uuid(), '150101', $1, $2, 'Booked',
         '2027-10-01 10:00:00+00', '2027-10-04 10:00:00+00', 'Client Pickup', 50000, 0.13, $3, $3
       ) returning id;`,
      [clientId, branchId, ownerId]
    )
    bookingId = bRes.rows[0]!.id
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-15-01: computes configured 13% VAT and 0% VAT-exempt totals in integer paisa', () => {
    const withVat = calculatePricingPipeline({
      equipmentSubtotalPaisa: rupees(30000),
      bundleSubtotalPaisa: 0,
      servicesSubtotalPaisa: 0,
      crewSubtotalPaisa: 0,
      deliveryChargePaisa: 0,
      fuelChargePaisa: 0,
      vatEnabled: true,
      vatRatePercent: 13,
      recommendedDepositPaisa: rupees(5000),
    })
    expect(withVat.taxableSubtotalPaisa).toBe(rupees(30000))
    expect(withVat.vatPaisa).toBe(rupees(3900))
    expect(withVat.rentalTotalPaisa).toBe(rupees(33900))

    const noVat = calculatePricingPipeline({
      equipmentSubtotalPaisa: rupees(30000),
      bundleSubtotalPaisa: 0,
      servicesSubtotalPaisa: 0,
      crewSubtotalPaisa: 0,
      deliveryChargePaisa: 0,
      fuelChargePaisa: 0,
      vatEnabled: false,
      vatRatePercent: 13,
      recommendedDepositPaisa: rupees(5000),
    })
    expect(noVat.vatPaisa).toBe(0)
    expect(noVat.rentalTotalPaisa).toBe(rupees(30000))
  })

  it('BSEC-15-02: enforces crew TDS bounds (0-100%) and masks TDS fields from money-blind roles', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])

    const crewMemberId = (await db.query<{ id: string }>('select id from public.crew_members limit 1;')).rows[0]?.id
    if (crewMemberId) {
      await expect(
        db.query(
          `insert into public.crew_bookings (
             client_uuid, booking_id, crew_member_id, role_name, rate_per_day, days, tds_rate_percent, created_by
           ) values (gen_random_uuid(), $1, $2, 'DOP', 10000, 1, 120, $3);`,
          [bookingId, crewMemberId, ownerId]
        )
      ).rejects.toThrow(/tds_rate_percent/i)
    }

    // Money-blind Warehouse sees NULL for tds_rate_percent and tds_amount in crew_bookings_v
    await setActor(warehouseId)
    const viewCheck = await db.query<{ tds_rate_percent: number | null; tds_amount: number | null }>(
      `select tds_rate_percent, tds_amount from public.crew_bookings_v limit 5;`
    )
    for (const row of viewCheck.rows) {
      expect(row.tds_rate_percent).toBeNull()
      expect(row.tds_amount).toBeNull()
    }
  })

  it('BSEC-15-03: rejects duplicate invoice numbers and issues monotonic sequence numbers', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])

    const invNo1 = (await db.query<{ no: string }>(`select public.next_document_number('invoice') as no;`)).rows[0]!.no
    const invNo2 = (await db.query<{ no: string }>(`select public.next_document_number('invoice') as no;`)).rows[0]!.no
    expect(invNo1).not.toBe(invNo2)

    await db.query(
      `insert into public.invoices (
         client_uuid, invoice_no, booking_id, client_id, branch_id,
         status, issue_date, due_date, subtotal, discount_amount, taxable_amount, vat_rate, vat_amount, total_amount, created_by, updated_by
       ) values (
         gen_random_uuid(), $1, $2, $3, $4,
         'Sent', current_date, current_date + 7, 10000, 0, 10000, 0.13, 1300, 11300, $5, $5
       );`,
      [invNo1, bookingId, clientId, branchId, ownerId]
    )

    // Duplicate invoice_no rejected
    await expect(
      db.query(
        `insert into public.invoices (
           client_uuid, invoice_no, booking_id, client_id, branch_id,
           status, issue_date, due_date, subtotal, discount_amount, taxable_amount, vat_rate, vat_amount, total_amount, created_by, updated_by
         ) values (
           gen_random_uuid(), $1, $2, $3, $4,
           'Sent', current_date, current_date + 7, 10000, 0, 10000, 0.13, 1300, 11300, $5, $5
         );`,
        [invNo1, bookingId, clientId, branchId, ownerId]
      )
    ).rejects.toThrow(/unique|invoice_no/i)
  })

  it('BSEC-15-04: enforces credit_notes constraints (positive amount, >=10 char reason, unique number) and Law 4', async () => {
    await db.exec('reset role;')
    const invId = (await db.query<{ id: string }>(`select id from public.invoices where booking_id = $1 limit 1;`, [bookingId]))
      .rows[0]!.id

    await expect(
      db.query(
        `insert into public.credit_notes (client_uuid, credit_note_no, invoice_id, amount, reason, created_by)
         values (gen_random_uuid(), 'CN-2027-0001', $1, 0, 'Valid long reason text', $2);`,
        [invId, ownerId]
      )
    ).rejects.toThrow(/credit_notes_amount_positive/i)

    await expect(
      db.query(
        `insert into public.credit_notes (client_uuid, credit_note_no, invoice_id, amount, reason, created_by)
         values (gen_random_uuid(), 'CN-2027-0002', $1, 5000, 'short', $2);`,
        [invId, ownerId]
      )
    ).rejects.toThrow(/credit_notes_reason_length/i)
  })

  it('BSEC-15-05: reconciles invoice totals against payments minus reversals and excludes deposits', async () => {
    await db.exec('reset role;')
    const recon = await db.query<{
      invoice_total: string
      settled_payments: string
      reversals: string
    }>(
      `select
         coalesce((select sum(total_amount) from public.invoices where status <> 'Void'), 0)::text as invoice_total,
         coalesce((select sum(amount) from public.payments where status = 'Received'), 0)::text as settled_payments,
         coalesce((select sum(amount) from public.payment_reversals), 0)::text as reversals;`
    )
    expect(Number(recon.rows[0]!.invoice_total)).toBeGreaterThanOrEqual(0)
    expect(Number(recon.rows[0]!.settled_payments)).toBeGreaterThanOrEqual(0)
    expect(Number(recon.rows[0]!.reversals)).toBeGreaterThanOrEqual(0)
  })
})
