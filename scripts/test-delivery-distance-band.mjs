#!/usr/bin/env node
/**
 * O-28b (migration 0248) branch/privacy regression on disposable PGlite, never hosted Supabase.
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
  const branch = (await one('select id from public.branches order by created_at limit 1'))?.id
  assert.ok(branch, 'seed must contain a branch')

  const ids = {}
  const actors = [
    ['Manager', 'Manager'],
    ['Admin', 'Admin'],
    ['Coordinator', 'Coordinator'],
    ['Warehouse', 'Warehouse'],
    ['Client', 'Client'],
  ]
  for (const [name, role] of actors) {
    ids[name] = (await one(
      `insert into public.users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
       values(gen_random_uuid(),gen_random_uuid(),$1,$2,$3,'9800000098',$4,$5,true,$6) returning id`,
      [`DB-${name}`, `band-${name.toLowerCase()}@isolated.test`, `Band ${name}`, role, branch, owner],
    )).id
  }

  const zone = (await one(
    `insert into public.delivery_zones(name, is_active) values ('Band test zone', true) returning id`,
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
  const setBand = (min, max) => q('select public.set_delivery_zone_distance_band($1,$2,$3) as ok', [zone, min, max])
  const readBand = () => q('select min_km, max_km from public.delivery_zone_distance_bands where zone_id = $1', [zone])

  await check('Manager can set a band (over 3 to 7 km)', async () => {
    await asActor(ids.Manager, async () => {
      assert.equal((await setBand(3, 7)).rows[0].ok, true)
      const row = (await readBand()).rows[0]
      assert.equal(Number(row.min_km), 3)
      assert.equal(Number(row.max_km), 7)
    })
  })
  await check('Admin and Owner can set a band; open-ended upper bound is allowed', async () => {
    await asActor(ids.Admin, async () => {
      assert.equal((await setBand(0, 3)).rows[0].ok, true)
    })
    await asActor(owner, async () => {
      assert.equal((await setBand(25, null)).rows[0].ok, true)
      const row = (await readBand()).rows[0]
      assert.equal(Number(row.min_km), 25)
      assert.equal(row.max_km, null)
    })
  })
  await check('Coordinator, Warehouse and Client are refused the setter', async () => {
    for (const name of ['Coordinator', 'Warehouse', 'Client']) {
      await asActor(ids[name], async () => {
        await denied('select public.set_delivery_zone_distance_band($1,1,2)', [zone])
      })
    }
  })
  await check('A bad shape is refused: upper not above lower, upper without lower, negative', async () => {
    await asActor(owner, async () => {
      await rejectedWith('23514', 'select public.set_delivery_zone_distance_band($1,7,7)', [zone])
      await rejectedWith('23514', 'select public.set_delivery_zone_distance_band($1,7,3)', [zone])
      await rejectedWith('23514', 'select public.set_delivery_zone_distance_band($1,null,9)', [zone])
      await rejectedWith('23514', 'select public.set_delivery_zone_distance_band($1,-1,4)', [zone])
    })
  })
  await check('An unknown zone is refused', async () => {
    await asActor(owner, async () => {
      await rejectedWith('23503', 'select public.set_delivery_zone_distance_band(gen_random_uuid(),1,2)')
    })
  })
  await check('Clearing stores NULL and keeps the row (nothing is deleted)', async () => {
    await asActor(owner, async () => {
      assert.equal((await setBand(null, null)).rows[0].ok, true)
      const rows = (await readBand()).rows
      assert.equal(rows.length, 1)
      assert.equal(rows[0].min_km, null)
      assert.equal(rows[0].max_km, null)
    })
  })
  await check('Staff roles read bands; Client reads none', async () => {
    await asActor(owner, async () => {
      await setBand(0, 3)
    })
    await asActor(ids.Warehouse, async () => {
      assert.equal((await readBand()).rows.length, 1)
    })
    await asActor(ids.Client, async () => {
      assert.equal((await readBand()).rows.length, 0)
    })
  })
  await check('Direct writes to the table are refused for every authenticated role', async () => {
    await asActor(owner, async () => {
      await denied('insert into public.delivery_zone_distance_bands(zone_id,min_km) values (gen_random_uuid(),1)')
      await denied('update public.delivery_zone_distance_bands set min_km = 9')
      await denied('delete from public.delivery_zone_distance_bands')
    })
  })
  console.log(`Delivery distance band: ${passed}/8 PASS (isolated PGlite only)`)
} finally {
  await db.close()
}
