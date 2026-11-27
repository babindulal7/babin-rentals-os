import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  calculateActiveRentals,
  calculatePaymentDue,
  calculatePickupsToday,
  calculateReturnsToday,
  calculateRevenueToday,
  countOverdue,
} from '../lib/kpiEngine'
import { canViewFinancialReports, canViewMoney, type SystemRole } from '../lib/rbac'
import { rupees } from '../lib/money'
import { startOfCalendarDay, endOfCalendarDay, startOfOperationalDay, endOfOperationalDay } from '../lib/queries/dayBounds'
import type { RentalRow } from '../data/rentals'

function makeRentalRow(overrides: Partial<RentalRow>): RentalRow {
  return {
    id: 'bk-test-1',
    bookingNo: '270101',
    client: 'Test Client',
    status: 'Booked',
    pickup: { ad: new Date('2027-02-10T06:00:00+05:45'), bs: '2083-10-27' },
    ret: { ad: new Date('2027-02-12T06:00:00+05:45'), bs: '2083-10-29' },
    amount: rupees(10000),
    due: rupees(5000),
    progress: 0,
    flags: [],
    ...overrides,
  } as RentalRow
}

describe('BSEC-27 (P1 Batch 11): Reports & Analytics — Reconciliation, Utilization, Filters & Role Gates', () => {
  let db: PGlite
  let branchId: string
  let warehouseId: string

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
    warehouseId = 'e0000000-0000-4000-8000-000000002701'
    await db.query(
      `insert into auth.users (id, email) values ($1, 'bsec27-wh@babinrentals.test') on conflict (id) do nothing;`,
      [warehouseId]
    )
    await db.query(
      `insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
       values ($1, gen_random_uuid(), 'BSEC27 WH', 'bsec27-wh@babinrentals.test', 'EMP-B27-WH', '+977-9800002701', $2, 'Warehouse', true)
       on conflict (id) do update set primary_role = 'Warehouse', is_active = true;`,
      [warehouseId, branchId]
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-27-01: reconciles daily revenue in integer paisa and excludes Cancelled rentals', () => {
    const today = new Date('2027-02-10T10:00:00+05:45')
    const rows = [
      makeRentalRow({ amount: rupees(12000), flags: [] }),
      makeRentalRow({ id: 'bk-2', amount: rupees(8000), flags: ['Cancelled'] }),
      makeRentalRow({ id: 'bk-3', amount: rupees(5000), pickup: { ad: new Date('2027-02-11T06:00:00+05:45'), bs: '2083-10-28' } }),
    ]
    expect(calculateRevenueToday(rows, today)).toBe(rupees(12000))
  })

  it('BSEC-27-02: sums outstanding payment balances excluding Cancelled rentals', () => {
    const rows = [
      makeRentalRow({ due: rupees(4500), flags: [] }),
      makeRentalRow({ id: 'bk-2', due: rupees(9000), flags: ['Cancelled'] }),
      makeRentalRow({ id: 'bk-3', due: rupees(1500), flags: ['Overdue'] }),
    ]
    expect(calculatePaymentDue(rows)).toBe(rupees(6000))
  })

  it('BSEC-27-03: computes active rentals, pickups, returns, and overdue counts accurately', () => {
    const today = new Date('2027-02-10T10:00:00+05:45')
    const rows = [
      makeRentalRow({ status: 'On Rent', progress: 100, flags: [] }),
      makeRentalRow({ id: 'bk-2', status: 'Booked', progress: 0, flags: ['Overdue'] }),
      makeRentalRow({ id: 'bk-3', status: 'Closed', progress: 100, flags: [] }),
    ]
    expect(calculateActiveRentals(rows)).toBe(2)
    expect(countOverdue(rows)).toBe(1)
    expect(calculatePickupsToday(rows, today)).toEqual({ total: 3, done: 2 })
    expect(calculateReturnsToday(rows, today)).toEqual({ total: 0, overdue: 0 })
  })

  it('BSEC-27-04: separates calendar-midnight finance day bounds from 06:00 operational day bounds', () => {
    expect(startOfCalendarDay('2027-02-10')).toBe('2027-02-10T00:00:00.000+05:45')
    expect(endOfCalendarDay('2027-02-10')).toBe('2027-02-10T23:59:59.999+05:45')
    expect(startOfOperationalDay('2027-02-10', 360)).toBe('2027-02-10T06:00:00.000+05:45')
    expect(endOfOperationalDay('2027-02-10', 360)).toBe('2027-02-11T05:59:59.999+05:45')
  })

  it('BSEC-27-05: restricts company-wide financial reports to Owner/Admin/Manager/Accounts and masks DB money views', async () => {
    const allowed: SystemRole[] = ['Owner', 'Admin', 'Manager', 'Accounts']
    const denied: SystemRole[] = ['Coordinator', 'Warehouse', 'Technician', 'Driver', 'Client']

    for (const r of allowed) expect(canViewFinancialReports(r)).toBe(true)
    for (const r of denied) expect(canViewFinancialReports(r)).toBe(false)

    for (const r of ['Warehouse', 'Technician', 'Driver', 'Client'] as SystemRole[]) {
      expect(canViewMoney(r)).toBe(false)
    }

    // DB-level masking on crew_bookings_v for Warehouse
    await setActor(warehouseId)
    const masked = await db.query<{ tds_amount: number | null; net_payout: number | null }>(
      `select tds_amount, net_payout from public.crew_bookings_v limit 5;`
    )
    for (const row of masked.rows) {
      expect(row.tds_amount).toBeNull()
      expect(row.net_payout).toBeNull()
    }
  })
})
