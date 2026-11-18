#!/usr/bin/env node
/**
 * S2 row 6 (migration 0251) branch/privacy regression on disposable PGlite, never hosted Supabase.
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
     values(gen_random_uuid(),'BR-WAIT-TEST','Waiting charge branch','Local fixture','9800000008',$1) returning id`,
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
      [`WT-${name}`, `wait-${name.toLowerCase()}@isolated.test`, `Wait ${name}`, role, site, owner],
    )).id
  }

  const clientCode = (await one("select next_document_number('client') as code")).code
  const clientId = (await one(
    `insert into public.clients(client_uuid,client_code,name,phone,created_by)
     values(gen_random_uuid(),$1,'Waiting charge client','+9779800000010',$2) returning id`, [clientCode, owner],
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
  const stageOf = async id => (await one('select stage from public.bookings where id = $1', [id])).stage
  const draftInvoice = async (bookingId) => (await one(
    `insert into public.invoices(client_uuid,booking_id,client_id,branch_id,status,due_date,currency,discount_percent,vat_rate,created_by,updated_by)
     values(gen_random_uuid(),$1,$2,$3,'Draft',current_date,'NPR',0,0.1300,$4,$4) returning id`,
    [bookingId, clientId, branchA, owner],
  )).id
  const add = (cu, minutes = 25, paisa = 15000, note = 'Driver waited for the client', bookingId = booking) =>
    q('select * from public.add_waiting_charge_line($1,$2,$3,$4,$5)', [cu, bookingId, minutes, paisa, note])
  const waitingLines = (bookingId = booking) => q("select * from public.booking_lines where booking_id = $1 and description like 'Waiting charge%'", [bookingId])
  const cuA = crypto.randomUUID()

  await check('Manager in the branch adds a flat Service line at the typed amount (no invoice yet)', async () => {
    let r
    await asActor(ids.ManagerA, async () => { r = (await add(cuA)).rows[0] })
    assert.equal(r.appended_to_draft, false)
    assert.equal(r.invoice_id, null)
    await db.exec('reset role')
    const line = (await waitingLines()).rows[0]
    assert.equal(line.line_type, 'Service')
    assert.equal(line.service_basis, 'Flat')
    assert.equal(Number(line.rate), 150)
    assert.equal(line.description, 'Waiting charge (25 min)')
    assert.equal(line.created_by, ids.ManagerA)
  })
  await check('A retry with the same client_uuid returns the same line and writes nothing', async () => {
    let again
    await asActor(ids.ManagerA, async () => { again = (await add(cuA)).rows[0] })
    assert.ok(again.line_id)
    await db.exec('reset role')
    assert.equal((await waitingLines()).rows.length, 1)
  })
  await check('With a Draft invoice, the line is appended to it and the invoice total grows by the amount', async () => {
    await db.exec('reset role')
    const inv = await draftInvoice(booking)
    const before = Number((await one('select subtotal from public.invoices where id = $1', [inv])).subtotal)
    await asActor(ids.Coordinator, async () => {
      const r = (await add(crypto.randomUUID(), 40, 20000, 'Second wait')).rows[0]
      assert.equal(r.appended_to_draft, true)
      assert.equal(r.invoice_id, inv)
    })
    await db.exec('reset role')
    const after = Number((await one('select subtotal from public.invoices where id = $1', [inv])).subtotal)
    assert.equal(after - before, 200)
    const il = (await q("select line_kind, unit_rate, line_total from public.invoice_lines where invoice_id = $1 and description like 'Waiting charge%'", [inv])).rows
    assert.equal(il.length, 1)
    assert.equal(il[0].line_kind, 'Services')
    assert.equal(Number(il[0].line_total), 200)
  })
  await check('An issued invoice refuses the charge in words and adds nothing (R-03)', async () => {
    await db.exec('reset role')
    const no2 = (await one("select next_document_number('booking') as no")).no
    const b2 = (await one(
      `insert into public.bookings(client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by)
       values(gen_random_uuid(),$1,$2,$3,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z','Babin Delivery','Booked',$4,$4) returning id`,
      [no2, clientId, branchA, owner],
    )).id
    const inv2 = await draftInvoice(b2)
    await q("update public.invoices set invoice_no = 'INV-WAIT-TEST-1', issue_date = current_date, status = 'Sent' where id = $1", [inv2])
    await asActor(owner, async () => {
      await assert.rejects(add(crypto.randomUUID(), 10, 5000, 'x', b2), e => e.code === 'P0001' && /already issued/.test(e.message))
    })
    await db.exec('reset role')
    assert.equal((await waitingLines(b2)).rows.length, 0)
  })
  await check('Owner and Admin may add across branches', async () => {
    await asActor(owner, async () => { assert.ok((await add(crypto.randomUUID(), 5, 1000)).rows[0].line_id) })
    await asActor(ids.Admin, async () => { assert.ok((await add(crypto.randomUUID(), 5, 1000)).rows[0].line_id) })
  })
  await check('A Manager of another branch is refused', async () => {
    await asActor(ids.ManagerB, async () => {
      await denied('select * from public.add_waiting_charge_line($1,$2,5,1000,null)', [crypto.randomUUID(), booking])
    })
  })
  await check('Warehouse, Driver and Client are refused (money-blind and non-writer roles)', async () => {
    for (const name of ['Warehouse', 'Driver', 'Client']) {
      await asActor(ids[name], async () => {
        await denied('select * from public.add_waiting_charge_line($1,$2,5,1000,null)', [crypto.randomUUID(), booking])
      })
    }
  })
  await check('Bad input is refused: zero or huge minutes, zero or negative amount, unknown booking', async () => {
    await asActor(owner, async () => {
      await rejectedWith('23514', 'select * from public.add_waiting_charge_line($1,$2,0,1000,null)', [crypto.randomUUID(), booking])
      await rejectedWith('23514', 'select * from public.add_waiting_charge_line($1,$2,1441,1000,null)', [crypto.randomUUID(), booking])
      await rejectedWith('23514', 'select * from public.add_waiting_charge_line($1,$2,5,0,null)', [crypto.randomUUID(), booking])
      await rejectedWith('23514', 'select * from public.add_waiting_charge_line($1,$2,5,-100,null)', [crypto.randomUUID(), booking])
      await rejectedWith('P0002', 'select * from public.add_waiting_charge_line($1,gen_random_uuid(),5,1000,null)', [crypto.randomUUID()])
    })
  })
  await check('Every waiting-charge line is in the audit log', async () => {
    await db.exec('reset role')
    const total = (await q("select count(*)::int n from public.booking_lines where description like 'Waiting charge%'")).rows[0].n
    const audited = (await q("select count(*)::int n from public.audit_events where table_name = 'booking_lines' and action = 'Create'")).rows[0].n
    assert.ok(total >= 4)
    assert.equal(audited, total)
  })
  console.log(`Waiting charge: ${passed}/9 PASS (isolated PGlite only)`)
} finally {
  await db.close()
}
