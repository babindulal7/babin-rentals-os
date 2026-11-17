#!/usr/bin/env node
/**
 * T4-09 branch/privacy regression on disposable PGlite, never hosted Supabase.
 * Checks real SECURITY DEFINER RPC execution under authenticated test identities.
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
     values(gen_random_uuid(),'BR-ROUTE-TEST','Delivery security branch','Local fixture','9800000009',$1) returning id`,
    [owner],
  )).id

  const ids = {}
  const actors = [
    ['ManagerA', 'Manager', branchA],
    ['ManagerB', 'Manager', branchB],
    ['WarehouseB', 'Warehouse', branchB],
    ['DriverA', 'Driver', branchA],
    ['OtherDriverA', 'Driver', branchA],
    ['Client', 'Client', branchA],
  ]
  for (const [name, role, site] of actors) {
    const id = (await one(
      `insert into public.users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
       values(gen_random_uuid(),gen_random_uuid(),$1,$2,$3,'9800000099',$4,$5,true,$6) returning id`,
      [`RT-${name}`, `route-${name.toLowerCase()}@isolated.test`, `Route ${name}`, role, site, owner],
    )).id
    ids[name] = id
  }

  const client = async name => {
    const code = (await one("select next_document_number('client') as code")).code
    return (await one(
      `insert into public.clients(client_uuid,client_code,name,phone,created_by)
       values(gen_random_uuid(),$1,$2,'9800000010',$3) returning id`, [code, name, owner],
    )).id
  }
  const clientA = await client('Delivery Security A')
  const clientB = await client('Delivery Security B')
  const booking = async (clientId, site) => {
    const number = (await one("select next_document_number('booking') as no")).no
    return (await one(
      `insert into public.bookings(client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by)
       values(gen_random_uuid(),$1,$2,$3,'2099-12-20T04:00:00Z','2099-12-26T04:00:00Z',
              'Babin Delivery','Booked',$4,$4) returning id`,
      [number, clientId, site, owner],
    )).id
  }
  const job = async (clientId, site, assignedDriverId = null) => {
    const bookingId = await booking(clientId, site)
    return (await one(
      `insert into public.delivery_jobs(client_uuid,booking_id,branch_id,leg,scheduled_at,assigned_driver_id,created_by,updated_by)
       values(gen_random_uuid(),$1,$2,'Outbound','2099-12-23T09:00:00Z',$3,$4,$4) returning id`,
      [bookingId, site, assignedDriverId, owner],
    )).id
  }
  const jobA = await job(clientA, branchA, ids.DriverA)
  await job(clientA, branchA) // same branch but NOT assigned to DriverA
  const jobB = await job(clientB, branchB, null)

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
  const route = site => q('select * from public.get_day_route($1,$2::date)', [site,'2099-12-23'])
  const mapLinks = site => q('select public.generate_google_maps_links($1,$2::date)', [site,'2099-12-23'])
  const pin = clientId => q('select public.set_client_map_pin($1,27.72,85.33) as changed', [clientId])

  await check('Owner can inspect routes in both branches without missing-column error', async () => {
    await asActor(owner, async () => {
      assert.equal((await route(branchA)).rows.length, 2)
      assert.equal((await route(branchB)).rows.length, 1)
    })
  })
  await check('Manager sees own branch, other branch is denied', async () => {
    await asActor(ids.ManagerA, async () => {
      assert.equal((await route(branchA)).rows.length, 2)
      await denied('select * from public.get_day_route($1,$2::date)', [branchB,'2099-12-23'])
      await denied('select public.generate_google_maps_links($1,$2::date)', [branchB,'2099-12-23'])
    })
  })
  await check('Warehouse is restricted to assigned branch, not every route', async () => {
    await asActor(ids.WarehouseB, async () => {
      assert.deepEqual((await route(branchB)).rows.map(r => r.id), [jobB])
      await denied('select * from public.get_day_route($1,$2::date)', [branchA,'2099-12-23'])
    })
  })
  await check('Driver sees only personally assigned delivery jobs', async () => {
    await asActor(ids.DriverA, async () => {
      const rows = (await route(branchA)).rows
      assert.deepEqual(rows.map(r => r.id), [jobA])
      assert.equal(rows[0].zone_name, null)
      assert.equal(rows[0].zone_fee_paisa, null)
      await denied('select * from public.get_day_route($1,$2::date)', [branchB,'2099-12-23'])
    })
    await asActor(ids.OtherDriverA, async () => {
      assert.equal((await route(branchA)).rows.length, 0)
    })
  })
  await check('Client is refused route and pin RPCs', async () => {
    await asActor(ids.Client, async () => {
      await denied('select * from public.get_day_route($1,$2::date)', [branchA,'2099-12-23'])
      await denied('select public.set_client_map_pin($1,27.72,85.33)', [clientA])
    })
  })
  await check('Branch-scoped map pins accept matching delivery clients only', async () => {
    await asActor(ids.ManagerA, async () => {
      assert.equal((await pin(clientA)).rows[0].changed, true)
      await denied('select public.set_client_map_pin($1,27.72,85.33)', [clientB])
    })
    await asActor(ids.ManagerB, async () => {
      assert.equal((await pin(clientB)).rows[0].changed, true)
      await denied('select public.set_client_map_pin($1,27.72,85.33)', [clientA])
    })
  })
  await check('Generated maps inherit the same branch/driver route scope', async () => {
    await asActor(ids.DriverA, async () => {
      const links = (await mapLinks(branchA)).rows[0].generate_google_maps_links
      assert.equal(links.length, 1)
      assert.equal(links[0].stops.length, 1)
    })
  })
  console.log(`Delivery route security: ${passed}/7 PASS (isolated PGlite only)`)
} finally {
  await db.close()
}
