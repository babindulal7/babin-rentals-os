import { supabase, newClientUuid } from '../../lib/supabase'
import { createAction, type ActionConfig } from '../core'

export interface AgreementProposal {
  required: boolean
  proposalId?: string
  originalDocumentId?: string
  originalDocumentNo?: string
}
export interface PrepareAgreementInput { bookingId: string; expectedRevision: string; pickupAt: string; returnAt: string; clientUuid: string }
export interface ReadyAgreementInput {
  proposalId: string; method: 'upload' | 'draw'; signerName: string; signerRole: string
  originalHash: string; pdfPath: string; pdfHash: string; signaturePath: string | null
}
function authorize(role: string, online: boolean | undefined) {
  if (!['Owner','Admin','Manager','Coordinator'].includes(role)) throw new Error('You cannot replace this rental agreement.')
  if (online === false) throw new Error('Connect before replacing an agreement. The rental has not changed.')
}
const prepareConfig: ActionConfig<PrepareAgreementInput, AgreementProposal> = {
  name: 'PREPARE_RESCHEDULE_AGREEMENT', permissions: [], implemented: true, validate(input){if(!input.bookingId || !input.expectedRevision || !input.clientUuid)throw new Error('Reload the rental before editing.')},
  async execute(input, ctx) {
    authorize(ctx.role, ctx.isOnline)
    const {data,error}=await supabase.rpc('prepare_reschedule_agreement',{p_booking:input.bookingId,p_revision:input.expectedRevision,p_pickup:input.pickupAt,p_return:input.returnAt,p_key:input.clientUuid})
    if(error)throw new Error(['42883','PGRST202'].includes(String(error.code))?'This action is not available on this server yet. No changes were saved.':error.message)
    if(!data || typeof data!=='object' || !('required' in data) || typeof data.required!=='boolean')throw new Error('Agreement requirements could not be verified.')
    const proposal=data as AgreementProposal
    if(proposal.required && (!proposal.proposalId || !proposal.originalDocumentId))throw new Error('The agreement proposal was not confirmed.')
    return {result:proposal,events:[]}
  },
}
export const prepareRescheduleAgreement=createAction(prepareConfig)
const readyConfig: ActionConfig<ReadyAgreementInput, {proposalId:string;ready:boolean}> = {
  name:'READY_RESCHEDULE_AGREEMENT',permissions:[],implemented:true,validate(input){if(!input.proposalId)throw new Error('Agreement proposal is required.')},
  async execute(input,ctx) {
    authorize(ctx.role,ctx.isOnline)
    const {data,error}=await supabase.rpc('ready_reschedule_agreement',{p_proposal:input.proposalId,p_method:input.method,p_name:input.signerName,p_role:input.signerRole,p_original_hash:input.originalHash,p_pdf_path:input.pdfPath,p_pdf_hash:input.pdfHash,p_signature_path:input.signaturePath})
    if(error)throw new Error(['42883','PGRST202'].includes(String(error.code))?'This action is not available on this server yet. No changes were saved.':error.message)
    if(!data || typeof data!=='object' || !('ready' in data) || data.ready!==true || !('proposalId' in data) || data.proposalId!==input.proposalId)throw new Error('The signed agreement save was not confirmed.')
    return {result:{proposalId:input.proposalId,ready:true},events:[]}
  },
}
export const readyRescheduleAgreement=createAction(readyConfig)
export async function cancelRescheduleAgreement(proposalId:string):Promise<void> {
  const {error}=await supabase.rpc('cancel_reschedule_agreement',{p_proposal:proposalId})
  if(error)throw new Error(['42883','PGRST202'].includes(String(error.code))?'This action is not available on this server yet. No changes were saved.':error.message)
}
export async function hashAgreement(blob:Blob):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function uploadAgreementEvidence(blob:Blob,extension:'pdf'|'png',stablePath?:string):Promise<string> {
  const {data,error}=await supabase.auth.getUser()
  if(error || !data.user)throw new Error('Sign in before saving agreement evidence.')
  const path=stablePath??`staff/${data.user.id}/${newClientUuid()}.${extension}`
  const bucket=supabase.storage.from('documents')
  const uploaded=await bucket.upload(path,blob,{contentType:blob.type,upsert:false})
  if(uploaded.error) {
    // Reconcile an uncertain upload without overwriting immutable bytes.
    const existing=await bucket.download(path)
    if(existing.error || !existing.data || await hashAgreement(existing.data)!==await hashAgreement(blob))throw new Error('The private file upload was not confirmed. Retry without changing the evidence.')
  }
  return path
}
