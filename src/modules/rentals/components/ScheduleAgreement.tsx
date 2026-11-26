import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../lib/auth'
import { supabase, newClientUuid } from '../../../lib/supabase'
import { Button } from '../../../components/ui/Button'
import { SignOnGlassModal, type DigitalSignature } from '../modals/SignOnGlassModal'
import { createScheduleAmendment } from '../../../lib/scheduleAmendment'
import { prepareRescheduleAgreement, readyRescheduleAgreement, cancelRescheduleAgreement, hashAgreement, uploadAgreementEvidence, type AgreementProposal } from '../../../actions/rentals/rescheduleAgreement'

export interface ScheduleAgreementProps {
  bookingId:string; expectedRevision:string; pickupAt:string; returnAt:string
  onProposalReady:(id:string|null,ready:boolean)=>void
}
/** Never stores a local stroke as a completed signature. Only confirmed private
 * evidence can produce a proposal accepted by the atomic reschedule RPC. */
export function ScheduleAgreement({bookingId,expectedRevision,pickupAt,returnAt,onProposalReady}:ScheduleAgreementProps) {
  const {user}=useAuth()
  const [proposal,setProposal]=useState<AgreementProposal|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [originalUrl,setOriginalUrl]=useState<string|null>(null)
  const [originalHash,setOriginalHash]=useState('')
  const [signerName,setSignerName]=useState(''),[signerRole,setSignerRole]=useState('')
  const [acknowledged,setAcknowledged]=useState(false),[signing,setSigning]=useState(false)
  const [file,setFile]=useState<Blob|null>(null),[signature,setSignature]=useState<Blob|null>(null)
  const [method,setMethod]=useState<'upload'|'draw'>('upload')
  const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[retry,setRetry]=useState(0)
  const generation=useRef(0)
  const request=useRef('')
  const signatureIdentity=useRef<{name:string;role:string}|null>(null)
  const callback=useRef(onProposalReady);callback.current=onProposalReady
  const context=useCallback(()=>{if(!user)throw new Error('Sign in before replacing an agreement.');return {role:user.role,userId:user.id,isOnline:navigator.onLine}},[user])
  useEffect(()=>{
    generation.current+=1;setBusy(false);setSigning(false)
    let active=true,preview:string|null=null,pendingProposal:string|null=null
    request.current=newClientUuid()
    setProposal(null);setError(null);setReady(false);setFile(null);setSignature(null);setOriginalUrl(null);setOriginalHash('');setAcknowledged(false)
    signatureIdentity.current=null;callback.current(null,false)
    async function read(){
      try{
        const result=await prepareRescheduleAgreement({bookingId,expectedRevision,pickupAt,returnAt,clientUuid:request.current},context())
        pendingProposal=result.proposalId??null
        if(!active){if(pendingProposal)void cancelRescheduleAgreement(pendingProposal).catch(()=>{});return}
        setProposal(result)
        if(!result.required){callback.current(null,true);return}
        const doc=result.originalDocumentId
        const location=await supabase.rpc('document_file_location',{p_document:doc})
        if(location.error || typeof location.data!=='string')throw new Error('The original agreement cannot be securely opened.')
        const downloaded=await supabase.storage.from('documents').download(location.data)
        if(downloaded.error || !downloaded.data)throw new Error('The original agreement could not be loaded. Dates have not changed.')
        const originalHeader=new TextDecoder().decode(await downloaded.data.slice(0,5).arrayBuffer())
        if(originalHeader!=='%PDF-')throw new Error('The original agreement is not a readable PDF. No dates changed.')
        const safeOriginal=new Blob([await downloaded.data.arrayBuffer()],{type:'application/pdf'})
        const hash=await hashAgreement(safeOriginal)
        if(!active)return
        preview=URL.createObjectURL(safeOriginal);setOriginalUrl(preview);setOriginalHash(hash)
      }catch(problem){if(active)setError(problem instanceof Error?problem.message:'Agreement requirements could not be verified.')}
    }
    void read()
    return()=>{active=false;generation.current+=1;if(preview)URL.revokeObjectURL(preview);if(pendingProposal)void cancelRescheduleAgreement(pendingProposal).catch(()=>{})}
  },[bookingId,expectedRevision,pickupAt,returnAt,context,retry])
  const capture=async(sig:DigitalSignature)=>{
    const capturedGeneration=generation.current
    setSigning(false)
    if(sig.mode!=='draw' || !sig.dataUrl){setError('Draw the signature on the device, or upload a signed PDF.');return}
    setBusy(true)
    try{
      const image=await fetch(sig.dataUrl).then(response=>response.blob())
      const document=await createScheduleAmendment({proposalId:proposal?.proposalId??'',bookingId,originalDocumentNo:proposal?.originalDocumentNo??'',originalHash,pickupAt,returnAt,signerName:sig.name,signerRole,signedAt:sig.atIso,signatureDataUrl:sig.dataUrl})
      if(capturedGeneration!==generation.current)return
      setFile(document);setSignature(image);setMethod('draw');setSignerName(sig.name);signatureIdentity.current={name:sig.name,role:signerRole}
      setError(null)
    }catch(problem){if(capturedGeneration===generation.current)setError(problem instanceof Error?problem.message:'The signature document could not be prepared.')}
    finally{if(capturedGeneration===generation.current)setBusy(false)}
  }
  const save=async()=>{
    if(!proposal?.proposalId || !file || !acknowledged || signerName.trim().length<2 || signerRole.trim().length<2)return
    const saveGeneration=generation.current
    setBusy(true);setError(null)
    try{
      if(method==='draw' && (signatureIdentity.current?.name!==signerName || signatureIdentity.current.role!==signerRole))throw new Error('Signer details changed. Capture the signature again.')
      if(method==='upload'){
        const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer())
        if(header!=='%PDF-')throw new Error('Choose a readable PDF containing the newly signed agreement.')
      }
      const identity=await supabase.auth.getUser()
      if(saveGeneration!==generation.current)return
      if(identity.error || !identity.data.user)throw new Error('Sign in before saving the signed agreement.')
      const pdfPath=`staff/${identity.data.user.id}/${proposal.proposalId}-agreement.pdf`
      const signaturePath=`staff/${identity.data.user.id}/${proposal.proposalId}-signature.png`
      const stored=await uploadAgreementEvidence(file,'pdf',pdfPath)
      if(saveGeneration!==generation.current)return
      const storedSignature=signature?await uploadAgreementEvidence(signature,'png',signaturePath):null
      if(saveGeneration!==generation.current)return
      await readyRescheduleAgreement({proposalId:proposal.proposalId,method,signerName:signerName.trim(),signerRole:signerRole.trim(),originalHash,pdfPath:stored,pdfHash:await hashAgreement(file),signaturePath:storedSignature},context())
      if(saveGeneration!==generation.current)return
      setReady(true);callback.current(proposal.proposalId,true)
    }catch(problem){if(saveGeneration===generation.current)setError(problem instanceof Error?problem.message:'The signed agreement was not confirmed.')}
    finally{if(saveGeneration===generation.current)setBusy(false)}
  }
  if(proposal?.required===false)return <p role="status">No signed agreement needs replacement. Dates will change only after confirmation.</p>
  return <section aria-label="Replacement rental agreement" style={{display:'grid',gap:12}}>
    <h3 style={{margin:0}}>Replace the signed agreement</h3>
    <p style={{margin:0}}>The original stays in the record. Review the new dates and retain the same prices and other terms.</p>
    {error&&<div role="alert">{error}</div>}{error&&proposal?.required&&<Button variant="secondary" disabled={busy} onClick={()=>setRetry(n=>n+1)}>Start replacement again</Button>}
    {!proposal&&<><p role="status">{error?'Agreement requirements are unavailable.':'Checking agreement requirements…'}</p>{error&&<Button variant="secondary" onClick={()=>setRetry(n=>n+1)}>Retry agreement check</Button>}</>}
    {originalUrl&&<><a href={originalUrl} target="_blank" rel="noreferrer">Review original agreement</a><iframe sandbox="" title="Original rental agreement" src={originalUrl} style={{width:'100%',height:240,border:'1px solid var(--border)',borderRadius:8}}/></>}
    {proposal?.required&&originalHash&&<>
      <label>Signer name<input value={signerName} maxLength={200} disabled={busy||ready} onChange={event=>{setSignerName(event.target.value);if(method==='draw')setFile(null)}}/></label>
      <label>Signer capacity<input value={signerRole} maxLength={200} disabled={busy||ready} placeholder="Client representative" onChange={event=>{setSignerRole(event.target.value);if(method==='draw')setFile(null)}}/></label>
      <label style={{display:'flex',gap:10,alignItems:'center',minHeight:44}}><input type="checkbox" checked={acknowledged} disabled={busy||ready} onChange={event=>setAcknowledged(event.target.checked)}/>I have reviewed the original agreement and proposed dates. The signer agrees to the schedule change; other terms and prices remain unchanged.</label>
      {!ready&&<><label>Upload newly signed PDF<input type="file" accept="application/pdf" disabled={busy} onChange={event=>{const selected=event.target.files?.[0];setFile(selected??null);setSignature(null);setMethod('upload')}}/></label>
      <Button variant="secondary" disabled={busy||!acknowledged||signerRole.trim().length<2} onClick={()=>setSigning(true)}>Sign on this device</Button>
      <Button variant="primary" disabled={busy||!file||!acknowledged||signerName.trim().length<2||signerRole.trim().length<2} onClick={()=>void save()}>{busy?'Saving signed agreement…':'Save signed replacement'}</Button></>}
      {ready&&<p role="status">Signed replacement saved. Confirm the date move to make it current.</p>}
    </>}
    <SignOnGlassModal purpose="schedule" isOpen={signing} onClose={()=>setSigning(false)} role="receiver" defaultName={signerName} bookingNo={bookingId} onSignComplete={sig=>void capture(sig)}/>
  </section>
}
