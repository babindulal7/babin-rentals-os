// Calendar contracts run exclusively against disposable local PGlite.
import assert from 'node:assert/strict'
import { randomUUID as uuid } from 'node:crypto'
import { readFileSync,readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
const db=await PGlite.create({extensions:{pgcrypto,btree_gist}})
const q=(sql,args=[])=>db.query(sql,args)
let passed=0
async function check(label,fn){await fn();passed++;console.log('PASS:',label)}
try {
  await db.exec(readFileSync('supabase/pglite-prelude.sql','utf8'))
  // Hosted Supabase grants authenticated access to auth.uid(); model that here.
  await db.exec('grant usage on schema auth to authenticated')
  for(const file of readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort()){
    try {await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))}catch(error){throw new Error(file+': '+error.message)}
  }
  console.log('Calendar migration chain rebuilt')
  const owner=uuid(),warehouseActor=uuid(),manager=uuid()
  let branch=(await q('select id from branches limit 1')).rows[0]?.id
  if(!branch)branch=(await q(`insert into branches(client_uuid,branch_code,name,address,phone,email,pan_vat_no,is_headquarters,is_active)
    values(gen_random_uuid(),'BR-CAL-A','Calendar A','Kathmandu','9800000000','calendar@example.test','123456789',true,true) returning id`)).rows[0].id
  const otherBranch=(await q(`insert into branches(client_uuid,branch_code,name,address,phone,email,pan_vat_no,is_headquarters,is_active)
    values(gen_random_uuid(),'BR-CAL-B','Calendar B','Pokhara','9800000001','calendar-b@example.test','123456780',false,true) returning id`)).rows[0].id
  for(const [id,role,site,index]of[[owner,'Owner',branch,1],[warehouseActor,'Warehouse',branch,2],[manager,'Manager',otherBranch,3]]){
    await q(`insert into users(id,client_uuid,employee_code,email,full_name,mobile,primary_role,branch_id,is_active,created_by)
      values($1,gen_random_uuid(),$2,$3,$4,$5,$6,$7,true,$1)`,[id,'CAL-'+index,'cal'+index+'@example.test','Calendar '+role,'980000001'+index,role,site])
  }
  await actor(owner,'postgres')
  const client=(await q(`insert into clients(client_uuid,client_code,name,type_parent,phone,created_by)
    values(gen_random_uuid(),next_document_number('client'),'Calendar Contract Client','Individual','+9779812345699',$1) returning id`,[owner])).rows[0].id
  const category=(await q('select id from inventory_categories limit 1')).rows[0]?.id
  if(!category)throw Error('No isolated category fixture')
  const product=(await q(`insert into products(client_uuid,name,brand,category_id,tracking_mode,asset_code,total_quantity,is_active,daily_rate,created_by)
    values(gen_random_uuid(),'Calendar Quantity Contract','Babin',$1,'Quantity','EQ991179',3,true,10000,$2) returning id`,[category,owner])).rows[0].id
  async function actor(id,role='authenticated'){
    await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await q("select set_config('app.current_user_id',$1,false)",[id]);await db.exec('set role '+role)
  }
  async function makeBooking(no,start,end,qty=1,stage='Quote',selectedProduct=product,unit=null){
    await actor(owner,'postgres')
    const row=(await q(`insert into bookings(client_uuid,booking_no,client_id,branch_id,stage,pickup_at,return_at,delivery_type,deposit_required,vat_rate,created_by,updated_by)
      values(gen_random_uuid(),$1,$2,$3,$4,$5,$6,'Client Pickup',0,0.13,$7,$7) returning id,updated_at::text as revision`,[no,client,branch,stage,start,end,owner])).rows[0]
    const line=(await q(`insert into booking_lines(client_uuid,booking_id,line_type,product_id,description,qty,days,rate,created_by)
      values(gen_random_uuid(),$1,'Equipment',$2,'Calendar quantity',$3,1,10000,$4) returning id`,[row.id,selectedProduct,qty,owner])).rows[0].id
    if(stage==='Booked'&&unit)await q(`insert into inventory_reservations(client_uuid,booking_id,booking_line_id,asset_id,qty,period,created_by) values(gen_random_uuid(),$1,$2,$3,1,tstzrange($4,$5,'[)'),$6)`,[row.id,line,unit,start,end,owner])
    else if(stage==='Booked')await q(`insert into inventory_reservations(client_uuid,booking_id,booking_line_id,product_id,qty,period,created_by)
      values(gen_random_uuid(),$1,$2,$3,$4,tstzrange($5,$6,'[)'),$7)`,[row.id,line,selectedProduct,qty,start,end,owner])
    await actor(owner);return {...row,line}
  }
  const move=async(row,days,key=uuid(),revision=row.revision)=>(await q('select reschedule_rental($1,$2,$3,$4,$5,null) as result',[row.id,revision,days,'Client requested a date move',key])).rows[0].result
  const quote=await makeBooking('991179','2027-01-10T00:15:00Z','2027-01-11T00:15:00Z')
  const key=uuid();let moved
  await check('Quote preserves exact duration and prices without minting reservations',async()=>{
    moved=await move(quote,2,key);assert.equal(new Date(moved.pickup_at).toISOString(),'2027-01-12T00:15:00.000Z')
    assert.equal(new Date(moved.return_at)-new Date(moved.pickup_at),86400000)
    assert.equal((await q('select count(*)::int as n from inventory_reservations where booking_id=$1',[quote.id])).rows[0].n,0)
    assert.equal((await q('select days from booking_lines where id=$1',[quote.line])).rows[0].days,1)
  })
  await check('Unchanged retry returns the same receipt',async()=>assert.deepEqual(await move(quote,2,key),moved))
  await check('Changed retry refused',async()=>assert.rejects(()=>move(quote,3,key),/another change/))
  await check('Stale revision refused',async()=>assert.rejects(()=>move(quote,3),/changed/))
  await actor(warehouseActor)
  await check('Warehouse rescheduling denied',async()=>assert.rejects(()=>move({...quote,revision:moved.revision},1),/cannot reschedule/))
  await actor(manager)
  await check('Manager other-branch move denied',async()=>assert.rejects(()=>move({...quote,revision:moved.revision},1),/branch access/))
  const booked=await makeBooking('991180','2027-02-10T00:15:00Z','2027-02-11T00:15:00Z',2,'Booked')
  await makeBooking('991181','2027-02-12T00:15:00Z','2027-02-13T00:15:00Z',2,'Booked')
  await check('Quantity conflict rolls back dates and holds',async()=>{
    await assert.rejects(()=>move(booked,2),/quantity is insufficient/)
    const unchanged=(await q('select pickup_at from bookings where id=$1',[booked.id])).rows[0]
    assert.equal(new Date(unchanged.pickup_at).toISOString(),'2027-02-10T00:15:00.000Z')
    assert.equal((await q('select lower(period) as start from inventory_reservations where booking_id=$1',[booked.id])).rows[0].start.toISOString(),'2027-02-10T00:15:00.000Z')
  })
  await check('Back-to-back quantity windows pass',async()=>assert.equal(new Date((await move(booked,1)).pickup_at).toISOString(),'2027-02-11T00:15:00.000Z'))
  const missingQuantity=await makeBooking('991187','2027-06-01T00:15:00Z','2027-06-02T00:15:00Z',1,'Booked')
  await actor(owner,'postgres');await q("update inventory_reservations set released_at=now(),released_reason='QA missing-hold contract' where booking_id=$1",[missingQuantity.id]);await actor(owner)
  await check('A Booked quantity line cannot move without its active hold',async()=>assert.rejects(()=>move(missingQuantity,1),/Quantity reservations are incomplete/))
  const crewMove=await makeBooking('991188','2027-07-01T00:15:00Z','2027-07-02T00:15:00Z',1,'Booked')
  const crewBusy=await makeBooking('991189','2027-07-03T00:15:00Z','2027-07-04T00:15:00Z',1,'Booked')
  await actor(owner,'postgres')
  for(const bookingId of [crewMove.id,crewBusy.id])await q(`insert into booking_crew_lines(client_uuid,booking_id,crew_member_id,name,crew_role,day_rate,days,created_by)
    values(gen_random_uuid(),$1,$2,'Calendar Crew','Driver',10000,1,$2)`,[bookingId,owner])
  await actor(owner)
  await check('A v2 assigned crew member cannot move into another rental',async()=>assert.rejects(()=>move(crewMove,2),/conflicting rental/))
  await check('Resource window is source-backed and money-free',async()=>{
    const result=(await q("select calendar_resource_window('2027-02-01','2027-03-01') as result")).rows[0].result
    assert.ok(result.resources.some(resource=>resource.id==='product:'+product));assert.ok(result.allocations.some(allocation=>allocation.booking_id===booked.id))
    assert.ok(result.sources.some(source=>source.id==='warehouse-bays'&&source.status==='unavailable'))
    assert.doesNotMatch(JSON.stringify(result),/daily_rate|purchase_price|day_rate|replacement_value|line_total|delivery_charge/)
  })
  await actor(warehouseActor)
  await check('Warehouse resource payload omits financial columns',async()=>{
    const result=(await q("select calendar_resource_window('2027-02-01','2027-03-01') as result")).rows[0].result
    assert.ok(Array.isArray(result.resources));assert.doesNotMatch(JSON.stringify(result),/daily_rate|purchase_price|day_rate|replacement_value|line_total|delivery_charge/)
  })
  const delivery=await makeBooking('991182','2027-03-10T00:15:00Z','2027-03-11T00:15:00Z',1,'Booked')
  await actor(owner,'postgres');await q(`insert into delivery_jobs(client_uuid,booking_id,branch_id,leg,scheduled_at,created_by,updated_by)
    values(gen_random_uuid(),$1,$2,'Return','2027-03-11T00:15:00Z',$3,$3)`,[delivery.id,branch,owner]);await actor(owner)
  await check('Independent delivery blocks Calendar move',async()=>assert.rejects(()=>move(delivery,1),/independently scheduled/))
  const packed=await makeBooking('991183','2027-04-01T00:15:00Z','2027-04-02T00:15:00Z',1,'Packed')
  await check('Packed rentals keep their existing actions',async()=>assert.rejects(()=>move(packed,1),/only Quote or Booked/))
  await actor(owner,'postgres')
  const serialProduct=(await q(`insert into products(client_uuid,name,brand,category_id,tracking_mode,asset_code,total_quantity,is_active,daily_rate,created_by)
    values(gen_random_uuid(),'Calendar Serial Contract','Babin',$1,'Serialised','EQ991180',1,true,10000,$2) returning id`,[category,owner])).rows[0].id
  let warehouse=(await q('select id from warehouses where branch_id=$1 limit 1',[branch])).rows[0]?.id
  if(!warehouse)warehouse=(await q(`insert into warehouses(client_uuid,branch_id,warehouse_code,name) values(gen_random_uuid(),$1,'WH-CAL-179','Calendar warehouse') returning id`,[branch])).rows[0].id
  const unit=(await q(`insert into product_units(client_uuid,product_id,asset_tag,branch_id,warehouse_id,condition,created_by)
    values(gen_random_uuid(),$1,'CAL-UNIT-179',$2,$3,'Good',$4) returning id`,[serialProduct,branch,warehouse,owner])).rows[0].id
  const serial=await makeBooking('991184','2027-04-10T00:15:00Z','2027-04-11T00:15:00Z',1,'Booked',serialProduct,unit)
  await makeBooking('991185','2027-04-12T00:15:00Z','2027-04-13T00:15:00Z',1,'Booked',serialProduct,unit)
  await check('A named serial cannot move into another live hold',async()=>assert.rejects(()=>move(serial,2),/assigned unit is reserved/))
  let serialSaved
  await check('A named serial allows exact back-to-back turnover',async()=>{serialSaved=await move(serial,1);assert.equal(new Date(serialSaved.pickup_at).toISOString(),'2027-04-11T00:15:00.000Z')})
  await actor(owner,'postgres')
  const cleaning=(await q(`insert into cleaning_queue_entries
    (client_uuid,booking_id,unit_id,requires_clean,requires_reset,state,qc_fail_reason,created_by)
    values(gen_random_uuid(),$1,$2,true,true,'Waiting','   ',$3) returning id`,[serial.id,unit,owner])).rows[0].id
  await q('select recompute_unit_status($1)',[unit]);await actor(owner)
  await check('Routine cleaning with an empty QC note does not block a usable serial',async()=>{
    serialSaved=await move({...serial,revision:serialSaved.revision},3)
    assert.equal(new Date(serialSaved.pickup_at).toISOString(),'2027-04-14T00:15:00.000Z')
  })
  await actor(owner,'postgres');await q("update cleaning_queue_entries set qc_fail_reason='Optical alignment failed',problem_state='Needs Repair' where id=$1",[cleaning]);await actor(owner)
  await check('A genuine QC failure blocks a date move',async()=>assert.rejects(()=>move({...serial,revision:serialSaved.revision},1),/blocked by damage/))
  await actor(owner,'postgres');await q("update cleaning_queue_entries set qc_fail_reason=null,problem_state='No Problems' where id=$1",[cleaning]);await actor(owner)
  await actor(owner,'postgres');await q(`update product_units set condition='Damaged' where id=$1`,[unit]);await actor(owner)
  await check('A real defect blocks an existing serial reservation date move',async()=>assert.rejects(()=>move({...serial,revision:serialSaved.revision},3),/blocked by damage/))
  const scoped=await makeBooking('991186','2027-05-10T00:15:00Z','2027-05-11T00:15:00Z')
  await actor(owner,'postgres');await q('update users set branch_id=$1 where id=$2',[branch,manager]);await actor(manager)
  const managerKey=uuid();await move(scoped,1,managerKey)
  await actor(owner,'postgres');await q('update users set branch_id=$1 where id=$2',[otherBranch,manager]);await actor(manager)
  await check('A transferred Manager cannot replay a previously authorized receipt',async()=>assert.rejects(()=>move(scoped,1,managerKey),/branch access/))
  console.log(`Calendar planning: ${passed} contract groups passed`)
}catch(error){console.error('Calendar contract failure:',error.message,error.where??'');process.exitCode=1}finally{await db.close()}
