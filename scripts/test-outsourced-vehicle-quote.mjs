#!/usr/bin/env node
/**
 * S2 row 8 (migration 0250) branch/privacy regression on disposable PGlite, never hosted Supabase.
 * Runs the real SECURITY DEFINER RPC under authenticated test identities.
 * Hosted JWT/PostgREST verification is STILL REQUIRED before production.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const q = (sql, args = []) => db.query(sql, args)
const one = async (sql, args = []) => (await q(sql, args)).rows[0]
let passed = 0
const check = async (name, action) => {
  await action()
  console.log(`PASS ${name}`)
  passed++
}
const denied = async (sql, args = []) => {
  await assert.rejects(q(sql, args), error => error.code === '42501', 'expected permission denial (42501)')
}
const rejectedWith = async (code, sql, args = []) => {
  await assert.rejects(q(sql, args), error => error.code === code, `expected SQLSTATE ${code}`)
}
try {
  await db.exec(readFileSync(join(root, 'supabase/pglite-prelude.sql'), 'utf8'))
  for (const file of readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(root, 'supabase/migrations', file), 'utf8'))
  }

  const owner = (await one("select id from public.users where primary_role = 'Owner' order by created_at limit 1"))?.id
  assert.ok(owner, 'seed must contain an Owner')
  const branchA = (await one('select id from public.branches order by created_at limit 1'))?.id
  assert.ok(branchA, 'seed must contain a branch')
  const branchB = (await one(
    `insert into public.branches(client_uuid,branch_code,name,address,phone,created_by)
     values(gen_random_uuid(),'BR-OVQ-TEST','Outsourced quote branch','Local fixture','9800000008',$1) returning id`,
    [owner],
  )).id

  const ids = {}
  const actors = [
    ['ManagerA', 'Manager', branchA],
    ['ManagerB', 'Manager', branchB],
    ['Admin', 'Admin', branchA],
    ['Coordinator', 'Coordinator', branchA],
    ['Warehouse', 'Warehouse', branchA],
    ['Driver', 'Driver', branchA],
    ['Client', 'Client', branchA],
  ]
  for (const [name, role, site] of actors) {
    ids[name] = (await one(
      `insert into public.users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
       values(gen_random_uuid(),gen_random_uuid(),$1,$2,$3,'9800000097',$4,$5,true,$6) returning id`,
      [`OV-${name}`, `ovq-${name.toLowerCase()}@isolated.test`, `Ovq ${name}`, role, site, owner],
    )).id
  }

  const clientCode = (await one("select next_document_number('client') as code")).code
  const clientId = (await one(
    `insert into public.clients(client_uuid,client_code,name,phone,created_by)
     values(gen_random_uuid(),$1,'Outsourced quote client','+9779800000010',$2) returning id`, [clientCode, owner],
  )).id
  const bookingNo = (await one("select next_document_number('booking') as no")).no
  const booking = (await one(
    `insert into public.bookings(client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by)
     values(gen_random_uuid(),$1,$2,$3,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z','Babin Delivery','Booked',$4,$4) returning id`,
    [bookingNo, clientId, branchA, owner],
  )).id

  const asActor = async (id, action) => {
    await db.exec('reset role')
    await q(
      "select set_config('app.current_user_id',$1,false), set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)",
      [id],
    )
    await db.exec('set role authenticated')
    try {
      return await action()
    } finally {
      try {
        await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)")
      } catch {
        await db.exec('rollback')
        await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)")
      }
    }
  }
  const record = (cu, vendor = 'Test Cargo Vendor', paisa = 250000, note = 'Quote confirmed by phone', bookingId = booking) =>
    q('select public.record_outsourced_vehicle_quote($1,$2,$3,$4,$5) as ok', [cu, bookingId, vendor, paisa, note])
  const rows = () => q('select * from public.booking_outsourced_vehicle_quotes where booking_id = $1', [booking])
  const cuA = crypto.randomUUID()

  await check('Manager in the booking branch records a quote; the approver is the caller', async () => {
    await asActor(ids.ManagerA, async () => {
      assert.equal((await record(cuA)).rows[0].ok, true)
      const row = (await rows()).rows[0]
      assert.equal(row.approved_by, ids.ManagerA)
      assert.equal(row.vendor, 'Test Cargo Vendor')
      assert.equal(String(row.quote_paisa), '250000')
      assert.equal(row.approval_note, 'Quote confirmed by phone')
    })
  })
  await check('A retry with the same client_uuid repeats safely and adds no row', async () => {
    await asActor(ids.ManagerA, async () => {
      assert.equal((await record(cuA)).rows[0].ok, true)
      assert.equal((await rows()).rows.length, 1)
    })
  })
  await check('A changed quote is a new row; the earlier one is kept', async () => {
    await asActor(ids.ManagerA, async () => {
      await record(crypto.randomUUID(), 'Test Cargo Vendor', 300000, 'Revised after fuel')
      assert.equal((await rows()).rows.length, 2)
    })
  })
  await check('Owner and Admin may record across branches; Coordinator in branch may too', async () => {
    await asActor(owner, async () => { assert.equal((await record(crypto.randomUUID())).rows[0].ok, true) })
    await asActor(ids.Admin, async () => { assert.equal((await record(crypto.randomUUID())).rows[0].ok, true) })
    await asActor(ids.Coordinator, async () => { assert.equal((await record(crypto.randomUUID())).rows[0].ok, true) })
  })
  await check('A Manager of another branch is refused', async () => {
    await asActor(ids.ManagerB, async () => {
      await denied('select public.record_outsourced_vehicle_quote($1,$2,$3,$4,$5)', [crypto.randomUUID(), booking, 'V', 100, 'n'])
    })
  })
  await check('Warehouse, Driver and Client are refused (money-blind and non-writer roles)', async () => {
    for (const name of ['Warehouse', 'Driver', 'Client']) {
      await asActor(ids[name], async () => {
        await denied('select public.record_outsourced_vehicle_quote($1,$2,$3,$4,$5)', [crypto.randomUUID(), booking, 'V', 100, 'n'])
      })
    }
  })
  await check('Bad input is refused: blank vendor, zero or negative amount, blank note, unknown booking', async () => {
    await asActor(owner, async () => {
      await rejectedWith('23514', "select public.record_outsourced_vehicle_quote($1,$2,'   ',100,'n')", [crypto.randomUUID(), booking])
      await rejectedWith('23514', "select public.record_outsourced_vehicle_quote($1,$2,'V',0,'n')", [crypto.randomUUID(), booking])
      await rejectedWith('23514', "select public.record_outsourced_vehicle_quote($1,$2,'V',-5,'n')", [crypto.randomUUID(), booking])
      await rejectedWith('23514', "select public.record_outsourced_vehicle_quote($1,$2,'V',100,'  ')", [crypto.randomUUID(), booking])
      await rejectedWith('P0002', "select public.record_outsourced_vehicle_quote($1,gen_random_uuid(),'V',100,'n')", [crypto.randomUUID()])
    })
  })
  await check('Money-visible roles read the quotes; Warehouse and Client read none', async () => {
    await asActor(ids.ManagerA, async () => { assert.ok((await rows()).rows.length >= 2) })
    await asActor(ids.Warehouse, async () => { assert.equal((await rows()).rows.length, 0) })
    await asActor(ids.Client, async () => { assert.equal((await rows()).rows.length, 0) })
  })
  await check('Direct writes are refused for authenticated roles', async () => {
    await asActor(owner, async () => {
      await denied('insert into public.booking_outsourced_vehicle_quotes(client_uuid,booking_id,vendor,quote_paisa,approval_note,approved_by) values (gen_random_uuid(),$1,$2,100,$3,$4)', [booking, 'V', 'n', owner])
      await denied('update public.booking_outsourced_vehicle_quotes set quote_paisa = 1')
      await denied('delete from public.booking_outsourced_vehicle_quotes')
    })
  })
  await check('Law 3: even a privileged role cannot edit or delete a quote', async () => {
    await db.exec('reset role')
    await rejectedWith('23001', 'update public.booking_outsourced_vehicle_quotes set quote_paisa = 1')
    await rejectedWith('23001', 'delete from public.booking_outsourced_vehicle_quotes')
  })
  await check('Every recorded quote is in the audit log with the quote in it', async () => {
    await db.exec('reset role')
    const audited = (await q(
      `select count(*)::int n from public.audit_events where table_name = 'booking_outsourced_vehicle_quotes' and action = 'Create'`,
    )).rows[0].n
    const total = (await q('select count(*)::int n from public.booking_outsourced_vehicle_quotes')).rows[0].n
    assert.ok(total >= 5)
    assert.equal(audited, total)
  })
  console.log(`Outsourced vehicle quote: ${passed}/11 PASS (isolated PGlite only)`)
} finally {
  await db.close()
}
