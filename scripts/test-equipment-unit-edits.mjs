#!/usr/bin/env node
// Disposable local Postgres proof. Never connects to hosted Supabase.
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
const sql = (text, values = []) => db.query(text, values)
let passed = 0
function check(value, message) { assert.ok(value, message); passed++; console.log(`PASS ${message}`) }
async function refused(fn, pattern, message) { await assert.rejects(fn, pattern); passed++; console.log(`PASS ${message}`) }
const ids = {}
try {
  await db.exec(readFileSync(join(root, 'supabase/pglite-prelude.sql'), 'utf8'))
  for (const file of readdirSync(join(root, 'supabase/migrations')).filter(file => file.endsWith('.sql') && Number(file.slice(0,4)) <= 178).sort()) {
    await db.exec(readFileSync(join(root, 'supabase/migrations', file), 'utf8'))
  }
  const branch = (await sql(`insert into branches(client_uuid,branch_code,name,address,phone,email,pan_vat_no) values(gen_random_uuid(),'BR-UTA','Unit test A','Kathmandu','+977-1-4444401','unit-a@example.invalid','123456781') returning id`)).rows[0].id
  const other = (await sql(`insert into branches(client_uuid,branch_code,name,address,phone,email,pan_vat_no) values(gen_random_uuid(),'BR-UTB','Unit test B','Kathmandu','+977-1-4444402','unit-b@example.invalid','123456782') returning id`)).rows[0].id
  for (const role of ['Owner','Admin','Manager','Warehouse','Technician','Coordinator','Accounts','Driver','Client']) {
    ids[role] = crypto.randomUUID()
    await sql(`insert into users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
      values($1,gen_random_uuid(),$2,$3,$2,$4,$5,$6,true,$1)`,[ids[role],`EMP-UNIT-${role.toUpperCase()}`,`unit-${role.toLowerCase()}@example.invalid`,`+97798000${String(Object.keys(ids).length).padStart(5,'0')}`,role,branch])
  }
  const warehouse = (await sql(`insert into warehouses(client_uuid,branch_id,warehouse_code,name) values(gen_random_uuid(),$1,'WH-UTA','Unit warehouse') returning id`,[branch])).rows[0].id
  const otherWarehouse = (await sql(`insert into warehouses(client_uuid,branch_id,warehouse_code,name) values(gen_random_uuid(),$1,'WH-UTB','Other unit warehouse') returning id`,[other])).rows[0].id
  const category = (await sql('select id from inventory_categories order by name limit 1')).rows[0].id
  const product = (await sql(`insert into products(client_uuid,name,brand,category_id,tracking_mode,asset_code,total_quantity,daily_rate,created_by)
    values(gen_random_uuid(),'Unit edit test','Babin',$1,'Serialised','EQ909901',2,1234,$2) returning id`,[category,ids.Owner])).rows[0].id
  async function newUnit(tag, serial, home = branch, place = warehouse) {
    return (await sql(`insert into product_units(client_uuid,product_id,asset_tag,serial_no,branch_id,warehouse_id,condition,created_by)
      values(gen_random_uuid(),$1,$2,$3,$4,$5,'Good',$6) returning id`,[product,tag,serial,home,place,ids.Owner])).rows[0].id
  }
  const unit = await newUnit('UNIT-ONE','SERIAL-ONE')
  const sibling = await newUnit('UNIT-TWO','SERIAL-TWO')
  const foreignUnit = await newUnit('UNIT-OTHER','SERIAL-OTHER',other,otherWarehouse)
  const as = async role => { await sql('select set_config($1,$2,false)',['app.current_user_id',ids[role]]); await sql('select set_config($1,$2,false)',['request.jwt.claim.sub',ids[role]]) }
  const revision = async id => String((await sql('select updated_at::text as revision from product_units_v where id=$1',[id])).rows[0].revision)
  const save = async (id, rev, patch, key=crypto.randomUUID()) => (await sql('select update_equipment_unit($1,$2,$3,$4::jsonb) as result',[id,rev,key,JSON.stringify(patch)])).rows[0].result
  await as('Owner'); await sql('set role authenticated')
  const initial = await revision(unit)
  const key = crypto.randomUUID()
  const first = await save(unit, initial, { assetTag:' UNIT-ONE-SAVED ', serialNo:'', rack:'A', shelf:'B', bin:'C' },key)
  check(first.assetTag==='UNIT-ONE-SAVED' && first.serialNo===null && first.rack==='A' && first.shelf==='B' && first.bin==='C','identity and grouped location persist with nullable serial')
  check(Date.parse(first.revision)!==Date.parse(initial),'confirmed response carries a changed database revision')
  check(!Object.keys(first).some(key=>/price|cost|amount|value|branch|warehouse/i.test(key)),'RPC response contains no financial or reparenting fields')
  const persisted=(await sql('select asset_tag,serial_no,rack,shelf,bin from product_units_v where id=$1',[unit])).rows[0]
  check(persisted.asset_tag===first.assetTag && persisted.shelf==='B','reload reads confirmed values from the database view')
  const replay=await save(unit,initial,{assetTag:'UNIT-ONE-SAVED',serialNo:null,rack:'A',shelf:'B',bin:'C'},key)
  check(JSON.stringify(replay)===JSON.stringify(first),'unchanged interrupted retry returns its original receipt')
  await refused(()=>save(unit,initial,{assetTag:'DIFFERENT'},key),/another change/,'changed retry payload is refused')
  await refused(()=>save(unit,initial,{rack:'D'}),/unit changed/i,'stale editor is refused')
  for (const field of ['status','state','purchase_price','replacement_value','warehouse_id','branch_id','retired_at']) {
    await refused(()=>save(unit,first.revision,{[field]:'unsafe'}),/cannot be changed/,'forbidden '+field+' is refused')
  }
  await refused(()=>save(unit,first.revision,{assetTag:' '}),/asset tag is required/,'blank unique identity is refused')
  await refused(()=>save(unit,first.revision,{assetTag:'UNIT-TWO'}),/unique constraint/,'duplicate asset tag is refused')
  await refused(()=>save(unit,first.revision,{serialNo:'SERIAL-TWO'}),/unique constraint/,'duplicate manufacturer serial is refused')
  check(Date.parse(await revision(unit))===Date.parse(first.revision),'refused updates preserve the confirmed revision')
  for (const role of ['Warehouse','Technician','Coordinator','Accounts','Driver','Client']) {
    await as(role)
    await refused(()=>save(unit,first.revision,{rack:'NO'}),/Permission denied/,'role '+role+' is refused by PostgreSQL')
  }
  await as('Manager')
  const manager=await save(unit,first.revision,{rack:'M'})
  check(manager.rack==='M','Manager may edit a unit in the recorded current branch')
  await refused(()=>save(foreignUnit,manager.revision,{rack:'NO'}),/branch access denied/,'Manager cannot edit another branch')
  await as('Owner')
  const foreignRevision=await revision(foreignUnit)
  check((await save(foreignUnit,foreignRevision,{rack:'GLOBAL'})).rack==='GLOBAL','Owner keeps authorized cross-branch edits')
  await sql('reset role')
  await sql(`update product_units set condition='Damaged' where id=$1`,[sibling])
  await sql('set role authenticated')
  await refused(async()=>save(sibling,await revision(sibling),{condition:'Good'}),/Condition changes require/,'inline editor cannot clear a damaged condition')
  await refused(()=>save(unit,manager.revision,{condition:'Damaged'}),/Condition changes require/,'damage classification uses its named workflow')
  const good=await save(unit,manager.revision,{condition:'Fair'})
  check(good.condition==='Fair','usable intake correction is persisted')
  await sql('reset role')
  const queue=(await sql(`insert into cleaning_queue_entries(client_uuid,unit_id,created_by,qc_fail_reason)
    values(gen_random_uuid(),$1,$2,'Observed mechanical defect') returning id`,[unit,ids.Owner])).rows[0].id
  await sql('set role authenticated')
  await refused(async()=>save(unit,await revision(unit),{condition:'Excellent'}),/Condition changes require/,'unfinished or completed QC defect cannot be cleared inline')
  await sql('reset role')
  await sql(`insert into damage_findings(client_uuid,source,cleaning_queue_entry_id,unit_id,damage_type,description,severity,created_by)
    values(gen_random_uuid(),'Cleaning',$1,$2,'Mechanical','Local observed damage','Recorded',$3)`,[queue,unit,ids.Owner])
  await sql('set role authenticated')
  await refused(async()=>save(unit,await revision(unit),{condition:'Good'}),/Condition changes require/,'unresolved finding remains outside intake correction')
  await sql('reset role')
  const audit=(await sql('select count(*)::int as count from audit_events where client_uuid=$1',[key])).rows[0].count
  check(audit===1,'an idempotent retry writes exactly one immutable audit')
  await sql('update users set is_active=false where id=$1',[ids.Admin]); await as('Admin'); await sql('set role authenticated')
  await refused(()=>save(unit,good.revision,{rack:'NO'}),/Permission denied/,'inactive privileged actor is refused')
  await sql('reset role'); await sql('set role anon')
  await refused(()=>save(unit,good.revision,{rack:'NO'}),/permission denied/i,'anonymous invocation is revoked')
  console.log(`Unit edit PostgreSQL contracts: ${passed} assertions passed.`)
} catch (error) { console.error(error.message); if(error.query) console.error(error.query); process.exitCode=1 } finally { await db.close() }
