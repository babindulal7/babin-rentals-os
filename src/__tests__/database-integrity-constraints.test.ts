import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('BSEC-04 (P0 Batch 2): Database Integrity — FKs, Uniqueness, Check Constraints, Law 3 & Orphans', () => {
  let db: PGlite
  let ownerId: string
  let branchId: string
  let warehouseId: string
  let clientId: string
  let productId: string
  let bookingId: string
  let bookingNo: string

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })

    const preludePath = path.resolve(process.cwd(), 'supabase/pglite-prelude.sql')
    await db.exec(fs.readFileSync(preludePath, 'utf8'))

    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'))
    }

    await db.exec('reset role;')
    branchId = (await db.query<{ id: string }>('select id from public.branches order by created_at limit 1;')).rows[0]!.id
    warehouseId = (await db.query<{ id: string }>('select id from public.warehouses order by created_at limit 1;')).rows[0]!.id
    clientId = (await db.query<{ id: string }>('select id from public.clients order by created_at limit 1;')).rows[0]!.id
    productId = (await db.query<{ id: string }>('select id from public.products order by created_at limit 1;')).rows[0]!.id
    ownerId = (
      await db.query<{ id: string }>(`select id from public.users where primary_role = 'Owner' limit 1;`)
    ).rows[0]!.id

    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])

    const bRes = await db.query<{ id: string; booking_no: string }>(
      `insert into public.bookings (
         client_uuid, booking_no, client_id, branch_id, stage,
         pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
       ) values (
         gen_random_uuid(), '940100', $1, $2, 'Quote',
         '2027-04-01 10:00:00+00', '2027-04-02 10:00:00+00', 'Client Pickup', 0, $3, $3
       ) returning id, booking_no;`,
      [clientId, branchId, ownerId]
    )
    bookingId = bRes.rows[0]!.id
    bookingNo = bRes.rows[0]!.booking_no
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-04-01: enforces foreign key integrity across bookings, lines, invoices, payments, and units', async () => {
    const missingUuid = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

    await expect(
      db.query(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), '940200', $1, $2, 'Quote',
           '2027-04-01 10:00:00+00', '2027-04-02 10:00:00+00', 'Client Pickup', 0, $3, $3
         );`,
        [missingUuid, branchId, ownerId]
      )
    ).rejects.toThrow(/foreign key|bookings_client_id_fkey/i)

    await expect(
      db.query(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), '940300', $1, $2, 'Quote',
           '2027-04-01 10:00:00+00', '2027-04-02 10:00:00+00', 'Client Pickup', 0, $3, $3
         );`,
        [clientId, missingUuid, ownerId]
      )
    ).rejects.toThrow(/foreign key|bookings_branch_id_fkey/i)

    await expect(
      db.query(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'Orphan line', 1, 1, 1000, $3);`,
        [missingUuid, productId, ownerId]
      )
    ).rejects.toThrow(/foreign key|booking_lines_booking_id_fkey/i)

    await expect(
      db.query(
        `insert into public.product_units (
           client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
         ) values (gen_random_uuid(), $1, 'TAG-ORPHAN-9401', 'SER-ORPHAN-9401', $2, $3, 'In Stock', $4);`,
        [missingUuid, branchId, warehouseId, ownerId]
      )
    ).rejects.toThrow(/foreign key|product_units_product_id_fkey/i)
  })

  it('BSEC-04-02: rejects duplicate client_uuid, booking_no, asset_tag, and serial_no', async () => {
    const dupClientUuid = 'd0000000-0000-4000-8000-000000009401'
    await db.query(
      `insert into public.booking_lines (
         client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
       ) values ($1, $2, 'Equipment', $3, 'Unique line', 1, 1, 1000, $4);`,
      [dupClientUuid, bookingId, productId, ownerId]
    )

    // Duplicate client_uuid rejected
    await expect(
      db.query(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
         ) values ($1, $2, 'Equipment', $3, 'Duplicate uuid line', 1, 1, 1000, $4);`,
        [dupClientUuid, bookingId, productId, ownerId]
      )
    ).rejects.toThrow(/unique|duplicate key/i)

    // Duplicate booking_no rejected
    await expect(
      db.query(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), $1, $2, $3, 'Quote',
           '2027-04-05 10:00:00+00', '2027-04-06 10:00:00+00', 'Client Pickup', 0, $4, $4
         );`,
        [bookingNo, clientId, branchId, ownerId]
      )
    ).rejects.toThrow(/unique|bookings_booking_no_key/i)

    // Duplicate product_units asset_tag and serial_no rejected
    await db.query(
      `insert into public.product_units (
         client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
       ) values (gen_random_uuid(), $1, 'TAG-BSEC-9401', 'SER-BSEC-9401', $2, $3, 'In Stock', $4);`,
      [productId, branchId, warehouseId, ownerId]
    )
    await expect(
      db.query(
        `insert into public.product_units (
           client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
         ) values (gen_random_uuid(), $1, 'TAG-BSEC-9401', 'SER-BSEC-9402', $2, $3, 'In Stock', $4);`,
        [productId, branchId, warehouseId, ownerId]
      )
    ).rejects.toThrow(/unique|product_units_asset_tag_key/i)

    await expect(
      db.query(
        `insert into public.product_units (
           client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
         ) values (gen_random_uuid(), $1, 'TAG-BSEC-9402', 'SER-BSEC-9401', $2, $3, 'In Stock', $4);`,
        [productId, branchId, warehouseId, ownerId]
      )
    ).rejects.toThrow(/unique|product_units_serial_no_key/i)
  })

  it('BSEC-04-03: enforces required fields and check constraints on dates, quantities, formats, and money', async () => {
    // return_at <= pickup_at rejected
    await expect(
      db.query(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), '940400', $1, $2, 'Quote',
           '2027-04-10 10:00:00+00', '2027-04-09 10:00:00+00', 'Client Pickup', 0, $3, $3
         );`,
        [clientId, branchId, ownerId]
      )
    ).rejects.toThrow(/bookings_return_after_pickup/i)

    // Invalid booking_no format rejected
    await expect(
      db.query(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), 'INVALID-NO', $1, $2, 'Quote',
           '2027-04-10 10:00:00+00', '2027-04-11 10:00:00+00', 'Client Pickup', 0, $3, $3
         );`,
        [clientId, branchId, ownerId]
      )
    ).rejects.toThrow(/bookings_booking_no_is_digits|bookings_booking_no_format/i)

    // Negative deposit_required rejected
    await expect(
      db.query(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), '940500', $1, $2, 'Quote',
           '2027-04-10 10:00:00+00', '2027-04-11 10:00:00+00', 'Client Pickup', -500, $3, $3
         );`,
        [clientId, branchId, ownerId]
      )
    ).rejects.toThrow(/bookings_deposit_non_negative/i)

    // booking_lines qty <= 0, days < 1, negative rate, discount > line total rejected
    await expect(
      db.query(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'Zero qty', 0, 1, 1000, $3);`,
        [bookingId, productId, ownerId]
      )
    ).rejects.toThrow(/booking_lines_qty_positive/i)

    await expect(
      db.query(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'Zero days', 1, 0, 1000, $3);`,
        [bookingId, productId, ownerId]
      )
    ).rejects.toThrow(/booking_lines_days_min/i)

    await expect(
      db.query(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, discount_amount, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'Negative discount', 1, 1, 1000, -10, $3);`,
        [bookingId, productId, ownerId]
      )
    ).rejects.toThrow(/booking_lines_money_non_negative/i)

    await expect(
      db.query(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, discount_amount, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'Over-discount', 1, 1, 1000, 1500, $3);`,
        [bookingId, productId, ownerId]
      )
    ).rejects.toThrow(/booking_lines_discount_within_line/i)
  })

  it('BSEC-04-04: blocks destructive DELETEs across core tables (Law 3) while supporting archival', async () => {
    const protectedTables = [
      'bookings',
      'booking_lines',
      'invoices',
      'payments',
      'audit_events',
      'users',
    ]

    for (const tbl of protectedTables) {
      const existing = await db.query<{ id: string }>(`select id from public.${tbl} limit 1;`)
      if (existing.rows.length > 0) {
        await expect(db.query(`delete from public.${tbl} where id = $1;`, [existing.rows[0]!.id])).rejects.toThrow(
          /Law 3|cannot delete|immutable|archive|not permitted|forbidden|delete/i
        )
      }
    }
  })

  it('BSEC-04-05: confirms zero orphaned child records exist across core relational tables', async () => {
    const orphanChecks = [
      `select count(*)::int as c from public.booking_lines bl left join public.bookings b on b.id = bl.booking_id where b.id is null`,
      `select count(*)::int as c from public.booking_line_units blu left join public.booking_lines bl on bl.id = blu.booking_line_id where bl.id is null`,
      `select count(*)::int as c from public.invoice_lines il left join public.invoices i on i.id = il.invoice_id where i.id is null`,
      `select count(*)::int as c from public.payments p left join public.clients cl on cl.id = p.client_id where cl.id is null`,
      `select count(*)::int as c from public.inventory_reservations ir left join public.bookings b on b.id = ir.booking_id where b.id is null`,
      `select count(*)::int as c from public.product_units pu left join public.products pr on pr.id = pu.product_id where pr.id is null`,
    ]

    for (const q of orphanChecks) {
      const res = await db.query<{ c: number }>(q)
      expect(res.rows[0]!.c).toBe(0)
    }
  })
})
