import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { canAdvance, closeGates, assertItemCounts, type BookingStatus } from '../lib/workflow'
import { rupees } from '../lib/money'

describe('BSEC-13 (P1 Batch 12): Rental Lifecycle — Transitions, Overrides, Partial Return & Close Gates', () => {
  let db: PGlite
  let branchId: string
  let clientId: string
  let ownerId: string
  let bookingId: string

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

    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])
    const bRes = await db.query<{ id: string }>(
      `insert into public.bookings (
         client_uuid, booking_no, client_id, branch_id, stage,
         pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
       ) values (
         gen_random_uuid(), '130101', $1, $2, 'Quote',
         '2027-11-01 10:00:00+00', '2027-11-03 10:00:00+00', 'Client Pickup', 0, $3, $3
       ) returning id;`,
      [clientId, branchId, ownerId]
    )
    bookingId = bRes.rows[0]!.id
    const productId = (await db.query<{ id: string }>('select id from public.products limit 1;')).rows[0]!.id
    await db.query(
      `insert into public.booking_lines (
         client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
       ) values (gen_random_uuid(), $1, 'Equipment', $2, 'Lifecycle test item', 1, 2, 0, $3);`,
      [bookingId, productId, ownerId]
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-13-01: validates canonical forward stage progression in workflow and Postgres', async () => {
    const chain: BookingStatus[] = ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed']
    for (let i = 0; i < chain.length - 1; i++) {
      expect(canAdvance(chain[i]!, chain[i + 1]!)).toBe(true)
    }

    // Real DB transition Quote -> Booked
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])
    await db.query(
      `insert into public.booking_stage_transitions (
         client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role
       ) values (gen_random_uuid(), $1, $2, 'Quote', 'Booked', $3, 'Owner');`,
      [bookingId, branchId, ownerId]
    )

    const bRow = await db.query<{ stage: string }>(`select stage from public.bookings where id = $1;`, [bookingId])
    expect(bRow.rows[0]!.stage).toBe('Booked')
  })

  it('BSEC-13-02: rejects invalid stage skips and unapproved backward transitions', async () => {
    expect(canAdvance('Quote', 'On Rent')).toBe(false)
    expect(canAdvance('Booked', 'Closed')).toBe(false)
    expect(canAdvance('Returned', 'Packed')).toBe(false)

    // DB rejects skipping from Booked -> On Rent without Packed
    await db.exec('reset role;')
    await expect(
      db.query(
        `insert into public.booking_stage_transitions (
           client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role
         ) values (gen_random_uuid(), $1, $2, 'Booked', 'On Rent', $3, 'Owner');`,
        [bookingId, branchId, ownerId]
      )
    ).rejects.toThrow(/transition|stage|Packed|invalid/i)
  })

  it('BSEC-13-03: enforces approval and reason on reversal overrides', async () => {
    await db.exec('reset role;')
    await expect(
      db.query(
        `insert into public.booking_stage_transitions (
           client_uuid, booking_id, branch_id, from_stage, to_stage, actor_id, actor_role, is_reversal
         ) values (gen_random_uuid(), $1, $2, 'Booked', 'Quote', $3, 'Coordinator', true);`,
        [bookingId, branchId, ownerId]
      )
    ).rejects.toThrow(/booking_stage_transitions_reversal_needs_approval|approval|reason/i)
  })

  it('BSEC-13-04: validates partial pickup and return item count conservation', () => {
    // 5 total units: 2 Returned, 2 Picked Up, 1 Ready -> valid
    expect(() => assertItemCounts({ Ready: 1, 'Picked Up': 2, Returned: 2, Missing: 0 }, 5)).not.toThrow()
    // Mismatched sum throws
    expect(() => assertItemCounts({ Ready: 1, 'Picked Up': 2, Returned: 1, Missing: 0 }, 5)).toThrow()
  })

  it('BSEC-13-05: permits operational Return while blocking Closed gate when outstanding balance > 0', () => {
    expect(canAdvance('On Rent', 'Returned')).toBe(true)

    const gatesWithDebt = closeGates({
      rentalInvoiced: true,
      rentalOutstandingPaisa: rupees(6000),
      depositHeldPaisa: 0,
      openCases: 0,
      damageChargesPendingApproval: 0,
    })
    const paymentGate = gatesWithDebt.find((g) => g.label.toLowerCase().includes('paid') || g.label.toLowerCase().includes('outstanding'))
    expect(paymentGate?.passing).toBe(false)

    // Law 5: Held deposit keeps deposit gate failing until resolved, and rentalOutstandingPaisa must be 0
    const gatesPaid = closeGates({
      rentalInvoiced: true,
      rentalOutstandingPaisa: 0,
      depositHeldPaisa: 0,
      openCases: 0,
      damageChargesPendingApproval: 0,
    })
    expect(gatesPaid.every((g) => g.passing)).toBe(true)
  })
})
