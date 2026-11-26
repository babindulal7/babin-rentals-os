import type { Row, Store } from './engine'
import { mockStorage } from './storage'

function activeUser(store:Store,actor:string,bookingId:string):Row {
 const user=store['users']?.find(r=>r['id']===actor)
 const booking=store['bookings']?.find(r=>r['id']===bookingId)
 if(!user || user['is_active']!==true || user['deactivated_at'] || !['Owner','Admin','Manager','Coordinator'].includes(String(user['primary_role'])) || !booking ||
  (!['Owner','Admin'].includes(String(user['primary_role'])) && user['branch_id']!==booking['branch_id']))throw new Error('This rental is not available to this session.')
 return booking
}
function current(store:Store,bookingId:string):Row|undefined {
 return (store['document_registry']??[]).filter(r=>r['booking_id']===bookingId && r['document_type']==='Rental Agreement' && r['signed_at'] && !r['voided_at'] && r['lifecycle_status']!=='Expired' &&
  !(store['agreement_versions']??[]).some(v=>v['previous_document']===r['id'])).sort((a,b)=>String(b['created_at']).localeCompare(String(a['created_at'])))[0]
}
const hash=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')
export async function agreementPlanningRpc(store:Store,name:string,args:Record<string,unknown>,actor:string):Promise<unknown>{
 if(name==='rental_agreement_version_history'){
  const user=store['users']?.find(r=>r['id']===actor)
  if(!user || user['is_active']!==true || user['deactivated_at'] || !['Owner','Admin','Manager','Coordinator','Accounts','Warehouse','Technician'].includes(String(user['primary_role'])))throw new Error('Agreement history unavailable.')
  return (store['agreement_versions']??[]).filter(v=>{
   const booking=store['bookings']?.find(b=>b['id']===v['booking_id'])
   return booking && (['Owner','Admin'].includes(String(user['primary_role'])) || booking['branch_id']===user['branch_id'])
  }).map(v=>({previous_document:v['previous_document'],document_id:v['document_id'],replacement_no:store['document_registry']?.find(d=>d['id']===v['document_id'])?.['document_no']}))
 }
 if(name==='document_file_location'){
  const doc=store['document_registry']?.find(r=>r['id']===args['p_document'])
  if(!doc)throw new Error('Document not found.')
  activeUser(store,actor,String(doc['booking_id']))
  return doc['file_url']
 }
 if(name==='prepare_reschedule_agreement'){
  const booking=activeUser(store,actor,String(args['p_booking']))
  if(!['Quote','Booked'].includes(String(booking['stage'])) || booking['cancelled_at'] || booking['archived_at'])throw new Error('This rental cannot be rescheduled.')
  if(new Date(String(booking['updated_at'])).getTime()!==new Date(String(args['p_revision'])).getTime())throw new Error('Rental changed. Reload before editing.')
  const from=new Date(String(args['p_pickup'])).getTime(),to=new Date(String(args['p_return'])).getTime()
  const oldFrom=new Date(String(booking['pickup_at'])).getTime(),oldTo=new Date(String(booking['return_at'])).getTime()
  if(!Number.isFinite(from)||to-from!==oldTo-oldFrom||(from-oldFrom)%86400000!==0||from===oldFrom)throw new Error('Move both dates together, preserving duration.')
  const original=current(store,String(booking['id']))
  if(!original)return {required:false}
  const id=String(args['p_key']),rows=store['reschedule_agreements']??=[]
  const proposal=rows.find(r=>r['id']===id)
  const request={booking_id:booking['id'],actor,booking_revision:args['p_revision'],original_document:original['id'],pickup_at:args['p_pickup'],return_at:args['p_return']}
  if(proposal && Object.entries(request).some(([key,value])=>proposal[key]!==value))throw new Error('This proposal key belongs to another change.')
  if(!proposal)store['reschedule_agreements']=[...rows,{id,...request,state:'Draft',created_at:new Date().toISOString()}]
  return {required:true,proposalId:id,originalDocumentId:original['id'],originalDocumentNo:original['document_no']}
 }
 const proposal=store['reschedule_agreements']?.find(r=>r['id']===args['p_proposal'])
 if(!proposal||proposal['actor']!==actor)throw new Error('Agreement proposal not found.')
 activeUser(store,actor,String(proposal['booking_id']))
 if(name==='cancel_reschedule_agreement'){
  if(proposal['state']==='Cancelled')return null
  if(!['Draft','Ready'].includes(String(proposal['state'])))throw new Error('Proposal already closed.')
  proposal['state']='Cancelled';return null
 }
 if(name==='ready_reschedule_agreement'){
  if(!['Draft','Ready'].includes(String(proposal['state'])))throw new Error('Proposal already closed.')
  const method=args['p_method'],pdfPath=String(args['p_pdf_path'])
  if(!['upload','draw'].includes(String(method))||String(args['p_name']??'').trim().length<2||String(args['p_role']??'').trim().length<2||
   !/^[0-9a-f]{64}$/.test(String(args['p_original_hash']))||pdfPath!=='staff/'+actor+'/'+String(proposal['id'])+'-agreement.pdf')throw new Error('Signed agreement details are incomplete.')
  const downloaded=await mockStorage.from('documents').download(pdfPath)
  if(downloaded.error||!downloaded.data||await hash(downloaded.data)!==args['p_pdf_hash'])throw new Error('Agreement upload was not confirmed.')
  if(method==='draw'){
   const path=String(args['p_signature_path'])
   const signature=await mockStorage.from('documents').download(path)
   if(path!=='staff/'+actor+'/'+String(proposal['id'])+'-signature.png'||signature.error||!signature.data)throw new Error('Drawn signature is unavailable.')
  }
  const values={method,signer_name:args['p_name'],signer_role:args['p_role'],original_hash:args['p_original_hash'],pdf_path:pdfPath,pdf_hash:args['p_pdf_hash'],signature_path:args['p_signature_path']}
  if(proposal['state']==='Ready' && Object.entries(values).some(([key,value])=>proposal[key]!==value))throw new Error('Ready agreement evidence is immutable.')
  Object.assign(proposal,values,{state:'Ready',signed_at:proposal['signed_at']??new Date().toISOString()})
  return {proposalId:proposal['id'],ready:true}
 }
 throw new Error('Agreement action unavailable.')
}
export function finalizeMockRescheduleAgreement(store:Store,args:Record<string,unknown>,actor:string):void {
 const booking=activeUser(store,actor,String(args['p_booking_id']))
 const original=current(store,String(booking['id']))
 if(!original && !args['p_agreement_proposal'])return
 const proposal=store['reschedule_agreements']?.find(r=>r['id']===args['p_agreement_proposal'])
 if(!proposal||proposal['actor']!==actor||proposal['booking_id']!==booking['id']||proposal['state']!=='Ready'||
  proposal['original_document']!==original?.['id']||new Date(String(proposal['booking_revision'])).getTime()!==new Date(String(args['p_revision'])).getTime()||
  new Date(String(proposal['pickup_at'])).getTime()!==new Date(String(booking['pickup_at'])).getTime()||
  new Date(String(proposal['return_at'])).getTime()!==new Date(String(booking['return_at'])).getTime())throw new Error('A ready signed agreement is required for these exact dates.')
 const id=crypto.randomUUID(),now=new Date().toISOString()
 const versions=store['agreement_versions']??[]
 const revision=1+versions.filter(v=>v['booking_id']===booking['id']).length
 store['document_registry']=[...(store['document_registry']??[]),{id,client_uuid:proposal['id'],document_no:String(booking['booking_no'])+'-AGR-'+revision,document_type:'Rental Agreement',booking_id:booking['id'],client_id:booking['client_id'],lifecycle_status:'Signed',file_url:proposal['pdf_path'],signed_at:proposal['signed_at'],signed_by_name:proposal['signer_name'],signature_url:proposal['signature_path'],created_at:now,created_by:actor}]
 store['agreement_versions']=[...versions,{id:crypto.randomUUID(),previous_document:original?.['id'],document_id:id,booking_id:booking['id'],proposal_id:proposal['id'],actor,created_at:now}]
 store['booking_documents']=[...(store['booking_documents']??[]),{id:crypto.randomUUID(),client_uuid:crypto.randomUUID(),booking_id:booking['id'],document_id:id,doc_type:'Rental Agreement',origin:proposal['method']==='upload'?'Uploaded':'Generated',created_by:actor}]
 proposal['state']='Committed';proposal['document_id']=id
}
