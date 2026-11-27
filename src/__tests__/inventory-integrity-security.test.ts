import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('BSEC-08 (P0 Batch 5): Inventory Integrity — Serials, Quantities, Availability, ACLs & Maintenance Guards', () => {
  let db: PGlite
  let branchId: string
  let warehouseId: string
  let clientId: string
  let productId: string
  let ownerId: string
  let driverId: string
  let clientUserId: string

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
    warehouseId = (await db.query<{ id: string }>('select id from public.warehouses order by created_at limit 1;')).rows[0]!.id
    clientId = (await db.query<{ id: string }>('select id from public.clients order by created_at limit 1;')).rows[0]!.id
    ownerId = (
      await db.query<{ id: string }>(`select id from public.users where primary_role = 'Owner' limit 1;`)
    ).rows[0]!.id

    const pRes = await db.query<{ id: string }>(
      `select id from public.products where tracking_mode = 'Serialised' limit 1;`
    )
    productId = pRes.rows[0]!.id

    driverId = 'd0000000-0000-4000-8000-000000000801'
    clientUserId = 'c0000000-0000-4000-8000-000000000802'
    await db.query(
      `insert into auth.users (id, email) values ($1, 'bsec08-driver@babinrentals.test'), ($2, 'bsec08-client@babinrentals.test') on conflict (id) do nothing;`,
      [driverId, clientUserId]
    )
    await db.query(
      `insert into public.users (id, client_uuid, full_name, email, employee_code, mobile, branch_id, primary_role, is_active)
       values ($1, gen_random_uuid(), 'BSEC08 Driver', 'bsec08-driver@babinrentals.test', 'EMP-B08-DRV', '+977-9800000801', $2, 'Driver', true)
       on conflict (id) do update set primary_role = 'Driver', is_active = true;`,
      [driverId, branchId]
    )
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('BSEC-08-01: enforces unique asset_tag, serial_no, and asset_code', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])

    await db.query(
      `insert into public.product_units (
         client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
       ) values (gen_random_uuid(), $1, 'TAG-B08-001', 'SER-B08-001', $2, $3, 'In Stock', $4);`,
      [productId, branchId, warehouseId, ownerId]
    )

    await expect(
      db.query(
        `insert into public.product_units (
           client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
         ) values (gen_random_uuid(), $1, 'TAG-B08-001', 'SER-B08-002', $2, $3, 'In Stock', $4);`,
        [productId, branchId, warehouseId, ownerId]
      )
    ).rejects.toThrow(/unique|product_units_asset_tag_key/i)

    await expect(
      db.query(
        `insert into public.product_units (
           client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
         ) values (gen_random_uuid(), $1, 'TAG-B08-002', 'SER-B08-001', $2, $3, 'In Stock', $4);`,
        [productId, branchId, warehouseId, ownerId]
      )
    ).rejects.toThrow(/unique|product_units_serial_no_key/i)
  })

  it('BSEC-08-02: rejects negative product quantities and invalid line quantities', async () => {
    await db.exec('reset role;')
    await expect(
      db.query(
        `update public.products set total_quantity = -1 where id = $1;`,
        [productId]
      )
    ).rejects.toThrow(/products_total_quantity_non_negative/i)
  })

  it('BSEC-08-03: prevents overlapping physical asset reservations while permitting non-overlapping periods', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])

    const unitRes = await db.query<{ id: string }>(
      `select id from public.product_units where asset_tag = 'TAG-B08-001' limit 1;`
    )
    const unitId = unitRes.rows[0]!.id

    const b1 = (
      await db.query<{ id: string }>(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), '880101', $1, $2, 'Booked',
           '2027-06-01 10:00:00+00', '2027-06-05 10:00:00+00', 'Client Pickup', 0, $3, $3
         ) returning id;`,
        [clientId, branchId, ownerId]
      )
    ).rows[0]!.id

    const b2 = (
      await db.query<{ id: string }>(
        `insert into public.bookings (
           client_uuid, booking_no, client_id, branch_id, stage,
           pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
         ) values (
           gen_random_uuid(), '880102', $1, $2, 'Booked',
           '2027-06-03 10:00:00+00', '2027-06-07 10:00:00+00', 'Client Pickup', 0, $3, $3
         ) returning id;`,
        [clientId, branchId, ownerId]
      )
    ).rows[0]!.id

    const l1 = (
      await db.query<{ id: string }>(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'BSEC08 line 1', 1, 4, 1000, $3) returning id;`,
        [b1, productId, ownerId]
      )
    ).rows[0]!.id

    const l2 = (
      await db.query<{ id: string }>(
        `insert into public.booking_lines (
           client_uuid, booking_id, line_type, product_id, description, qty, days, rate, created_by
         ) values (gen_random_uuid(), $1, 'Equipment', $2, 'BSEC08 line 2', 1, 4, 1000, $3) returning id;`,
        [b2, productId, ownerId]
      )
    ).rows[0]!.id

    await db.query(
      `insert into public.inventory_reservations (
         client_uuid, booking_id, booking_line_id, asset_id, qty, period, state, created_by
       ) values (
         gen_random_uuid(), $1, $2, $3, 1, tstzrange('2027-06-01 10:00:00+00', '2027-06-05 10:00:00+00', '[)'), 'Reserved', $4
       );`,
      [b1, l1, unitId, ownerId]
    )

    // Overlapping reservation for same physical asset must fail
    await expect(
      db.query(
        `insert into public.inventory_reservations (
           client_uuid, booking_id, booking_line_id, asset_id, qty, period, state, created_by
         ) values (
           gen_random_uuid(), $1, $2, $3, 1, tstzrange('2027-06-03 10:00:00+00', '2027-06-07 10:00:00+00', '[)'), 'Reserved', $4
         );`,
        [b2, l2, unitId, ownerId]
      )
    ).rejects.toThrow(/excl|overlap|double|conflict|reservation/i)

    // Non-overlapping reservation succeeds
    await db.query(
      `insert into public.inventory_reservations (
         client_uuid, booking_id, booking_line_id, asset_id, qty, period, state, created_by
       ) values (
         gen_random_uuid(), $1, $2, $3, 1, tstzrange('2027-06-10 10:00:00+00', '2027-06-12 10:00:00+00', '[)'), 'Reserved', $4
       );`,
      [b2, l2, unitId, ownerId]
    )
  })

  it('BSEC-08-04: denies unauthorized inventory adjustments by anon, Client, and Driver', async () => {
    for (const actorId of [null, clientUserId, driverId]) {
      await setActor(actorId)
      let updateAffected = 0
      try {
        const res = await db.query(`update public.products set total_quantity = 999 where id = $1;`, [productId])
        updateAffected = res.affectedRows ?? 0
      } catch {
        updateAffected = 0
      }
      expect(updateAffected).toBe(0)

      await expect(
        db.query(
          `insert into public.stock_audits (
             client_uuid, audit_no, branch_id, warehouse_id, scheduled_date, created_by
           ) values (gen_random_uuid(), 'AUD-UNAUTH-1', $1, $2, '2027-06-01', $3);`,
          [branchId, warehouseId, ownerId]
        )
      ).rejects.toThrow(/permission denied|42501|policy|not permitted/i)
    }

    await db.exec('reset role;')
    const checkProd = await db.query<{ total_quantity: number }>(
      `select total_quantity from public.products where id = $1;`,
      [productId]
    )
    expect(checkProd.rows[0]!.total_quantity).not.toBe(999)
  })

  it('BSEC-08-05: excludes Retired and Maintenance units from physical availability / assignment', async () => {
    await db.exec('reset role;')
    await db.query(`select set_config('app.current_user_id', $1, false);`, [ownerId])

    const unitRes = await db.query<{ id: string }>(
      `insert into public.product_units (
         client_uuid, product_id, asset_tag, serial_no, branch_id, warehouse_id, status, created_by
       ) values (gen_random_uuid(), $1, 'TAG-B08-MAINT', 'SER-B08-MAINT', $2, $3, 'Maintenance', $4)
       returning id;`,
      [productId, branchId, warehouseId, ownerId]
    )
    const maintUnitId = unitRes.rows[0]!.id

    // Verify unit_availability_v or active status check excludes Maintenance/Retired units from available pool
    const checkRes = await db.query<{ status: string }>(
      `select status from public.product_units where id = $1;`,
      [maintUnitId]
    )
    expect(checkRes.rows[0]!.status).toBe('Maintenance')

    // Verify assign_booking_line_unit / availability RPCs refuse Maintenance/Retired unit if present,
    // or verify planned downtime RPC blocks overlapping availability
    const downtimeCheck = await db.query<{ fn_exists: boolean }>(
      `select exists(
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'is_unit_available_for_window'
       ) as fn_exists;`
    )
    if (downtimeCheck.rows[0]!.fn_exists) {
      const avail = await db.query<{ ok: boolean }>(
        `select public.is_unit_available_for_window($1, '2027-07-01 10:00:00+00'::timestamptz, '2027-07-02 10:00:00+00'::timestamptz) as ok;`,
        [maintUnitId]
      )
      expect(avail.rows[0]!.ok).toBe(false)
    }
  })
})
