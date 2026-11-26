/** Disposable Postgres regression: Reset grants are not just an action-layer check. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const query = (sql, args = []) => db.query(sql, args)
const first = async (sql, args = []) => (await query(sql, args)).rows[0]
const actor = async id => {
  await db.exec('reset role')
  await query("select set_config('app.current_user_id',$1,false), set_config('request.jwt.claim.sub',$1,false)", [id ?? ''])
  await db.exec('set role authenticated')
}
const maintenance = async () => {
  await db.exec('reset role')
  await db.exec("select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
}
let passed = 0
const test = async (name, run) => { await run(); console.log(`PASS ${name}`); passed++ }
const denied = async (sql, args = []) => {
  try { assert.equal((await query(sql, args)).rows.length, 0, 'unauthorized write changed rows') }
  catch (error) {
    if (error.code !== '42501' && !/operations\.grant/.test(error.message)) throw error
  }
}

try {
  await db.exec(readFileSync('supabase/pglite-prelude.sql', 'utf8'))
  for (const file of readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    if (process.argv.includes('--without-fix') && file.startsWith('0172_')) continue
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  const owner = (await first("select id from users where primary_role='Owner' limit 1")).id
  const branchA = (await first('select id from branches order by created_at limit 1')).id
  const branchB = (await first(`insert into branches(client_uuid,branch_code,name,address,phone,created_by)
    values(gen_random_uuid(),'BR-RESET-TEST','Disposable Reset branch','Local fixture','9800000099',$1) returning id`, [owner])).id
  const whA = (await first('select id from warehouses where branch_id=$1 limit 1', [branchA])).id
  const whB = (await first(`insert into warehouses(client_uuid,warehouse_code,branch_id,name,created_by)
    values(gen_random_uuid(),'WH-RESET-TEST',$1,'Disposable warehouse',$2) returning id`, [branchB, owner])).id
  const units = (await query('select id from product_units order by id limit 2')).rows
  const unitA = units[0].id
  const unitB = units[1].id
  await query('update product_units set warehouse_id=$1,branch_id=$2 where id=$3', [whA, branchB, unitA])
  await query('update product_units set warehouse_id=$1,branch_id=$2 where id=$3', [whB, branchA, unitB])
  const ids = {}
  for (const [role, code] of [['Warehouse','981'], ['Warehouse','982'], ['Driver','983']]) {
    ids[code] = (await first(`insert into users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
      values(gen_random_uuid(),gen_random_uuid(),$1,$2,$3,$4,$5,$6,true,$7) returning id`,
    [`RT-${code}`, `reset-${code}@isolated.test`, `Synthetic ${role}`, `9800000${code}`, role, branchA, owner])).id
  }
  const scoped = ids['981'], pristine = ids['982'], driver = ids['983']
  const client = (await first('select id from clients limit 1')).id
  const bookings = []
  for (const branch of [branchA, branchB]) {
    bookings.push((await first(`insert into bookings(client_uuid,booking_no,client_id,branch_id,pickup_at,return_at,delivery_type,stage,created_by,updated_by)
      values(gen_random_uuid(),next_document_number('booking'),$1,$2,'2099-12-20T04:00:00Z','2099-12-22T04:00:00Z','Client Pickup','Quote',$3,$3) returning id`, [client, branch, owner])).id)
  }
  const queue = async (booking, unit) => (await first(`insert into cleaning_queue_entries(client_uuid,booking_id,unit_id,created_by,requires_reset)
    values(gen_random_uuid(),$1,$2,$3,true) returning id`, [booking, unit, owner])).id
  const bookedA = await queue(bookings[0], unitB) // booking wins over warehouse B
  const bookedB = await queue(bookings[1], unitA) // booking wins over warehouse A
  const unbookedA = await queue(null, unitA), unbookedB = await queue(null, unitB)
  const category = (await first('select p.category_id from products p join product_units u on u.product_id=p.id where u.id=$1', [unitA])).category_id
  const task = (await first(`insert into category_checklist_tasks(client_uuid,category_id,mode,label,created_by)
    values(gen_random_uuid(),$1,'Reset','Synthetic Reset check',$2) returning id`, [category,owner])).id
  const results = []
  for (const entry of [unbookedA, unbookedB]) {
    results.push((await first(`insert into cleaning_task_results(client_uuid,cleaning_queue_entry_id,checklist_task_id,checklist_version,mode,created_by)
      values(gen_random_uuid(),$1,$2,1,'Reset',$3) returning id`, [entry, task, owner])).id)
  }
  await actor(owner)
  const grant = (await first("select issue_operations_grant(gen_random_uuid(),$1,$2,'reset') id", [scoped,branchA])).id
  await query("select issue_operations_grant(gen_random_uuid(),$1,$2,'reset')", [driver,branchA])
  const update = id => query('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,id])

  await actor(scoped)
  await test('booked branch overrides unit warehouse: A succeeds, B is refused', async () => {
    assert.equal((await update(bookedA)).rows.length, 1)
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,bookedB])
  })
  await test('unbooked uses warehouse branch, NOT stale unit.branch_id or staff branch', async () => {
    assert.equal((await update(unbookedA)).rows.length, 1)
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,unbookedB])
  })
  await test('queue cannot launder OLD denied scope into an allowed booking/unit', async () => {
    await denied('update cleaning_queue_entries set booking_id=$1,unit_id=$2 where id=$3 returning id', [bookings[0],unitA,bookedB])
    await denied('update cleaning_queue_entries set unit_id=$1 where id=$2 returning id', [unitA,unbookedB])
  })
  await test('queue cannot move an allowed row into NEW denied booking/unit scope', async () => {
    await denied('update cleaning_queue_entries set booking_id=$1 where id=$2 returning id', [bookings[1],bookedA])
    await denied('update cleaning_queue_entries set unit_id=$1 where id=$2 returning id', [unitB,unbookedA])
  })
  await test('direct queue insert is denied across branch and allowed in scope', async () => {
    await denied('insert into cleaning_queue_entries(client_uuid,unit_id,created_by) values(gen_random_uuid(),$1,$2) returning id', [unitB,scoped])
    assert.equal((await query('insert into cleaning_queue_entries(client_uuid,unit_id,created_by) values(gen_random_uuid(),$1,$2) returning id', [unitA,scoped])).rows.length, 1)
  })
  await test('task update is scoped through its queue parent', async () => {
    assert.equal((await query('update cleaning_task_results set completed=false where id=$1 returning id', [results[0]])).rows.length, 1)
    await denied('update cleaning_task_results set completed=false where id=$1 returning id', [results[1]])
  })
  await test('task reparenting requires BOTH old and new scopes', async () => {
    await denied('update cleaning_task_results set cleaning_queue_entry_id=$1 where id=$2 returning id', [bookedB,results[0]])
    await denied('update cleaning_task_results set cleaning_queue_entry_id=$1 where id=$2 returning id', [bookedA,results[1]])
  })
  await test('direct task insertion cannot bypass the queue scope', async () => {
    await denied(`insert into cleaning_task_results(client_uuid,cleaning_queue_entry_id,checklist_task_id,checklist_version,mode,created_by)
      values(gen_random_uuid(),$1,$2,2,'Reset',$3) returning id`, [unbookedB,task,scoped])
    assert.equal((await query(`insert into cleaning_task_results(client_uuid,cleaning_queue_entry_id,checklist_task_id,checklist_version,mode,created_by)
      values(gen_random_uuid(),$1,$2,2,'Reset',$3) returning id`, [unbookedA,task,scoped])).rows.length, 1)
  })
  await test('missing unit/site and missing booking fail closed', async () => {
    assert.equal((await first('select auth_may_reset_entry(null,gen_random_uuid()) allowed')).allowed, false)
    assert.equal((await first('select auth_may_reset_entry(gen_random_uuid(),$1) allowed', [unitA])).allowed, false)
    await assert.rejects(query("select assert_operation_branch_grant('reset',gen_random_uuid())"), /does not exist/)
  })
  await test('warehouse transfer changes unbooked authorization on the next write', async () => {
    await maintenance()
    await query('update product_units set warehouse_id=$1 where id=$2', [whB,unitA])
    await actor(scoped)
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,unbookedA])
    await maintenance()
    await query('update product_units set warehouse_id=$1 where id=$2', [whA,unitA])
    await actor(scoped)
    assert.equal((await update(unbookedA)).rows.length, 1)
  })
  await test('revoking the last grant scopes to nothing, reissue restores only A', async () => {
    await actor(owner)
    await query('select revoke_operations_grant(gen_random_uuid(),$1)', [grant])
    await actor(scoped)
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,unbookedA])
    await actor(owner)
    await query("select issue_operations_grant(gen_random_uuid(),$1,$2,'reset')", [scoped,branchA])
    await actor(scoped)
    assert.equal((await update(unbookedA)).rows.length, 1)
  })
  await test('pristine actors retain existing role policy; grant never authorizes Driver', async () => {
    await actor(pristine)
    assert.equal((await update(bookedB)).rows.length, 1)
    await actor(driver)
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [driver,bookedA])
  })
  await test('unknown and inactive actors cannot write or authorize work', async () => {
    await actor(crypto.randomUUID())
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,bookedA])
    assert.equal((await first('select auth_may_reset_entry(null,$1) allowed', [unitA])).allowed, false)
    await maintenance()
    await query('update users set is_active=false where id=$1', [scoped])
    await actor(scoped)
    await denied('update cleaning_queue_entries set assigned_to=$1 where id=$2 returning id', [scoped,bookedA])
    await actor(null)
    assert.equal((await first('select auth_may_reset_entry(null,$1) allowed', [unitA])).allowed, false)
  })
  await test('anon cannot call the helper; no new role grant or definer privilege', async () => {
    await maintenance()
    assert.equal((await first("select has_function_privilege('anon','auth_may_reset_entry(uuid,uuid)','execute') allowed")).allowed, false)
    assert.equal((await first("select prosecdef from pg_proc where oid='auth_may_reset_entry(uuid,uuid)'::regprocedure")).prosecdef, false)
    assert.equal((await first("select count(*)::int n from pg_policies where policyname like 'reset_%_boundary' and permissive='RESTRICTIVE'")).n, 6)
  })
  console.log(`${passed}/${passed} Reset branch regression groups passed (local only).`)
} catch (error) {
  console.error(`FAIL after ${passed} groups: ${error.code ?? ''} ${error.message}`)
  process.exitCode = 1
} finally { await db.close() }
