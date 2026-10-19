/** Phase 0 regressions: real effective SQL, disposable in-process database only. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const db = await PGlite.create({ extensions: { pgcrypto, btree_gist } })
let passed = 0
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`) }
async function rows(sql, args=[]) { return (await db.query(sql,args)).rows }
async function actor(id) {
  await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
  await db.query("select set_config('app.current_user_id',$1,false),set_config('request.jwt.claim.sub',$1,false),set_config('app.in_create_booking','',false)",[id])
  await db.exec('set role authenticated')
}
async function denied(sql,args=[]) {
  await assert.rejects(db.query(sql,args), error => /42501|permission|not permitted|requires active|cannot modify/i.test(`${error.code} ${error.message}`))
}
try {
  await db.exec(readFileSync('supabase/pglite-prelude.sql','utf8'))
  for (const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
  const users=await rows('select id,primary_role from users')
  const owner=users.find(u=>u.primary_role==='Owner').id
  const admin=users.find(u=>u.primary_role==='Admin').id
  const operator=users.find(u=>u.primary_role==='Warehouse').id
  const booking=(await rows("select id,client_id,branch_id from bookings where cancelled_at is null and archived_at is null and stage <> 'Closed' order by id limit 1"))[0]
  const foreignBooking=(await rows('select id,client_id from bookings where client_id<>$1 limit 1',[booking.client_id]))[0]
  const product=(await rows('select id from products limit 1'))[0].id
  const otherOwner=users.find(u=>u.primary_role==='Owner'&&u.id!==owner).id
  await db.exec('grant usage on schema storage,auth to authenticated; grant select,insert,update,delete on storage.objects to authenticated')
  // Storage prelude has no hosted grants: simulate standard API grants explicitly.
  await db.query("insert into storage.objects(bucket_id,name) values('documents','unregistered/foreign.pdf')")
  await db.query("update clients set email='phase0-portal@example.test' where id=$1",[booking.client_id])
  await test('SEC-02: every API role is denied the internal estimate helper',async()=>{
    for(const role of ['Owner','Admin','Manager','Coordinator','Accounts','Warehouse','Technician','Driver','Client']) {
      await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); await db.query('update users set primary_role=$1 where id=$2',[role,operator]); await actor(operator)
      await denied('select booking_estimate_total($1)',[booking.id])
      if(['Warehouse','Technician','Driver','Client'].includes(role)) await denied('select get_model_daily_rate($1,null)',[product])
      else assert.ok((await rows('select get_model_daily_rate($1,null) rate',[product]))[0].rate!==undefined)
    }
  })
  await test('SEC-03: Client cannot forge Owner audit',async()=>{
    await actor(operator)
    await denied("insert into audit_events(client_uuid,table_name,record_id,actor_id,actor_role,reason) values(gen_random_uuid(),'bookings',$1,$2,'Owner','spoofed')",[booking.id,owner])
  })
  await test('SEC-03: staff direct audit identity is server-bound',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); await db.query("update users set primary_role='Warehouse' where id=$1",[operator]); await actor(operator)
    await db.query("insert into audit_events(client_uuid,table_name,record_id,actor_id,actor_role,reason) values(gen_random_uuid(),'bookings',$1,$2,'Owner','phase0-bound')",[booking.id,owner])
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); const result=(await rows("select actor_id,actor_role from audit_events where reason='phase0-bound'"))[0]
    assert.deepEqual(result,{actor_id:operator,actor_role:'Warehouse'})
  })
  await test('SEC-04: Admin cannot modify superior targets or its own privilege/identity fields',async()=>{
    await actor(admin)
    await denied("update users set primary_role='Coordinator' where id=$1",[otherOwner])
    await denied("update users set full_name='Spoofed owner' where id=$1",[otherOwner])
    await denied("update users set primary_role='Coordinator' where id=$1",[admin])
    await denied("update users set id=gen_random_uuid() where id=$1",[admin])
    await db.query("update users set full_name='Admin own profile' where id=$1",[admin])
  })
  await test('SEC-04: Owner retains ordinary staff administration',async()=>{
    await actor(owner); await db.query("update users set full_name='Phase0 Operator' where id=$1",[operator])
  })
  await test('SEC-05: unassigned Driver gets no client/bookings/lines',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); await db.query("update users set primary_role='Driver' where id=$1",[operator]); await actor(operator)
    for(const table of ['clients','bookings','booking_lines']) assert.equal((await rows(`select count(*)::int n from ${table}`))[0].n,0,table)
  })
  await test('SEC-05: assigned open trip grants only that booking and client; completion revokes',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
    await db.query(`insert into delivery_jobs(client_uuid,booking_id,branch_id,leg,scheduled_at,status,assigned_driver_id,created_by,updated_by)
      values(gen_random_uuid(),$1,$2,'Outbound',now(),'Scheduled',$3,$4,$4)`,[booking.id,booking.branch_id,operator,owner])
    await actor(operator)
    assert.deepEqual(await rows('select id from bookings'),[{id:booking.id}])
    assert.deepEqual(await rows('select id from clients'),[])
    const trip=(await rows('select driver_trip_context($1) trip',[booking.id]))[0].trip
    assert.equal(trip.bookingId,booking.id)
    assert.ok(!JSON.stringify(trip).match(/government_id|pan_vat|billing|rate|amount|total/i))
    await denied('select driver_trip_context($1)',[foreignBooking.id])
    assert.equal((await rows('select count(*)::int n from booking_lines where booking_id=$1',[foreignBooking.id]))[0].n,0)
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); await db.query("update delivery_jobs set status='Failed' where assigned_driver_id=$1",[operator]); await actor(operator)
    assert.equal((await rows('select count(*)::int n from bookings'))[0].n,0)
    await denied('select driver_trip_context($1)',[booking.id])
    assert.equal((await rows('select count(*)::int n from clients_v'))[0].n,0)
    assert.equal((await rows('select count(*)::int n from booking_lines_v'))[0].n,0)
  })
  await test('SEC-01: orphan documents unreadable and immutable for authenticated Client',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); await db.query("update users set primary_role='Client',email='phase0-portal@example.test' where id=$1",[operator]); await actor(operator)
    assert.equal((await rows('select count(*)::int n from storage.objects'))[0].n,0)
    assert.equal((await rows("update storage.objects set name='overwritten.pdf' returning id")).length,0)
    assert.equal((await rows('delete from storage.objects returning id')).length,0)
    await denied("insert into storage.objects(bucket_id,name) values('documents','unregistered/spoof.pdf')")
  })
  await test('SEC-01: own registry document is readable; foreign document and evidence are denied',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
    for(const [id,name] of [[booking.client_id,'legacy/own.pdf'],[foreignBooking.client_id,'legacy/foreign.pdf']]) {
      await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[name])
      await db.query("insert into document_registry(client_uuid,document_no,document_type,client_id,file_url,created_by) values(gen_random_uuid(),$1,'Tax Invoice',$2,$3,$4)",[name,id,name,owner])
    }
    await db.query("insert into storage.objects(bucket_id,name) values('evidence','orphan/private-id.jpg')")
    await actor(operator)
    assert.deepEqual(await rows('select name from storage.objects'),[{name:'legacy/own.pdf'}])
  })
  await test('SEC-01: commercial staff upload only own namespace; cannot replace another file',async()=>{
    await actor(owner)
    const own=`staff/${owner}/doc.pdf`,other=`staff/${admin}/doc.pdf`
    await db.query("insert into storage.objects(bucket_id,name) values('documents',$1)",[own])
    await denied("insert into storage.objects(bucket_id,name) values('documents',$1)",[other])
    assert.equal((await rows('update storage.objects set name=$1 where name=$2 returning id',[other,own])).length,0)
  })
  await test('SEC-01: unassigned Warehouse cannot read/upload another session evidence or commercial document',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)"); await db.query("update users set primary_role='Warehouse' where id=$1",[operator]); await actor(operator)
    assert.equal((await rows("select count(*)::int n from storage.objects where bucket_id='documents'"))[0].n,0)
    await denied("insert into storage.objects(bucket_id,name) values('evidence',$1)",[`${booking.id}/00000000-0000-0000-0000-000000000999/photo.jpg`])
  })
  await test('SEC-01: assigned floor session can upload evidence; completed session cannot',async()=>{
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
    const session=(await rows("insert into operation_sessions(client_uuid,booking_id,operation,session_no,warehouse_staff_id,created_by) values(gen_random_uuid(),$1,'Packing',999,$2,$2) returning id",[booking.id,operator]))[0].id
    await actor(operator)
    const name=booking.id+'/'+session+'/photo.jpg'
    await db.query("insert into storage.objects(bucket_id,name) values('evidence',$1)",[name])
    assert.deepEqual(await rows("select name from storage.objects where bucket_id='evidence'"),[{name}])
    await db.exec("reset role; select set_config('app.current_user_id','',false),set_config('request.jwt.claim.sub','',false)")
    await db.query("update operation_sessions set state='Completed',completed_at=now(),completed_by=$2 where id=$1",[session,operator])
    await actor(operator)
    await denied("insert into storage.objects(bucket_id,name) values('evidence',$1)",[booking.id+'/'+session+'/late.jpg'])
  })
  console.log(`${passed} Phase 0 SQL regressions passed; hosted Storage/JWT remains separately required.`)
} finally { await db.close() }
