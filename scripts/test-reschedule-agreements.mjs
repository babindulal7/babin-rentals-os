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
  const signed=await makeBooking('991190','2027-04-10T00:15:00Z','2027-04-11T00:15:00Z',1,'Booked')
  await actor(owner,'postgres')
  const originalPath='staff/'+owner+'/original-agreement.pdf'
  const original=(await q(`insert into document_registry(client_uuid,document_no,document_type,booking_id,client_id,lifecycle_status,file_url,signed_at,signed_by_name,created_by)
   values(gen_random_uuid(),'LOCAL-AGR-1','Rental Agreement',$1,$2,'Signed',$3,now(),'Original Signer',$4) returning id`,[signed.id,client,originalPath,owner])).rows[0].id
  await q("insert into storage.objects(bucket_id,name) values('documents',$1)",[originalPath])
  await actor(owner)
  await check('Signed dates cannot move without replacement',async()=>assert.rejects(()=>move(signed,1),/signed agreement|replacement/))
  const proposal=uuid(),from='2027-04-11T00:15:00Z',to='2027-04-12T00:15:00Z'
  const prepare=async(key=proposal,revision=signed.revision)=>(await q('select prepare_reschedule_agreement($1,$2,$3,$4,$5) as result',[signed.id,revision,from,to,key])).rows[0].result
  await check('Proposal binds original document and exact dates',async()=>{const result=await prepare();assert.equal(result.originalDocumentId,original);assert.equal(result.proposalId,proposal)})
  await check('Proposal retry is stable',async()=>assert.deepEqual(await prepare(),await prepare()))
  await check('Reviewed signed document content and identity are sealed',async()=>{
    await assert.rejects(()=>q("update document_registry set file_url='staff/forged.pdf' where id=$1",[original]),/immutable after amendment review/)
    await assert.rejects(()=>q("update document_registry set signed_by_name='Different Signer' where id=$1",[original]),/immutable after amendment review/)
  })
  await check('Reviewed signatures cannot be hidden by a nonterminal lifecycle label',async()=>{
    for(const status of ['Draft','Pending Approval','Pending Signature','Issued']){
      await assert.rejects(()=>q('update document_registry set lifecycle_status=$1 where id=$2',[status,original]),/only move to a terminal state/)
    }
    await assert.rejects(()=>q("update document_registry set lifecycle_status='Void' where id=$1",[original]),/void timestamp/)
    await assert.rejects(()=>q("update document_registry set voided_at=now(),void_reason='Client asked to void the agreement' where id=$1",[original]),/must use the Void lifecycle/)
    await assert.rejects(()=>move(signed,1),/signed agreement|replacement/)
  })
  await check('Changed proposal request refused',async()=>assert.rejects(()=>q('select prepare_reschedule_agreement($1,$2,$3,$4,$5)',[signed.id,signed.revision,'2027-04-12T00:15:00Z','2027-04-13T00:15:00Z',proposal]),/another change/))
  const pdfPath='staff/'+owner+'/'+proposal+'-agreement.pdf',signaturePath='staff/'+owner+'/'+proposal+'-signature.png'
  const ready=async(method='upload',name='New Signer',hash='a'.repeat(64),signature=null)=>
   q('select ready_reschedule_agreement($1,$2,$3,$4,$5,$6,$7,$8)',[proposal,method,name,'Client representative','b'.repeat(64),pdfPath,hash,signature])
  await check('Unconfirmed private upload refused',async()=>assert.rejects(()=>ready(),/upload was not confirmed/))
  await actor(owner,'postgres');await q("insert into storage.objects(bucket_id,name) values('documents',$1),('documents',$2)",[pdfPath,signaturePath]);await actor(owner)
  await check('Null hashes refused',async()=>assert.rejects(()=>ready('upload','New Signer',null),/required/))
  await check('Cross-actor evidence path refused',async()=>assert.rejects(()=>q('select ready_reschedule_agreement($1,$2,$3,$4,$5,$6,$7,null)',[proposal,'upload','New Signer','Client representative','b'.repeat(64),'staff/'+manager+'/forged.pdf','a'.repeat(64)]),/required|upload was not confirmed/))
  await check('Drawn mode requires retained signature image',async()=>assert.rejects(()=>ready('draw'),/required/))
  await check('Signed upload becomes ready',async()=>{await ready();await ready()})
  await check('Ready signature details cannot be replaced',async()=>assert.rejects(()=>ready('upload','Other Signer'),/immutable/))
  await actor(manager)
  await check('Another actor cannot consume proposal',async()=>assert.rejects(()=>q('select ready_reschedule_agreement($1,$2,$3,$4,$5,$6,$7,null)',[proposal,'upload','New Signer','Client representative','b'.repeat(64),pdfPath,'a'.repeat(64)]),/not found/))
  await actor(owner)
  const key=uuid()
  const commit=async()=>(await q('select reschedule_rental($1,$2,1,$3,$4,$5) as result',[signed.id,signed.revision,'Client signed the new dates',key,proposal])).rows[0].result
  await check('Signed replacement and date move commit atomically',async()=>{const result=await commit();assert.equal(new Date(result.pickup_at).toISOString(),new Date(from).toISOString());assert.deepEqual(await commit(),result)})
  await actor(owner,'postgres')
  await check('Original signed record and bytes reference remain unchanged',async()=>{
   const old=(await q('select lifecycle_status,file_url,signed_by_name from document_registry where id=$1',[original])).rows[0]
   assert.deepEqual(old,{lifecycle_status:'Signed',file_url:originalPath,signed_by_name:'Original Signer'})
   assert.equal((await q('select count(*)::int n from record_editor_private.agreement_versions where previous_document=$1',[original])).rows[0].n,1)
   const latest=(await q('select record_editor_private.current_reschedule_agreement($1) id',[signed.id])).rows[0].id
   assert.notEqual(latest,original)
   assert.equal((await q('select count(*)::int n from document_registry where id=$1',[latest])).rows[0].n,1)
  })
  await actor(warehouseActor)
  await check('Money-blind role cannot prepare agreement',async()=>assert.rejects(()=>prepare(uuid()),/cannot be rescheduled/))
  await actor(owner)
  const currentRevision=(await q('select updated_at::text revision from bookings where id=$1',[signed.id])).rows[0].revision
  const nextFrom='2027-04-13T00:15:00Z',nextTo='2027-04-14T00:15:00Z'
  const createNext=async(id,revision)=>(await q('select prepare_reschedule_agreement($1,$2,$3,$4,$5) result',[signed.id,revision,nextFrom,nextTo,id])).rows[0].result
  const cancelled=await createNext(uuid(),currentRevision)
  await check('Cancellation is idempotent and retains a closed proposal',async()=>{await q('select cancel_reschedule_agreement($1)',[cancelled.proposalId]);await q('select cancel_reschedule_agreement($1)',[cancelled.proposalId])})
  await check('Cancelled proposal cannot be signed',async()=>assert.rejects(()=>q('select ready_reschedule_agreement($1,$2,$3,$4,$5,$6,$7,null)',[cancelled.proposalId,'upload','Signer','Client','b'.repeat(64),pdfPath,'a'.repeat(64)]),/closed/))
  const drawn=await createNext(uuid(),currentRevision)
  const drawnPdf='staff/'+owner+'/'+drawn.proposalId+'-agreement.pdf',drawnImage='staff/'+owner+'/'+drawn.proposalId+'-signature.png'
  await actor(owner,'postgres');await q("insert into storage.objects(bucket_id,name) values('documents',$1),('documents',$2)",[drawnPdf,drawnImage]);await actor(owner)
  await check('Drawn amendment requires and retains its own image object',async()=>{await q('select ready_reschedule_agreement($1,$2,$3,$4,$5,$6,$7,$8)',[drawn.proposalId,'draw','Drawn Signer','Client representative','c'.repeat(64),drawnPdf,'d'.repeat(64),drawnImage])})
  const secondKey=uuid()
  await check('Drawn agreement and schedule commit through the same atomic boundary',async()=>{const result=(await q('select reschedule_rental($1,$2,2,$3,$4,$5) result',[signed.id,currentRevision,'Client signed the drawn amendment',secondKey,drawn.proposalId])).rows[0].result;assert.equal(new Date(result.pickup_at).toISOString(),new Date(nextFrom).toISOString())})
  await check('Current agreement history identifies the retained original and replacements',async()=>{
    const history=(await q('select rental_agreement_version_history() result')).rows[0].result
    assert.equal(history.length,2);assert.ok(history.some(row=>row.previous_document===original))
    assert.doesNotMatch(JSON.stringify(history),/price|rate|amount|file_url|signature_url/)
  })
  const mislabeled=await makeBooking('991191','2027-08-10T00:15:00Z','2027-08-11T00:15:00Z')
  await actor(owner,'postgres')
  const mislabeledDocument=(await q(`insert into document_registry(client_uuid,document_no,document_type,booking_id,client_id,lifecycle_status,file_url,signed_at,signed_by_name,created_by)
    values(gen_random_uuid(),'LOCAL-AGR-LABEL','Rental Agreement',$1,$2,'Signed','staff/retained-original.pdf',now(),'Retained Signer',$3) returning id`,[mislabeled.id,client,owner])).rows[0].id
  await actor(owner)
  const prepareMislabeled=async()=>(await q('select prepare_reschedule_agreement($1,$2,$3,$4,$5) result',[mislabeled.id,mislabeled.revision,'2027-08-11T00:15:00Z','2027-08-12T00:15:00Z',uuid()])).rows[0].result
  await check('A signature demoted before proposal still requires a signed replacement',async()=>{
    await q("update document_registry set lifecycle_status='Draft' where id=$1",[mislabeledDocument])
    const result=await prepareMislabeled()
    assert.equal(result.required,true);assert.equal(result.originalDocumentId,mislabeledDocument)
    await assert.rejects(()=>move(mislabeled,1),/signed agreement|replacement/)
    await assert.rejects(()=>q("update document_registry set lifecycle_status='Issued' where id=$1",[mislabeledDocument]),/only move to a terminal state/)
  })
  await check('A reviewed signed agreement may be validly voided but cannot reactivate',async()=>{
    await q("update document_registry set lifecycle_status='Void',voided_at=now(),void_reason='Client cancelled the signed agreement' where id=$1",[mislabeledDocument])
    assert.equal((await prepareMislabeled()).required,false)
    await assert.rejects(()=>q("update document_registry set lifecycle_status='Signed',voided_at=null,void_reason=null where id=$1",[mislabeledDocument]),/cannot be reactivated/)
    await assert.rejects(()=>q("update document_registry set voided_at=null,void_reason=null where id=$1",[mislabeledDocument]),/cannot be reactivated/)
  })
  const expired=await makeBooking('991192','2027-09-10T00:15:00Z','2027-09-11T00:15:00Z')
  await actor(owner,'postgres')
  const expiredDocument=(await q(`insert into document_registry(client_uuid,document_no,document_type,booking_id,client_id,lifecycle_status,file_url,signed_at,signed_by_name,created_by)
    values(gen_random_uuid(),'LOCAL-AGR-EXPIRY','Rental Agreement',$1,$2,'Signed','staff/expired-original.pdf',now(),'Expired Signer',$3) returning id`,[expired.id,client,owner])).rows[0].id
  await actor(owner)
  const prepareExpired=async()=>(await q('select prepare_reschedule_agreement($1,$2,$3,$4,$5) result',[expired.id,expired.revision,'2027-09-11T00:15:00Z','2027-09-12T00:15:00Z',uuid()])).rows[0].result
  await check('Expired remains a terminal lifecycle and cannot reactivate a reviewed signature',async()=>{
    assert.equal((await prepareExpired()).required,true)
    await q("update document_registry set lifecycle_status='Expired' where id=$1",[expiredDocument])
    assert.equal((await prepareExpired()).required,false)
    await assert.rejects(()=>q("update document_registry set lifecycle_status='Signed' where id=$1",[expiredDocument]),/cannot be reactivated/)
  })
  console.log(`Agreement versions: ${passed} contract groups passed`)
}finally{await db.close()}
